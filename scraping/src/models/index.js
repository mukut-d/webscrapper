const MarketPlace = require("./marketplace");
const Project = require("./project");
const Product = require("./product");
const ProductKeyword = require("./productKeyword");
const User = require("./user");
const UniqueProduct = require("./uniqueProduct");
const ScratchProducts = require("./scratchProducts");
const scrapingVendor = require("./scrapingvendor");
const TimedAttributes = require("./timedAttributes");


MarketPlace.sync({ alter: true }).then(() => {
  console.log("Marketplace Model synced");
});

Project.sync({ alter: true }).then(() => {
  console.log("Project Model synced");
});

Product.sync().then(() => {
  console.log("Product Model synced");
});

User.sync({ alter: true }).then(() => {
  console.log("User Model synced");
});

UniqueProduct.sync().then(() => {
  console.log("UniqueProduct Model synced");
});

ProductKeyword.sync().then(() => {
  console.log("ProductKeyword Model synced");
});

ScratchProducts.sync({ alter: true }).then(() => {
  console.log("ScratchProducts Model synced");
});

scrapingVendor.sync({ alter: true }).then(() => {
  console.log("ScrapingVendor Model synced");
});

TimedAttributes.sync({ alter: true }).then(() => {
  console.log("TimedAttributes Model synced");
});