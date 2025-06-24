const MarketPlace = require("../../../models/marketplace");
const Tokens = require("../../../models/tokens");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const ebay = require("ebay-api");
const moment = require("moment");
const axios = require("axios");
const ShopCategory = require("../../../models/shopCategories");

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

exports.storeShopCategories = async (req, res) => {
  const { userId, marketplaceId, accountName } = req.body;
  const marketplace = await MarketPlace.findOne({
    where: {
      id: marketplaceId,
    },
  });
  if (!marketplace) {
    return res.status(404).json({
      success: false,
      message: "Marketplace not found",
    });
  }
  const token = await Tokens.findOne({
    where: {
      userId: userId,
      marketPlaceId: marketplaceId,
      accountName: accountName,
    },
  });
  if (marketplace.url.includes("ebay")) {
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });

    eBay.OAuth2.setCredentials(token.token);
    let startDate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startDate.diff(tokenExpiresDate, "hours");

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token);
    }
    const shopCategories = await getEbayShopCategories(
      eBay,
      accountName,
      userId,
      token
    );
    return res.status(200).json({
      success: true,
      shopCategories,
    });
  } else if (marketplace.url.includes("etsy")) {
    const shopCategories = await getEtsyShopCategories(
      accountName,
      userId,
      token
    );
    return res.status(200).json({
      success: true,
      shopCategories,
    });
  } else {
    return res.status(404).json({
      success: false,
      message: "Marketplace not supported",
    });
  }
};

const getEbayShopCategories = async (eBay, accountName, userId, token) => {
  try {
    const response = await eBay.trading.GetStore();
    console.log("GetStore Response:", response);
    if (response.Ack === "Success") {
      const categories = response.Store.CustomCategories.CustomCategory;
      console.log(JSON.stringify(categories, null, 2));

      for (const category of categories) {
        if (category)
          await ShopCategory.create({
            user_id: userId,
            marketplace_id: token.dataValues.marketPlaceId,
            account_name: accountName,
            shop_category_id: category.CategoryID,
            title: category.Name,
          });
      }
      return categories;
    } else {
      throw new Error("Failed to fetch eBay shop categories");
    }
  } catch (error) {
    console.error("Error fetching eBay shop categories:", error);
    throw error;
  }
};

const getEtsyShopCategories = async (accountName, userId, token) => {
  try {
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshTokenEtsy(token);
    }
    let access_token = token.dataValues.token;
    const id = access_token.split(".")[0];
    let response;

    try {
      response = await axios.get(
        `https://openapi.etsy.com/v3/application/users/${id}/shops`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-api-key": token.dataValues.client_id,
          },
        }
      );

      console.log("Shop Details:", response.data.shop_id);
    } catch (error) {
      if (error.response) {
        console.error("Error:", error.response.status, error.response.data);
      } else if (error.request) {
        console.error("No response:", error.request);
      } else {
        console.error("Error:", error.message);
      }
      return; // Exit on error
    }

    let shopId = response.data.shop_id;
    response = await axios.get(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/sections`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "x-api-key": token.dataValues.client_id,
          "Content-Type": "application/json",
        },
      }
    );
    const categories = response.data.results;
    console.log(categories);
    for (const category of categories) {
      await ShopCategory.create({
        user_id: userId,
        marketplace_id: token.dataValues.marketPlaceId,
        account_name: accountName,
        shop_category_id: category.shop_section_id,
        title: category.title,
      });
    }
    return categories;
  } catch (error) {
    console.error("Error fetching Etsy shop categories:", error);
    throw error;
  }
};

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.dataValues.refreshToken,
      scopes
    );

    console.log(newToken);
    if (JSON.parse(newToken).error) {
      token.status = "inactive";
      await token.save();

      const nodemailer = require("nodemailer");

      // Create a transporter
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
        where: { id: token.dataValues.userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: "Token Expired!",
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`,
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error);
            console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
      console.log(newToken.error);
      throw newToken.error;
    }

    const accessToken = JSON.parse(newToken);
    console.log(accessToken);
    eBay.OAuth2.setCredentials(accessToken.access_token);
    // token.token = accessToken.access_token
    const lastTokenRefreshDate = moment()
      .add(5, "hours")
      .add(30, "minutes")
      .toISOString();
    await Tokens.update(
      {
        token: accessToken?.access_token,
        lastTokenRefreshDate: lastTokenRefreshDate,
      },
      {
        where: {
          id: token?.dataValues?.id || token?.id,
        },
      }
    );
    // await token.save()
  } catch (error) {
    console.log(error);
    throw error;
  }
}

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
    token.lastTokenRefreshDate = new Date();
    await token.save();

    console.log("Token refreshed successfully.");
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};

exports.getEbayShopCategoriesDB = async (req, res) => {
  try {

    const { userId, marketplaceId, accountName } = req.body;
    const shopCategories = await ShopCategory.findAll({
      where: {
        user_id: userId,
        marketplace_id: marketplaceId,
        account_name: accountName,
      },
    });

    if (shopCategories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No shop categories found",
      });
    }

    const response = shopCategories.map((category) => ({
      id: category.id,
      shop_category_id: category.shop_category_id,
      title: category.title,
    }));

    return res.status(200).json({
      success: true,
      response,
    });

  } catch (error) {
    console.error("Error fetching eBay shop categories from DB:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getConditionValues = async (req, res) => {
  try {

    const conditions = [
      { id: 1000, name: "New" },
      { id: 1500, name: "New Other" },
      { id: 1750,	name: "New with defects" },
      { id: 3000, name: "Used" },
      { id: 4000, name: "Used Very Good" },
      { id: 5000, name: "Used Good" },
      { id: 6000, name: "Used Acceptable" },
      { id: 7000, name: "	For parts or not working" },
    ];

    return res.status(200).json({
      success: true,
      conditions,
    });

  } catch (error) {
    console.error("Error fetching condition values:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}