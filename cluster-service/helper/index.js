const connectDB = require("../database/db.js");
const Marketplace = require("../models/marketplace.js");
const ScrapingAntClient = require("@scrapingant/scrapingant-client");
const newRelic = require("newrelic");
const { apiCallLog } = require("./apiCallLog.js");
const { Op } = require("sequelize");
const ScratchProducts = require("../models/scratchProducts.js");
const queueData = require("../models/queueData.js");
const { createBatchProductScrapingQueue } = require("../queues/index.js");
const marketplaceHandlers = require("./handlers/marketplace.handler.js");
const Project = require("../models/project");
const TimedAttributes = require("../models/timedAttributes");
const xpaths = require("../xpaths/xpath.json");
const htmlExtractor = require("./extractors/html.extractor.js");
const { fetchDataFromProxy } = require("./scraping_service/proxy.service.js");
const { groupByMarketplaceId } = require("../utils/index.js");
const {
  fetchNutristarHtmlBatch,
} = require("./scraping_service/nutristar.service.js");
const { cartlowFetch } = require("./handlers/cartlow.handler.js");
const { waiting } = require("../utils/index.js");
connectDB();

/**
 *
 * @param {Array} data List of ScratchProducts data
 * @param {Object} options Options
 * @param {string} password Password
 * @param {string} first_fetch first_fetch
 * @param {string} vendorName vendorName
 * @returns {Array} Array containing html pages
 */
async function fetchHtmlPagesForApiType(
  data,
  options,
  password,
  first_fetch,
  vendorName
) {
  if (!data) return;

  const result = [];
  const client = new ScrapingAntClient({ apiKey: password });

  const request = data.map(async (rowData) => {
    try {
      const marketPlace = await Marketplace.findOne({
        where: { id: rowData.marketplaceId },
        attributes: ["proxy_country", "parentMarketplace"],
      });

      let handlerKey = "default";
      if (vendorName && vendorName.includes("scrapeops"))
        handlerKey = "scrapeops";
      else if (marketPlace.dataValues.parentMarketplace.includes("hathitrust"))
        handlerKey = "hathitrust";

      const handler =
        marketplaceHandlers[handlerKey] || marketplaceHandlers.default;
      await handler({
        rowData,
        marketPlace,
        options,
        password,
        result,
        client,
      });
    } catch (error) {
      console.log(error);
      await apiCallLog(
        "batchProcessingQueue",
        "fetchHtmlPagesForApiType",
        "fetchHtmlPagesForApiType",
        {},
        {},
        { error: error.message },
        "error"
      );
      newRelic.recordCustomEvent("FetchHtmlPagesError", {
        error: error.message,
      });
      throw new Error(error);
    }
  });

  await Promise.all(request);
  return result;
}
/**
 * Refactored extractDataFromHtml using htmlExtractor utilities.
 * @param {Array} htmlBatchData
 * @param {boolean} first_fetch
 * @param {boolean} changeDate
 * @param {boolean} is_frequency
 */
