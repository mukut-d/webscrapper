const { Worker } = require("bullmq");
const connectDB = require("../database/db.js");
const { createHtmlProcessingQueue } = require("../queues/index.js");
const {
  fetchHtmlPagesForApiType,
  fetchHTMLPagesForProxyType,
  fetchHTMLPagesForNutristarType,
} = require("../helper/index.js");

connectDB();

const htmlProcessingQueue = createHtmlProcessingQueue();

const worker = new Worker(
  "batchProcessingQueue",
  async (job) => {
    try {
      const {
        data,
        type,
        options,
        password,
        first_fetch,
        vendorName,
        compare_marketplaces,
        changeDate,
        is_frequency,
        vendors,
      } = job.data;

      let htmlArray;

      if (type === "api") {
        htmlArray = fetchHtmlPagesForApiType(
          data,
          options,
          password,
          first_fetch,
          vendorName,
          type
        );
      }

      if (type === "proxy") {
        htmlArray = fetchHTMLPagesForProxyType(
          data,
          vendors,
          first_fetch,
          changeDate,
          is_frequency
        );
      }

      if (type === "nutristar") {
        htmlArray = fetchHTMLPagesForNutristarType(
          data,
          vendors,
          first_fetch,
          changeDate,
          is_frequency
        );
      }

      // Complete this code
      if (type === "price_comparison") {
        htmlArray = fetchHTMLPagesForNutristarType(
          data,
          vendors,
          first_fetch,
          changeDate,
          is_frequency
        );
      }

      // Start doing for the rest

      await htmlProcessingQueue.add("html_batch", {
        data: htmlArray,
        first_fetch,
        changeDate,
        is_frequency,
      });

      return { status: "forwarded to htmlQueue", count: data.length };
    } catch (err) {
      console.error("Error processing batch:", err);
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
  console.log(`Batch job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Batch job ${job.id} has failed with error:`, err);
});
