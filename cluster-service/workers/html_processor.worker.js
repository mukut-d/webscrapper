const { Worker } = require("bullmq");
const connectDB = require("../database/db");
const { createDataProcessingQueue } = require("../queues");
const { extractDataFromHtmlRefactored } = require("../helper");

// Ensure DB connection
connectDB();

const worker = new Worker(
  "htmlProcessingQueue",
  async (job) => {
    const dataProcessignQueue = createDataProcessingQueue();

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
      } = job.data;

      const { finalData, timedData } = await extractDataFromHtmlRefactored(
        data,
        first_fetch,
        changeDate,
        is_frequency
      );

      dataProcessignQueue.add("processed-data", {
        processedFinalData: {
          finalData,
          model: "ScratchProducts",
          action: "bulkCreate",
          first_fetch,
        },
        processedTimedData: {
          timedData,
          model: "TimedAttributes",
          action: "bulkCreate",
          first_fetch,
        },
      });

      return { status: "success" };
    } catch (err) {
      console.error("Error processing HTML batch:", err);
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
  console.log(`Job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} has failed with error:`, err);
});
