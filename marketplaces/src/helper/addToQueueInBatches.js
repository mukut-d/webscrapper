const Bull = require("bull");
const axios = require("axios");

async function addToQueueInBatches(queueName, data, batchSize) {
  if (!batchSize) {
    throw new Error("batchSize must be provided");
  }

  // const bulkUpdateQueue = new Bull(queueName, {
  //   redis: {
  //     host: "localhost",
  //     port: 6379,
  //   },
  // });


  // for (let i = 0; i < data.length; i += batchSize) {
  const batch = data
  // .slice(i, i + batchSize);
  // await bulkUpdateQueue.add(batch);
  const response = await axios.post("http://localhost:8000/queueManager", {
    data: batch,
    queueName,
    action: "add",
  });
  // }
}

module.exports = addToQueueInBatches;
