const { Op, Sequelize, json, where, cast, col, fn } = require("sequelize");
const Bull = require("bull");
const fs = require("fs");
const path = require("path");
const csku = require("../../../models/csku");
const isku = require("../../../models/isku");
const Marketplace = require("../../../models/marketplace");
const Tokens = require("../../../models/tokens");
const ebay = require("ebay-api");
const { v4: uuidv4 } = require("uuid");
const qs = require("qs");
const moment = require("moment");
const nodemailer = require("nodemailer");
const CSVParser = require("json2csv").Parser;
const csvtojson = require("csvtojson");
const { sequelize } = require("../../../database/config");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const newRelic = require("newrelic");
const merchantLocation = require("../../../models/merchantLocation");
const Geosite = require("../../../models/geosite");
const shippingPolicies = require("../../../models/shippingPolicies");
const paymentPolicies = require("../../../models/paymentPolicy");
const returnPolicies = require("../../../models/returnPolicy");
const User = require("../../../models/user");
const mathjs = require("mathjs");
const FormData = require("form-data");
const _ = require("lodash");
const {
  GetShopifyCatalogue,
  GetShopifyCatalogueRecent,
  UpdateShopifyCatalogue,
  handleShopifyItemDetails,
  updateShopifyInventory,
  updateShopifyBulkPriceAndQuantity,
  generateExcelForShopifyBulkUpdate,
  FetchShopifyProducts,
} = require("../../../marketplaceapis/shopify/catalogue");
const {
  GetWalmartCatalogue,
  updateWalmartCatalogue,
  GetWalmartRecentCatalogue,
  bulkUpdatePriceAndQuantity,
  bulkUpdateWalmartPriceAndQuantity,
  generateExcelForWalmartBulkUpdate,
} = require("../../../marketplaceapis/walmart/catalogue");
const { default: axios } = require("axios");
const {
  GetWoocommerceCatalogue,
  GetWoocommerceCatalogueRecent,
  updateWooCommerceProduct,
  updateWooCommerceBulkPriceAndQuantity,
  // handleShopifyItemDetails,
} = require("../../../marketplaceapis/woocommerce/catalogue");
const {
  pushDataToEtsy,
  getEtsyCatalogue,
  getEtsyItem,
} = require("../../../marketplaceapis/etsy/catalogue");
const {
  ProductListingStatus,
  Units,
  WeightUnits,
  PackageTypes,
  BulkActionType,
  HistoryStatus,
} = require("../../../utils/enum");
const ExcelJS = require("exceljs");
const xls = require("xlsx");
const xlsxPopulate = require("xlsx-populate");
const Shopify = require("shopify-api-node");
const { Json } = require("sequelize/lib/utils");
const { channel } = require("diagnostics_channel");
const { getAccessToken } = require("../../../marketplaceapis/amazon/tokens");
const {
  fetchSellerFlexListings,
} = require("../../../marketplaceapis/amazon/sellerFlex");
const FileStorages = require("../../../models/fileStorages");
const processFile = require("../../../helper/convertFileToJson");
// const {
//   convertPriceByFormula
// } = require('../../../helper/convertPriceByFormula')
const generateExcelFile = require("../../../helper/generateExcelFile");
const sendUpdateReportEmail = require("../../../helper/sendUpdateReportEmail");
const BulkUploadHistory = require("../../../models/bulkUploadHistory");
const { uploadToS3 } = require("../../../helper/uploadFile");
const { refreshTokenEbay } = require("../../../helper/refreshToken");
const {
  updateEbayInventory,
  bulkUpdateEbayPriceAndQuantity,
  generateExcelForEbayBulkUpdate,
  GetItemEbay,
  FeedFileGenerate,
  GetInventoryTasks,
} = require("../../../marketplaceapis/ebay/catalogue");
const { apiCallLog } = require("../../../helper/apiCallLog");
const CatalogueVariation = require("../../../models/catalogue-variation");
const AWS = require("aws-sdk");
const { ConvertXMLToJSON } = require("../../../helper/convertXmlToJson");
const { ConvertJSONToCSV } = require("../../../helper/convertJSONToCSV");
const EbayRestock = require("./ebayRestock");
AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});
const { GetEtsyCatalogue } = require("../../../marketplaceapis/etsy/catalogue");
const eBay = require("../../../helper/ebayInstance");
const ScratchProducts = require("../../../models/scratchProducts");
const ScrapeSimilarProducts = require("../../../helper/scrapeSimilarProducts");
const ExtractDataFromHtml = require("../../../helper/extractDataFromHtml");

const lambda = new AWS.Lambda();

const migrateQueue = new Bull("migrateQueue", {
  redis: {
    host: "localhost",
    port: 6379,
    // add other Redis options if needed
  },
});

const quantityUpdateQueue = new Bull("quantityUpdateQueue", {
  redis: {
    host: "localhost",
    port: 6379,
  },
  attempts: 20,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  maxRetriesPerRequest: 30,
});
const quantityStatusUpdateQueue = new Bull("quantityStatusUpdateQueue", {
  redis: {
    host: "localhost",
    port: 6379,
  },
  attempts: 20,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  maxRetriesPerRequest: 30,
});

const ebayAuthToken = new EbayAuthToken({
  clientId: process.env.APP_ID,
  clientSecret: process.env.CERT_ID,
});

const scopes = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.reputation",
  "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.stores",
  "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
];

exports.GetCatalogue = async (req, res) => {
  const functionName = "GetCatalogue";
  try {
    const { userId, marketplaceId, accountName, addQuantity, date } = req.body;
    console.log(date);
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    let listings = [];

    if (marketPlace.url?.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      eBay.OAuth2.setCredentials(token.dataValues.token);
      let startDate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      // Get today's date
      const today = moment(date);
      console.log(today);
      // Get the date 2 years prior to today
      const twoYearsAgo = moment(date).subtract(2, "years");

      // Divide the period into 120 days and print all dates
      const interval = 120;

      if (token.dataValues.itemsFetched == 0 && !token.dataValues.fetchDate) {
        let startDate = moment(twoYearsAgo);
        console.log("In 1st if", startDate, twoYearsAgo);
        while (startDate.isBefore(today)) {
          const endDate = moment(startDate)
            .add(interval, "days")
            .isBefore(today)
            ? moment(startDate).add(interval, "days")
            : today;

          const data = await fetchSellerList(
            eBay,
            1,
            startDate.toISOString(),
            endDate.toISOString()
          );

          if (data?.ItemArray?.Item) {
            listings.push(...data?.ItemArray?.Item);
            await this.pushData(
              data,
              marketplaceId,
              accountName,
              userId,
              addQuantity
            );
            token.itemsFetched += listings.length;
            await token.save();
          }
          if (data?.HasMoreItems) {
            for (
              var i = 2;
              i <= data?.PaginationResult?.TotalNumberOfPages;
              i++
            ) {
              let startdate = moment().add(5, "hours").add(30, "minutes");
              let tokenExpiresDate = moment(token.lastTokenRefreshDate);
              let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

              if (hoursDifference >= 2) {
                await refreshToken(eBay, token);
              }
              // try {
              //   await eBay.trading.GetTokenStatus({
              //     RequesterCredentials: {
              //       eBayAuthToken: token.dataValues.token,
              //     },
              //   });
              //   await apiCallLog("GetTokenStatus","/catalouge/get-catalouge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
              // } catch (err) {
              //   await apiCallLog("GetTokenStatus","/catalouge/get-catalouge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
              //   await refreshToken(eBay, token);
              // }
              token.itemsFetched = listings.length;
              const data = await fetchSellerList(
                eBay,
                i,
                startDate.toISOString(),
                endDate.toISOString(),
                accountName
              );
              if (data?.ItemArray?.Item) {
                listings.push(...data?.ItemArray?.Item);
                await this.pushData(
                  data,
                  marketplaceId,
                  accountName,
                  userId,
                  addQuantity
                );
                token.itemsFetched += listings.length;
                await token.save();
              }
            }
          }

          startDate = moment(endDate);
          token.itemsFetched = 0;
          token.fetchDate = endDate.toISOString();
          await token.save();
        }
      } else if (
        token.dataValues.itemsFetched > 0 &&
        token.dataValues.fetchDate
      ) {
        let startDate = moment(token.dataValues.fetchDate).add(1, "days");

        while (startDate.isBefore(today)) {
          const endDate = moment(startDate)
            .add(interval, "days")
            .isBefore(today)
            ? moment(startDate).add(interval, "days")
            : today;

          const pageNumber = Math.floor(
            token.dataValues.itemsFetched / 100 + 1
          );

          const data = await fetchSellerList(
            eBay,
            pageNumber,
            startDate.toISOString(),
            endDate.toISOString(),
            accountName
          );
          if (data?.ItemArray?.Item) {
            listings.push(...data?.ItemArray?.Item);
            await this.pushData(
              data,
              marketplaceId,
              accountName,
              userId,
              addQuantity
            );
            token.itemsFetched += listings.length;
            await token.save();
          }
          if (data?.HasMoreItems) {
            for (
              var i = pageNumber + 1;
              i <= data?.PaginationResult?.TotalNumberOfPages;
              i++
            ) {
              let startdate = moment().add(5, "hours").add(30, "minutes");
              let tokenExpiresDate = moment(token.lastTokenRefreshDate);
              let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

              if (hoursDifference >= 2) {
                await refreshToken(eBay, token);
              }
              // try {
              //   await eBay.trading.GetTokenStatus({
              //     RequesterCredentials: {
              //       eBayAuthToken: token.dataValues.token,
              //     },
              //   });
              //   await apiCallLog("GetTokenStatus","/catalouge/get-catalouge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
              // } catch (err) {
              //   await apiCallLog("GetTokenStatus","/catalouge/get-catalouge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
              //   await refreshToken(eBay, token);
              // }
              token.itemsFetched += listings.length;
              const data = await fetchSellerList(
                eBay,
                i,
                startDate.toISOString(),
                endDate.toISOString(),
                accountName
              );
              if (data?.ItemArray?.Item) {
                listings.push(...data?.ItemArray?.Item);
                await this.pushData(
                  data,
                  marketplaceId,
                  accountName,
                  userId,
                  addQuantity
                );
                token.itemsFetched += listings.length;
                await token.save();
              }
            }
          }

          startDate = moment(endDate);
          token.itemsFetched = 0;
          token.fetchDate = endDate.toISOString();
          await token.save();
        }
      } else if (
        token.dataValues.itemsFetched == 0 &&
        token.dataValues.fetchDate
      ) {
        let startDate = moment(token.dataValues.fetchDate).add(1, "days");

        while (startDate.isBefore(today)) {
          const endDate = moment(startDate)
            .add(interval, "days")
            .isBefore(today)
            ? moment(startDate).add(interval, "days")
            : today;

          const data = await fetchSellerList(
            eBay,
            i,
            startDate.toISOString(),
            endDate.toISOString(),
            accountName
          );
          if (data?.ItemArray?.Item) {
            listings.push(...data?.ItemArray?.Item);
            await this.pushData(
              data,
              marketplaceId,
              accountName,
              userId,
              addQuantity
            );
            token.itemsFetched += listings.length;
            await token.save();
          }
          if (data?.HasMoreItems) {
            for (
              var i = 2;
              i <= data?.PaginationResult?.TotalNumberOfPages;
              i++
            ) {
              let startdate = moment().add(5, "hours").add(30, "minutes");
              let tokenExpiresDate = moment(token.lastTokenRefreshDate);
              let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

              if (hoursDifference >= 2) {
                await refreshToken(eBay, token);
              }
              // try {
              //   await eBay.trading.GetTokenStatus({
              //     RequesterCredentials: {
              //       eBayAuthToken: token.dataValues.token,
              //     },
              //   });
              //   await apiCallLog("GetTokenStatus","/catalogue/get-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
              // } catch (err) {
              //   await apiCallLog("GetTokenStatus","/catalogue/get-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
              //   await refreshToken(eBay, token);
              // }
              const data = await fetchSellerList(
                eBay,
                i,
                startDate.toISOString(),
                endDate.toISOString(),
                accountName
              );
              if (data?.ItemArray?.Item) {
                listings.push(...data?.ItemArray?.Item);
                await this.pushData(
                  data,
                  marketplaceId,
                  accountName,
                  userId,
                  addQuantity
                );
                token.itemsFetched += listings.length;
                await token.save();
              }
            }
          }

          startDate = moment(endDate);
          token.fetchDate = endDate.toISOString();
          token.itemsFetched = 0;
          await token.save();
        }
      }

      let data = JSON.stringify({
        marketplaceId: marketplaceId,
        userId: userId,
        accountName: accountName,
      });

      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "http://localhost:5001/catalogue/fetch-item-feed",
        headers: {
          "Content-Type": "application/json",
        },
        data: data,
      };

      axios.request(config);
    } else if (marketPlace.url?.includes("shopify")) {
      listings = await GetShopifyCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("woocommerce")) {
      listings = await GetWoocommerceCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("walmart")) {
      listings = await GetWalmartCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("sellerflex")) {
      // Get today's date
      const today = moment();

      // Get the date 2 years prior to today
      const twoYearsAgo = moment().subtract(2, "years");

      listings = await fetchSellerFlexListings(
        twoYearsAgo.toISOString(),
        today.toISOString(),
        token.dataValues.client_id,
        token.dataValues.client_secret,
        token.dataValues.refreshToken,
        token.dataValues.amzMarketplaceId
      );

      console.log(listings.length);

      await pushAmazonDataToDB(
        listings,
        marketplaceId,
        accountName,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("etsy")) {
      listings = await GetEtsyCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity,
        "firstFetch"
      );
    } else if (marketPlace.url?.includes("amazon")) {
      listings = await fetchAmazonListings(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity,
        "firstFetch"
      );
    }
    return res.status(200).json({
      success: true,
      status: 200,
      data: listings,
    });
  } catch (err) {
    // newRelic.recordCustomEvent(`Error in catalogue fetch`, err.message)
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
      fullError: err.toString(),
    });
  }
};
async function waiting(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function pushAmazonDataToDB(
  data,
  marketplaceId,
  accountName,
  userId,
  addQuantity
) {
  try {
    const file = await FileStorages.findOne({
      where: {
        userId: userId,
      },
      raw: true,
    });

    const currentDate = new Date();

    const report = await processFile(
      file.fileUrl + `?t=${currentDate.getTime()}`
    );

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    const finalData = [];
    for (var i = 0; i < data.length; i++) {
      const item = data[i];
      console.log(item.asin1);

      if (!item.asin1) {
        continue;
      }
      const cskuExist = await csku.findOne({
        where: {
          channelId: item.asin1,
          userId: userId,
          accountName: accountName,
        },
      });

      if (cskuExist) {
        console.log("Product Exists. Skipping");
        continue;
      }

      let status = "live";
      if (item.status === "Active") {
        status = "live";
      } else if (item.status === "Inactive") {
        status = "deleted";
      } else if (item.status === "Incomplete") {
        status = "draft";
      }

      const accessToken = await getAccessToken(
        token.dataValues.client_id,
        token.dataValues.client_secret,
        token.dataValues.refreshToken
      );

      let amazonData;
      let error;

      await waiting(100);
      try {
        let config = {
          method: "get",
          maxBodyLength: Infinity,
          url: `https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/${item.asin1}?marketplaceIds=A2VIGQ35RCS4UG&includedData=summaries,attributes,salesRanks,productTypes,images,identifiers,dimensions,classifications,relationships&locale=en_US`,
          headers: {
            Accept: "application/json",
            "X-Amz-Access-Token": accessToken,
          },
        };

        await axios
          .request(config)
          .then((response) => {
            amazonData = response.data;
          })
          .catch((error) => {
            console.log(error);
          });
      } catch (err) {
        console.log(err);
        error = err;
      }

      const skuFound = report?.find((r) => r.SellerSKU === item["seller-sku"]);
      if (amazonData && skuFound) {
        console.log("SKU Found");
        finalData.push({
          channelId: item.asin1,
          variantId: item["listing-id"] ?? item["seller-sku"],
          isku: item["seller-sku"],
          categoryId:
            amazonData?.classifications[0]?.classifications[0]
              ?.classificationId,
          categoryName:
            amazonData?.classifications[0]?.classifications[0]?.displayName,
          price: item.price,
          mrp: item.price,
          images: amazonData?.images[0]?.images?.map((image) => image.link),
          quantity: item.quantity ?? 1,
          currency: amazonData.attributes?.listPrice
            ? amazonData.attributes?.list_price[0]?.currency
            : "N/A",
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId,
          title: item.title,
          status: status,
          siteId: amazonData.summaries[0].marketplaceId,
          sku_found: item["seller-sku"] ? true : false,
          variationId: skuFound?.variantSKU ?? "",
          partnerSku: skuFound["Partner SKU"] ?? "",
          itemSpecifics:
            amazonData?.attributes.length > 0 &&
              Array.isArray(amazonData?.attributes)
              ? amazonData?.attributes
                .push(amazonData?.dimensions[0])
                .filter(Boolean)
              : [],
        });
      } else if (amazonData && !skuFound) {
        console.log("SKU Not Found");
        finalData.push({
          channelId: item.asin1,
          variantId: item["listing-id"] ?? item["seller-sku"],
          isku: item["seller-sku"],
          price: item.price,
          mrp: item.price,
          images: [item["image-url"]],
          quantity: item.quantity ?? 1,
          currency: item.currency,
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId,
          title: item["item-name"],
          status: status,
          siteId: item.siteId,
          sku_found: item["seller-sku"] ? true : false,
          error: error,
          itemSpecifics:
            amazonData?.attributes.length > 0 &&
              Array.isArray(amazonData?.attributes)
              ? amazonData?.attributes
                .push(amazonData?.dimensions[0])
                .filter(Boolean)
              : [],
        });
      }
    }
    await csku.bulkCreate(finalData);
  } catch (err) {
    // newRelic.recordCustomEvent("Error in catalogue fetch for: ", accountName, ". Error: ", err.message);
    console.log(err);
    throw err;
  }
}

// exports.GetCatalogue30Days = async (req, res) => {
//   const functionName = 'GetCatalouge30Days'
//   try {
//     const { userId, marketplaceId, accountName, addQuantity } = req.body
//     const marketPlace = await Marketplace.findOne({
//       where: {
//         id: marketplaceId
//       }
//     })
//     const token = await Tokens.findOne({
//       where: {
//         userId: userId,
//         marketPlaceId: marketplaceId,
//         accountName: accountName
//       }
//     })

//     if (!token) {
//       return res.status(500).json({
//         success: false,
//         status: 500,
//         message: 'Token for this user not found.'
//       })
//     }

//     const finalData = []
//     for (var i = 0; i < data.length; i++) {
//       const item = data[i]

//       let status = 'live'
//       if (item.status === 'Active') {
//         status = 'live'
//       } else if (item.status === 'Inactive') {
//         status = 'deleted'
//       } else if (item.status === 'Incomplete') {
//         status = 'draft'
//       }

//       const accessToken = await getAccessToken(
//         token.dataValues.client_id,
//         token.dataValues.client_secret,
//         token.dataValues.refreshToken
//       )

//       let amazonData
//       let error

//       await waiting(100)
//       try {
//         let config = {
//           method: 'get',
//           maxBodyLength: Infinity,
//           url: `https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/${item.asin1}?marketplaceIds=A2VIGQ35RCS4UG&includedData=summaries,attributes,salesRanks,productTypes,images,identifiers,dimensions,classifications,relationships&locale=en_US`,
//           headers: {
//             Accept: 'application/json',
//             'X-Amz-Access-Token': accessToken
//           }
//         }

//         await axios
//           .request(config)
//           .then(response => {
//             amazonData = response.data
//           })
//           .catch(error => {
//             console.log(error)
//           })
//       } catch (err) {
//         console.log(err)
//         error = err
//       }

//       const skuFound = report?.find(r => r.SellerSKU === item['seller-sku'])
//       if (amazonData && skuFound) {
//         console.log('SKU Found')
//         finalData.push({
//           channelId: item.asin1,
//           variantId: item['listing-id'] ?? item['seller-sku'],
//           isku: item['seller-sku'],
//           categoryId:
//             amazonData?.classifications[0]?.classifications[0]
//               ?.classificationId,
//           categoryName:
//             amazonData?.classifications[0]?.classifications[0]?.displayName,
//           price: item.price,
//           mrp: item.price,
//           images: amazonData?.images[0]?.images?.map(image => image.link),
//           quantity: item.quantity ?? 1,
//           currency: amazonData.attributes?.listPrice
//             ? amazonData.attributes?.list_price[0]?.currency
//             : 'N/A',
//           marketplaceId: marketplaceId,
//           accountName: accountName,
//           userId: userId,
//           title: item.title,
//           status: status,
//           siteId: amazonData.summaries[0].marketplaceId,
//           sku_found: item['seller-sku'] ? true : false,
//           variationId: skuFound?.variantSKU ?? '',
//           partnerSku: skuFound['Partner SKU'] ?? '',
//           itemSpecifics:
//             amazonData?.attributes.length > 0 &&
//             Array.isArray(amazonData?.attributes)
//               ? amazonData?.attributes
//                   .push(amazonData?.dimensions[0])
//                   .filter(Boolean)
//               : []
//         })
//       } else if (amazonData && !skuFound) {
//         console.log('SKU Not Found')
//         finalData.push({
//           channelId: item.asin1,
//           variantId: item['listing-id'] ?? item['seller-sku'],
//           isku: item['seller-sku'],
//           price: item.price,
//           mrp: item.price,
//           images: [item['image-url']],
//           quantity: item.quantity ?? 1,
//           currency: item.currency,
//           marketplaceId: marketplaceId,
//           accountName: accountName,
//           userId: userId,
//           title: item['item-name'],
//           status: status,
//           siteId: item.siteId,
//           sku_found: item['seller-sku'] ? true : false,
//           error: error,
//           itemSpecifics:
//             amazonData?.attributes.length > 0 &&
//             Array.isArray(amazonData?.attributes)
//               ? amazonData?.attributes
//                   .push(amazonData?.dimensions[0])
//                   .filter(Boolean)
//               : []
//         })
//       }
//     }
//     console.log(finalData.length)
//     await csku.bulkCreate(finalData)
//   } catch (err) {
//     // newRelic.recordCustomEvent("Error in catalogue fetch for: ", accountName, ". Error: ", err.message);
//     console.log(err)
//     throw err
//   }
// }

exports.UpdateCskusPrices = async (req, res) => {
  const t = await sequelize.transaction();
  const functionName = "UpdateCskusPrices";

  try {
    const { products, userId } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request format",
      });
    }

    const updates = [];
    const errors = [];

    for (const product of products) {
      try {
        const { channelId, productId, accountName, newPrice } = product;
        const id = productId;

        const existingProduct = await csku.findOne({
          where: { channelId, id, accountName },
        });

        if (!existingProduct) {
          errors.push({ productId, error: "Product not found" });
          continue;
        }

        // Find marketplace details
        const marketplace = await Marketplace.findOne({
          where: {
            id: existingProduct.dataValues.marketplaceId,
          },
        });

        // Check if it's an eBay marketplace
        if (!marketplace?.dataValues?.parentMarketplace?.includes("ebay")) {
          errors.push({
            productId,
            error: "Not an eBay marketplace",
          });
          continue;
        }

        // Get eBay token
        const token = await Tokens.findOne({
          where: {
            marketPlaceId: existingProduct.dataValues.marketplaceId,
            userId: userId,
            accountName: existingProduct.dataValues.accountName,
          },
        });

        if (!token) {
          throw new Error("Token not found for this user");
        }

        // Initialize eBay
        const eBay = new ebay({
          appId: process.env.APP_ID,
          certId: process.env.CERT_ID,
          sandbox: false,
          devId: process.env.DEV_ID,
          authToken: token?.dataValues?.token,
        });

        eBay.oAuth2.setCredentials({
          refresh_token: token?.dataValues?.refreshToken,
        });

        // Check token expiry and refresh if needed
        let startdate = moment().add(5, "hours").add(30, "minutes");
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

        if (hoursDifference >= 2) {
          await refreshToken(eBay, token);
        }

        // Try updating on eBay first
        let ebayUpdateSuccessful = false;

        try {
          // Ensure price is a valid number and properly formatted
          const formattedPrice = parseFloat(newPrice).toFixed(2);

          await eBay.trading.ReviseFixedPriceItem({
            Item: {
              ItemID: existingProduct.dataValues.channelId,
              StartPrice: formattedPrice,
            },
          });
          ebayUpdateSuccessful = true;

          await apiCallLog(
            "ReviseFixedPriceItem",
            "/catalogue/update-cskus-price",
            functionName,
            {
              ItemID: existingProduct.dataValues.channelId,
              StartPrice: formattedPrice,
            },
            {},
            {},
            "success"
          );
        } catch (err) {
          if (
            err.message.includes(
              "This operation is not allowed for inventory items"
            )
          ) {
            try {
              const formattedPrice = parseFloat(newPrice).toFixed(2);

              // For inventory items, use inventory API
              const inventoryItem = await eBay.sell.inventory.getInventoryItem(
                existingProduct.dataValues.isku
              );

              // Get all existing offers for the SKU
              const offers = await eBay.sell.inventory.getOffers({
                sku: existingProduct.dataValues.isku,
              });

              // Update each offer with the new price
              if (offers && offers.offers && offers.offers.length > 0) {
                for (const offer of offers.offers) {
                  offer.pricingSummary.price = {
                    value: formattedPrice,
                    currency: existingProduct.dataValues.currency,
                  };

                  await eBay.sell.inventory.updateOffer(offer.offerId, offer);
                }
                ebayUpdateSuccessful = true;
              } else {
                throw new Error("No offers found for the inventory item");
              }

              await apiCallLog(
                "updateOffer",
                "/catalogue/update-cskus-price",
                functionName,
                {
                  sku: existingProduct.dataValues.isku,
                  price: formattedPrice,
                },
                {},
                {},
                "success"
              );
            } catch (inventoryErr) {
              await apiCallLog(
                "updateOffer",
                "/catalogue/update-cskus-price",
                functionName,
                {
                  sku: existingProduct.dataValues.isku,
                  price: newPrice,
                },
                {},
                inventoryErr,
                "error"
              );
              throw inventoryErr;
            }
          } else {
            await apiCallLog(
              "ReviseFixedPriceItem",
              "/catalogue/update-cskus-price",
              functionName,
              {
                ItemID: existingProduct.dataValues.channelId,
                StartPrice: newPrice,
              },
              {},
              err,
              "error"
            );
            throw err;
          }
        }

        // Only update CSKU if eBay update was successful
        if (ebayUpdateSuccessful) {
          await csku.update(
            {
              price: parseFloat(newPrice),
              updated_at: sequelize.literal("CURRENT_TIMESTAMP"),
            },
            {
              where: { channelId, id, accountName },
              transaction: t,
            }
          );

          updates.push({
            productId,
            oldPrice: existingProduct.price,
            newPrice: parseFloat(newPrice),
          });
        }
      } catch (error) {
        errors.push({
          productId: product.productId,
          error: error.message,
        });
      }
    }

    if (errors.length > 0 && errors.length === products.length) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        updates: [],
        errors,
      });
    }

    await t.commit();

    return res.json({
      success: true,
      updates,
      errors: errors.length > 0 ? errors : [],
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Error Updating Cskus' Price`, error.message);
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: "Internal server error: " + error.message,
    });
  }
};

// exports.UpdateCskusQuantities = async (req, res) => {
//   const t = await sequelize.transaction();
//   const functionName = 'UpdateCskusQuantities';

//   try {
//     const { products, userId } = req.body;

//     if (!products || !Array.isArray(products)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid request format',
//       });
//     }

//     const updates = [];
//     const errors = [];

//     for (const product of products) {
//       try {
//         const { channelId, productId, accountName, newQuantity } = product;
//         const id = productId;

//         const existingProduct = await csku.findOne({
//           where: { channelId, id, accountName }
//         });

//         if (!existingProduct) {
//           errors.push({ productId, error: 'Product not found' });
//           continue;
//         }

//         // Ensure quantity is non-negative
//         const finalQuantity = Math.max(0, parseInt(newQuantity, 10));

//         // Find marketplace details
//         const marketplace = await Marketplace.findOne({
//           where: {
//             id: existingProduct.dataValues.marketplaceId
//           }
//         });

//         // Check if it's an eBay marketplace
//         if (!marketplace?.dataValues?.parentMarketplace?.includes('ebay')) {
//           errors.push({
//             productId,
//             error: 'Not an eBay marketplace'
//           });
//           continue;
//         }

//         // Get eBay token
//         const token = await Tokens.findOne({
//           where: {
//             marketPlaceId: existingProduct.dataValues.marketplaceId,
//             userId: userId,
//             accountName: existingProduct.dataValues.accountName
//           }
//         });

//         if (!token) {
//           throw new Error("Token not found for this user");
//         }

//         // Initialize eBay
//         const eBay = new ebay({
//           appId: process.env.APP_ID,
//           certId: process.env.CERT_ID,
//           sandbox: false,
//           devId: process.env.DEV_ID,
//           authToken: token?.dataValues?.token
//         });

//         eBay.oAuth2.setCredentials({
//           refresh_token: token?.dataValues?.refreshToken
//         });

//         // Check token expiry and refresh if needed
//         let startdate = moment().add(5, 'hours').add(30, 'minutes');
//         let tokenExpiresDate = moment(token.lastTokenRefreshDate);
//         let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

//         if (hoursDifference >= 2) {
//           await refreshToken(eBay, token);
//         }

//         // Try updating on eBay first
//         let ebayUpdateSuccessful = false;

//         try {
//           await eBay.trading.ReviseFixedPriceItem({
//             Item: {
//               ItemID: existingProduct.dataValues.channelId,
//               Quantity: finalQuantity
//             }
//           });
//           ebayUpdateSuccessful = true;

//           await apiCallLog(
//             'ReviseFixedPriceItem',
//             '/catalogue/update-cskus-quantity',
//             functionName,
//             {
//               ItemID: existingProduct.dataValues.channelId,
//               Quantity: finalQuantity
//             },
//             {},
//             {},
//             'success'
//           );
//         } catch (err) {
//           if (err.message.includes('This operation is not allowed for inventory items')) {
//             try {
//               await eBay.sell.inventory.bulkUpdatePriceQuantity({
//                 requests: [{
//                   shipToLocationAvailability: {
//                     quantity: finalQuantity
//                   },
//                   sku: existingProduct.dataValues.isku
//                 }]
//               });
//               ebayUpdateSuccessful = true;

//               await apiCallLog(
//                 'bulkUpdatePriceQuantity',
//                 '/catalogue/update-cskus-quantity',
//                 functionName,
//                 {
//                   sku: existingProduct.dataValues.isku,
//                   quantity: finalQuantity
//                 },
//                 {},
//                 {},
//                 'success'
//               );
//             } catch (inventoryErr) {
//               await apiCallLog(
//                 'bulkUpdatePriceQuantity',
//                 '/catalogue/update-cskus-quantity',
//                 functionName,
//                 {
//                   sku: existingProduct.dataValues.isku,
//                   quantity: finalQuantity
//                 },
//                 {},
//                 inventoryErr,
//                 'error'
//               );
//               throw inventoryErr;
//             }
//           } else if (err.message.includes('Auction ended.')) {
//             await apiCallLog(
//               'ReviseFixedPriceItem',
//               '/catalogue/update-cskus-quantity',
//               functionName,
//               {
//                 ItemID: existingProduct.dataValues.channelId,
//                 Quantity: finalQuantity
//               },
//               {},
//               err,
//               'error'
//             );
//             // Update status to completed if auction ended
//             await csku.update(
//               { status: "completed" },
//               {
//                 where: { channelId, id, accountName },
//                 transaction: t
//               }
//             );
//             continue;
//           } else {
//             await apiCallLog(
//               'ReviseFixedPriceItem',
//               '/catalogue/update-cskus-quantity',
//               functionName,
//               {
//                 ItemID: existingProduct.dataValues.channelId,
//                 Quantity: finalQuantity
//               },
//               {},
//               err,
//               'error'
//             );
//             throw err;
//           }
//         }

//         // Only update CSKU if eBay update was successful
//         if (ebayUpdateSuccessful) {
//           await csku.update(
//             {
//               quantity: finalQuantity,
//               updated_at: sequelize.literal('CURRENT_TIMESTAMP'),
//             },
//             {
//               where: { channelId, id, accountName },
//               transaction: t,
//             }
//           );

//           updates.push({
//             productId,
//             oldQuantity: existingProduct.quantity,
//             newQuantity: finalQuantity,
//           });
//         }

//       } catch (error) {
//         errors.push({
//           productId: product.productId,
//           error: error.message,
//         });
//       }
//     }

//     if (errors.length > 0 && errors.length === products.length) {
//       await t.rollback();
//       return res.status(400).json({ success: false, errors });
//     }

//     await t.commit();

//     return res.json({
//       success: true,
//       updates,
//       errors: errors.length > 0 ? errors : undefined,
//     });
//   } catch (error) {
//     newRelic.recordCustomEvent(`Error Updating Cskus' Quantity`, error.message);
//     await t.rollback();
//     return res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message,
//     });
//   }
// };

exports.UpdateCskusQuantities = async (req, res) => {
  const t = await sequelize.transaction();
  const functionName = "UpdateCskusQuantities";

  try {
    const { products, userId } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request format",
      });
    }

    const updates = [];
    const errors = [];
    const productStatuses = [];

    for (const product of products) {
      try {
        const { channelId, productId, accountName, newQuantity } = product;
        const id = productId;

        const existingProduct = await csku.findOne({
          where: { channelId, id, accountName },
        });

        if (!existingProduct) {
          errors.push({
            productId,
            error: "Product not found in database",
            details: {
              channelId,
              accountName,
            },
          });
          continue;
        }

        // Ensure quantity is non-negative
        const finalQuantity = Math.max(0, parseInt(newQuantity, 10));

        // Find marketplace details
        const marketplace = await Marketplace.findOne({
          where: {
            id: existingProduct.dataValues.marketplaceId,
          },
        });

        // Check if it's an eBay marketplace
        if (!marketplace?.dataValues?.parentMarketplace?.includes("ebay")) {
          errors.push({
            productId,
            error: "Not an eBay marketplace",
            details: {
              marketplace: marketplace?.dataValues?.parentMarketplace,
            },
          });
          continue;
        }

        // Get eBay token
        const token = await Tokens.findOne({
          where: {
            marketPlaceId: existingProduct.dataValues.marketplaceId,
            userId: userId,
            accountName: existingProduct.dataValues.accountName,
          },
        });

        if (!token) {
          errors.push({
            productId,
            error: "Authentication token not found for this user",
            details: {
              marketplaceId: existingProduct.dataValues.marketplaceId,
              accountName: existingProduct.dataValues.accountName,
            },
          });
          continue;
        }

        // Initialize eBay
        const eBay = new ebay({
          appId: process.env.APP_ID,
          certId: process.env.CERT_ID,
          sandbox: false,
          devId: process.env.DEV_ID,
          authToken: token?.dataValues?.token,
        });

        eBay.oAuth2.setCredentials({
          refresh_token: token?.dataValues?.refreshToken,
        });

        // Check token expiry and refresh if needed
        let startdate = moment().add(5, "hours").add(30, "minutes");
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

        if (hoursDifference >= 2) {
          await refreshToken(eBay, token);
        }

        // Try updating on eBay first
        let ebayUpdateSuccessful = false;
        let updateMethod = "";

        try {
          await eBay.trading.ReviseFixedPriceItem({
            Item: {
              ItemID: existingProduct.dataValues.channelId,
              Quantity: finalQuantity,
            },
          });
          ebayUpdateSuccessful = true;
          updateMethod = "ReviseFixedPriceItem";

          await apiCallLog(
            "ReviseFixedPriceItem",
            "/catalogue/update-cskus-quantity",
            functionName,
            {
              ItemID: existingProduct.dataValues.channelId,
              Quantity: finalQuantity,
            },
            {},
            {},
            "success"
          );
        } catch (err) {
          if (
            err.message.includes(
              "This operation is not allowed for inventory items"
            )
          ) {
            try {
              await eBay.sell.inventory.bulkUpdatePriceQuantity({
                requests: [
                  {
                    shipToLocationAvailability: {
                      quantity: finalQuantity,
                    },
                    sku: existingProduct.dataValues.isku,
                  },
                ],
              });
              ebayUpdateSuccessful = true;
              updateMethod = "bulkUpdatePriceQuantity";

              await apiCallLog(
                "bulkUpdatePriceQuantity",
                "/catalogue/update-cskus-quantity",
                functionName,
                {
                  sku: existingProduct.dataValues.isku,
                  quantity: finalQuantity,
                },
                {},
                {},
                "success"
              );
            } catch (inventoryErr) {
              await apiCallLog(
                "bulkUpdatePriceQuantity",
                "/catalogue/update-cskus-quantity",
                functionName,
                {
                  sku: existingProduct.dataValues.isku,
                  quantity: finalQuantity,
                },
                {},
                inventoryErr,
                "error"
              );

              errors.push({
                productId,
                error: inventoryErr.message,
                details: {
                  method: "bulkUpdatePriceQuantity",
                  sku: existingProduct.dataValues.isku,
                },
              });
              continue;
            }
          } else if (err.message.includes("Auction ended.")) {
            await apiCallLog(
              "ReviseFixedPriceItem",
              "/catalogue/update-cskus-quantity",
              functionName,
              {
                ItemID: existingProduct.dataValues.channelId,
                Quantity: finalQuantity,
              },
              {},
              err,
              "error"
            );

            // Update status to completed if auction ended
            await csku.update(
              { status: "completed" },
              {
                where: { channelId, id, accountName },
                transaction: t,
              }
            );

            errors.push({
              productId,
              error: "Auction has ended",
              details: {
                channelId,
                status: "completed",
              },
            });
            continue;
          } else {
            await apiCallLog(
              "ReviseFixedPriceItem",
              "/catalogue/update-cskus-quantity",
              functionName,
              {
                ItemID: existingProduct.dataValues.channelId,
                Quantity: finalQuantity,
              },
              {},
              err,
              "error"
            );

            errors.push({
              productId,
              error: err.message,
              details: {
                method: "ReviseFixedPriceItem",
                channelId: existingProduct.dataValues.channelId,
              },
            });
            continue;
          }
        }

        // Only update CSKU if eBay update was successful
        if (ebayUpdateSuccessful) {
          await csku.update(
            {
              quantity: finalQuantity,
              updated_at: sequelize.literal("CURRENT_TIMESTAMP"),
            },
            {
              where: { channelId, id, accountName },
              transaction: t,
            }
          );

          updates.push({
            productId,
            oldQuantity: existingProduct.quantity,
            newQuantity: finalQuantity,
            updateMethod,
            channelId,
            sku: existingProduct.dataValues.isku,
          });

          productStatuses.push({
            productId,
            status: "success",
            details: {
              method: updateMethod,
              oldQuantity: existingProduct.quantity,
              newQuantity: finalQuantity,
            },
          });
        }
      } catch (error) {
        errors.push({
          productId: product.productId,
          error: error.message,
          details: {
            type: "Unexpected error",
            productInfo: {
              channelId: product.channelId,
              accountName: product.accountName,
            },
          },
        });
      }
    }

    if (errors.length > 0 && errors.length === products.length) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        errors,
        message: "All product updates failed",
      });
    }

    await t.commit();

    return res.json({
      success: true,
      updates,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: products.length,
        successful: updates.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Error Updating Cskus' Quantity`, error.message);
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      details: {
        type: "SystemError",
        functionName,
      },
    });
  }
};

