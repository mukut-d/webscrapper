const MerchantLocation = require("../../../models/merchantLocation");
const { v4: uuidv4 } = require("uuid");
const { Op, Sequelize, json } = require("sequelize");
const Marketplace = require("../../../models/marketplace");
const Tokens = require("../../../models/tokens");
const ebay = require("ebay-api");
const moment = require("moment");
const csvtojson = require("csvtojson");
const { sequelize } = require("../../../database/config");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
// import puppeteer from 'puppeteer';
const puppeteer = require("puppeteer");
const {apiCallLog}=require("../../../helper/apiCallLog")
const Gpsr = require("../../../models/gpsr")

const ebayAuthToken = new EbayAuthToken({
  clientId: process.env.APP_ID,
  clientSecret: process.env.CERT_ID,
});

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

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.dataValues.refreshToken,
      scopes
    );

    if (JSON.parse(newToken).error) {
      token.status = "inactive";
      await token.save();

      const nodemailer = require('nodemailer');

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password // Replace with your SMTP password
        }
      });

      const userData = await User.findOne({ where: { id: token.dataValues.userId } });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: 'aditya@mergekart.com', // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: 'Token Expired!',
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`,
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error);
            console.log(error);
          }
          console.log('Message sent: %s', info.messageId);
        });
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
      console.log(newToken.error);
      throw newToken.error;
    }

    console.log(newToken, "newToken");
    const accessToken = JSON.parse(newToken);
    eBay.OAuth2.setCredentials(accessToken.access_token);
    token.token = accessToken.access_token;
    token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
    await token.save();
  } catch (error) {
    console.log(error);
    throw error;
  }
}

exports.CreateMerchantLocation = async (req, res) => {
  try {
    const merchantLocationKey = uuidv4();

    let {
      accountName,
      addLine1,
      addLine2,
      city,
      country,
      marketPlaceId,
      phone,
      postalCode,
      state,
      userId,
      locationName: name
    } = req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId,
      },
    });

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    if (marketPlace.url?.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      const date = moment(req.body.date);
      const tokenupdatedate = moment(token.dataValues.updatedAt);
      eBay.OAuth2.setCredentials(token.dataValues.token);
      if (date.diff(tokenupdatedate, "hours") >= 3) {
        await refreshToken(eBay, token);
      }

      try {
        await eBay.sell.inventory.createInventoryLocation(merchantLocationKey, {
          location: {
            address: {
              addressLine1: addLine1,
              addressLine2: addLine2,
              city: city,
              stateOrProvince: state,
              postalCode: postalCode,
              country: country,
            },
          },
          phone: phone,
          merchantLocationStatus: "ENABLED",
          name: name,
        });

        console.log("Inventory location created successfully");

        try {
          const newMerchantLocation = await MerchantLocation.create({
            accountName,
            addLine1,
            addLine2,
            city,
            country,
            marketPlaceId,
            phone,
            postalCode,
            state,
            userId,
            name,
            merchantLocationKey,
          });

          console.log(
            "MerchantLocation created successfully:",
            newMerchantLocation
          );
          res.json(newMerchantLocation);
        } catch (error) {
          console.error("Error creating MerchantLocation:", error);
          throw error;
        }
      } catch (error) {
        console.error("Error creating inventory location:", error);
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "An error occurred while creating the merchant location",
      message: error.message,
    });
  }
};

exports.GetMerchantLocations = async (req, res) => {
  try {
    const merchantLocations = await MerchantLocation.findAll();
    res.json(merchantLocations);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching merchant locations' });
  }
};

exports.GetMerchantLocationById = async (req, res) => {
  try {
    const merchantLocation = await MerchantLocation.findByPk(req.params.id);
    res.json(merchantLocation);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching the merchant location' });
  }
};

exports.GetMerchantLocationsByAccountNameAndUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    let { accountName } = req.body;
    let response = {}
    if (Array.isArray(accountName)) {
      await Promise.all(accountName?.map(async(account)=>{
        const merchantLocations = await MerchantLocation.findAll({
          where: { accountName : account, userId },
        });

        // console.log(merchantLocations)
        response[account] = merchantLocations?.map((merchantLoc)=>merchantLoc.dataValues) ;
      }))
    }
    else{
      const merchantLocations = await MerchantLocation.findAll({
        where: { accountName : accountName, userId },
      });
      response = merchantLocations
    }
    if (Object.keys(response)?.length === 0|| !Array.isArray(response)?.length === 0) {
        // Structured not found response
        return res.status(404).json({
          success: false,
          message: "No merchant locations found",
          data: [],
        });   
    } 
     return  res.status(200).json({
      success: true,
      message: "Merchant locations found",
      data: response,
    });
  } catch (error) {
    // Structured error response
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the merchant locations",
      error: error.message,
    });
  }
};


exports.UpdateMerchantLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { addLine1, addLine2, city, state, country, postalCode, name, phone, marketPlaceId, userId,  accountName} = req.body;
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId,
      },
    });

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName,
      },
    });
    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }
    if (marketPlace.url?.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      const date = moment(req.body.date);
      const tokenupdatedate = moment(token.dataValues.updatedAt);
      eBay.OAuth2.setCredentials(token.dataValues.token);
      if (date.diff(tokenupdatedate, "hours") >= 3) {
        await refreshToken(eBay, token);
      }

      const merchantLocationKey = await MerchantLocation.findOne({
        where: {
          id: id
        },
        attributes: ['merchantLocationKey']
      })

      const key = merchantLocationKey.dataValues.merchantLocationKey;
      await eBay.sell.inventory.updateInventoryLocation(key, {
        location: {
          address: {
            addressLine1: addLine1,
            addressLine2: addLine2,
            city: city,
            stateOrProvince: state,
            postalCode: postalCode,
            country: country,
          },
        },
        phone: phone,
        // merchantLocationStatus: "ENABLED",
        name: name,
      });

      await MerchantLocation.update(req.body, {
        where: { id: id },
      });
      const updatedData = await MerchantLocation.findOne({
        where: {
          id: id
        }
      });
      res.json({ success: "Merchant location updated", data: updatedData });
    }
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while updating the merchant location', details: error });
  }
};

exports.DeleteMerchantLocation = async (req, res) => {
  try {
    await MerchantLocation.destroy({
      where: { id: req.params.id },
    });
    res.json({ success: "Merchant location deleted" });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while deleting the merchant location' });
  }
};

exports.FetchMerchantLocations = async (req, res) => {
  const functionName="FetchMerchantLocations";
  try {

    const { accountName, userId, marketplaceId } = req.body;

    const token = await Tokens.findOne({ where: { accountName: accountName, userId: userId, marketPlaceId: marketplaceId } });
    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Token not found"
      });
    }
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });
    let startdate = moment().add(5, 'hours').add(30, 'minutes');  
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);  
    let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference > 2) {
      await refreshToken(eBay,token)
     }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   eBay.OAuth2.setCredentials(token.dataValues.token);
    //   await apiCallLog("GetTokenStatus","/merchantLocation/fetch-merchant-location",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/merchantLocation/fetch-merchant-location",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      await refreshToken(eBay, token);
    //   const updatedToken = await Tokens.findOne({
    //     where: {
    //       userId: userId,
    //       marketPlaceId: marketPlaceId,
    //       accountName: account,
    //     },
    //   });
    //   eBay.OAuth2.setCredentials(updatedToken?.dataValues?.token);
    // }

    const merchantLocations = [];
    let offset = 0;
    const data = await eBay.sell.inventory.getInventoryLocations({
      limit: 100,
      offset: offset
    });

    merchantLocations.push(...data.locations);

    while (merchantLocations.length < data.total) {
      offset += 100;
      const data = await eBay.sell.inventory.getInventoryLocations({
        limit: 100,
        offset: offset
      });

      merchantLocations.push(...data.locations);
    }

    const existingLocationKeys = await MerchantLocation.findAll({
      attributes: ['merchantLocationKey'],
      where: {
        [Op.and]: [
          { merchantLocationKey: { [Op.in]: merchantLocations.map(location => location.merchantLocationKey) } },
          { accountName: { [Op.eq]: accountName } },
          { userId: { [Op.eq]: userId } }
        ]
      }
    }).then(locations => locations.map(location => location.merchantLocationKey));

    const newMerchantLocations = merchantLocations.filter(location =>
      !existingLocationKeys.includes(location.merchantLocationKey)
    );

    const transformedMerchantLocations = newMerchantLocations.map(location => {
      return {
        accountName: accountName,
        userId: userId,
        addLine1: location.location.address.addressLine1,
        addLine2: location.location.address.addressLine2,
        city: location.location.address.city,
        state: location.location.address.stateOrProvince,
        postalCode: location.location.address.postalCode,
        country: location.location.address.country,
        phone: location.phone,
        merchantLocationKey: location.merchantLocationKey,
        marketplaceId: marketplaceId
      };
    });

    try {
      const data = await MerchantLocation.bulkCreate(transformedMerchantLocations);
      console.log("Success: ", data);
    } catch (error) {
      console.log("Failed: ", error)
    }
    return res.status(200).json({ success: true, message: "Location fetched successfully.", data: merchantLocations });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

exports.CreateGPSRForEbay = async (req, res) => {
  try {
    const {
      company_name,
      contact_url,
      email,
      phone,
      street1,
      street2,
      postal_code,
      city,
      state,
      country,
      type,
      account_name,
      userId,
      marketplace_id,
    } = req.body;
    if (!userId || !marketplace_id || !account_name){
      return res.status(400).json({ success: false, error:"Required fields missing" });
    }

    const newGpsr = await Gpsr.create({
      company_name,
      contact_url,
      email,
      phone,
      street1,
      street2,
      postal_code,
      city,
      state,
      country,
      type,
      account_name,
      userId,
      marketplace_id,
    });

    res.status(201).json({ success: true, data: newGpsr });
  } catch (error) {
    console.error("Error creating GPSR:", error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};

exports.GetGPSR = async (req, res) => {
  try {
    const { userId, account_name, marketplace_id } = req.query;

    const gpsrRecords = await Gpsr.findAll({
      where: {
        userId,
        account_name,
        marketplace_id,
      },
    });

    res.status(200).json({ success: true, data: gpsrRecords });
  } catch (error) {
    console.error("Error fetching GPSR:", error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};