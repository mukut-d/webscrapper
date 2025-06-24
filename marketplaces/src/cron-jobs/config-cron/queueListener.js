const { v4: uuidv4 } = require("uuid");
const User = require("../../models/user");
const axios = require("axios");
const Tokens = require("../../models/tokens");
const newRelic = require("newrelic");
const cskus = require("../../models/csku");
const Marketplace = require("../../models/marketplace");
const Template = require("../../models/template");
const Bull = require("bull");
const ebay = require("ebay-api");
const { OpenAI } = require("openai");
const csku = require("../../models/csku");
const { Op, Sequelize, json, where } = require("sequelize");
const catalogueConfig = require("../../models/catalogue-config");
const Currency = require("../../models/currency");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const mathjs = require("mathjs");
const ShippingPolicyModel = require("../../models/shippingPolicies");
const ReturnPolicyModel = require("../../models/returnPolicy");
const PaymentPolicyModel = require("../../models/paymentPolicy");
const StoreCategory = require("../../models/shopCategories");
const CatalogueVariation = require("../../models/catalogue-variation");
const fs = require("fs");
const path = require("path");

const {
  createShopifyCatalogue,
} = require("../../marketplaceapis/shopify/catalogue");
const moment = require("moment");
const { urlencoded } = require("express");
const { upsertEbayProduct } = require("../../marketplaceapis/ebay/catalogue");
const { apiCallLog } = require("../../helper/apiCallLog");
const Geosite = require("../../models/geosite");
const MerchantLocation = require("../../models/merchantLocation");
const {
  createWalmartCatalogue,
} = require("../../marketplaceapis/walmart/catalogue");
const FormData = require("form-data");
const ejs = require("ejs");
const { access } = require("fs");
const Catalogue = require("../../models/catalogue");
const {
  createEtsyProduct,
  getEtsyProductPropertiesByCategoryId,
} = require("../../marketplaceapis/etsy/catalogue");
const cheerio = require("cheerio");
const AmazonGeosite = require("../../models/amazonGeosite");
const { transformAmazonDataToSchema } = require("./amazonDataTransform");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  createAmazonCatalogue,
} = require("../../marketplaceapis/amazon/catalogue");
const { type } = require("os");

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
  siteId: 0,
  devId: process.env.DEV_ID,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_API_PROJECT_ID,
});

const configQueue = new Bull("configQueue", {
  redis: {
	host: "127.0.0.1",
	port: 6379,
  },
});
const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const client = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

async function getAuthToken() {
  try {
	return await ebayAuthToken.getApplicationToken("PRODUCTION", scopes);
  } catch (error) {
	console.error("Error getting OAuth token:", error);
	throw error;
  }
}

configQueue.process(async (job) => {
  try {
	const { config, batch_size, first_run, cskuData } = job.data; // Changed from req.body to job.data
	await mainFunction(config, batch_size, first_run, cskuData);

	return { success: true }; // Return success status
  } catch (error) {
	console.error("Error in configQueue:", error);
	await apiCallLog(
	  "configQueue",
	  "configQueue",
	  "configQueue",
	  job.data,
	  {},
	  error,
	  "error"
	);
	throw error; // Rethrow error to trigger job failure
  }
});

// Add event handlers for better monitoring
configQueue.on("completed", (job) => {
  console.log(`Job ${job.id} completed for config: ${job.data.config}`);
});

