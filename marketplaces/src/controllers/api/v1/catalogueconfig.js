const { v4: uuidv4 } = require("uuid");
const axios = require('axios');
const CatalogueConfig = require("../../../models/catalogue-config");
const Tokens = require("../../../models/tokens");
const cskus = require("../../../models/csku");
const ActiveCrosslistings = require("../../../models/activeCrosslistings");
const Marketplace = require("../../../models/marketplace");
const Template = require('../../../models/template');
const Bull = require('bull');
const ebay = require('ebay-api');
const { OpenAI } = require("openai");
const csku = require("../../../models/csku");
const { Op, Sequelize, json, where } = require('sequelize');
const catalogueConfig = require("../../../models/catalogue-config");
const Currency = require("../../../models/currency");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const mathjs = require('mathjs');
const ShippingPolicyModel = require('../../../models/shippingPolicies');
const ReturnPolicyModel = require('../../../models/returnPolicy');
const PaymentPolicyModel = require('../../../models/paymentPolicy');
const MerchantLocation = require('../../../models/merchantLocation');
const { createShopifyCatalogue } = require('../../../marketplaceapis/shopify/catalogue');
const Geosite = require('../../../models/geosite');
const { apiCallLog } = require("../../../helper/apiCallLog");
const moment = require('moment');
const { urlencoded } = require("express");
const { upsertEbayProduct } = require("../../../marketplaceapis/ebay/catalogue");
const { configQueue } = require("../../../cron-jobs/config-cron/queueListener")

const scopes = [
	"https://api.ebay.com/oauth/api_scope",
	"https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.marketing",
	"https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.inventory",
	"https://api.ebay.com/oauth/api_scope/sell.account.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.account",
	"https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.fulfillment",
	"https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.finances",
	"https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
	"https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.reputation",
	"https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
	"https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
	"https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
	"https://api.ebay.com/oauth/api_scope/sell.stores",
	"https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
];

const ebayAuthToken = new EbayAuthToken({
	clientId: process.env.APP_ID,
	clientSecret: process.env.CERT_ID,
});

const eBay = new ebay({
	appId: process.env.APP_ID,
	certId: process.env.CERT_ID,
	sandbox: false,
	autoRefreshToken: true,
	siteId: 100,
	devId: process.env.DEV_ID,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: process.env.OPENAI_API_PROJECT_ID });


exports.handleApplyCrossList = async (req, res) => {
  const { configIds, products } = req.body;

  if(configIds.length === 0 || products.length === 0) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Missing Rerquired Parameters",
    })
  }
  
  try {

    const cskuData = await cskus.findAll({
      where: {
        [Op.or]: products.map(product => ({
          id: product.productId,
          channelId: String(product.channelId),
          accountName: String(product.accountName),
        }))
      },
      limit: products.length
    });

    if(cskuData.length === 0) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "No Csku found for the given products",
      })
    }

	// Create queue jobs in parallel but handle errors individually
    const queuePromises = configIds.map(configId => {
		const jobData = {
		  config: configId,
		  batch_size: products.length,
		  first_run: false,
		  cskuData: cskuData
		};
  
		return configQueue.add(jobData, {
		  attempts: 3,
		  backoff: {
			type: 'exponential',
			delay: 2000
		  }
		}).catch(error => {
		  console.error(`Error queuing config ${configId}:`, error);
		  return null; // Return null for failed jobs instead of throwing
		});
	  });
  
	  // Wait for all queue operations to complete
	  const results = await Promise.all(queuePromises);
	  const successfulJobs = results.filter(result => result !== null).length;

    // Return success response
    

    return res.status(200).json({
      success: true,
      status: 200,
      message: `Successfully queued ${configIds.length} configurations for processing`,
    })

  } catch (error) {
    console.error('Error adding jobs to configQueue:', error);
    //throw new Error('Failed to queue configurations for processing');
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    })
  }
};