exports.GetCatalogue30Days = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName, addQuantity } = req.body;
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    let listings = [];
    if (marketPlace.url?.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      eBay.OAuth2.setCredentials(token.dataValues.token);
      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }
      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/catalogue/sync-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {
      //   await apiCallLog("GetTokenStatus","/catalogue/sync-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   await refreshToken(eBay, token);
      // }
      // Get today's date
      const today = moment();
      // Calculate the date one month ago from today
      const oneMonthAgo = today.subtract(1, "months");
      const oneMonthAgoIso = oneMonthAgo.format("YYYY-MM-DD");
      const startDate = new Date(oneMonthAgoIso);
      startDate.setUTCHours(0, 0, 0, 0);

      const todayDate = moment().format("YYYY-MM-DD");
      const endDate = new Date(todayDate);
      endDate.setUTCHours(23, 59, 59, 999);
      const data = await fetchSellerList(
        eBay,
        1,
        startDate.toISOString(),
        endDate.toISOString()
      );

      if (data?.ItemArray?.Item) {
        listings.push(...data?.ItemArray?.Item);
        await this.pushData(
          data,
          marketplaceId,
          accountName,
          userId,
          addQuantity
        );
        token.itemsFetched += listings.length;
        await token.save();
      }
      if (data?.HasMoreItems) {
        for (var i = 79; i <= data?.PaginationResult?.TotalNumberOfPages; i++) {
          let startdate = moment();
          // .add(5, 'hours').add(30, 'minutes')
          let tokenExpiresDate = moment(token.lastTokenRefreshDate);
          let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

          if (hoursDifference >= 2) {
            await refreshToken(eBay, token);
          }
          // try {
          //   await eBay.trading.GetTokenStatus({
          //     RequesterCredentials: {
          //       eBayAuthToken: token.dataValues.token,
          //     },
          //   });
          //   await apiCallLog("GetTokenStatus","/catalouge/sync-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
          // } catch (err) {
          //   await apiCallLog("GetTokenStatus","/catalouge/sync-catalogue",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
          //   await refreshToken(eBay, token);
          // }
          token.itemsFetched = listings.length;
          const data = await fetchSellerList(
            eBay,
            i,
            startDate.toISOString(),
            endDate.toISOString(),
            accountName
          );
          if (data?.ItemArray?.Item) {
            listings.push(...data?.ItemArray?.Item);
            await this.pushData(
              data,
              marketplaceId,
              accountName,
              userId,
              addQuantity
            );
            token.itemsFetched += listings.length;
            await token.save();
          }
        }
      }
      token.fetchDate = endDate.toISOString();
      await token.save();
    } else if (marketPlace.url?.includes("shopify")) {
      listings = await GetShopifyCatalogueRecent(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity
        // recent
      );
    } else if (marketPlace.url?.includes("woocommerce")) {
      listings = await GetWoocommerceCatalogueRecent(
        accountName,
        token?.dataValues?.token,
        marketplaceId,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("walmart")) {
      console.log("Inside walmart");
      listings = await GetWalmartRecentCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("sellerflex")) {
      const today = moment();
      const startDate = moment().subtract(30, "days").toISOString();

      listings = await fetchSellerFlexListings(
        startDate,
        today.toISOString(),
        token.dataValues.client_id,
        token.dataValues.client_secret,
        token.dataValues.refreshToken,
        token.dataValues.amzMarketplaceId
      );

      console.log(listings.length);

      await pushAmazonDataToDB(
        listings,
        marketplaceId,
        accountName,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("etsy")) {
      listings = await GetEtsyCatalogue(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity,
        "sync-catalogue"
      );
    }

    return res.status(200).json({
      success: true,
      status: 200,
      data: listings,
    });
  } catch (err) {
    newRelic.recordCustomEvent(`Error in catalogue fetch`, err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
      fullError: err.toString(),
    });
  }
};

async function fetchSellerList(
  eBay,
  pageNumber,
  startDate,
  endDate,
  accountName
) {
  console.log(startDate, endDate);
  const functionName = "fetchSellerList";
  try {
    const data = await eBay.trading.GetSellerList({
      StartTimeFrom: startDate,
      StartTimeTo: endDate,
      IncludeVariations: true,
      Pagination: {
        EntriesPerPage: 100,
        PageNumber: pageNumber,
      },
      DetailLevel: "ReturnAll",
    });
    await apiCallLog(
      "GetSellerList",
      "/catalogue/get-catalogue or /catalogue/sync-catalogue",
      functionName,
      {
        StartTimeFrom: startDate,
        StartTimeTo: endDate,
        Pagination: {
          EntriesPerPage: 100,
          PageNumber: pageNumber,
        },
        DetailLevel: "ReturnAll",
      },
      data,
      {},
      "success"
    );
    console.log(data);
    return data;
  } catch (error) {
    await apiCallLog(
      "GetSellerList",
      "/catalogue/get-catalogue or /catalogue/sync-catalogue",
      functionName,
      {
        StartTimeFrom: startDate,
        StartTimeTo: endDate,
        Pagination: {
          EntriesPerPage: 100,
          PageNumber: pageNumber,
        },
        DetailLevel: "ReturnAll",
      },
      {},
      error.meta,
      "error"
    );
    newRelic.recordCustomEvent("Error in ebay api: ", error.message);
    console.log(error);
    throw error;
  }
}

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.dataValues.refreshToken,
      scopes
    );

    console.log(newToken);
    if (JSON.parse(newToken).error) {
      token.status = "inactive";
      await token.save();

      const nodemailer = require("nodemailer");

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password, // Replace with your SMTP password
        },
      });

      const userData = await User.findOne({
        where: { id: token.dataValues.userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: "Token Expired!",
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`,
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error);
            console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
      console.log(newToken.error);
      throw newToken.error;
    }

    const accessToken = JSON.parse(newToken);
    console.log(accessToken);
    eBay.OAuth2.setCredentials(accessToken.access_token);
    // token.token = accessToken.access_token
    const lastTokenRefreshDate = moment()
      .add(5, "hours")
      .add(30, "minutes")
      .toISOString();
    await Tokens.update(
      {
        token: accessToken?.access_token,
        lastTokenRefreshDate: lastTokenRefreshDate,
      },
      {
        where: {
          id: token?.dataValues?.id || token?.id,
        },
      }
    );

    return accessToken.access_token;
    // await token.save()
  } catch (error) {
    newRelic.recordCustomEvent(`Error while token refresh: ${error}`);
    console.log(error);
    throw error;
  }
}

exports.pushData = async (
  data,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  config_id = null, // Default to null if not provided
  variationMap = null,
  config_version = null
) => {
  try {
    const cskus = [];
    let iskus = [];
    const variations = [];
    let sourceVariation;
    if (variationMap) {
      sourceVariation = _.keyBy(variationMap, (obj) => Object.keys(obj)[0]);
    }
    await Promise.all(
      data.ItemArray.Item?.map(async (item) => {
        let sku = "";
        let storeCategoryId = "";
        let storeCategoryName = "";

        if (item.SKU) {
          sku = item.SKU;
        } else if (item.Variations) {
          sku = Array.isArray(item.Variations.Variation)
            ? item.ItemID
            : item.Variations.Variation.SKU;
        } else {
          sku = item.ItemID;
        }

        if (item.Storefront) {
          if (
            item.Storefront.StoreCategoryID &&
            item.Storefront.StoreCategoryID != 0
          ) {
            storeCategoryId = item.Storefront.StoreCategoryID;
            if (item.Storefront.StoreCategoryName) {
              storeCategoryName = item.StoreFront.StoreCategoryName;
            }
          } else if (
            item.Storefront.StoreCategory2ID &&
            item.Storefront.StoreCategory2ID != 0
          ) {
            storeCategoryId = item.Storefront.StoreCategory2ID;
            if (item.Storefront.StoreCategory2Name) {
              storeCategoryName = item.StoreFront.StoreCategory2Name;
            }
          }
        }

        await isku
          .findOne({
            where: {
              isku: sku.toString(),
              userId: userId,
            },
          })
          .then(async (iskuExist) => {
            if (iskuExist && addQuantity == true) {
              iskuExist.quantity = parseInt(iskuExist.quantity) + item.Quantity;
              await iskuExist.save();
            } else if (!iskuExist) {
              iskus.push({
                isku: sku,
                costPrice: item.StartPrice?.value,
                title: item.Title,
                images: Array.isArray(item.PictureDetails?.PictureURL)
                  ? item.PictureDetails?.PictureURL
                  : [item.PictureDetails?.PictureURL],
                quantity: item.Quantity - item?.SellingStatus?.QuantitySold,
                currency: item.StartPrice.currencyID,
                accountName: accountName,
                marketplaceId: marketplaceId,
                userId: userId,
              });
            }
          });
        await csku
          .findOne({
            where: {
              channelId: item.ItemID.toString(),
              userId: userId,
            },
          })
          .then(async (cskuExist) => {
            let status = "";
            if (item.SellingStatus.ListingStatus == "Active") {
              status = "live";
            } else if (item.SellingStatus.ListingStatus == "Completed") {
              status = "completed";
            } else if (item.SellingStatus.ListingStatus == "Ended") {
              status = "deleted";
            } else if (item.SellingStatus.ListingStatus != "Active") {
              status = "completed";
            }

            let site = "";
            if (item.Site) {
              const siteData = await Geosite.findOne({
                where: { countryName: item.Site },
              });
              site = siteData.dataValues.globalId;
            }

            if (!cskuExist) {
              cskus.push({
                channelId: item.ItemID,
                variantId: sku,
                isku: item.SKU ? item.SKU : item.ItemID,
                price: item.StartPrice.value,
                mrp: item.StartPrice.value,
                images: Array.isArray(item.PictureDetails?.PictureURL)
                  ? item.PictureDetails?.PictureURL
                  : [item.PictureDetails?.PictureURL],
                description: item.Description,
                categoryId: item.PrimaryCategory.CategoryID,
                categoryName: item.PrimaryCategory.CategoryName,
                quantity: item?.Quantity - item?.SellingStatus?.QuantitySold,
                currency: item.StartPrice.currencyID,
                itemSpecifics: item.ItemSpecifics?.NameValueList,
                itemCompatibility: item.ItemCompatibilityList?.NameValueList,
                sellerProfile: item.SellerProfiles,
                marketplaceId: marketplaceId,
                accountName: accountName,
                userId: userId,
                title: item.Title,
                status: status,
                siteId: site,
                sku_found: item.SKU ? true : false,
                storeCategoryId: storeCategoryId,
                storeCategoryName: storeCategoryName,
                ...(config_id
                  ? {
                    config_id,
                  }
                  : {}),
                ...(config_version
                  ? {
                    config_version,
                  }
                  : {}),
                end_date: item.ListingDetails.EndTime
                  ? item.ListingDetails.EndTime
                  : null,
              });

              if (item.Variations) {
                if (Array.isArray(item.Variations.Variation)) {
                  item.Variations.Variation.map((variation) => {
                    let sourceVariationId;
                    if (variationMap) {
                      console.log("Variation map started for source");
                      const foundVariation =
                        sourceVariation[variation.SKU] || null;
                      if (foundVariation) {
                        sourceVariationId =
                          foundVariation[variation.SKU] || null;
                      }
                    }

                    variations.push({
                      channel_id: item.ItemID,
                      variation_id: variation.SKU,
                      variation: variation.VariationSpecifics.NameValueList,
                      price: variation.StartPrice.value,
                      quantity: variation.Quantity,
                      userId: userId,
                      account_name: accountName,
                      marketplace_id: marketplaceId,
                      source_variant_id: sourceVariationId
                        ? sourceVariationId
                        : null,
                      ...(config_id
                        ? {
                          config_id,
                        }
                        : {}),
                      ...(config_version
                        ? {
                          config_version,
                        }
                        : {}),
                    });
                  });
                } else {
                  let sourceVariationId;
                  // if (variationMap) {
                  //   console.log("variation Source Started ")
                  //   const foundVariation = variationMap.find(items => Object.keys(items)[0] === item.Variations.Variation.SKU);
                  //   if (foundVariation) {
                  //     sourceVariationId = foundVariation.value;
                  //     console.log("source Variation ID >> ", sourceVariationId)
                  //   }
                  // }

                  if (variationMap) {
                    console.log("Variation map started for source");
                    const foundVariation =
                      sourceVariation[item.Variations.Variation.SKU] || null;
                    if (foundVariation) {
                      sourceVariationId =
                        foundVariation[item.Variations.Variation.SKU] || null;
                    }
                  }

                  variations.push({
                    channel_id: item.ItemID,
                    variation_id: item.Variations.Variation.SKU,
                    variation:
                      item.Variations.Variation.VariationSpecifics
                        .NameValueList,
                    price: item.Variations.Variation.StartPrice.value,
                    quantity: item.Variations.Variation.Quantity,
                    userId: userId,
                    account_name: accountName,
                    source_variant_id: sourceVariationId
                      ? sourceVariationId
                      : null,
                    ...(config_id
                      ? {
                        config_id,
                      }
                      : {}),
                    ...(config_version
                      ? {
                        config_version,
                      }
                      : {}),
                  });
                }
              }
            } else {
              cskuExist.isku = item.SKU ? item.SKU : item.ItemID;
              cskuExist.status = status;
              cskuExist.quantity = item.Quantity;
              (cskuExist.itemSpecifics = item.ItemSpecifics?.NameValueList),
                (cskuExist.end_date = item.ListingDetails.EndTime
                  ? item.ListingDetails.EndTime
                  : null);
              cskuExist.quantity =
                item.Quantity - item?.SellingStatus?.QuantitySold;
              (cskuExist.itemSpecifics = item.ItemSpecifics?.NameValueList),
                (cskuExist.end_date = item.ListingDetails.EndTime
                  ? item.ListingDetails.EndTime
                  : null);
              cskuExist.description = item.Description;

              await cskuExist.save();

              if (item.Variations) {
                await CatalogueVariation.destroy({
                  where: {
                    channel_id: item.ItemID.toString(),
                    userId: userId,
                    account_name: accountName,
                    marketplace_id: marketplaceId,
                  },
                });

                if (Array.isArray(item.Variations.Variation)) {
                  item.Variations.Variation.map((variation) => {
                    let sourceVariationId;
                    if (variationMap) {
                      console.log("Variation map started for source");
                      const foundVariation =
                        sourceVariation[variation.SKU] || null;
                      if (foundVariation) {
                        sourceVariationId =
                          foundVariation[variation.SKU] || null;
                      }
                    }

                    variations.push({
                      channel_id: item.ItemID,
                      variation_id: variation.SKU,
                      variation: variation.VariationSpecifics.NameValueList,
                      price: variation.StartPrice.value,
                      quantity: variation.Quantity,
                      userId: userId,
                      account_name: accountName,
                      marketplace_id: marketplaceId,
                      source_variant_id: sourceVariationId
                        ? sourceVariationId
                        : null,
                      ...(config_id
                        ? {
                          config_id,
                        }
                        : {}),
                      ...(config_version
                        ? {
                          config_version,
                        }
                        : {}),
                    });
                  });
                } else {
                  let sourceVariationId;
                  // if (variationMap) {
                  //   console.log("variation Source Started ")
                  //   const foundVariation = variationMap.find(items => Object.keys(items)[0] === item.Variations.Variation.SKU);
                  //   if (foundVariation) {
                  //     sourceVariationId = foundVariation.value;
                  //     console.log("source Variation ID >> ", sourceVariationId)
                  //   }
                  // }

                  if (variationMap) {
                    console.log("Variation map started for source");
                    const foundVariation =
                      sourceVariation[item.Variations.Variation.SKU] || null;
                    if (foundVariation) {
                      sourceVariationId =
                        foundVariation[item.Variations.Variation.SKU] || null;
                    }
                  }

                  variations.push({
                    channel_id: item.ItemID,
                    variation_id: item.Variations.Variation.SKU,
                    variation:
                      item.Variations.Variation.VariationSpecifics
                        .NameValueList,
                    price: item.Variations.Variation.StartPrice.value,
                    quantity: item.Variations.Variation.Quantity,
                    userId: userId,
                    account_name: accountName,
                    source_variant_id: sourceVariationId
                      ? sourceVariationId
                      : null,
                    ...(config_id
                      ? {
                        config_id,
                      }
                      : {}),
                    ...(config_version
                      ? {
                        config_version,
                      }
                      : {}),
                  });
                }
              }
            }
          });
      })
    );

    iskus = iskus.filter((obj, index, self) => {
      return index === self.findIndex((o) => o.isku === obj.isku);
    });

    await isku.bulkCreate(iskus);
    await csku.bulkCreate(cskus);
    await CatalogueVariation.bulkCreate(variations);
  } catch (err) {
    newRelic.recordCustomEvent(
      `Error for data push ${err.message} for account ${accountName}`
    );
    newRelic.recordCustomEvent(
      `Error for data push ${err.message} for account ${accountName}`
    );
    // newRelic.recordCustomEvent(
    //   'Error in catalogue fetch for: ',
    //   req.body.accountName,
    //   '. Error: ',
    //   err.message
    // )
    console.log(err);
    throw err;
  }
};

exports.GetEbayCatalogue = async (req, res) => {
  try {
    const {
      page,
      limit,
      marketplaceId,
      accountName,
      userId,
      status,
      search,
      orderBy,
      type,
      siteId,
      destAccount,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = marketplaceId ? { where: { marketplaceId } } : { where: {} };
    const where = {};

    // Fetch marketplace details if provided
    let marketplaces = [];
    if (marketplaceId) {
      marketplaces = await Marketplace.findAll({
        where: { id: marketplaceId },
        attributes: ["id", "parentMarketplace", "image"],
      });
    }

    // User tokens and filtering by account names
    if (userId) {
      const tokens = await Tokens.findAll({ where: { userId } });

      if (!accountName) {
        const accountNames = tokens.map(
          (token) => token.dataValues.accountName
        );

        if (accountNames.length > 0) {
          query.where[Op.and] = {
            accountName: { [Op.in]: accountNames },
            userId,
          };
          where.accountName = accountNames;
          where.userId = userId;
        } else {
          query.where = { userId };
          where.userId = userId;
        }
      }
    }

    // Apply additional filters
    if (accountName) {
      query.where.accountName = accountName;
      where.accountName = accountName;
    }

    let orString = "";
    if (search) {
      query.where[Op.or] = [
        { channelId: search },
        { isku: search },
        { quantity: search },
        { title: { [Op.iLike]: `%${search}%` } },
      ];

      orString = `"channelId" = '${search}' OR isku = '${search}' OR quantity = '${search}' OR title ILIKE '%${search}%'`;
    }
    if (status && status !== "all") query.where.status = status;
    if (siteId) {
      const geoSite = await Geosite.findOne({ where: { globalId: siteId } });
      if (geoSite) query.where.currency = geoSite.dataValues.currency;
    }
    if (destAccount) {
      query.where[Op.and] = {
        copied_to_account: {
          [Op.not]: { [Op.contains]: [destAccount] },
        },
      };
    }

    const orderArg = orderBy ? { order: [[orderBy, type.toUpperCase()]] } : {};

    const whereString = Object.keys(where)
      .map((key) => {
        if (Array.isArray(where[key])) {
          return `"${key}" IN ('${where[key].join("','")}')`;
        } else {
          return `"${key}" = '${where[key]}'`;
        }
      })
      .join(" AND ")
      .concat(orString ? ` AND (${orString})` : "");

    // Fetch the total count of items
    // const count = await csku.count({ where: query.where, distinct: true, col: sequelize.literal('DISTINCT "channelId"') });
    const result = await sequelize.query(
      `SELECT COUNT(DISTINCT "channelId") as count FROM "cskus" WHERE ${whereString}`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    let ids = await csku.findAll({
      attributes: [
        "channelId",
        [
          Sequelize.fn(
            "JSON_AGG",
            Sequelize.fn(
              "JSON_BUILD_OBJECT",
              "id",
              Sequelize.col("id"),
              "channelId",
              Sequelize.col("channelId"),
              "isku",
              Sequelize.col("isku"),
              "variantId",
              Sequelize.col("variantId"),
              "variation",
              Sequelize.col("variation"),
              "price",
              Sequelize.col("price"),
              "title",
              Sequelize.col("title"),
              "mrp",
              Sequelize.col("mrp"),
              "images",
              Sequelize.col("images"),
              "description",
              Sequelize.col("description"),
              "currency",
              Sequelize.col("currency")
            )
          ),
          "variations",
        ],
      ],
      ...query,
      group: ["channelId"], // Grouping by channelId
      limit: parseInt(limit),
      offset: skip,
    });
    query.where.channelId = {
      [Op.in]: ids.map((id) => id.dataValues.channelId),
    };

    let data = await csku.findAll({
      ...query,
      ...orderArg,
      attributes: [
        "id",
        "images",
        "channelId",
        "variantId",
        "accountName",
        "copied_to_account",
        "isku",
        "status",
        "errors",
        "createdAt",
        "updatedAt",
        "title",
        "quantity",
        "currency",
        "price",
        "mrp",
        "categoryId",
        "categoryName",
        "marketplaceId",
        "collections",
        "groupProductId",
        "variation",
        "itemSpecifics",
      ],
      include: [
        {
          model: Marketplace,
          as: "marketplaces",
          attributes: ["id", "parentMarketplace", "image"],
        },
      ],
      // offset: skip,
      // limit: parseInt(limit),
    });

    const cleanCopiedToAccount = (copiedArray) => {
      if (!Array.isArray(copiedArray)) return [];
      const cleanedArray = copiedArray.filter(
        (account) => typeof account === "string" && account.trim() !== ""
      );
      return cleanedArray;
    };

    try {
      const cross_listed_to = [];

      const allTokens = userId
        ? await Tokens.findAll({
          where: { userId },
          attributes: ["accountName", "marketPlaceId"],
          include: [
            {
              model: Marketplace,
              attributes: ["id", "parentMarketplace", "image"],
            },
          ],
        })
        : [];

      const tokenMap = allTokens.reduce((acc, token) => {
        acc[token.dataValues.accountName.trim()] = {
          marketPlaceId: token.dataValues.marketPlaceId,
          marketplaceLogo: token.marketplace?.image,
          marketplaceName: token.marketplace?.parentMarketplace,
        };
        return acc;
      }, {});
      for (const item of data) {
        const validCopiedToAccount = cleanCopiedToAccount(
          item.copied_to_account
        );
        if (validCopiedToAccount.length === 0) {
          continue;
        }

        for (const account of validCopiedToAccount) {
          const trimmedAccount = account.trim();
          const marketplaceInfo = tokenMap[trimmedAccount];
          if (marketplaceInfo) {
            cross_listed_to.push({
              marketplaceId: marketplaceInfo.marketPlaceId,
              copied_to: trimmedAccount,
              marketplaceLogo: marketplaceInfo.marketplaceLogo,
              marketplaceName: marketplaceInfo.marketplaceName,
            });
          } else {
            console.log(
              `No marketplaceId found for account: ${trimmedAccount}`
            );
          }
        }
      }

      const crossListedMap = cross_listed_to.reduce((acc, obj) => {
        if (!acc[obj.copied_to]) acc[obj.copied_to] = [];
        acc[obj.copied_to].push(obj);
        return acc;
      }, {});

      data = data.map((item) => {
        const validCopiedToAccount = cleanCopiedToAccount(
          item.copied_to_account
        );
        const crossListedEntries = validCopiedToAccount.flatMap(
          (account) => crossListedMap[account.trim()] || []
        );
        return {
          ...item.dataValues,
          marketplaceLogo: item.marketplaces?.image,
          marketplaceName: item.marketplaces?.parentMarketplace,
          cross_listed_to: crossListedEntries,
        };
      });
    } catch (error) {
      console.error("Error during processing:", error.message);
    }
    // Group data by groupProductId
    // const groupedData = data.reduce((acc, item) => {
    //   if (item.groupProductId !== null) {
    //     if (!acc[item.groupProductId]) {
    //       acc[item.groupProductId] = { ...item, variations: [] };
    //     }
    //     acc[item.groupProductId].variations.push(item);
    //   } else {
    //     acc[item.id] = item;
    //   }
    //   return acc;
    // }, {});

    // const finalData = Object.values(groupedData);
    const paginatedData = data.map((mainItem) => {
      const variationsMatch = ids.find(
        (variationItem) =>
          variationItem.dataValues.id != mainItem.id &&
          variationItem.dataValues.channelId === mainItem.channelId
      );
      return {
        ...mainItem,
        variations: variationsMatch
          ? variationsMatch.dataValues.variations.filter(
            (itm) => itm.id != mainItem.id
          )
          : [],
      };
    });

    // Respond with the paginated data
    return res.status(200).json({
      success: true,
      status: 200,
      count: result[0].count,
      marketplace: marketplaces[0]?.dataValues?.parentMarketplace,
      marketplaceLogo: marketplaces[0]?.dataValues?.image,
      data: paginatedData,
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.GetCatalogueId = async (req, res) => {
  try {
    const { id } = req.body;

    const cskus = await csku.findOne({
      where: {
        id: id,
      },
      attributes: ["id", "channelId", "marketplaceId", "userId", "accountName"],
    });

    console.log(cskus.dataValues);

    const marketplace = await Marketplace.findOne({
      where: {
        id: cskus?.marketplaceId,
      },
      attributes: ["url"],
    });
    const token = await Tokens.findOne({
      where: {
        userId: cskus.userId,
        marketPlaceId: cskus?.marketplaceId,
        accountName: cskus?.accountName,
      },
    });
    let catalogue = "";
    if (marketplace?.url?.includes("ebay")) {
      const channelId = cskus.channelId;
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      let startDate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }
      eBay.OAuth2.setCredentials(token.dataValues.token);
      console.log("Done when the item gets...");
      const eBayItem = await GetItemEbay(eBay, channelId);

      const pushDataBody = {
        ItemArray: {
          Item: [eBayItem.Item],
        },
      };
      console.log(pushDataBody);
      await this.pushData(
        pushDataBody,
        cskus.marketplaceId,
        cskus.accountName,
        cskus.userId
      );
    } else if (marketplace?.url?.includes("etsy")) {
      const etsyItem = await getEtsyItem(cskus?.channelId, token);
      const pushDataBody = [etsyItem];
      await pushDataToEtsy(
        pushDataBody,
        cskus.userId,
        cskus.accountName,
        cskus.marketplaceId,
        false,
        token.shop_id
      );
    }

    catalogue = await csku.findOne({
      where: {
        channelId: cskus?.channelId,
        userId: cskus?.marketplaceId,
        accountName: cskus?.accountName,
        userId: cskus?.userId
      },
      attributes: [
        "id",
        "images",
        "channelId",
        "variantId",
        "isku",
        "status",
        "errors",
        "createdAt",
        "updatedAt",
        "title",
        "description",
        "quantity",
        "currency",
        "price",
        "mrp",
        "width",
        "height",
        "weight",
        "weightUnit",
        "depth",
        "unit",
        "categoryId",
        "categoryName",
        "marketplaceId",
        "collections",
        "groupProductId",
        "variation",
        "sellerProfile",
        "accountName",
        "siteId",
        "quantityLimitPerBuyer",
        "itemSpecifics",
        "merchantLocation",
        "packageType",
        "brand",
        "productId",
        "productIdType",
        "mustShipAlone",
        "storeCategoryId",
      ],
    });

    if (cskus.channelId) {
      const variations = await CatalogueVariation.findAll({
        where: {
          channel_id: cskus.channelId,
        },
        attributes: [
          "id",
          "channel_id",
          "variation_id",
          "price",
          "quantity",
          "transformed_variation",
        ],
      });
      console.log(variations);
      const transformedData = await transformData(variations);

      catalogue.dataValues.variations = transformedData;
    }

    if (!catalogue) {
      return res.status(400).json({
        success: false,
        status: 404,
        data: null,
        message: "Data Not Found",
      });
    }

    return res.status(200).json({
      success: true,
      status: 200,
      data: catalogue,
      top_banner: token?.top_banner,
      bottom_banner: token?.bottom_banner,
    });
  } catch (err) {
    console.log(err);
    const error = {
      message: err?.message,
    };
    newRelic.recordCustomEvent(`Error_in_getting_catalogue_by_id`, error);
    await apiCallLog(
      "GetCatalogueId",
      "/catalogue/uget-catalogue-byId",
      "GetCatalogueId",
      {},
      {},
      err,
      "error"
    );
    return res.status(400).json({
      success: false,
      status: 400,
      message: err?.message,
    });
  }
};

async function transformData(data) {
  console.log(typeof data, "IN TRANSFORM DATA");

  // Handle the case when data is undefined or null
  if (!data) {
    console.error("Data is null or undefined");
    return { attributes: [], combinations: [] };
  }

  let parsedData;

  try {
    // If data is a string, try to parse it
    if (typeof data === "string") {
      try {
        // Clean up the data string if it contains "IN TRANSFORM DATA" text
        const cleanedData = data.includes("IN TRANSFORM DATA")
          ? data.substring(0, data.indexOf("IN TRANSFORM DATA")).trim()
          : data;

        parsedData = JSON.parse(cleanedData);
      } catch (e) {
        console.error("Failed to parse input JSON:", e);
        return { attributes: [], combinations: [] };
      }
    } else {
      // If it's already an object, use it directly
      parsedData = data;
    }

    // Ensure parsedData is an array
    if (!Array.isArray(parsedData)) {
      console.error("Parsed data is not an array:", parsedData);
      return { attributes: [], combinations: [] };
    }

    // Extract all unique attributes and their values
    const attributeMap = {};

    for (const item of parsedData) {
      // Skip invalid items
      if (!item || !item.dataValues.transformed_variation) {
        console.warn("Invalid item in data:", item);
        continue;
      }

      const variation = item.dataValues.transformed_variation;

      // Use safer approach to iterate over keys
      for (const attrName in variation) {
        if (Object.prototype.hasOwnProperty.call(variation, attrName)) {
          if (!attributeMap[attrName]) {
            attributeMap[attrName] = new Set();
          }

          if (
            variation[attrName] !== null &&
            variation[attrName] !== undefined
          ) {
            attributeMap[attrName].add(variation[attrName]);
          }
        }
      }
    }

    // Convert the attribute map to the required format
    const attributes = Object.keys(attributeMap).map((name) => {
      // Rename "Custom Property" to "Color" based on the values
      const displayName = name === "Custom Property" ? "Color" : name;

      return {
        name: displayName,
        options: Array.from(attributeMap[name]).map((value) => ({ value })),
      };
    });

    // Create combinations
    const combinations = parsedData
      .filter((item) => item && item.dataValues.transformed_variation) // Filter out invalid items
      .map((item) => {
        const result = {};

        // Map attributes to their new names if needed
        for (const [key, value] of Object.entries(
          item.dataValues.transformed_variation
        )) {
          const newKey = key === "Custom Property" ? "Color" : key;
          result[newKey] = value;
        }

        return {
          ...result,
          price: item.dataValues.price ? parseInt(item.dataValues.price) : 0,
          quantity: item.dataValues.quantity || 0,
        };
      });

    return {
      attributes,
      combinations,
    };
  } catch (error) {
    console.error("Error in transformData:", error);
    return { attributes: [], combinations: [] };
  }
}

exports.GetAllInventory = async (req, res) => {
  try {
    const {
      page,
      limit,
      userId,
      marketplaceId,
      accountName,
      search,
      status,
      orderBy,
      type,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    if (!page || !limit || isNaN(page) || isNaN(limit)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid page or limit parameter",
      });
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "User Details are required",
      });
    }

    const decodedIsku = decodeURIComponent(search);

    const query = marketplaceId
      ? {
        where: { marketplaceId: marketplaceId },
      }
      : { where: {} };

    if (search) {
      query.where[Op.or] = [
        { isku: { [Op.iLike]: `%${decodedIsku}%` } },
        { quantity: search },
        {
          title: {
            [Op.iLike]: `%${decodedIsku}%`,
          },
        },
      ];
    }

    if (userId) {
      query.where.userId = userId;
    }

    if (status && status !== "all") {
      if (status === "available") {
        query.where.status = { [Op.in]: ["new", "available"] };
      } else if (status === "low on stock") {
        // query.where.status = status
        query.where[Op.and] = [
          where(cast(col("quantity"), "NUMERIC"), {
            [Op.lte]: cast(col("lowQtyThresh"), "NUMERIC"),
          }),
        ];
      } else if (status === "out of stock") {
        // query.where.status = status
        query.where.quantity = {
          [Op.regexp]: "^\\s*0+(\\.0+)?\\s*$",
        };
      } else {
        query.where.status = status;
      }
    }

    if (accountName) {
      query.where.accountName = accountName;
    }

    const orderArg = orderBy ? { order: [[orderBy, type.toUpperCase()]] } : {};

    const data = await isku.findAll({
      ...query,
      ...orderArg,
      limit: parseInt(limit),
      offset: skip,
    });

    const count = await isku.count(query);

    return res.status(200).json({
      success: true,
      status: 200,
      count,
      data,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.UpdateQuantityForEbay = async (req, res) => {
  const functionName = "UpdateQuantityForEbay";
  try {
    const sku = req.params.id;
    if (!sku) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "SKU is required",
      });
    }
    if (
      !req.body ||
      !req.body.quantity ||
      !req.body.marketplaceId ||
      !req.body.userId ||
      !req.body.accountName
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        message:
          "Quantity, marketplaceId, userId and accountName are required in the request body",
      });
    }
    const id = decodeURIComponent(sku);
    const { quantity, marketplaceId, userId, accountName } = req.body;
    const token = await Tokens.findOne({
      where: {
        marketPlaceId: marketplaceId,
        userId: userId,
        accountName: accountName,
      },
    });
    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }
    const iskuData = await isku.findOne({
      where: {
        id: id,
        userId: userId,
      },
    });

    if (!iskuData) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid ISKU ID",
      });
    }
    iskuData.quantity = quantity;
    if (iskuData?.dataValues?.quantity < iskuData?.dataValues?.lowQtyThresh) {
      iskuData.status = "low on stock";
    } else if (iskuData?.dataValues?.quantity === 0) {
      iskuData.status = "out of stock";
    }

    const cskus = await csku.update(
      { quantity: quantity },
      {
        where: { isku: iskuData.dataValues.isku, marketplaceId: marketplaceId },
        returning: true,
      }
    );
    await Promise.all(
      cskus[1]?.map(async (csku) => {
        const eBay = new ebay({
          appId: process.env.APP_ID,
          certId: process.env.CERT_ID,
          sandbox: false,
          devId: process.env.DEV_ID,
          authToken: token.dataValues.token,
        });
        let startdate = moment().add(5, "hours").add(30, "minutes");
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

        if (hoursDifference >= 2) {
          await refreshToken(eBay, token);
        }
        await eBay.trading.ReviseFixedPriceItem({
          Item: {
            ItemID: csku.dataValues.channelId,
            Quantity: quantity,
          },
        });
        await apiCallLog(
          "ReviseFixedPriceItem",
          "/catalogue/update-quantity/:id",
          functionName,
          {
            Item: {
              ItemID: csku.dataValues.channelId,
              Quantity: quantity,
            },
          },
          {},
          {},
          "success"
        );
      })
    );

    await iskuData.save();

    return res.status(200).json({
      success: false,
      status: 200,
      data: iskuData,
    });
  } catch (err) {
    await apiCallLog(
      "ReviseFixedPriceItem",
      "/catalouge/update-quantity/:id",
      functionName,
      {
        Item: {
          ItemID: csku.dataValues.channelId,
          Quantity: quantity,
        },
      },
      {},
      err.meta,
      "error"
    );
    // newRelic.recordCustomEvent(
    //   'Error in quantity for: ',
    //   req.body.accountName,
    //   '. Error: ',
    //   err.message
    // )
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.MergeISKU = async (req, res) => {
  const functionName = "MergeISKU";
  try {
    const { ids, mergeToId, userId, marketplaceId, accountName } = req.body;

    const iskus = await isku.findAll({
      where: {
        id: ids,
      },
    });

    if (iskus.length == 0) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "No data found for provided IDs.",
      });
    }

    const mergeToData = await isku.findOne({
      where: {
        id: mergeToId,
      },
    });

    if (!mergeToData) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Merge to ID does not exist.",
      });
    }

    const token = await Tokens.findOne({
      userId: userId,
      marketplaceId: marketplaceId,
      accountName: accountName,
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      authToken: token.dataValues.token,
    });
    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token);
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/catalouge/merge-iskus",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/catalouge/merge-iskus",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    //   await refreshToken(eBay, token);
    // }

    await Promise.all(
      iskus?.map(async (isku) => {
        const cskuData = await csku.update(
          {
            isku: mergeToData.dataValues.isku,
          },
          {
            where: {
              isku: isku.isku,
            },
            returning: true,
          }
        );

        await Promise.all(
          cskuData?.map(async (csku) => {
            await eBay.trading.ReviseItem({
              Item: {
                ItemID: csku.channelId,
                SKU: mergeToData.dataValues.isku,
              },
            });
            await apiCallLog(
              "ReviseItem",
              "/catalogue/merge-iskus",
              functionName,
              {
                Item: {
                  ItemID: csku.channelId,
                  SKU: mergeToData.dataValues.isku,
                },
              },
              {},
              {},
              "success"
            );
          })
        );
      })
    );

    const deleteIds = ids.filter((id) => id != mergeToId);

    await isku.destroy({
      where: {
        id: deleteIds,
      },
    });

    return res.status(200).json({
      success: false,
      status: 200,
      data: iskus,
    });
  } catch (err) {
    await apiCallLog(
      "ReviseItem",
      "/catalouge/merge-iskus",
      functionName,
      {
        Item: {
          ItemID: csku.channelId,
          SKU: mergeToData.dataValues.isku,
        },
      },
      {},
      err.meta,
      "error"
    );
    newRelic.recordCustomEvent("Error in merge isku. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.AddEbayCatalogue = async (req, res) => {
  try {
    const { } = req.body;
  } catch (err) {
    // newRelic.recordCustomEvent("Error in catalogue fetch for: ", req.body.accountName, ". Error: ", err.message)
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};
exports.GenerateCSVForBulkUpload = async (req, res) => {
  try {
    const data = [
      {
        isku: "",
        costPrice: "",
        currency: "",
        quantity: "",
        weight: "",
        height: "",
        width: "",
        depth: "",
        title: "",
        warehouseLocation: "",
        images: "Link1,Link2",
      },
    ];

    const parser = new CSVParser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment;filename=bulkUpload.csv");
    res.status(200).end(csv);
  } catch (err) {
    newRelic.recordCustomEvent("Error in csv generate. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 500,
      message: err.message,
    });
  }
};
const getColumnLetter = (columnIndex) => {
  let letter = "";
  while (columnIndex > 0) {
    const mod = (columnIndex - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    columnIndex = Math.floor((columnIndex - mod) / 26);
  }
  return letter;
};
exports.generateExcelForCskuData = async (req, res) => {
  const functionName = "generateExcelForCskuData";
  const { accountName, userId, marketPlaceId, categoryId, siteId } = req?.query;

  try {
    if (!accountName || !userId || !marketPlaceId) {
      return res.status(400).json({
        success: false,
        status: 400,
        messages: "Please Provide All Required Data",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId,
      },
    });
    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: "MarketPlace not found",
      });
    }
    let site = null;
    if (siteId) {
      site = await Geosite.findOne({
        where: {
          globalId: siteId,
        },
      });
      if (!site) {
        return res.status(404).json({
          success: false,
          message: "Site not found",
        });
      }
    }

    let whereClouse = {
      userId: userId,
      accountName: accountName,
      marketplaceId: marketPlaceId,
    };

    if (marketPlace?.url?.includes("ebay")) {
      whereClouse = {
        ...whereClouse,
        categoryId: categoryId,
        siteId,
      };
    } else if (marketPlace?.url?.includes("walmart")) {
      whereClouse = {
        ...whereClouse,
        categoryName: categoryId,
      };
    }
    // Fetch the cskus and aspects data
    const cskus = await csku.findAll({
      where: { ...whereClouse },
    });

    // Create a new workbook
    const workbook = await xlsxPopulate.fromBlankAsync();
    const mainSheet = workbook.sheet(0).name("MainSheet");
    const dropdownSheet = workbook.addSheet("DropdownList");
    let dropdownCurrentRow = 2;
    // Create a map of headers with their column numbers
    let headers = null;
    if (marketPlace?.url?.includes("ebay")) {
      return await generateExcelForEbayBulkUpdate(
        accountName,
        userId,
        site,
        categoryId,
        workbook,
        mainSheet,
        dropdownSheet,
        cskus,
        res
      );
    } else if (marketPlace?.url?.includes("shopify")) {
      return await generateExcelForShopifyBulkUpdate(
        accountName,
        userId,
        marketPlaceId,
        workbook,
        mainSheet,
        dropdownSheet,
        cskus,
        res
      );
    } else if (marketPlace?.url?.includes("walmart")) {
      return await generateExcelForWalmartBulkUpdate(
        categoryId,
        workbook,
        mainSheet,
        dropdownSheet,
        cskus,
        res
      );
    }
    // Set headers in the main sheet
    Object.keys(headers)?.forEach((header) => {
      const columnLetter = getColumnLetter(headers[header]);
      mainSheet.cell(`${columnLetter}1`).value(header);
      if (["*unit", "*unitOfWeight", "packageType"]?.includes(header)) {
        const dropdownValues = {
          "*unit": Units,
          "*unitOfWeight": WeightUnits,
          packageType: PackageTypes,
        };
        const options = Object.keys(dropdownValues[header]);
        dropdownSheet
          .cell(`A${dropdownCurrentRow}`)
          .value(options?.map((value) => [value]));
        const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + options.length - 1
          }`;
        mainSheet.range(`${columnLetter}2:${columnLetter}100`).dataValidation({
          type: "list",
          formula1: dropdownRange,
        });
        dropdownCurrentRow += options.length;
      }
    });
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });

    if (marketPlace?.url?.includes("ebay")) {
      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      const aspects = await eBay.commerce.taxonomy.getItemAspectsForCategory(
        site?.dataValues?.siteId,
        categoryId
      );
      // Prepare dropdowns for aspects
      let currentColumnIndex = Object.keys(headers).length;
      aspects?.aspects?.forEach((aspect) => {
        let aspectHeader = aspect.localizedAspectName;
        if (aspect?.aspectConstraint?.aspectRequired) {
          aspectHeader = `*${aspectHeader}`;
        }
        currentColumnIndex++;
        headers[aspectHeader] = currentColumnIndex;

        const columnLetter = getColumnLetter(currentColumnIndex);
        // console.log(columnLetter , 'letter')
        mainSheet.cell(`${columnLetter}1`).value(aspectHeader);
        if (
          aspect.aspectValues &&
          Array.isArray(aspect.aspectValues) &&
          aspect.aspectValues.length > 0
        ) {
          const options = aspect.aspectValues.map((val) => val.localizedValue);
          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(options.map((value) => [value]));

          const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + options.length - 1
            }`;
          mainSheet
            .range(`${columnLetter}2:${columnLetter}100`)
            .dataValidation({
              type: "list",
              formula1: dropdownRange,
            });
          dropdownCurrentRow += options.length;
        }
      });
    }
    // // Add data to the main sheet based on cskus
    cskus.forEach(async (csku, rowIndex) => {
      let { itemSpecifics, sellerProfile, collections, variation, ...rest } =
        csku?.dataValues;
      // Set basic csku fields
      Object.keys(headers).forEach((header) => {
        const columnNumber = headers[header];
        const value =
          header?.replace("*", "")?.trim() === "sku"
            ? rest["isku"]
            : header?.replace("*", "")?.trim() === "length"
              ? rest["depth"]
              : header?.replace("*", "")?.trim() === "images"
                ? rest["images"]
                  ? rest["images"].join(", ")
                  : ""
                : rest[header?.replace("*", "")?.trim()];

        mainSheet.cell(rowIndex + 2, columnNumber).value(value);
      });

      if (collections && Array.isArray(collections) && collections?.length) {
        let currentColumnIndex = Object.keys(headers).length;
        collections?.map((col, index) => {
          const { id, title } = col;
          const columnLetter = getColumnLetter(currentColumnIndex);
          mainSheet.cell(`${columnLetter}1`).value(`collection${index + 1}`);
        });
      }
      const aspects = itemSpecifics ? itemSpecifics[0] : {};
      console.log(itemSpecifics, "item");
      if (marketPlace?.url?.includes("ebay")) {
        if (
          itemSpecifics === null ||
          (!Array.isArray(itemSpecifics) &&
            !itemSpecifics?.length &&
            rest["isku"])
        ) {
          try {
            const inventoryItem = await eBay.sell.inventory.getInventoryItem(
              rest["isku"]
            );
            console.log(inventoryItem?.product?.aspects, "inventoryItem");
            aspects = inventoryItem?.product?.aspects;
            await csku.update(
              {
                itemSpecifics: [aspects],
              },
              { where: { id: rest?.id } }
            );
          } catch (error) {
            console.log(error, "error");
          }
        }
      }
      // Set item specifics if present
      if (aspects && Object.keys(aspects)?.length) {
        Object.keys(aspects)?.forEach((itemSpecific) => {
          console.log(itemSpecific, aspects[itemSpecific][0], "itemspecific");
          const aspectColumnIndex =
            headers[itemSpecific] || headers[`*${itemSpecific}`];
          if (aspectColumnIndex) {
            mainSheet
              .cell(rowIndex + 2, aspectColumnIndex)
              .value(aspects[itemSpecific][0] || "");
          }
        });
      }
      // Set policy IDs from sellerProfile
      if (sellerProfile) {
        mainSheet
          .cell(rowIndex + 2, headers["*returnPolicyId"])
          .value(
            sellerProfile?.returnPolicies?.id ||
            sellerProfile?.SellerReturnProfile?.ReturnProfileID ||
            ""
          );
        mainSheet
          .cell(rowIndex + 2, headers["*paymentPolicyId"])
          .value(
            sellerProfile?.paymentPolicies?.id ||
            sellerProfile?.SellerPaymentProfile?.PaymentProfileID ||
            ""
          );
        mainSheet
          .cell(rowIndex + 2, headers["*fulfillmentPolicyId"])
          .value(
            sellerProfile?.shippingPolicies?.id ||
            sellerProfile?.SellerShippingProfile?.ShippingProfileID ||
            ""
          );
      }
    });

    // Save the workbook
    const buffer = await workbook.outputAsync();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="BulkUpdate.xlsx"'
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res
      .status(500)
      .json({ success: false, status: 500, message: "Internal Server Error" });
  }
};

async function convertToJSON(csvBuffer, callback) {
  return new Promise((resolve, reject) => {
    const csvString = csvBuffer.toString(); // Convert the buffer to a string

    csvtojson()
      .fromString(csvString)
      .then((jsonArray) => {
        resolve(jsonArray);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

exports.ISKUBulkUpload = async (req, res) => {
  try {
    const { marketplaceId, accountName, userId } = req.body;

    if (req.file.mimetype === "text/csv") {
      console.log(req.file);
      const buffer = Buffer.from(req.file.buffer);

      let jsonData = await convertToJSON(buffer);

      if (jsonData.length > 5000) {
        return res.status(400).json({
          success: false,
          status: 400,
          messages: "upload a file between 1 to 5000 values",
        });
      }

      const keys = Object.keys(jsonData[0]);

      if (
        !keys.includes("isku") ||
        !keys.includes("costPrice") ||
        !keys.includes("quantity") ||
        !keys.includes("currency") ||
        !keys.includes("weight") ||
        !keys.includes("height") ||
        !keys.includes("width") ||
        !keys.includes("depth") ||
        !keys.includes("title") ||
        !keys.includes("images")
      ) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "Invalid CSV Format",
        });
      }

      jsonData = jsonData?.map((item) => {
        item.images = item?.images?.split(",")?.map((img) => img.trim());
        return {
          ...item,
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId,
        };
      });

      await isku.bulkCreate(jsonData);

      return res.status(200).json({
        success: true,
        status: 200,
        message: `Data successfully uploaded`,
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Please enter a valid file.",
      });
    }
  } catch (err) {
    newRelic.recordCustomEvent("Error in isku upload. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.ISKUBulkUpdate = async (req, res) => {
  const functionName = "ISKUBulkUpdate";
  try {
    const { userId } = req.body;
    if (req.file.mimetype === "text/csv") {
      const buffer = req.file.buffer;
      let groupProductId = uuidv4();
      let jsonData = await convertToJSON(buffer);
      if (jsonData.length > 5000) {
        return res.status(400).json({
          success: false,
          status: 400,
          messages: "upload a file between 1 to 5000 values",
        });
      }
      const keys = Object.keys(jsonData[0]);
      if (
        !keys.includes("SKU") ||
        !keys.includes("Title") ||
        !keys.includes("Price") ||
        !keys.includes("Quantity") ||
        !keys.includes("Currency") ||
        !keys.includes("Weight") ||
        !keys.includes("Height") ||
        !keys.includes("Width") ||
        !keys.includes("Length") ||
        !keys.includes("Images")
      ) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "Invalid CSV Format",
        });
      }
      //NOTE - upload original file to S3 Bucket
      const originalFilePath = await uploadToS3({
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(req.file.buffer),
        originalname: `failed-report/${groupProductId}-${req?.file?.originalname}`,
      });
      // NOTE - add it to bulk upload history
      const bulkUploadHistory = await BulkUploadHistory.create({
        actionType: BulkActionType.UPDATE_ISKU,
        userId,
        uploadedFilePath: originalFilePath || null,
        totalItems: jsonData?.length || 0,
        status: HistoryStatus.INPROGRESS,
      });
      const newHistory = bulkUploadHistory?.dataValues;
      let errorFile = [];
      let successCounts = 0;
      let failedCounts = 0;
      const response = [];
      let failed = false;
      let message = "";
      for (let i = 0; i < jsonData?.length; i++) {
        let item = jsonData[i];
        const obj = {
          ISKU: item.SKU,
          Title: item.Title,
          Quantity: item.Quantity,
          failed: false,
          status: "",
        };
        const iskuData = await isku.findOne({
          where: {
            isku: item.SKU,
            userId: userId,
            costPrice: item.Price,
            currency: item.Currency,
            weight: item.Weight,
            height: item.Height,
            depth: item.Length,
            images: item?.Images?.includes(",")
              ? item?.Images?.spilt(",")
              : [item?.Images?.trim()],
          },
        });

        if (!iskuData) {
          console.log("Invalid ISKU ID");
          errorFile.push({
            ...item,
            error: "Invalid ISKU ID",
          });
          failedCounts++;
          continue;
        }
        if (
          item.Quantity !== iskuData.quantity ||
          item.Price !== iskuData.costPrice ||
          item.Currency !== iskuData.currency ||
          item.Weight !== iskuData.weight ||
          item.Height !== iskuData.height ||
          item.Length !== iskuData.depth
        ) {
          iskuData.quantity = item.Quantity;
          const cskus = await csku.findAll({
            where: {
              isku: iskuData.dataValues.isku,
              userId: userId,
            },
          });
          let cskusError = [];
          for (let c = 0; c < cskus.length; c++) {
            let csku = cskus[c];
            const token = await Tokens.findOne({
              where: {
                marketPlaceId: csku.dataValues.marketplaceId,
                userId: userId,
                accountName: csku.dataValues.accountName,
              },
            });
            if (!token) {
              console.log("Token not found");
              cskusError.push("Token for this user not found.");
              failed = true;
              message = "Token for this user not found.";
              continue;
            }
            const marketPlace = await Marketplace.findOne({
              where: {
                id: csku.dataValues.marketplaceId,
              },
            });
            if (!marketPlace) {
              cskusError.push("Marketplace not found.");
              failed = true;
              message = "Marketplace not found.";
              continue;
            }
            await csku.update(
              {
                quantity: item.Quantity,
                weight: item.Weight,
                height: item.Height,
                depth: item.Length,
                images: item?.Images?.includes(",")
                  ? item?.Images?.spilt(",")
                  : [item?.Images?.trim()],
              },
              {
                where: {
                  id: csku?.dataValues?.id,
                },
                returning: true,
              }
            );
            if (marketPlace?.dataValues?.url?.includes("ebay")) {
              try {
                const updationResponse = await updateEbayInventory(
                  token,
                  csku,
                  item
                );
                if (!updationResponse?.success) {
                  cskusError.push(
                    `Error Occured While Updating On Ebay : Channel Id : ${csku?.dataValues?.channelId} : Error : ${updationResponse?.message}`
                  );
                }
              } catch (error) {
                cskusError.push(
                  `Error Occured While Updating On Ebay : Channel Id : ${csku?.dataValues?.channelId} : Error : ${error?.message}`
                );
              }
            } else if (marketPlace?.dataValues?.url?.includes("shopify")) {
              try {
                const response = await updateShopifyInventory(
                  token,
                  csku,
                  item
                );
                if (!response?.success) {
                  cskusError.push(
                    `Error Occured While Updating On Ebay : Channel Id : ${csku?.dataValues?.channelId} : Error : ${response?.message}`
                  );
                }
              } catch (error) {
                cskusError.push(
                  `Error Occured While Updating On Ebay : Channel Id : ${csku?.dataValues?.channelId} : Error : ${error?.message}`
                );
              }
            }
          }
        }

        if (iskuData.quantity < iskuData.lowQtyThresh) {
          iskuData.status = "low on stock";
        }

        if (iskuData.quantity === 0) {
          iskuData.status = "out of stock";
        }

        await iskuData.save();

        await isku.update(
          {
            costPrice: item.CostPrice,
            currency: item.Currency,
            mrp: item.Price,
            title: item.Title,
            quantity: item.Quantity,
            height: item.Height,
            weight: item.Weight,
            depth: item.Length,
            width: item.Width,
            warehouseLocation: item.warehouseLocation,
            isSellerFulfilled: item.isSellerFulfilled === "true",
            lowQtyThresh: item.lowQtyThresh,
          },
          { where: { isku: item.SKU } }
        );

        response.push({
          SKU: item.SKU,
          Title: item.Title,
          Quantity: item.Quantity,
          failed: failed,
          status: failed ? "Failed" : "Success",
          message: message,
        });

        if (cskusError?.length) {
          errorFile.push({
            ...item,
            error: cskusError?.join(","),
          });
          failedCounts++;
          continue;
        } else {
          successCounts++;
        }
      }
      if (errorFile?.length) {
        //NOTE - make a dynamic excel file path
        console.log(errorFile[0], "error");
        //NOTE - make a dynamic excel file path
        const fileName = `${groupProductId}-${userId}-isku-update-failed-${new Date()}-data.xlsx`;
        const excelFilePath = path.join(__dirname, fileName);
        const res = await generateExcelFile(errorFile, excelFilePath, [
          ...Object.keys(errorFile[0]),
        ]);
        let errorFileLocation = null;
        if (res && fs.existsSync(excelFilePath)) {
          //NOTE -  Read the Excel file as a buffer
          const fileBuffer = fs.readFileSync(excelFilePath);
          //NOTE -  Upload the Excel File to S3
          try {
            errorFileLocation = await uploadToS3({
              mimetype:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              buffer: fileBuffer,
              originalname: `failed-report/${groupProductId}-${userId}-isku-update-failed-${new Date()}-data`,
            });
            console.log(`Error file generated at ${errorFileLocation}`);
            fs.unlink(excelFilePath, (err) => {
              if (err) {
                console.error("Error deleting file:", err);
              }
              console.log("File deleted successfully");
            });
          } catch (error) {
            console.error("Error uploading file to S3:", error);
          }
        }
        await BulkUploadHistory.update(
          {
            errorFilePath: errorFileLocation,
            status: HistoryStatus.COMPLETED,
            failedItems: failedCounts,
            successItems: successCounts,
          },
          { where: { id: newHistory?.id } }
        );
        const mailOptions = {
          from: process.env.FROM_EMAIL,
          to: "aditya@mergekart.com",
          cc: "pallavisolday12@gmail.com",
          subject: `ISKU Bulk Update Failed Products Report ${new Date()}`,
          text: "Hello, please find the attached file.",
        };
        if (errorFileLocation) {
          mailOptions.attachments = [
            {
              filename: fileName,
              path: errorFileLocation,
            },
          ];
        } else {
          mailOptions.text = `Error While generating Error Excel File.`;
        }
        await sendUpdateReportEmail(mailOptions);
        console.log(`Error file generated at ${errorFileLocation}`);
      }
      const parser = new CSVParser();
      const csv = parser.parse(response);
      const nodemailer = require("nodemailer");

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password, // Replace with your SMTP password
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const userData = await User.findOne({
        where: { id: userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: userData.dataValues.email, // Replace with the receiver's email
          cc: "akhlaqansarievdtechnology@gmail.com",
          subject: "Bulk Update Status",
          text: `Bulk update status for ISKU's`,
          attachments: [
            {
              filename: `BulkUpdate_${moment()
                .add(5, "hours")
                .add(30, "minutes")
                .format("DD/MM/YYYY")}.csv`,
              content: csv,
            },
          ],
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error);
            console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }

      return res.status(200).json({
        success: true,
        status: 200,
        message: `Data successfully updated`,
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Please enter a valid file.",
      });
    }
  } catch (err) {
    newRelic.recordCustomEvent(
      "Error in ISKU bulk update. Error: ",
      err.message
    );
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

// exports.ISKUBulkUpdate = async (req, res) => {
//   try {
//     const { userId } = req.body;

//     if (req.file.mimetype === "text/csv") {
//       const buffer = req.file.buffer;

//       let jsonData = await convertToJSON(buffer);

//       if (jsonData.length > 5000) {
//         return res.status(400).json({
//           success: false,
//           status: 400,
//           messages: "upload a file between 0 to 5000 values",
//         });
//       }

//       const keys = Object.keys(jsonData[0]);
//       if (
//         !keys.includes("isku") ||
//         !keys.includes("costPrice") ||
//         !keys.includes("quantity") ||
//         !keys.includes("currency") ||
//         !keys.includes("weight") ||
//         !keys.includes("height") ||
//         !keys.includes("width") ||
//         !keys.includes("depth") ||
//         !keys.includes("title") ||
//         !keys.includes("images")
//       ) {
//         return res.status(400).json({
//           success: false,
//           status: 400,
//           message: "Invalid CSV Format",
//         });
//       }

//       jsonData = await Promise.all(
//         jsonData?.map(async (item) => {
//           const iskuData = await isku.findOne({
//             where: {
//               isku: item.isku,
//             },
//           });

//           if (!iskuData) {
//             return res.status(400).json({
//               success: false,
//               status: 400,
//               message: "Invalid ISKU ID",
//             });
//           }

//           if (iskuData.quantity != item.quantity) {
//             iskuData.quantity = item.quantity;

//             const cskus = await csku.update(
//               { quantity: item.quantity },
//               {
//                 where: {
//                   isku: iskuData.dataValues.isku,
//                   marketplaceId: iskuData?.dataValues?.marketplaceId,
//                 },
//                 returning: true,
//               }
//             );
//             await Promise.all(
//               cskus[1]?.map(async (csku) => {
//                 const token = await Tokens.findOne({
//                   where: {
//                     marketPlaceId: csku.dataValues?.marketplaceId,
//                     userId: userId,
//                     accountName: csku.dataValues.accountName,
//                   },
//                 });

//                 if (!token) {
//                   return res.status(500).json({
//                     success: false,
//                     status: 500,
//                     message: "Token for this user not found.",
//                   });
//                 }

//                 const eBay = new ebay({
//                   appId: process.env.APP_ID,
//                   certId: process.env.CERT_ID,
//                   sandbox: false,
//                   devId: process.env.DEV_ID,
//                   authToken: token.dataValues.token,
//                 });

//                 try {
//                   await eBay.trading.GetTokenStatus({
//                     RequesterCredentials: {
//                       eBayAuthToken: token.dataValues.token,
//                     },
//                   });
//                 } catch (err) {
//                   if (err) {
//                     await refreshToken(eBay, token);
//                   }
//                 }

//                 await eBay.trading.ReviseFixedPriceItem({
//                   Item: {
//                     ItemID: csku.dataValues.channelId,
//                     Quantity: item.quantity,
//                   },
//                 });
//               })
//             );
//           }

//           if (iskuData.dataValues.quantity < iskuData.dataValues.lowQtyThresh) {
//             iskuData.status = "low on stock";
//           }

//           if (iskuData.dataValues.quantity === 0) {
//             iskuData.status = "out of stock";
//           }

//           await iskuData.save();

//           await isku.update(
//             {
//               costPrice: item.costPrice,
//               currency: item.currency,
//               mrp: item.mrp,
//               title: item.title,
//               quantity: item.quantity,
//               height: item.height,
//               weight: item.weight,
//               depth: item.depth,
//               width: item.width,
//               warehouseLocation: item.warehouseLocation,
//               isSellerFulfilled:
//                 item.isSellerFulfilled === "true" ? true : false,
//               lowQtyThresh: item.lowQtyThresh,
//             },
//             { where: { isku: item.isku } }
//           );
//         })
//       );

//       return res.status(200).json({
//         success: true,
//         status: 200,
//         message: `Data successfully updated`,
//       });
//     } else {
//       return res.status(400).json({
//         success: false,
//         status: 400,
//         message: "Please enter a valid file.",
//       });
//     }
//   } catch (err) {
//     newRelic.recordCustomEvent(
//       "Error in isku bulk update. Error: ",
//       err.message
//     );
//     console.log(err);
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.message,
//     });
//   }
// };

exports.GenerateCSVForBulkUpdateISKU = async (req, res) => {
  try {
    const { userId } = req.query;

    const tokens = await Tokens.findAll({
      where: {
        userId: userId,
      },
      attributes: {
        include: ["accountName"],
      },
    });

    const accountNames = tokens.map((token) => token.dataValues.accountName);

    const data = await isku.findAll({
      attributes: {
        exclude: [
          "createdAt",
          "updatedAt",
          "created_at",
          "updated_at",
          "accountName",
          "marketplaceId",
        ],
      },
      where: {
        accountName: {
          [Op.in]: accountNames,
        },
      },
    });

    const response = [];

    data?.map((item) => {
      response.push({
        SKU: item.dataValues.isku,
        Title: item.dataValues.title,
        Price: item.dataValues.costPrice,
        Quantity:
          item.dataValues.quantity && item.dataValues.quantity != null
            ? item.dataValues.quantity
            : 0,
        Currency: item.dataValues.currency,
        Weight: item?.dataValues?.weight,
        Height: item?.dataValues?.height,
        Width: item?.dataValues.width,
        Length: item?.dataValues.depth,
        Images: item?.dataValues.images?.join(", ") || "",
      });
    });

    const parser = new CSVParser();
    const csv = parser.parse(response);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment;filename=bulkUpload.csv");
    res.status(200).end(csv);
  } catch (err) {
    newRelic.recordCustomEvent("Error in generate csv. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 500,
      message: err.message,
    });
  }
};

