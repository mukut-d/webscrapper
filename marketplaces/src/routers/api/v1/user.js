const router = require("express").Router();
const {
  getMarketPlaceBasedOnUser,
  loginPage,
  GetProxyDetails
} = require("../../../controllers/api/v1/user");

router.post("/marketplace-user", getMarketPlaceBasedOnUser);
router.post("/login", loginPage);
router.post("/get-proxy-details", GetProxyDetails);





module.exports = router;