exports.CreateCatalogueConfig = async (req, res) => {
  const { sourceAccount, destinationAccount, userId } = req.body;

  const sourceToken = await Tokens.findOne({
    where: {
      id: sourceAccount,
    },
  });
  if (!sourceToken) {
    return res.status(400).json({ error: "Source account not found." });
  }

  const destinationToken = await Tokens.findOne({
    where: {
      id: destinationAccount
    },
  });
  if (!destinationToken) {
    return res.status(400).json({ error: "Destination account not found." });
  }

  const request = req.body;
  // console.log("request >> ",request)
  // return request;
  // const jsonString = JSON.stringify(request, null, 2);
  const configExist = await CatalogueConfig.findOne({
    where: {
      source_account: sourceAccount,
      destination_account: destinationAccount,
      userId: userId,
    },
  });
  if (configExist) {
    return res.status(200).json({
      message:
        "Config Already Exist for the given Source Account, Destination Account. Please Edit the Existing Config...",
    });
  } else {
    const configId = uuidv4();

    // const listing_frequency = request.listingFrequency;
    // console.log("listing Frequency > ",listing_frequency);
    // return
    await CatalogueConfig.create({
      config_id: configId,
      source_account: sourceAccount,
      destination_account: destinationAccount,
      userId: userId,
      listing_frequency: request.listingFrequency,
      status: "active",
      version: "v1",
      is_active: "true",
      config: request,
      request: request,
    }).then(async (config) => {
      await processConfig(config, null, null); // Process the configuration
    });
  }
  console.log("Config Stored in Database");
  return res.status(200).json({ message: "Config Stored in Database" });
};

exports.saveRequestData = (req, res, next) => {
  const { sourceAccount, destinationAccount, userId } = req.body;

  if (!sourceAccount) {
    return res.status(400).json({ error: "Source account is required." });
  }
  if (!destinationAccount) {
    return res.status(400).json({ error: "Destination account is required." });
  }
  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }
  next();
};

exports.UpdateCatalogueConfig = async (req, res) => {
  const { sourceAccount, destinationAccount, userId } = req.body;

  const sourceToken = await Tokens.findOne({
    where: {
      accountName: sourceAccount,
      userId: userId,
    },
  });
  if (!sourceToken) {
    return res.status(400).json({ error: "Source account not found." });
  }

  const destinationToken = await Tokens.findOne({
    where: {
      accountName: destinationAccount,
      userId: userId,
    },
  });
  if (!destinationToken) {
    return res.status(400).json({ error: "Destination account not found." });
  }

  const request = req.body;
  // console.log("request >> ",request)
  // return request;
  // const jsonString = JSON.stringify(request, null, 2);
  const configExist = await CatalogueConfig.findOne({
    where: {
      source_account: sourceAccount,
      destination_account: destinationAccount,
      userId: userId,
    },
    order: [["createdAt", "DESC"]],
  });
  if (configExist) {
    const configId = configExist[0].config_id;
    const versionNumber = parseInt(configExist[0].version.replace("v", ""), 10);
    const incrementedVersion = `v${versionNumber + 1}`;
    await CatalogueConfig.create({
      config_id: configId,
      source_account: sourceAccount,
      destination_account: destinationAccount,
      userId: userId,
      listing_frequency: request.listingFrequency,
      status: "active",
      version: incrementedVersion,
      is_active: "true",
      config: request,
      request: request,
    }).then(async (config) => {
      await processConfig(null, config, config.id);
    });
    configExist[0].status = "inactive";
    configExist[0].is_active = "false";
    await configExist[0].save();
    if (configExist.length > 2) {
      // for (let i = configExist.length -1;i<)
      const i = configExist.length - 1;
      await configExist[i].destroy({
        where: {
          source_account: sourceAccount,
          destination_account: destinationAccount,
          userId: userId,
        },
      });
    }
  } else {
    return res.status(400).json({ error: "Did not able to find config..." });
  }
  return res.status(200).json({ message: "Config Updated Successfully. " });
};

exports.UpdateActiveInactiveCases = async (req, res) => {
  try {
    const {id, userId}= req.body
    // const sourceToken = await Tokens.findOne({
    //   where: {
    //     accountName: sourceAccount,
    //     userId: userId,
    //   },
    // });
    // if (!sourceToken) {
    //   return res.status(400).json({ error: "Source account not found." });
    // }

    // const destinationToken = await Tokens.findOne({
    //   where: {
    //     accountName: destinationAccount,
    //     userId: userId,
    //   },
    // });
    // if (!destinationToken) {
    //   return res.status(400).json({ error: "Destination account not found." });
    // }
    await CatalogueConfig.update(
      {
        status: "inactive",
        is_active: "false",
      },
      {
        where: {
          id: id,
          // source_account: sourceAccount,
          // destination_account: destinationAccount,
          userId: userId,
          // version: version,
        },
      }
    );
    return res.status(200).json({
      message: "Status Updated Successfully.",
    });
  } catch (error) {
    return res.status(400).json({
      message: "Error while updating status. Please try again",
    });
  }
};

