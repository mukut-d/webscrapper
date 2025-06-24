const path = require("path");
const fs = require("fs");
const math = require("mathjs");
const { getFormulaForCurrency } = require("./utilityFunctions");
// const PricingFormula = require('../models/formulaConfigs');

async function convertPriceByFormula({
  clientName,
  price,
  baseCurrency,
  targetCurrency,
}) {
  try {
    // Load and parse the JSON configuration file
    const priceFormula = await getFormulaForCurrency(
      clientName,
      baseCurrency,
      targetCurrency
    );

    // Default to the original price if no formula is found
    if (!priceFormula) {
      return price;
    }

    // Safely evaluate the formula using math.js
    try {
      const updatedPrice = math.evaluate(priceFormula, { price });
      return updatedPrice;
    } catch (error) {
      console.error("Price conversion failed one");
      // Return the original price if formula evaluation fails
      return price;
    }
  } catch (error) {
    throw new Error("Price conversion failed");
  }
}

module.exports = convertPriceByFormula;