configQueue.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed for config: ${job.data.config}:`, error);
});

async function mainFunction(configId, batch_size, first_run, cskuData, isExcelUpload = false) {
  // async function mainFunction(req, res) {
  // const { configId, batch_size, first_run, cskuData } = req.body;
  try {
	console.log(
	  cskuData,
	  "cskuData that is being passed at the top -------------"
	);

	if (configId) {
	  // for (var i = 0; i < configs.length; i++) {
	  const config = await catalogueConfig.findOne({
		where: {
		  id: configId,
		},
		raw: true,
	  });

	  if (!config) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "config not found",
		  "error"
		);
		throw new Error("config not found");
	  }

	  console.log("Config >> ", config.config);
	  // Add your code here

	  if (!config.config) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "config is not present",
		  "error"
		);
		throw new Error("config is not present");
	  }

	  const source_account_id = config?.config?.sourceAccount;

	  if (!source_account_id) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "source_account_id not found",
		  "error"
		);
		throw new Error("source_account_id not found");
	  }

	  const source_account = await Tokens.findOne({
		where: {
		  id: source_account_id,
		},
	  });

	  if (!source_account) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "source_account not found",
		  "error"
		);
		throw new Error("source_account not found");
	  }

	  const destination_account_id = config?.config?.destinationAccount;

	  if (!destination_account_id) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "destination_account_id not found",
		  "error"
		);
		throw new Error("destination_account_id not found");
	  }

	  const destination_account = await Tokens.findOne({
		where: {
		  id: destination_account_id,
		},
	  });

	  // console.log(
	  //   destination_account,
	  //   "destination_account -------------------------"
	  // );

	  if (!destination_account) {
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "destination_account not found",
		  "error"
		);
		throw new Error("destination_account not found");
	  }

	  if (first_run) {
		try {
		  let data = JSON.stringify({
			marketplaceId: source_account.dataValues.marketPlaceId,
			userId: source_account.dataValues.userId,
			accountName: source_account.dataValues.accountName,
			addQuantity: false,
			date: moment().startOf("day").toISOString(),
		  });

		  let apiConfig = {
			method: "post",
			maxBodyLength: Infinity,
			url: "http://localhost:5001/catalogue/sync-catalogue",
			headers: {
			  "Content-Type": "application/json",
			},
			data: data,
		  };

		  await axios.request(apiConfig);
		} catch (err) {
		  console.error("Error in get-user-profiles", err);
		  await apiCallLog(
			"configQueue",
			"configQueue",
			"configQueue",
			config,
			{},
			err,
			"error"
		  );
		}
	  }

	  let priceConfig = null;
	  let currencyExchangeRate = null;
	  if (config?.config?.pricingRule) {
		priceConfig = config?.config?.pricingRule?.destinationPriceConfig;

		if (config?.config?.pricingRule?.useCurrencyExchange) {
		  if (
			config?.config?.pricingRule?.currencyConversionRate?.isUserDefined
		  ) {
			currencyExchangeRate =
			  config?.config?.pricingRule?.currencyConversionRate?.value;
		  } else {
			const currencyExchangeRateData = await Currency.findOne({
			  where: {
				currency:
				  config?.config?.pricingRule?.currencyConversionRate
					?.sourceCurrency,
				newCurrency:
				  config?.config?.pricingRule?.currencyConversionRate
					?.destinationCurrency,
			  },
			});

			if (currencyExchangeRateData) {
			  currencyExchangeRate =
				currencyExchangeRateData.dataValues.newValue;
			} else {
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				config,
				{},
				{ error: "currencyExchangeRateData not found" },
				"error"
			  );
			}
		  }
		}
	  }

	  console.log("priceConfig >> ", priceConfig, currencyExchangeRate);

	  const imageConfig = config?.config?.images;

	  console.log("imageConfig >> ", imageConfig);

	  if (cskuData.length == 0) {
		console.log("cskuData >> ", cskuData);
		await apiCallLog(
		  "configQueue",
		  "configQueue",
		  "configQueue",
		  config,
		  {},
		  "cskuData not found",
		  "error"
		);
	  } else {
		console.log("cskuData >> ", cskuData.length);

		const source_marketplace = await Marketplace.findOne({
		  where: { id: source_account.dataValues.marketPlaceId },
		});

		if (!source_marketplace) {
		  await apiCallLog(
			"configQueue",
			"configQueue",
			"configQueue",
			config,
			{},
			"source_marketplace not found",
			"error"
		  );
		}

		const destination_marketplace = await Marketplace.findOne({
		  where: { id: destination_account.dataValues.marketPlaceId },
		});

		if (!destination_marketplace) {
		  await apiCallLog(
			"configQueue",
			"configQueue",
			"configQueue",
			config,
			{},
			"destination_marketplace not found",
			"error"
		  );
		}

		const businessPolicies = config?.config?.businessPolicies;

		if (
		  destination_marketplace.dataValues.url.includes("ebay") &&
		  !businessPolicies
		) {
		  await apiCallLog(
			"configQueue",
			"configQueue",
			"configQueue",
			config,
			{},
			{ error: "businessPolicies not found" },
			"error"
		  );
		}

		const destinationSiteId = config?.config?.destinationSiteId;
		const sourceSiteId = config?.config?.sourceSiteId;
		// console.log("destination site id type and value", typeof destinationSiteId, destinationSiteId);
		// console.log("source site id type and value", typeof sourceSiteId, sourceSiteId);

		let sourceSite;
		if (source_marketplace.dataValues.url.includes("ebay")) {
		  sourceSite = await Geosite.findOne({
			where: {
			  globalId: sourceSiteId,
			},
		  });
		} else if (source_marketplace.dataValues.url.includes("amazon")) {
		  sourceSite = await AmazonGeosite.findOne({
			where: {
			  globalId: sourceSiteId,
			},
		  });
		}

		let destinationSite;
		if (destination_marketplace.dataValues.url.includes("ebay")) {
		  destinationSite = await Geosite.findOne({
			where: {
			  globalId: destinationSiteId,
			},
		  });
		} else if (destination_marketplace.dataValues.url.includes("amazon")) {
		  destinationSite = await AmazonGeosite.findOne({
			where: {
			  globalId: destinationSiteId,
			},
		  });
		}

		// console.log(
		//   sourceSite,
		//   destinationSite,
		//   businessPolicies,
		//   source_marketplace,
		//   destination_marketplace
		// );

		const authToken = await ebayAuthToken.getApplicationToken(
		  "PRODUCTION",
		  scopes
		);
		eBay.OAuth2.setCredentials(JSON.parse(authToken).access_token);

		let start = moment();
		for (var j = 0; j < cskuData.length; j++) {
		  const csku = cskuData[j];
		  //console.log('csku >> ', csku);
		  // Add your code here
		  let now = moment();
		  console.log(
			destination_account.dataValues.lastTokenRefreshDate,
			"difference in time -------------------"
		  );

		  if (
			destination_marketplace.dataValues.url.includes("ebay") &&
			(!destination_account.dataValues.lastTokenRefreshDate ||
			  now.diff(
				destination_account.dataValues.lastTokenRefreshDate,
				"hours"
			  ) >= 2)
		  ) {
			const refreshedToken = await refreshToken(
			  eBay,
			  destination_account
			);
			console.log("Token >> ", refreshedToken);
			eBay.OAuth2.setCredentials(refreshedToken);
		  } else if (
			destination_marketplace.dataValues.url.includes("amazon") &&
			(!destination_account.dataValues.lastTokenRefreshDate ||
			  now.diff(
				destination_account.dataValues.lastTokenRefreshDate,
				"minutes"
			  ) >= 45)
		  ) {
			const refreshedToken = await refreshTokenAmazon(
			  destination_account
			);
			console.log("Token >> ", refreshedToken);
			destination_account.token = refreshedToken;
		  }

		  const ignoreTags = config?.config?.ignoreTags;
		  const ignoreFromTitleTags = config?.config?.ignoreFromTitleTags;
		  const ignoreFromDescriptionTags =
			config?.config?.ignoreFromDescriptionTags;

		  let end = moment();
		  if (end.diff(start, "hours") >= 2) {
			const authToken = await ebayAuthToken.getApplicationToken(
			  "PRODUCTION",
			  scopes
			);
			eBay.OAuth2.setCredentials(JSON.parse(authToken).access_token);
		  }

		  if (ignoreTags && ignoreTags.length > 0) {
			//const tags = csku.dataValues.tags;
			const tags =
			  Array.isArray(csku?.itemSpecifics) &&
			  csku?.itemSpecifics[0]?.Tags;

			if (tags && tags.length > 0) {
			  const hasIgnoredTag = ignoreTags.some((ignoreTag) =>
				tags.includes(ignoreTag)
			  );

			  if (hasIgnoredTag) {
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "Skipped Product, hasIgnoredTag" },
				  "error"
				);
				continue;
			  }
			}
		  }

		  if (ignoreFromTitleTags && ignoreFromTitleTags.length > 0) {
			const title = csku.title;

			if (title) {
			  const hasIgnoredTag = ign;

			  ignoreFromTitleTags.some((ignoreTag) => title.includes(ignoreTag));

			  if (hasIgnoredTag) {
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "Skipped Product, hasIgnoredTag" },
				  "error"
				);
				continue;
			  }
			}
		  }

		  if (
			ignoreFromDescriptionTags &&
			ignoreFromDescriptionTags.length > 0
		  ) {
			const description = csku.description;

			if (description) {
			  const hasIgnoredTag = ignoreFromDescriptionTags.some(
				(ignoreTag) => description.includes(ignoreTag)
			  );

			  if (hasIgnoredTag) {
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "hasIgnoredTag" },
				  "error"
				);
				continue;
			  }
			}
		  }

		  const titleConfig = config?.config?.title;

		  let title = csku.title;

		  let price = csku.price;

		  if (priceConfig) {
			price = await mathjs.evaluate(priceConfig, {
			  Source_Price: csku.price,
			  ExchangeRate: currencyExchangeRate,
			});
		  }

		  let images = csku.images;

		  if (imageConfig) {
			if (imageConfig.removeLastImagesCount) {
			  images = images.splice(-imageConfig.removeLastImagesCount);
			}

			if (
			  imageConfig.addStaticImages &&
			  imageConfig.addStaticImages.length > 0
			) {
			  if (imageConfig?.addStaticImages?.position == "first") {
				images = imageConfig.addStaticImages.concat(images);
			  } else {
				images = images.concat(imageConfig.addStaticImages);
			  }
			}
		  }

		  let categoryId;
		  let categoryName;
		  let aspects = {};
		  if (destination_marketplace.dataValues.url.includes("ebay")) {
			if (
			  destination_marketplace.dataValues.url.includes("ebay") &&
			  source_marketplace.dataValues.url.includes("ebay") &&
			  sourceSite.dataValues.siteId == destinationSite.dataValues.siteId
			) {
			  categoryId = csku.dataValues.categoryId;
			  aspects = csku.dataValues.itemSpecifics;
			} else {
			  const category = await categoryIdentification(
				title,
				destination_account,
				destinationSite.dataValues.siteId,
				destination_marketplace
			  );

			  if (category) {
				categoryId = category.categoryId;
				categoryName = category.categoryName;

				const idText = `Title : ${csku.title} Description : ${
				  csku.description
				} Item Specifics : ${JSON.stringify(csku.itemSpecifics)}`;

				const aspectData = await generateItemSpecifics(
				  idText,
				  categoryId,
				  categoryName,
				  destination_marketplace.dataValues.siteId,
				  destination_account,
				  config,
				  destination_marketplace
				);

				if (config?.config?.brand?.useStoreName) {
				  aspectData["Brand"] =
					config.additional_aspects.keyvaluepairs.find(
					  (item) => item.fieldname === "Brand"
					).acceptedValues[0];
				} else if (config?.config?.brand?.useSourceBrand) {
				  if (source_marketplace.dataValues.url.includes("shopify")) {
					aspectData["Brand"] = csku?.vendor;
				  }
				}

				if (aspectData) {
				  aspects = aspectData;
				}
				console.log();
			  }
			}

			console.log(aspects, "aspects ------------------");

			if (titleConfig.useAIGenerated) {
			  let titlePrompt = `Generate a title for the product from the title: ${title}.`;
			  // console.log(
			  //   "---------------------",
			  //   destination_account,
			  //   "destination accout ------------------"
			  // );

			  let promptData = JSON.stringify({
				userId: destination_account?.userId ?? "",
				categoryTreeId: config?.config?.categoryTreeId ?? "",
				categoryId: categoryId ?? "",
				marketplaceId: destination_account?.marketPlaceId ?? "",
			  });

			  let promptConfig = {
				method: "get",
				maxBodyLength: Infinity,
				url: "http://localhost:5001/prompts/get-prompt-logic",
				headers: {
				  "Content-Type": "application/json",
				},
				params: {
				  userId: destination_account?.userId ?? "",
				  categoryTreeId: config?.config?.categoryTreeId ?? "",
				  categoryId: categoryId ?? "",
				  marketplaceId: destination_account?.marketPlaceId ?? "",
				},
			  };

			  let prResponse;
			  const idText = `Title :${csku.title} Description : ${
				csku.description
			  } Product Features : ${JSON.stringify(csku.itemSpecifics)}`;
			  // console.log(idText, "idText ------------------");
			  try {
				prResponse = await axios
				  .request(promptConfig)
				  .catch(async (err) => {
					console.error("Error in get-prompts-logic", err);
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  err,
					  "error"
					);
				  });
			  } catch (err) {
				console.error("Error in get-prompts-logic", err);
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  err,
				  "error"
				);
				continue;
			  }

			  if (prResponse?.data) {
				titlePrompt += prResponse.data.prompt.prompt;
			  }
			  // const completion = await openai.chat.completions.create({
			  //   messages: [
			  //     {
			  //       role: "system",
			  //       content: "You are an expert product title generator who generates one title of length 75 characters strictly. Please strictly do not go above 80 characters",
			  //     },
			  //     {
			  //       role: "user",
			  //       content:`${idText} ${titlePrompt}`,
			  //     },
			  //   ],
			  //   model: "gpt-4o",
			  // });

			  // title = completion.choices[0].message.content;
			  // console.log(title, "title generated ------------------");
			  do {
				const completion = await openai.chat.completions.create({
				  messages: [
					{
					  role: "system",
					  content:
						"You are an expert product title generator who generates one title of length 75 characters strictly. Please strictly do not go above 80 characters",
					},
					{
					  role: "user",
					  content: `${idText} ${titlePrompt}`,
					},
				  ],
				  model: "gpt-4o",
				});

				title = completion.choices[0].message.content;
				console.log(title, "title generated ------------------");
			  } while (title.length > 80);
			}

			let description;
			description = csku?.description;
			//   console.log(
			//     csku?.description,
			//     "csku description -----------------------"
			//   );
			if (config?.config?.useSourceAccountDescription) {
			  description = csku?.description;
			  console.log(
				// csku?.description,
				"csku description -----------------------"
			  );
			} else {
			  // const descTemplate = await Template.findById(config?.aPlusDescriptionTemplate);

			  const descTemplate = await Template.findOne({
				where: {
				  template_name: config?.config?.aPlusDescriptionTemplate,
				},
			  });
			  description = description
				.replace(/[^\r\n\x20-\x7E]+/g, "")
				.replace(/\r?\n/g, "<br/>");

			  if (config?.description_update) {
				config.description_update.forEach(
				  ({ pattern, replaceWith }) => {
					try {
					  // Convert pattern string to a regular expression
					  const regex = new RegExp(pattern, "g"); // 'g' for global matching
					  // console.log(`Applying regex: ${regex}`);
					  description = description.replace(regex, replaceWith);
					} catch (error) {
					  console.error(`Invalid regex pattern: ${pattern}`, error);
					}
				  }
				);
			  }

			  //   console.log(
			  // 	description,
			  // 	"description updated-----------------------"
			  //   );

			  const ejsData = {};
			  // console.log(
			  //   descTemplate?.dataValues?.ejsKeys,
			  //   "descTemplate?.dataValues?.ejsKeys ------------------"
			  // );

			  if (
				descTemplate?.dataValues?.ejsKeys &&
				descTemplate?.dataValues?.ejsKeys.length > 0
			  ) {
				descTemplate?.dataValues?.ejsKeys.forEach((key) => {
				  switch (key) {
					case "title":
					  ejsData["title"] = title;
					  break;
					case "description":
					  ejsData["description"] = description;
					  break;
					case "specifications":
					  ejsData["specifications"] = Object.entries(aspects).map(
						([key, value]) => ({
						  key,
						  value: value,
						})
					  );
					  break;
					case "images":
					  ejsData["images"] = csku.images.slice(0, 5);
					  break;
					default:
					  break;
				  }
				});
				// console.log(ejsData, "ejsData ------------------");

				description = await ejs.render(
				  descTemplate.dataValues.ejs,
				  ejsData
				);
			  }
			}

			let merchantLocationId = config?.config?.merchantLocationId ?? 0;
			const locationDetails = await MerchantLocation.findOne({
			  where: {
				id: merchantLocationId,
			  },
			});
			// console.log(locationDetails, "location details ------------------");

			if (!locationDetails) {
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				{ error: "locationDetails not found" },
				"error"
			  );
			  continue;
			}

			let itemCompatability;
			console.log(
			  sourceSiteId,
			  destinationSiteId,
			  "sourceSiteId, destinationSiteId"
			);
			if (
			  source_marketplace.dataValues.url.includes("ebay") &&
			  destination_marketplace.dataValues.url.includes("ebay")
			) {
			  if (sourceSiteId == destinationSiteId) {
				itemCompatability = csku.itemCompatability;
			  } else {
				// console.log(
				//   destinationSite.dataValues.siteId,
				//   categoryId,
				//   "category id and siteid that i am passing"
				// );
				try {
				  const compatibilityStructure =
					await eBay.commerce.taxonomy.getCompatibilityProperties(
					  destinationSite.dataValues.siteId,
					  categoryId
					);

				  itemCompatability = await EbayItemCompatibility(
					csku.itemCompatability,
					compatibilityStructure
				  );
				} catch (error) {
				  console.log(
					error,
					"error in getCompatibilityProperties function --------------- "
				  );
				  if (
					error.message.includes(
					  "This category ID is disabled for parts compatibility"
					)
				  ) {
					console.log("no compatibility required.");
				  } else {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  error,
					  "error"
					);
					continue;
				  }
				}
			  }
			}
			console.log(
			  itemCompatability,
			  "item compatability ------------------"
			);
			let condition;
			let countryCode;
			if (
			  source_marketplace.dataValues.url.includes("ebay") &&
			  destination_marketplace.dataValues.url.includes("ebay")
			) {
			  try {
				const itemCondition = await eBay.trading.GetItem({
				  ItemID: csku?.channelId,
				});
				if (itemCondition) {
				  console.log(itemCondition, "item condition ---------");
				  condition = itemCondition?.Item?.ConditionID;
				  countryCode = itemCondition?.Item?.Country;
				  if (!aspects) {
					aspects = itemCondition.Item.ItemSpecifics.NameValueList;
				  }
				}
			  } catch (error) {
				console.log(
				  error,
				  "error fetching item data from ebay ------------"
				);
			  }
			}
			let videoId;
			if (csku?.videos) {
			  try {
				// Get OAuth Token
				const authToken = await getAuthToken();

				// Download video
				const videoUrl = csku.videos;
				const videoBufferResponse = await axios.get(videoUrl, {
				  responseType: "arraybuffer",
				});
				const videoBuffer = videoBufferResponse.data;

				// Create video metadata
				const createVideoResponse = await axios.post(
				  "https://apim.ebay.com/commerce/media/v1_beta/video",
				  {
					classification: ["ITEM"],
					description: "Product video",
					size: videoBuffer.byteLength,
					title: "Product Showcase Video",
				  },
				  {
					headers: {
					  Authorization: `Bearer ${destination_account.token}`,
					  "Content-Type": "application/json",
					},
				  }
				);

				// Extract video ID from response
				const video_id = createVideoResponse.headers.location
				  .split("/")
				  .pop();
				console.log("eBay Video ID:", video_id);

				// Prepare video upload request
				const form = new FormData();
				form.append("video", videoBuffer, {
				  filename: "product_video.mp4",
				});

				const uploadUrl = `https://apim.ebay.com/commerce/media/v1_beta/video/${video_id}/upload`;

				// Upload video to eBay
				await axios.post(uploadUrl, videoBuffer, {
				  headers: {
					Authorization: `Bearer ${destination_account.token}`,
					"Content-Type": "application/octet-stream",
				  },
				});

				console.log("Video uploaded successfully.");
				videoId = video_id;
				console.log("Video ID:", videoId);
			  } catch (error) {
				console.error("Error uploading video:", error);
			  }
			}
			console.log("channelId ", csku.channelId);

			let destinationStoreCategory = {};
			if (csku?.storeCategoryId) {
			  const sourceStoreCategory = await StoreCategory.findOne({
				where: {
				  shop_category_id: csku.storeCategoryId,
				  account_name: source_account.accountName,
				  user_id: source_account.userId,
				  marketplace_id: source_account.marketPlaceId,
				},
			  });
			  if (!sourceStoreCategory) {
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "sourceStoreCategory not found" },
				  "error"
				);
			  }
			  destinationStoreCategory = await StoreCategory.findOne({
				where: {
				  title: sourceStoreCategory.title,
				  account_name: destination_account.accountName,
				  user_id: destination_account.userId,
				  marketplace_id: destination_account.marketPlaceId,
				},
			  });
			}
			let variants = {};
			if (
			  source_marketplace.dataValues.url.includes("etsy") &&
			  destination_marketplace.dataValues.url.includes("ebay")
			) {
			  const variantData = await CatalogueVariation.findAll({
				where: {
				  channel_id: csku.channelId,
				  account_name: source_account.dataValues.accountName,
				  userId: source_account.dataValues.userId,
				},
				attributes: ["variation"],
			  });
			  if (!variantData) {
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "variantData not found" },
				  "error"
				);
			  }
			  if (variantData.length > 0) {
				variants = await convertEtsyVariantsToEbayFormat(variantData);
				console.log("etsy ID ", csku.channelId);
				if (!variants) {
				  await apiCallLog(
					"configQueue",
					"configQueue",
					"configQueue",
					{ config, csku },
					{},
					{ error: "variants not found" },
					"error"
				  );
				}
			  }
			}
			console.log(
			  JSON.stringify(variants, 2),
			  "variants ------------------"
			);
			const product = {
			  title: title,
			  description: description,
			  categoryId: categoryId,
			  categoryName: categoryName,
			  aspects: aspects,
			  isku: csku.isku,
			  price: price,
			  currency:
				config?.config?.pricingRule?.currencyConversionRate
				  ?.destinationCurrency ?? csku.currency,
			  quantity: config?.config?.listWithZeroQuantity
				? 0
				: csku.quantity,
			  location: `${locationDetails?.dataValues?.addLine1} ${locationDetails?.dataValues?.addLine2}, ${locationDetails?.dataValues?.city}`,
			  images: images,
			  itemCompatability: itemCompatability,
			  country: destinationSite.countryName,
			  conditionId: condition ?? 1000,
			  countryCode: countryCode ?? "IN",
			  video: videoId,
			  storeCategoryId: destinationStoreCategory?.shop_category_id,
			};

			const sellerProfile = {
			  SellerShippingProfile: {
				ShippingProfileID: "",
				ShippingProfileName: "",
			  },
			  SellerReturnProfile: {
				ReturnProfileID: "",
				ReturnProfileName: "",
			  },
			  SellerPaymentProfile: {
				PaymentProfileID: "",
				PaymentProfileName: "",
			  },
			};

			if (businessPolicies) {
			  console.log("inside business policies section");

			  if (businessPolicies.useSourceShippingPolicy) {
				let shippingPolicy;
				shippingPolicy = await ShippingPolicyModel.findOne({
				  where: {
					name: {
					  [Op.iLike]:
						csku.sellerProfile?.SellerShippingProfile
						  ?.ShippingProfileName,
					},
				  },
				});
				if (
				  source_marketplace.dataValues.url.includes("etsy") &&
				  destination_marketplace.dataValues.url.includes("ebay")
				) {
				  const etsyShippingPolicy = await ShippingPolicyModel.findOne({
					where: {
					  fulfillmentPolicyId: JSON.stringify(
						csku.sellerProfile?.SellerShippingProfile
						  ?.ShippingProfileID
					  ),
					},
				  });
				  if (!etsyShippingPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "etsyShippingPolicy not found" },
					  "error"
					);
				  }
				  if (etsyShippingPolicy) {
					shippingPolicy = await ShippingPolicyModel.findOne({
					  where: {
						name: {
						  [Op.iLike]: etsyShippingPolicy.dataValues.name,
						},
						accountName: destination_account.accountName,
						marketplaceId: destination_account.marketPlaceId,
					  },
					});
				  }
				  // console.log("shipping Poliucy", shippingPolicy);
				  if (!shippingPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  {
						error:
						  "shippingPolicy not found for etsy marketplace account",
					  },
					  "error"
					);
				  }
				}
				if (shippingPolicy) {
				  sellerProfile.SellerShippingProfile.ShippingProfileID =
					shippingPolicy.dataValues.fulfillmentPolicyId;
				  sellerProfile.SellerShippingProfile.ShippingProfileName =
					shippingPolicy.dataValues.name;
				} else {
				  let policyData = JSON.stringify({
					userId: destination_account.userId,
					accountName: destination_account.accountName,
					marketplaceId: destination_account?.marketPlaceId
					  ? parseInt(destination_account?.marketPlaceId)
					  : 7,
				  });

				  let policyConfig = {
					method: "post",
					maxBodyLength: Infinity,
					url: "http://localhost:5001/master/get-user-profiles",
					headers: {
					  "Content-Type": "application/json",
					},
					data: policyData,
				  };

				  await axios
					.request(policyConfig)
					.then((response) => {
					  console.log(
						JSON.stringify(response.data),
						"get seller profiles "
					  );
					})
					.catch(async (error) => {
					  console.error("Error in get-user-profiles", error);
					  await apiCallLog(
						"configQueue",
						"configQueue",
						"configQueue",
						config,
						{},
						error,
						"error"
					  );
					});

				  const shippingPolicy = await ShippingPolicyModel.findOne({
					where: {
					  name: {
						[Op.iLike]:
						  csku.sellerProfile?.SellerShippingProfile
							?.ShippingProfileName,
					  },
					},
				  });

				  if (!shippingPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "shippingPolicy not found" },
					  "error"
					);
				  }

				  sellerProfile.SellerShippingProfile.ShippingProfileID =
					shippingPolicy.dataValues.fulfillmentPolicyId;
				  sellerProfile.SellerShippingProfile.ShippingProfileName =
					shippingPolicy.dataValues.name;
				}
			  } else {
				const shippingPolicy = await ShippingPolicyModel.findOne({
				  where: {
					id: businessPolicies.shippingPolicyId,
				  },
				});

				sellerProfile.SellerShippingProfile.ShippingProfileID =
				  shippingPolicy.dataValues.fulfillmentPolicyId;
				sellerProfile.SellerShippingProfile.ShippingProfileName =
				  shippingPolicy.dataValues.name;
			  }

			  if (businessPolicies.useSourceReturnPolicy) {
				const returnPolicy = await ReturnPolicyModel.findOne({
				  where: {
					name: {
					  [Op.iLike]:
						csku.sellerProfile?.SellerReturnProfile
						  ?.ReturnProfileName,
					},
				  },
				});
				// console.log("return Policy >> ", returnPolicy);
				if (returnPolicy) {
				  sellerProfile.SellerReturnProfile.ReturnProfileID =
					returnPolicy.dataValues.returnPolicyId;
				  sellerProfile.SellerReturnProfile.ReturnProfileName =
					returnPolicy.dataValues.name;
				} else {
				  let policyData = JSON.stringify({
					userId: destination_account.dataValues.userId,
					accountName: destination_account.dataValues.accountName,
					marketplaceId: destination_account.dataValues.marketPlaceId,
				  });

				  let policyConfig = {
					method: "post",
					maxBodyLength: Infinity,
					url: "http://localhost:5001/master/get-user-profiles",
					headers: {
					  "Content-Type": "application/json",
					},
					data: policyData,
				  };

				  await axios
					.request(policyConfig)
					.then((response) => {
					  console.log(JSON.stringify(response.data));
					})
					.catch(async (error) => {
					  console.error("Error in get-user-profiles", error);
					  await apiCallLog(
						"configQueue",
						"configQueue",
						"configQueue",
						{ config, csku },
						{},
						error,
						"error"
					  );
					});

				  const returnPolicy = await ReturnPolicyModel.findOne({
					where: {
					  name: {
						[Op.iLike]:
						  csku.sellerProfile?.SellerReturnProfile
							?.ReturnProfileName,
					  },
					},
				  });

				  if (!returnPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "returnPolicy not found" },
					  "error"
					);
				  }

				  sellerProfile.SellerReturnProfile.ReturnProfileID =
					returnPolicy.dataValues.returnPolicyId;
				  sellerProfile.SellerReturnProfile.ReturnProfileName =
					returnPolicy.dataValues.name;
				}
			  } else {
				const returnPolicy = await ReturnPolicyModel.findOne({
				  where: {
					id: businessPolicies.returnPolicy,
				  },
				});

				sellerProfile.SellerReturnProfile.ReturnProfileID =
				  returnPolicy?.dataValues?.returnPolicyId;
				sellerProfile.SellerReturnProfile.ReturnProfileName =
				  returnPolicy?.dataValues?.name;
			  }

			  if (businessPolicies.useSourcePaymentPolicy) {
				const paymentPolicy = await PaymentPolicyModel.findOne({
				  where: {
					name: {
					  [Op.iLike]:
						csku.sellerProfile?.SellerPaymentProfile
						  ?.PaymentProfileName,
					},
				  },
				});
				// console.log("payment Policy >> ", paymentPolicy);
				if (paymentPolicy) {
				  sellerProfile.SellerPaymentProfile.PaymentProfileID =
					paymentPolicy.dataValues.paymentPolicyId;
				  sellerProfile.SellerPaymentProfile.PaymentProfileName =
					paymentPolicy.dataValues.name;
				} else {
				  let policyData = JSON.stringify({
					userId: destination_account.dataValues.userId,
					accountName: destination_account.dataValues.accountName,
					marketplaceId: destination_account.dataValues.marketPlaceId,
				  });

				  let policyConfig = {
					method: "post",
					maxBodyLength: Infinity,
					url: "http://localhost:5001/master/get-user-profiles",
					headers: {
					  "Content-Type": "application/json",
					},
					data: policyData,
				  };

				  await axios
					.request(policyConfig)
					.then((response) => {
					  console.log(JSON.stringify(response.data));
					})
					.catch(async (error) => {
					  console.error("Error in get-user-profiles", error);
					  await apiCallLog(
						"configQueue",
						"configQueue",
						"configQueue",
						{ config, csku },
						{},
						error,
						"error"
					  );
					});

				  const paymentPolicy = await PaymentPolicyModel.findOne({
					where: {
					  name: {
						[Op.iLike]:
						  csku.sellerProfile?.SellerPaymentProfile
							?.PaymentProfileName,
					  },
					},
				  });

				  if (!paymentPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "paymentPolicy not found" },
					  "error"
					);
				  }

				  sellerProfile.SellerPaymentProfile.PaymentProfileID =
					paymentPolicy.dataValues.paymentPolicyId;
				  sellerProfile.SellerPaymentProfile.PaymentProfileName =
					paymentPolicy.dataValues.name;
				}
			  } else {
				const paymentPolicy = await PaymentPolicyModel.findOne({
				  where: {
					id: businessPolicies.paymentPolicy,
				  },
				});

				sellerProfile.SellerPaymentProfile.PaymentProfileID =
				  paymentPolicy.dataValues.paymentPolicyId;
				sellerProfile.SellerPaymentProfile.PaymentProfileName =
				  paymentPolicy.dataValues.name;
			  }
			} else {
			  const error = {
				message: "business policy config is missing",
			  };
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				error,
				"error"
			  );
			  console.log("error in business policy -----------------");
			  break;
			}

			console.log(
			  "sellerProfile ------------------",
			  JSON.stringify(sellerProfile, 2)
			);

			// for inserting data in ebay
			try {
			  console.log("inside upsert ebay product");
			  console.log("channelId -------------------", csku?.channelId);
			  await upsertEbayProduct(
				destination_account.dataValues.userId,
				destination_account.dataValues.accountName,
				destination_account.dataValues.marketPlaceId,
				destination_account,
				config?.config?.destinationSiteId,
				product,
				sellerProfile,
				{},
				{ id: categoryId, name: categoryName },
				aspects,
				variants ?? {},
				"",
				null,
				"mainFunction",
				config.config_id,
				config.version,
				source_account.dataValues.accountName,
				csku?.channelId
			  );
			} catch (err) {
			  console.log("Error in upsertEbayProduct >> ", err);
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				err,
				"error"
			  );
			}

			// for testing , writing product data in json file
			//require("fs").writeFileSync("product.json", JSON.stringify(product, null, 2));
		  } else if (
			destination_marketplace.dataValues.url.includes("shopify")
		  ) {
			const product = {
			  title,
			  description,
			  price,
			  quantity: config?.config?.listWithZeroQuantity
				? 0
				: csku.quantity,
			  //tags: csku.dataValues.tags,
			  tags:
				Array.isArray(csku?.itemSpecifics) &&
				csku.itemSpecifics.length > 0
				  ? csku.itemSpecifics[0]?.Tags ?? []
				  : [],
			  images: images,
			  mrp: price,
			  brand: "",
			  productType: csku.categoryName,
			  isku: csku.isku,
			};

			try {
			  await createShopifyCatalogue(
				destination_account,
				product,
				destination_account.dataValues.marketPlaceId,
				destination_account,
				config?.config?.siteId,
				csku,
				title,
				description,
				price,
				config?.config?.pricingRule?.currencyConversionRate
				  ?.destinationCurrency ?? csku.currency,
				config?.config?.listWithZeroQuantity,
				config?.config?.merchantLocationId,
				businessPolicies,
				config?.config?.ejsKeys,
				config?.config?.aPlusDescriptionTemplate,
				config?.config?.ignoreTags,
				config?.config?.ignoreFromTitleTags,
				config?.config?.ignoreFromDescriptionTags,
				config?.config?.title?.useAIGenerated,
				config?.config?.title?.keywords
			  );
			} catch (err) {
			  console.log("Error in createShopifyCatalogue >> ", err);
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				err,
				"error"
			  );
			}
		  } else if (
			destination_marketplace.dataValues.url.includes("walmart")
		  ) {
			// const category = await categoryIdentification(title, destination_account, destinationSite.dataValues.siteId);

			// if (category) {
			// 	categoryId = category.categoryId;
			// 	categoryName = category.categoryName;
			// 	aspects = csku.dataValues.itemSpecifics;
			// }
			categoryName = csku?.categoryName || csku?.dataValues?.categoryName;
			aspects = csku?.itemSpecifics || csku?.dataValues?.itemSpecifics;
			let walmartCategory = "";
			if (categoryName.includes("Engagement Rings")) {
			  walmartCategory = "Engagement Rings";
			} else if (categoryName.includes("Wedding & Anniversary Bands")) {
			  walmartCategory = "Wedding Rings";
			} else if (categoryName.includes("Earrings")) {
			  walmartCategory = "Earrings";
			} else if (categoryName.includes("Rings")) {
			  walmartCategory = "Rings";
			}

			const walmartCategoryJSON = JSON.parse(
			  fs.readFileSync(path.join(__dirname, "kkmCategory.json"), "utf8")
			);

			const ignoreAspects = [
			  "brand",
			  "has_written_warranty",
			  "shortDescription",
			  "countPerPack",
			  "productName",
			  "multipackQuantity",
			  "keyFeatures",
			  "isResizable",
			  "count",
			  "isProp65WarningRequired",
			  "smallPartsWarnings",
			  "netContent",
			  "mainImageUrl",
			  "additionalImages",
			];

			const categoryAspects = walmartCategoryJSON[walmartCategory];
			const requiredAspects = categoryAspects["required"];
			const finalReqAspects = requiredAspects.filter(
			  (itm) => !ignoreAspects.includes(itm)
			);
			const finalAspects = {};

			const dataType = [];

			if (walmartCategory == "Rings") {
			  finalReqAspects.push("ringSize");
			}

			finalReqAspects.map((asp) => {
			  finalAspects[asp] = categoryAspects.properties[asp];
			  console.log(categoryAspects.properties[asp].items?.enum);
			  let typeMsg = `${asp} in format ${categoryAspects.properties[asp].type}`;
			  if (categoryAspects.properties[asp].items?.enum?.length > 0) {
				typeMsg += ` and select values from enum ${categoryAspects.properties[
				  asp
				].items.enum.join(", ")}`;
			  }
			  dataType.push(typeMsg);
			});
			console.log("dataType", dataType);
			const completion = await openai.chat.completions.create({
			  messages: [
				{
				  role: "system",
				  content: `${csku?.title} ${
					csku?.description
				  } ${walmartCategory} ${JSON.stringify(csku?.itemSpecifics)}
							Based on the text above extract ${JSON.stringify(
							  finalAspects
							)}, if enum is present then return a value from that enum, return 'NA' if not found and return in object form, return fields in this data type ${dataType.join(
					", "
				  )}.
							Also there are required aspects, try to find for these ${finalReqAspects.join(
							  ", "
							)}.
							Return Data in the same format as provided in type key.
							Note: Purity and Metal Purity are same.
							Return in pure object without an leading or trailing text.
							Important: Return in object form always.
							`,
				},
			  ],
			  model: "gpt-3.5-turbo",
			});

			aspects = JSON.parse(
			  completion.choices[0].message.content
				.replaceAll("```", "")
				.replaceAll("\n", "")
			);
			let brand = "";

			csku?.itemSpecifics.NameValueList?.map((item) => {
			  if (item.Name == "Brand") {
				brand = item.Value;
			  }
			});

			const feat_completion = await openai.chat.completions.create({
			  messages: [
				{
				  role: "system",
				  content: `${csku?.title} ${csku?.description}
							Based on the text above extract key features, return in array form.
							Important: Return values in double quotes always.
							`,
				},
			  ],
			  model: "gpt-3.5-turbo",
			});
			console.log(feat_completion?.choices[0]?.message?.content);
			const keyFeatures = JSON.parse(
			  feat_completion.choices[0].message.content
				.replaceAll("```", "")
				.replaceAll("\n", "")
			);
			console.log(keyFeatures);
			console.log(aspects);

			let product_variation;

			// Get variations for the current product using csku.channelId
			const variationsData = await CatalogueVariation.findAll({
			  where: { channel_id: csku.channelId },
			});

			if (variationsData && variationsData.length > 0) {
			  let combinations = [];
			  let variationAttributes = {};

			  variationsData.forEach((record) => {
				try {
				  // Check if variation is already an object or needs parsing
				  let variationObj = record.variation;

				  // If it's a string, try to parse it
				  if (typeof variationObj === "string") {
					variationObj = JSON.parse(variationObj);
				  }

				  if (variationObj && variationObj.offerings) {
					variationObj.offerings.forEach((offering) => {
					  // Process only enabled offerings
					  if (offering.is_deleted || !offering.is_enabled) return;

					  // Calculate price (divide by divisor if needed)
					  const price =
						offering.price.amount / (offering.price.divisor || 1);
					  const quantity = offering.quantity;

					  // Build a combination object using property_values as attributes
					  let combinationAttrs = {};
					  if (
						variationObj.property_values &&
						Array.isArray(variationObj.property_values)
					  ) {
						variationObj.property_values.forEach((prop) => {
						  // Ensure values array exists and has elements
						  if (prop.values && prop.values.length > 0) {
							// Use the first value for this property
							const value = prop.values[0];
							combinationAttrs[prop.property_name] = value;

							// Also aggregate into variationAttributes for the attributes section
							if (!variationAttributes[prop.property_name]) {
							  variationAttributes[prop.property_name] =
								new Set();
							}
							variationAttributes[prop.property_name].add(value);
						  }
						});
					  }

					  // Only add the combination if it has at least one attribute
					  if (Object.keys(combinationAttrs).length > 0) {
						// Append the price and quantity to the combination
						combinations.push({
						  ...combinationAttrs,
						  price,
						  quantity,
						});
					  }
					});
				  }
				} catch (error) {
				  console.error(`Error processing variation record:`, error);
				  console.log("Problematic data:", record.variation);
				}
			  });

			  // Convert the aggregated attributes into a Walmart-compatible array structure
			  const attributes = Object.entries(variationAttributes).map(
				([name, valuesSet]) => ({
				  name,
				  values: Array.from(valuesSet),
				})
			  );

			  // Assign the variations object to the product payload
			  product_variation = {
				combinations,
				attributes,
			  };
			}

			try {
			  const response = await createWalmartCatalogue(
				destination_account?.accountName,
				{
				  isku: csku?.isku,
				  type: "GTIN",
				  id: "CUSTOM",
				  price: csku?.price,
				  currency: csku?.currency || "USD",
				  shippingWeight: csku?.weight,
				  mustShipAlone: "No",
				  title: csku?.title,
				  brand: brand,
				  category: walmartCategory,
				  length: csku?.length,
				  width: csku?.width,
				  depth: csku?.depth,
				  aspects: aspects,
				  description: csku?.description,
				  ...(product_variation && product_variation.length > 0
					? { variations: product_variation }
					: {}),
				},
				{
				  mainImageUrl: csku?.images?.[0],
				  additionalImages:
					csku?.images?.slice(1) ||
					ebayItem.Item.PictureDetails.PictureURL.slice(1, 5),
				  keyFeatures: keyFeatures.slice(0, 5),
				  countPerPack: 1,
				  count: 1,
				  multipackQuantity: 1,
				  isProp65WarningRequired: "No",
				  condition: "New",
				  netContent: {
					productNetContentMeasure: 1,
					productNetContentUnit: "Each",
				  },
				  isResizable: walmartCategory == "Earrings" ? undefined : "No",
				  smallPartsWarnings: ["0 - No warning applicable"],
				  prop65WarningText: "None",
				  has_written_warranty: "No",
				  maximumOrderQuantity: 1,
				  minimumOrderQuantity: 1,
				  ...aspects,
				},
				"18",
				csku?.userId
			  );
			} catch (error) {
			  console.log(
				error,
				"error in upserting product in walmart ------------------"
			  );
			  continue;
			}
		  }else if (destination_marketplace.dataValues.url.includes("etsy")) {
			if (
			  destination_marketplace.dataValues.url.includes("etsy") &&
			  source_marketplace.dataValues.url.includes("etsy")
			) {
			  categoryId = csku.dataValues.categoryId;
			  // aspects = csku.dataValues.itemSpecifics;
			} else {
			  const category = await categoryIdentification(
				title,
				destination_account, "",destination_marketplace
			  );
			  console.log(category, "category ------------------");

			  if (category) {
				categoryId = category;

				const idText = `Title : ${csku.title} Description : ${
				  csku.description
				} itemSpecific : ${JSON.stringify(csku?.itemSpecifics)},`;

				const aspectData = await generateItemSpecifics(
				  idText,
				  categoryId,
				  "",
				  destination_marketplace.dataValues.siteId,
				  destination_account,
				  config,
				  destination_marketplace
				);

				if (aspectData) {
				  aspects = aspectData;
				}
				console.log();
			  }
			}

			console.log(aspects, "aspects ------------------");

			if (titleConfig.useAIGenerated) {
			  let titlePrompt = `Generate a title for the product from the title: ${title}.`;
			  // console.log(
			  //   "---------------------",
			  //   destination_account,
			  //   "destination accout ------------------"
			  // );

			  let promptData = JSON.stringify({
				userId: destination_account?.userId ?? "",
				categoryTreeId: config?.config?.categoryTreeId ?? "",
				categoryId: categoryId ?? "",
				marketplaceId: destination_account?.marketPlaceId ?? "",
			  });

			  let promptConfig = {
				method: "get",
				maxBodyLength: Infinity,
				url: "http://localhost:5001/prompts/get-prompt-logic",
				headers: {
				  "Content-Type": "application/json",
				},
				params: {
				  userId: destination_account?.userId ?? "",
				  categoryTreeId: config?.config?.categoryTreeId ?? "",
				  categoryId: categoryId ?? "",
				  marketplaceId: destination_account?.marketPlaceId ?? "",
				},
			  };

			  let prResponse;
			  const idText = `Title :${csku.title} Description : ${
			  csku.description
			  } Product Features : ${JSON.stringify(csku.itemSpecifics)}`;
			  // console.log(idText, "idText ------------------");
			  try {
				prResponse = await axios
				  .request(promptConfig)
				  .catch(async (err) => {
					console.error("Error in get-prompts-logic", err);
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  err,
					  "error"
					);
				  });
			  } catch (err) {
				console.error("Error in get-prompts-logic", err);
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  err,
				  "error"
				);
				continue;
			  }

			  if (prResponse?.data) {
				titlePrompt += prResponse.data.prompt.prompt;
			  }
			  // const completion = await openai.chat.completions.create({
			  //   messages: [
			  //     {
			  //       role: "system",
			  //       content: "You are an expert product title generator who generates one title of length 75 characters strictly. Please strictly do not go above 80 characters",
			  //     },
			  //     {
			  //       role: "user",
			  //       content:`${idText} ${titlePrompt}`,
			  //     },
			  //   ],
			  //   model: "gpt-4o",
			  // });

			  // title = completion.choices[0].message.content;
			  // console.log(title, "title generated ------------------");
			  do {
				const completion = await openai.chat.completions.create({
				  messages: [
					{
					  role: "system",
					  content: "You are an expert product title generator who generates one title of length 140 characters strictly. Please strictly do not go above 140 characters",
					},
					{
					  role: "user",
					  content: `${idText} ${titlePrompt}`,
					},
				  ],
				  model: "gpt-4o",
				});
			  
				title = completion.choices[0].message.content;
				console.log(title, "title generated ------------------");
			  } while (title.length > 140);

			}

			let description;
			description = csku?.description;
			//   console.log(
			//     csku?.description,
			//     "csku description -----------------------"
			//   );
			if (config?.config?.useSourceAccountDescription) {
			  description = csku?.description;
			
			  const $ = cheerio.load(description);
			  description = $('.description-class').html();

			  // Replace <br/> tags with \n and handle other special characters
			  description = description
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(/&quot;/g, '"')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&nbsp;/g, ' ')
				.replace(/<\/?[^>]+(>|$)/g, ""); 
			  console.log(
				description,
				"csku description -----------------------"
			  );
			} else {
			  // const descTemplate = await Template.findById(config?.aPlusDescriptionTemplate);

			  const descTemplate = await Template.findOne({
				where: {
				  template_name: config?.config?.aPlusDescriptionTemplate,
				},
			  });
			  description = description
			  .replace(/[^\r\n\x20-\x7E]+/g, "") 
			  .replace(/\r?\n/g, "<br/>");

			  if (config?.description_update) {
				config.description_update.forEach(({ pattern, replaceWith }) => {
				  try {
				  // Convert pattern string to a regular expression
				  const regex = new RegExp(pattern, 'g');  // 'g' for global matching
				  // console.log(`Applying regex: ${regex}`);
				  description = description.replace(regex, replaceWith);
				  } catch (error) {
				  console.error(`Invalid regex pattern: ${pattern}`, error);
				  }
				});
			  }
			  
			  //   console.log(
			  // 	description,
			  // 	"description updated-----------------------"
			  //   );

			  const ejsData = {};
			  // console.log(
			  //   descTemplate?.dataValues?.ejsKeys,
			  //   "descTemplate?.dataValues?.ejsKeys ------------------"
			  // );

			  if (
				descTemplate?.dataValues?.ejsKeys &&
				descTemplate?.dataValues?.ejsKeys.length > 0
			  ) {
				descTemplate?.dataValues?.ejsKeys.forEach((key) => {
				  switch (key) {
					case "title":
					  ejsData["title"] = title;
					  break;
					case "description":
					  ejsData["description"] = description;
					  break;
					case "specifications":
					  ejsData["specifications"] = Object.entries(aspects).map(
						([key, value]) => ({
						  key,
						  value: value,
						})
					  );
					  break;
					case "images":
					  ejsData["images"] = csku.images.slice(0, 5);
					  break;
					default:
					  break;
				  }
				});
				// console.log(ejsData, "ejsData ------------------");

				description = await ejs.render(
				  descTemplate.dataValues.ejs,
				  ejsData
				);
			  }
			}


			console.log("channelId ", csku.channelId);

			let destinationStoreCategory = {};
			if (csku?.storeCategoryId) {
			  const sourceStoreCategory = await StoreCategory.findOne({
				where: {
				  shop_category_id: csku.storeCategoryId,
				  account_name: source_account.accountName,
				  user_id: source_account.userId,
						  marketplace_id:source_account.marketPlaceId
				},
			  });
			  if(!sourceStoreCategory){
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "sourceStoreCategory not found" },
				  "error"
				);
			  }
			  destinationStoreCategory = await StoreCategory.findOne({
				where: {
				  title: sourceStoreCategory.title,
				  account_name: destination_account.accountName,
				  user_id: destination_account.userId,
						  marketplace_id:destination_account.marketPlaceId
				},
			  });

			}
			let variants = [];
			if (
			  source_marketplace.dataValues.url.includes("ebay") &&
			  destination_marketplace.dataValues.url.includes("etsy")
			) {
			  const variantData = await CatalogueVariation.findAll({
				where: {
				  channel_id: csku.channelId,
				  account_name: source_account.dataValues.accountName,
				  userId: source_account.dataValues.userId,
				},
				attributes: ["variation", "price", "quantity", "variation_id"],
			  });
			  if(!variantData){
				await apiCallLog(
				  "configQueue",
				  "configQueue",
				  "configQueue",
				  { config, csku },
				  {},
				  { error: "variantData not found" },
				  "error"
				);
			  }
			  if (variantData.length>0) {
				variants = await convertEbayVariantsToEtsyFormat(variantData, csku.isku,categoryId, destination_account);
				console.log("ebay ID ", csku.channelId);
				if (!variants) {
				  await apiCallLog(
					"configQueue",
					"configQueue",
					"configQueue",
					{ config, csku },
					{},
					{ error: "variants not found" },
					"error"
				  );
				}
			  }
			}
			console.log(
			  JSON.stringify(variants, 2),
			  "variants ------------------"
			);

			// return;
			const product = {
			  title: title,
			  description: description,
			  categoryId: categoryId,
			  aspects: aspects,
			  isku: csku.isku,
			  price: price,
			  currency:
				config?.config?.pricingRule?.currencyConversionRate
				  ?.destinationCurrency ?? csku.currency,
			  quantity: config?.config?.listWithZeroQuantity
				? 0
				: csku.quantity,
			  images: images,
			  // video: videoId,
			  storeCategoryId: destinationStoreCategory?.shop_category_id,
			};

			const sellerProfile = {
			  SellerShippingProfile: {
				ShippingProfileID: "",
				ShippingProfileName: "",
			  },
			  SellerReturnProfile: {
				ReturnProfileID: "",
				ReturnProfileName: "",
			  }
			};

			if (businessPolicies) {
			  console.log("inside business policies section");

			  if (businessPolicies.useSourceShippingPolicy) {
				let shippingPolicy;
				shippingPolicy = await ShippingPolicyModel.findOne({
				  where: {
					name: {
					  [Op.iLike]:
						csku.sellerProfile?.SellerShippingProfile
						  ?.ShippingProfileName,
					},
				  },
				});
				if (
				  source_marketplace.dataValues.url.includes("ebay") &&
				  destination_marketplace.dataValues.url.includes("etsy")
				) {
				  const etsyShippingPolicy = await ShippingPolicyModel.findOne({
					where: {
					  fulfillmentPolicyId: JSON.stringify(
						csku.sellerProfile?.SellerShippingProfile
						  ?.ShippingProfileID
					  ),
					},
				  });
				  if (!etsyShippingPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "etsyShippingPolicy not found" },
					  "error"
					);
				  }
				  if (etsyShippingPolicy) {
					shippingPolicy = await ShippingPolicyModel.findOne({
					  where: {
						name: {
						  [Op.iLike]: etsyShippingPolicy.dataValues.name,
						},
						accountName: destination_account.accountName,
						// marketplaceId: destination_account.marketPlaceId,
					  },
					});
				  }
				  // console.log("shipping Poliucy", shippingPolicy);
				  if(!shippingPolicy){
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "shippingPolicy not found for etsy marketplace account" },
					  "error"
					);
				  }
				}
				if (shippingPolicy) {
				  sellerProfile.SellerShippingProfile.ShippingProfileID =
					shippingPolicy.dataValues.fulfillmentPolicyId;
				  sellerProfile.SellerShippingProfile.ShippingProfileName =
					shippingPolicy.dataValues.name;
				} else {
				  let policyData = JSON.stringify({
					userId: destination_account.userId,
					accountName: destination_account.accountName,
					marketplaceId: destination_account?.marketPlaceId
					  ? parseInt(destination_account?.marketPlaceId)
					  : 7,
				  });

				  let policyConfig = {
					method: "post",
					maxBodyLength: Infinity,
					url: "http://localhost:5001/master/get-user-profiles",
					headers: {
					  "Content-Type": "application/json",
					},
					data: policyData,
				  };

				  await axios
					.request(policyConfig)
					.then((response) => {
					  console.log(
						JSON.stringify(response.data),
						"get seller profiles "
					  );
					})
					.catch(async (error) => {
					  console.error("Error in get-user-profiles", error);
					  await apiCallLog(
						"configQueue",
						"configQueue",
						"configQueue",
						config,
						{},
						error,
						"error"
					  );
					});

				  const shippingPolicy = await ShippingPolicyModel.findOne({
					where: {
					  name: {
						[Op.iLike]:
						  csku.sellerProfile?.SellerShippingProfile
							?.ShippingProfileName,
					  },
					},
				  });

				  if (!shippingPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "shippingPolicy not found" },
					  "error"
					);
				  }

				  sellerProfile.SellerShippingProfile.ShippingProfileID =
					shippingPolicy.dataValues.fulfillmentPolicyId;
				  sellerProfile.SellerShippingProfile.ShippingProfileName =
					shippingPolicy.dataValues.name;
				}
			  } else {
				
				const shippingPolicy = await ShippingPolicyModel.findOne({
				  where: {
					id: businessPolicies.shippingPolicyId,
				  },
				});

				sellerProfile.SellerShippingProfile.ShippingProfileID =
				  shippingPolicy.dataValues.fulfillmentPolicyId;
				sellerProfile.SellerShippingProfile.ShippingProfileName =
				  shippingPolicy.dataValues.name;
			  }

			  if (businessPolicies.useSourceReturnPolicy) {
				const returnPolicy = await ReturnPolicyModel.findOne({
				  where: {
					name: {
					  [Op.iLike]:
						csku.sellerProfile?.SellerReturnProfile
						  ?.ReturnProfileName,
					},
				  },
				});
				// console.log("return Policy >> ", returnPolicy);
				if (returnPolicy) {
				  sellerProfile.SellerReturnProfile.ReturnProfileID =
					returnPolicy.dataValues.returnPolicyId;
				  sellerProfile.SellerReturnProfile.ReturnProfileName =
					returnPolicy.dataValues.name;
				} else {
				  let policyData = JSON.stringify({
					userId: destination_account.dataValues.userId,
					accountName: destination_account.dataValues.accountName,
					marketplaceId: destination_account.dataValues.marketPlaceId,
				  });

				  let policyConfig = {
					method: "post",
					maxBodyLength: Infinity,
					url: "http://localhost:5001/master/get-user-profiles",
					headers: {
					  "Content-Type": "application/json",
					},
					data: policyData,
				  };

				  await axios
					.request(policyConfig)
					.then((response) => {
					  console.log(JSON.stringify(response.data));
					})
					.catch(async (error) => {
					  console.error("Error in get-user-profiles", error);
					  await apiCallLog(
						"configQueue",
						"configQueue",
						"configQueue",
						{ config, csku },
						{},
						error,
						"error"
					  );
					});

				  const returnPolicy = await ReturnPolicyModel.findOne({
					where: {
					  name: {
						[Op.iLike]:
						  csku.sellerProfile?.SellerReturnProfile
							?.ReturnProfileName,
					  },
					},
				  });

				  if (!returnPolicy) {
					await apiCallLog(
					  "configQueue",
					  "configQueue",
					  "configQueue",
					  { config, csku },
					  {},
					  { error: "returnPolicy not found" },
					  "error"
					);
				  }

				  sellerProfile.SellerReturnProfile.ReturnProfileID =
					returnPolicy.dataValues.returnPolicyId;
				  sellerProfile.SellerReturnProfile.ReturnProfileName =
					returnPolicy.dataValues.name;
				}
			  } else {
				const returnPolicy = await ReturnPolicyModel.findOne({
				  where: {
					id: businessPolicies.returnPolicy,
				  },
				});

				sellerProfile.SellerReturnProfile.ReturnProfileID =
				  returnPolicy?.dataValues?.returnPolicyId;
				sellerProfile.SellerReturnProfile.ReturnProfileName =
				  returnPolicy?.dataValues?.name;
			  }
			} else {
			  const error = {
				message: "business policy config is missing",
			  };
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				error,
				"error"
			  );
			  console.log("error in business policy -----------------");
			  break;
			}

			console.log(
			  "sellerProfile ------------------",
			  JSON.stringify(sellerProfile, 2)
			);

			// for inserting data in ebay
			try {
			  console.log("inside create etsy product");
			  console.log("channelId -------------------", csku?.channelId);
			  await createEtsyProduct(
				destination_account.dataValues.userId,
				destination_account.dataValues.accountName,
				destination_account.dataValues.marketPlaceId,
				destination_account,
				product,
				sellerProfile,
				{ id: categoryId },
				aspects,
				variants ?? {},
				"mainFunction",
				config.config_id,
				config.version,
				source_account.dataValues.accountName,
				csku?.channelId,
			  );
			} catch (err) {
			  console.log("Error in upsertEbayProduct >> ", err);
			  await apiCallLog(
				"configQueue",
				"configQueue",
				"configQueue",
				{ config, csku },
				{},
				err,
				"error"
			  );
			}

			// for testing , writing product data in json file
			//require("fs").writeFileSync("product.json", JSON.stringify(product, null, 2));
		  }else if (destination_marketplace.dataValues.url.includes("amazon")) {
			if (
				destination_marketplace.dataValues.url.includes("amazon") &&
				source_marketplace.dataValues.url.includes("amazon")
			) {
				categoryId = csku.dataValues.categoryId;
			} else {
				const category = await categoryIdentification(
					title, destination_account, destinationSite, destination_marketplace
				)
				console.log(category, "category ------------------");
				categoryId = category.productTypes[0].name;
				let requiredFields = ""
				let geminiData = {};
				if (categoryId) {
					try {
						console.log("Ctegory ID", categoryId);
						const response = await axios.get(
							`https://sellingpartnerapi-na.amazon.com/definitions/2020-09-01/productTypes/${categoryId}`, {
								params: {
									marketplaceIds: destinationSite?.globalId || destinationSite?.dataValues.globalId,
									productTypeVersion: 'LATEST',
									requirements: 'LISTING',
									requirementsEnforced: 'ENFORCED',
									locale: 'DEFAULT',
								},
								headers: {
									'x-amz-access-token': destination_account.token || destination_account.dataValues.token,
								}
							}
						);
		
						// console.log(response.data);
						// console.log(response.data.schema.link.resource);
						const schema = await downloadFileToBuffer(response.data.schema.link.resource);
						geminiData = JSON.parse(schema.toString('utf8'));
						const fieldsToRemove = ['brand', 'item_name', 'product_description', 'country_of_origin'];
						geminiData.required = geminiData.required.filter(field => !fieldsToRemove.includes(field));
						geminiData.required.push('occasion_type');
						geminiData.required.push('style');
						geminiData.required.push('earring_design');    
						requiredFields = await transformAmazonDataToSchema(geminiData);
						console.log(JSON.stringify(requiredFields));
					} catch (error) {
						console.error('Error fetching product type definition:', error.response ? error.response.data : error.message);
						apiCallLog(
							'mainFunction',
							'mainFunction',
							'mainFunction', {
								configId
							}, {},
							error,
							'error'
						);
					}
				} else {
					apiCallLog(
						'mainFunction',
						'mainFunction',
						'mainFunction', {
							configId
						}, {}, {
							error: 'Category not found'
						},
						'error'
					);
					continue;
				}
				const requiredData = await geminiApiCallAmazon(csku, requiredFields);
				// console.log(JSON.stringify(requiredData), "requiredData---------");
				const imageLocator = {};
				console.log(csku.images, "cskuData.images");
				for (var x = 0; x < csku.images.length; x++) {
		
					const image = csku.images[x]
					if (x < 8) {
		
						if (x == 0) {
							imageLocator.main_product_image_locator = [{
								media_location: image,
								marketplace_id: destinationSite.globalId
							}];
		
						} else {
							imageLocator[`other_product_image_locator_${x}`] = [{
								media_location: image,
								marketplace_id: destinationSite.globalId
							}];
						}
					}
				}
				Object.assign(requiredData[0], imageLocator);
				const list_price = [{
					currency: destinationSite.currency,
					value: csku.price,
					marketplace_id: destinationSite.globalId
				}]
				const supplier_declared_has_product_identifier_exemption = [{
					value: true,
					marketplace_id: destinationSite.globalId
				}]
				requiredData[0].list_price = list_price;
				requiredData[0].supplier_declared_has_product_identifier_exemption = supplier_declared_has_product_identifier_exemption;
				// console.log(JSON.stringify(requiredData), "requiredData");
				const attributes = {
				  item_name: [{
					  value: title,
					  marketplace_id: destinationSite.globalId,
					  language_tag:destinationSite.languageCode
				  }],
				  brand: [{
					  value: csku.brand || "GENERIC",
					  marketplace_id: destinationSite.globalId,
					  language_tag:destinationSite.languageCode
				  }],
				  product_description: [{
					  value: csku.description.replaceAll(/<[^>]*>?/gm, '').replace(/\n/g, '<br/>'),
					  language_tag:destinationSite.languageCode,
					  marketplace_id: destinationSite.globalId
				  }],
				  country_of_origin: [{
					  value: "IN",
					  marketplace_id: destinationSite.globalId,
					  language_tag:destinationSite.languageCode
				  }]
				};
		
				for (const key in requiredData[0]) {
					if (Array.isArray(requiredData[0][key])) {
						attributes[key] = requiredData[0][key].map(item => {
							if (!item.marketplace_id) {
								return {
									...item,
									marketplace_id: destinationSite.globalId
								};
							}
							return item;
						});
					}
				}
				const request = {
					productType: categoryId,
					requirements: 'LISTING',
					attributes: attributes,
				}
				console.log(JSON.stringify(request), "------------------------------------- request");
				const listingAPI = await createAmazonCatalogue(destinationSite, destination_account, csku?.isku, request);
				if (listingAPI) {
				  console.log(JSON.stringify(listingAPI), "listingAPI");
					listingAPI.forEach((issue) => {
						if (!geminiData?.required.includes(issue.attributeNames[0])) {
							geminiData?.required.push(issue.attributeNames[0]);
						}
					});
		
					await processListings(request, geminiData, listingAPI, destinationSite, destination_account, csku, categoryId);
				}
			}
		  }
		}
	  }

	  // }
	}
  } catch (err) {
	console.log("Error in mainFunction >> ", err);
	await apiCallLog(
	  "mainFunction",
	  "mainFunction",
	  "mainFunction",
	  { configId },
	  {},
	  err,
	  "error"
	);
  }
}