exports.GenerateCSVForBulkUpdate = async (req, res) => {
  try {
    const { userId } = req.query;

    const tokens = await Tokens.findAll({
      where: {
        userId: userId,
      },
      attributes: {
        include: ["accountName"],
      },
    });

    const accountNames = tokens.map((token) => token.dataValues.accountName);

    const data = await isku.findAll({
      attributes: {
        exclude: [
          "createdAt",
          "updatedAt",
          "created_at",
          "updated_at",
          "accountName",
          "marketplaceId",
        ],
        include: ["isku", "quantity"],
      },
      where: {
        accountName: {
          [Op.in]: accountNames,
        },
      },
    });

    const response = [];

    data?.map((item) => {
      response.push({
        SKU: item.dataValues.isku,
        Quantity:
          item.dataValues.quantity && item.dataValues.quantity != null
            ? item.dataValues.quantity
            : 0,
      });
    });

    const parser = new CSVParser();
    const csv = parser.parse(response);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment;filename=bulkUpload.csv");
    res.status(200).end(csv);
  } catch (err) {
    newRelic.recordCustomEvent("Error in generate csv. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 500,
      message: err.message,
    });
  }
};

exports.GenerateBulkMergeCSV = async (req, res) => {
  try {
    const data = [
      {
        "Product ISKU": "SG-001-RED",
        "Merge To": "SG-001-Red",
      },
      {
        "Product ISKU": "SG-001-R",
        "Merge To": "SG-001-Red",
      },
    ];

    const parser = new CSVParser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment;filename=bulkMerge.csv");
    res.status(200).end(csv);
  } catch (err) {
    newRelic.recordCustomEvent("Error in generate csv. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.BulkMerge = async (req, res) => {
  const functionName = "BulkMerge";
  try {
    const { userId } = req.body;

    if (req.file.mimetype === "text/csv") {
      const buffer = req.file.buffer;

      let jsonData = await convertToJSON(buffer);
      jsonData = jsonData?.filter((item) => item["Product ISKU"] != "");
      console.log(jsonData);
      const queryData = {};

      jsonData = jsonData?.map((item) => {
        if (!queryData[item["Merge To"]]) {
          queryData[item["Merge To"]] = [];
        }

        queryData[item["Merge To"]].push(item["Product ISKU"]);
      });

      Object.entries(queryData)?.map(async ([mergeToIsku, productIskus]) => {
        const updatedData = await csku.update(
          {
            isku: mergeToIsku,
          },
          {
            where: {
              isku: {
                [Op.in]: productIskus,
              },
            },
            returning: true,
          }
        );

        console.log(updatedData);
        console.log("Single update query completed successfully");

        await Promise.all(
          updatedData[1]?.map(async (data) => {
            const token = await Tokens.findOne({
              where: {
                marketPlaceId: data.marketplaceId,
                userId: userId,
                accountName: data.accountName,
              },
            });

            if (!token) {
              return res.status(500).json({
                success: false,
                status: 500,
                message: "Token for this user not found.",
              });
            }

            const eBay = new ebay({
              appId: process.env.APP_ID,
              certId: process.env.CERT_ID,
              sandbox: false,
              devId: process.env.DEV_ID,
              authToken: token.dataValues.token,
            });
            let startdate = moment().add(5, "hours").add(30, "minutes");
            let tokenExpiresDate = moment(token.lastTokenRefreshDate);
            let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

            if (hoursDifference >= 2) {
              await refreshToken(eBay, token);
            }
            // try {
            //   await eBay.trading.GetTokenStatus({
            //     RequesterCredentials: {
            //       eBayAuthToken: token.dataValues.token,
            //     },
            //   });
            //   await apiCallLog("GetTokenStatus","/catalogue/isku-bulk-merge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
            // } catch (err) {
            //   await apiCallLog("GetTokenStatus","/catalogue/isku-bulk-merge",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
            //   if (err) {
            //     await refreshToken(eBay, token)
            //   }
            // }

            try {
              await eBay.trading.ReviseItem({
                Item: {
                  ItemID: data.channelId,
                  SKU: data.isku,
                },
              });
              await apiCallLog(
                "ReviseItem",
                "/catalouge/isku-bulk-merge",
                functionName,
                {
                  Item: {
                    ItemID: data.channelId,
                    SKU: data.isku,
                  },
                },
                {},
                {},
                "success"
              );
            } catch (error) {
              await apiCallLog(
                "ReviseItem",
                "/catalouge/isku-bulk-merge",
                functionName,
                {
                  Item: {
                    ItemID: data.channelId,
                    SKU: data.isku,
                  },
                },
                {},
                error.meta,
                "error"
              );
              newRelic.recordCustomEvent(
                "Error in revise item. Error: ",
                err.message
              );
              console.log(err);
              return res.status(400).json({
                success: false,
                status: 400,
                message: err.message,
              });
            }
          })
        );

        await isku.destroy({
          where: {
            isku: productIskus,
          },
        });
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Please enter a valid file.",
      });
    }

    return res.status(200).json({
      success: true,
      status: 200,
      message: `Data successfully merged`,
    });
  } catch (err) {
    newRelic.recordCustomEvent("Error in bulk merge. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.GenerateBulkCSKUUpdateCSV = async (req, res) => {
  try {
    const { userId, accountName } = req.query;

    // const tokens = await Tokens.findAll({
    //   where: {
    //     userId: userId,
    //   },
    //   attributes: {
    //     include: "accountName",
    //   },
    // });

    // const accountNames = tokens.map((token) => token.dataValues.accountName);

    const cskuData = await csku.findAll({
      where: {
        accountName: accountName,
        userId: userId,
      },
    });

    const response = [];
    await Promise.all(
      cskuData?.map(async (data) => {
        response.push({
          channelId: data.dataValues.channelId,
          variantId: data.dataValues.variantId,
          isku: data.dataValues.isku,
          currency: data.dataValues.currency,
          price: data.dataValues.price,
          images: data.dataValues.images,
          title: data.dataValues.title,
          description: data.dataValues.description,
          quantity: data.dataValues.quantity,
          mrp: data.dataValues.mrp,
          categoryId: data.dataValues.categoryId,
          categoryName: data.dataValues.categoryName,
          accountName: data.dataValues.accountName,
          siteId: data.dataValues.siteId,
        });
      })
    );

    if (response.length == 0) {
      response.push({
        channelId: "",
        variantId: "",
        isku: "",
        currency: "",
        price: "",
        images: "",
        title: "",
        description: "",
        quantity: "",
        mrp: "",
        categoryId: "",
        categoryName: "",
      });
    }

    const parser = new CSVParser();
    const csv = parser.parse(response);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment;filename=bulkCSVUpdate.csv"
    );
    res.status(200).end(csv);
  } catch (err) {
    newRelic.recordCustomEvent("Error in generate csv. Error: ", err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};
exports.BulkCSKUUpdate = async (req, res) => {
  const functionName = "BulkSCKUUpdate";
  try {
    const { userId } = req.body;

    if (req.file.mimetype == "text/csv") {
      const buffer = req.file.buffer;

      let jsonData = await convertToJSON(buffer);

      if (jsonData.length > 10000) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "upload a file between  1 to 10000 values",
        });
      }

      jsonData = jsonData.filter((item) => item.channelId != "");

      await Promise.all(
        jsonData?.map(async (data) => {
          const cskuData = await csku.update(
            {
              variantId: data.variantId,
              isku: data.isku,
              currency: data.currency,
              price: data.price,
              images: data?.images?.split(","),
              title: data.title,
              description: data.description,
              quantity: data.quantity,
              mrp: data.mrp,
              categoryId: data.categoryId,
              categoryName: data.categoryName,
            },
            {
              where: { channelId: data.channelId },
              returning: true,
            }
          );

          await Promise.all(
            cskuData[1]?.map(async (item) => {
              const token = await Tokens.findOne({
                where: {
                  marketPlaceId: item.dataValues?.marketplaceId,
                  userId: userId,
                  accountName: item.dataValues.accountName,
                },
              });

              if (!token) {
                return res.status(500).json({
                  success: false,
                  status: 500,
                  message: "Token for this user not found.",
                });
              }

              const eBay = new ebay({
                appId: process.env.APP_ID,
                certId: process.env.CERT_ID,
                sandbox: false,
                devId: process.env.DEV_ID,
                authToken: token.dataValues.token,
              });

              eBay.oAuth2.setCredentials({
                refresh_token: token.dataValues.refreshToken,
              });
              let startdate = moment().add(5, "hours").add(30, "minutes");
              let tokenExpiresDate = moment(token.lastTokenRefreshDate);
              let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

              if (hoursDifference >= 2) {
                await refreshToken(eBay, token);
              }
              // try {
              //   await eBay.trading.GetTokenStatus({
              //     RequesterCredentials: {
              //       eBayAuthToken: token.dataValues.token,
              //     },
              //   });
              //   await apiCallLog("GetTokenStatus","/catalogue/BulkCSKUUpdate",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
              // } catch (err) {
              //   await apiCallLog("GetTokenStatus","/catalogue/BulkCSKUUpdate",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
              //   if (err) {
              //     await refreshToken(eBay, token)
              //   }
              // }

              await eBay.trading.ReviseFixedPriceItem({
                Item: {
                  ItemID: data.channelId,
                  SKU: data.isku,
                  StartPrice: data.price,
                  Currency: data.currency,
                  Description: data.description,
                  PrimaryCategory: {
                    CategoryID: data.categoryId,
                    CategoryName: data.categoryName,
                  },
                  Quantity: data.quantity,
                  PictureDetails: {
                    PictureURL: JSON.parse(
                      data?.images?.replaceAll(`"`, `'`).replaceAll(`'`, `"`)
                    ),
                  },
                },
              });
              await apiCallLog(
                "ReviseFixedPriceItem",
                "/catalogue/BulkCSKUUpdate",
                functionName,
                {
                  Item: {
                    ItemID: data.channelId,
                    SKU: data.isku,
                    StartPrice: data.price,
                    Currency: data.currency,
                    Description: data.description,
                    PrimaryCategory: {
                      CategoryID: data.categoryId,
                      CategoryName: data.categoryName,
                    },
                    Quantity: data.quantity,
                    PictureDetails: {
                      PictureURL: JSON.parse(
                        data?.images?.replaceAll(`"`, `'`).replaceAll(`'`, `"`)
                      ),
                    },
                  },
                },
                {},
                {},
                "success"
              );
            })
          );
        })
      );

      return res.status(200).json({
        success: true,
        status: 200,
        message: `Data successfully updated`,
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Please enter a valid file.",
      });
    }
  } catch (err) {
    await apiCallLog(
      "ReviseFixedPriceItem",
      "/catalouge/BulkCSKUUpdate",
      functionName,
      {
        Item: {
          ItemID: data.channelId,
          SKU: data.isku,
          StartPrice: data.price,
          Currency: data.currency,
          Description: data.description,
          PrimaryCategory: {
            CategoryID: data.categoryId,
            CategoryName: data.categoryName,
          },
          Quantity: data.quantity,
          PictureDetails: {
            PictureURL: JSON.parse(
              data?.images?.replaceAll(`"`, `'`).replaceAll(`'`, `"`)
            ),
          },
        },
      },
      {},
      err.meta,
      "error"
    );
    newRelic.recordCustomEvent(
      "Error in bulk csku update. Error: ",
      err.message
    );
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.GetAllISKU = async (req, res) => {
  try {
    const { userId, search } = req.query;
    if (!userId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "User ID is required",
      });
    }
    if (!search) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Search term is required",
      });
    }
    const decodedSearch = search ? decodeURIComponent(search) : undefined;
    const query = { where: {} };

    const tokens = await Tokens.findAll({
      where: {
        userId: userId,
      },
    });

    const accountNames = tokens?.map((token) => token?.dataValues?.accountName);

    if (accountNames.length > 0) {
      query.where.accountName = {
        [Op.in]: accountNames,
      };
    }

    const iskuData = await isku.findAll({
      attributes: {
        exclude: [
          "costPrice",
          "currency",
          "mrp",
          "weight",
          "height",
          "width",
          "depth",
          "quantity",
          "images",
          "title",
          "marketplaceId",
          "accountName",
          "warehouseLocation",
          "isSellerFulfilled",
          "created_at",
          "updated_at",
          "createdAt",
          "updatedAt",
          "status",
        ],
      },
      where: {
        isku: {
          [Op.iLike]: `%${decodedSearch}%`,
        },
        userId: userId,
      },
    });

    const response = iskuData?.map((item) => item.dataValues?.isku);

    return res.status(200).json({
      success: true,
      status: 200,
      data: response,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.CheckInDB = async (req, res) => {
  try {
    const { sku, userId } = req.params;
    if (!userId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "User ID is required",
      });
    }
    if (!sku) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "SKU is required",
      });
    }

    const decodedSearch = sku ? decodeURIComponent(sku) : undefined;

    const iskuData = await isku.findOne({
      where: {
        isku: decodedSearch,
        userId: userId,
      },
    });

    return res.status(200).json({
      success: false,
      status: 200,
      data: iskuData,
      foundIndDb: iskuData ? true : false,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};
exports.UpdateISKU = async (req, res) => {
  const functionName = "UpdateISKU";
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "ISKU ID is required",
      });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Request body is required",
      });
    }
    const iskuNo = decodeURIComponent(id);
    const {
      title,
      quantity,
      height,
      weight,
      depth,
      width,
      images,
      warehouseLocation,
      isSellerFulfilled,
      lowQtyThresh,
      userId,
    } = req.body;
    if (!userId || !iskuNo || !quantity) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "User ID, ISKU Number and Quantity are required",
      });
    }

    const iskuData = await isku.findOne({ where: { isku: iskuNo, userId } });

    if (!iskuData) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid ISKU Number",
      });
    }

    const updateErrors = [];

    if (
      // iskuData?.dataValues?.isku != iskuNo ||
      iskuData?.dataValues?.quantity != quantity
      // iskuData?.dataValues?.height != height ||
      // iskuData?.dataValues?.weight != weight ||
      // iskuData?.dataValues?.depth != depth ||
      // iskuData?.dataValues?.width != width
    ) {
      // const updatedCsku = await csku.update(
      //   {
      //     isku: iskuNo,
      //     quantity: quantity
      //   },
      //   {
      //     where: { isku: iskuData?.dataValues?.isku },
      //     returning: true
      //   }
      // )
      const updatedCsku = await csku.findAll(
        // {
        //   isku: iskuNo,
        //   quantity: quantity
        // },
        {
          where: {
            isku: iskuData?.dataValues?.isku,
            userId: userId,
            status: {
              [Op.in]: ["active", "live"],
            },
          },
          //returning: true
        }
      );

      // await Promise.all(
      //   updatedCsku[1]?.map(async update => {
      //     const token = await Tokens.findOne({
      //       where: {
      //         marketPlaceId: update.dataValues?.marketplaceId,
      //         userId: userId,
      //         accountName: update.dataValues?.accountName
      //       }
      //     })

      //     if (!token) {
      //       return res.status(400).json({
      //         success: false,
      //         status: 400,
      //         message: 'Token for this user not found.'
      //       })
      //     }

      //     const eBay = new ebay({
      //       appId: process.env.APP_ID,
      //       certId: process.env.CERT_ID,
      //       sandbox: false,
      //       devId: process.env.DEV_ID,
      //       authToken: token?.dataValues?.token
      //     })

      //     eBay.oAuth2.setCredentials({
      //       refresh_token: token?.dataValues?.refreshToken
      //     })
      //     let startdate = moment().add(5, 'hours').add(30, 'minutes')
      //     let tokenExpiresDate = moment(token.lastTokenRefreshDate)
      //     let hoursDifference = startdate.diff(tokenExpiresDate, 'hours')

      //     if (hoursDifference >= 2) {
      //       await refreshToken(eBay, token)
      //     }
      //     // try {
      //     //   await eBay.trading.GetTokenStatus({
      //     //     RequesterCredentials: {
      //     //       eBayAuthToken: token?.dataValues?.token
      //     //     }
      //     //   })
      //     //   await apiCallLog("GetTokenStatus","/catalouge/update/isku/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      //     // } catch (err) {
      //     //   await apiCallLog("GetTokenStatus","/catalouge/update/isku/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //     //   console.log('err', err)
      //     //   if (err) {
      //     //     await refreshToken(eBay, token)
      //     //   }
      //     // }

      //     await eBay.trading.ReviseFixedPriceItem({
      //       Item: {
      //         ItemID: update?.dataValues?.channelId,
      //         ISKU: update?.dataValues?.isku,
      //         Quantity: update?.dataValues?.quantity,
      //         StartPrice: update?.dataValues?.mrp,
      //         Currency: update?.dataValues?.currency,
      //         ShippingPackageDetails: {
      //           MeasurementUnit: 'Metric',
      //           PackageDepth: Number(update?.dataValues?.depth),
      //           PackageLength: Number(update?.dataValues?.height),
      //           PackageWidth: Number(update?.dataValues?.width),
      //           WeightMajor: Number(update?.dataValues?.weight),
      //           WeightMinor: Number(update?.dataValues?.weight)
      //         }
      //       }
      //     })
      //     await apiCallLog(
      //       'ReviseFixedPriceItem',
      //       '/catalouge/update/isku/:id',
      //       functionName,
      //       {
      //         Item: {
      //           ItemID: update?.dataValues?.channelId,
      //           ISKU: update?.dataValues?.isku,
      //           Quantity: update?.dataValues?.quantity,
      //           StartPrice: update?.dataValues?.mrp,
      //           Currency: update?.dataValues?.currency,
      //           ShippingPackageDetails: {
      //             MeasurementUnit: 'Metric',
      //             PackageDepth: Number(update?.dataValues?.depth),
      //             PackageLength: Number(update?.dataValues?.height),
      //             PackageWidth: Number(update?.dataValues?.width),
      //             WeightMajor: Number(update?.dataValues?.weight),
      //             WeightMinor: Number(update?.dataValues?.weight)
      //           }
      //         }
      //       },
      //       {},
      //       {},
      //       'success'
      //     )
      //   })
      // )

      const ebayRestockArr = await EbayRestock.updateEbayInventory(
        userId,
        updatedCsku,
        quantity,
        "quantityUpdate"
      );

      await Promise.all(
        updatedCsku?.map(async (update) => {
          const marketplace = await Marketplace.findOne({
            where: {
              id: update.dataValues.marketplaceId,
            },
          });

          if (marketplace?.dataValues?.parentMarketplace?.includes("ebay")) {
            const token = await Tokens.findOne({
              where: {
                marketPlaceId: update.dataValues?.marketplaceId,
                userId: userId,
                accountName: update.dataValues?.accountName,
              },
            });

            if (!token) {
              throw new Error("Token not found for this user");
            }

            const eBay = new ebay({
              appId: process.env.APP_ID,
              certId: process.env.CERT_ID,
              sandbox: false,
              devId: process.env.DEV_ID,
              authToken: token?.dataValues?.token,
            });

            eBay.oAuth2.setCredentials({
              refresh_token: token?.dataValues?.refreshToken,
            });
            let startdate = moment().add(5, "hours").add(30, "minutes");
            let tokenExpiresDate = moment(token.lastTokenRefreshDate);
            let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

            if (hoursDifference >= 2) {
              await refreshToken(eBay, token);
            }

            //const newQuantity = ebayRestockArr.find(ebayRestock => ebayRestock.isku === update.dataValues.isku)?.quantity ?? quantity

            // try {
            //   await eBay.trading.GetTokenStatus({
            //     RequesterCredentials: {
            //       eBayAuthToken: token?.dataValues?.token
            //     }
            //   })
            //   await apiCallLog("GetTokenStatus","/catalouge/update/isku/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
            // } catch (err) {
            //   await apiCallLog("GetTokenStatus","/catalouge/update/isku/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
            //   console.log('err', err)
            //   if (err) {
            //     await refreshToken(eBay, token)
            //   }
            // }
            try {
              await eBay.trading.ReviseFixedPriceItem({
                Item: {
                  ItemID: update?.dataValues?.channelId,
                  ISKU: update?.dataValues?.isku,
                  Quantity: quantity,
                  // ShippingPackageDetails: {
                  //   MeasurementUnit: 'Metric',
                  //   PackageDepth: Number(depth),
                  //   PackageLength: Number(height),
                  //   PackageWidth: Number(width),
                  //   WeightMajor: Number(weight?.split('.')?.[0] ?? 0),
                  //   WeightMinor: Number(weight?.split('.')?.[1] ?? 0)
                  // }
                },
              });

              update.quantity = quantity;
              await update.save();
            } catch (err) {
              console.log("In error", err.message);
              if (
                err.message.includes(
                  "This operation is not allowed for inventory items"
                )
              ) {
                console.log("Inventory item");
                try {
                  const inventoryItem =
                    await eBay.sell.inventory.getInventoryItem(
                      update?.dataValues?.isku
                    );

                  inventoryItem.availability.shipToLocationAvailability.quantity =
                    quantity;

                  // inventoryItem.packageWeightAndSize =
                  // { /* PackageWeightAndSize */
                  //   "dimensions":
                  //   { /* Dimension */
                  //     "height": height ?? inventoryItem.packageWeightAndSize.dimensions.height,
                  //     "length": depth ?? inventoryItem.packageWeightAndSize.dimensions.length,
                  //     "unit": inventoryItem.packageWeightAndSize.dimensions.unit,
                  //     "width": width ?? inventoryItem.packageWeightAndSize.dimensions.width
                  //   },
                  //   "weight":
                  //   { /* Weight */
                  //     "unit": inventoryItem.packageWeightAndSize.weight.unit,
                  //     "value": weight ?? inventoryItem.packageWeightAndSize.weight.value
                  //   }
                  // }
                  console.log(inventoryItem);
                  try {
                    await eBay.sell.inventory.bulkUpdatePriceQuantity({
                      requests: [
                        {
                          shipToLocationAvailability: {
                            quantity: quantity,
                          },
                          sku: update.dataValues.isku,
                        },
                      ],
                    });
                    update.quantity = quantity;
                    await update.save();
                  } catch (err) {
                    await apiCallLog(
                      "ReviseFixedPriceItem",
                      "/catalouge/update/isku/:id",
                      functionName,
                      {
                        Item: {
                          ItemID: update?.dataValues?.channelId,
                          ISKU: update?.dataValues?.isku,
                          Quantity: quantity,
                          StartPrice: update?.dataValues?.mrp,
                          Currency: update?.dataValues?.currency,
                          ShippingPackageDetails: {
                            MeasurementUnit: "Metric",
                            PackageDepth: Number(update?.dataValues?.depth),
                            PackageLength: Number(update?.dataValues?.height),
                            PackageWidth: Number(update?.dataValues?.width),
                            WeightMajor: Number(update?.dataValues?.weight),
                            WeightMinor: Number(update?.dataValues?.weight),
                          },
                        },
                      },
                      {},
                      err,
                      "error"
                    );

                    return;
                  }
                } catch (err) {
                  await apiCallLog(
                    "ReviseFixedPriceItem",
                    "/catalouge/update/isku/:id",
                    functionName,
                    {
                      Item: {
                        ItemID: update?.dataValues?.channelId,
                        ISKU: update?.dataValues?.isku,
                        Quantity: update?.dataValues?.quantity,
                        StartPrice: update?.dataValues?.mrp,
                        Currency: update?.dataValues?.currency,
                        ShippingPackageDetails: {
                          MeasurementUnit: "Metric",
                          PackageDepth: Number(update?.dataValues?.depth),
                          PackageLength: Number(update?.dataValues?.height),
                          PackageWidth: Number(update?.dataValues?.width),
                          WeightMajor: Number(update?.dataValues?.weight),
                          WeightMinor: Number(update?.dataValues?.weight),
                        },
                      },
                    },
                    {},
                    err,
                    "error"
                  );
                  updateErrors.push({
                    channelId: update.dataValues?.channelId,
                    error: `Failed to update inventory: ${err.message}`,
                  });
                  return;
                }
              } else if (err.message.includes("Auction ended.")) {
                await apiCallLog(
                  "ReviseFixedPriceItem",
                  "/catalouge/update/isku/:id",
                  functionName,
                  {
                    Item: {
                      ItemID: update?.dataValues?.channelId,
                      ISKU: update?.dataValues?.isku,
                      Quantity: update?.dataValues?.quantity,
                      StartPrice: update?.dataValues?.mrp,
                      Currency: update?.dataValues?.currency,
                      ShippingPackageDetails: {
                        MeasurementUnit: "Metric",
                        PackageDepth: Number(update?.dataValues?.depth),
                        PackageLength: Number(update?.dataValues?.height),
                        PackageWidth: Number(update?.dataValues?.width),
                        WeightMajor: Number(update?.dataValues?.weight),
                        WeightMinor: Number(update?.dataValues?.weight),
                      },
                    },
                  },
                  {},
                  err,
                  "error"
                );
                update.status = "completed";
                await update.save();
              } else {
                await apiCallLog(
                  "ReviseFixedPriceItem",
                  "/catalouge/update/isku/:id",
                  functionName,
                  {
                    Item: {
                      ItemID: update?.dataValues?.channelId,
                      ISKU: update?.dataValues?.isku,
                      Quantity: update?.dataValues?.quantity,
                      StartPrice: update?.dataValues?.mrp,
                      Currency: update?.dataValues?.currency,
                      ShippingPackageDetails: {
                        MeasurementUnit: "Metric",
                        PackageDepth: Number(update?.dataValues?.depth),
                        PackageLength: Number(update?.dataValues?.height),
                        PackageWidth: Number(update?.dataValues?.width),
                        WeightMajor: Number(update?.dataValues?.weight),
                        WeightMinor: Number(update?.dataValues?.weight),
                      },
                    },
                  },
                  {},
                  err,
                  "error"
                );
                updateErrors.push({
                  channelId: update.dataValues?.channelId,
                  error: `Failed to update inventory: ${err.message}`,
                });
                return;
              }
            }
            await apiCallLog(
              "ReviseFixedPriceItem",
              "/catalouge/update/isku/:id",
              functionName,
              {
                Item: {
                  ItemID: update?.dataValues?.channelId,
                  ISKU: update?.dataValues?.isku,
                  Quantity: quantity,
                  StartPrice: update?.dataValues?.mrp,
                  Currency: update?.dataValues?.currency,
                  ShippingPackageDetails: {
                    MeasurementUnit: "Metric",
                    PackageDepth: Number(update?.dataValues?.depth),
                    PackageLength: Number(update?.dataValues?.height),
                    PackageWidth: Number(update?.dataValues?.width),
                    WeightMajor: Number(update?.dataValues?.weight),
                    WeightMinor: Number(update?.dataValues?.weight),
                  },
                },
              },
              {},
              {},
              "success"
            );
          }
        })
      );
    }

    const updateIsku = await isku.update(
      {
        isku: iskuNo,
        title,
        quantity,
        height,
        weight,
        depth,
        width,
        warehouseLocation,
        isSellerFulfilled,
        lowQtyThresh,
        images,
      },
      { where: { isku: iskuData.dataValues?.isku } }
    );

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Inventory successfully updated",
      data: updateIsku,
      errors: updateErrors,
    });
  } catch (error) {
    await apiCallLog(
      "ReviseFixedPriceItem",
      "/catalouge/update/isku/:id",
      functionName,
      req.body,
      {},
      error,
      "error"
    );
    console.log(error);

    newRelic.recordCustomEvent(`Error in update isku. Error ${error.message}`);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
      errors: [],
    });
  }
};

