const { Worker } = require("bullmq");
const connectDB = require("../database/db");

const ScratchProducts = require("../models/scratchProducts.js");

let defaultUpdateFields = [
  "reason",
  "flipkart_assured",
  "aplus_content",
  "highlights",
  "image_count",
  "limited_time_deal",
  "variant",
  "video_tag",
  "pages",
  "dimensions",
  "image",
  "images",
  "isScraped",
  "mrp",
  "price",
  "scrap_count",
  "totalRatings",
  "totalReviews",
  "rating",
  "bestSellersRank",
  "attributes",
  "category",
  "pushed_in_queue",
  "seller",
  "nextFetch",
  "is_failed",
  "bestSellerRankCategoryOne",
];

// Ensure DB connection
connectDB();

const worker = new Worker(
  "dataProcessingQueue",
  async (job) => {
    try {
      const { processedFinalData, processedTimedData } = job.data;

      // Insert finalData into ScratchProducts
      if (
        processedFinalData &&
        processedFinalData.finalData &&
        processedFinalData.finalData.length > 0
      ) {
        if (processedFinalData.first_fetch === true) {
          defaultUpdateFields.push("title", "brand");
        } else {
          defaultUpdateFields.push("to_be_scraped");
        }

        await ScratchProducts.bulkCreate(processedFinalData.finalData, {
          updateOnDuplicate: defaultUpdateFields,
        });
      }

      // Insert timedData into TimedAttributes
      if (processedTimedData && processedTimedData.timedData) {
        await TimedAttributes.bulkCreate(processedTimedData.timedData, {
          updateOnDuplicate: ["title", "price", "mrp", "brand", "seller"],
        });
      }

      return { status: "success" };
    } catch (err) {
      console.error("Error processing data batch:", err);
      throw err;
    }
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`Data job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Data job ${job.id} has failed with error:`, err);
});
