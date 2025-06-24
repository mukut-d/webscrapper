const router = require("express").Router();
const {
storeShopCategories,
getEbayShopCategoriesDB,
getConditionValues
} = require("../../../controllers/api/v1/shopCategories");

router.post("/store-shop-categories", storeShopCategories);
router.post("/get-shop-categories", getEbayShopCategoriesDB);
router.get("/get-condition-values", getConditionValues);

module.exports = router;