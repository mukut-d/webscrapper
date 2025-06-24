const router = require("express").Router();
const { createProxyMiddleware } = require('http-proxy-middleware');
const {HttpsProxyAgent} = require('https-proxy-agent');
const {
  GetAllOrders,
  FetchOrders,
  GetLineItem,
  FetchOrderReturn,
  GetShippingCarrierCode,
  FetchCancelRequests,
  FetchOrdersCron,
  GetOrderStatusCount,
  GetDeliveredOrders,
  MarkReadyToShip,
  GetAllOrdersShopify,
  fetchOrderReturnShopify,
  updateStatus,
  // updateWoocommerceStatus,
  refundOrderWoocommerce
} = require("../../../controllers/api/v1/order");

router.get("/get-all-orders", GetAllOrders);
router.post("/get-orders", FetchOrders);
router.post("/get-orders-cron", FetchOrdersCron);
router.put("/update-status", updateStatus);
router.get("/get-line-items/:id", GetLineItem);
router.post("/fetch-returns", FetchOrderReturn);
router.post("/get-shipping-carrier-code", GetShippingCarrierCode);
router.post("/get-cancels", FetchCancelRequests);
router.get("/get-order-status-count", GetOrderStatusCount);
router.post("/get-delivered-orders", GetDeliveredOrders);
router.get("/mark-ready-to-ship", MarkReadyToShip);
// router.post("/refund-woocommerce", refundOrderWoocommerce)
// router.put("/update-woocommerce-status", updateWoocommerceStatus)
router.get("/get-all-orders-shopify", GetAllOrdersShopify);
router.post("/fetch-returns-shopify", fetchOrderReturnShopify);
// router.put("/update-shopify-status", updateShopifyStatus);

const proxyHost = '103.99.33.113';
const proxyPort = 6108;
const proxyUser = 'kqahvuvn';
const proxyPassword = '22suvhg9seb1';

// Add the proxy middleware
router.use('/proxyBing', (req, res, next) => {
  console.log('Proxy middleware is running');
  next();
}, createProxyMiddleware({
  target: 'https://www.bing.com/#!',
  changeOrigin: true,
  ws: true,
  onProxyReq: function (proxyReq) {
    console.log('proxyUser:', proxyUser);
    console.log('proxyPassword:', proxyPassword);
    const authHeader = 'Basic ' + Buffer.from(proxyUser + ':' + proxyPassword).toString('base64');
    console.log('Proxy-Authorization header:', authHeader);
    proxyReq.setHeader('Proxy-Authorization', authHeader);
    console.log('Proxy request is being sent');
  },
  onProxyRes: function (proxyRes) {
    console.log('Proxy response received');
  },
  agent: new HttpsProxyAgent('http://' + proxyUser + ':' + proxyPassword + '@' + proxyHost + ':' + proxyPort),
}));


router.use('/proxyGoogle', (req, res, next) => {
  console.log('Proxy middleware is running');
  next();
}, createProxyMiddleware({
  target: 'https://www.google.com/',
  changeOrigin: true,
  ws: true,
  onProxyReq: function (proxyReq) {
    console.log('proxyUser:', proxyUser);
    console.log('proxyPassword:', proxyPassword);
    const authHeader = 'Basic ' + Buffer.from(proxyUser + ':' + proxyPassword).toString('base64');
    console.log('Proxy-Authorization header:', authHeader);
    proxyReq.setHeader('Proxy-Authorization', authHeader);
    console.log('Proxy request is being sent');
  },
  onProxyRes: function (proxyRes) {
    console.log('Proxy response received');
  },
  agent: new HttpsProxyAgent('http://' + proxyUser + ':' + proxyPassword + '@' + proxyHost + ':' + proxyPort),
}));


router.use('/proxyCheck', (req, res, next) => {
  console.log('Proxy middleware is running');
  next();
}, createProxyMiddleware({
  target: 'https://nordvpn.com/what-is-my-ip/',
  changeOrigin: true,
  ws: true,
  onProxyReq: function (proxyReq) {
    console.log('proxyUser:', proxyUser);
    console.log('proxyPassword:', proxyPassword);
    const authHeader = 'Basic ' + Buffer.from(proxyUser + ':' + proxyPassword).toString('base64');
    console.log('Proxy-Authorization header:', authHeader);
    proxyReq.setHeader('Proxy-Authorization', authHeader);
    console.log('Proxy request is being sent');
  },
  onProxyRes: function (proxyRes) {
    console.log('Proxy response received');
  },
  agent: new HttpsProxyAgent('http://' + proxyUser + ':' + proxyPassword + '@' + proxyHost + ':' + proxyPort),
}));


router.use('/ebayGlobal', (req, res, next) => {
  console.log('Proxy middleware is running');
  next();
}, createProxyMiddleware({
  target: 'https://www.ebayglobalshipping.com/',
  changeOrigin: true,
  ws: true,
  onProxyReq: function (proxyReq) {
    console.log('proxyUser:', proxyUser);
    console.log('proxyPassword:', proxyPassword);
    const authHeader = 'Basic ' + Buffer.from(proxyUser + ':' + proxyPassword).toString('base64');
    console.log('Proxy-Authorization header:', authHeader);
    proxyReq.setHeader('Proxy-Authorization', authHeader);
    console.log('Proxy request is being sent');
  },
  onProxyRes: function (proxyRes) {
    console.log('Proxy response received');
  },
  agent: new HttpsProxyAgent('http://' + proxyUser + ':' + proxyPassword + '@' + proxyHost + ':' + proxyPort),
}));

module.exports = router;
