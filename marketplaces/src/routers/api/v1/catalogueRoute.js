const router = require("express").Router();
const {CreateCatalogue,
    GetCatalogue,
    CheckItemCompatibility,
    getCompatibilityData,
    getAllMakes,
    getAllModels,
    getAllSubModels,
    getAllTrims,
    getAllYears
} =require('../../../controllers/api/v1/catalogueController')

router.post("/create-catalogue",CreateCatalogue );
router.get("/get-catalogue",GetCatalogue );
router.post("/check-item-compatibility", CheckItemCompatibility)
router.get("/get-compantibility-data", getCompatibilityData);
router.get("/get-all-makes", getAllMakes);
router.get("/get-all-models", getAllModels);
router.post("/get-all-sub-models", getAllSubModels);
router.post("/get-all-trims", getAllTrims);
router.post("/get-all-years", getAllYears);

module.exports = router;
 