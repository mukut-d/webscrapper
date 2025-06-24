const MarketPlace = require("./marketplace");
const Project = require("./project");
const Product = require("./product");
const ProductKeyword = require("./productKeyword");
const User = require("./user");
const UniqueProduct = require("./uniqueProduct");
const ScratchProducts = require("./scratchProducts");
const TimedAttributes = require("./timedAttributes");

MarketPlace.sync().then(() => {
  console.log("Marketplace Model synced");
});

Project.sync().then(() => {
  console.log("Project Model synced");
});

Product.sync().then(() => {
  console.log("Product Model synced");
});

User.sync().then(() => {
  console.log("User Model synced");
});

UniqueProduct.sync().then(() => {
  console.log("UniqueProduct Model synced");
});

ProductKeyword.sync().then(() => {
  console.log("ProductKeyword Model synced");
});

ScratchProducts.sync().then(() => {
  console.log("ScratchProducts Model synced");
});

TimedAttributes.sync().then(() => {
  console.log("TimedAttributes Model synced");
});