exports.GetCatalogueStatusCount = async (req, res) => {
  try {
    const { userId, accountName } = req.query;

    const statusToKeyMap = {
      all: "all",
      live: "live",
      "under review": "underReview",
      "ready to list": "readyToList",
      draft: "draft",
      "group products": "groupProduct",
      failed: "failed",
      deleted: "deleted",
      completed: "completed",
    };

    const whereParts = [];
    const queryParams = [userId];
    whereParts.push('"userId" = ?');

    if (accountName) {
      whereParts.push(' "accountName" = ?');
      queryParams.push(accountName);
    }
    const query = `SELECT status, count (distinct "channelId")
    from cskus where ${whereParts.join(" AND ")}
    GROUP by status`;

    const result = await sequelize.query(
      {
        query,
        values: queryParams,
      },
      { type: Sequelize.QueryTypes.SELECT }
    );

    const toRet = {
      all: 0,
      live: 0,
      underReview: 0,
      readyToList: 0,
      draft: 0,
      groupProduct: 0,
      failed: 0,
      deleted: 0,
      completed: 0,
    };

    result.forEach((item) => {
      toRet[statusToKeyMap[item.status]] = parseInt(item.count || 0);
      toRet.all += parseInt(item.count || 0);
    });

    res.status(200).json({
      success: true,
      status: 200,
      data: toRet,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.GetInventoryStatusCount = async (req, res) => {
  try {
    const { userId } = req.query;

    const allCount = await isku.count({ where: { userId: userId } });
    const availableCount = await isku.count({
      where: {
        [Op.or]: [{ status: "available" }, { status: "new" }],
        userId: userId,
      },
    });

    const lowOnStockCount = await isku.count({
      where: {
        userId: userId,
        [Op.and]: [
          where(cast(col("quantity"), "TEXT"), {
            [Op.regexp]: "^\\s*\\d+(\\.\\d+)?\\s*$",
          }),
          where(cast(col("lowQtyThresh"), "TEXT"), {
            [Op.regexp]: "^\\s*\\d+(\\.\\d+)?\\s*$",
          }),
          where(cast(col("quantity"), "NUMERIC"), {
            [Op.lte]: cast(col("lowQtyThresh"), "NUMERIC"),
          }),
        ],
      },
    });

    const outOfStockCount = await isku.count({
      where: {
        // status: 'out of stock',
        userId: userId,
        quantity: {
          [Op.regexp]: "^\\s*0+(\\.0+)?\\s*$",
        },
      },
    });
    const deletedCount = await isku.count({
      where: { status: "deleted", userId: userId },
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: {
        all: allCount,
        available: availableCount,
        lowOnStock: lowOnStockCount,
        outOfStock: outOfStockCount,
        deleted: deletedCount,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.getItemDetails = async (req, res) => {
  try {
    const { accountName, userId, marketplaceId, fetchAspects } = req.body;

    const token = await Tokens.findOne({
      where: {
        accountName: accountName,
        userId: userId,
        marketPlaceId: marketplaceId,
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Account not found",
      });
    }

    const cskus = await csku.findAll({
      where: { accountName: accountName, userId: userId },
    });

    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId },
    });

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Marketplace not found",
      });
    }

    if (marketplace.url.includes("ebay")) {
      await handleEbayItemDetails(
        token,
        cskus,
        fetchAspects,
        accountName,
        userId,
        res
      );
    } else if (marketplace.url.includes("shopify")) {
      await handleShopifyItemDetails(token, cskus, accountName, userId);
      return res.status(200).json({
        success: true,
        status: 200,
        message: "Item Details fetched from Shopify",
      });
    } else {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Unsupported marketplace",
      });
    }
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occurred while fetching item details. Error ${error}`
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

const handleEbayItemDetails = async (
  token,
  cskus,
  fetchAspects,
  accountName,
  userId,
  res
) => {
  const functionName = "handleEbayItemDetails";
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
    // authToken: token.dataValues.token,
  });
  eBay.oAuth2.setCredentials(token.dataValues.token);

  const bulkMigrateData = [];
  const queueData = [];

  await Promise.all(
    cskus?.map(async (item) => {
      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }
      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/catalouge/get-item-details",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {
      //   await apiCallLog("GetTokenStatus","/catalouge/get-item-details",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   if (err) {
      //     await refreshToken(eBay, token)
      //   }
      // }

      if (item.dataValues.sku_found && item.dataValues.status === "live") {
        bulkMigrateData.push({
          listingId: item.dataValues.channelId,
        });
      } else if (!item.dataValues.sku) {
        queueData.push({
          id: item.dataValues.id,
          listingId: item.dataValues.channelId,
          sku: item.dataValues.isku,
          status: item.dataValues.status,
          accountName: accountName,
          userId: userId,
        });
      }
    })
  );

  let requestData = [];

  if (queueData.length > 0) {
    for (var i = 0; i < queueData.length; i++) {
      migrateQueue.add(queueData.slice(i, i + 1000));
      i = i + 1000;
    }
  }

  for (var i = 0; i < bulkMigrateData.length; i++) {
    const item = bulkMigrateData[i];
    requestData.push(item);
    if (requestData.length == 3) {
      const data = await eBay.sell.inventory
        .bulkMigrateListing({ requests: requestData })
        .catch((err) => {
          newRelic.recordCustomEvent(
            `Error while bulk migrate in account ${accountName}. Error: ${err}`
          );
          console.log(err);
        });
      requestData = [];
    }
  }

  for (var i = 0; i < cskus.length; i++) {
    const csku = cskus[i];

    try {
      const data = await eBay.sell.inventory.getInventoryItem(
        csku.dataValues.isku
      );
      csku.itemSpecifics = data.product.aspects;

      const offerData = await eBay.sell.inventory.getOffers({
        sku: csku.dataValues.isku,
      });
      const offerId = offerData.offers[0].offerId;
      csku.offerId = offerId;

      try {
        const itemCompatibility =
          await eBay.sell.inventory.getProductCompatibility(
            csku.dataValues.isku
          );
        csku.itemCompatibility = itemCompatibility.compatibleProducts;
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  }

  return res.status(200).json({
    success: true,
    status: 200,
    message: "Item Specifics fetched",
  });
};

exports.DeleteCSKU = async (req, res) => {
  try {
    const { offerId, accountName, marketplaceId, userId } = req.body;

    const token = await Tokens.findOne({
      where: {
        marketplaceId: marketplaceId,
        accountName: accountName,
        userId: userId,
      },
    });
    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Token for this account does not exist",
      });
    }

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      // authToken: token.dataValues.token,
    });
    eBay.oAuth2.setCredentials(token.dataValues.token);

    await eBay.sell.inventory.withdrawOffer(offerId);

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occured while deleting csku. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.GenerateBulkMigrateCsv = async (req, res) => {
  try {
    const data = [
      {
        channelId: "",
      },
    ];

    const parser = new CSVParser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment;filename=bulkUpload.csv");
    res.status(200).end(csv);
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occured while generating csv. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};
exports.MigrateItems = async (req, res) => {
  const functionName = "MigrateItems";
  try {
    let {
      sourceAccount,
      destAccount,
      sourceUserId,
      destUserId,
      itemArray,
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
      merchantLocation,
      isBulkUploaded,
    } = req.body;

    if (
      !sourceAccount ||
      !destAccount ||
      !sourceUserId ||
      !destUserId ||
      !itemArray?.length ||
      !fulfillmentPolicyId ||
      !paymentPolicyId ||
      !returnPolicyId ||
      !merchantLocation
    ) {
      return res.status(400).json({
        success: false,
        message: "Please Provide All Required Details",
      });
    }
    itemArray = itemArray?.filter(
      (value, index, self) => self.indexOf(value) === index
    );
    const fulfillmentPolicy = await shippingPolicies.findOne({
      where: { fulfillmentPolicyId: fulfillmentPolicyId },
    });
    if (!fulfillmentPolicy) {
      return res.status(404).json({
        success: false,
        message: "Fulfillment policy for this id not found",
      });
    }

    const paymentPolicy = await paymentPolicies.findOne({
      where: { paymentPolicyId: paymentPolicyId },
    });
    if (!paymentPolicy) {
      return res.status(404).json({
        success: false,
        message: "Payment policy for this id not found",
      });
    }

    const returnPolicy = await returnPolicies.findOne({
      where: { returnPolicyId: returnPolicyId },
    });
    if (!returnPolicy) {
      return res.status(404).json({
        success: false,
        message: "Fulfillment policy for this id not found",
      });
    }
    const sourceToken = await Tokens.findOne({
      where: { accountName: sourceAccount, userId: sourceUserId },
    });

    if (!sourceToken) {
      return res.status(404).json({
        success: true,
        message: "Source account not found",
      });
    }

    const destToken = await Tokens.findOne({
      where: { accountName: destAccount, userId: destUserId },
    });

    if (!destToken) {
      return res.status(404).json({
        success: true,
        message: "Destination account not found",
      });
    }
    const sourceEbay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
    });
    sourceEbay.oAuth2.setCredentials(sourceToken.dataValues.token);
    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(sourceToken.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

    if (hoursDifference >= 2) {
      await refreshToken(sourceEbay, sourceToken);
    }
    // try {
    //   await sourceEbay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: sourceToken.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/catalouge/bulk-migrate-data",functionName,{ RequesterCredentials: { eBayAuthToken: sourceToken.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/catalouge/bulk-migrate-data",functionName,{ RequesterCredentials: { eBayAuthToken: sourceToken.dataValues.token } },{}, err.meta, 'error');
    //   await refreshToken(sourceEbay, sourceToken);
    // }

    const destEbay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      acceptLanguage: ebay.Locale.en_US,
      contentLanguage: ebay.Locale.en_US,
      // authToken: token.dataValues.token,
    });
    destEbay.oAuth2.setCredentials(destToken.dataValues.token);
    startdate = moment().add(5, "hours").add(30, "minutes");
    tokenExpiresDate = moment(destToken.lastTokenRefreshDate);
    hoursDifference = startdate.diff(tokenExpiresDate, "hours");

    if (hoursDifference >= 2) {
      await refreshToken(destEbay, destToken);
    }
    // try {
    //   await destEbay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: destToken.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/catalouge/bulk-migrate-data",functionName,{ RequesterCredentials: { eBayAuthToken: destToken.dataValues.token } },{}, {}, 'success');

    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/catalouge/bulk-migrate-data",functionName,{ RequesterCredentials: { eBayAuthToken: destToken.dataValues.token } },{}, err.meta, 'error');

    //   await refreshToken(destEbay, destToken);
    // }

    // NOTE - commented because now location key is coming from FE
    // const merchantLocationKey = await merchantLocation.findOne({
    //   where: { accountName: destAccount, userId: destUserId }
    // })

    // if (!merchantLocationKey) {
    //   return res.status(500).json({
    //     success: true,
    //     message: 'Merchant location not found'
    //   })
    // }

    let items = await csku.findAll({
      where: {
        channelId: {
          [Op.in]: itemArray,
        },
        userId: sourceUserId,
        accountName: sourceAccount,
      },
    });

    console.log(items);
    items = items?.filter(
      (item) => !item.dataValues.copied_to_account.includes(destAccount)
    );
    console.log(items);
    if (items?.length === 0) {
      console.log("Length 0");
      return res.status(400).json({
        success: false,
        message: `Items already migrated`,
      });
    }
    let pushData = items.map((item) => ({ ...item.dataValues }));
    pushData = pushData.filter(
      (item) => !item.copied_to_account.includes(destAccount)
    );
    const uploadData = [];
    pushData?.map(async (item) => {
      delete item.id;
      item.channelId = "To Be Migrated";
      item.accountName = destAccount;
      item.userId = destUserId;
      item.status = "ready to list";
      item.sellerProfile = {
        SellerReturnProfile: {
          ReturnProfileID: returnPolicy.dataValues.returnPolicyId,
          ReturnProfileName: returnPolicy.dataValues.name,
        },
        SellerPaymentProfile: {
          PaymentProfileID: paymentPolicy.dataValues.paymentPolicyId,
          PaymentProfileName: paymentPolicy.dataValues.name,
        },
        SellerShippingProfile: {
          ShippingProfileID: fulfillmentPolicy.dataValues.fulfillmentPolicyId,
          ShippingProfileName: fulfillmentPolicy.dataValues.name,
        },
      };

      uploadData.push(item);
    });

    try {
      await csku.bulkCreate(uploadData);
      res.status(200).json({
        success: true,
        message: "Data migration started",
      });
    } catch (err) {
      newRelic.recordCustomEvent("Error", err);
      console.log(err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
    let newHistory = null;
    let errorFile = [];
    if (isBulkUploaded) {
      const headers = [
        "channelId",
        "variantId",
        "siteId",
        "isku",
        "currency",
        "price",
        "images",
        "title",
        "description",
        "packageType",
        "quantity",
        "quantityLimitPerBuyer",
        "mrp",
        "categoryId",
        "categoryName",
        "collections",
        "weight",
        "weightUnit",
        "height",
        "width",
        "unit",
        "length",
        "marketplaceId",
        "itemSpecifics",
        "itemCompatibility",
        "sellerProfile",
        "variation",
        "merchantLocation",
      ];
      const jsonData = items?.map((itm) => itm?.dataValues);
      // console.log(jsonData, "jsonData");
      //NOTE - make a dynamic excel file path
      let groupProductId = uuidv4();
      const migrateExcelFile = `${groupProductId}-${sourceAccount}-${destAccount}-copied-failed-${new Date()}-data.xlsx`;
      const res = await generateExcelFile(jsonData, migrateExcelFile, headers);

      const fileBuffer = fs.readFileSync(migrateExcelFile);
      // NOTE - upload original file to S3 Bucket
      const fileLocation = await uploadToS3({
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fileBuffer,
        originalname: `failed-report/${groupProductId}-copied-${sourceAccount}-to-${destAccount}-${new Date()}`,
      });
      console.log(fileLocation, "s3Response");

      // NOTE - add it to bulk upload history
      const bulkUploadHistory = await BulkUploadHistory.create({
        actionType: BulkActionType.COPY_CATALOGUE,
        userId: sourceUserId,
        sourceAccountName: sourceAccount,
        destinationAccountName: destAccount,
        merchantLocationKey: merchantLocation,
        siteId: items[0]?.dataValues?.siteId || null,
        paymentPolicy: {
          id: paymentPolicy?.dataValues?.paymentPolicyId,
          name: paymentPolicy?.dataValues?.name,
        },
        fulfillmentPolicy: {
          id: fulfillmentPolicy?.dataValues?.fulfillmentPolicyId,
          name: fulfillmentPolicy?.dataValues?.name,
        },
        returnPolicy: {
          id: returnPolicy?.dataValues?.returnPolicyId,
          name: returnPolicy?.dataValues?.name,
        },
        uploadedFilePath: fileLocation || null,
        totalItems: jsonData?.length || 0,
        status: HistoryStatus.INPROGRESS,
      });
      newHistory = bulkUploadHistory?.dataValues;
    }

    let finalData = [];
    let successCounts = 0;
    let failedCounts = 0;

    let i = 0;
    for (i = 0; i < items.length; i++) {
      const item = items[i];
      // item?.dataValues.itemSpecifics?.map(specs => {
      //   aspects[specs.Name] = specs.Value
      // });
      let data;
      let aspects;
      const errors = [];
      let locale;
      let condition;
      let offer;
      let offerMarketplaceID;
      let compatibility;
      try {
        data = await sourceEbay.sell.inventory.getInventoryItem(
          item.dataValues.isku
        );
        aspects = data.product.aspects;
        locale = data.locale;
        condition = data.condition;

        offer = await sourceEbay.sell.inventory.getOffers({
          sku: item.dataValues.isku,
        });
        offerMarketplaceID = offer.offers[0].marketplaceId;

        try {
          const productCompatibilityData =
            await sourceEbay.sell.inventory.getProductCompatibility(
              item.dataValues.isku
            );
          compatibility = productCompatibilityData.compatibleProducts;
        } catch (error) {
          console.log("getProductCompatibility1 ------->", error);
        }
      } catch (err) {
        console.log("getInventoryItem", err);
        // errors.push({ itemId: item.dataValues.channelId, error: `Data not found for ${item.dataValues.title} with item ID ${item.dataValues.channelId}` });
        // continue;
        try {
          await sourceEbay.sell.inventory.bulkMigrateListing({
            requests: [
              {
                listingId: item.dataValues.channelId,
              },
            ],
          });
          data = await sourceEbay.sell.inventory.getInventoryItem(
            item.dataValues.isku
          );
          aspects = data.product.aspects;
          locale = data.locale;
          condition = data.condition;

          offer = await sourceEbay.sell.inventory.getOffers({
            sku: item.dataValues.isku,
          });
          offerMarketplaceID = offer.offers[0].marketplaceId;
          try {
            const productCompatibilityData =
              await sourceEbay.sell.inventory.getProductCompatibility(
                item.dataValues.isku
              );
            compatibility = productCompatibilityData.compatibleProducts;
          } catch (err) {
            console.log(err);
          }
        } catch (error) {
          if (error) {
            console.log(error);
            if (
              error?.meta?.responses &&
              error?.meta?.responses[0]?.errors[0]?.message ==
              "A user error has occurred. This listing is already migrated"
            ) {
              console.log(error.meta);
            } else if (
              error.meta?.res?.data?.responses[0]?.errors[0]?.message ==
              "A user error has occurred. The listing SKU cannot be null or empty."
            ) {
              try {
                await sourceEbay.trading.ReviseItem({
                  Item: {
                    ItemID: item.dataValues.channelId,
                    SKU: item.dataValues.isku,
                  },
                });
                await apiCallLog(
                  "ReviseItem",
                  "/catalouge/bulk-migrate-data",
                  functionName,
                  {
                    Item: {
                      ItemID: item.dataValues.channelId,
                      SKU: item.dataValues.isku,
                    },
                  },
                  {},
                  {},
                  "success"
                );
              } catch (err) {
                await apiCallLog(
                  "ReviseItem",
                  "/catalouge/bulk-migrate-data",
                  functionName,
                  {
                    Item: {
                      ItemID: item.dataValues.channelId,
                      SKU: item.dataValues.isku,
                    },
                  },
                  {},
                  {},
                  "error"
                );
                console.log(err);
                const migrateData = await csku.findOne({
                  where: {
                    channelId: "To Be Migrated",
                    isku: item.dataValues.isku,
                    userId: destUserId,
                    accountName: destAccount,
                  },
                });
                migrateData.channelId = "";
                migrateData.offerId = "";
                migrateData.itemSpecifics = [aspects];
                migrateData.itemCompatibility = compatibility;
                migrateData.status = "failed";
                migrateData.copied_to_account = [];
                migrateData.errors = [{ error: error.message }];
                await migrateData.save();
                // finalData.push(migrateData.dataValues);
                if (isBulkUploaded) {
                  errorFile.push({
                    ...item,
                    error: `An error occurred while getting product compatibility: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                      error?.meta?.message
                      }`,
                  });
                  failedCounts++;
                }
                continue;
              }
              try {
                await sourceEbay.sell.inventory.bulkMigrateListing({
                  requests: [
                    {
                      listingId: item.dataValues.channelId,
                    },
                  ],
                });
              } catch (error) {
                console.log(error);
                const migrateData = await csku.findOne({
                  where: {
                    channelId: "To Be Migrated",
                    isku: item.dataValues.isku,
                    userId: destUserId,
                    accountName: destAccount,
                  },
                });
                migrateData.channelId = "";
                migrateData.offerId = "";
                migrateData.itemSpecifics = [aspects];
                migrateData.itemCompatibility = compatibility;
                migrateData.status = "failed";
                migrateData.copied_to_account = [];
                migrateData.errors = [error.meta];
                await migrateData.save();
                // finalData.push(migrateData.dataValues);
                if (isBulkUploaded) {
                  errorFile.push({
                    ...item,
                    error: `An error occurred while getting product compatibility: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                      error?.meta?.message
                      }`,
                  });
                  failedCounts++;
                }
                continue;
              }

              data = await sourceEbay.sell.inventory.getInventoryItem(
                item.dataValues.isku
              );
              aspects = data.product.aspects;
              locale = data.locale;
              condition = data.condition;

              offer = await sourceEbay.sell.inventory.getOffers({
                sku: item.dataValues.isku,
              });
              offerMarketplaceID = offer.offers[0].marketplaceId;

              try {
                const productCompatibilityData =
                  await sourceEbay.sell.inventory.getProductCompatibility(
                    item.dataValues.isku
                  );
                compatibility = productCompatibilityData.compatibleProducts;
              } catch (err) {
                console.log(err);
              }
            } else {
              const migrateData = await csku.findOne({
                where: {
                  channelId: "To Be Migrated",
                  isku: item.dataValues.isku,
                  userId: destUserId,
                  accountName: destAccount,
                },
              });
              migrateData.channelId = "";
              migrateData.offerId = "";
              migrateData.itemSpecifics = [aspects];
              migrateData.itemCompatibility = compatibility;
              migrateData.status = "failed";
              migrateData.copied_to_account = [];
              migrateData.errors = [err.meta];
              await migrateData.save();
              // finalData.push(migrateData.dataValues);
              if (isBulkUploaded) {
                errorFile.push({
                  ...item,
                  error: `An error occurred while getting product compatibility: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                    error?.meta?.message
                    }`,
                });
                failedCounts++;
              }
              continue;
            }
          }

          // const data = await sourceEbay.trading.GetItem({
          //   ItemID: item.dataValues.channelId,
          //   IncludeItemCompatibilityList: true,
          //   IncludeItemSpecifics: true,
          //   DetailLevel: "ReturnAll",
          // });

          // aspects = {};
          // data.Item.ItemSpecifics?.NameValueList?.map((item) => {
          //   aspects[item.Name] = [item.Value];
          // });

          // item.itemSpecifics = [aspects];
          // await item.save();

          // compatibility = data.Item.ItemCompatibilityList?.NameValueList?.map((item) => {
          //   return { name: item.Name, value: item.Value };
          // });

          // condition = data.Item.ConditionDisplayName.toUpperCase();

          // const geoData = await Geosite.findOne({
          //   where: { currency: data.Item.Currency },
          // });

          // locale = geoData.dataValues.localeValue;

          // if (data.Item.Site == "eBayMotors") {
          //   offerMarketplaceID = "EBAY_MOTORS";
          // } else {
          //   offerMarketplaceID = geoData.dataValues.globalId;
          // }

          // offer = "data found";
        }
      }
      console.log("getting offer ------>");
      if (!offer) {
        try {
          offer = await sourceEbay.sell.inventory.getOffers({
            sku: item.dataValues.isku,
          });
          offerMarketplaceID = offer.offers[0].marketplaceId;
        } catch (error) {
          console.log("getOffers ------->", error);
          errors.push({
            itemId: item.dataValues.channelId,
            error: `Offer not found for ${item.dataValues.title} with item ID ${item.dataValues.channelId}`,
          });
          if (isBulkUploaded) {
            errorFile.push({
              ...item,
              error: `An error occurred while getting product compatibility: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                error?.meta?.message
                }`,
            });

            failedCounts++;
          }
          continue;
        }
      }

      const inventoryData = {
        channelId: item.dataValues.channelId,
        sku: item.dataValues.isku,
        locale: locale.replace("-", "_"),
        product: {
          title: item.dataValues.title,
          aspects: aspects,
          imageUrls: item.dataValues.images,
        },
        availability: {
          shipToLocationAvailability: {
            quantity: item.dataValues.quantity,
          },
        },
        condition: condition,
      };

      const offerData = {
        channelId: item.dataValues.channelId,
        sku: item.dataValues.isku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        categoryId: item.dataValues.categoryId,
        pricingSummary: {
          price: {
            value: item.dataValues.price,
            currency: item.dataValues.currency,
          },
        },
        listingPolicies: {
          fulfillmentPolicyId: fulfillmentPolicyId,
          returnPolicyId: returnPolicyId,
          paymentPolicyId: paymentPolicyId,
        },
        tax: {
          applyTax: true,
        },
        listingDescription: item.dataValues.description,
        // merchantLocationKey: merchantLocationKey.dataValues.merchantLocationKey,
        merchantLocationKey: merchantLocation,
        marketplaceId: offerMarketplaceID,
      };

      const productCompatibilityData = {
        channelId: item.dataValues.channelId,
        sku: item.dataValues.isku,
        compatibility: compatibility,
      };
      console.log("going to create csku");
      let createProductRes = true;
      try {
        createProductRes = await destEbay.sell.inventory
          .bulkCreateOrReplaceInventoryItem({
            requests: [inventoryData],
          })
          .then((res) => {
            console.log(res);
          });
      } catch (error) {
        errors.push(error?.meta);
        console.log("bulkCreateOrReplaceInventoryItem ----------->", error);
        createProductRes = false;
        if (isBulkUploaded) {
          errorFile.push({
            ...item,
            error: `An error occurred while creating product: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
              error?.meta?.message
              }`,
          });
          failedCounts++;
        }
      }
      console.log("going to create offer", createProductRes);
      let offerIds = [];
      if (createProductRes) {
        try {
          const data = await destEbay.sell.inventory.bulkCreateOffer({
            requests: [offerData],
          });

          data?.responses?.map((res) => {
            offerIds.push({ sku: res.sku, offerId: res.offerId });
          });
          console.log(data, "offerResponse");
        } catch (error) {
          errors.push(error.meta.responses);
          console.log("bulkCreateOffer --------->", error);
          if (isBulkUploaded) {
            errorFile.push({
              ...item,
              error: `An error occurred while creating offer: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                error?.meta?.message
                }`,
            });

            failedCounts++;
          }
        }
      }

      if (productCompatibilityData) {
        await destEbay.sell.inventory
          .createOrReplaceProductCompatibility(productCompatibilityData.sku, {
            compatibleProducts: productCompatibilityData.compatibility,
          })
          .catch((err) => {
            newRelic.recordCustomEvent(
              "Error in create product compatibility",
              err
            );
          });
      }

      offerIds = offerIds.filter(Boolean);
      const listingIds = [];
      console.log("publishing offer", offerIds);
      if (offerIds.length > 0) {
        try {
          const data = await destEbay.sell.inventory.bulkPublishOffer({
            requests: [
              {
                offerId: offerIds[0].offerId,
              },
            ],
          });
          console.log(data.responses);
          data?.responses?.map((resp) => {
            if (resp.listingId) {
              listingIds.push({
                channelId: resp.listingId,
                offerId: resp.offerId,
                sku: "",
              });
            }
          });
          if (isBulkUploaded) {
            successCounts++;
          }
        } catch (error) {
          errors.push(error.meta.responses);
          console.log("bulkPublishOffer --------->", error);
          require("fs").writeFile(
            "error.json",
            JSON.stringify(error.meta),
            function (error) {
              console.log("Here");
            }
          );
          if (isBulkUploaded) {
            errorFile.push({
              ...item,
              error: `An error occurred while getting product compatibility: ${error?.meta?.responses?.[0]?.errors?.[0]?.message ||
                error?.meta?.message
                }`,
            });
            failedCounts++;
          }
          // if (err.meta?.responses) {
          //   err.meta.responses?.map((resp) => {
          //     if (resp.listingId) {
          //       listingIds.push({
          //         channelId: resp.listingId,
          //         offerId: resp.offerId,
          //         sku: "",
          //         errors: resp.errors,
          //       });
          //     } else {
          //       listingIds.push({
          //         channelId: "",
          //         offerId: resp.offerId,
          //         sku: "",
          //         errors: resp.errors,
          //       });
          //     }
          //   });
          // }
        }
      }
      // offerIds.map((offer) => {
      //   listingIds.map((listing) => {
      //     if (listing.offerId == offer.offerId) {
      //       listing.sku = offer.sku;
      //     }
      //   });
      // });

      // const sellerProfile = {
      //   SellerReturnProfile: {
      //     ReturnProfileID: returnPolicyId,
      //     ReturnProfileName: returnPolicy.dataValues.name,
      //   },
      //   SellerPaymentProfile: {
      //     PaymentProfileID: paymentPolicyId,
      //     PaymentProfileName: paymentPolicy.dataValues.name,
      //   },
      //   SellerShippingProfile: {
      //     ShippingProfileID: fulfillmentPolicyId,
      //     ShippingProfileName: fulfillmentPolicy.dataValues.name,
      //   },
      // };

      // items?.map((item) => {
      //   listingIds.map((listing) => {
      //     if (listing.sku == item.dataValues.isku) {
      //       item.channelId = listing.channelId;
      //       item.offerId = listing.offerId;
      //       item.accountName = destAccount;
      //       item.userId = destUserId;
      //       item.itemSpecifics = [aspects];
      //       item.errors = listing.errors || [];
      //       item.sellerProfile = sellerProfile;

      //       delete item.dataValues.id;

      //       finalData.push({
      //         ...item.dataValues,
      //         costPrice: item.price,
      //         status: listing.channelId == "" ? "failed" : "live",
      //       });
      //     } else {
      //       console.log(item, listing);
      //       item.errors = listing.errors || [];
      //       item.itemSpecifics = [aspects];
      //       item.sellerProfile = sellerProfile;
      //       delete item.dataValues.id;
      //       finalData.push({
      //         ...item.dataValues,
      //         costPrice: item.price,
      //         status: "failed",
      //       });
      //     }
      //   });
      // });

      const migrateData = await csku.findOne({
        where: {
          channelId: "To Be Migrated",
          isku: item.dataValues.isku,
          userId: destUserId,
          accountName: destAccount,
        },
        // attributes: ["id"],
      });

      if (migrateData) {
        migrateData.channelId = listingIds[0]?.channelId || "";
        migrateData.offerId = listingIds[0]?.offerId || offerIds[0]?.offerId;
        migrateData.itemSpecifics = [aspects];
        migrateData.itemCompatibility = compatibility;
        migrateData.status = listingIds[0]?.channelId != "" ? "live" : "failed";
        migrateData.copied_to_account = [];
        migrateData.errors = errors;
        await migrateData.save();
        // finalData.push(migrateData.dataValues);
        // finalData.push({
        //   id: migrateData.dataValues.id,
        //   channelId: listingIds[0]?.channelId || "",
        //   offerId: listingIds[0]?.offerId || offerIds[0]?.offerId,
        //   itemSpecifics: [aspects],
        //   itemCompatibility: compatibility,
        //   status: listingIds[0]?.channelId == "" ? "failed" : "live",
        //   copied_to_account: [],
        //   errors: errors,
        // });
      }

      item.itemSpecifics = [aspects];
      item.itemCompatibility = compatibility;
      if (item.dataValues.copied_to_account && errors.length === 0) {
        item.copied_to_account = [
          ...item.dataValues.copied_to_account,
          destAccount,
        ];
      }

      await item.save();
      console.log("end item loop");
    }

    // if (finalData.length > 0) {
    //   // await csku.destroy({ where: { channelId: "To Be Migrated", accountName: destAccount, userId: destUserId } });
    //   await csku.bulkCreate(finalData, { updateOnDuplicate: ["channelId", "offerId", "itemSpecifics", "itemCompatibility", "status", "copied_to_account", "errors"] });
    //   await isku.bulkCreate(finalData);
    // } else {
    //   console.log(errors);
    // }

    // if (errors.length > 0) {
    //   const parser = new CSVParser();
    //   const csv = parser.parse(errors);

    //   res.setHeader("Content-Type", "text/csv");
    //   res.setHeader("Content-Disposition", "attachment;filename=errors.csv");
    //   return res.status(200).end(csv);
    // }
    if (errorFile?.length) {
      // console.log(errorFile[0], "error");
      //NOTE - make a dynamic excel file path
      const fileName = `${groupProductId}-${sourceUserId}-${sourceAccount}-${destAccount}-copied-failed-${new Date()}-data.xlsx`;
      const excelFilePath = path.join(__dirname, fileName);
      const res = await generateExcelFile(errorFile, excelFilePath, [
        ...Object.keys(errorFile[0]),
      ]);
      let errorFileLocation = null;
      if (res && fs.existsSync(excelFilePath)) {
        //NOTE -  Read the Excel file as a buffer
        const fileBuffer = fs.readFileSync(excelFilePath);
        //NOTE -  Upload the Excel File to S3
        try {
          errorFileLocation = await uploadToS3({
            mimetype:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: fileBuffer,
            originalname: `failed-report/${groupProductId}-${sourceUserId}-${sourceAccount}-${destAccount}-copied-failed-${new Date()}-data`,
          });
          fs.unlink(excelFilePath, (err) => {
            if (err) {
              console.error("Error deleting file:", err);
            }
            console.log("File deleted successfully");
          });
          console.log(`Error file generated at ${errorFileLocation}`);
        } catch (error) {
          console.error("Error uploading file to S3:", error);
        }
      }
      await BulkUploadHistory.update(
        {
          errorFilePath: errorFileLocation,
          status: HistoryStatus.COMPLETED,
          failedItems: failedCounts,
          successItems: successCounts,
        },
        { where: { id: newHistory?.id } }
      );
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: "aditya@mergekart.com",
        cc: "pallavisolday12@gmail.com",
        subject: `Copy Failed Products Report ${new Date()}`,
        text: "Hello, please find the attached file.",
      };
      if (errorFileLocation) {
        mailOptions.attachments = [
          {
            filename: fileName,
            path: errorFileLocation,
          },
        ];
      } else {
        mailOptions.text = `Error While generating Error Excel File.`;
      }
      await sendUpdateReportEmail(mailOptions);
    }
    newRelic.recordCustomEvent("Data migrated successfully", finalData);
    console.log("Data migrated successfully", finalData.length);
    // return res.status(200).json({
    //   success: true,
    //   message: `${finalData.length} data copied from ${sourceAccount} to ${destAccount}`,
    //   errors: errors,
    // });
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occured while migrating data. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.ReSyncFromEbay = async (req, res) => {
  try {
    const id = req.params.id;

    const item = await csku.findOne({ where: { id: id } });

    if (!item) {
      return res.status(400).json({
        success: false,
        message: "Item not found",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId: item.dataValues.userId,
        accountName: item.dataValues.accountName,
        status: "active",
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found or is inactive",
      });
    }

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
    });
    eBay.OAuth2.setCredentials(token.dataValues.token);

    const data = await sourceEbay.sell.inventory.getInventoryItem(
      item.dataValues.isku
    );
    const aspects = data.product.aspects;

    const offer = await sourceEbay.sell.inventory.getOffers({
      sku: item.dataValues.isku,
    });
    const offerID = offer.offers[0].offerId;

    let compatibility;
    try {
      const productCompatibilityData =
        await sourceEbay.sell.inventory.getProductCompatibility(
          item.dataValues.isku
        );
      compatibility = productCompatibilityData.compatibleProducts;
    } catch (err) {
      console.log(err);
    }

    item.channelId = offer.offers[0].listing.listingId;
    item.itemSpecifics = [aspects];
    item.itemCompatibility = compatibility;
    item.offerId = offerID;

    await item.save();

    return res.status(200).json({
      success: false,
      message: "Data synced successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: true,
      message: err.message,
    });
  }
};

exports.GetCSVData = async (req, res) => {
  try {
    const file = req.file.buffer;
    const { siteId, userId, accountName, destAccount } = req.body;
    const site = await Geosite.findOne({ where: { globalId: siteId } });
    if (!site) {
      return res.status(400).json({
        success: false,
        message: "Site not found",
      });
    }
    const jsonData = await convertToJSON(file);

    if (jsonData.length > 5000) {
      return res.status(400).json({
        success: false,
        status: 400,
        messages: "upload a file between 1 to 5000 values",
      });
    }
    const destQuery = {};
    if (destAccount) {
      destQuery = {
        copied_to_account: {
          [Op.not]: {
            [Op.contains]: [destAccount],
          },
        },
      };
    }

    const data = await csku.findAll({
      where: {
        channelId: {
          [Op.in]: jsonData.map((item) => item.channelId),
        },
        userId: userId,
        accountName: accountName,
        ...destQuery,
      },
    });

    let correctItems = 0;
    let inCorrectItems = 0;
    const correctData = [];
    const inCorrectData = [];

    data.map((item) => {
      if (
        item.dataValues.siteId == siteId ||
        item.dataValues.currency == site.dataValues.currency
      ) {
        correctData.push(item);
        correctItems += 1;
      } else {
        inCorrectItems += 1;
        inCorrectData.push(item);
      }
    });

    let csv = "";
    if (inCorrectData.length > 0) {
      const parser = new CSVParser();
      csv = parser.parse(inCorrectData);
    }

    const resData = {
      success: true,
      data: correctData,
      correctItems,
      inCorrectItems,
      inCorrectData: csv,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment;filename=bulkUpload.csv");
    return res.status(200).end(JSON.stringify(resData));

    // return res.status(200).json({
    // success: true,
    // data: correctData,
    // correctItems,
    // inCorrectItems,
    // });
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occured while getting data. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.GetSingleCKSU = async (req, res) => {
  try {
    const id = req.params.id;

    const data = await csku.findOne({ where: { id: id } });

    if (!data) {
      return res.status(400).json({
        success: false,
        message: "Catalogue for this id not found",
      });
    }

    const geoSite = await Geosite.findOne({
      where: { currency: data.dataValues.currency },
    });

    if (!geoSite) {
      return res.status(400).json({
        success: false,
        message: "Geosite for this currency not found",
      });
    }

    return res.status(200).json({
      success: true,
      data,
      geoSite,
    });
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error occured while getting data. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.RetryListing = async (req, res) => {
  const functionName = "RetryListing";
  try {
    const id = req.params.id;
    const {
      title,
      description,
      price,
      height,
      weight,
      length,
      width,
      lenUnit,
      wgtUnit,
      quantity,
      quantityPerCust,
      images,
      categoryId,
      geoSite,
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
      accountName,
      userId,
    } = req.body;

    const item = await csku.findOne({ where: { id: id } });
    if (!item) {
      return res.status(400).json({
        success: false,
        message: "Data for this id not found",
      });
    }

    const token = await Tokens.findOne({
      where: { userId: userId, accountName: accountName[0] },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found for this user",
      });
    }

    const merchantLocationKey = await merchantLocation.findOne({
      where: { accountName: accountName[0], userId: userId },
    });

    if (!merchantLocationKey) {
      return res.status(400).json({
        success: false,
        message: "Merchant location not found for this account",
      });
    }

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      acceptLanguage: ebay.Locale[geoSite.localeValue.replace("-", "_")],
      contentLanguage: ebay.Locale[geoSite.localeValue.replace("-", "_")],
      // authToken: token.dataValues.token,
    });
    eBay.oAuth2.setCredentials(token.dataValues.token);
    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token);
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/catalouge/retry-listing/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/catalouge/retry-listing/:id",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');

    //   await refreshToken(eBay, token);
    // }

    let aspects = {};
    if (!item.dataValues.itemSpecifics) {
      const data = await sourceEbay.trading.GetItem({
        ItemID: item.dataValues.channelId,
        IncludeItemCompatibilityList: true,
        IncludeItemSpecifics: true,
        DetailLevel: "ReturnAll",
      });
      await apiCallLog(
        "GetItem",
        "/catalouge/retry-listing/:id",
        functionName,
        {
          ItemID: item.dataValues.channelId,
          IncludeItemCompatibilityList: true,
          IncludeItemSpecifics: true,
          DetailLevel: "ReturnAll",
        },
        data,
        {},
        "success"
      );
      data?.Item?.ItemSpecifics?.NameValueList?.map((specs) => {
        aspects[item.Name] = [item.Value];
      });
    } else {
      aspects = item.dataValues.itemSpecifics[0];
    }

    const inventoryData = {
      sku: item.dataValues.isku,
      locale: geoSite.localeValue,
      product: {
        title: title,
        aspects: aspects,
        // "description": item.dataValues.description,
        imageUrls: images,
      },
      availability: {
        shipToLocationAvailability: {
          quantity: quantity,
        },
      },
      condition: "NEW",
    };

    await eBay.sell.inventory.createOrReplaceInventoryItem(
      item.dataValues.isku,
      inventoryData
    );

    const offerData = {
      marketplaceId:
        geoSite.globalId == "EBAY_MOTORS_US" ? "EBAY_MOTORS" : geoSite.globalId,
      format: "FIXED_PRICE",
      categoryId: categoryId.categoryId,
      pricingSummary: {
        price: {
          value: price,
          currency: item.dataValues.currency,
        },
      },
      listingPolicies: {
        fulfillmentPolicyId: fulfillmentPolicyId,
        returnPolicyId: returnPolicyId,
        paymentPolicyId: paymentPolicyId,
      },
      tax: {
        applyTax: true,
      },
      listingDescription: description,
      merchantLocationKey: merchantLocationKey.dataValues.merchantLocationKey,
    };

    await eBay.sell.inventory.updateOffer(item.dataValues.offerId, offerData);

    try {
      const data = await eBay.sell.inventory.publishOffer(
        item.dataValues.offerId
      );
      item.channelId = data.listingId;
      item.status = "live";
      await item.save();
    } catch (err) {
      if (err.meta?.res?.data?.errors) {
        item.errors = err.meta?.res?.data?.errors;
        await item.save();
        return res.status(400).json({
          success: false,
          errors: err.meta?.res?.data?.errors,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Item successfully published",
    });
  } catch (error) {
    await apiCallLog(
      "GetItem",
      "/catalouge/retry-listing/:id",
      functionName,
      {
        ItemID: item.dataValues.channelId,
        IncludeItemCompatibilityList: true,
        IncludeItemSpecifics: true,
        DetailLevel: "ReturnAll",
      },
      {},
      error.meta,
      "error"
    );
    newRelic.recordCustomEvent(
      `Error occured while relisting data. Error`,
      error
    );
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.fetchCatalogue = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName } = req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    let listings = [];

    if (marketPlace.url?.includes("woocommerce")) {
      let url = `https://${accountName}.com/wp-json/wc/v3/orders`;
      const response = await axios.get(url, {
        headers: {
          Authorization: "Basic " + token.token,
        },
      });
      const data = response.data;
      for (const order of data) {
        for (const item of order.line_items) {
          const existingCsku = await csku.findOne({ where: { sku: item.sku } });
          if (!existingCsku) {
            await csku.create({
              sku: item.sku,
              product_id: item.product_id,
              order_id: order.id,
              name: item.name,
              quantity: item.quantity,
              total: item.total,
            });
            console.log(`Created csku entry for SKU: ${item.sku}`);
          } else {
            console.log(`csku entry already exists for SKU: ${item.sku}`);
          }
        }
      }

      return res.status(200).json({
        success: true,
        status: 200,
        data: data,
      });
    }
  } catch (err) {
    newRelic.recordCustomEvent(`Error in catalogue fetch`, err.message);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
      fullError: err.toString(),
    });
  }
};