const generateItemSpecifics = async (
  idText,
  categoryId,
  categoryName = null,
  siteId = null,
  token,
  config,
  destination_marketplace
) => {
  try {
	if (destination_marketplace?.dataValues.url.includes("ebay")) {
	  let now = moment();

	  if (
		!token.dataValues.lastTokenRefreshDate ||
		now.diff(token.dataValues.lastTokenRefreshDate, "hours") >= 2
	  ) {
		const refreshedToken = await refreshToken(eBay, token);
		// console.log("Token >> ", refreshedToken);
		eBay.OAuth2.setCredentials(refreshedToken);
	  }
	  console.log("categoryId--------------", categoryId);

	  aspectData = await eBay.commerce.taxonomy.getItemAspectsForCategory(
		0,
		categoryId
	  );

	  const requiredAspects = aspectData.aspects.filter(
		(asp) => asp.aspectConstraint.aspectRequired
	  );
	  const aspNames = new Set();
	  let acceptedValuesMap = {};
	  requiredAspects?.map((asp) => {
		if (asp.localizedAspectName == "US Shoe Size") {
		  aspNames.add(
			asp.localizedAspectName + " (convert into US Shoe Size)"
		  );
		} else {
		  aspNames.add(asp.localizedAspectName);
		}
	  });
	  // console.log(config?.additional_aspects, "config?.additionalAspects");
	  if (config?.additional_aspects) {
		config?.additional_aspects?.keyvaluepairs.forEach((pair) => {
		  // console.log(pair.fieldname, "pair.fieldname");
		  aspNames.add(pair.fieldname);

		  if (pair.acceptedValues.length > 0) {
			acceptedValuesMap[pair.fieldname] = pair.acceptedValues;
		  }
		});
	  }
	  console.log("Aspect Names Set:", aspNames);
	  // console.log("Accepted Values Map:", acceptedValuesMap);
	  const completion = await openai.chat.completions.create({
		messages: [
		  {
			role: "system",
			content:
			  "You are an expert product aspects generator and follow the below prompt strictly",
		  },
		  {
			role: "user",
			content: `${idText}
					Based on the text above extract ${Array.from(aspNames).join(
			", "
		  )} return 'NA' if not found and return in object form. Accepted values for the keys are ${JSON.stringify(
			  acceptedValuesMap
			)},
					Size and shoe size is same. Also Purity and Metal Purity are same. If Style is not provided then look for it in Tags section takeout Style key value strictly. TakeOut values for each Key. Takeout Item Length key's value as it is compulsary if its available. If its not available then return 'NA'.
		  Note: Length of each value should not exceed 50 characters.`,
		  },
		],
		model: "gpt-4o-mini",
	  });

	  let aspects = {};
	  completion.choices[0].message.content
		?.replaceAll("```", "")
		.replaceAll("json", "")
		.replace("{", "")
		.replace("}", "")
		.split("\n")
		?.map((item) => {
		  const [key, value] = item.split(":");
		  if (key.includes("US Shoe Size")) {
			aspects["US Shoe Size"] = [value];
			delete aspects[key];
		  } else {
			if (
			  key != "" &&
			  key &&
			  !value?.includes("NA") &&
			  !key.includes("N/A") &&
			  !key.includes("NA")
			) {
			  aspects[
				key
				  .replaceAll("*", "")
				  .replaceAll("-", "")
				  .replaceAll(`"`, "")
				  .replaceAll("<b>", "")
				  .replaceAll("</b>", "")
				  .replaceAll("<br>", "")
				  .replaceAll("<li>", "")
				  .replaceAll("</li>", "")
				  .trim()
			  ] = [
				value
				  ?.replaceAll("*", "")
				  .replaceAll("-", "")
				  .replace("US", "")
				  .replace("(", "")
				  .replace(")", "")
				  .replaceAll(`"`, "")
				  .replaceAll("<b>", "")
				  .replaceAll("</b>", "")
				  .replaceAll("<br>", "")
				  .replaceAll("<li>", "")
				  .replaceAll("</li>", "")
				  .trim(),
			  ];
			} else if (value?.includes("NA")) {
			  console.log("In NA", key);
			  // aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [foundAspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()]];
			  // delete aspects[key];
			  if (key.trim().includes("Type")) {
				console.log("In Type");
				aspects[
				  key
					.replaceAll("*", "")
					.replaceAll("-", "")
					.replaceAll(`"`, "")
					.replaceAll("<b>", "")
					.replaceAll("</b>", "")
					.replaceAll("<br>", "")
					.replaceAll("<li>", "")
					.replaceAll("</li>", "")
					.trim()
				] = [categoryName];
			  }
			}
		  }
		});

	  console.log(aspects);
	  return aspects;
	} else if (destination_marketplace?.dataValues.url.includes("etsy")) {
	  try {
		const data = await getEtsyProductPropertiesByCategoryId(
		  categoryId,
		  token
		);

		const processedData = data.map((item) => {
		  const possibleValues = item.possible_values.map((value) => ({
			[value.name]: value.value_id,
		  }));
		  return {
			[item.name]: item.property_id,
			possible_values: possibleValues,
		  };
		});

		const completion = await openai.chat.completions.create({
		  messages: [
			{
			  role: "system",
			  content:
				"You are an expert product aspects generator and follow the below prompt strictly",
			},
			{
			  role: "user",
			  content: `Based on text : ${idText} extract the correct values for each property in the following format:
				[
				  {
					"property_id": Use property_id from the data,
					"property_name": "string",
					"scale_id": 1,
					"scale_name": "string",
					"value_ids": [use value_ids matching the extracted values from the text],
					"values": ["string"]
				  }
				]
				Here is the processed data: ${JSON.stringify(processedData)}`,
			},
		  ],
		  model: "gpt-4o-mini",
		});

		const aspectsData = completion.choices[0].message.content
		  ?.replaceAll("```json", "")
		  .replaceAll("```", "");
		console.log(aspectsData, "aspectsData ------------------");

		return aspectsData;
	  } catch (error) {
		console.error("Error fetching Etsy taxonomy properties:", error);
		throw error;
	  }
	}
  } catch (err) {
	console.log("Error in generateItemSpecifics >> ", err);
	await apiCallLog(
	  "generateItemSpecifics",
	  "generateItemSpecifics",
	  "generateItemSpecifics",
	  { idText, categoryId },
	  {},
	  err,
	  "error"
	);
	return null;
  }
};

