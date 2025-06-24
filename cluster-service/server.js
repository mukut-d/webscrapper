const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");

const appRoutes = require("./routes/index.js");
const { ErrorHandler } = require("./utils");
const PORT = 5050;

app.use(express.json({
  limit: "50mb",
}));
app.use(morgan("dev"));
app.use(
  cors({
    origin: "*",
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

app.use("/api", appRoutes);
app.use(ErrorHandler);

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
