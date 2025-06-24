const Tokens = require("../models/tokens");
const newRelic = require('newrelic')
const EbayAuthToken = require('ebay-oauth-nodejs-client')
const moment = require('moment')


const ebayAuthToken = new EbayAuthToken({
    clientId: process.env.APP_ID,
    clientSecret: process.env.CERT_ID
  })

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.reputation',
    'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.stores',
    'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
  ]

exports.refreshTokenEbay = async (eBay, token) => {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.refreshToken,
      scopes
    );

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
        where: { id: token.userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData?.email,
          subject: "Token Expired!",
          text: `Token for account name ${token?.accountName} associated with user ${userData?.email} has expired. Please login to your account and reauthorize the token.`,
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
    token.token = accessToken.access_token
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

    return accessToken?.access_token;
    // await token.save()
  } catch (error) {
    newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`);
    console.log(error);
    throw error;
  }
};

exports.refreshTokenEtsy = async (token) => {
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