const categoryIdentification = async (
  title,
  token,
  siteId = null,
  destination_marketplace
) => {
  try {
	if (destination_marketplace.dataValues.url.includes("ebay")) {
	  console.log("In categoryIdentification of eBay", title, token, siteId);
	  let now = moment();

	  if (
		!token.dataValues.lastTokenRefreshDate ||
		now.diff(token.dataValues.lastTokenRefreshDate, "hours") >= 2
	  ) {
		const refreshedToken = await refreshToken(eBay, token);
		// console.log("Token >> ", refreshedToken);
		eBay.OAuth2.setCredentials(refreshedToken);
	  }

	  // console.log(
	  //   siteId,
	  //   title,
	  //   "categoryIdentification props siteid and title ---------------------"
	  // );
	  console.log(title, "title ---------------------");
	  const category = await eBay.commerce.taxonomy.getCategorySuggestions(
		0,
		title
	  );
	  if (!category?.categorySuggestions?.length) {
		console.log("Category not found");
		await apiCallLog(
		  "categoryIdentification",
		  "categoryIdentification",
		  "categoryIdentification",
		  { title },
		  {},
		  { error: "Category not found" },
		  "error"
		);
		return null;
	  }
	  const categoryId = category.categorySuggestions[0].category.categoryId;
	  const categoryName =
		category.categorySuggestions[0].category.categoryName;
	  console.log(categoryId, categoryName);

	  return { categoryId, categoryName };
	} else if (destination_marketplace.dataValues.url.includes("etsy")) {
	  const etsyCategory = await Catalogue.findAll({
		where: {
		  marketPlace: token.dataValues.marketPlaceId.toString(), // Convert to string
		  categoryTree: { [Op.iLike]: "Jewelry:%" },
		  leafCategoryTreeNode: true,
		},
		attributes: ["categoryTree", "categoryName", "categoryId"],
	  });

	  const categoryIdResponse = await openai.chat.completions.create({
		messages: [
		  {
			role: "system",
			content: `You are a system that maps to the correct categoryId from the provided category data based on listingData provided. Use the following title to find the best match.`,
		  },
		  {
			role: "user",
			content: `Here is the categoryData: ${JSON.stringify(
			  etsyCategory
			)}. Here is the listingData: ${title}. Find the most relevant categoryId for this title and retrurn only the id(number) ,`,
		  },
		],
		model: "gpt-4o",
	  });

	  const etsyCategoryGenerated =
		categoryIdResponse.choices[0].message.content;
	  console.log(
		etsyCategoryGenerated,
		"etsyCategoryGenerated ------------------"
	  );
	  return etsyCategoryGenerated;
	} else if (destination_marketplace.dataValues.url.includes("amazon")) {
	  try {
		console.log(
		  "In categoryIdentification of Amazon",
		  title,
		  token,
		  siteId,
		  "---------------------------------------- Category Identification"
		);
		const url = `https://sellingpartnerapi-${siteId?.localeValue}.amazon.com/definitions/2020-09-01/productTypes`;
		const params = {
		  itemName: title,
		  marketplaceIds: siteId?.globalId,
		};

		const response = await axios.get(url, {
		  params,
		  headers: {
			"x-amz-access-token": token.dataValues.token,
			"Content-Type": "application/json",
		  },
		});

		console.log("Product Types:", response.data);
		return response.data;
	  } catch (error) {
		console.error(
		  "Error fetching product types:",
		  error.response?.data || error.message
		);
		apiCallLog(
		  "categoryIdentification",
		  "categoryIdentification",
		  "categoryIdentification",
		  { title },
		  {},
		  error,
		  "error"
		);
		throw error;
	  }
	}
  } catch (err) {
	console.log("Error in categoryIdentification >> ", err);
  }
};

