const cron = require("node-cron");
const UniqueProduct = require("../models/uniqueProduct");
const amazonProfitMargin = require("../controllers/api/v1/amazonProfitMargin");

let task;

async function startCronJob() {
  try {
    console.log("Amazon Profit Margin Cron");
    // Fetch products from the UniqueProduct table where isBestSeller is true
    const products = await UniqueProduct.findAll({ isBestSeller: true });

    // Filter products where the domain includes 'amazon'
    const amazonProducts = products.filter(
      (product) =>
        product.marketplace_name && product.marketplace_name.includes("amazon")
    );

    console.log("products to be scraped: ", amazonProducts.length);

    while (amazonProducts.length > 0) {
      // Get the first 5 products
      const productsToProcess = amazonProducts.splice(0, 5);

      // Pass the products to the amazonProfitMargin function and wait for it to complete
      await amazonProfitMargin(productsToProcess);
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// Schedule a task to run every minute
task = cron.schedule("* * * * *", startCronJob);

// Stop the task after 1 minute
setTimeout(() => {
  task.stop();
}, 1 * 60 * 1000);
