const Bull = require("bull");
const newRelic = require("newrelic");
const { handleEbaybulkListing } = require("../marketplaceapis/ebay/ebayBulk");
const { handleAmazonBulkUpdate } = require("../marketplaceapis/amazon/amazonBulk");

const bulkUpdateQueue = new Bull("bulkUpdateQueue", {
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
    
    console.log("ebayBatch", ebayBatch);
    console.log("sellerflexBatch", sellerflexBatch);

    if (ebayBatch.length > 0) {
      await handleEbaybulkListing(ebayBatch);
    } else if (sellerflexBatch.length > 0) {
      await handleAmazonBulkUpdate(sellerflexBatch);
    }

  } catch (error) {
    newRelic.recordCustomEvent(
      `Error update quentity and price for cartlow listing Queue:`,
      error
    );
    console.log(error);
  }
});
