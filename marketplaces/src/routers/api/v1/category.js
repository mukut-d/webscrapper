const express = require("express");
const router = express.Router();
const {getMarketPlaceCategories, FetchStoreCategories, getStoreCategories, fetchMarketPlaceCategories} = require("../../../controllers/api/v1/category");
const {
  getRootSubcategories,
  getCategoryById,
} = require("../../../controllers/api/v1/category");
const { fetchwalmartCategories } = require("../../../marketplaceapis/walmart/category");

router.post('/get', getMarketPlaceCategories)
router.get("/fetch-category", fetchMarketPlaceCategories);

router.post("/fetch-store-categories", FetchStoreCategories);
router.post('/get-store-categories', getStoreCategories)

// GET /categories/rootSubcategories
router.get("/rootSubcategories", getRootSubcategories);
router.post('/fetch-walmart-categories' , fetchwalmartCategories)

// GET /categories/:id
router.get("/:id", getCategoryById);
module.exports = router;