exports.GetConfigs = async (req, res) => {
  try {
    const userId = req.params.id;

    const configData = await CatalogueConfig.findAll({
      where: {
        userId: userId,
        status: "active",
      },
      order: [["createdAt", "DESC"]],
    });

    if (configData.length === 0) {
      return res.status(200).json({
        message: "No configs found. Please create one",
      });
    }

    for (let i = 0; i < configData.length; i++) {
      const configItem = configData[i].toJSON();

      let sourceToken;
      let destinationToken;

      //console.log("source Id >> ", configItem.source_account);

      // Fetch source account details
      if (configItem?.source_account) {
        sourceToken = await Tokens.findOne({
          where: { id: configItem.source_account },
          attributes: ["accountName"],
        });
      }

      if (sourceToken) {
        configItem.source_account = sourceToken.accountName;
      }

      if (configItem?.destination_account) {
        destinationToken = await Tokens.findOne({
          where: { id: configItem.destination_account },
          attributes: ["accountName", "marketPlaceId"],
        });
      }

      if (destinationToken) {
        const destinationMarketplace = await Marketplace.findOne({
          where: { id: destinationToken.marketPlaceId },
          attributes: ["logo", "country", "url"],
        });

        //console.log(destinationMarketplace.dataValues);

        if (typeof configItem.config === "string") {
          configItem.config = JSON.parse(configItem.config);
        }

        configItem.destinationMarketplace = {
          logo: destinationMarketplace.dataValues.logo,
          country: destinationMarketplace.dataValues.country,
          url: destinationMarketplace.dataValues.url,
        };

        configItem.config.sourceAccount = sourceToken.accountName;
        configItem.config.destinationAccount = destinationToken.accountName;
      }
      configData[i] = configItem;
    }

    return res.status(200).json({
      message: "Configs fetched successfully.",
      data: configData,
    });
  } catch (error) {
    console.log("Error while fetching configs:", error);
    return res.status(500).json({
      message: "Error while fetching configs.",
      error: error.message,
    });
  }
};

exports.GetSingleConfig = async (req, res) => {
  try {
    const id = req.params.id;

    const configData = await CatalogueConfig.findOne({
      where: {
        id: id,
        status: "active",
      },
      order: [["createdAt", "DESC"]],
    });
    if (configData.length === 0) {
      return res.status(200).json({
        message: "No configs found. Please create one",
      });
    }
    // for (let i = 0; i < configData.length; i++) {
    //   const sourceToken = await Tokens.findOne({
    //     where: {
    //       id: configData[i].source_account,
    //     },
    //     attributes: ["accountName"],
    //   });
    //   if (sourceToken) {
    //     configData[i].source_account = sourceToken.accountName;
    //   }
    //   const destinationToken = await Tokens.findOne({
    //     where: {
    //       id: configData[i].destination_account,
    //     },
    //     attributes: ["accountName"],
    //   });
    //   if (destinationToken) {
    //     configData[i].destination_account = destinationToken.accountName;
    //     if (typeof configData[i].config === "string") {
    //       configData[i].config = JSON.parse(configData[i].config);
    //     }
    //     configData[i].config.sourceAccount = sourceToken.accountName;
    //     configData[i].config.destinationAccount = destinationToken.accountName;
    //   }
    // }
    return res.status(200).json({
      message: "Configs fetched successfully.",
      data: configData,
    });
  } catch (error) {
    console.log("Error while fetching configs:", error);
    return res.status(200).json({
      message: "No configs found. Please create one",
    });
  }
};

async function processConfig(newConfig, updateConfig, givenConfigId) {
  try {
    if (newConfig) {
      // Handle new configuration
      await ActiveCrosslistings.create({
        config_id: newConfig.id,
        version: newConfig.version,
        status: 'active',
        products_remaining: newConfig.batch_size,
        total_products: newConfig.batch_size,
        ...newConfig.additionalFields, // Include any additional fields dynamically
      });
    } else if (updateConfig && givenConfigId) {
      // Handle updating an existing configuration
      // Fetch the latest version for the given config_id
      const latestConfig = await ActiveCrosslistings.findOne({
        where: { config_id: givenConfigId },
        order: [['version', 'DESC']],
      });

      if (latestConfig) {
        // Update the status of the latest version to 'inactive'
        await latestConfig.update({ status: 'inactive' });

        // Insert a new entry with an incremented version
        await ActiveCrosslistings.create({
          config_id: givenConfigId,
          version: updateConfig.version,
          status: 'active',
          products_remaining: latestConfig.products_remaining,
          ...updateConfig.additionalFields, // Include any additional fields dynamically
        });
      } else {
        throw new Error(`No existing configuration found for config_id: ${givenConfigId}`);
      }
    } else {
      throw new Error('Invalid parameters. Provide either newConfig or updateConfig with a valid givenConfigId.');
    }
  } catch (error) {
    console.error('Error processing configuration:', error.message);
    throw error;
  }
}