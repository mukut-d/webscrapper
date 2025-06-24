require("./batch_processor.worker.js");
require("./html_processor.worker.js");
require("./data_processor.worker.js");
["Batch Processing 🟢", "Html Processing 🟢", "Data Processing 🟢"].forEach(
  (element) => {
    console.log(`${element} worker is live now`);
  }
);
