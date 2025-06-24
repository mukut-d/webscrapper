const path = require("path");
const { Op } = require("sequelize");
require("dotenv").config({
  debug: true,
  path: path.resolve(__dirname + "/.env"),
});
const express = require("express");
const cors = require("cors");
const app = express();
const apiRouter = require("./src/routers/api/v1");
const cron = require("node-cron");
const { default: axios } = require("axios");
const User = require("./src/models/user.js");
const Tokens = require("./src/models/tokens.js");
const moment = require("moment");
const { helperOrder } = require("./src/helper/fetchOrder.js");
const newRelic = require("newrelic");
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const { swaggerOptions } = require("./swagger.js");
const verifyTokenMiddleware = require("./src/middlewares/verifyTokenMiddlware.js");
const {
  QuantityUpdateInEbayCron,
  updateEbayStockAndStatus,
} = require("./src/controllers/api/v1/catalogue.js");

require("./src/database/config.js");
// require("./src/models");
require("newrelic");
require("./src/helper/bulkUpdateQueue.js");
require("./src/cron-jobs/update-config/queueListener.js");

// //NOTE - import all cron jobs for cart low
// const { startCronJob } = require("./src/cron-jobs/cartlow/index.js"); //FIXME: un comment it when we need to go live for this cron
// startCronJob();

const startCronJob = require("./src/cron-jobs/update-config/update-cron.js"); //FIXME: un comment it when we need to go live for this cron
startCronJob();

const Log = require("./src/models/log.js");
const connectDB = require("./src/database/db.js");
const {
  updateWalmartProductStatus,
} = require("./src/marketplaceapis/walmart/catalogue.js");
app.use(
  cors({
    origin: [
      process.env.MAIN_DOMAIN,
      process.env.CATALOG_DOMAIN,
      "https://sellerpunditmainfrontend.evdtechnology.com",
      "https://template.sellerpundit.com",
      "http://localhost:3000",
      "*",
    ], // allow server to accept request from different origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // allow session cookie from browser to pass through
  })
);

app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));

app.use("/public", express.static("src/uploads"));
// // app.use("/", verifyTokenMiddleware, apiRouter);
app.use("/", apiRouter);
app.use("/", apiRouter);

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/api-marketplaces", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

connectDB();

app.listen(process.env.PORT, () =>
  console.log(`*****Server running on port ${process.env.PORT}*****`)
);
