const MarketPlace = require("./marketplace");
const Project = require("./project");
const Product = require("./product");
const ProductKeyword = require("./productKeyword");
const User = require("./user");
const UniqueProduct = require("./uniqueProduct");
const Category = require("./category");
const Tokens = require("./tokens");
const isku = require("./isku");
const csku = require("./csku");
const FormulaConfigs = require("./formulaConfigs");
const FileStorages = require("./fileStorages");
const order = require("./order");
const ScratchProducts = require("./scratchProducts");
const BulkUploadHistory = require("./bulkUploadHistory");
const shippingPolicies = require("./shippingPolicies");
const paymentPolicies = require("./paymentPolicy");
const returnPolicy = require("./returnPolicy");
const inbound = require("./inbound");
const catalogue = require("./catalogue");
const Currency = require("./currency");
const geosite = require("./geosite");
const { emailTemplate } = require("./emailTemplate");
const { MessageLog } = require("./messageLog");
const { messages } = require("./messages");
const MerchantLocation = require("./merchantLocation");
const Template = require("./template");

MarketPlace.sync().then(() => {
  console.log("Marketplace Model synced");
});

Project.sync().then(() => {
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

Category.sync()
  .then(() => {
    console.log("Category Model synced");
  })
  .catch((err) => {
    console.error("Error syncing Category model:", err);
  });
Tokens.sync().then(() => {
  console.log("Token Model Synced");
});

isku.sync().then(() => {
  console.log("ISKU Model synced");
});


order.sync().then(() => {
  console.log("Order Model Synced");
});

ScratchProducts.sync().then(() => {
  console.log("ScratchProducts Model synced");
});

shippingPolicies.sync().then(() => {
  console.log("Shipping Policy Model synced");
});

paymentPolicies.sync().then(() => {
  console.log("Payment Policy Model synced");
});

returnPolicy.sync().then(() => {
  console.log("Return Policy Model synced");
});

inbound.sync().then(() => {
  console.log("Inbound model synced");
});

catalogue.sync({ alter: true }).then(() => {
  console.log("Catalogue Model synced");
});

Currency.sync().then(() => {
  console.log("Currency Model synced");
});

geosite.sync({ alter: true }).then(() => {
  console.log("Geosite Model synced");
});

emailTemplate.sync().then(() => {
  console.log("Email template model synced.");
});

MessageLog.sync().then(() => {
  {
    console.log("Message log model synced");
  }
});

FormulaConfigs.sync().then(() => {
  console.log("Message Formula config model synced");
});

FileStorages.sync().then(() => {
  console.log("File Storages model synced");
});

messages.sync().then(() => {
  console.log("Message Formula config model synced");
});

MerchantLocation.sync({ alter: true }).then(() => {
  console.log("MerchantLocation Model synced");
});

csku.sync({ alter: true }).then(() => {
  console.log("CSKU Model Synced");
});

BulkUploadHistory.sync().then(() => {
  console.log("BulkUploadHistory Model synced");
});

Template.sync().then(() => {
  console.log("Template Model synced");
});

Project.hasMany(Product, { onDelete: "cascade" });
Product.belongsTo(Project);

Product.hasOne(UniqueProduct, { onDelete: "cascade" });
Product.hasMany(ProductKeyword, { onDelete: "cascade" });
UniqueProduct.belongsTo(Product);
ProductKeyword.belongsTo(Product);

// Set up the associations for the Category model
Category.hasMany(Category, {
  as: "subcategories",
  foreignKey: "parentCategoryId",
  onDelete: "cascade",
});
Category.belongsTo(Category, { as: "parent", foreignKey: "parentCategoryId" });