exports.getFeedWalmart = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName } = req.body;
    // console.log("sdfghjk", req.body)
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }
    let channelIds;
    if (marketPlace.url?.includes("walmart")) {
      channelIds = await csku.findAll({
        where: { marketplaceId: marketplaceId },
      });

      // console.log("ertyu", channelIds)

      for (let i = 0; i < channelIds.length; i++) {
        const id = channelIds[i].dataValues;
        console.log("asdfghxcvbnk", id);
        const base64Credentials = Buffer.from(
          `${token.client_id}:${token.client_secret}`
        ).toString("base64");
        const correlationId = uuidv4();
        let Token;

        const tokenHeaders = {
          Authorization: `Basic ${base64Credentials}`,
          "WM_SVC.NAME": `${accountName}`,
          "WM_QOS.CORRELATION_ID": correlationId,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        };

        const tokenRequestBody = qs.stringify({
          grant_type: "client_credentials",
        });

        const tokenUrl = "https://marketplace.walmartapis.com/v3/token";

        try {
          const tokenResponse = await axios.post(tokenUrl, tokenRequestBody, {
            headers: tokenHeaders,
          });
          Token = tokenResponse.data.access_token;
        } catch (error) {
          console.log("error", error);
          error.push({
            error: `An error occurred while creating token.`,
            details: error,
          });
        }
        const getFeedUrl =
          "https://marketplace.walmartapis.com/v3/feeds?feedType=item";
        const feedHeaders = {
          "WM_SVC.NAME": "Walmart Marketplace",
          "WM_QOS.CORRELATION_ID": correlationId,
          "WM_SEC.TIMESTAMP": Date.now().toString(),
          Accept: "application/json",
          "Content-Type": "application/xml",
          "WM_SEC.ACCESS_TOKEN": Token,
        };
        try {
          const response = await axios.get(getFeedUrl, {
            headers: feedHeaders,
          });
          const feed = response.data.results.feed;

          const filteredFeeds = feed.filter((fee) => {
            const feedDate = moment(fee.feedDate);
            const today = moment();
            const threeDaysAgo = moment().subtract(3, "days");
            return feedDate.isBetween(threeDaysAgo, today, "day", "[]");
          });
          // let updateResult;
          for (const data of filteredFeeds) {
            // const feedId = data.feedId;
            // const getFeedUrl = 'https://marketplace.walmartapis.com/v3/feeds?feedType=item';
            // const feedHeaders = {
            //   'WM_SVC.NAME': 'Walmart Marketplace',
            //   'WM_QOS.CORRELATION_ID': correlationId,
            //   'WM_SEC.TIMESTAMP': Date.now().toString(),
            //   'Accept': 'application/json',
            //   'Content-Type': 'application/xml',
            //   'WM_SEC.ACCESS_TOKEN': Token
            // };
            // if (data.feedStatus === "PROCESSED") {
            //   const channel = data.feedId
            //   // console.log("qasdfg", id)
            //   updateResult = await csku.update(
            //     { isku: channel },
            //     { $set: { status: "live" } }
            //   );
            // } else if (data.feedStatus === "RECEIVED" || data.feedStatus === "RECEIVED") {
            //   updateResult = await csku.update(
            //     { isku: channel },
            //     { $set: { status: "draft" } }
            //   );
            // } else if (data.feedStatus === "ERROR") {
            //   updateResult = await csku.update(
            //     { isku: channel },
            //     { $set: { status: "failed" } }
            //   );
            // }
          }
        } catch (error) {
          console.error(
            "Error cancelling order lines:",
            error.response.data.errors.error
          );
          throw error;
        }
      }
    }
    return res.status(200).json({
      success: true,
      status: 200,
      data: channelIds,
    });
  } catch (error) {
    console.log("error", error);
  }
};

