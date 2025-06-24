const { Op } = require("sequelize");
const connectDB = require("../database/db.js");
const ScratchProducts = require("../models/scratchProducts.js");
const queueData = require("../models/queueData.js");
const newRelic = require("newrelic");
const { apiCallLog } = require("../helper/apiCallLog.js");
const { createBatchProductScrapingQueue } = require("../queues/index.js");

class ApiResponse {
  static success(res, data = {}, message = "Success", status = 200) {
    return res.status(status).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, error = {}, message = "Error", status = 500) {
    return res.status(status).json({
      success: false,
      message,
      error,
    });
  }
}

function ErrorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    console.error("Unexpected Error:", err);
    if (err && err.stack) {
      console.error("Stack Trace:", err.stack);
    }
  }
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred.",
    error: process.env.NODE_ENV !== "production" ? err.message : undefined,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
}

/**
 * @param {string} queueMongoId Pass queueData Mongodb which coming from the queue.
 * @param {string} type Type of the job is either "api" | "proxy"
 * @param {unknown} first_fetch Coming from the job
 * @param {Object} compare_marketplaces Coming from the job
 * @param {unknown} changeDate Coming from the job
 * @param {unknown} is_frequency Coming from the job
 */
async function createBatchAndSendToQueue(
  queueMongoId,
  type,
  first_fetch,
  compare_marketplaces,
  changeDate,
  is_frequency
) {
  try {
    connectDB();
    const batchProcessingQueue = createBatchProductScrapingQueue();

    const queueDatas = await queueData.findById(queueMongoId);
    const products = await ScratchProducts.findAll({
      where: {
        id: {
          [Op.in]: queueDatas.queueData,
        },
      },
      attributes: [
        "id",
        "asin",
        "reason",
        "url",
        "domain",
        "marketplaceId",
        "scrap_count",
        "nextFetch",
        "pushed_in_queue",
        "isScraped",
        "is_failed",
        "projectId",
      ],
      raw: true,
    });

    const vendors = queueDatas.vendors;
    let marketPlaceId = products[0].marketplaceId;
    let vendor = vendors[marketPlaceId.toString()];

    let config = {
      marketPlaceId: marketPlaceId,
      vendor: vendor,
      options: vendor.options,
      password: vendor.password,
      vendorName: vendor.api_url,
    };

    // Shift his code into subprocess.js
    /////////////////////////////////////////
    let i = 0;
    while (i < products.length) {
      const data = products.slice(i, i + 25);

      batchProcessingQueue.add("data_batch", {
        data,
        type,
        options: config.options,
        password: config.password,
        first_fetch,
        vendorName: config.vendorName,
        compare_marketplaces,
        changeDate,
        is_frequency,
        vendors,
      });

      i += 25;
    }
    //////////////////////////////////////////
  } catch (error) {
    console.log(error);
    await apiCallLog(
      "scrapeQueue",
      "createBatchAndSendToQueue",
      "QueueManager",
      {},
      {},
      { error: error.message },
      "error"
    );
    newRelic.recordCustomEvent("CreateBatchError", { error: error.message });
    throw error;
  }
}

const groupByMarketplaceId = (array) => {
  return array.reduce((acc, currentItem) => {
    const marketplaceId = currentItem.marketplaceId;
    const vendorId = vendors[marketplaceId.toString()].id;
    if (!acc[vendorId]) {
      acc[vendorId] = [];
    }
    acc[vendorId].push(currentItem);
    return acc;
  }, {});
};

/**
 * Waits for the specified milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
async function waiting(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  ApiResponse,
  ErrorHandler,
  createBatchAndSendToQueue,
  groupByMarketplaceId,
  waiting,
};
