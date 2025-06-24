const path = require("path");
require("dotenv").config({
  debug: true,
  path: path.resolve(__dirname + "/.env"),
});
const express = require("express");
const cors = require("cors");
const app = express();
const apiRouter = require("./src/routers/api/v1");

require("./src/database/config.js");
const connectDb = require("./src/database/db.js");
connectDb();
// require("./src/models");

require("dotenv").config();
require("newrelic");
// rest of your code...

//NOTE - import cron jobs
require("./src/cron-jobs/asin-jobs.js");
require("./src/cron-jobs/feedFileUpdate.js");
// require("./src/cron-jobs/profitMargin.js");

app.use(
  cors({
    origin: [process.env.MAIN_DOMAIN, process.env.FRONTEND_DOMAIN], // allow server to accept request from different origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // allow session cookie from browser to pass through
  })
);

app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));

app.use("/", apiRouter);

var http = require("http").createServer(app);
var { Server } = require("socket.io");

const io = new Server(http, {
  cors: {
    origin: process.env.FRONTEND_DOMAIN,
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

http.listen(process.env.PORT, () =>
  console.log(`*****Server running on port ${process.env.PORT}*****`)
);

io.on("connection", function (socket) {
  console.log("Client connected to the WebSocket");

  // io.emit('test-event', '******Hi from scraping module******');

  global.socketIo = io;

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });

  socket.on("test-event", function (msg) {
    console.log("Received a chat message");
    io.emit("chat message", msg);
  });
});

module.exports = io;
