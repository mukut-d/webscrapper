const {
  CreateMerchantLocation,
  GetMerchantLocations,
  GetMerchantLocationById,
  UpdateMerchantLocation,
  DeleteMerchantLocation,
  FetchMerchantLocations,
  GetMerchantLocationsByAccountNameAndUserId,
  CreateGPSRForEbay,
  GetGPSR
} = require("../../../controllers/api/v1/merchantLocation");

const router = require("express").Router();

router.post("/create-merchant-location", CreateMerchantLocation);
router.get("/get-merchant-locations", GetMerchantLocations);
router.get("/get-merchant-location/:id", GetMerchantLocationById);
router.post("/get-merchant-locations/:userId", GetMerchantLocationsByAccountNameAndUserId);
router.put("/update-merchant-location/:id", UpdateMerchantLocation);
router.delete("/delete-merchant-location/:id", DeleteMerchantLocation);
router.post("/fetch-merchant-location", FetchMerchantLocations);
router.post("/create-gpsr",CreateGPSRForEbay)
router.get("/get-gpsr-details",GetGPSR)

module.exports = router;