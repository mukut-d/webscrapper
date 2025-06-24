const router = require("express").Router();
const {
  GenerateOAuthUrl,
  AddToken, 
  GetAllTokens,
  GenerateAmazonOAuthUrl,
  AddTokenForAmazon,
  GetUserMarketplaces,
  GetAllTokensByGroup,
  GenerateOAuthShopifyUrl,
  GenerateOAuthEtsyUrl
  // AddTokenForWooCommerce
} = require("../../../controllers/api/v1/token");
const axios = require("axios");

router.get("/generate-oauth-url/:id", GenerateOAuthUrl);
router.get("/generate-amz-oauth-url/:id", GenerateAmazonOAuthUrl);
router.get("/generate-oauth-shopify/:shop", GenerateOAuthShopifyUrl);
router.get("/generate-oauth-etsy/:id/:key",GenerateOAuthEtsyUrl);    

router.get("/callback", async (req, res) => {
  const { shop, code } = req.query;

  try {
    return res.status(200).json({
      success: true,
      status: 200,
      code: code,
      shop: shop,
      message: "App successfully installed!",
    });
  } catch (error) {
    console.error(error.data);
    res.status(500).send("Error getting access token");
  }
});

router.post("/add-token", AddToken);
router.post("/add-token-amz", AddTokenForAmazon);
router.get("/get-all-tokens", GetAllTokens);
router.get("/get-group-tokens", GetAllTokensByGroup);
router.get("/get-user-marketplaces/:id", GetUserMarketplaces);
// router.get("/add-wooCommerce-token", AddTokenForWooCommerce);

module.exports = router;