// async function refreshToken(token) {
// 	try {
// 		const newToken = await ebayAuthToken.getAccessToken(
// 			'PRODUCTION',
// 			token.dataValues.refreshToken,
// 			scopes
// 		)

// 		if (JSON.parse(newToken).error) {
// 			token.status = 'inactive'
// 			await token.save()

// 			const nodemailer = require('nodemailer')

// 			// Create a transporter
// 			let transporter = nodemailer.createTransport({
// 				host: process.env.SMTP_Hostname, // Replace with your SMTP host
// 				port: process.env.SMTP_Port,
// 				secure: false, // true for 465, false for other ports
// 				auth: {
// 					user: process.env.SMTP_Username, // Replace with your SMTP username
// 					pass: process.env.SMTP_Password // Replace with your SMTP password
// 				}
// 			})

// 			const userData = await User.findOne({
// 				where: { id: token.dataValues.userId }
// 			})

// 			if (userData) {
// 				// Set up email data
// 				let mailOptions = {
// 					from: process.env.FROM_EMAIL, // Replace with your email
// 					to: 'aditya@sellerpundit.com', // Replace with the receiver's email
// 					cc: userData.dataValues.email,
// 					subject: 'Token Expired!',
// 					text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`
// 				}

// 				// Send the email
// 				transporter.sendMail(mailOptions, (error, info) => {
// 					if (error) {
// 						newRelic.recordCustomEvent(`Error while email sending:`, error)
// 						console.log(error)
// 					}
// 					console.log('Message sent: %s', info.messageId)
// 				})
// 			}

