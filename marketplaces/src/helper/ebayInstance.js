const ebay = require("ebay-api");

const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    autoRefreshToken: true,
    devId: process.env.DEV_ID,
});

module.exports = eBay;