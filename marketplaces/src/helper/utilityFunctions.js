const fs = require("fs");
const path = require("path");

//ANCHOR - function to get client config details
async function getConfigForClient(clientName) {
  // Load and parse the JSON configuration file
  const configFilePath = path.join(__dirname, "../configs/index.json");
  const config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));

  // Access the configuration for the specified client name
  const clientConfig = config[clientName];

  if (!clientConfig) {
    throw new Error(`Configuration for client "${clientName}" not found.`);
  }

  return clientConfig;
}

//ANCHOR - function to extract Domains
const extractDomains = (asinStatus) => {
  // Define a regular expression to match domain names
  const domainRegex = /(?:Amazon\.([a-z.]+))/g;

  // Find all matches in the ASIN Status column
  const matches = [...asinStatus.matchAll(domainRegex)];

  // Extract the domains from the matches
  const domains = matches.map((match) => `amazon.${match[1]}`);

  return domains;
};

//ANCHOR - function to get Formula For Currency
async function getFormulaForCurrency(clientName, baseCurrency, targetCurrency) {
  const config = await getConfigForClient(clientName);

  // Check if the client has currency conversions
  if (config && config.currencyConversions) {
    const conversion = config.currencyConversions.find(
      (conv) => conv.base === baseCurrency && conv.target === targetCurrency
    );

    if (conversion) {
      return conversion.formula;
    } else {
      throw new Error(
        `No conversion found for base currency "${baseCurrency}" to target currency "${targetCurrency}"`
      );
    }
  } else {
    throw new Error(`No currency conversions found for client "${clientName}"`);
  }
}

//ANCHOR - function to get Formula For by category
async function getFormulaForcategory(clientName, category) {
  const config = await getConfigForClient(clientName);

  // Check if the client has currency conversions
  if (config && config?.currencyConversions) {
    // Find the conversion for the specific category
    let conversion = config?.currencyConversions.find(
      (conv) => conv?.category.toLowerCase() === category.toLowerCase()
    );

    // If the category-specific conversion is not found, fall back to 'default'
    if (!conversion) {
      conversion = config?.currencyConversions.find(
        (conv) => conv?.category === "default"
      );
    }

    // If a conversion is found, return the formula
    if (conversion) {
      return conversion.formula;
    } else {
      throw new Error(
        `No formula found for category "${category}" or default.`
      );
    }
  } else {
    throw new Error(
      `No currency conversions found for client "${clientName}".`
    );
  }
}

module.exports = {
  getConfigForClient,
  extractDomains,
  getFormulaForCurrency,
  getFormulaForcategory,
};
