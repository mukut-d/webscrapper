const axios = require("axios");
const { Queue } = require("bullmq");
const cluster = require("node:cluster");
const os = require("os");
const { SubProcess } = require("./subprocess");
const child_process = require("child_process");
const path = require("path");
require("dotenv").config({
  debug: true,
  path: path.resolve(__dirname + "/.env"),
});
require("./database/config");
require("./newrelic");
const connectDB = require("./database/db");
connectDB();
// require("./models/index");

const fetchQueue = new Queue("scrapeQueue", {
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
    cluster.fork({ workerId: i + 1 });
    console.log("Worker " + (i + 1) + " is ready");
  }
} else {
  (async function () {
    // Start subprocesses
    const subprocess1 = child_process.fork("./subprocess.js");
    const subprocess2 = child_process.fork("./subprocess.js");
    const subprocess3 = child_process.fork("./subprocess.js");
    // Send message to subprocesses to start processing
    subprocess1.send("start");
    subprocess2.send("start");
    subprocess3.send("start");
  })();
}