// 			newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`)
// 			console.log(newToken.error)
// 			throw newToken.error
// 		}

// 		const accessToken = JSON.parse(newToken)
// 		console.log(accessToken)
// 		//   eBay.OAuth2.setCredentials(accessToken.access_token)
// 		//   token.token = accessToken.access_token
// 		const lastTokenRefreshDate = moment()
// 			.add(5, 'hours')
// 			.add(30, 'minutes')
// 			.toISOString()
// 		await Tokens.update(
// 			{
// 				token: accessToken?.access_token,
// 				lastTokenRefreshDate: lastTokenRefreshDate
// 			},
// 			{
// 				where: {
// 					id: token?.dataValues?.id || token?.id
// 				}
// 			}
// 		)

// 		return accessToken.access_token
// 		// await token.save()
// 	} catch (error) {
// 		newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`)
// 		console.log(error)
// 		throw error
// 	}
// }

async function refreshToken(eBay, token) {
  try {
	const newToken = await ebayAuthToken.getAccessToken(
	  "PRODUCTION",
	  token?.dataValues?.refreshToken || token?.refreshToken,
	  scopes
	);
	if (JSON.parse(newToken)?.error) {
	  await Tokens.update(
		{
		  status: "inactive",
		},
		{
		  where: {
			id: token?.dataValues?.id || token?.id,
		  },
		}
	  );
	  // Create a transporter
	  const nodemailer = require("nodemailer");
	  let transporter = nodemailer.createTransport({
		host: process.env.SMTP_Hostname, // Replace with your SMTP host
		port: process.env.SMTP_Port,
		secure: false, // true for 465, false for other ports
		auth: {
		  user: process.env.SMTP_Username, // Replace with your SMTP username
		  pass: process.env.SMTP_Password, // Replace with your SMTP password
		},
	  });

	  const userData = await User.findOne({
		where: { id: token?.dataValues?.userId || token?.userId },
	  });

	  console.log();

	  if (userData) {
		// Set up email data
		let mailOptions = {
		  from: process.env.FROM_EMAIL, // Replace with your email
		  to: "aditya@sellerpundit.com", // Replace with the receiver's email
		  cc: userData.dataValues.email,
		  subject: "Token Expired!",
		  text: `Token for account name ${
			token?.dataValues?.accountName || token?.accountName
		  } associated with user ${
			userData?.dataValues?.email
		  } has expired. Please login to your account and reauthorize the token.`,
		};

		// Send the email
		// transporter.sendMail(mailOptions, (error, info) => {
		//   if (error) {
		//     newRelic.recordCustomEvent(`Error while email sending:`, error);
		//     console.log(error);
		//   }
		//   console.log("Message sent: %s", info.messageId);
		// });
	  }

	  newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
	  console.log(newToken.error, "Error newToken");
	  console.log(newToken, "newToken");
	  throw newToken.error;
	}
	const accessToken = JSON.parse(newToken);
	eBay.OAuth2.setCredentials(accessToken.access_token);
	console.log(accessToken, "accessToken");
	await Tokens.update(
	  {
		token: accessToken.access_token,
		lastTokenRefreshDate: moment()
		  .add(5, "hours")
		  .add(30, "minutes")
		  .toISOString(),
	  },
	  {
		where: {
		  id: token?.dataValues?.id || token?.id,
		},
	  }
	);
  } catch (error) {
	newRelic.recordCustomEvent(`Error while token refresh: ${error?.message}`);
	console.log(error);
	throw error;
  }
}

