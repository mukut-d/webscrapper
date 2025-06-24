const path = require("path");
const { Op } = require("sequelize");
require("dotenv").config({
  debug: true,
  path: path.join(__dirname, "/.env"),
});
const express = require("express");
const app = express();
const cron = require("node-cron");
const { default: axios } = require("axios");
const User = require("../src/models/user.js");
const Tokens = require("../src/models/tokens.js");
const moment = require("moment");
const newRelic = require("newrelic");
const {
  QuantityUpdateInEbayCron,
  updateEbayStockAndStatus,
} = require("../src/controllers/api/v1/catalogue.js");
const sendUpdateReportEmail = require("../src/helper/sendUpdateReportEmail.js");
const { apiCallLog } = require("../src/helper/apiCallLog.js");
require("../src/database/config.js");
const connectDB = require("../src/database/db.js");
// require("./src/models");
require("newrelic");
require("../src/helper/bulkUpdateQueue.js");
connectDB();

// //NOTE - import all cron jobs for cart low
const { startCronJob } = require("../src/cron-jobs/cartlow/index.js"); //FIXME: un comment it when we need to go live for this cron
startCronJob();

const { updateWalmartProductStatus } = require("../src/marketplaceapis/walmart/catalogue.js");
const { QuantityUpdateKKGems, priceUpdate } = require("../QuantityUpdateCronKKGEMS.js");


// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.get("/", (req, res) => {

//   res.status(200).json({ message: "Server is running" });
// });

// app.get("/cron", async (req, res) => {
//   try {
//     console.log("Order cron started");
//     newRelic.recordCustomEvent("Order cron started", moment());
//     const users = await User.findAll();
//     for (let j = 0; j < users?.length; j++) {
//       const user = users[j];
//       const userTokens = await Tokens.findAll({
//         where: { userId: user.id, status: "active" },
//       });
//       const date = moment().subtract(2, "hours");
//       for (let i = 0; i < userTokens?.length; i++) {
//         const token = userTokens[i];
//         const data = {
//           userId: user.dataValues.id,
//           marketplaceId: token.dataValues.marketPlaceId,
//           accountName: token.dataValues.accountName,
//           startDate: date.toISOString(),
//           endDate: moment().toISOString(),
//         };

//         // helperOrder(data.userId, data.marketplaceId, data.accountName, data.startDate);

//         console.log("data", JSON.stringify(data));
//         const orderConfig = {
//           method: "post",
//           maxBodyLength: Infinity,
//           url: "http://localhost:5001/order/get-orders-cron",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           data: JSON.stringify(data),
//         };

//         try {
//           const res = await axios.request(orderConfig);
//           console.log("get-orders-cron");
//         } catch (err) {
//           newRelic.recordCustomEvent("Error in order cron", err);
//           console.log(err);
//         }

//         try {
//           data.type = "shipped";
//           console.log("data", data);
//           orderConfig.data = JSON.stringify(data);
//           const res = await axios.request(orderConfig);
//           console.log("get-shipped-order");
//         } catch (err) {
//           newRelic.recordCustomEvent("Error in order cron", err);
//           console.log(err);
//         }

//         const messageConfig = {
//           method: "post",
//           maxBodyLength: Infinity,
//           url: "http://localhost:5001/messages/fetch-messages",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           data: JSON.stringify(data),
//         };

//         try {
//           const item = await axios.request(messageConfig);
//           console.log("fetch-messages");
//         } catch (err) {
//           newRelic.recordCustomEvent("Error in message cron", err);
//           console.log(err);
//         }

//         let request1 = JSON.stringify({
//           userId: user.dataValues.id,
//           marketplaceId: token.dataValues.marketPlaceId,
//           startDate: moment().subtract(5, "days"),
//           accountName: token.dataValues.accountName,
//         });

//         let config2 = {
//           method: "post",
//           maxBodyLength: Infinity,
//           url: "http://localhost:5001/order/fetch-returns",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           data: request1,
//         };

//         try {
//           const res = await axios.request(config2);
//           console.log("fetch-returns");
//         } catch (err) {
//           newRelic.recordCustomEvent(
//             `Error while getting returns. Error ${err}`
//           );
//           console.log(err);
//         }

//         const config3 = {
//           method: "post",
//           maxBodyLength: Infinity,
//           url: "http://localhost:5001/order/get-cancels",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           data: request1,
//         };