async function extractDataFromHtmlRefactored(
  htmlBatchData,
  first_fetch,
  changeDate,
  is_frequency
) {
  try {
    const finalData = [];
    const timedData = [];
    if (htmlBatchData.length > 0) {
      const projectDetail = await Project.findOne({
        where: { id: htmlBatchData[0].projectId },
      });
      const projectMandatoryAttr =
        projectDetail.dataValues.mandatory_attributes;

      for (let i = 0; i < htmlBatchData.length; i++) {
        const html = htmlBatchData[i].html;
        const marketplace = await Marketplace.findOne({
          where: { id: parseInt(htmlBatchData[i].marketplaceId) },
        });
        try {
          if (!html || html === "") {
            const data = await htmlExtractor.handleEmptyHtml({
              htmlBatchItem: htmlBatchData[i],
              marketplace,
              changeDate,
              TimedAttributes,
            });
            finalData.push(data);
            continue;
          }

          const marketplaceXpaths =
            xpaths[marketplace.dataValues.parentMarketplace].xpaths;
          const { data: extractedData, oufOfStock } =
            htmlExtractor.parseHtmlAndExtractData({
              html,
              xpaths: marketplaceXpaths,
              marketplace,
              htmlBatchItem: htmlBatchData[i],
            });

          const { data: finalizedData, timedData: singleTimedData } =
            htmlExtractor.finalizeDataObject({
              data: extractedData,
              oufOfStock,
              marketplace,
              htmlBatchItem: htmlBatchData[i],
              projectMandatoryAttr,
              first_fetch,
              changeDate,
              is_frequency,
              TimedAttributes,
            });

          finalData.push(finalizedData);
          if (singleTimedData) timedData.push(singleTimedData);
        } catch (error) {
          // Per-product fallback on error
          const fallbackData = htmlExtractor.createFallbackDataObject({
            htmlBatchItem: htmlBatchData[i],
            marketplace,
            is_frequency,
          });
          finalData.push(fallbackData);
          // Optionally log the error per product
          await apiCallLog(
            "scrapeQueue",
            "extractDataFromHtmlRefactored",
            "extractDataFromHtmlRefactored",
            {},
            {},
            { error: error.message, productId: htmlBatchData[i].id },
            "error"
          );
          newRelic.recordCustomEvent("ExtractingError", {
            error: error.message,
            productId: htmlBatchData[i].id,
          });
        }
      }
    }

    return {
      finalData,
      timedData,
    };
  } catch (error) {
    console.error("Error in extracting data from html:", error);
    await apiCallLog(
      "scrapeQueue",
      "extractDataFromHtmlRefactored",
      "extractDataFromHtmlRefactored",
      {},
      {},
      { error: error.message },
      "error"
    );
    newRelic.recordCustomEvent("ExtractingError", { error: error.message });
  }
}

fetchDataFromProxy;

/**
 * Fetches HTML pages for the "proxy" type, batching by vendor/marketplace.
 * @param {Array} products - Array of product objects to process
 * @param {Object} vendors - Vendors configuration object (keyed by marketplaceId)
 * @param {boolean} first_fetch
 * @param {boolean} changeDate
 * @param {boolean} is_frequency
 * @returns {Array} Array of HTML page objects (with rowData)
 */
async function fetchHTMLPagesForProxyType(
  products,
  vendors,
  first_fetch,
  changeDate,
  is_frequency
) {
  if (!products || !Array.isArray(products) || products.length === 0) return [];

  const batches = groupByMarketplaceId(products);
  let htmlPages = [];

  await Promise.all(
    Object.entries(batches).map(async ([vendorId, batchData]) => {
      let i = 0;
      const proxyDetails = vendors[batchData[0].marketplaceId];
      while (i < batchData.length) {
        const data = batchData.slice(i, i + 2);
        const htmlArray = fetchDataFromProxy(
          data,
          proxyDetails,
          first_fetch,
          changeDate,
          is_frequency
        );
        htmlPages.push(...htmlArray);
        i += 2;
      }
    })
  );

  return htmlPages;
}

/**
 * Fetches HTML pages for the "nurtistart" type, batching by vendor/marketplace.
 * @param {Array} products - Array of product objects to process
 * @param {Object} vendors - Vendors configuration object (keyed by marketplaceId)
 * @param {boolean} first_fetch
 * @param {boolean} changeDate
 * @param {boolean} is_frequency
 * @returns {Array} Array of HTML page objects (with rowData)
 */
async function fetchHTMLPagesForNutristarType(
  products,
  vendors,
  first_fetch,
  changeDate,
  is_frequency
) {
  let htmlPages = [];

  const proxyDetails = vendors[products[0].marketPlaceId];

  let i = 0;

  while (i < products.length) {
    const productSlice = products.slice(i, i + 2);
    const htmlArray = await fetchNutristarHtmlBatch(productSlice, proxyDetails);
    htmlPages.push(...htmlArray);
  }

  return htmlPages;
}

/**
 * Fetches price comparison data in batches using cartlowFetch.
 * @param {Array} products
 * @param {Object} compare_marketplaces
 * @returns {Promise<void>}
 */
async function fetchPagesForPriceComparisonType(
  products,
  compare_marketplaces
) {
  let i = 0;
  while (i < products.length) {
    const data = products.slice(i, i + 2);
    try {
      await cartlowFetch(data, compare_marketplaces);
    } catch (err) {
      console.log(err);
      // Optionally, you can add a delay or retry logic here
    }
    i += 2;
  }
}

module.exports = {
  fetchHtmlPagesForApiType,
  fetchHTMLPagesForProxyType,
  fetchHTMLPagesForNutristarType,
  extractDataFromHtmlRefactored,
  fetchPagesForPriceComparisonType,
};