// NOTE - funtion for getting Shopify Details
async function shopifyFetchProductDetails(
  accountName,
  userId,
  accessToken,
  ebayCskus,
  jsonArray,
  jsonFilePath,
  i
) {
  try {
    const shopifyCsku = await csku.findAll({
      where: {
        accountName,
        userId,
        isku: {
          [Op.in]: ebayCskus.map((csku) => csku?.isku),
        },
      },
    });

    if (!shopifyCsku?.length || shopifyCsku.length == 0) {
      await apiCallLog(
        "Shopify Fetch Product Details",
        "shopifyFetchProductDetails",
        "shopifyFetchProductDetails",
        {
          accountName,
          userId,
          accessToken,
          ebayCskus,
          jsonArray,
          jsonFilePath,
          i,
        },
        {},
        { error: "No products available for these iskus" },
        "error"
      );
      return [];
    }

    const request = {
      method: "get",
      maxBodyLength: Infinity,
      url: `https://${accountName}.myshopify.com/admin/api/2024-04/products.json?ids=${shopifyCsku
        ?.map((csku) => csku?.dataValues?.channelId)
        .join(",")}`,
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const apiRes = await axios.request(request);
    const { products } = apiRes?.data || [];

    if (!products?.length || products.length == 0) {
      await apiCallLog(
        "Shopify Fetch Product Details",
        "shopifyFetchProductDetails",
        "shopifyFetchProductDetails",
        {
          accountName,
          userId,
          accessToken,
          ebayCskus,
          jsonArray,
          jsonFilePath,
          i,
        },
        {},
        { error: "No products available for these iskus" },
        "error"
      );
      return [];
    }

    const shopifyDetails = [];

    await Promise.all(
      products.map(async (product) => {
        const shopifyDb = shopifyCsku?.filter(
          (csku) => csku?.channelId == product?.id
        )?.[0];
        if (!shopifyDb) {
          return;
        }
        const variant = product?.variants?.filter(
          (v) => v?.sku == shopifyDb?.isku
        )?.[0];
        // const variant = variants?.filter(v => v?.sku == ebayCsku?.isku)[0]
        if (!variant) {
          return;
        }

        const quantity =
          variant?.inventory_quantity ||
          product?.variants[0]?.inventory_quantity;
        const price = variant?.price || product?.variants[0]?.price;
        const status = product?.status;
        if (product.id) {
          await csku.update(
            {
              quantity: quantity > 0 ? quantity : 0,
              status: status,
            },
            {
              where: {
                channelId: product?.id,
              },
            }
          );
        }
        const shopifyDetailsObj = {
          quantity: quantity,
          status,
          channelId: product?.id,
          isku: product?.variants[0]?.sku,
          price,
        };

        shopifyDetails.push(shopifyDetailsObj);
      })
    );

    return shopifyDetails;
  } catch (error) {
    console.log(error || "Product not found in Shopify.");
    await apiCallLog(
      "Shopify Fetch Product Details",
      "shopifyFetchProductDetails",
      "shopifyFetchProductDetails",
      {
        accountName,
        userId,
        accessToken,
        ebayCskus,
        jsonArray,
        jsonFilePath,
        i,
      },
      {},
      { error: error || "Product not found in Shopify." },
      "error"
    );
  }
}

async function createOrUpdateEbayInventoryItem(
  eBay,
  shopifyDetails,
  inventoryItem,
  ebayCsku,
  geoSite,
  jsonArray,
  jsonFilePath,
  i,
  isRetry
) {
  try {
    console.log("inventoryItem --------->");
    const { product, condition, availability } = inventoryItem;
    const updateCsku = await eBay.sell.inventory.createOrReplaceInventoryItem(
      ebayCsku?.isku,
      {
        product: {
          title: product?.title,
          aspects: product?.aspects,
          upc: [],
          imageUrls: product?.imageUrls,
        },
        condition: condition ?? "NEW",
        availability: {
          shipToLocationAvailability: {
            quantity:
              shopifyDetails?.status === "archived" ||
                shopifyDetails?.status === "draft"
                ? 0
                : Number(shopifyDetails?.quantity),
          },
        },
      }
    );
    let offer = null;
    console.log("updateCsku ---------> success");
    try {
      if (ebayCsku?.offerId) {
        offer = await eBay.sell.inventory.getOffer(ebayCsku?.offerId);
        console.log("offer Get --------->", ebayCsku?.offerId);
      } else {
        offer = await eBay.sell.inventory.getOffers({
          sku: ebayCsku?.isku,
          marketplaceId: geoSite?.includes("EBAY_MOTORS_US")
            ? "EBAY_MOTORS"
            : geoSite || "EBAY_US",
        });
        offer = offer?.offers?.filter(
          (ofr) => ofr?.listing?.listingId == ebayCsku?.channelId
        )[0];
        await csku.update(
          { offerId: offer?.offerId },
          { where: { id: ebayCsku?.id } }
        );
        console.log("offer Get 2--------->", offer?.offerId);
      }
      if (offer) {
        try {
          const publishOffer = await eBay.sell.inventory.publishOffer(
            offer?.offerId
          );
          console.log("publish offer Done --------->", publishOffer?.listingId);
          return await successHandler(
            publishOffer?.listingId,
            jsonArray,
            jsonFilePath,
            ebayCsku,
            shopifyDetails,
            i
          );
        } catch (error) {
          console.log("publish offer error occured --------->", error);
          if (
            error?.meta?.message?.includes(
              "The eBay listing associated with the inventory item, or the unpublished offer has an invalid quantity. The quantity must be a valid number greater than 0."
            )
          ) {
            return await successHandler(
              null,
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i
            );
          } else {
            return await errorHandler(
              error,
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        }
      } else {
        console.log(
          "not found offer Id so we will go for Migration Now--------->"
        );
        try {
          await MigrateCsku(
            eBay,
            shopifyDetails,
            ebayCsku,
            geoSite,
            jsonArray,
            jsonFilePath,
            i,
            isRetry
          );
          return true;
        } catch (error) {
          return false;
        }
      }
    } catch (error) {
      console.log("get offer error --------->", error);
      if (error?.meta?.message === "This Offer is not available.") {
        if (
          shopifyDetails?.status === "active" &&
          shopifyDetails?.quantity > 0
        ) {
          const ebayLiveCskus = await csku.findAll({
            where: {
              marketplaceId: 7,
              siteId: ebayCsku?.siteId,
              status: { [Op.in]: ["live", "active", "OUT_OF_STOCK"] },
              isku: ebayCsku?.isku,
              channelId: { [Op.ne]: ebayCsku?.channelId },
            },
          });
          if (!ebayLiveCskus?.length) {
            try {
              await CreateOfferFunction(
                eBay,
                shopifyDetails,
                ebayCsku,
                jsonArray,
                jsonFilePath,
                i,
                isRetry
              );
              return true;
            } catch (error) {
              return false;
            }
          } else {
            await csku.update(
              { status: "deleted" },
              { where: { channelId: ebayCsku?.channelId } }
            );
            return await errorHandler(
              {
                meta: {
                  message: `The Item has been ended.`,
                },
              },
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        } else {
          return await errorHandler(
            {
              meta: {
                message: `The Item has been ended.`,
              },
            },
            jsonArray,
            jsonFilePath,
            ebayCsku,
            shopifyDetails,
            i,
            isRetry
          );
        }
      } else {
        return await errorHandler(
          error,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          isRetry
        );
      }
    }
  } catch (error) {
    console.log("Error in eBay inventory management:", error);
    if (
      error?.meta?.message?.includes(
        "The eBay listing associated with the inventory item, or the unpublished offer has an invalid quantity. The quantity must be a valid number greater than 0."
      )
    ) {
      return await successHandler(
        null,
        jsonArray,
        jsonFilePath,
        ebayCsku,
        shopifyDetails,
        i
      );
    } else {
      return await errorHandler(
        error,
        jsonArray,
        jsonFilePath,
        ebayCsku,
        shopifyDetails,
        i,
        isRetry
      );
    }
  }
}

async function MigrateCsku(
  eBay,
  shopifyDetails,
  ebayCsku,
  geoSite,
  jsonArray,
  jsonFilePath,
  i,
  isRetry
) {
  const functionName = "MigrateCSKU";
  try {
    console.log("Migration started --------->");
    await eBay.sell.inventory.bulkMigrateListing({
      requests: [
        {
          listingId: ebayCsku.channelId,
        },
      ],
    });
    console.log("Migration completed --------->");
    const inventoryItem = await eBay.sell.inventory.getInventoryItem(
      ebayCsku?.isku
    );
    console.log("Got Inventory Item --------->");
    if (inventoryItem) {
      try {
        const res = await createOrUpdateEbayInventoryItem(
          eBay,
          shopifyDetails,
          inventoryItem,
          ebayCsku,
          geoSite,
          jsonArray,
          jsonFilePath,
          i,
          isRetry
        );
        return false;
      } catch (error) {
        return false;
      }
    }
  } catch (err) {
    if (err) {
      if (
        err?.meta?.responses &&
        err?.meta?.responses[0]?.errors[0]?.message ==
        "A user error has occurred. This listing is already migrated"
      ) {
        console.log(
          "A user error has occurred. This listing is already migrated --------->"
        );
        return await errorHandler(
          err,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          isRetry
        );
      } else if (
        err.meta?.res?.data?.responses[0]?.errors[0]?.message ||
        err?.meta?.responses?.[0]?.errors?.[0]?.message ==
        "A user error has occurred. The listing SKU cannot be null or empty."
      ) {
        console.log("The listing SKU cannot be null or empty. --------->");
        try {
          await eBay.trading.ReviseItem({
            Item: {
              ItemID: ebayCsku.channelId,
              SKU: ebayCsku?.isku,
            },
          });
          await apiCallLog(
            "ReviseItem",
            "/catalouge/migrateCsku",
            functionName,
            {
              Item: {
                ItemID: ebayCsku.channelId,
                SKU: ebayCsku?.isku,
              },
            },
            {},
            {},
            "success"
          );
        } catch (err) {
          await apiCallLog(
            "ReviseItem",
            "/catalouge/migrateCsku",
            functionName,
            {
              Item: {
                ItemID: ebayCsku.channelId,
                SKU: ebayCsku?.isku,
              },
            },
            {},
            err.meta,
            "error"
          );
          console.log(
            "A user error has occurred. The listing SKU cannot be null or empty. ----->",
            err
          );
          if (
            err.meta?.res?.data?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.Errors?.LongMessage ==
            "You are not allowed to revise ended listings."
          ) {
            console.log(
              "You are not allowed to revise ended listings. ------>",
              shopifyDetails?.status,
              shopifyDetails?.quantity
            );
            //NOTE -  Check if the Shopify product is active and has stock > 0
            if (
              shopifyDetails?.status === "active" &&
              shopifyDetails?.quantity > 0
            ) {
              const ebayLiveCskus = await csku.findAll({
                where: {
                  marketplaceId: 7,
                  siteId: ebayCsku?.siteId,
                  status: { [Op.in]: ["live", "active", "OUT_OF_STOCK"] },
                  isku: ebayCsku?.isku,
                  channelId: { [Op.ne]: ebayCsku?.channelId },
                },
              });
              if (!ebayLiveCskus?.length) {
                try {
                  await CreateOfferFunction(
                    eBay,
                    shopifyDetails,
                    ebayCsku,
                    jsonArray,
                    jsonFilePath,
                    i,
                    isRetry
                  );
                  return true;
                } catch (error) {
                  return false;
                }
              } else {
                await csku.update(
                  { status: "deleted" },
                  { where: { channelId: ebayCsku?.channelId } }
                );
                return await errorHandler(
                  {
                    meta: {
                      message: `The Item has been ended.`,
                    },
                  },
                  jsonArray,
                  jsonFilePath,
                  ebayCsku,
                  shopifyDetails,
                  i,
                  isRetry
                );
              }
            } else {
              await csku.update(
                { status: "deleted" },
                { where: { channelId: ebayCsku?.channelId } }
              );
              return await errorHandler(
                {
                  meta: {
                    message: `The Item has been ended.`,
                  },
                },
                jsonArray,
                jsonFilePath,
                ebayCsku,
                shopifyDetails,
                i,
                isRetry
              );
            }
          } else if (
            err.meta?.res?.data?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.Errors?.LongMessage ==
            "A user error has occurred. Listings with duplicate variant SKUs or listing SKUs (GroupIds) found"
          ) {
            console.log(
              "A user error has occurred. Listings with duplicate variant SKUs or listing SKUs (GroupIds) found. ------>",
              shopifyDetails?.status,
              shopifyDetails?.quantity
            );
            //NOTE -  Check if the Shopify product is active and has stock > 0
            if (
              shopifyDetails?.status === "active" &&
              shopifyDetails?.quantity > 0
            ) {
              const ebayLiveCskus = await csku.findAll({
                where: {
                  marketplaceId: 7,
                  siteId: ebayCsku?.siteId,
                  status: { [Op.in]: ["live", "active", "OUT_OF_STOCK"] },
                  isku: ebayCsku?.isku,
                  channelId: { [Op.ne]: ebayCsku?.channelId },
                },
              });
              if (!ebayLiveCskus?.length) {
                try {
                  await CreateOfferFunction(
                    eBay,
                    shopifyDetails,
                    ebayCsku,
                    jsonArray,
                    jsonFilePath,
                    i,
                    isRetry
                  );
                  return true;
                } catch (error) {
                  return false;
                }
              } else {
                await csku.update(
                  { status: "deleted" },
                  { where: { channelId: ebayCsku?.channelId } }
                );
                return await errorHandler(
                  {
                    meta: {
                      message: `The Item has been ended.`,
                    },
                  },
                  jsonArray,
                  jsonFilePath,
                  ebayCsku,
                  shopifyDetails,
                  i,
                  isRetry
                );
              }
            } else {
              return await errorHandler(
                {
                  meta: {
                    message: `The Item has been ended.`,
                  },
                },
                jsonArray,
                jsonFilePath,
                ebayCsku,
                shopifyDetails,
                i,
                isRetry
              );
            }
          } else {
            return await errorHandler(
              err,
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        }
        try {
          console.log("bulk Migration started after Revise Item ----------->");
          await eBay.sell.inventory.bulkMigrateListing({
            requests: [
              {
                listingId: ebayCsku.channelId,
              },
            ],
          });
          const inventoryItem = await eBay.sell.inventory.getInventoryItem(
            ebayCsku?.isku
          );
          if (inventoryItem) {
            try {
              const res = await createOrUpdateEbayInventoryItem(
                eBay,
                shopifyDetails,
                inventoryItem,
                ebayCsku,
                geoSite,
                jsonArray,
                quantityJsonFilePath,
                i,
                (isRetry = false)
              );
              return false;
            } catch (error) {
              return false;
            }
          }
        } catch (err) {
          if (
            err.meta?.res?.data?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.responses?.[0]?.errors?.[0]?.message ||
            err?.meta?.Errors?.LongMessage ==
            "A user error has occurred. Listings with duplicate variant SKUs or listing SKUs (GroupIds) found"
          ) {
            console.log(
              "A user error has occurred. Listings with duplicate variant SKUs or listing SKUs (GroupIds) found. ------>",
              shopifyDetails?.status,
              shopifyDetails?.quantity
            );
            //NOTE -  Check if the Shopify product is active and has stock > 0
            if (
              shopifyDetails?.status === "active" &&
              shopifyDetails?.quantity > 0
            ) {
              const ebayLiveCskus = await csku.findAll({
                where: {
                  marketplaceId: 7,
                  siteId: ebayCsku?.siteId,
                  status: { [Op.in]: ["live", "active", "OUT_OF_STOCK"] },
                  isku: ebayCsku?.isku,
                  channelId: { [Op.ne]: ebayCsku?.channelId },
                },
              });
              if (!ebayLiveCskus?.length) {
                try {
                  await CreateOfferFunction(
                    eBay,
                    shopifyDetails,
                    ebayCsku,
                    jsonArray,
                    jsonFilePath,
                    i,
                    isRetry
                  );
                  return true;
                } catch (error) {
                  return false;
                }
              } else {
                await csku.update(
                  { status: "deleted" },
                  { where: { channelId: ebayCsku?.channelId } }
                );
                return await errorHandler(
                  {
                    meta: {
                      message: `The Item has been ended.`,
                    },
                  },
                  jsonArray,
                  jsonFilePath,
                  ebayCsku,
                  shopifyDetails,
                  i,
                  isRetry
                );
              }
            } else {
              return await errorHandler(
                {
                  meta: {
                    message: `The Item has been ended.`,
                  },
                },
                jsonArray,
                jsonFilePath,
                ebayCsku,
                shopifyDetails,
                i,
                isRetry
              );
            }
          } else {
            console.log(
              "bulk Migration Occured after Revise Item ----------->",
              err
            );
            return await errorHandler(
              err,
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        }
      } else if (
        err.meta?.res?.data?.responses[0]?.errors[0]?.message ||
        err?.meta?.responses?.[0]?.errors?.[0]?.message ==
        "user error has occurred. The SKU is associated with another listing. Skipping migration"
      ) {
        console.log(
          " user error has occurred. The SKU is associated with another listing. Skipping migration --------->"
        );
        if (
          shopifyDetails?.status === "active" &&
          shopifyDetails?.quantity > 0
        ) {
          const ebayLiveCskus = await csku.findAll({
            where: {
              marketplaceId: 7,
              siteId: ebayCsku?.siteId,
              status: { [Op.in]: ["live", "active", "OUT_OF_STOCK"] },
              isku: ebayCsku?.isku,
              channelId: { [Op.ne]: ebayCsku?.channelId },
            },
          });
          if (!ebayLiveCskus?.length) {
            try {
              await CreateOfferFunction(
                eBay,
                shopifyDetails,
                ebayCsku,
                jsonArray,
                jsonFilePath,
                i,
                isRetry
              );
              return true;
            } catch (error) {
              return false;
            }
          } else {
            await csku.update(
              { status: "deleted" },
              { where: { channelId: ebayCsku?.channelId } }
            );
            return await errorHandler(
              {
                meta: {
                  message: `The Item has been ended.`,
                },
              },
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        }
      } else {
        console.log("Error While Migrating The Data --------->");
        return await errorHandler(
          err,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          isRetry
        );
      }
    }
  }
}

const CreateOfferFunction = async (
  eBay,
  shopifyDetails,
  ebayCsku,
  jsonArray,
  jsonFilePath,
  i,
  isRetry
) => {
  try {
    let location = null;
    location = await merchantLocation.findOne({
      where: {
        accountName: ebayCsku?.accountName,
      },
    });
    location = location ? location?.dataValues?.merchantLocationKey : null;
    if (!location) {
      console.log("Merchant Location Not Found In DB --------->");
      try {
        const merchantLocation =
          await eBay.sell.inventory.getInventoryLocations({ limit: 1 });
        if (merchantLocation?.locations?.length) {
          const filteredData = merchantLocation?.locations?.filter(
            (loc) => loc?.merchantLocationStatus === "ENABLED"
          )[0];
          if (filteredData) {
            location = filteredData?.merchantLocationKey;
          } else {
            console.log(
              "ENABLED Merchant Location Not Found In eBay --------->"
            );
            return await errorHandler(
              {
                meta: {
                  message: "ENABLED Merchant Location Not Found In eBay",
                },
              },
              jsonArray,
              jsonFilePath,
              ebayCsku,
              shopifyDetails,
              i,
              isRetry
            );
          }
        } else {
          console.log("No Merchant Location Found");
          return await errorHandler(
            {
              meta: {
                message: "Merchant Location Not Found",
              },
            },
            jsonArray,
            jsonFilePath,
            ebayCsku,
            shopifyDetails,
            i,
            isRetry
          );
        }
      } catch (error) {
        return await errorHandler(
          error,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          isRetry
        );
      }
    }
    let offerId = null;
    const createOfferPayload = {
      sku: ebayCsku?.isku,
      hideBuyerDetails: true,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      categoryId: ebayCsku?.categoryId,
      pricingSummary: {
        price: {
          value: ebayCsku?.price,
          currency: ebayCsku?.currency,
        },
      },
      listingPolicies: {
        fulfillmentPolicyId:
          ebayCsku?.sellerProfile?.SellerShippingProfile?.ShippingProfileID,
        returnPolicyId:
          ebayCsku?.sellerProfile?.SellerReturnProfile?.ReturnProfileID,
        paymentPolicyId:
          ebayCsku?.sellerProfile?.SellerPaymentProfile?.PaymentProfileID,
      },
      tax: {
        applyTax: true,
      },
      listingDescription: ebayCsku?.description,
      merchantLocationKey: location,
    };
    try {
      // NOTE - create offers
      const getOfferID = await eBay.sell.inventory.createOffer(
        createOfferPayload
      );
      offerId = getOfferID?.offerId;
      try {
        //NOTE - Publish the offer if not already published
        const publishOffer = await eBay.sell.inventory.publishOffer(offerId);
        return await successHandler(
          publishOffer?.listingId,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          publishOffer?.listingId
        );
      } catch (error) {
        console.error("An error occurred while publishing the offer:", error);
        return await errorHandler(
          error,
          jsonArray,
          jsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          isRetry
        );
      }
    } catch (error) {
      console.error(
        "An error occurred while creating the offer:---------------->",
        error
      );
      return await errorHandler(
        error,
        jsonArray,
        jsonFilePath,
        ebayCsku,
        shopifyDetails,
        i,
        isRetry
      );
    }
  } catch (error) {
    console.error(
      "An error occurred while creating the offer:---------------->",
      error
    );
    return await errorHandler(
      error,
      jsonArray,
      jsonFilePath,
      ebayCsku,
      shopifyDetails,
      i,
      isRetry
    );
  }
};

const errorHandler = async (
  error,
  jsonArray,
  jsonFilePath,
  ebayCsku,
  shopifyDetails,
  i,
  isRetry
) => {
  console.error(
    "An error occurred: error Handler working  -----------> ",
    error
  );
  jsonArray.push({
    i,
    status: shopifyDetails?.status,
    shopifyQuantity: shopifyDetails?.quantity,
    ebayQuantity: ebayCsku?.quantity,
    ShopifyId: shopifyDetails?.channelId,
    EbayId: ebayCsku?.channelId,
    Title: ebayCsku?.title,
    sku: shopifyDetails?.sku,
    success: false,
    date: new Date(),
    FailedAt: new Date(),
    Error: error,
  });
  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonArray, null, 2));
  let updationFields = {
    quantiyUpdationStatus: "failed",
    quantityUpdateErrors: [error],
    quantityUpdateDate: new Date(),
  };
  if (isRetry) {
    updationFields = {
      ...updationFields,
      threshhold: ebayCsku?.threshhold + 1,
    };
  }
  console.log("error?.description :>> ", error?.description);
  if (error?.description == "You are not allowed to revise ended listings.") {
    updationFields = {
      ...updationFields,
      status: "deleted",
      quantity: shopifyDetails?.quantity > 0 ? shopifyDetails?.quantity : 0,
    };
  }
  await csku.update(
    {
      ...updationFields,
    },
    {
      where: {
        id: ebayCsku?.id,
      },
    }
  );
  return;
};
const successHandler = async (
  listingId,
  jsonArray,
  jsonFilePath,
  ebayCsku,
  shopifyDetails,
  i,
  newEbayId,
  finalPrice
) => {
  jsonArray.push({
    i,
    status: shopifyDetails?.status,
    shopifyQuantity: shopifyDetails?.quantity,
    ebayQuantity: ebayCsku?.quantity,
    ShopifyId: shopifyDetails?.channelId,
    EbayId: ebayCsku?.channelId,
    Title: ebayCsku?.title,
    sku: shopifyDetails?.sku,
    listingId: listingId || null,
    NewEbayId: newEbayId || null,
    success: true,
    date: new Date(),
  });
  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonArray, null, 2));
  let updateFields = {
    threshhold: 0,
    quantiyUpdationStatus: "updated",
    quantityUpdateDate: new Date(),
    quantityUpdateErrors: null,
    quantity:
      shopifyDetails?.quantity > 0 &&
        !["draft", "archived", "inactive"].includes(shopifyDetails?.status)
        ? shopifyDetails?.quantity
        : 0,
    status:
      !["draft", "archived", "inactive"].includes(shopifyDetails?.status) &&
        shopifyDetails?.quantity > 0
        ? "live"
        : "OUT_OF_STOCK",
    price: parseFloat(finalPrice).toFixed(2),
  };
  if (newEbayId) {
    updateFields = { ...updateFields, channelId: newEbayId };
  }
  await csku.update(
    {
      ...updateFields,
    },
    {
      where: {
        id: ebayCsku?.id,
      },
    }
  );
  return true;
};

exports.QuantityUpdateInEbayCron = async (ebayAccount, shopifyAccount) => {
  try {
    console.log("Update Quantiy On Ebay Cron Started --------->");
    // console.log('ebayAccount ---------->' , ebayAccount)
    console.log(
      "ebayAccount Token ---------->",
      ebayAccount?.dataValues?.token
    );
    // console.log('shopifyAccount ---------->' , shopifyAccount)
    let jsonArray = [];
    const ebayAccountName = ebayAccount?.dataValues?.accountName;
    const quantityJsonFilePath = path.join(
      __dirname,
      `${ebayAccountName}QuantityUpdate.json`
    );
    if (!fs.existsSync(quantityJsonFilePath)) {
      fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
    } else {
      fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
      jsonArray = JSON.parse(fs.readFileSync(quantityJsonFilePath, "utf8"));
    }
    //NOTE - Garderobe Credentials
    const shopifyAccountName = shopifyAccount?.dataValues?.accountName;
    const shopifyAccessToken = shopifyAccount?.dataValues?.token;
    const userId = ebayAccount?.dataValues?.userId;
    const cskus = await csku.findAll({
      where: {
        accountName: ebayAccountName,
        userId,
        marketplaceId: 7,
        status: {
          [Op.in]: ["live", "active", "completed", "archived", "OUT_OF_STOCK"],
        },
      },
    });
    console.log("garderobe cskus -------->", cskus?.length);
    for (let i = 0; i < cskus?.length; i++) {
      const ebayCsku = cskus[i]?.dataValues;
      console.log("i", i, ebayCsku?.channelId, new Date());
      await csku?.update({ threshhold: 0 }, { where: { id: ebayCsku?.id } });
      let shopifyDetails = {};
      //NOTE -  Fetch Shopify product details
      try {
        shopifyDetails = await shopifyFetchProductDetails(
          shopifyAccountName,
          userId,
          shopifyAccessToken,
          ebayCsku,
          jsonArray,
          quantityJsonFilePath,
          i
        );
        console.log("shopifyDetails --------->", shopifyDetails);
        if (!shopifyDetails) {
          console.log("Shopify product not found");
          continue;
        }
      } catch (error) {
        continue;
      }
      let geoSite = null;
      if (geoSite) {
        geoSite = await Geosite.findOne({
          where: {
            globalId: ebayCsku?.siteId,
          },
        });
      }
      //NOTE - set up based on siteId
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        siteId: geoSite?.dataValues?.siteId || 0,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });
      // Refresh eBay token if necessary
      try {
        await refreshTokenIfNeeded(ebayAccount, eBay);
        // eBay.OAuth2.setCredentials(newToken)
      } catch (error) {
        console.error("Error refreshing eBay token:", error);
        continue; // Skip this item if the token couldn't be refreshed
      }
      try {
        // NOTE - check this csku is created by Rest Api or Not
        const inventoryItem = await eBay.sell.inventory.getInventoryItem(
          ebayCsku?.isku
        );
        const { availability } = inventoryItem;
        console.log(availability, "availability");
        if (inventoryItem) {
          if (
            shopifyDetails?.quantity !=
            availability?.shipToLocationAvailability?.quantity
          ) {
            if (
              shopifyDetails?.status === "archived" &&
              availability?.shipToLocationAvailability?.quantity === 0
            ) {
              await successHandler(
                null,
                jsonArray,
                quantityJsonFilePath,
                ebayCsku,
                shopifyDetails,
                i
              );
              console.log("Shopify product is archived and quantity is 0");
              continue;
            } else {
              try {
                const res = await createOrUpdateEbayInventoryItem(
                  eBay,
                  shopifyDetails,
                  inventoryItem,
                  ebayCsku,
                  geoSite?.dataValues?.globalId || "EBAY_US",
                  jsonArray,
                  quantityJsonFilePath,
                  i,
                  (isRetry = false)
                );
                console.log(res, "res");
                continue;
              } catch (error) {
                console.log(error, "createOrUpdateEbayInventoryItem error");
                continue;
              }
            }
          }
        }
      } catch (error) {
        console.log(error, "bulkMigration Started");
        try {
          await MigrateCsku(
            eBay,
            shopifyDetails,
            ebayCsku,
            geoSite?.dataValues?.globalId || "EBAY_US",
            jsonArray,
            quantityJsonFilePath,
            i,
            (isRetry = false)
          );
          continue;
        } catch (error) {
          continue;
        }
      }
    }
    console.log("loop completed ----------> ", new Date());
    try {
      const failedData = jsonArray?.filter(
        (data) =>
          data?.["Error"] &&
          data?.["Error"?.meta?.message != "The Item has been ended."]
      );
      if (failedData?.length) {
        await quantityUpdateQueue.add([
          ...failedData,
          {
            shopifyAccountName,
            shopifyAccessToken,
            userId,
            ebayToken: ebayAccount,
          },
        ]);
        fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
        await quantityUpdateQueue.process();
      } else {
        fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error("Queue processing failed:", error);
    }
  } catch (error) {
    console.log("Unexpected error:", error);
  }
};

const priceFormula = {
  "0e7dcdc6-ffe7-4371-96e0-f01cbbf6b414": "(price / 3.675 * 1.15 + 20 ) * 1.10",
  "1e057142-21fa-468c-b4ac-6065ba906c5d": "price / 3.675 * 1.165 + 25",
  "22d83297-86e2-437c-8b49-b41968aa97b8": "(price / 3.675) * 1.20",
};

quantityUpdateQueue?.process(async (job) => {
  console.log("Quantity update queue processing started--------------->");
  const { data } = job;
  console.log("data ----------->", data?.length);
  let retryData = data;
  let failedData = [];
  const Credentials = data[data?.length - 1];
  console.log("Credentials ---------------->", Credentials);
  const ebayAccountName = data?.ebayAccount?.accountName;
  const retryJsonFilePath = path.join(
    __dirname,
    `${ebayAccountName}QuantityRetryUpdate.json`
  );
  if (fs.existsSync(retryJsonFilePath)) {
    failedData = JSON.parse(fs.readFileSync(retryJsonFilePath, "utf8"));
  } else {
    fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
  }
  let loopCount = 1;
  for (let i = 0; i < retryData?.length - 1; i++) {
    const item = retryData[i];
    console.log("item ------------>", item?.EbayId, i);
    const channelId = item?.NewEbayId ? NewEbayId : item?.EbayId;
    const cskuData = await csku.findOne({ where: { channelId: channelId } });
    if (cskuData?.dataValues?.threshhold == cskuData?.dataValues?.noOfRetries) {
      console.log(
        "Threshold reached, skipping this item -------------->",
        item?.EbayId
      );
      await csku.update(
        {
          threshhold: 0,
          quantiyUpdationStatus: "failed",
        },
        {
          where: {
            id: cskuData?.dataValues?.threshhold?.id,
          },
        }
      );
      continue;
    } else {
      let shopifyDetails = {};
      //NOTE -  Fetch Shopify product details
      try {
        shopifyDetails = await shopifyFetchProductDetails(
          Credentials?.shopifyAccountName,
          Credentials?.userId,
          Credentials?.shopifyAccessToken,
          cskuData?.dataValues,
          failedData,
          retryJsonFilePath,
          i
        );
        console.log("shopifyDetails --------->", shopifyDetails);
        if (!shopifyDetails) {
          console.log("Shopify product not found --------------->");
          await csku.update(
            {
              threshhold: cskuData?.dataValues?.threshhold + 1,
              quantiyUpdationStatus: "failed",
            },
            {
              where: {
                id: cskuData?.dataValues?.threshhold?.id,
              },
            }
          );
          if (i === retryData?.length - 2) {
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
            if (failedData?.length && loopCount != 2) {
              failedData = failedData?.filter(
                (data) =>
                  data?.["Error"] &&
                  data?.["Error"?.meta?.message != "The Item has been ended."]
              );
              retryData = failedData;
              i = -1;
              loopCount++;
              fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
            }
            console.log("failedData --------->", failedData);
          }
          continue;
        }
      } catch (error) {
        await csku.update(
          {
            threshhold: cskuData?.dataValues?.threshhold + 1,
            quantiyUpdationStatus: "failed",
          },
          {
            where: {
              id: cskuData?.dataValues?.threshhold?.id,
            },
          }
        );
        if (i === retryData?.length - 2) {
          if (fs.existsSync(retryJsonFilePath)) {
            failedData = JSON.parse(fs.readFileSync(retryJsonFilePath, "utf8"));
          }
          if (failedData?.length && loopCount != 2) {
            failedData = failedData?.filter(
              (data) =>
                data?.["Error"] &&
                data?.["Error"?.meta?.message != "The Item has been ended."]
            );
            retryData = failedData;
            i = -1;
            loopCount++;
            fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
          }
          console.log("failedData --------->", failedData);
        }
        continue;
      }
      let geoSite = null;
      if (geoSite) {
        geoSite = await Geosite.findOne({
          where: {
            globalId: cskuData?.dataValues?.siteId,
          },
        });
      }
      //NOTE - set up based on siteId
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        siteId: geoSite?.dataValues?.siteId || 0,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });
      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(
        data?.ebayToken?.dataValues?.lastTokenRefreshDate
      );
      let hoursDifference = startdate.diff(tokenExpiresDate, "hours");
      try {
        eBay.OAuth2.setCredentials(data?.ebayToken?.dataValues?.token);
        if (hoursDifference >= 2) {
          await refreshToken(eBay, data?.ebayToken);
        }
      } catch (error) {
        if (hoursDifference >= 2) {
          await refreshToken(eBay, data?.ebayToken);
        }
      }

      try {
        // NOTE - check this csku is created by Rest Api or Not
        const inventoryItem = await eBay.sell.inventory.getInventoryItem(
          cskuData?.dataValues?.isku
        );
        if (inventoryItem) {
          try {
            const res = await createOrUpdateEbayInventoryItem(
              eBay,
              shopifyDetails,
              inventoryItem,
              cskuData?.dataValues,
              geoSite?.dataValues?.globalId || "EBAY_US",
              failedData,
              retryJsonFilePath,
              i,
              (isRetry = true)
            );
            console.log(res, "res");
            if (i === retryData?.length - 2) {
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
              if (failedData?.length && loopCount != 2) {
                failedData = failedData?.filter(
                  (data) =>
                    data?.["Error"] &&
                    data?.["Error"?.meta?.message != "The Item has been ended."]
                );
                retryData = failedData;
                i = -1;
                loopCount++;
                fs.writeFileSync(
                  retryJsonFilePath,
                  JSON.stringify([], null, 2)
                );
                if (fs.existsSync(retryJsonFilePath)) {
                  failedData = JSON.parse(
                    fs.readFileSync(retryJsonFilePath, "utf8")
                  );
                }
              }
              console.log("failedData --------->", failedData);
            }
          } catch (error) {
            console.log(error, "error");
            if (i === retryData?.length - 2) {
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
              if (failedData?.length && loopCount != 2) {
                failedData = failedData?.filter(
                  (data) =>
                    data?.["Error"] &&
                    data?.["Error"?.meta?.message != "The Item has been ended."]
                );
                retryData = failedData;
                i = -1;
                loopCount++;
                fs.writeFileSync(
                  retryJsonFilePath,
                  JSON.stringify([], null, 2)
                );
                if (fs.existsSync(retryJsonFilePath)) {
                  failedData = JSON.parse(
                    fs.readFileSync(retryJsonFilePath, "utf8")
                  );
                }
              }
              console.log("failedData --------->", failedData);
            }
          }
        }
      } catch (error) {
        try {
          await MigrateCsku(
            eBay,
            shopifyDetails,
            cskuData?.dataValues,
            geoSite?.dataValues?.globalId || "EBAY_US",
            failedData,
            retryJsonFilePath,
            i,
            (isRetry = true)
          );
          if (i === retryData?.length - 2) {
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
            if (failedData?.length && loopCount != 2) {
              failedData = failedData?.filter((data) => data?.["Error"]);
              retryData = failedData;
              i = -1;
              loopCount++;
              fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
            }
            console.log("failedData --------->", failedData);
          }
        } catch (error) {
          if (i === retryData?.length - 2) {
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
            if (failedData?.length && loopCount != 2) {
              failedData = failedData?.filter((data) => data?.["Error"]);
              retryData = failedData;
              i = -1;
              loopCount++;
              fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
            }
            console.log("failedData --------->", failedData);
          }
          continue;
        }
      }
    }
  }
  if (failedData?.length) {
    // Define the headers
    const headers = ["Title", "ShopifyId", "EbayId", "FailedAt", "Error"];
    const fileName = `${ebayAccountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`;
    const res = await generateExcelFile(
      failedData,
      updateReportFilePath,
      headers
    );
    fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
    if (res && fs.existsSync(updateReportFilePath)) {
      const fileBuffer = fs.readFileSync(errorExcelFile);
      const errorFileLocation = await uploadToS3({
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fileBuffer,
        originalname: fileName,
      });
      fs.unlink(updateReportFilePath, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
          return;
        }
        console.log("File deleted successfully");
      });
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: "aditya@mergekart.com",
        cc: "pallavisolday12@gmail.com",
        subject: `Quantity Update Failed Report ${new Date()}`,
        text: "Hello, please find the attached file.",
        attachments: [
          {
            filename: `${accountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`,
            path: errorFileLocation,
          },
        ],
      };
      const res = await sendUpdateReportEmail(mailOptions);
      await job.remove();
    }
  }
});

async function fetchShopifyProductGraphQL(
  shopifyAccountName,
  shopifyAccessToken,
  iskuBatch,
  userId
) {
  try {
    if (!iskuBatch || iskuBatch.length == 0) {
      await apiCallLog(
        "Shopify Fetch Product",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        { iskus: iskus },
        {},
        { error: "No iskus found" },
        "error"
      );
      return [];
    }

    const searchString = iskuBatch.map((isku) => `sku:${isku}`).join(" OR ");

    let data = JSON.stringify({
      query: `{ products(query: \"${searchString}\", first: 10) { edges { node { id title handle body_html:descriptionHtml status createdAt updatedAt tags vendor productType publishedAt onlineStoreUrl metafields(first:30) { edges { node { id key value jsonValue } } } options { id name values position } images(first: 10) { edges { node { id altText originalSrc } } } variants(first: 10) { edges { node { id title sku price compareAtPrice inventoryQuantity } } } } } } }`,
    });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `https://${shopifyAccountName}.myshopify.com/admin/api/2025-01/graphql.json`,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      data: data,
    };

    const response = await axios.request(config);
    const shopifyProducts = response?.data?.data?.products?.edges;

    if (!shopifyProducts || shopifyProducts.length == 0) {
      await apiCallLog(
        "Shopify Fetch Product",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        { iskus: iskuBatch },
        {},
        { error: "No Shopify Products Found" },
        "error"
      );
      return [];
    }

    const cskus = [];
    const iskus = [];
    for (var i = 0; i < shopifyProducts.length; i++) {
      const item = shopifyProducts[i].node?.map((edge) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        body_html: edge.node.body_html,
        tags: edge.node.tags,
        vendor: edge.node.vendor,
        product_type: edge.node.productType,
        published_at: edge.node.publishedAt,
        online_store_url: edge.node.onlineStoreUrl,
        status: edge.node.status,
        images: edge.node.images.edges.map((img) => ({
          id: img.node.id,
          alt_text: img.node.altText,
          src: img.node.originalSrc,
        })),
        variants: edge.node.variants.edges.map((variant) => ({
          id: variant.node.id,
          title: variant.node.title,
          sku: variant.node.sku,
          price: variant.node.price,
          compare_at_price: variant.node.compareAtPrice,
          inventory_quantity: variant.node.inventoryQuantity,
        })),
        options: edge.options.map((option) => ({
          id: option.id,
          name: option.name,
          values: option.values,
          position: option.position,
        })),
        metafields: edge.node.metafields.edges.map((metafield) => ({
          id: metafield.node.id,
          key: metafield.node.key,
          value: metafield.node.value,
        })),
      }));

      const itemSpecific = item.metafields.edges.map((edge) => ({
        id: edge.node.id,
        key: edge.node.key,
        value: edge.node.value,
      }));
      const handleVariantData = async (variant, isSingleVariant) => {
        const currency =
          variant?.presentment_prices?.[0]?.price?.currency_code || null;
        const amount = variant?.presentment_prices?.[0]?.price?.amount || null;
        let images = item?.images.map((img) => img.src);

        const existingIsku = await isku.findOne({
          where: { isku: variant.sku || variant.id.toString(), userId },
        });

        if (existingIsku && addQuantity) {
          existingIsku.quantity += variant.inventory_quantity;
          await existingIsku.save();
        } else if (!existingIsku) {
          iskus.push({
            isku: variant.sku || item.id,
            costPrice: variant.price || amount,
            title: item.title,
            images: images,
            quantity: variant.inventory_quantity,
            currency: variant.currency || currency,
            accountName,
            marketplaceId: 10,
            userId,
          });
        }

        const existingCsku = await csku.findOne({
          where: { channelId: item.id.toString(), userId },
        });

        const variantImage = variant.image_id
          ? item.images.find((img) => img.id === variant.image_id)?.src
          : null;

        // For multi-variant products, remove the variant image from the main images array
        images =
          !isSingleVariant && variant.image_id
            ? item.images
              .filter((img) => img.id !== variant.image_id)
              .map((img) => img.src)
            : item.images.map((img) => img.src);

        if (!existingCsku) {
          cskus.push({
            channelId: item.id,
            variantId: variant.id,
            isku: variant.sku || item.id,
            price: variant.price || amount,
            mrp: variant.compare_at_price || amount,
            images: images,
            variantImage: variantImage,
            description: item.body_html,
            quantity: variant.inventory_quantity,
            currency: variant.currency || currency,
            collections: collection,
            marketplaceId: 10,
            shopifyAccountName,
            userId,
            productIdType: item.product_type || null,
            brand: item.vendor || null,
            title: item.title,
            status:
              item.status.toLowerCase() === "active"
                ? "live"
                : item.status === "archived"
                  ? "archived"
                  : "draft",
            variation: isSingleVariant
              ? null
              : item.options.map((option) => ({
                name: option.name,
                value: variant[`option${option.position}`],
              })),
            itemSpecifics: itemSpecific || null,
            groupProductId: item.id,
          });
        } else {
          await existingCsku.update(
            {
              price: variant.price || amount,
              mrp: variant.compare_at_price || amount,
              images: images,
              description: item.body_html,
              collections: collection,
              quantity: variant.inventory_quantity,
              currency: variant.currency || currency,
              productIdType: item.product_type || null,
              brand: item.vendor || null,
              title: item.title,
              variation: isSingleVariant
                ? null
                : item.options.map((option) => ({
                  name: option.name,
                  value: variant[`option${option.position}`],
                })),
              itemSpecifics: itemSpecific || null,
              status:
                item.status === "active"
                  ? "live"
                  : item.status === "archived"
                    ? "archived"
                    : "draft",
            },
            { where: { channelId: item.id } }
          );
        }
      };

      if (item.variants.length === 1) {
        await handleVariantData(item.variants[0], true);
      } else if (item.variants.length > 1) {
        for (var j = 0; j < item.variants.length; j++) {
          const variant = item.variants[j];
          await handleVariantData(variant, false);
        }
      }
    }

    await csku.bulkCreate(cskus);
    await isku.bulkCreate(iskus);
  } catch (err) {
    console.error("fetch_shopify_product_graphQL", err);
    await apiCallLog(
      "Shopify Fetch Product",
      "updateEbayStockAndStatus",
      "updateEbayStockAndStatus",
      { isku: isku, shopifyAccessToken, shopifyAccessToken },
      {},
      { error: err },
      "error"
    );
  }
}

// Function to update stock and status on eBay based on Shopify data
exports.updateEbayStockAndStatus = async (ebayAccount, shopifyAccount) => {
  try {
    let jsonArray = [];
    console.log(
      "eBay Account Token ---------->",
      ebayAccount?.dataValues?.token
    );
    const shopifyAccountName = shopifyAccount?.dataValues?.accountName;

    if (!shopifyAccountName) {
      console.log("No Shopify account found for this user");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        {},
        {},
        { error: "No Shopify account found for this user" },
        "error"
      );
      return;
    }

    const shopifyAccessToken = shopifyAccount?.dataValues?.token;

    if (!shopifyAccessToken) {
      console.log("No Shopify access token found for this user");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        {},
        {},
        { error: "No Shopify access token found for this user" },
        "error"
      );
      return;
    }

    const userId = ebayAccount?.dataValues?.userId;

    if (!userId) {
      console.log("No user ID found for this eBay account");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        {},
        {},
        { error: "No user ID found for this eBay account" },
        "error"
      );
      return;
    }
    const ebayAccountName = ebayAccount?.dataValues?.accountName;

    if (!ebayAccountName) {
      console.log("No eBay account name found for this user");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        {},
        {},
        { error: "No eBay account name found for this user" },
        "error"
      );
      return;
    }

    console.log("eBay Account Name ---------->", ebayAccountName);
    // Path to store quantity updates
    const formula = priceFormula[userId];

    if (!formula) {
      console.log("No price formula found for this user");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        {},
        {},
        { error: "No price formula found for this user" },
        "error"
      );
      return;
    }

    const quantityJsonFilePath = path.join(
      __dirname,
      `${ebayAccountName}_QuantityUpdate.json`
    );

    // Initialize JSON file for quantity updates
    if (!fs.existsSync(quantityJsonFilePath)) {
      fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
    } else {
      fs.writeFileSync(quantityJsonFilePath, JSON.stringify([], null, 2));
      jsonArray = JSON.parse(fs.readFileSync(quantityJsonFilePath, "utf8"));
    }

    // Fetch all cskus for the user and marketplace
    const cskus = await csku.findAll({
      where: {
        accountName: ebayAccountName,
        userId,
        marketplaceId: 7,
        status: {
          [Op.in]: ["live"],
        },
        siteId: {
          [Op.in]: ["EBAY_US", "EBAY_MOTORS_US"],
        },
      },
    });

    console.log("cskus :>> ", cskus?.length);

    if (cskus?.length == 0) {
      console.log("No cskus found for this user and marketplace");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        { cskus: cskus },
        {},
        { error: "No cskus found for this user and marketplace" },
        "error"
      );
      return;
    }

    const iskus = cskus.map((csku) => csku.dataValues.isku);

    if (iskus.length == 0) {
      console.log("No iskus found for this user and marketplace");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        { cskus: cskus },
        {},
        { error: "No iskus found for this user and marketplace" },
        "error"
      );
      return;
    }

    const shopifyProducts = await csku.findAll({
      where: {
        isku: {
          [Op.in]: iskus,
        },
        marketplaceId: 10,
        userId: userId,
      },
    });

    if (shopifyProducts.length == 0) {
      console.log("No Shopify products found for this user and marketplace");
      await apiCallLog(
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        "updateEbayStockAndStatus",
        { cskus: cskus },
        {},
        { error: "No Shopify products found for this user and marketplace" },
        "error"
      );
      return;
    }

    if (shopifyProducts.length != cskus.length) {
      console.log("Mismatch between Shopify products and eBay cskus");

      const missingIskus = [];
      cskus.map((csk) => {
        if (csk.dataValues.isku != csk.dataValues.channelId) {
          const iskuExist = shopifyProducts.find(
            (shopifyProduct) =>
              csk.dataValues.isku == shopifyProduct.dataValues.isku
          );
          if (!iskuExist) {
            missingIskus.push(csk.dataValues.isku);
          }
        }
      });

      if (missingIskus.length > 0) {
        console.log("Missing iskus:", missingIskus);
        await fetchShopifyProductGraphQL(
          shopifyAccountName,
          shopifyAccessToken,
          missingIskus,
          userId
        );
      }
    }

    const ebayUpdateErrors = [];
    let emptySKUs = [];
    let k = 0;
    while (k < cskus.length) {
      const cskusBatch = cskus.slice(k, k + 50);

      let shopifyDetailsFetch = {};

      // Fetch Shopify product details
      try {
        shopifyDetailsFetch = await shopifyFetchProductDetails(
          // x batch
          shopifyAccountName,
          userId,
          shopifyAccessToken,
          cskusBatch,
          jsonArray,
          quantityJsonFilePath,
          k
        );
        console.log("Shopify Details:", shopifyDetailsFetch);
        if (!shopifyDetailsFetch || shopifyDetailsFetch?.length == 0) {
          console.log(
            "Shopify product not found, skipping:",
            cskusBatch.map((csku) => csku?.channelId)
          );
          await apiCallLog(
            "Shopify Fetch Product Details",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { cskus: cskusBatch },
            {},
            { error: "Shopify Products Not Found" },
            "error"
          );
          k += 50;
          continue;
        }
      } catch (error) {
        console.error("Error fetching Shopify product details:", error);
        await apiCallLog(
          "Shopify Fetch Product Details",
          "updateEbayStockAndStatus",
          "updateEbayStockAndStatus",
          { cskus: cskusBatch },
          {},
          { error: error },
          "error"
        );
        k += 50;
        continue; // Skip to the next CSKU if there's an error with this one
      }

      const emptySku = shopifyDetailsFetch.filter((item) => item.isku == null);

      if (emptySku && emptySku.length > 0) {
        emptySKUs = emptySKUs.concat(emptySku);
      }

      // Iterate through cskus
      for (let i = 0; i < cskusBatch?.length; i++) {
        const ebayCsku = cskusBatch[i]?.dataValues;
        console.log("Processing CSKU", i, ebayCsku?.channelId, new Date());

        await csku?.update({ threshhold: 0 }, { where: { id: ebayCsku?.id } });

        let shopifyDetails = shopifyDetailsFetch.find(
          (item) => item?.isku === ebayCsku?.isku
        );

        let geoSite = null;
        if (ebayCsku?.siteId) {
          geoSite = await Geosite.findOne({
            where: { globalId: ebayCsku?.siteId },
          });
        }

        // Initialize eBay API client
        const eBay = new ebay({
          appId: process.env.APP_ID,
          certId: process.env.CERT_ID,
          sandbox: false,
          siteId: geoSite?.dataValues?.siteId || 0,
          devId: process.env.DEV_ID,
          autoRefreshToken: true,
        });

        // Refresh eBay token if necessary
        try {
          await refreshTokenIfNeeded(ebayAccount, eBay);
          // eBay.OAuth2.setCredentials(newToken)
        } catch (error) {
          console.log("Error refreshing eBay token:", error);
          await apiCallLog(
            "Refresh Token",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayToken: ebayAccount },
            {},
            { error: error },
            "error"
          );
          continue; // Skip this item if the token couldn't be refreshed
        }

        let isVariant = false;
        if (!shopifyDetails && ebayCsku.channelId != ebayCsku.isku) {
          console.log("Shopify product not found, skipping");

          try {
            await eBay.trading.ReviseFixedPriceItem({
              Item: {
                ItemID: ebayCsku.channelId,
                Quantity: 0,
              },
            });

            await successHandler(
              ebayCsku.channelId,
              jsonArray,
              quantityJsonFilePath,
              ebayCsku,
              null,
              i,
              null,
              ebayCsku.price
            );

            await apiCallLog(
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              { ebayCsku: ebayCsku },
              {},
              { error: "Shopify product not found" },
              "error"
            );
          } catch (err) {
            await apiCallLog(
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              { ebayCsku: ebayCsku },
              {},
              { error: err },
              "error"
            );

            await errorHandler(
              err,
              jsonArray,
              quantityJsonFilePath,
              ebayCsku,
              null,
              i,
              false
            );

            ebayUpdateErrors.push({
              ebayId: ebayCsku?.channelId,
              quantity: ebayCsku?.quantity,
              price: ebayCsku?.price,
              error: err.message,
            });
          }

          continue;
        } else if (ebayCsku.channelId == ebayCsku.isku) {
          isVariant = true;
        }
        console.log("Shopify Details:", shopifyDetails, isVariant);

        if (
          ebayCsku.quantity < shopifyDetails?.quantity &&
          !["draft", "archived", "inactive"].includes(shopifyDetails?.status)
        ) {
          console.log("Quantity on eBay is less than Shopify, skipping");
          await apiCallLog(
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
            {},
            { error: "Quantity on eBay is less than Shopify" },
            "error"
          );
          continue;
        }

        if (isVariant) {
          const ebayItem = await eBay.trading.GetItem({
            ItemID: ebayCsku?.channelId,
          });
          console.log("eBay Item:", ebayItem.Item.Variations);
          const sku = Array.isArray(ebayItem?.Item?.Variations?.Variation)
            ? ebayItem?.Item?.Variations?.Variation[0].SKU
            : ebayItem?.Item?.Variations?.Variation?.SKU;
          console.log("SKU:", sku);
          if (sku && sku != ebayCsku?.isku) {
            const shopifyProduct = await shopifyFetchProductDetails(
              shopifyAccountName,
              userId,
              shopifyAccessToken,
              [{ isku: sku }],
              jsonArray,
              quantityJsonFilePath,
              i
            );
            console.log("Shopify Product:", shopifyProduct);
            if (shopifyProduct?.length == 0) {
              await apiCallLog(
                "updateEbayStockAndStatus",
                "updateEbayStockAndStatus",
                "updateEbayStockAndStatus",
                { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
                {},
                { error: "Shopify product not found" },
                "error"
              );
            } else {
              // Determine the correct quantity for the item based on Shopify details
              const quantity =
                shopifyProduct[0]?.quantity <= ebayCsku.quantity &&
                  !["draft", "archived", "inactive"].includes(
                    shopifyProduct[0]?.status
                  )
                  ? shopifyProduct[0]?.quantity
                  : 0;

              const status = ["draft", "archived", "inactive"].includes(
                shopifyProduct[0]?.status
              )
                ? "OUT_OF_STOCK"
                : "live";

              const price = shopifyProduct[0]?.price;
              console.log(price);
              const finalPrice = mathjs.evaluate(formula, { price });

              // Check if the quantity and status are the same; if so, skip the update
              if (
                ebayCsku?.quantity == quantity &&
                ebayCsku?.status == status &&
                ebayCsku?.price == finalPrice.toFixed(2)
              ) {
                console.log(
                  `No update needed for CSKU ${ebayCsku?.channelId}. Quantity and status are the same.`
                );
                await apiCallLog(
                  "updateEbayStockAndStatus",
                  "updateEbayStockAndStatus",
                  "updateEbayStockAndStatus",
                  { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
                  {},
                  {
                    error:
                      "No update needed for CSKU. Quantity and status are the same.",
                  },
                  "error"
                );
                continue;
              }

              const requestPayload = {
                ItemID: ebayCsku?.channelId,
                Quantity:
                  shopifyProduct[0]?.quantity <= ebayCsku.quantity &&
                    !["draft", "archived", "inactive"].includes(
                      shopifyProduct[0]?.status
                    )
                    ? Math.max(0, shopifyProduct[0]?.quantity)
                    : 0,
                SKU: sku,
              };

              if (ebayCsku.price != finalPrice.toFixed(2) && quantity > 0) {
                requestPayload.StartPrice = finalPrice.toFixed(2);
              }

              try {
                await eBay.trading.ReviseInventoryStatus({
                  InventoryStatus: [requestPayload],
                });

                await apiCallLog(
                  "ReviseInventoryStatus",
                  "updateEbayStockAndStatus",
                  "updateEbayStockAndStatus",
                  { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
                  {},
                  {},
                  "success"
                );

                await successHandler(
                  null,
                  jsonArray,
                  quantityJsonFilePath,
                  ebayCsku,
                  shopifyProduct[0],
                  i,
                  null,
                  shopifyProduct[0].price
                );

                continue;
              } catch (err) {
                await apiCallLog(
                  "ReviseInventoryStatus",
                  "updateEbayStockAndStatus",
                  "updateEbayStockAndStatus",
                  { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
                  {},
                  { error: err },
                  "error"
                );

                await errorHandler(
                  err,
                  jsonArray,
                  quantityJsonFilePath,
                  ebayCsku,
                  shopifyProduct[0],
                  i,
                  false
                );

                ebayUpdateErrors.push({
                  ebayId: ebayCsku?.channelId,
                  quantity: ebayCsku?.quantity,
                  price: finalPrice.toFixed(2),
                  error: err.message,
                });

                continue;
              }
            }
          } else {
            console.log("SKU not found", ebayCsku?.channelId);

            await errorHandler(
              null,
              jsonArray,
              quantityJsonFilePath,
              ebayCsku,
              null,
              i,
              true
            );

            await apiCallLog(
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              "updateEbayStockAndStatus",
              { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
              {},
              { error: "SKU not found" },
              "error"
            );
            continue;
          }
        }

        // Determine the correct quantity for the item based on Shopify details
        const quantity =
          shopifyDetails?.quantity <= ebayCsku.quantity &&
            !["draft", "archived", "inactive"].includes(shopifyDetails?.status)
            ? shopifyDetails?.quantity
            : 0;

        const status = ["draft", "archived", "inactive"].includes(
          shopifyDetails?.status
        )
          ? "OUT_OF_STOCK"
          : "live";

        const price = shopifyDetails?.price;
        console.log(price);
        const finalPrice = mathjs.evaluate(formula, { price });

        // Check if the quantity and status are the same; if so, skip the update
        if (
          ebayCsku?.quantity == quantity &&
          ebayCsku?.status == status &&
          ebayCsku?.price == finalPrice.toFixed(2)
        ) {
          console.log(
            `No update needed for CSKU ${ebayCsku?.channelId}. Quantity and status are the same.`
          );
          await apiCallLog(
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
            {},
            {
              error:
                "No update needed for CSKU. Quantity and status are the same.",
            },
            "error"
          );
          continue;
        }
        if (
          ["draft", "archived", "inactive"].includes(shopifyDetails?.status) &&
          ebayCsku?.quantity == 0
        ) {
          await apiCallLog(
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
            {},
            { error: "Shopify product is archived and quantity is 0" },
            "error"
          );
          continue;
        }
        if (ebayCsku?.quantity == quantity && ebayCsku?.price == finalPrice) {
          await apiCallLog(
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayCsku: ebayCsku, shopifyDetails: shopifyDetails },
            {},
            {
              error:
                "No update needed for CSKU. Quantity and price are the same.",
            },
            "error"
          );
          continue;
        }

        // Prepare the eBay payload
        const requestPayload = {
          Item: {
            ItemID: ebayCsku?.channelId,
            Title: ebayCsku?.title,
            Quantity: Math.max(0, quantity),
          },
        };

        if (ebayCsku.price != finalPrice.toFixed(2) && quantity > 0) {
          requestPayload.Item.StartPrice = finalPrice.toFixed(2);
        }

        // Update eBay with new stock and status
        try {
          const ebayResponse = await eBay.trading.ReviseFixedPriceItem(
            requestPayload
          );
          console.log("eBay Response:", ebayResponse);

          await apiCallLog(
            "ReviseFixedPriceItem",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayPayload: requestPayload, ebayPrice: ebayCsku?.price },
            ebayResponse,
            {},
            "success"
          );

          // Log success
          await successHandler(
            null,
            jsonArray,
            quantityJsonFilePath,
            ebayCsku,
            shopifyDetails,
            i,
            null,
            finalPrice
          );
        } catch (error) {
          console.error("Error updating eBay listing:", error);
          await apiCallLog(
            "ReviseFixedPriceItem",
            "updateEbayStockAndStatus",
            "updateEbayStockAndStatus",
            { ebayPayload: requestPayload, ebayPrice: ebayCsku?.price },
            {},
            error,
            "error"
          );

          // Log failure
          await errorHandler(
            error,
            jsonArray,
            quantityJsonFilePath,
            ebayCsku,
            shopifyDetails,
            i,
            false
          );

          ebayUpdateErrors.push({
            ebayId: ebayCsku?.channelId,
            quantity: quantity,
            price: finalPrice.toFixed(2),
            error: error.message,
          });
        }
      }

      k = k + 50;
    }
    console.log("eBay Update Errors:", ebayUpdateErrors);
    if (ebayUpdateErrors.length > 0) {
      console.log("Quantity update errors found, sending email report");
      const fields = {
        ebayId: "",
        quantity: "",
        price: "",
        error: "",
      };

      const csv = await ConvertJSONToCSV(ebayUpdateErrors, fields);

      const fileName = `${ebayAccountName}_quantity_update_errors_${new Date()}.csv`;

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: "akhlaq@mergekart.com, akhlaqansarievdtechnology@gmail.com",
        subject: `Quantity Update Failed Report ${new Date()}`,
        text: "Hello, please find the attached file.",
        attachments: [
          {
            filename: fileName,
            content: csv,
          },
        ],
      };
      await sendUpdateReportEmail(mailOptions);
      console.log("Email sent");
    }

    if (emptySKUs.length > 0) {
      console.log("Quantity update errors found, sending email report");
      const fields = {
        ebayId: "",
        quantity: "",
        price: "",
        error: "",
      };

      const csv = await ConvertJSONToCSV(emptySKUs, fields);

      const fileName = `${ebayAccountName}_quantity_update_errors_${new Date()}.csv`;

      const userEmail = await User.findOne({
        where: { id: userId },
        attributes: ["email"],
      });

      const mailOptions = {
        from: process.env.FROM_EMAIL,
        // to: userEmail?.dataValues?.email,
        to: "akhlaq@mergekart.com",
        subject: `Null SKUs found in product`,
        text: "Hello, please find the attached file.",
        attachments: [
          {
            filename: fileName,
            content: csv,
          },
        ],
      };
      await sendUpdateReportEmail(mailOptions);
      console.log("Email sent");
    }

    try {
      const failedData = jsonArray?.filter(
        (data) =>
          data?.["Error"] &&
          data?.["Error"]?.message != "The Item has been ended." &&
          data?.["Error"]?.description !=
          "You are not allowed to revise ended listings."
      );
      if (failedData?.length) {
        await quantityStatusUpdateQueue.add([
          ...failedData,
          {
            shopifyAccountName,
            shopifyAccessToken,
            userId,
            ebayToken: ebayAccount,
          },
        ]);
        fs.writeFileSync(
          ebayAccountName + "_failed_products.json",
          JSON.stringify(failedData, null, 2)
        );
        // Define the headers
        const headers = ["Title", "ShopifyId", "EbayId", "FailedAt", "Error"];
        const fileName = `${ebayAccountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`;
        const updateReportFilePath = path.join(__dirname, fileName);
        const res = await generateExcelFile(
          failedData,
          updateReportFilePath,
          headers
        );
        if (res && fs.existsSync(updateReportFilePath)) {
          const fileBuffer = fs.readFileSync(errorExcelFile);
          const errorFileLocation = await uploadToS3({
            mimetype:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: fileBuffer,
            originalname: fileName,
          });
          fs.unlink(updateReportFilePath, (err) => {
            if (err) {
              console.error("Error deleting file:", err);
              return;
            }
            console.log("File deleted successfully");
          });
          const mailOptions = {
            from: process.env.FROM_EMAIL,
            to: "aditya@mergekart.com, akhlaqansarievdtechnology@gmail.com",
            subject: `Quantity Update Failed Report ${new Date()}`,
            text: "Hello, please find the attached file.",
            attachments: [
              {
                filename: `${accountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`,
                path: errorFileLocation,
              },
            ],
          };
          const res = await sendUpdateReportEmail(mailOptions);
        }
        // await quantityStatusUpdateQueue.process()
      } else {
        fs.writeFileSync(
          ebayAccountName + "_failed_products.json",
          JSON.stringify([], null, 2)
        );
      }
    } catch (error) {
      console.error("Queue processing failed:", error);
    }
  } catch (error) {
    console.error("An error occurred in the stock update process:", error);

    await apiCallLog(
      "updateEbayStockAndStatus",
      "updateEbayStockAndStatus",
      "updateEbayStockAndStatus",
      { ebayAccount, shopifyAccount },
      {},
      { error: error.message },
      "error"
    );

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: "akhlaq@mergekart.com",
      subject: "STOCK UPDATE ERROR!!!",
      text: `Error in updating quantity for isku ${JSON.stringify({
        ebayAccount,
        shopifyAccount,
      })} and because of ${error.message}`,
    };

    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname, // Replace with your SMTP host
      port: process.env.SMTP_Port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_Username, // Replace with your SMTP username
        pass: process.env.SMTP_Password, // Replace with your SMTP password
      },
    });

    await transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  }
};

