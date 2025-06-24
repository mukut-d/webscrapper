const router = require("express").Router();
const {
  CreateCatalogueConfig,
  saveRequestData,
  UpdateCatalogueConfig,
  UpdateActiveInactiveCases,
  GetConfigs,
  GetSingleConfig,
  handleApplyCrossList
} = require("../../../controllers/api/v1/catalogueconfig");

router.post("/create-config", saveRequestData, CreateCatalogueConfig);
router.put ("/update-config", UpdateCatalogueConfig);
router.post("/update-config-status", UpdateActiveInactiveCases);
router.get("/get-configs/:id", GetConfigs)
router.get("/get-config/:id", GetSingleConfig)
router.post("/crosslist", handleApplyCrossList)


module.exports = router;