const EbayItemCompatibility = async (
  itemCompatability,
  compatibilityStructure
) => {
  let compatibilities = [];
  // console.log("ITEM COMP>:::  ",itemCompatability);
  const updatedItemComp = itemCompatability.map((entry) => {
	return entry.NameValueList.reduce((acc, obj) => {
	  if (obj.Name && obj.Value) {
		acc[obj.Name] = obj.Value;
	  }
	  return acc;
	}, {});
  });

  console.log("Updated ITEM COMP:", updatedItemComp);

  let isTrim = false;
  let isSubmodel = false;

  const ItemCompatibility = [];

  let unfilteredData = [];
  let uniqueFinalData = [];
  let uniqueData = [];
  console.log("compatabi. length : ", updatedItemComp.length);

  for (const item of updatedItemComp) {
	let isTrim = false;
	let isSubmodel = false;
	let trim = null;
	let submodel = null;
	let model = null;
	let year = null;
	let make = null;

	if (item.Trim) {
	  isTrim = true;
	  trim = item.Trim;
	  const log = `\n"${item.isku}",`;
	  console.log("trim log >> ", log);
	  // TrimArr.write(log);
	  continue;
	}

	if (item.Submodel) {
	  isSubmodel = true;
	  submodel = item.Submodel;
	}

	model = item.Model || null;
	year = item.Year || null;
	make = item.Make || null;

	console.log(year, make, model, submodel);

	const returnData = async (make, model, year, submodel, isSubmodel) => {
	  let data = [];
	  let filteredData = [];
	  let finalData = [];

	  if (isSubmodel) {
		console.log(
		  "*****************************************SUBMODEL RUNS******************************************"
		);

		const insertQuery = `select * from compatibilities where make='${make}' and model='${model}' and year='${year}'`;

		data = await sequelize.query(insertQuery, {
		  type: Sequelize.QueryTypes.SELECT,
		});
	  }

	  console.log("DATA LENGTH AND ISSUBMODEL:", data.length, isSubmodel);
	  // if (data.length == 0) {
	  //   let swap = model;
	  //   model = submodel;
	  //   submodel = swap;
	  //   const query = `select * from compatibilities where make='${make}' and submodel='${model}' and year='${year}'`;
	  //   data = await sequelize.query(query, {
	  //     type: Sequelize.QueryTypes.SELECT,
	  //   });
	  // }

	  if (data.length > 0 && isSubmodel) {
		console.log("GOES FOR '''''SUBMODEL''''", submodel);

		let desiredSubmodel = submodel;
		filteredData = data.filter((itm) =>
		  itm.submodel.includes(desiredSubmodel)
		);
	  }

	  if (filteredData.length > 0) {
		finalData.push(
		  ...filteredData?.map((abc) => ({
			productFamilyProperties: {
			  Make: abc.make,
			  Model: abc.model,
			  year: abc.year,
			  Submodel: abc.submodel,
			  Variant: abc.variant,
			},
		  }))
		);
	  }
	  return finalData;
	};
	unfilteredData = await returnData(make, model, year, submodel, isSubmodel);
	if (unfilteredData.length == 0) {
	  unfilteredData = await returnData(
		make,
		submodel,
		year,
		model,
		isSubmodel
	  );
	}
	uniqueFinalData = unfilteredData.filter(
	  (value, index, self) =>
		index ===
		self.findIndex(
		  (t) =>
			t.productFamilyProperties.Make ===
			  value.productFamilyProperties.Make &&
			t.productFamilyProperties.Model ===
			  value.productFamilyProperties.Model &&
			t.productFamilyProperties.year ===
			  value.productFamilyProperties.year &&
			t.productFamilyProperties.Submodel ===
			  value.productFamilyProperties.Submodel
		)
	);

	uniqueData.push(...uniqueFinalData);
  }
  uniqueData = uniqueData.filter(
	(value, index, self) =>
	  index ===
	  self.findIndex(
		(t) =>
		  t.productFamilyProperties.Make ===
			value.productFamilyProperties.Make &&
		  t.productFamilyProperties.Model ===
			value.productFamilyProperties.Model &&
		  t.productFamilyProperties.year ===
			value.productFamilyProperties.year &&
		  t.productFamilyProperties.Submodel ===
			value.productFamilyProperties.Submodel
	  )
  );
  console.log("UNIQUE DATA LENGTH:::::", uniqueData.length);

  const fields = compatibilityStructure;

  //   const ItemCompatibility = [];
  await Promise.all(
	uniqueData?.map(async (cpm) => {
	  let nameValueList = [];

	  Object.entries(cpm.productFamilyProperties)?.forEach(([key, value]) => {
		fields?.compatibilityProperties?.forEach((pr) => {
		  if (pr.localizedName.toLowerCase() === key.toLowerCase()) {
			nameValueList.push({
			  Name: pr.name,
			  Value: value ?? "",
			});
		  }
		});
	  });

	  nameValueList = nameValueList.filter((itm) => itm != "");

	  ItemCompatibility.push({
		NameValueList: nameValueList,
	  });
	})
  );
  console.log(ItemCompatibility);
  const itemComp = {
	Compatibility: ItemCompatibility,
  };
  return itemComp;
};

const convertEtsyVariantsToEbayFormat = async (etsyVariants) => {
  console.log(etsyVariants, "etsyVariants ------------------");
  const variationData = {
	VariationSpecificsSet: { NameValueList: [] },
	Variation: [],
	variantMap: [],
  };
  const variantMap = [];

  // Step 1: Build VariationSpecificsSet
  etsyVariants.forEach((variant) => {
	variant?.variation?.property_values?.forEach((property) => {
	  let propertyName = property?.property_name;

	  // Sanitize property name
	  if (propertyName?.includes("&quot;") || propertyName?.includes("&amp;")) {
		propertyName = propertyName
		  .replace(/&quot;/g, '"')
		  .replace(/&amp;/g, "&");
	  }

	  const existingProperty =
		variationData.VariationSpecificsSet.NameValueList.find(
		  (item) => item.Name === propertyName
		);

	  if (!existingProperty) {
		const sanitizedValues = [
		  ...new Set(
			etsyVariants
			  .map((v) => {
				const prop = v?.variation?.property_values?.find(
				  (p) => p.property_name === property?.property_name
				);
				let values = prop?.values;

				// Sanitize values
				if (values && Array.isArray(values)) {
				  values = values.map((optionValue) => {
					if (
					  optionValue.includes("&quot;") ||
					  optionValue.includes("&amp;")
					) {
					  optionValue = optionValue
						.replace(/&quot;/g, '"')
						.replace(/&amp;/g, "&");
					}
					return optionValue;
				  });
				}

				return values;
			  })
			  .flat()
		  ),
		];

		variationData.VariationSpecificsSet.NameValueList.push({
		  Name: propertyName,
		  Value: sanitizedValues,
		});
	  }
	});
  });

  // Step 2: Build Variations
  etsyVariants.forEach((variant, index) => {
	const variantOffering = variant?.variation?.offerings?.[0];
	if (variantOffering) {
	  const obj = {
		SKU: `${variant.variation.sku}_${variant.variation.product_id}`,
		StartPrice: (
		  variantOffering.price.amount / variantOffering.price.divisor
		).toFixed(2),
		Quantity: variantOffering.quantity.toString(),
		VariationSpecifics: { NameValueList: [] },
	  };
	  //create a map of key as  variantOffering.offering_id and value as obj.SKU
	  const variantObj = {};
	  variantObj[obj.SKU] = variant.variation?.product_id;
	  variantMap.push(variantObj);

	  variant?.variation?.property_values?.forEach((property) => {
		let propertyName = property?.property_name;
		let propertyValue = property?.values?.[0];

		// Sanitize property name and value
		if (
		  propertyName?.includes("&quot;") ||
		  propertyName?.includes("&amp;")
		) {
		  propertyName = propertyName
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, "&");
		}

		if (
		  propertyValue?.includes("&quot;") ||
		  propertyValue?.includes("&amp;")
		) {
		  propertyValue = propertyValue
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, "&");
		}

		obj.VariationSpecifics.NameValueList.push({
		  Name: propertyName,
		  Value: propertyValue,
		});
	  });

	  variationData.Variation.push(obj);
	  variationData.variantMap = variantMap;
	}
  });
  return variationData;
};

// const convertEbayVariantsToEtsyFormat = async (ebayVariations, sku, categoryId, token) => {
//   try {
//     const etsyProperties = await getEtsyProductPropertiesByCategoryId(categoryId, token);
//     const customProperties = etsyProperties.filter(prop => prop.supports_variations);
//     const etsyPropertyMap = new Map(etsyProperties.map(prop => [prop.display_name.toLowerCase(), prop]));

//     let etsyVariants = [];
//     let priceOnProperty = new Set();

//     for (const variation of ebayVariations) {
//       let variationData;

//       if (typeof variation.variation === 'string') {
//         try {
//           variationData = JSON.parse(variation.variation);
//         } catch (error) {
//           console.error('Error parsing variation.variation:', variation.variation);
//           throw error;
//         }
//       } else {
//         variationData = variation.variation;
//       }

//       let propertyValues = [];

//       for (const { Name, Value } of variationData) {
//         console.log(Name, Value);
//         const matchingProperty = etsyPropertyMap.get(Name.toLowerCase());
//         console.log(matchingProperty, "matchingProperty ------------------");
//         if (matchingProperty) {
//           propertyValues.push({
//             property_id: matchingProperty.property_id,
//             property_name: matchingProperty.display_name,
//             value_ids: [matchingProperty.value_id],
//             values: [Value]
//           });
//           priceOnProperty.add(matchingProperty.property_id);
//         }
//       }

//       etsyVariants.push({
//         sku: sku,
//         property_values: propertyValues,
//         offerings: [
//           {
//             price: parseFloat(variation.price),
//             quantity: parseInt(variation.quantity, 10),
//             is_enabled: true,
//           },
//         ],
//       });
//     }

//     return {
//       products: etsyVariants,
//       price_on_property: Array.from(priceOnProperty),
//       quantity_on_property: [],
//       sku_on_property: [],
//     };
//   } catch (error) {
//     console.error('Error converting eBay variants to Etsy format:', error);
//     apiCallLog('convertEbayVariantsToEtsyFormat', 'convertEbayVariantsToEtsyFormat', 'convertEbayVariantsToEtsyFormat', {}, {}, error, 'error');
//     throw error;
//   }
// };

// const convertEbayVariantsToEtsyFormat = async (ebayVariations, sku, categoryId, token) => {
//   try {
//     const etsyProperties = await getEtsyProductPropertiesByCategoryId(categoryId, token);
//     let products = [];
//     let priceOnProperty = new Set();

//     ebayVariations.forEach((variation) => {
//       let variationData = variation.variation;
//       let propertyValues = [];

//       variationData.forEach(({ Name, Value }) => {
//         let matchingProperty = etsyProperties.find(prop => prop.display_name === Name);

//         if (!matchingProperty) {
//           let customPropertyId = Name === variationData[0].Name ? 513 : 514;
//           matchingProperty = {
//             property_id: customPropertyId,
//             name: Name,
//             display_name: Name,
//             scales: [],
//             is_required: false,
//             supports_attributes: false,
//             supports_variations: true,
//             is_multivalued: false,
//             max_values_allowed: null,
//             possible_values: [],
//             selected_values: []
//           };
//         }

//         let possibleValue = matchingProperty.possible_values?.find(val => val.name === Value);
//         let valueId = possibleValue ? possibleValue.value_id : Math.floor(Math.random() * 1000000);

//         propertyValues.push({
//           property_id: matchingProperty.property_id,
//           value_ids: [valueId],
//           property_name: matchingProperty.display_name,
//           values: [Value]
//         });
//       });

//       products.push({
//         sku: sku,
//         property_values: propertyValues,
//         offerings: [{
//           price: parseFloat(variation.price),
//           quantity: variation.quantity,
//           is_enabled: true
//         }]
//       });