//         try {
//           const response = await axios.request(config3);
//           console.log("get-cancels");
//         } catch (error) {
//           newRelic.recordCustomEvent(
//             `Error while getting cancels. Error ${error}`
//           );
//           console.log(error.response);
//           continue;
//         }

//         newRelic.recordCustomEvent("Delivered message cron started", moment());

//         const config1 = {
//           method: "post",
//           maxBodyLength: Infinity,
//           url: "http://localhost:5001/order/get-delivered-orders",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           data: JSON.stringify({
//             userId: user.dataValues.id,
//             marketplaceId: token.dataValues.marketPlaceId,
//             startDate: moment().subtract(5, "days"),
//             accountName: token.dataValues.accountName,
//             endDate: moment().toISOString(),
//           }),
//         };

//         try {
//           const res = await axios.request(config1);
//           console.log("get-delivered-orders");
//         } catch (err) {
//           newRelic.recordCustomEvent("Error in order cron", err);
//           console.log(err);
//         }

//         newRelic.recordCustomEvent("Delivered message cron ended", moment());
//       }
//     }

//     res.status(200).json({ message: "Order cron ended" });
//     newRelic.recordCustomEvent("Order cron ended", moment());
//   } catch (err) {
//     newRelic.recordCustomEvent("Error in order cron", err);
//     console.log(err);
//     res.status(500).json({ error: err });
//   }
// });

// app.listen(3000, () =>
//   console.log(`*****Server running on port ${3000}*****`)
// );

cron.schedule("*/30 * * * *", async () => {
  try {
    let functionName = "Order Cron Started"
    console.log("Order cron started");
    newRelic.recordCustomEvent("Order cron started", moment());
    const users = await User.findAll();
    for (let j = 0; j < users?.length; j++) {
      const user = users[j];
      apiCallLog("GetUser", "/order/get-order-cron", functionName,
        {
          user: user,
        }
        , {}, {}, 'success');
      const userTokens = await Tokens.findAll({
        where: { userId: user.id, status: "active" },
      });

      const date = moment().subtract(2, "hours");
      for (let i = 0; i < userTokens?.length; i++) {
        let functionName = "Token from Account"
        const token = userTokens[i];
        apiCallLog("TokenTaken", "/order/get-order-cron", functionName,
          {
            token: token,
            accountName: token.dataValues.accountName,
            marketplaceId: token.dataValues.marketPlaceId
          }
          , {}, {}, 'success');
        const data = {
          userId: user.dataValues.id,
          marketplaceId: token.dataValues.marketPlaceId,
          accountName: token.dataValues.accountName,
          startDate: date.toISOString(),
          endDate: moment().toISOString(),
        };
        functionName = "Data Creating"
        apiCallLog("Data Creation for API Call", "/order/get-order-cron", functionName,
          {
            data: data,
          }
          , {}, {}, 'success');
        // helperOrder(data.userId, data.marketplaceId, data.accountName, data.startDate);

        console.log("data", JSON.stringify(data));
        const orderConfig = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-orders-cron",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify(data),
        };

        try {
          const res = await axios.request(orderConfig);
          let functionName = "Order Cron Run"
          apiCallLog("FetchOrdersCron", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , res, {}, 'success');
          console.log("get-orders-cron");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          apiCallLog("FetchOrdersCron", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , {}, err, 'error');
          console.log(err);
        }

        try {
          let functionName = "Shipped Order Cron"
          data.type = "shipped";
          console.log("data", data);
          orderConfig.data = JSON.stringify(data);
          const res = await axios.request(orderConfig);
          apiCallLog("Shipped Order", "/order/get-order-cron", functionName,
            {
              data: data,
            }
            , res, {}, 'success');
          console.log("get-shipped-order");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          apiCallLog("Shipped Order", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , {}, err, 'error');
          console.log(err);
        }

        const messageConfig = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/messages/fetch-messages",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify(data),
        };

        try {
          const item = await axios.request(messageConfig);
          console.log("fetch-messages");
        } catch (err) {
          newRelic.recordCustomEvent("Error in message cron", err);
          console.log(err);
        }

        let request1 = JSON.stringify({
          userId: user.dataValues.id,
          marketplaceId: token.dataValues.marketPlaceId,
          startDate: moment().subtract(5, "days"),
          accountName: token.dataValues.accountName,
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

        try {
          const res = await axios.request(config2);
          apiCallLog("Return Order", "/order/fetch-returns", functionName,
            {
              data: config2,
            }
            , res, {}, 'success');
          console.log("fetch-returns");
        } catch (err) {
          apiCallLog("Return Order", "/order/fetch-returns", functionName,
            {
              data: config2,
            }
            , {}, err, 'error');
          newRelic.recordCustomEvent(
            `Error while getting returns. Error ${err}`
          );
          console.log(err);
        }

        const config3 = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-cancels",
          headers: {
            "Content-Type": "application/json",
          },
          data: request1,
        };

        try {
          const response = await axios.request(config3);
          apiCallLog("Cancel Order", "/order/get-cancels", functionName,
            {
              data: config3,
            }
            , response, {}, 'success');
          console.log("get-cancels");
        } catch (error) {
          newRelic.recordCustomEvent(
            `Error while getting cancels. Error ${error}`
          );
          apiCallLog("cancel Order", "/order/get-cancels", functionName,
            {
              data: config3,
            }
            , {}, error, 'error');
          console.log(error);
        }

        newRelic.recordCustomEvent("Delivered message cron started", moment());

        const config1 = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-delivered-orders",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify({
            userId: user.dataValues.id,
            marketplaceId: token.dataValues.marketPlaceId,
            startDate: moment().subtract(5, "days"),
            accountName: token.dataValues.accountName,
            endDate: moment().toISOString(),
          }),
        };

        try {
          const res = await axios.request(config1);
          apiCallLog("Delivered Order", "/order/get-order-cron", functionName,
            {
              data: config1,
            }
            , res, {}, 'success');
          console.log("get-delivered-orders");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          console.log(err);
        }

        newRelic.recordCustomEvent("Delivered message cron ended", moment());
      }
    }

    newRelic.recordCustomEvent("Order cron ended", moment());
  } catch (err) {
    newRelic.recordCustomEvent("Error in order cron", err);
    console.log(err);
  }
});

