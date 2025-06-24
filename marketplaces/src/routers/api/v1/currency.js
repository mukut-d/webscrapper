const express = require("express");
const router = express.Router();
const {
  addCurrency,
  getCurrency,
  deleteCurrency,
  updateCurrency,
  currencyConvert,
  updateCurrencyConversions
} = require("../../../controllers/api/v1/currency");
router.post("/create-currency", addCurrency);
router.get("/get-currency", getCurrency);
router.delete("/delete-currency/:id", deleteCurrency);  
router.put("/update-currency/:id", updateCurrency);
router.post("/convert", currencyConvert);
router.post("/update-currency", updateCurrencyConversions)

module.exports = router;
