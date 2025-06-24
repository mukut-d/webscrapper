const Bull = require("bull");
const newRelic = require("newrelic");
const { handleEbaybulkListing } = require("../marketplaceapis/ebay/ebayBulk");
const { handleAmazonBulkUpdate } = require("../marketplaceapis/amazon/amazonBulk");
const { parseFiles } = require("../controllers/api/v1/autoLister");

const bulkUpdateQueue = new Bull("autoCreateQueue", {
  redis: {
    host: "localhost",
    port: 6379,
  },
});

bulkUpdateQueue.process(async (job) => {
  try {

    const data = job.data;

    const ebayBatch = data.filter((item) => item.type === "ebay");
    const sellerflexBatch = data.filter((item) => item.type === "sellerflex");
    
    if (ebayBatch.length > 0) {
      await parseFiles("cartlow", ebayBatch, 'amazon', "ebay");
    } else if (sellerflexBatch.length > 0) {
      await parseFiles("cartlow", ebayBatch, 'amazon', "amazon");
    }

  } catch (error) {
    newRelic.recordCustomEvent(
      `Error update quentity and price for cartlow listing Queue:`,
      error
    );
    console.log(error);
  }
});