//       propertyValues.forEach(prop => priceOnProperty.add(prop.property_id));
//     });

//     return {
//       products,
//       price_on_property: Array.from(priceOnProperty),
//       quantity_on_property: [],
//       sku_on_property: []
//     };
//   } catch (error) {
//     console.error('Error converting eBay variants to Etsy format:', error);
//     apiCallLog('convertEbayVariantsToEtsyFormat', 'convertEbayVariantsToEtsyFormat', 'convertEbayVariantsToEtsyFormat', {}, {}, error, 'error');
//     throw error;
//   }
// };

const convertEbayVariantsToEtsyFormat = async (
  ebayVariations,
  sku,
  categoryId,
  token
) => {
  try {
	const etsyProperties = await getEtsyProductPropertiesByCategoryId(
	  categoryId,
	  token
	);
	let products = [];

	// Track property IDs used in variations
	let propertyIds = new Set();

	ebayVariations.forEach((variation) => {
	  let variationData = variation.variation;
	  let propertyValues = [];

	  variationData.forEach(({ Name, Value }, index) => {
		let matchingProperty = etsyProperties.find(
		  (prop) => prop.display_name === Name
		);
		let propertyId;

		if (matchingProperty) {
		  // Use the matching property's ID if found
		  propertyId = matchingProperty.property_id;
		} else {
		  // If no match, use default IDs
		  propertyId = index === 0 ? 513 : 514;
		}

		propertyIds.add(propertyId);

		// Find or generate value ID
		let valueId;
		if (matchingProperty && matchingProperty.possible_values) {
		  let possibleValue = matchingProperty.possible_values.find(
			(val) => val.name === Value
		  );
		  valueId = possibleValue
			? possibleValue.value_id
			: Math.floor(Math.random() * 1000000);
		} else {
		  valueId = Math.floor(Math.random() * 1000000);
		}

		propertyValues.push({
		  property_id: propertyId,
		  value_ids: [valueId],
		  property_name: Name,
		  values: [Value],
		});
	  });

	  products.push({
		sku: sku,
		property_values: propertyValues,
		offerings: [
		  {
			price: parseFloat(variation.price),
			quantity: variation.quantity,
			is_enabled: true,
		  },
		],
	  });
	});

	// For simplicity, if only one property exists, use that property for pricing
	// If two properties exist, only use the first property for pricing
	const priceOnProperty =
	  propertyIds.size === 1
		? Array.from(propertyIds) // If only one property, use it
		: [Array.from(propertyIds)[0]]; // If multiple properties, use only the first one

	return {
	  products,
	  price_on_property: priceOnProperty,
	  quantity_on_property: [],
	  sku_on_property: [],
	};
  } catch (error) {
	console.error("Error converting eBay variants to Etsy format:", error);
	apiCallLog(
	  "convertEbayVariantsToEtsyFormat",
	  "convertEbayVariantsToEtsyFormat",
	  "convertEbayVariantsToEtsyFormat",
	  {},
	  {},
	  error,
	  "error"
	);
	throw error;
  }
};

const refreshTokenEtsy = async (token) => {
  try {
	let refreshToken = token.refreshToken;
	const response = await axios.post(
	  "https://api.etsy.com/v3/public/oauth/token",
	  {
		grant_type: "refresh_token",
		client_id: token.client_id,
		client_secret: token.client_secret,
		refresh_token: refreshToken,
	  },
	  {
		headers: {
		  "Content-Type": "application/x-www-form-urlencoded",
		},
	  }
	);

	// Save the new token
	token.token = response.data.access_token;
	return token.token;
	console.log("Token refreshed successfully.");
  } catch (error) {
	console.error("Error refreshing token:", error);
  }
};

async function refreshTokenAmazon(token) {
  try {
	console.log("Refreshing Amazon access token");
	console.log(
	  token.dataValues.client_id,
	  token.dataValues.client_secret,
	  token.dataValues.refreshToken
	);
	const url = "https://api.amazon.com/auth/o2/token";
	const params = new URLSearchParams({
	  grant_type: "refresh_token",
	  client_id: token.dataValues.client_id || token.client_id,
	  client_secret: token.dataValues.client_secret || token.client_secret,
	  refresh_token: token?.dataValues?.refreshToken || token?.refreshToken,
	});

	const response = await axios.post(url, params, {
	  headers: {
		"Content-Type": "application/x-www-form-urlencoded",
	  },
	});
	console.log(response.data, "response.data ------------------");
	const accessToken = response.data?.access_token;
	// if (!accessToken) {
	//   await Tokens.update(
	//     { status: 'inactive' },
	//     { where: { id: token?.dataValues?.id || token?.id } }
	//   );

	//   const userData = await User.findOne({
	//     where: { id: token?.dataValues?.userId || token?.userId },
	//   });

	//   if (userData) {
	//     const transporter = nodemailer.createTransport({
	//       host: process.env.SMTP_Hostname,
	//       port: process.env.SMTP_Port,
	//       secure: false,
	//       auth: {
	//         user: process.env.SMTP_Username,
	//         pass: process.env.SMTP_Password,
	//       },
	//     });

	//     const mailOptions = {
	//       from: process.env.FROM_EMAIL,
	//       to: 'aditya@sellerpundit.com',
	//       cc: userData.dataValues.email,
	//       subject: 'Amazon Token Expired!',
	//       text: `Token for account name ${
	//         token?.dataValues?.accountName || token?.accountName
	//       } associated with user ${
	//         userData?.dataValues?.email
	//       } has expired. Please log in to your account and reauthorize the token. Error: ${response.data?.error}`,
	//     };

	//     transporter.sendMail(mailOptions, (error, info) => {
	//       if (error) {
	//         console.error('Error while sending email:', error);
	//       } else {
	//         console.log('Email sent:', info.messageId);
	//       }
	//     });
	//   }
	//   throw new Error('Failed to retrieve access token');
	// }

	await Tokens.update(
	  {
		token: accessToken,
		lastTokenRefreshDate: moment()
		  .add(5, "hours")
		  .add(30, "minutes")
		  .toISOString(),
	  },
	  {
		where: {
		  id: token?.dataValues?.id || token?.id,
		},
	  }
	);

	console.log("Amazon access token refreshed successfully");
  } catch (error) {
	console.error("Error refreshing Amazon token:", error);
	apiCallLog(
	  "refreshTokenAmazon",
	  "refreshTokenAmazon",
	  "refreshTokenAmazon",
	  {},
	  {},
	  error,
	  "error"
	);
	throw error;
  }
}

async function downloadFileToBuffer(url) {
  try {
	const response = await axios.get(url, {
	  responseType: "arraybuffer",
	});

	const buffer = Buffer.from(response.data, "binary");
	console.log("File downloaded successfully");
	return buffer;
  } catch (error) {
	console.error(
	  "Error downloading file:",
	  error.response ? error.response.data : error.message
	);
	throw error;
  }
}

const geminiApiCallAmazon = async (sourceData, schema) => {
  const model = genAI.getGenerativeModel({
	model: "gemini-1.5-pro",
	generationConfig: {
	  responseMimeType: "application/json",
	  responseSchema: schema,
	},
  });

  try {
	const result = await model.generateContent(
	  `${JSON.stringify(sourceData)},
		Extract the keys from the schema and replace the values with the actual data and return in JSON Object. title as item_name, description as product_description, etc. If brand value does not exist use "GENERIC" keyword. use language_tag value as en_US`
	);
	// console.log(result.response.text());
	console.log(
	  typeof result.response.text(),
	  "result.response.text() ------------------"
	);
	return JSON.parse(result.response.text());
  } catch (error) {
	console.error("Error generating content:", error);
	apiCallLog(
	  "geminiApiCallAmazon",
	  "geminiApiCallAmazon",
	  "geminiApiCallAmazon",
	  { sourceData, schema },
	  {},
	  error,
	  "error"
	);
	throw error;
  }
};
async function processListings(
  amazonRequest,
  geminiData,
  listingAPI,
  destinationSite,
  destination_account,
  csku,
  categoryId
) {
  // const issueAttributes = listingAPI.map(issue => issue.attributeNames[0]);
  // console.log(issueAttributes, "issueAttributes ------------------");

  // listingAPI.forEach((issue) => {
  //     const attribute = issue.attributeNames[0];

  //     if (geminiData.required.includes(attribute)) {
  //         delete amazonRequest.attributes[attribute];
  //     } else {
  //         geminiData.required.push(attribute);
  //     }
  // });

  // geminiData.required = geminiData.required.filter(attr => issueAttributes.includes(attr));
  // console.log(geminiData.required, "geminiData.required ------------------");

  // const batchSize = 1;
  // let allRequiredData = [];

  // // Create a copy of geminiData to work with
  // let modifiedData = {
  //     ...geminiData
  // };

  // // Extract the required array from geminiData
  // const geminiRequired = geminiData.required || [];

  // for (let i = 0; i < geminiRequired.length; i += batchSize) {
  //     // Slice only the required fields while keeping other data intact
  //     const batchRequired = geminiRequired.slice(i, i + batchSize);

  //     // Replace required in the copied object
  //     modifiedData.required = batchRequired;

  //     // console.log(modifiedData, "modifiedData ------------------");
  //     console.log(modifiedData.required, "modifiedData.required ------------------");

  //     // Transform batch data
  //     const requiredFields = await transformAmazonDataToSchema(modifiedData);
  //     console.log(JSON.stringify(requiredFields), "requiredFields ------------------");

  //     // Call Amazon API for transformed data
  //     const requiredData = await geminiApiCallAmazon(csku, requiredFields);
  //     console.log(JSON.stringify(requiredData), "requiredData ------------------");
  //     allRequiredData.push(...requiredData);
  // }
  const issueAttributes = listingAPI.map((issue) => issue.attributeNames[0]);
  console.log(issueAttributes, "issueAttributes ------------------");

  listingAPI.forEach((issue) => {
	const attribute = issue.attributeNames[0];

	if (geminiData.required.includes(attribute)) {
	  delete amazonRequest.attributes[attribute];
	} else {
	  geminiData.required.push(attribute);
	}
  });

  geminiData.required = geminiData.required.filter((attr) =>
	issueAttributes.includes(attr)
  );
  console.log(geminiData.required, "geminiData.required ------------------");

  // Create a copy of geminiData to work with
  let modifiedData = {
	...geminiData,
  };

  // Extract the required array from geminiData
  const geminiRequired = geminiData.required || [];

  // Set all required fields in modifiedData
  modifiedData.required = geminiRequired;

  // Transform data
  const requiredFields = await transformAmazonDataToSchema(modifiedData);
  console.log(
	JSON.stringify(requiredFields),
	"requiredFields ------------------"
  );

  // Check if any property in requiredFields has items.required with length > 2
  const allRequests = [];
  let mainRequest = JSON.parse(JSON.stringify(requiredFields)); // Deep copy

  // Process each property in requiredFields.items.properties
  for (const propKey in requiredFields.items.properties) {
	const property = requiredFields.items.properties[propKey];

	// Check if the property has items.required with length > 2
	if (
	  property.items &&
	  property.items.required &&
	  property.items.required.length > 2
	) {
	  // Create separate request for this property with same structure
	  const separateRequest = {
		description: requiredFields.description,
		type: requiredFields.type,
		items: {
		  type: requiredFields.items.type,
		  properties: {},
		  required: [propKey],
		},
	  };

	  // Add only this property to the separate request
	  separateRequest.items.properties[propKey] = property;

	  // Add to requests array
	  allRequests.push(separateRequest);

	  // Remove this property from the main request
	  delete mainRequest.items.properties[propKey];

	  // Update required in main request
	  const index = mainRequest.items.required.indexOf(propKey);
	  if (index > -1) {
		mainRequest.items.required.splice(index, 1);
	  }
	}
  }

  // Add main request to allRequests if it has any properties left
  if (Object.keys(mainRequest.items.properties).length > 0) {
	allRequests.push(mainRequest);
  }

  // Call Amazon API for each request
  const allRequiredData = [];
  for (const request of allRequests) {
	console.log(JSON.stringify(request), "request ------------------");
	const requiredData = await geminiApiCallAmazon(csku, request);
	console.log(
	  JSON.stringify(requiredData),
	  "requiredData ------------------"
	);
	allRequiredData.push(...requiredData);
  }

  console.log(
	JSON.stringify(allRequiredData),
	"allRequiredData ------------------"
  );

  // Process transformed data
  for (const data of allRequiredData) {
	const attributes = amazonRequest.attributes;

	for (const key in data) {
	  if (Array.isArray(data[key])) {
		attributes[key] = data[key].map((item) => {
		  // Ensure nested structures are handled properly
		  if (typeof item === "object" && !Array.isArray(item)) {
			return { ...item, marketplace_id: destinationSite.globalId };
		  }
		  return item;
		});
	  } else {
		// If it's not an array, assign it directly
		attributes[key] = data[key];
	  }
	}

	amazonRequest.attributes = attributes;
  }

  console.log(
	JSON.stringify(amazonRequest),
	"------------------------------------- request"
  );

  // Call Amazon Listing API
  listingAPI = await createAmazonCatalogue(
	destinationSite,
	destination_account,
	csku?.isku,
	amazonRequest
  );

  // Re-run if the listingAPI has a value
  if (listingAPI) {
	console.log("Listing API returned a value, re-running process...");
	return processListings(
	  amazonRequest,
	  geminiData,
	  listingAPI,
	  destinationSite,
	  destination_account,
	  csku,
	  categoryId
	);
  }
}

module.exports = { configQueue };