quantityStatusUpdateQueue?.process(async (job) => {
  console.log("Quantity update queue processing started--------------->");
  const { data } = job;
  console.log("data ----------->", data?.length);
  let retryData = data;
  let failedData = [];
  const Credentials = data[data?.length - 1];
  console.log("Credentials ---------------->", Credentials);
  const userId = Credentials?.userId;
  const ebayAccountName = data?.ebayAccount?.accountName;
  const retryJsonFilePath = path.join(
    __dirname,
    `${ebayAccountName}QuantityRetryUpdate.json`
  );
  if (fs.existsSync(retryJsonFilePath)) {
    failedData = JSON.parse(fs.readFileSync(retryJsonFilePath, "utf8"));
  } else {
    fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
  }
  let loopCount = 1;
  for (let i = 0; i < retryData?.length - 1; i++) {
    const item = retryData[i];
    console.log("item ------------>", item?.EbayId, i);
    const channelId = item?.NewEbayId ? NewEbayId : item?.EbayId;
    const cskuData = await csku.findOne({ where: { channelId: channelId } });
    if (cskuData?.dataValues?.threshhold == cskuData?.dataValues?.noOfRetries) {
      console.log(
        "Threshold reached, skipping this item -------------->",
        item?.EbayId
      );
      await csku.update(
        {
          threshhold: 0,
          quantiyUpdationStatus: "failed",
        },
        {
          where: {
            id: cskuData?.dataValues?.threshhold?.id,
          },
        }
      );
      continue;
    } else {
      let shopifyDetails = {};
      //NOTE -  Fetch Shopify product details
      try {
        shopifyDetails = await shopifyFetchProductDetails(
          Credentials?.shopifyAccountName,
          Credentials?.userId,
          Credentials?.shopifyAccessToken,
          cskuData?.dataValues,
          failedData,
          retryJsonFilePath,
          i
        );
        console.log("shopifyDetails --------->", shopifyDetails);
        if (!shopifyDetails) {
          console.log("Shopify product not found --------------->");
          await csku.update(
            {
              threshhold: cskuData?.dataValues?.threshhold + 1,
              quantiyUpdationStatus: "failed",
            },
            {
              where: {
                id: cskuData?.dataValues?.threshhold?.id,
              },
            }
          );
          if (i === retryData?.length - 2) {
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
            if (failedData?.length && loopCount != 2) {
              failedData = failedData?.filter(
                (data) =>
                  data?.["Error"] &&
                  data?.["Error"]?.message != "The Item has been ended." &&
                  data?.["Error"]?.description !=
                  "You are not allowed to revise ended listings."
              );
              retryData = failedData;
              i = -1;
              loopCount++;
              fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
              if (fs.existsSync(retryJsonFilePath)) {
                failedData = JSON.parse(
                  fs.readFileSync(retryJsonFilePath, "utf8")
                );
              }
            }
            console.log("failedData --------->", failedData);
          }
          continue;
        }
      } catch (error) {
        await csku.update(
          {
            threshhold: cskuData?.dataValues?.threshhold + 1,
            quantiyUpdationStatus: "failed",
          },
          {
            where: {
              id: cskuData?.dataValues?.threshhold?.id,
            },
          }
        );
        if (i === retryData?.length - 2) {
          if (fs.existsSync(retryJsonFilePath)) {
            failedData = JSON.parse(fs.readFileSync(retryJsonFilePath, "utf8"));
          }
          if (failedData?.length && loopCount != 2) {
            failedData = failedData?.filter(
              (data) =>
                data?.["Error"] &&
                data?.["Error"?.meta?.message != "The Item has been ended."]
            );
            retryData = failedData;
            i = -1;
            loopCount++;
            fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
            if (fs.existsSync(retryJsonFilePath)) {
              failedData = JSON.parse(
                fs.readFileSync(retryJsonFilePath, "utf8")
              );
            }
          }
          console.log("failedData --------->", failedData);
        }
        continue;
      }
      let geoSite = null;
      if (geoSite) {
        geoSite = await Geosite.findOne({
          where: {
            globalId: cskuData?.dataValues?.siteId,
          },
        });
      }
      //NOTE - set up based on siteId
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        siteId: geoSite?.dataValues?.siteId || 0,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });
      // Refresh eBay token if necessary
      try {
        await refreshTokenIfNeeded(data?.ebayToken, eBay);
        // eBay.OAuth2.setCredentials(newToken)
      } catch (error) {
        console.error("Error refreshing eBay token:", error);
        continue; // Skip this item if the token couldn't be refreshed
      }
      // Determine the correct quantity for the item based on Shopify details
      const quantity =
        shopifyDetails?.quantity > 0 &&
          !["draft", "archived", "inactive"].includes(shopifyDetails?.status)
          ? shopifyDetails?.quantity
          : 0;

      const status =
        shopifyDetails?.status === "archived"
          ? "OUT_OF_STOCK"
          : shopifyDetails?.status === "active"
            ? "live"
            : shopifyDetails?.status;

      // Check if the quantity and status are the same; if so, skip the update
      if (ebayCsku?.quantity === quantity && ebayCsku?.status === status) {
        console.log(
          `No update needed for CSKU ${ebayCsku?.channelId}. Quantity and status are the same.`
        );
        continue;
      }

      const formula = priceFormula[userId];

      const price = shopifyDetails?.variants[0]?.price;

      const finalPrice = mathjs.evaluate(formula, { price });

      // Prepare the eBay payload
      const requestPayload = {
        Item: {
          ItemID: ebayCsku?.channelId,
          Title: ebayCsku?.title,
          Quantity: quantity,
          StartPrice: parseFloat(finalPrice).toFixed(2),
        },
      };

      // Update eBay with new stock and status
      try {
        const ebayResponse = await eBay.trading.ReviseFixedPriceItem(
          requestPayload
        );
        console.log("eBay Response:", ebayResponse);

        // Log success
        await successHandler(
          null,
          jsonArray,
          quantityJsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          null,
          finalPrice
        );
      } catch (error) {
        console.error("Error updating eBay listing:", error);

        // Log failure
        await errorHandler(
          error,
          jsonArray,
          quantityJsonFilePath,
          ebayCsku,
          shopifyDetails,
          i,
          false
        );
      }
    }
  }
  if (failedData?.length) {
    // Define the headers
    const headers = ["Title", "ShopifyId", "EbayId", "FailedAt", "Error"];
    const fileName = `${ebayAccountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`;
    const updateReportFilePath = path.join(__dirname, fileName);
    const res = await generateExcelFile(
      failedData,
      updateReportFilePath,
      headers
    );
    fs.writeFileSync(retryJsonFilePath, JSON.stringify([], null, 2));
    if (res && fs.existsSync(updateReportFilePath)) {
      const fileBuffer = fs.readFileSync(errorExcelFile);
      const errorFileLocation = await uploadToS3({
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fileBuffer,
        originalname: fileName,
      });
      fs.unlink(updateReportFilePath, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
          return;
        }
        console.log("File deleted successfully");
      });
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: "aditya@mergekart.com",
        cc: "pallavisolday12@gmail.com",
        subject: `Quantity Update Failed Report ${new Date()}`,
        text: "Hello, please find the attached file.",
        attachments: [
          {
            filename: `${accountName}_quantity_update_sellerpundit_report_${new Date()}.xlsx`,
            path: errorFileLocation,
          },
        ],
      };
      const res = await sendUpdateReportEmail(mailOptions);
      await job.remove();
    }
  }
});

// Function to refresh eBay token if necessary
async function refreshTokenIfNeeded(ebayAccount, eBay) {
  const startDate = moment().add(5, "hours").add(30, "minutes");
  const tokenExpiresDate = moment(
    ebayAccount?.dataValues?.lastTokenRefreshDate
  );
  const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

  if (hoursDifference >= 2) {
    console.log(
      "Refreshing eBay token...",
      ebayAccount?.dataValues?.refreshToken
    );
    // const newToken = await ebayAuthToken.getAccessToken(
    //   'PRODUCTION',
    //   ebayAccount?.dataValues?.refreshToken,
    //   scopes
    // )
    // console.log('objectJSON.parse(newToken).access_token :>> ', JSON.parse(newToken).access_token);
    // return JSON.parse(newToken).access_token
    return await refreshToken(eBay, ebayAccount);
  } else {
    return await eBay.OAuth2.setCredentials(ebayAccount?.dataValues?.token);
  }
}

//SECTION - Create Indivisual ISKU
exports.CreateIndivisualISKU = async (req, res) => {
  try {
    const {
      marketplaceId,
      accountName,
      userId,
      isku: iskuCode, //TODO: Rename to avoid conflict with the isku model
      costPrice,
      currency,
      weight,
      height,
      width,
      depth,
      title,
      warehouseLocation,
      images,
      quantity,
    } = req.body;

    //NOTE: Find the marketplace by ID
    const marketPlace = await Marketplace.findOne({
      where: { id: marketplaceId },
    });

    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    //NOTE Find the token associated with the user, marketplace, and account
    const token = await Tokens.findOne({
      where: {
        userId,
        marketPlaceId: marketplaceId,
        accountName,
      },
    });

    //NOTE Check if the token was found
    if (!token) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Token for this user not found.",
      });
    }

    //NOTE Create ISKU record in the database
    await isku.create({
      marketplaceId,
      accountName,
      userId,
      isku: iskuCode, //TODO: Use the renamed variable here
      costPrice,
      currency,
      weight,
      height,
      width,
      depth,
      title,
      warehouseLocation,
      images: images ? images : [],
      quantity,
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: "ISKU successfully created.",
    });
  } catch (err) {
    //NOTE: Log the error with New Relic or any other monitoring service
    newRelic.recordCustomEvent("Error in ISKU creation. Error: ", err.message);
    console.error(err);

    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.generateExcelforUpdateBulkQuantityAndPrice = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName } = req?.query;

    // Step 1: Get user token from tokens table based on userId and accountName
    const userToken = await Tokens.findOne({
      where: {
        // userId,
        accountName,
      },
    });

    if (!userToken) {
      return res.status(400).json({
        success: false,
        message: "User token not found",
      });
    }

    // Step 2: Get marketplace details from marketplace table using marketplaceId
    const marketPlaceData = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketPlaceData) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    // Step 3: Fetch data from cskus where status is not 'ended', 'completed', or 'deleted'
    const cskuData = await csku.findAll({
      where: {
        // userId,
        accountName,
        marketplaceId,
        status: {
          [Sequelize.Op.notIn]: [
            "ended",
            "completed",
            "deleted",
            "failed",
            "under review",
            "inprogress",
          ],
        },
      },
      attributes: [
        "channelId",
        "quantity",
        "price",
        "currency",
        "title",
        "variantId",
        "isku",
      ],
    });

    if (cskuData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data available for the provided filters",
      });
    }

    // Step 4: Generate Excel file
    const workbook = await xlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0);

    // Set headers
    let headers = [
      "ItemId",
      "ISKU",
      "variantId",
      "Title",
      "Quantity",
      "Currency",
      "Price",
    ];
    let keys = [
      "channelId",
      "isku",
      "variantId",
      "title",
      "quantity",
      "currency",
      "price",
    ];
    headers.forEach((header, index) => {
      sheet.cell(1, index + 1).value(header);
    });

    // Populate rows with data
    cskuData.forEach((row, rowIndex) => {
      keys?.map((key) => {
        sheet.cell(rowIndex + 2, keys.indexOf(key) + 1).value(row[key]);
      });
    });

    // Convert the workbook to a buffer
    const excelBuffer = await workbook.outputAsync();

    // Set the appropriate headers and send the buffer
    res.setHeader("Content-Length", excelBuffer.length);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bulk_update_price_quantity.xlsx"'
    );

    // Send the buffer directly in the response
    return res.send(excelBuffer);
  } catch (error) {
    // Catch any errors and return a structured response
    console.error("Error generating Excel file:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
exports.updateBulkQuantityAndPrice = async (req, res) => {
  const functionName = "updateBulkQuantityAndPrice";
  try {
    let { userId, accountName, marketPlaceId } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "File not uploaded" });
    }
    if (
      req.file.mimetype !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid file type" });
    }

    if (!userId || !accountName || !marketPlaceId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing Required Fields" });
    }

    const token = await Tokens.findOne({
      where: {
        marketPlaceId: marketPlaceId,
        accountName: accountName,
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId,
      },
    });

    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: "MarketPlace not found",
      });
    }

    const buffer = Buffer.from(req.file.buffer);
    const workbook = xls.read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    let jsonData = xls.utils.sheet_to_json(worksheet, { defval: null });
    jsonData = Array.isArray(jsonData) ? jsonData : [jsonData];

    const dbData = await csku.findAll({
      where: {
        accountName,
        marketplaceId: marketPlaceId,
        status: {
          [Sequelize.Op.notIn]: [
            "ended",
            "completed",
            "deleted",
            "failed",
            "under review",
            "inprogress",
          ],
        },
      },
      attributes: [
        "channelId",
        "quantity",
        "price",
        "currency",
        "title",
        "variantId",
        "isku",
      ],
    });

    const mergedData = jsonData.map((sheetItem) => {
      const dbItem = dbData.find(
        (dbItem) =>
          dbItem.channelId === sheetItem.ItemId &&
          dbItem.isku === sheetItem.ISKU
      );
      return {
        channelId: sheetItem.ItemId,
        variantId: sheetItem?.variantId || null,
        sku: sheetItem?.ISKU,
        currentQuantity: dbItem ? dbItem.quantity : null,
        currentPrice: dbItem ? dbItem.price : null,
        Quantity: sheetItem.Quantity,
        Price: sheetItem.Price,
        Currency: sheetItem?.Currency,
      };
    });

    const itemsToUpdate = mergedData.filter((item) => {
      return (
        item.Quantity !== item.currentQuantity ||
        item.Price !== item.currentPrice
      );
    });

    if (itemsToUpdate.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No items to update",
        errors: null,
      });
    }

    const originalFilePath = await uploadToS3({
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buffer,
      originalname: `failed-report/${req?.file?.originalname
        }-${new Date().getTime()}`,
    });

    const bulkUploadHistory = await BulkUploadHistory.create({
      actionType: BulkActionType.UPDATE_PRICE_AND_QUANTITY,
      userId,
      sourceAccountName: accountName,
      marketplaceId: Number(marketPlaceId),
      uploadedFilePath: originalFilePath,
      totalItems: itemsToUpdate.length,
      status: HistoryStatus.INPROGRESS,
    });

    const newHistory = bulkUploadHistory.dataValues;
    let errorFile = [];
    let successCounts = 0;
    let failedCounts = 0;

    res.status(200).json({
      success: true,
      message: "Products have been started uploading",
      errors: null,
    });

    if (marketPlace.url.includes("ebay")) {
      await bulkUpdateEbayPriceAndQuantity(
        itemsToUpdate,
        token.dataValues,
        errorFile,
        successCounts,
        failedCounts
      );
    } else if (marketPlace.url.includes("shopify")) {
      await updateShopifyBulkPriceAndQuantity(
        itemsToUpdate,
        token.dataValues,
        errorFile,
        successCounts,
        failedCounts
      );
    } else if (marketPlace.url.includes("walmart")) {
      const bulkRes = await bulkUpdateWalmartPriceAndQuantity(
        itemsToUpdate,
        token.dataValues,
        errorFile
      );
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message,
        });
      }
      successCounts = bulkRes?.successCount;
      failedCounts = bulkRes?.failedCount;
    } else if (marketPlace.url.includes("woocommerce")) {
      await updateWooCommerceBulkPriceAndQuantity(
        itemsToUpdate,
        token.dataValues,
        errorFile,
        successCounts,
        failedCounts
      );
    }

    let errorFileLocation = null;
    if (errorFile.length) {
      const fileName = `${req?.file?.originalname
        }-failed-${new Date().getTime()}.xlsx`;
      const excelFilePath = path.join(__dirname, fileName);
      const result = await generateExcelFile(
        errorFile,
        excelFilePath,
        Object.keys(errorFile[0])
      );
      if (result && fs.existsSync(excelFilePath)) {
        const fileBuffer = fs.readFileSync(excelFilePath);
        try {
          errorFileLocation = await uploadToS3({
            mimetype:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: fileBuffer,
            originalname: `failed-report/${req?.file?.originalname
              }-failed-${new Date().getTime()}.xlsx`,
          });
          fs.unlink(excelFilePath, (err) => {
            if (err) {
              console.error("Error deleting file:", err);
            }
          });
        } catch (error) {
          console.error("Error uploading file to S3:", error);
        }
      }
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: "aditya@mergekart.com",
        cc: "pallavisolday12@gmail.com",
        subject: `Quantity and Price Bulk Update Report of ${accountName} ${new Date()}`,
        text: "Hello, please find the attached file.",
      };
      if (errorFileLocation) {
        mailOptions.attachments = [
          {
            filename: fileName,
            path: errorFileLocation,
          },
        ];
      } else {
        mailOptions.text = "Error While generating Error Excel File.";
      }
      await sendUpdateReportEmail(mailOptions);
    }

    await BulkUploadHistory.update(
      {
        errorFilePath: errorFileLocation,
        status: HistoryStatus.COMPLETED,
        failedItems: failedCounts,
        successItems: successCounts,
      },
      { where: { id: newHistory.id } }
    );
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.GetSingleItemFromMarketplace = async (req, res) => {
  try {
    const { itemId, accountName, marketplaceId, userId } = req.body;

    if (!itemId || !accountName || !marketplaceId || !userId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing Required Fields: itemId, accountName, marketplaceId, or userId",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    let itemDetails = null;

    if (marketplace.url.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
        authToken: token.dataValues.token,
      });

      const startDate = moment().add(5, "hours").add(30, "minutes");
      const tokenExpiresDate = moment(token.dataValues.lastTokenRefreshDate);
      const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      itemDetails = await GetItemEbay(eBay, itemId);

      const response = {
        ItemArray: {
          Item: [itemDetails.Item],
        },
      };

      await this.pushData(response, marketplaceId, accountName, userId, false);
    } else if (marketplace.url.includes("shopify")) {
      itemDetails = await FetchShopifyProducts(
        [itemId],
        accountName,
        userId,
        token.dataValues.token
      );

      if (typeof itemDetails !== "object") {
        return res.status(400).json({
          success: false,
          message: itemDetails,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Item details fetched successfully",
      data: itemDetails,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(400).json({
      success: false,
      message: error?.message ? error?.message : "Failed to fetch",
    });
  }
};

exports.GenerateBulkFetchCSV = async (req, res) => {
  try {
    const data = [
      {
        "Item ID": "",
      },
    ];

    const parser = new CSVParser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment;filename=bulkFetchUpload.csv"
    );
    res.send(csv);
  } catch (error) {
    console.error("Error:", error);
  }
};

exports.BulkFetch = async (req, res) => {
  try {
    const { userId, accountName, marketplaceId } = req.body;

    if (!userId || !accountName || !marketplaceId || !req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Missing Required Fields: userId, accountName, or marketplaceId",
      });
    }

    if (req.file.mimetype !== "text/csv") {
      return res.status(400).json({
        success: false,
        message: "Invalid file type",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    const buffer = Buffer.from(req.file.buffer);
    let json = await convertToJSON(req.file.buffer);

    if (!json || !json?.[0]?.["Item ID"]) {
      return res.status(400).json({
        success: false,
        message: "Invalid CSV file",
      });
    }

    const originalFilePath = await uploadToS3({
      mimetype: req.file.mimetype,
      buffer: buffer,
      originalname: req.file.originalname,
    });

    // NOTE - add it to bulk upload history
    const bulkUploadHistory = await BulkUploadHistory.create(
      {
        actionType: BulkActionType.UPDATE_ISKU,
        userId,
        uploadedFilePath: originalFilePath || null,
        totalItems: json?.length || 0,
        status: HistoryStatus.INPROGRESS,
      },
      { returning: true }
    );

    const newHistory = bulkUploadHistory.dataValues;
    const errorFile = [];
    let successCounts = 0;
    let failedCounts = 0;

    const itemInDB = await csku.findAll({
      where: {
        accountName,
        marketplaceId,
        userId,
        channelId: {
          [Op.in]: json.map((item) => item["Item ID"]),
        },
      },
    });

    if (itemInDB.length === json.length) {
      return res.status(200).json({
        success: true,
        message: "All items are already in the database",
      });
    } else if (itemInDB.length > 0) {
      const itemsInDB = itemInDB.map((item) => item.channelId);

      json = json.filter((item) => !itemsInDB.includes(item["Item ID"]));
    }

    let items = [];

    if (marketplace.url.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
        authToken: token.dataValues.token,
      });

      const startDate = moment().add(5, "hours").add(30, "minutes");
      const tokenExpiresDate = moment(token.dataValues.lastTokenRefreshDate);
      const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      for (let i = 0; i < json.length; i++) {
        try {
          const itemDetails = await GetItemEbay(eBay, json[i]["Item ID"]);

          if (itemDetails && itemDetails.Item) {
            items.push(itemDetails);

            const response = {
              ItemArray: {
                Item: [itemDetails.Item],
              },
            };

            await this.pushData(
              response,
              marketplaceId,
              accountName,
              userId,
              false
            );

            successCounts++;
          } else {
            await apiCallLog(
              "GetItemEbay",
              "BulkFetch",
              "BulkFetch",
              { itemId: json[i]["Item ID"] },
              {},
              { error: itemDetails },
              "error"
            );
            failedCounts++;
            errorFile.push({
              "Item ID": json[i]["Item ID"],
              Error:
                typeof itemDetails == "object"
                  ? JSON.stringify(itemDetails)
                  : itemDetails,
            });
          }
        } catch (error) {
          console.error("Error:", error);
          await apiCallLog(
            "GetItemEbay",
            "BulkFetch",
            "BulkFetch",
            { itemId: json[i]["Item ID"] },
            {},
            error,
            "error"
          );
        }
      }

      let errorFileLocation = null;
      if (failedCounts > 0) {
        const csvBuffer = await json2csv(errorFile);
        errorFileLocation = await uploadToS3({
          mimetype: req.file.mimetype,
          buffer: Buffer.from(csvBuffer),
          originalname: `failed-report/${req?.file?.originalname
            }-failed-${new Date().getTime()}.xlsx`,
        });
      }

      await BulkUploadHistory.update({
        where: {
          id: newHistory.id,
        },
        values: {
          errorFilePath: errorFileLocation,
          status: HistoryStatus.COMPLETED,
          failedItems: failedCounts,
          successItems: successCounts,
        },
      });
    } else if (marketplace.url.includes("shopify")) {
      const response = await FetchShopifyProducts(
        json.map((item) => item["Item ID"]),
        accountName,
        userId,
        token.dataValues.token
      );

      if (
        typeof response == "object" &&
        response?.length &&
        response.length > 0
      ) {
        successCounts = response.length;
        failedCounts = json.length - response.length;

        if (failedCounts > 0) {
          errorFile.push(
            ...json.filter((item) => !response.includes(item["Item ID"]))
          );

          let errorFileLocation = null;
          if (errorFile.length > 0) {
            const csvBuffer = await json2csv(errorFile);
            errorFileLocation = await uploadToS3({
              mimetype: req.file.mimetype,
              buffer: Buffer.from(csvBuffer),
              originalname: `failed-report/${req?.file?.originalname
                }-failed-${new Date().getTime()}.xlsx`,
            });
          }
        }

        await BulkUploadHistory.update({
          where: {
            id: newHistory.id,
          },
          values: {
            errorFilePath: errorFileLocation,
            status: HistoryStatus.COMPLETED,
            failedItems: failedCounts,
            successItems: successCounts,
          },
        });
      } else {
        await apiCallLog(
          "FetchShopifyProducts",
          "BulkFetch",
          "BulkFetch",
          { itemIds: json.map((item) => item["Item ID"]) },
          {},
          { error: response },
          "error"
        );

        return res.status(500).json({
          success: false,
          message: response,
          response,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Items fetched successfully",
      data: items,
      successCounts,
      failedCounts,
    });
  } catch (error) {
    console.error("Error:", error);
  }
};

exports.FetchItemsFeed = async (req, res) => {
  try {
    const { userId, accountName, marketplaceId } = req.body;

    if (!userId || !accountName || !marketplaceId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing Required Fields: userId, accountName, or marketplaceId",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (
      !token ||
      !token.dataValues.token ||
      !token.dataValues.lastTokenRefreshDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketplace || !marketplace.url) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    if (marketplace.url.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true,
      });

      eBay.OAuth2.setCredentials(token.dataValues.token);

      const startDate = moment().add(5, "hours").add(30, "minutes");
      const tokenExpiresDate = moment(token.dataValues.lastTokenRefreshDate);
      const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      let feedType = "LMS_ACTIVE_INVENTORY_REPORT";
      const response = await FeedFileGenerate(eBay, feedType);

      if (response) {
        const startDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .subtract(1, "days")
          .toISOString();
        const endDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .endOf("day")
          .toISOString();

        const feeds = await GetInventoryTasks(
          eBay,
          feedType,
          startDate,
          endDate
        );

        if (feeds && feeds.tasks && feeds.tasks.length > 0) {
          const feedTasks = feeds.tasks;

          if (!feedTasks || feedTasks.length === 0) {
            throw new Error("Error in fetching feed tasks");
          }

          let feedId;
          for (let i = 0; i < feedTasks.length; i++) {
            const feedCompletion = moment(feedTasks[i].completionDate);

            if (
              feedCompletion.isAfter(startDate) &&
              feedCompletion.isBefore(endDate)
            ) {
              feedId = feedTasks[i].taskId;
              break;
            }
          }

          if (feedId) {
            const feedRequest = JSON.stringify({
              zipFileName: `${accountName}_inventory.zip`, // Default zip file name
              token: token.dataValues.token,
              zipKey: "downloads/",
              unzippedFolderKey: "unzipped/",
              taskId: feedId,
            });

            const params = {
              FunctionName: "unzipper", // Replace with your Lambda function name
              Payload: feedRequest, // Pass input as a JSON string
            };

            const result = await lambda.invoke(params).promise();

            if (!result) {
              throw new Error("Error in extracting files");
            }

            let parsedPayload = null;
            try {
              parsedPayload = JSON.parse(result.Payload);
            } catch (error) {
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                error,
                "error"
              );
              return res.status(500).json({
                success: false,
                message: error.message,
              });
            }

            if (
              parsedPayload &&
              parsedPayload.extractedFiles &&
              parsedPayload?.extractedFiles?.length > 0
            ) {
              const extractedFiles = parsedPayload.extractedFiles;

              const xmlFileLink = extractedFiles[0];

              const xmlData = await ConvertXMLToJSON(xmlFileLink);

              if (!xmlData) {
                throw new Error("Error in converting XML to JSON");
              }

              if (
                xmlData &&
                xmlData?.BulkDataExchangeResponses &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails?.length > 0
              ) {
                const itemIDs =
                  xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport?.SKUDetails.map(
                    (item) => item.ItemID
                  );

                const existingItems = await csku.findAll({
                  where: {
                    accountName,
                    marketplaceId,
                    userId,
                    channelId: {
                      [Op.in]: itemIDs,
                    },
                  },
                  attributes: ["channelId"],
                });

                const existingItemIDs = existingItems.map(
                  (item) => item.channelId
                );

                const newItems = itemIDs.filter(
                  (item) => !existingItemIDs.includes(item)
                );

                if (newItems && newItems.length > 0) {
                  const jsonBody = newItems.map((item) => ({
                    "Item ID": item,
                  }));

                  const csvData = await ConvertJSONToCSV(jsonBody, ["Item ID"]);

                  if (!csvData) {
                    throw new Error("Error in converting JSON to CSV");
                  }

                  const csvBuffer = Buffer.from(csvData);

                  let data = new FormData();
                  data.append("file", csvBuffer);
                  data.append("userId", userId);
                  data.append("accountName", accountName);
                  data.append("marketplaceId", marketplaceId);

                  let config = {
                    method: "post",
                    maxBodyLength: Infinity,
                    url: "http://localhost:5001/catalogue/bulk-fetch",
                    headers: {
                      ...data.getHeaders(),
                    },
                    data: data,
                  };

                  await axios.request(config);

                  return res.status(200).json({
                    success: true,
                    message: "Items fetched successfully",
                  });
                } else {
                  return res.status(200).json({
                    success: true,
                    message: "All items are already in the database",
                  });
                }
              } else {
                throw new Error("Error in extracting files");
              }
            } else {
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                { error: parsedPayload },
                "error"
              );
              return res.status(500).json({
                success: false,
                message: "Error in extracting files",
              });
            }
          }
        } else {
          throw new Error("Error in fetching feed tasks");
        }
      } else {
        throw new Error("Error in generating feed file");
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Marketplace not supported",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Items fetched successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "FetchEbayItemsFeed",
      "FetchEbayItemsFeed",
      "FetchEbayItemsFeed",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.callStitchAndUpload = async (req, res) => {
  const { banner1, mainImages, banner2 } = req.body;

  console.log("Request received:", { banner1, mainImages, banner2 });

  // Validate input
  if (!mainImages || !Array.isArray(mainImages) || mainImages.length === 0) {
    return res.status(400).send("Main images are required");
  }
  try {
    const response = await axios.post(
      "http://localhost:4000/stitch-and-upload",
      {
        banner1,
        mainImages,
        banner2,
      }
    );

    // Return the same response as the stitch-and-upload API
    return res.json(response.data);
  } catch (error) {
    const err = {
      message: error.message,
    };
    console.error("Error calling stitch-and-upload:", error.message);
    newRelic.recordCustomEvent(`Error in catalogue fetch`, err);
    await apiCallLog(
      "callStitchAndUpload",
      "/catalogue/stitch-image",
      "callStitchAndUpload",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: "Error calling stitch-and-upload service",
      error: error.message,
    });
  }
};

exports.FetchItemStatus = async (req, res) => {
  try {
    const { accountName, userId, marketplaceId } = req.body;

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (
      !token ||
      !token.dataValues.token ||
      !token.dataValues.lastTokenRefreshDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketPlace || !marketPlace.url) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    if (marketPlace.url.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
      });

      const startDate = moment();
      // .add(5, 'hours').add(30, 'minutes');
      const tokenExpiresDate = moment(token.dataValues.lastTokenRefreshDate);
      const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      eBay.OAuth2.setCredentials(token.dataValues.token);

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      let feedType = "LMS_ACTIVE_INVENTORY_REPORT";
      const response = await FeedFileGenerate(eBay, feedType);

      if (response) {
        const startDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .subtract(1, "days")
          .toISOString();
        const endDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .endOf("day")
          .toISOString();

        const feeds = await GetInventoryTasks(
          token.dataValues.token,
          feedType,
          startDate,
          endDate
        );
        // console.log("feeds", feeds);
        if (feeds && feeds.tasks && feeds.tasks.length > 0) {
          const feedTasks = feeds.tasks;

          if (!feedTasks || feedTasks.length === 0) {
            throw new Error("Error in fetching feed tasks");
          }

          let feedId;
          for (let i = 0; i < feedTasks.length; i++) {
            const feedCompletion = moment(feedTasks[i].completionDate);

            if (
              feedCompletion.isAfter(startDate) &&
              feedCompletion.isBefore(endDate)
            ) {
              feedId = feedTasks[i].taskId;
              break;
            }
          }
          // console.log("feedId", feedId);
          if (feedId) {
            const feedRequest = JSON.stringify({
              zipFileName: `${accountName}_inventory.zip`, // Default zip file name
              token: token.dataValues.token,
              zipKey: "downloads/",
              unzippedFolderKey: "unzipped/",
              taskId: feedId,
              apiUrl: "api.ebay.com",
              token: token.dataValues.token,
              bucketName: "sellerpundit-bucket-1",
            });

            const params = {
              FunctionName: "unzipper", // Replace with your Lambda function name
              Payload: feedRequest, // Pass input as a JSON string
            };

            await new Promise((resolve) => setTimeout(resolve, 10000));
            const result = await lambda.invoke(params).promise();
            // console.log("result", result);
            if (!result) {
              throw new Error("Error in extracting files");
            }

            let parsedPayload = null;
            try {
              let Payload = JSON.parse(result.Payload);

              parsedPayload = JSON.parse(Payload.body);
            } catch (error) {
              console.error("Error:", error);
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                error,
                "error"
              );
              return res.status(500).json({
                success: false,
                message: error.message,
              });
            }

            if (
              parsedPayload &&
              parsedPayload.extractedFiles &&
              parsedPayload?.extractedFiles?.length > 0
            ) {
              const extractedFiles = parsedPayload.extractedFiles;

              const xmlFileLink = extractedFiles[0];

              const xmlData = await ConvertXMLToJSON(xmlFileLink);

              if (!xmlData) {
                throw new Error("Error in converting XML to JSON");
              }

              if (
                xmlData &&
                xmlData?.BulkDataExchangeResponses &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails?.length > 0
              ) {
                const itemIDs =
                  xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport?.SKUDetails.map(
                    (item) => item.ItemID
                  );

                const existingItems = await csku.findAll({
                  where: {
                    accountName,
                    marketplaceId,
                    userId,
                    // channelId: {
                    //   [Op.in]: itemIDs
                    // }
                  },
                  attributes: ["channelId"],
                });

                const existingItemIDs = existingItems.map(
                  (item) => item.channelId
                );

                const nonActiveItems = itemIDs.filter(
                  (item) => !existingItemIDs.includes(item)
                );

                if (nonActiveItems && nonActiveItems.length > 0) {
                  await csku.update(
                    {
                      status: "completed",
                    },
                    {
                      where: {
                        channelId: nonActiveItems,
                      },
                    }
                  );
                }
                if (existingItemIDs && existingItemIDs.length > 0) {
                  await csku.update(
                    {
                      status: "live",
                    },
                    {
                      where: {
                        channelId: existingItemIDs,
                      },
                    }
                  );
                }

                return res.status(200).json({
                  success: true,
                  message: "Items fetched successfully",
                });
              } else {
                throw new Error("Error in extracting files");
              }
            } else {
              console.error("Error:", parsedPayload);
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                { error: parsedPayload },
                "error"
              );
              return res.status(500).json({
                success: false,
                message: "Error in extracting files",
              });
            }
          }
        } else {
          throw new Error("Error in fetching feed tasks");
        }
      } else {
        throw new Error("Error in generating feed file");
      }
    }
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "FetchItemStatus",
      "FetchItemStatus",
      "FetchItemStatus",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.FetchItemStatusFunction = async (
  accountName,
  userId,
  marketplaceId
) => {
  try {
    if (!accountName || !userId || !marketplaceId) {
      throw new Error(
        "Missing Required Fields: accountName, userId, or marketplaceId"
      );
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (
      !token ||
      !token.dataValues.token ||
      !token.dataValues.lastTokenRefreshDate
    ) {
      throw new Error("Token not found");
    }

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketPlace || !marketPlace.url) {
      throw new Error("Marketplace not found");
    }

    if (marketPlace.url.includes("ebay")) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
      });

      const startDate = moment();
      // .add(5, 'hours').add(30, 'minutes');
      const tokenExpiresDate = moment(token.dataValues.lastTokenRefreshDate);
      const hoursDifference = startDate.diff(tokenExpiresDate, "hours");

      eBay.OAuth2.setCredentials(token.dataValues.token);

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token);
      }

      let feedType = "LMS_ACTIVE_INVENTORY_REPORT";
      const response = await FeedFileGenerate(eBay, feedType);

      if (response) {
        const startDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .subtract(1, "days")
          .toISOString();
        const endDate = moment()
          .add(5, "hours")
          .add(30, "minutes")
          .endOf("day")
          .toISOString();

        const feeds = await GetInventoryTasks(
          token.dataValues.token,
          feedType,
          startDate,
          endDate
        );
        // console.log("feeds", feeds);
        if (feeds && feeds.tasks && feeds.tasks.length > 0) {
          const feedTasks = feeds.tasks;

          if (!feedTasks || feedTasks.length === 0) {
            throw new Error("Error in fetching feed tasks");
          }

          let feedId;
          for (let i = 0; i < feedTasks.length; i++) {
            const feedCompletion = moment(feedTasks[i].completionDate);

            if (
              feedCompletion.isAfter(startDate) &&
              feedCompletion.isBefore(endDate)
            ) {
              feedId = feedTasks[i].taskId;
              break;
            }
          }
          // console.log("feedId", feedId);
          if (feedId) {
            const feedRequest = JSON.stringify({
              zipFileName: `${accountName}_inventory.zip`, // Default zip file name
              token: token.dataValues.token,
              zipKey: "downloads/",
              unzippedFolderKey: "unzipped/",
              taskId: feedId,
              apiUrl: "api.ebay.com",
              token: token.dataValues.token,
              bucketName: "sellerpundit-bucket-1",
            });

            const params = {
              FunctionName: "unzipper", // Replace with your Lambda function name
              Payload: feedRequest, // Pass input as a JSON string
            };

            await new Promise((resolve) => setTimeout(resolve, 10000));
            const result = await lambda.invoke(params).promise();
            // console.log("result", result);
            if (!result) {
              throw new Error("Error in extracting files");
            }

            let parsedPayload = null;
            try {
              let Payload = JSON.parse(result.Payload);

              parsedPayload = JSON.parse(Payload.body);
            } catch (error) {
              console.error("Error:", error);
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                error,
                "error"
              );
              throw error;
            }

            if (
              parsedPayload &&
              parsedPayload.extractedFiles &&
              parsedPayload?.extractedFiles?.length > 0
            ) {
              const extractedFiles = parsedPayload.extractedFiles;

              const xmlFileLink = extractedFiles[0];

              const xmlData = await ConvertXMLToJSON(xmlFileLink);

              if (!xmlData) {
                throw new Error("Error in converting XML to JSON");
              }

              if (
                xmlData &&
                xmlData?.BulkDataExchangeResponses &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails &&
                xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport
                  ?.SKUDetails?.length > 0
              ) {
                const itemIDs =
                  xmlData?.BulkDataExchangeResponses?.ActiveInventoryReport?.SKUDetails.map(
                    (item) => item.ItemID
                  );

                const existingItems = await csku.findAll({
                  where: {
                    accountName,
                    marketplaceId,
                    userId,
                    // channelId: {
                    //   [Op.in]: itemIDs
                    // }
                  },
                  attributes: ["channelId"],
                });

                const existingItemIDs = existingItems.map(
                  (item) => item.channelId
                );

                const nonActiveItems = itemIDs.filter(
                  (item) => !existingItemIDs.includes(item)
                );

                if (nonActiveItems && nonActiveItems.length > 0) {
                  await csku.update(
                    {
                      status: "completed",
                    },
                    {
                      where: {
                        channelId: nonActiveItems,
                      },
                    }
                  );
                }
                if (existingItemIDs && existingItemIDs.length > 0) {
                  await csku.update(
                    {
                      status: "live",
                    },
                    {
                      where: {
                        channelId: existingItemIDs,
                      },
                    }
                  );
                }

                return {
                  success: true,
                  message: "Items fetched successfully",
                };
              } else {
                throw new Error("Error in extracting files");
              }
            } else {
              console.error("Error:", parsedPayload);
              await apiCallLog(
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                "FetchEbayItemsFeed",
                {},
                {},
                { error: parsedPayload },
                "error"
              );
              return {
                success: false,
                message: "Error in extracting files",
              };
            }
          }
        } else {
          throw new Error("Error in fetching feed tasks");
        }
      } else {
        throw new Error("Error in generating feed file");
      }
    }
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "FetchItemStatus",
      "FetchItemStatus",
      "FetchItemStatus",
      {},
      {},
      error,
      "error"
    );
    throw error;
  }
};

