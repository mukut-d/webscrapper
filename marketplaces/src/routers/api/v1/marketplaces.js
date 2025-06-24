const router = require("express").Router();

const {
  View,
  detailsBasedOnProjectId,
  getMarketplaceFormConfig
} = require("../../../../src/controllers/api/v1/marketplaces");

router.get("/", async function (req, res) {
  View(req, res);
});

router.post("/projectId", async function (req, res) {
  detailsBasedOnProjectId(req, res);
});

router.post("/get-marketplace-from-config", getMarketplaceFormConfig);

module.exports = router;
