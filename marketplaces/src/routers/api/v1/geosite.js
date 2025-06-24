const express = require("express");
const router = express.Router();
const {addGeosite,getGeosites,deleteGeosite,updateGeosite,getGeositesById}=require('../../../controllers/api/v1/geosite')

router.post("/create-geosite", addGeosite);
router.get("/get-geosite", getGeosites);
router.delete("/delete-geosite/:id", deleteGeosite);
router.put("/update-geosite/:id", updateGeosite);
router.get("/get-geosite-by/:id", getGeositesById);

module.exports = router;