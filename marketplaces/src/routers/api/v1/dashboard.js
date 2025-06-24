const express = require('express');
const { getProductResearchCount, getOrderCount, getInventoryCount, getCatalogueCount, getInboundCount, getBestSellerProducts, getAccountOrderCount, getOrderStatusCount, getDailySales, getPricePosition, getTopBrands } = require("../../../controllers/api/v1/dashboard");
const { Dashboard,SearchProduct } = require('../../../controllers/api/v1/dashboardNew');

const router = express.Router();

router.get("/get-product-research-count", getProductResearchCount)
router.get("/get-order-count", getOrderCount)
router.get("/get-inventory-count", getInventoryCount)
router.get("/get-catalogue-count", getCatalogueCount)
router.get("/get-inbound-count", getInboundCount)
router.get("/get-inbound-count", getInboundCount)
router.get("/get-best-seller-products", getBestSellerProducts)
router.get("/get-account-order-count", getAccountOrderCount)
router.get("/get-account-status-count", getOrderStatusCount)
router.get("/get-daily-sales", getDailySales)
router.get("/get-price-position", getPricePosition)
router.get("/get-top-brands", getTopBrands)


router.get("/dashboard-new", Dashboard)
router.get("/search-item",SearchProduct)
module.exports = router;