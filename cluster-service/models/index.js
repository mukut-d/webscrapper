const MarketPlace = require("./marketplace");
const Project = require("./project");
const Product = require("./product");
const ProductKeyword = require("./productKeyword");
const User = require("./user");
const UniqueProduct = require("./uniqueProduct");
const ScratchProducts = require("./scratchProducts");
const { MailCron } = require("./mailcron");

[
  MarketPlace,
  Project,
  Product,
  User,
  UniqueProduct,
  ProductKeyword,
  ScratchProducts,
  MailCron,
].forEach((Model) => {
  Model.sync({ alter: true }).then(() => {
    console.log(`${Model} Model synced`);
  });
});


/// Think about removing this and use the code above
// MarketPlace.sync({ alter: true }).then(() => {
//   console.log("Marketplace Model synced");
// });

// Project.sync({ alter: true }).then(() => {
//   console.log("Project Model synced");
// });

// Product.sync().then(() => {
//   console.log("Product Model synced");
// });

// User.sync().then(() => {
//   console.log("User Model synced");
// });

// UniqueProduct.sync().then(() => {
//   console.log("UniqueProduct Model synced");
// });

// ProductKeyword.sync().then(() => {
//   console.log("ProductKeyword Model synced");
// });

// ScratchProducts.sync().then(() => {
//   console.log("ScratchProducts Model synced");
// });

// MailCron.sync().then(() => {
//   console.log("MailCron Model synced");
// });

