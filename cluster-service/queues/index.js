const { Queue } = require("bullmq");

/**
 * @returns queue instance of projectScrapingQueue
 */
function createBatchProductScrapingQueue() {
  const queue = new Queue("batchProcessingQueue", {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });

  return queue;
}

/**
 * @returns queue instance of htmlProcessingQueue
 */
function createHtmlProcessingQueue() {
  const queue = new Queue("htmlProcessingQueue", {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });

  return queue;
}

/**
 * @returns queue instance of dataProcessingQueue
 */
function createDataProcessingQueue() {
  const queue = new Queue("dataProcessingQueue", {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });

  return queue;
}

/**
 * @returns queue instance of retryQueue
 */
function createRetryQueue() {
  const queue = new Queue("retryQueue", {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });

  return queue;
}

module.exports = {
  createRetryQueue,
  createHtmlProcessingQueue,
  createDataProcessingQueue,
  createBatchProductScrapingQueue,
};
