const path = require("path");
const { Op } = require("sequelize");
require("dotenv").config({
    debug: true,
    path: path.join(__dirname, "/.env"),
});
const express = require("express");
const cron = require("node-cron");
const { default: axios } = require("axios");
const User = require("../../models/user.js");
const Tokens = require("../../models/tokens.js");
const moment = require("moment");
const newRelic = require("newrelic");
const {
  QuantityUpdateInEbayCron,
  updateEbayStockAndStatus,
} = require("../../controllers/api/v1/catalogue.js");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail.js");

require("../../database/config.js");
// require("./src/models");
require("newrelic");
require("../../helper/bulkUpdateQueue.js");

// //NOTE - import all cron jobs for cart low
require("../cartlow/index.js"); //FIXME: un comment it when we need to go live for this cron

const { updateWalmartProductStatus } = require("../../marketplaceapis/walmart/catalogue.js");

cron.schedule("*/30 * * * *", async () => {
  try {
    console.log("Order cron started");
    newRelic.recordCustomEvent("Order cron started", moment());
    const users = await User.findAll();
    for (let j = 0; j < users?.length; j++) {
      const user = users[j];
      const userTokens = await Tokens.findAll({
        where: { userId: user.id, status: "active" },
      });
      const date = moment().subtract(2, "hours");
      for (let i = 0; i < userTokens?.length; i++) {
        const token = userTokens[i];
        const data = {
          userId: user.dataValues.id,
          marketplaceId: token.dataValues.marketPlaceId,
          accountName: token.dataValues.accountName,
          startDate: date.toISOString(),
          endDate: moment().toISOString(),
        };

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
          console.log("get-orders-cron");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
          console.log(err);
        }

        try {
          data.type = "shipped";
          console.log("data", data);
          orderConfig.data = JSON.stringify(data);
          const res = await axios.request(orderConfig);
          console.log("get-shipped-order");
        } catch (err) {
          newRelic.recordCustomEvent("Error in order cron", err);
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
          console.log("fetch-returns");
        } catch (err) {
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
          console.log("get-cancels");
        } catch (error) {
          newRelic.recordCustomEvent(
            `Error while getting cancels. Error ${error}`
          );
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

cron.schedule("0 * * * *", async () => {
  const userIds = ["0e7dcdc6-ffe7-4371-96e0-f01cbbf6b414", "1e057142-21fa-468c-b4ac-6065ba906c5d"];
  for (let a = 0; a < userIds?.length; a++) {
    console.log('userID :>> ', userIds[a]);
    const ebayToken = await Tokens.findOne({
      where: {
        userId: userIds[a],
        accountName: {
          [Op.in]: ["garderobe-dubai", "Business of Preloved Fashion"]
        },
        marketPlaceId: 7
      }
    })
    console.log('ebayToken :>> ', ebayToken);
    const shopifyToken = await Tokens.findOne({
      where: {
        userId: userIds[a],
        accountName: {
          [Op.in]: ["bfc100", "businessofprelovedfashion"]
        },
        marketPlaceId: 10
      }
    })
    console.log(shopifyToken, 'shopifyToken')
    if (!ebayToken || !shopifyToken) {
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: 'aditya@mergekart.com',
        cc: 'pallavisolday12@gmail.com',
        subject: `quantity_update_sellerpundit_report ${new Date()}`,
        text: `Hello, we were unable to find the token (credentials) for the user ID: ${userIds[a]}.`
      }
      await sendUpdateReportEmail(mailOptions)
      continue;
    }

    updateEbayStockAndStatus(ebayToken, shopifyToken);

  }
});

cron.schedule('0 * * * *', () => {
  console.log('Running cron job to update Walmart product status...');
  updateWalmartProductStatus();
});