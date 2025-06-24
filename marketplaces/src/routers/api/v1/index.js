const router = require("express").Router();

router.use("/uploadfile", require("./uploadfile"));
router.use("/marketplaces", require("./marketplaces"));
router.use("/projects", require("./project"));
router.use("/product", require("./product"));
router.use("/category", require("./category"));
router.use("/token", require("./token"));
router.use("/catalogue", require("./catalogue"));
router.use("/order", require("./order"));
router.use("/excel", require("./excel"));
router.use("/master", require("./master"));
router.use("/users", require("./user"));
router.use("/inbound", require("./inbound"));
router.use("/fetch", require("./fetch.js"));
router.use("/catalogue-v1", require("./catalogueRoute.js"));
router.use("/currency", require("./currency.js"));
router.use("/geosite", require("./geosite.js"));
router.use("/inventory", require("./inventory.js"));
router.use("/messages", require("./messages.js"));
router.use("/merchantLocation", require("./merchantLocation"));
router.use("/generateToken", require("./generateToken"));
router.use("/dashboard", require("./dashboard.js"))
router.use("/bulk-upload-history", require("./bulkuploadHistory.js"))
router.use("/listing", require("./autoLister.js"));
router.use("/sellerFlex", require("./sellerFlex"));
router.use("/config", require("./catalogue-config.js"))

router.use("/automessage", require("./automessage"));
router.use("/helper", require("./helper"));

// router.use("/test", require("./test"));

router.use("/templates", require("./template"));
router.use("/prompts", require("./prompts"));
router.use("/relist", require("./relist"));
router.use("/mapping", require("./mapping"));
router.use("/shop-category", require("./shop-categories"));
router.use("/similar-product", require("./scrape-similar"));

module.exports = router;
