const path = require("path");
require("dotenv").config({
  debug: true,
  path: path.resolve(__dirname + "/.env"),
});
const express = require("express");
const cors = require("cors");
const app = express();
const apiRouter = require("./src/routers/api/v1");
const Bull = require('bull');
const Arena = require('bull-arena');
const basicAuth = require('basic-auth');

// Middleware for Basic Authentication
const authMiddleware = (req, res, next) => {
  const user = basicAuth(req);

  const username = 'admin'; // Replace with your username
  const password = 'password123'; // Replace with your password

  if (!user || user.name !== username || user.pass !== password) {
      res.set('WWW-Authenticate', 'Basic realm="Bull-Arena"');
      return res.status(401).send('Authentication required');
  }

  next();
};

require("./src/database/config.js");
// require("./src/models");
//NOTE - import all cron jobs
require("./src/cron-jobs/mainTableInsertJob.js");


app.use(
  cors({
    origin: [
      process.env.MAIN_DOMAIN,
      process.env.FRONTEND_DOMAIN,
      process.env.KEYWORD_API_URL,
    ], // allow server to accept request from different origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // allow session cookie from browser to pass through
  })
);

app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));

// Step 3: Configure Bull-Arena
const arenaConfig = Arena(
  {
    Bull,
    queues: [
      {
        type: 'bull',
        name: 'bulkFileUploadQueue',
        hostId: 'Queue 1',
        redis: { host: '127.0.0.1', port: 6379 }
      },
      {
        type: 'bull',
        name: 'scrapeQueue',
        hostId: 'Queue 2',
        redis: { host: '127.0.0.1', port: 6379 }
      },
      {
        type: 'bull',
        name: 'quantityStatusUpdateQueue',
        hostId: 'Queue 3',
        redis: { host: '127.0.0.1', port: 6379 }
      },
      {
        type: 'bull',
        name: 'updateConfigQueue',
        hostId: 'Queue 4',
        redis: { host: '127.0.0.1', port: 6379 }
      }
      // Add more queue configurations as needed
    ]
  },
  {
    // basePath: '/arena', // Optional: Base path for the Arena GUI
    disableListen: true // We are embedding it into our Express app
  }
);

app.use("/", apiRouter);

// Mount Bull-Arena at a specific route
app.use('/arena', authMiddleware, arenaConfig);

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
