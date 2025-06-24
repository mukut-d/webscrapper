const axios = require("axios");
const Bull = require("bull");
const cluster = require("node:cluster");
const os = require("os");
const newRelic = require("newrelic");
const moment = require("moment");

const fetchQueue = new Bull("fetchQueue", {
  redis: {
    host: "localhost",
    port: 6379,
    // add other Redis options if needed
  },
});

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers equal to the number of CPU cores
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs / 2; i++) {
    cluster.fork();
    console.log("Worker " + (i + 1) + " is ready");
  }
} else {
  fetchQueue.process(async (job) => {
    console.log("JOB START");
    const { userId, marketPlaceId, accountName, addQuantity, fetchAspects } =
      job.data;
    const date = new Date();
    // date.setHours(date.getHours() + 5);
    // date.setMinutes(date.getMinutes() + 30);
    let request = JSON.stringify({
      userId: userId,
      marketplaceId: marketPlaceId,
      accountName: accountName,
      addQuantity: addQuantity,
      date: date,
      fetchAspects: fetchAspects,
    });

    let profileConfig = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/master/get-user-profiles",
      headers: {
        "Content-Type": "application/json",
      },
      data: request,
    };

    await axios
      .request(profileConfig)
      .then((response) => {
        console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
        newRelic.recordCustomEvent(
          `Error while getting user profiles. Error ${error}`
        );
        console.log(error);
      });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/catalogue/get-catalogue",
      headers: {
        "Content-Type": "application/json",
      },
      data: request,
    };

    await axios
      .request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
        newRelic.recordCustomEvent(
          `Error while getting catalogue. Error ${error}`
        );
        console.log(error);
      });

    let configAspects = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/catalogue/get-item-details",
      headers: {
        "Content-Type": "application/json",
      },
      data: request,
    };

    await axios
      .request(configAspects)
      .then((res) => {
        console.log(JSON.stringify(res.data));
      })
      .catch((error) => {
        newRelic.recordCustomEvent(
          `Error while getting item apects. Error ${error}`
        );
        console.log(error);
      });

    let request1 = JSON.stringify({
      userId: userId,
      marketplaceId: marketPlaceId,
      date: date,
      startDate: date,
      accountName: accountName,
      addQuantity: addQuantity,
    });

    let request2 = JSON.stringify({
      userId: userId,
      marketplaceId: marketPlaceId,
      accountName: accountName,
    });

    let config1 = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/order/get-orders",
      headers: {
        "Content-Type": "application/json",
      },
      data: request1,
    };

    await axios
      .request(config1)
      .then((response) => {
        console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
        newRelic.recordCustomEvent(
          `Error while getting orders. Error ${error}`
        );
        console.log(error);
      });

    let config2 = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/order/fetch-returns",
      headers: {
        "Content-Type": "application/json",
      },
      data: request1,
    };

    await axios
      .request(config2)
      .then((res) => {
        console.log(JSON.stringify(res.data));
      })
      .catch((err) => {
        newRelic.recordCustomEvent(`Error while getting returns. Error ${err}`);
        console.log(err);
      });

    const config3 = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/order/get-cancels",
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    await axios
      .request(config3)
      .then((response) => {
        console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
        newRelic.recordCustomEvent(
          `Error while getting cancels. Error ${error}`
        );
        console.log(error);
      });

    let messageData = {
      userId: userId,
      marketplaceId: marketPlaceId,
      startDate: moment().subtract(120, "days").toISOString(),
      endDate: moment().toISOString(),
      accountName: accountName,
    };

    const messageConfig = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/messages/fetch-messages",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify(messageData),
    };

    await axios.request(messageConfig);

    const merchantConfig = {
      method: "post",
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/merchantLocation/fetch-merchant-location",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify(messageData),
    };

    await axios.request(merchantConfig);

    let shopData = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:5001/shop-category/store-shop-categories",
      headers: {
        "Content-Type": "application/json",
      },
      data: request2,
    };
    await axios.request(shopData)

    console.log("JOB ENDED");

    await job.isCompleted();
    await job.remove();

    return true;
  });
}
