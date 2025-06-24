const MarketPlace = require('./marketplace')
const Project = require('./project')
const Product = require('./product')
const ProductKeyword = require('./productKeyword')
const User = require('./user')
const UniqueProduct = require('./uniqueProduct')
const TransactionHistory = require('./transaction-history')
const ScrapingHistory = require('./scrapingHistory')
const AccountBalance = require('./account-balance')

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

TransactionHistory.sync().then(() => {
    console.log("TransactionHistory Model synced");
});

ScrapingHistory.sync().then(() => {
    console.log("ScrapingHistory Model synced");
});

AccountBalance.sync().then(() => {
    console.log("AccountBalance Model synced");
});