const EbayAuthToken = require("ebay-oauth-nodejs-client");
const ebay = require("ebay-api");
const ebayAuthToken = new EbayAuthToken({
  clientId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
  clientSecret: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
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

// paste refresh token here
// const token =
//   "v^1.1#i^1#r^1#p^3#I^3#f^0#t^Ul4xMF83OjUwMjc2RUVGMDQxNzE0RkVBM0VCNDk0RjIzNzJEMTY4XzBfMSNFXjI2MA==";

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token,
      scopes
    );
    console.log(newToken, "newToken");
    const parsedToken = JSON.parse(newToken);
    const accessToken = parsedToken.access_token;
    console.log(accessToken, "accessToken");
    return accessToken;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

const eBay = new ebay({
  appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
  certId: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
  sandbox: false,
  devId: process.env.DEV_ID,
  autoRefreshToken: true,
  //   acceptLanguage: eBayApi.Locale[localValue],
  //   contentLanguage: eBayApi.Locale[localValue],
});

const generateToken = async (req, res) => {
  const token = req.query.token;
  let refreshData = await refreshToken(eBay, token);
  console.log("refreshData: ", refreshData);

  res.json(refreshData);
};
 

module.exports = {generateToken};