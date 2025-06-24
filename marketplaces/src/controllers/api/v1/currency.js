const axios = require("axios");
const { Op } = require("sequelize");
const Currency = require("../../../models/currency");
const CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CNY",
  "THB",
  "AUD",
  "CAD",
  "AED",
];

const API_URL = "https://open.er-api.com/v6/latest/";

async function fetchConversionRates(baseCurrency) {
  try {
    const response = await axios.get(`${API_URL}${baseCurrency}`);
    return response.data.rates;
  } catch (error) {
    console.error("Error fetching conversion rates:", error.message);
    throw new Error("Failed to fetch conversion rates.");
  }
}

async function storeConversionRates(baseCurrency, rates) {
  try {
    const bulkData = [];

    for (const newCurrency of CURRENCY_CODES) {
      if (newCurrency !== baseCurrency && rates[newCurrency]) {
        bulkData.push({
          currency: baseCurrency,
          value: 1,
          newCurrency,
          newValue: rates[newCurrency],
        });
      }
    }

    for (const data of bulkData) {
      const existingRecord = await Currency.findOne({
        where: {
          currency: data.currency,
          newCurrency: data.newCurrency,
        },
      });

      if (existingRecord) {
        await existingRecord.update({ newValue: data.newValue });
        console.log(`Updated: ${data.currency} to ${data.newCurrency}`);
      } else {
        await Currency.create({
          currency: data.currency,
          value: data.value,
          newCurrency: data.newCurrency,
          newValue: data.newValue,
        });
        console.log(`Created: ${data.currency} to ${data.newCurrency}`);
      }
    }
  } catch (error) {
    console.error("Error storing conversion rates:", error);
    throw new Error("Failed to store conversion rates.");
  }
}

async function updateCurrencyConversions() {
  try {
    for (const baseCurrency of CURRENCY_CODES) {
      console.log(`Fetching rates for base currency: ${baseCurrency}`);
      const rates = await fetchConversionRates(baseCurrency);
      console.log(`Storing rates for base currency: ${baseCurrency}`);
      await storeConversionRates(baseCurrency, rates);
    }
    console.log("Currency conversion rates updated successfully.");
  } catch (error) {
    console.error("Error updating currency conversions:", error);
  }
}

const getCurrency = async (req, res) => {
  try {
    const currencyData = await Currency.findAll({
      where: {
        [Op.or]: [
          { currency: "USD" },
          { currency: "EUR" },
          { currency: "GBP" },
          { currency: "INR" },
          { currency: "CNY" },
          { currency: "THB" },
          { currency: "AUD" },
          { currency: "CAD" },
          { currency: "AED" },
        ],
      },
      attributes: ["currency", "value", "newCurrency", "newValue"],
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: currencyData,
      message: "Currency data fetched successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

const addCurrency = async (req, res) => {
  try {
    const { currency, value, newCurrency, newValue } = req.body;
    const oppositeCurrency = await Currency.findOne({
      where: {
        currency: newCurrency,
        newCurrency: currency,
      },
    });

    if (oppositeCurrency) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: `Opposite currency configuration already exists: ${newCurrency} to ${currency}`,
      });
    }

    // Check if the opposite configuration already exists (newCurrency to currency)
    const oppositeNewCurrency = await Currency.findOne({
      where: {
        currency,
        newCurrency,
      },
    });

    if (oppositeNewCurrency) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: `Opposite currency configuration already exists: ${currency} to ${newCurrency}`,
      });
    }
    const insertData = await Currency.create({
      currency,
      value,
      newCurrency,
      newValue,
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: insertData,
      message: "Currency Added successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.getCurrency = async (req, res) => {
  try {
    let whereCondition = {};

    const { currency, newCurrency } = req.query;
    if (currency !== undefined || newCurrency !== undefined) {
      whereCondition = {
        [Op.or]: [],
      };

      if (currency !== undefined) {
        whereCondition[Op.or].push({ currency });
      }

      if (newCurrency !== undefined) {
        whereCondition[Op.or].push({ newCurrency });
      }
    }
    const currencyData = await Currency.findAll({
      where: whereCondition,
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: currencyData,
      message: "Currency data fetched successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

const deleteCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const deleteData = await Currency.destroy({
      where: { id },
    });
    return res.status(200).json({
      success: true,
      status: 200,
      data: deleteData,
      message: "Currency data deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

const updateCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const { currency, value, newCurrency, newValue } = req.body;
    const [updatedRowsCount, updatedRows] = await Currency.update(
      { currency, newCurrency, value, newValue },
      { where: { id }, returning: true }
    );

    if (updatedRowsCount === 0) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Currency data not found",
      });
    }

    return res.status(200).json({
      success: true,
      status: 200,
      data: updatedRows[0],
      message: "Currency data updated successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

const currencyConvert = async (req, res) => {
  try {
    const { currency, amount, convertedTo } = req.body;
    let convertedValue;
    const findCurrency = await Currency.findOne({
      where: {
        currency,
        newCurrency: convertedTo,
      },
      raw: true,
    });

    if (findCurrency) {
      convertedValue = findCurrency.newValue * amount;
    } else {
      const findCurrencyReverse = await Currency.findOne({
        where: {
          currency: convertedTo,
          newCurrency: currency,
        },
        raw: true,
      });

      if (findCurrencyReverse) {
        convertedValue =
          (findCurrencyReverse.value / findCurrencyReverse.newValue) *
          findCurrencyReverse.value *
          amount;
        console.log(findCurrencyReverse, "findCurrencyReverse");
      } else {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "Currency conversion not available for the given currencies",
        });
      }
    }
    const roundedValue = convertedValue.toFixed(2);

    return res.status(200).json({
      success: true,
      status: 200,
      data: roundedValue,
      message: "Currency conversion successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: error.message,
    });
  }
};

module.exports = {
  updateCurrencyConversions,
  getCurrency,
  updateCurrency,
  addCurrency,
  deleteCurrency,
  currencyConvert,
};