exports.CheckItemEndReason = async (req, res) => {
  try {
    const { accountName, userId, marketplaceId } = req.body;
    if (!accountName || !userId || !marketplaceId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found",
      });
    }

    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        message: "Marketplace not found",
      });
    }

    await this.CheckItemEndReasonFunction(accountName, userId, marketplaceId);
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "CheckItemEndReason",
      "CheckItemEndReason",
      "CheckItemEndReason",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: error.message
        ? error.message
        : "Failed to check item end reason",
    });
  }
};

exports.CheckItemEndReasonFunction = async (
  accountName,
  userId,
  marketplaceId
) => {
  try {
    if (!accountName || !userId || marketplaceId) {
      throw new Error(
        "Required fields missing: accountName, userId, or marketplaceId"
      );
    }

    const query = `select * from tokens where "accountName" = ? and "userId" = ? and "marketPlaceId" = ?`;

    const results = await sequelize.query(
      query,
      {
        replacements: [accountName, userId, marketplaceId],
      },
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (results || results.length == 0) {
      throw new Error(
        "Token not found for the given accountName, userId, and marketplaceId."
      );
    }

    const marketplaceQuery = `select * from marketplaces where id = ?`;

    const marketplaceData = await sequelize.query(marketplaceQuery, {
      replacements: [marketplaceId],
    });

    if (!marketplaceData || marketplaceData.length == 0) {
      throw new Error("Marketplace not found.");
    }

    const endedListingQuery = `select "channelId" from cskus where "accountName" = ? and "userId" = ? and "marketplaceId" = ? and status in ('completed', 'ended', 'deleted')`;

    const endedListings = await sequelize.query(endedListingQuery, {
      replacements: [accountName, userId, marketplaceId],
    });
    if (!endedListings || endedListings.length == 0) {
      throw new Error(
        "No ended listings found for the given accountName, userId, and marketplaceId."
      );
    }

    if (marketplaceData[0].url.includes("ebay")) {
      const lastTokenRefreshDate = results[0].lastTokenRefreshDate;
      const today = moment().add(5, "hours").add(30, "minutes");
      const tokenExpiresDate = moment(lastTokenRefreshDate);

      const hoursDifference = today.diff(tokenExpiresDate, "hours");

      eBay.OAuth2.setCredentials(results[0].token);

      if (hoursDifference >= 2) {
        const token = await refreshToken(eBay, results[0]);
        eBay.OAuth2.setCredentials(token);
      }

      const finalResults = [];
      for (let i = 0; i < endedListings.length; i++) {
        const itemId = endedListings[i].channelId;

        try {
          const itemDetails = await GetItemEbay(eBay, itemId);

          if (
            itemDetails &&
            itemDetails.Item &&
            itemDetails.Item.ListingDetails &&
            itemDetails.Item.ListingDetails.EndingReason
          ) {
            const endReason = itemDetails.Item.ListingDetails.EndingReason;
            finalResults.push({
              itemId,
              endReason,
              error: "",
            });
          } else {
            finalResults.push({
              itemId,
              endReason: "No ending reason available",
              error: "",
            });
          }
        } catch (error) {
          console.error("Error fetching item details:", error);
          await apiCallLog(
            "CheckItemEndReason",
            "CheckItemEndReason",
            "CheckItemEndReason",
            { itemId },
            {},
            error,
            "error"
          );
          finalResults.push({
            itemId,
            endReason: "Error fetching item details",
            error: error.message,
          });
          continue;
        }
      }

      if (finalResults.length > 0) {
        const csvData = finalResults.map((item) => ({
          "Item ID": item.itemId,
          "Ending Reason": item.endReason,
          Error: item.error,
        }));
        const csvBuffer = await ConvertJSONToCSV(csvData, [
          "Item ID",
          "Ending Reason",
          "Error",
        ]);

        const mailOptions = {
          from: process.env.FROM_EMAIL,
          to: "akhlaq@mergekart.com",
          cc: "aditya@mergekart.com",
          subject: `Ebay Ended Listings Report for ${accountName} - ${new Date().toISOString()}`,
          text: "Please find the attached CSV file for the ended listings.",
          attachments: [
            {
              filename: "ended_listings_report.csv",
              content: csvBuffer,
              contentType: "text/csv",
            },
          ],
        };
        await sendUpdateReportEmail(mailOptions);

        return {
          success: true,
          message: "Ended listings report generated successfully.",
        };
      } else {
        return {
          success: true,
          message: "No data to report.",
        };
      }
    }
  } catch (err) {
    throw err;
  }
};

exports.FindSimilarProducts = async (req, res) => {
  try {
    const { productId, accountName, userId, marketplaceId } = req.body;

    if (!productId || !accountName || !userId || !marketplaceId) {
      throw new Error(
        "Required fields missing: productId, accountName, userId, or marketplaceId"
      );
    }

    const finalResult = await this.FindSimilarProductsFunction(
      productId,
      accountName,
      userId,
      marketplaceId
    );

    return res.status(200).json({
      success: true,
      message: "Similar products found successfully",
      data: finalResult || [],
    });
  } catch (err) {
    console.error("Error:🟢🟢", err);
    await apiCallLog(
      "FindSimilarProducts",
      "FindSimilarProducts",
      "FindSimilarProducts",
      {},
      {},
      err,
      "error"
    );
    res.status(500).json({
      success: false,
      message: err.message ? err.message : "Failed to find similar products",
    });
  }
};

exports.FindSimilarProductsFunction = async (
  productId,
  accountName,
  userId,
  marketplaceId
) => {
  try {
    if (!productId || !accountName || !userId || !marketplaceId) {
      throw new Error(
        "Required fields missing: productId, accountName, userId, or marketplaceId"
      );
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (
      !token ||
      !token.dataValues.token ||
      !token.dataValues.lastTokenRefreshDate
    ) {
      throw new Error("Token not found");
    }

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!marketPlace || !marketPlace.url) {
      throw new Error("Marketplace not found");
    }

    if (marketPlace.url.includes("ebay")) {
      const productQuery = `SELECT * FROM cskus WHERE "channelId" = ? AND "accountName" = ? AND "userId" = ? AND "marketplaceId" = ? limit 1`;

      const productDBRes = await sequelize.query(
        productQuery,
        {
          replacements: [productId, accountName, userId, marketplaceId],
        },
        { type: Sequelize.QueryTypes.SELECT }
      );

      const productDB = productDBRes[0] || []; // this is still array containing data of cskus

      if (!productDB || productDB.length === 0) {
        throw new Error("Product not found in the database");
      }

      const configuration = `select * from scraping_configs where account_name = ? and user_id = ? and marketplace_id = ? limit 1;`;

      const configRes = await sequelize.query(
        configuration,
        {
          replacements: [accountName, userId, marketplaceId],
        },
        { type: Sequelize.QueryTypes.SELECT }
      );

      const config = configRes[0] || [];

      if (!config || config.length === 0) {
        throw new Error(
          "Configuration not found for the given accountName, userId, and marketplaceId."
        );
      }

      const searchField = config[0].search_term_field || "title";
      // console.log("searchField", searchField);
      let scrapingResult = {};

      let queryData = productDB[0][searchField];

      let country = "";

      if (!queryData) {
        if (
          productDB[0].itemSpecifics &&
          productDB[0].itemSpecifics.length > 0 &&
          productDB[0].country
        ) {
          const itemSpecifics = productDB[0].itemSpecifics;
          const itemSpecificsMap = {};
          itemSpecifics.forEach((item) => {
            if (item.Name && item.Value) {
              itemSpecificsMap[item.Name] = item.Value;
            }
          });

          queryData = itemSpecificsMap[searchField] || "";
          country = productDB[0].country;

          const startDate = moment().add(5, "hours").add(30, "minutes");
          const tokenExpiresDate = moment(
            token.dataValues.lastTokenRefreshDate
          );
          eBay.OAuth2.setCredentials(token.dataValues.token);
          // console.log(startDate.diff(tokenExpiresDate, "hours"));
          if (startDate.diff(tokenExpiresDate, "hours") >= 2) {
            const access_token = await refreshToken(eBay, token);
            eBay.OAuth2.setCredentials(access_token);
          }
        } else {
          eBay.OAuth2.setCredentials(token.dataValues.token);

          const startDate = moment().add(5, "hours").add(30, "minutes");
          const tokenExpiresDate = moment(
            token.dataValues.lastTokenRefreshDate
          );
          // console.log(startDate.diff(tokenExpiresDate, "hours"));
          if (startDate.diff(tokenExpiresDate, "hours") >= 2) {
            const access_token = await refreshToken(eBay, token);
            eBay.OAuth2.setCredentials(access_token);
          }

          const eBayItem = await GetItemEbay(eBay, productId);

          country = eBayItem.Item.Country;

          if (
            eBayItem &&
            eBayItem.Item &&
            eBayItem.Item.ItemSpecifics &&
            eBayItem.Item.ItemSpecifics.NameValueList
          ) {
            const itemSpecifics = eBayItem.Item.ItemSpecifics.NameValueList;
            const itemSpecificsMap = {};

            itemSpecifics.forEach((item) => {
              if (item.Name && item.Value) {
                itemSpecificsMap[item.Name] = item.Value;
              }
            });
            // console.log("itemSpecificsMap", itemSpecificsMap);
            queryData = itemSpecificsMap[searchField] || "";

            await csku.update(
              {
                itemSpecifics: itemSpecifics,
                country: country,
              },
              {
                where: {
                  id: productDB[0].id,
                },
              }
            );
          }
        }
      }

      if (!queryData || queryData.toString().trim() === "") {
        throw new Error("No valid search field found for the product in db");
      }

      try {

        let extractedData = []
        for (i = 0; i < 2; i++) {

          let dataFound = false;
          let retryCount = 0;
          while (!dataFound && retryCount < 3) {
            try {
              ebayData = await eBay.buy.browse.search({
                q: queryData,
                limit: 100,
                offset: i * 100,
              });
              dataFound = true;

              if (ebayData && ebayData.itemSummaries && ebayData.itemSummaries.length > 0) {
                extractedData.push(...ebayData.itemSummaries);
                break; // Exit the loop if data is found
              }

            } catch (error) {
              retryCount++;
              console.error("Error fetching eBay data:", error);
            }
          }
        }

        if (!extractedData || extractedData.length === 0) {
          throw new Error("No data found for the given query");
        }

        // console.log({ similarProducts }, "This is similar product");

        // const findFinalSimilarList = similarProducts.filter(
        //   (product) =>
        //     product.productId &&
        //     product.title &&
        //     product.title.includes(queryData.replace(/[^a-zA-Z0-9]/g, ""))
        // );

        const findFinalSimilarList = extractedData.filter(
          (product) =>
            product.legacyItemId &&
            product.title &&
            (product.title.includes(queryData.toString()) || // Check title for exact match
              product.title
                .replace(/[^a-zA-Z0-9 ]/g, "")
                .toLowerCase()
                .includes(queryData.toString().replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase())) // Fallback
        );

        if (findFinalSimilarList.length === 0) {
          throw new Error("Data Not found, Please try again.");
        }

        const finalResult = [];
        for (var i = 0; i < findFinalSimilarList.length; i++) {
          const similarProduct = findFinalSimilarList[i].legacyItemId;

          if (!similarProduct) {
            console.error("No valid similar product found");
            continue;
          }

          let retries = 0;
          const maxRetries = 3;

          let eBayItem = {};
          while (retries < maxRetries) {
            try {
              eBayItem = await GetItemEbay(eBay, similarProduct);
              break; // Exit the loop if successful
            } catch (err) {
              console.log(err);
              retries++;
              continue;
            }
          }

          if (eBayItem && eBayItem.Item) {
            // console.log(
            //   eBayItem.Item.ShippingDetails.ShippingServiceOptions
            //     ?.ShippingServiceCost
            // );
            if (
              eBayItem.Item.ItemID != productId
            ) {
              const itemData = {
                asin: eBayItem.Item.ItemID,
                title: eBayItem.Item.Title,
                price: eBayItem.Item.SellingStatus.CurrentPrice.value,
                shippingCost:
                  eBayItem.Item.ShippingDetails &&
                    eBayItem.Item.ShippingDetails.ShippingServiceOptions
                    ? eBayItem.Item.ShippingDetails.ShippingServiceOptions
                      ?.ShippingServiceCost?.value
                    : 0,
                currency:
                  eBayItem.Item.SellingStatus.CurrentPrice._currencyId,
                variations: eBayItem.Item.Variations
                  ? eBayItem.Item.Variations.Variation
                  : [],
                variationCount: eBayItem.Item.Variations
                  ? eBayItem.Item.Variations.Variation.length
                  : 0,
                quantitySold: eBayItem.Item.SellingStatus.QuantitySold || 0,
                marketplaceId: marketplaceId,
                marketPlaceIcon: marketPlace.dataValues.logo || "",
                images:
                  eBayItem.Item.PictureDetails &&
                    eBayItem.Item.PictureDetails.PictureURL &&
                    Array.isArray(eBayItem.Item.PictureDetails.PictureURL)
                    ? eBayItem.Item.PictureDetails.PictureURL.slice(0, 5)
                    : [eBayItem.Item.PictureDetails.PictureURL],
                itemSpecifics:
                  eBayItem.Item.ItemSpecifics &&
                    eBayItem.Item.ItemSpecifics.NameValueList
                    ? eBayItem.Item.ItemSpecifics.NameValueList
                    : [],
                quantitySold:
                  Number(eBayItem.Item.SellingStatus.QuantitySold) || 0,

                brand:
                  eBayItem.Item.ItemSpecifics &&
                    eBayItem.Item.ItemSpecifics.NameValueList &&
                    Array.isArray(eBayItem.Item.ItemSpecifics.NameValueList)
                    ? eBayItem.Item.ItemSpecifics.NameValueList.find(
                      (item) => item.Name === "Brand"
                    )?.Value || ""
                    : "",
                itemlocation:
                  eBayItem.Item.Country,

                sellerId:
                  eBayItem.Item.Seller && eBayItem.Item.Seller.UserID
                    ? eBayItem.Item.Seller.UserID
                    : "",

                manufactureLocationAndRegion:
                  eBayItem.Item.ItemSpecifics &&
                    eBayItem.Item.ItemSpecifics.NameValueList &&
                    Array.isArray(eBayItem.Item.ItemSpecifics.NameValueList)
                    ? eBayItem.Item.ItemSpecifics.NameValueList.find(
                      (item) =>
                        item.Name === "Country/Region of Manufacture"
                    )?.Value || ""
                    : "",

                itemConditionCode: eBayItem.Item.ConditionID
                  ? eBayItem.Item.ConditionID
                  : null,
              };

              finalResult.push(itemData);

            }
          }
        }

        if (finalResult.length === 0)
          throw new Error("No data found for your product");

        await ScratchProducts.destroy({
          where: {
            sku: productId,
            marketplaceId: marketplaceId,
          },
        });

        await ScratchProducts.bulkCreate(
          finalResult.map((itm) => ({
            asin: itm.asin,
            sku: productId,
            title: itm.title,
            price: itm.price,
            shippingCost: itm.shippingCost,
            currency: itm.currency,
            variants: itm.variations || [],
            quantitySold: itm.quantitySold,
            marketplaceId: itm.marketplaceId,
            attributes: itm.itemSpecifics || [],
            images: itm.images ? itm.images : [],
            brand: itm.brand,
            itemlocation: itm.itemlocation,
            sellerid: itm.sellerId,
            manufacturelocationandregion: itm.manufactureLocationAndRegion,
            itemconditioncode: itm.itemConditionCode,
            user_id: userId,
          }))
        );

        const sortedResult = finalResult.sort((a, b) => {
          return a.price - b.price;
        });

        return sortedResult;
      } catch (error) {
        console.error("Error scraping similar products:", error);
        await apiCallLog(
          "FindSimilarProductsFunction",
          "FindSimilarProductsFunction",
          "FindSimilarProductsFunction",
          { productId, accountName, userId, marketplaceId },
          {},
          error,
          "error"
        );
        throw new Error(
          error.message || "Api failed while fetching, try again after 1 min."
        );
      }
    } else {
      throw new Error("Marketplace is not supported!");
    }
  } catch (err) {
    console.error("Error:", err);
    await apiCallLog(
      "FindSimilarProductsFunction",
      "FindSimilarProductsFunction",
      "FindSimilarProductsFunction",
      {},
      {},
      err,
      "error"
    );
    throw err;
  }
};

exports.GetSimilarProducts = async (req, res) => {
  try {
    const {
      productIds,
      accountName,
      userId,
      marketplaceId,
      quantitySoldMin,
      quantitySoldMax,
      sellerLocation,
      manufacturelocationandregion,
      itemconditioncode,
      brand,
    } = req.body;
    if (
      !productIds ||
      !Array.isArray(productIds) ||
      productIds.length === 0 ||
      !accountName ||
      !userId ||
      !marketplaceId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing: productIds, accountName, userId, or marketplaceId",
      });
    }

    const filters = {
      quantitySoldMin,
      quantitySoldMax,
      sellerLocation,
      manufacturelocationandregion,
      itemconditioncode,
      brand,
    };

    const similarProducts = await this.GetSimilarProductsFunction(
      productIds,
      accountName,
      userId,
      marketplaceId,
      filters
    );
    return res.status(200).json({
      success: true,
      message: "Similar products fetched successfully",
      data: similarProducts,
    });
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "GetSimilarProducts",
      "GetSimilarProducts",
      "GetSimilarProducts",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: error.message ? error.message : "Failed to get similar products",
    });
  }
};

// exports.GetSimilarProductsFunction = async (
//   productIds,
//   accountName,
//   userId,
//   marketplaceId
// ) => {
//   try {
//     if (
//       !productIds ||
//       !Array.isArray(productIds) ||
//       productIds.length === 0 ||
//       !accountName ||
//       !userId ||
//       !marketplaceId
//     ) {
//       throw new Error(
//         "Required fields missing: productIds, accountName, userId, or marketplaceId"
//       );
//     }

//     const marketplaceQuery = `SELECT * FROM marketplaces WHERE id = ?`;
//     const marketplace = await sequelize.query(marketplaceQuery, {
//       replacements: [marketplaceId],
//       type: Sequelize.QueryTypes.SELECT,
//     });

//     if (!marketplace || marketplace.length === 0) {
//       throw new Error("Marketplace not found for the given marketplaceId");
//     }

//     const similarProductsQuery = `SELECT * FROM "scratchProducts" WHERE "sku" IN (?)`;

//     const similarProducts = await sequelize.query(similarProductsQuery, {
//       replacements: [productIds, accountName, userId, marketplaceId],
//       type: Sequelize.QueryTypes.SELECT,
//     });

//     if (!similarProducts || similarProducts.length === 0) {
//       return [];
//     }

//     const finalResult = {};

//     const marketplaceLogo = marketplace[0].logo || "";

//     similarProducts.forEach((product) => {
//       if (!finalResult[product.sku]) {
//         finalResult[product.sku] = [
//           {
//             ...product,
//             marketplaceId: marketplaceId,
//             marketPlaceIcon: marketplaceLogo,
//           },
//         ];
//       } else if (finalResult[product.sku].length < 10) {
//         finalResult[product.sku].push({
//           ...product,
//           marketplaceId: marketplaceId,
//           marketPlaceIcon: marketplaceLogo,
//         });
//       }
//       // If length is already 10, we skip adding this product
//     });

//     return finalResult || [];
//   } catch (error) {
//     console.error("Error:", error);
//     await apiCallLog(
//       "GetSimilarProductsFunction",
//       "GetSimilarProductsFunction",
//       "GetSimilarProductsFunction",
//       { productIds, accountName, userId, marketplaceId },
//       {},
//       error,
//       "error"
//     );
//     throw new Error("Failed to get similar products");
//   }
// };

exports.GetSimilarProductsFunction = async (
  productIds,
  accountName,
  userId,
  marketplaceId,
  filters = {}
) => {
  try {
    if (
      !productIds ||
      !Array.isArray(productIds) ||
      productIds.length === 0 ||
      !accountName ||
      !userId ||
      !marketplaceId
    ) {
      throw new Error(
        "Required fields missing: productIds, accountName, userId, or marketplaceId"
      );
    }

    const marketplaceQuery = `SELECT * FROM marketplaces WHERE id = ?`;
    const marketplace = await sequelize.query(marketplaceQuery, {
      replacements: [marketplaceId],
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!marketplace || marketplace.length === 0) {
      throw new Error("Marketplace not found for the given marketplaceId");
    }

    // Build dynamic query with filters
    let similarProductsQuery = `SELECT * FROM "scratchProducts" WHERE "sku" IN (?)`;
    let replacements = [productIds];

    // Add quantity sold filters
    // ...existing code...
    if (
      filters.quantitySoldMin !== undefined &&
      filters.quantitySoldMin !== null
    ) {
      similarProductsQuery += ` AND CAST("quantitySold" AS INTEGER) >= ?`;
      replacements.push(filters.quantitySoldMin);
    }

    if (
      filters.quantitySoldMax !== undefined &&
      filters.quantitySoldMax !== null
    ) {
      similarProductsQuery += ` AND CAST("quantitySold" AS INTEGER) <= ?`;
      replacements.push(filters.quantitySoldMax);
    }
    // ...existing code...

    // Add seller location filter
    if (filters.sellerLocation && filters.sellerLocation.length > 0) {
      similarProductsQuery += ` AND "itemlocation" in (?)`;
      replacements.push(filters.sellerLocation);
    }

    // Add manufacture location and region filter
    if (
      filters.manufacturelocationandregion &&
      filters.manufacturelocationandregion.length > 0
    ) {
      similarProductsQuery += ` AND "manufacturelocationandregion" in (?)`;
      replacements.push(filters.manufacturelocationandregion);
    }

    // Add item condition code filter
    if (
      filters.itemconditioncode !== undefined &&
      filters.itemconditioncode !== null &&
      filters.itemconditioncode.length > 0
    ) {
      similarProductsQuery += ` AND "itemconditioncode" IN (?)`;
      replacements.push(filters.itemconditioncode);
    }

    // Add brand filter
    if (filters.brand && filters.brand.length > 0) {
      similarProductsQuery += ` AND LOWER("brand") SIMILAR TO LOWER(?)`;
      replacements.push(`%${filters.brand.join("|")}%`);
    }
    console.log("similarProductsQuery", similarProductsQuery);
    const similarProducts = await sequelize.query(similarProductsQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!similarProducts || similarProducts.length === 0) {
      return [];
    }

    const finalResult = {};
    const marketplaceLogo = marketplace[0].logo || "";

    similarProducts.forEach((product) => {
      if (!finalResult[product.sku]) {
        finalResult[product.sku] = [
          {
            ...product,
            marketplaceId: marketplaceId,
            marketPlaceIcon: marketplaceLogo,
          },
        ];
      } else if (finalResult[product.sku].length < 10) {
        finalResult[product.sku].push({
          ...product,
          marketplaceId: marketplaceId,
          marketPlaceIcon: marketplaceLogo,
        });
      }
      // If length is already 10, we skip adding this product
    });

    return finalResult || [];
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "GetSimilarProductsFunction",
      "GetSimilarProductsFunction",
      "GetSimilarProductsFunction",
      { productIds, accountName, userId, marketplaceId, filters },
      {},
      error,
      "error"
    );
    throw new Error("Failed to get similar products");
  }
};

exports.DeleteSimilarProducts = async (req, res) => {
  try {
    const { asin, accountName, userId, marketplaceId } = req.body;
    if (!asin || !accountName || !userId || !marketplaceId) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing: productId, accountName, userId, or marketplaceId",
      });
    }

    await ScratchProducts.destroy({
      where: {
        asin,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Similar products deleted successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    await apiCallLog(
      "DeleteSimilarProducts",
      "DeleteSimilarProducts",
      "DeleteSimilarProducts",
      {},
      {},
      error,
      "error"
    );
    return res.status(500).json({
      success: false,
      message: error.message
        ? error.message
        : "Failed to delete similar products",
    });
  }
};

exports.ExportSimilarProducts = async (req, res) => {
  try {
    const { accountName, userId, marketplaceId, filters } = req.query;

    if (!accountName || !userId || !marketplaceId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing: accountName, userId, or marketplaceId",
      });
    }

    let filtersObject = {};
    try {

      if (filters) {
        // Parse filters from query string
        const parsedFilters = JSON.parse(filters);
        console.log("Parsed Filters:", parsedFilters);

        // Validate filters structure if needed
        if (typeof parsedFilters !== 'object' || Array.isArray(parsedFilters)) {
          throw new Error("Invalid filters format");
        }

        filtersObject = parsedFilters;
      }

    } catch (error) {
      console.error("Error in parsing filters:", error);
      return res.status(400).json({
        success: false,
        message: "Invalid filters format",
      });
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName,
        marketPlaceId: marketplaceId,
      },
    });

    if (!token) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    // Proceed with exporting similar products

    const dbProductsQuery = `select "channelId", title, price from cskus where "accountName" = ? and "userId" = ? and "marketplaceId" = ? and "status" in ('live')`;

    const existingItemIDs = await sequelize.query(dbProductsQuery, {
      replacements: [accountName, userId, marketplaceId],
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!existingItemIDs || existingItemIDs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No live products found for the given accountName, userId, and marketplaceId.",
      });
    }

    const scratchProductsQuery = `
    SELECT *
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "sku" ORDER BY "price" ASC) as rn
      FROM "scratchProducts"
      WHERE "sku" IN (?) AND "marketplaceId" = ?
      {filters}
    ) sub
    WHERE rn <= 5;
  `;

    // Build dynamic filters for the scratch products query
    let filterConditions = [];
    let filterReplacements = [];

    if (filtersObject) {
      if (filtersObject?.itemconditioncode && filtersObject?.itemconditioncode?.length > 0) {
        filterConditions.push(` AND "itemconditioncode" IN (?)`);
        filterReplacements.push(filtersObject.itemconditioncode);
      }
  
      if (filtersObject?.quantitySoldMin !== undefined && filtersObject?.quantitySoldMin !== null) {
        filterConditions.push(` AND CAST("quantitySold" AS INTEGER) >= ?`);
        filterReplacements.push(filtersObject.quantitySoldMin);
      }
  
      if (filtersObject?.quantitySoldMax !== undefined && filtersObject?.quantitySoldMax !== null) {
        filterConditions.push(` AND CAST("quantitySold" AS INTEGER) <= ?`);
        filterReplacements.push(filtersObject.quantitySoldMax);
      }
  
      if (filtersObject?.sellerLocation && filtersObject?.sellerLocation?.length > 0) {
        filterConditions.push(` AND "itemlocation" IN (?)`);
        filterReplacements.push(filtersObject.sellerLocation);
      }
  
      if (filtersObject?.manufacturelocationandregion && filtersObject?.manufacturelocationandregion?.length > 0) {
        filterConditions.push(` AND "manufacturelocationandregion" IN (?)`);
        filterReplacements.push(filtersObject.manufacturelocationandregion);
      }
  
      if (filtersObject?.brand && filtersObject?.brand?.length > 0) {
        filterConditions.push(` AND LOWER("brand") SIMILAR TO LOWER(?)`);
        filterReplacements.push(`%${filtersObject.brand.join("|")}%`);
      }
  
      // Join all filter conditions
    }
    
    const filterConditionsString = filterConditions.join(" ");
    const scratchProductsQueryWithFilters = scratchProductsQuery.replace("{filters}", (filterConditionsString || ""));
    
    const scratchProducts = await sequelize.query(scratchProductsQueryWithFilters, {
      replacements: [existingItemIDs.map(item => item.channelId), marketplaceId, ...(filterReplacements || [])],
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!scratchProducts || scratchProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No similar products found for the given accountName, userId, and marketplaceId.",
      });
    }

    const finalResult = [];
    for (let i = 0; i < existingItemIDs.length; i++) {

      const object = {
        "Self Item ID": existingItemIDs[i].channelId,
        "Self Item Price": existingItemIDs[i].price || "",
        "Self Item Shipping Cost": existingItemIDs[i].shippingCost || "",
        "Self Item Total": parseFloat(existingItemIDs[i].price || 0) + parseFloat(existingItemIDs[i].shippingCost || 0),
        "Seller Name 1": "",
        "Seller Item ID 1": "",
        "Seller Item Price 1": "",
        "Seller Item Shipping Cost 1": "",
        "Seller Item Total 1": "",
        "Seller Name 2": "",
        "Seller Item ID 2": "",
        "Seller Item Price 2": "",
        "Seller Item Shipping Cost 2": "",
        "Seller Item Total 2": "",
        "Seller Name 3": "",
        "Seller Item ID 3": "",
        "Seller Item Price 3": "",
        "Seller Item Shipping Cost 3": "",
        "Seller Item Total 3": "",
        "Seller Name 4": "",
        "Seller Item ID 4": "",
        "Seller Item Price 4": "",
        "Seller Item Shipping Cost 4": "",
        "Seller Item Total 4": "",
        "Seller Name 5": "",
        "Seller Item ID 5": "",
        "Seller Item Price 5": "",
        "Seller Item Shipping Cost 5": "",
        "Seller Item Total 5": "",
      };

      const findScratchProducts = scratchProducts.filter(item => item.sku == existingItemIDs[i].channelId);

      if (findScratchProducts && findScratchProducts.length > 0) {
        for (let j = 0; j < findScratchProducts.length; j++) {
          const index = j + 1;
          object[`Seller Name ${index}`] = findScratchProducts[j].sellerid || "";
          object[`Seller Item ID ${index}`] = findScratchProducts[j].asin || "";
          object[`Seller Item Price ${index}`] = findScratchProducts[j].price || "";
          object[`Seller Item Shipping Cost ${index}`] = findScratchProducts[j].shippingCost || "";
          object[`Seller Item Total ${index}`] = parseFloat(findScratchProducts[j].price || 0) + parseFloat(findScratchProducts[j].shippingCost || 0);
        }

        finalResult.push(object);

      }


    }

    if (finalResult.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to export, please scrape similar products first.",
      });
    }

    const csvData = await ConvertJSONToCSV(finalResult, Object.keys(finalResult[0]));
    const csvBuffer = Buffer.from(csvData, 'utf8');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=similar_products_${accountName}_${userId}_${marketplaceId}.csv`);
    res.send(csvBuffer);

  } catch (error) {
    console.error("Error:", error);
  }
}