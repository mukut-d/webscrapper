const {
  GetSellerProfiles,
  RetrieveSellerProfiles,
  CopySellerProfiles,
  GetAllPolicies,
  GetPoliciesCount,
  RetrieveSellerProfilesEtsy,
  getBrands
} = require("../../../controllers/api/v1/master");

const router = require("express").Router();

router.post("/get-user-profiles", GetSellerProfiles);
router.post("/retrieve-seller-profiles", RetrieveSellerProfiles);
router.post("/retrieve-seller-profiles-etsy", RetrieveSellerProfilesEtsy);
router.post("/copy-seller-profiles", CopySellerProfiles)
router.get("/get-all-policies", GetAllPolicies)
router.get("/get-policies-status-count", GetPoliciesCount);
router.get("/get-brand/:userId", getBrands);

module.exports = router;