cron.schedule("0 */2 * * *", async () => {
  const userIds = ["0e7dcdc6-ffe7-4371-96e0-f01cbbf6b414", "1e057142-21fa-468c-b4ac-6065ba906c5d", "22d83297-86e2-437c-8b49-b41968aa97b8"];
  for (let a = 0; a < userIds?.length; a++) {
    console.log('userID :>> ', userIds[a]);
    const ebayToken = await Tokens.findOne({
      where: {
        userId: userIds[a],
        accountName: {
          [Op.in]: ["garderobe-dubai", "Business of Preloved Fashion", "la-suite"]
        },
        marketPlaceId: 7
      }
    })
    console.log('ebayToken :>> ', ebayToken);
    const shopifyToken = await Tokens.findOne({
      where: {
        userId: userIds[a],
        accountName: {
          [Op.in]: ["bfc100", "businessofprelovedfashion", "lasuite-ae"]
        },
        marketPlaceId: 10
      }
    })
    console.log(shopifyToken, 'shopifyToken')
    if (!ebayToken || !shopifyToken) {
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: 'aditya@mergekart.com',
        cc: 'akhlaq@mergekart.com',
        subject: `quantity_update_sellerpundit_report ${new Date()}`,
        text: `Hello, we were unable to find the token (credentials) for the user ID: ${userIds[a]}.`
      }
      await sendUpdateReportEmail(mailOptions)
      continue;
    }

    updateEbayStockAndStatus(ebayToken, shopifyToken);

  }
});

cron.schedule("0 */2 * * *", async () => {

  try {

    QuantityUpdateKKGems();

  } catch (err) {
    await apiCallLog("QuantityUpdateCron", "QuantityUpdateCron", "QuantityUpdateCron", {}, {}, err, "error");
  }

});
cron.schedule("0 */4 * * *", async () => {
  try {
    await priceUpdate();
  } catch (err) {
    await apiCallLog("PriceUpdateCron", "PriceUpdateCron", "PriceUpdateCron", {}, {}, err, "error");
  }
});


cron.schedule('0 * * * *', () => {
  console.log('Running cron job to update Walmart product status...');
  updateWalmartProductStatus();
});

cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Daily cron job started");
    // Add your daily task logic here
    // For example, you can call a function to perform the daily task
    let functionName = "Order Cron Started"
    console.log("Order cron started");
    newRelic.recordCustomEvent("Order cron started", moment());
    const users = await User.findAll();
    for (let j = 0; j < users?.length; j++) {
      const user = users[j];
      apiCallLog("GetUser", "/order/get-order-cron", functionName,
        {
          user: user,
        }
        , {}, {}, 'success');
      const userTokens = await Tokens.findAll({
        where: { userId: user.id, status: "active" },
      });

      const date = moment().subtract(7, "days");
      for (let i = 0; i < userTokens?.length; i++) {
        let functionName = "Token from Account"
        const token = userTokens[i];
        apiCallLog("TokenTaken", "/order/get-order-cron", functionName,
          {
            token: token,
            accountName: token.dataValues.accountName,
            marketplaceId: token.dataValues.marketPlaceId
          }
          , {}, {}, 'success');
        const data = {
          userId: user.dataValues.id,
          marketplaceId: token.dataValues.marketPlaceId,
          accountName: token.dataValues.accountName,
          startDate: date.toISOString(),
          endDate: moment().toISOString(),
        };
        functionName = "Data Creating"
        apiCallLog("Data Creation for API Call", "/order/get-order-cron", functionName,
          {
            data: data,
          }
          , {}, {}, 'success');
        // helperOrder(data.userId, data.marketplaceId, data.accountName, data.startDate);

        console.log("data", JSON.stringify(data));
        const orderConfig = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-orders-cron",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify(data),
        };

        try {
          const res = await axios.request(orderConfig);
          let functionName = "Order Cron Run"
          apiCallLog("FetchOrdersCron", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , res, {}, 'success');
          console.log("get-orders-cron");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          apiCallLog("FetchOrdersCron", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , {}, err, 'error');
          console.log(err);
        }

        try {
          let functionName = "Shipped Order Cron"
          data.type = "shipped";
          console.log("data", data);
          orderConfig.data = JSON.stringify(data);
          const res = await axios.request(orderConfig);
          apiCallLog("Shipped Order", "/order/get-order-cron", functionName,
            {
              data: data,
            }
            , res, {}, 'success');
          console.log("get-shipped-order");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          apiCallLog("Shipped Order", "/order/get-order-cron", functionName,
            {
              orderConfig: orderConfig,
            }
            , {}, err, 'error');
          console.log(err);
        }

        let request1 = JSON.stringify({
          userId: user.dataValues.id,
          marketplaceId: token.dataValues.marketPlaceId,
          startDate: moment().subtract(5, "days"),
          accountName: token.dataValues.accountName,
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

        try {
          const res = await axios.request(config2);
          apiCallLog("Return Order", "/order/fetch-returns", functionName,
            {
              data: config2,
            }
            , res, {}, 'success');
          console.log("fetch-returns");
        } catch (err) {
          apiCallLog("Return Order", "/order/fetch-returns", functionName,
            {
              data: config2,
            }
            , {}, err, 'error');
          newRelic.recordCustomEvent(
            `Error while getting returns. Error ${err}`
          );
          console.log(err);
        }

        const config3 = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-cancels",
          headers: {
            "Content-Type": "application/json",
          },
          data: request1,
        };

        try {
          const response = await axios.request(config3);
          apiCallLog("Cancel Order", "/order/get-cancels", functionName,
            {
              data: config3,
            }
            , response, {}, 'success');
          console.log("get-cancels");
        } catch (error) {
          newRelic.recordCustomEvent(
            `Error while getting cancels. Error ${error}`
          );
          apiCallLog("cancel Order", "/order/get-cancels", functionName,
            {
              data: config3,
            }
            , {}, error, 'error');
          console.log(error);
        }

        newRelic.recordCustomEvent("Delivered message cron started", moment());

        const config1 = {
          method: "post",
          maxBodyLength: Infinity,
          url: "http://localhost:5001/order/get-delivered-orders",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify({
            userId: user.dataValues.id,
            marketplaceId: token.dataValues.marketPlaceId,
            startDate: moment().subtract(5, "days"),
            accountName: token.dataValues.accountName,
            endDate: moment().toISOString(),
          }),
        };

        try {
          const res = await axios.request(config1);
          apiCallLog("Delivered Order", "/order/get-order-cron", functionName,
            {
              data: config1,
            }
            , res, {}, 'success');
          console.log("get-delivered-orders");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          console.log(err);
        }

        newRelic.recordCustomEvent("Delivered message cron ended", moment());
      }
    }
    console.log("Daily cron job completed");
  } catch (err) {
    console.log("Error in daily cron job", err);
    await apiCallLog("DailyCron", "DailyCron", "DailyCron", {}, {}, { error: err.message }, "error");
  }
});