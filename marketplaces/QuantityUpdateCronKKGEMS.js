require("dotenv").config();
require("./src/database/config");
const { default: axios } = require("axios");
const csku = require("./src/models/csku");
const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
// const isku = require("../../models/isku");
const Tokens = require("./src/models/tokens");
const Marketplace = require("./src/models/marketplace");
const fs = require("fs");
const qs = require("qs");
const moment = require("moment");
const FormData = require("form-data");
// const stitchAndUploadImages = require("./stitch-images");
// const Catalogue = require("../../models/catalogue");
const { Op, Sequelize, fn, col } = require("sequelize");
const { apiCallLog } = require("./src/helper/apiCallLog");
const _ = require("lodash");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
const User = require("./src/models/user");

const ebayAuthToken = new EbayAuthToken({
  clientId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
  clientSecret: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
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

const eBay = new ebay({
  appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
  certId: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
  sandbox: false,
  autoRefreshToken: true,
  marketplaceId: "EBAY_US",
  devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
});

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

const refreshTokenEtsy = async (token) => {
  try {
    let refreshToken = token;
    const response = await axios.post(
      "https://api.etsy.com/v3/public/oauth/token",
      {
        grant_type: "refresh_token",
        client_id: "aromtbpn55c4qjlrimd52va5",
        client_secret: "kg32jv09vx",
        refresh_token: refreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Save the new token
    token = response.data.access_token;

    console.log("Token refreshed successfully.", token);
    return token;
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};

const GetEtsySoldOutListings = async () => {
  const dbToken = await Tokens.findOne({
    where: {
      userId: "f45ab936-014e-4ab1-a197-75c146199206",
      accountName: "kkgemsandjewels",
      marketPlaceId: "28",
    },
  });
  const token = dbToken?.dataValues?.refreshToken;
  let access_token = await refreshTokenEtsy(token);

  const shopId = "18723279";
  let offset = 0;
  let hasMoreListings = true;
  let pageNumber = 1;
  const limit = 100;
  let listings = [];

  while (hasMoreListings) {
    const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "x-api-key": "aromtbpn55c4qjlrimd52va5",
        },
        params: {
          limit,
          offset,
          state: "sold_out",
        },
      });

      const { results, count } = response.data;

      if (results && results.length > 0) {
        listings.push(...results);
        offset += results.length;
        pageNumber++;

        console.log(
          `Fetched ${results.length} listings from page ${pageNumber}. Total so far: ${offset}`
        );

        hasMoreListings = count > offset;
      } else {
        hasMoreListings = false;
        return listings;
      }
    } catch (error) {
      console.error(
        "Error fetching Etsy listings:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  hasMoreListings = true;
  offset = 0;

  while (hasMoreListings) {
    console.log("inside while loop");
    const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "x-api-key": "aromtbpn55c4qjlrimd52va5",
        },
        params: {
          limit,
          offset,
          state: "inactive",
        },
      });
      const { results, count } = response.data;

      if (results && results.length > 0) {
        listings.push(...results);
        offset += results.length;
        pageNumber++;

        console.log(
          `Fetched ${results.length} listings from page ${pageNumber}. Total so far: ${offset}`
        );

        hasMoreListings = count > offset;
      } else {
        hasMoreListings = false;
        return listings;
      }
    } catch (error) {
      console.error(
        "Error fetching Etsy listings:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  return listings;
};
const QuantityUpdateKKGems = async () => {
  const errorLogArray = [];

  try {
    let soldOutEtsyListings = await GetEtsySoldOutListings();
    const eBaySoldOutListings = await csku.findAll({
      where: {
        // channelId:"316328373943",
        quantity: "0",
        status: "OUT_OF_STOCK",
        marketplaceId: "7",
        userId: "f45ab936-014e-4ab1-a197-75c146199206",
        accountName: "kkgemsandjewelry",
        config_id: { [Op.ne]: null },
      },
    });
    console.log("Etsy Length >> ", soldOutEtsyListings.length);
    console.log("eBay Length >> ", eBaySoldOutListings.length);
    const nonMatchingIskus = [];

    eBaySoldOutListings.forEach((eBayItem) => {
      const found = soldOutEtsyListings.some((etsyItem) =>
        etsyItem.skus.includes(eBayItem.isku)
      );
      if (!found) {
        nonMatchingIskus.push(eBayItem);
      }
    });
    // nonMatchingIskus.push(...eBaySoldOutListings);
    const etsyChannelIds = [];

    for (const item of nonMatchingIskus) {
      const etsyItemDb = await csku.findOne({
        where: {
          isku: item.isku,
          accountName: "kkgemsandjewels",
          marketplaceId: "28",
          userId: "f45ab936-014e-4ab1-a197-75c146199206",
          // status: "live",
        },
      });

      if (etsyItemDb) {
        console.log(
          `Etsy Channel ID for ISKU ${item.isku}: ${etsyItemDb.channelId}`
        );
        etsyChannelIds.push(etsyItemDb.channelId);
      } else {
        console.log(`No Etsy Channel ID found for ISKU ${item.isku}`);
      }
    }

    console.log("Etsy Channel IDs:", etsyChannelIds.length);

    const dbToken = await Tokens.findOne({
      where: {
        userId: "f45ab936-014e-4ab1-a197-75c146199206",
        accountName: "kkgemsandjewels",
        marketPlaceId: "28",
      },
    });
    const token = dbToken?.dataValues?.refreshToken;
    let access_token = await refreshTokenEtsy(token);

    let etsyRestockItems = [];
    try {
      const listingIdBatches = chunkArray(etsyChannelIds, 100);
      for (const batch of listingIdBatches) {
        const response = await axios.get(
          `https://openapi.etsy.com/v3/application/listings/batch`,
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
              "x-api-key": "aromtbpn55c4qjlrimd52va5",
            },
            params: {
              listing_ids: batch,
              includes: ["Inventory"],
            },
          }
        );
        console.log("Etsy listings got successfully:", response.data.count);
        etsyRestockItems.push(...response.data.results);
      }
    } catch (error) {
      console.error(
        "Error updating Etsy listings:",
        error.response?.data || error.message
      );
      console.log(error);
      errorLogArray.push({
        channelId: null,
        SKU: null,
        Error: error.message,
      });
      await apiCallLog(
        "UpdateEtsyListings",
        "QuantityUpdateCronKKGEMS",
        "QuantityUpdateKKGems",
        { etsyChannelIds },
        {},
        error,
        "error"
      );
    }

    const eBay = new ebay({
      appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
      certId: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
      sandbox: false,
      autoRefreshToken: true,
      marketplaceId: "EBAY_US",
      devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
    });

    eBay.oAuth2.setCredentials(`
      v^1.1#i^1#r^0#f^0#p^3#I^3#t^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
      `);
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      "v^1.1#i^1#p^3#f^0#I^3#r^1#t^Ul4xMF82OkFBNjNFMDdGQ0EwRkQzODg0RjQ0OUU3ODA1NEY4OUJDXzFfMSNFXjI2MA==",
      scopes
    );

    eBay.oAuth2.setCredentials(JSON.parse(newToken).access_token);
    console.log(etsyRestockItems, "--------------------------------------etsyRestockItems");

    for (let i = 0; i < etsyRestockItems.length; i++) {
      const ebayChannelId = nonMatchingIskus.find(
        (item) => item.isku === etsyRestockItems[i].skus[0]
      );

      if (!ebayChannelId) {
        console.log(`No matching eBay channel ID found for SKU: ${etsyRestockItems[i].skus[0]}`);
        continue;
      }

      console.log("ebayChannelId > ", ebayChannelId.dataValues.channelId);
      try {
        const ebayItem = await eBay.trading.GetItem({
          ItemID: ebayChannelId.dataValues.channelId,
        });
        console.log("Variation > ", ebayItem?.Item?.Variations);
        const variation = ebayItem?.Item?.Variations;
        if (variation) {
          const transformedData = {
            InventoryStatus: variation?.Variation.map((item) => {
              return item.SKU
                ? {
                  ItemID: ebayChannelId.dataValues.channelId,
                  SKU: item.SKU,
                  Quantity: 1,
                }
                : {
                  ItemID: ebayChannelId.dataValues.channelId,
                  Quantity: 1,
                };
            }),
          };
          console.log("Data", transformedData);
          const batches = chunkArray(transformedData.InventoryStatus, 4);
          for (const batch of batches) {
            console.log("Batch", batch.length, batch);
            const requestBody = { InventoryStatus: batch };
            try {
              const res = await eBay.trading.ReviseInventoryStatus(requestBody);
              console.log(res);
              errorLogArray.push({
                channelId: ebayChannelId,
                SKU: null,
                Error: err.message,
              });
              await apiCallLog(
                "ReviseInventoryStatus",
                "QuantityUpdateCronKKGEMS",
                "QuantityUpdateKKGems",
                requestBody,
                res,
                {},
                "success"
              );
            } catch (err) {
              console.log(err.meta);
              errorLogArray.push({
                channelId: ebayChannelId,
                SKU: null,
                Error: err.message,
              });
              await apiCallLog(
                "ReviseInventoryStatus",
                "QuantityUpdateCronKKGEMS",
                "QuantityUpdateKKGems",
                requestBody,
                {},
                err,
                "error"
              );
              continue;
            }
          }
        } else {
          const request = {
            InventoryStatus: {
              ItemID: ebayChannelId.dataValues.channelId,
              SKU: ebayItem?.Item.SKU,
              Quantity: 1,
            },
          };
          try {
            const res = await eBay.trading.ReviseInventoryStatus(request);
            console.log(res);
            await apiCallLog(
              "ReviseInventoryStatus",
              "QuantityUpdateCronKKGEMS",
              "QuantityUpdateKKGems",
              request,
              res,
              {},
              "success"
            );
          } catch (err) {
            console.log(err.meta);
            errorLogArray.push({
              channelId: ebayChannelId,
              SKU: null,
              Error: err.message,
            });
            await apiCallLog(
              "ReviseInventoryStatus",
              "QuantityUpdateCronKKGEMS",
              "QuantityUpdateKKGems",
              request,
              {},
              err,
              "error"
            );
            continue;
          }
        }

        const eBayItemDb = await csku.findOne({
          where: {
            channelId: ebayChannelId.dataValues.channelId,
            marketplaceId: 7,
          },
        });

        eBayItemDb.quantity = 1;
        eBayItemDb.status = "live";
        await eBayItemDb.save();

        await apiCallLog(
          "ReviseInventoryStatus",
          "QuantityUpdateCronKKGEMS",
          "QuantityUpdateKKGems",
          { eBayItemDb },
          {},
          "success"
        );
      } catch (error) {
        console.error("Error fetching listing images:", error);
        errorLogArray.push({
          channelId: ebayChannelId,
          SKU: null,
          Error: error.message,
        });
        await apiCallLog(
          "ReviseInventoryStatus",
          "QuantityUpdateCronKKGEMS",
          "QuantityUpdateKKGems",
          { ebayChannelId },
          {},
          error,
          "error"
        );
      }
    }

    for (let i = 0; i < soldOutEtsyListings.length; i++) {
      console.log("etsy Length >> ", soldOutEtsyListings.length);
      const listing_id = soldOutEtsyListings[i];
      console.log(listing_id.listing_id);
      let eBayItemDb;
      if (listing_id?.skus[0]) {
        eBayItemDb = await csku.findOne({
          where: {
            isku: listing_id?.skus[0],
            quantity: { [Op.gt]: "0" },
            status: "live",
            marketplaceId: 7,
          },
        });
      } else {
        console.log("sku does not exist");
        errorLogArray.push({
          channelId: listing_id?.listing_id,
          SKU: listing_id?.skus[0],
          Error: "sku does not exist",
        });
        await apiCallLog(
          "ReviseInventoryStatus",
          "QuantityUpdateCronKKGEMS",
          "QuantityUpdateKKGems",
          { listing_id },
          {},
          "sku does not exist",
          "error"
        );
        continue;
      }
      if (eBayItemDb) {
        try {
          const ebayItem = await eBay.trading.GetItem({
            ItemID: eBayItemDb?.channelId,
          });
          console.log("Variation > ", ebayItem?.Item?.Variations);
          const variation = ebayItem?.Item?.Variations;
          if (variation) {
            const transformedData = {
              InventoryStatus: variation?.Variation.map((item) => {
                return item.SKU
                  ? {
                    ItemID: eBayItemDb.dataValues.channelId,
                    SKU: item.SKU,
                    Quantity: 0,
                  }
                  : {
                    ItemID: eBayItemDb.dataValues.channelId,
                    Quantity: 0,
                  };
              }),
            };
            console.log("Data", transformedData);
            const batches = chunkArray(transformedData.InventoryStatus, 4);
            for (const batch of batches) {
              console.log("Batch", batch.length, batch);
              const requestBody = { InventoryStatus: batch };
              try {
                const res = await eBay.trading.ReviseInventoryStatus(
                  requestBody
                );
                console.log(res);
                await apiCallLog(
                  "ReviseInventoryStatus",
                  "QuantityUpdateCronKKGEMS",
                  "QuantityUpdateKKGems",
                  requestBody,
                  res,
                  {},
                  "success"
                );
              } catch (err) {
                console.log(err.meta);
                errorLogArray.push({
                  channelId: eBayItemDb?.channelId,
                  SKU: null,
                  Error: err.message,
                });
                await apiCallLog(
                  "ReviseInventoryStatus",
                  "QuantityUpdateCronKKGEMS",
                  "QuantityUpdateKKGems",
                  requestBody,
                  {},
                  err,
                  "error"
                );
                continue;
              }
            }
          } else {
            const request = {
              InventoryStatus: {
                ItemID: eBayItemDb?.channelId,
                SKU: ebayItem?.Item.SKU,
                Quantity: 0,
              },
            };
            try {
              const res = await eBay.trading.ReviseInventoryStatus(request);
              console.log(res);
              await apiCallLog(
                "ReviseInventoryStatus",
                "QuantityUpdateCronKKGEMS",
                "QuantityUpdateKKGems",
                request,
                res,
                {},
                "success"
              );
            } catch (err) {
              console.log(err.meta);
              errorLogArray.push({
                channelId: eBayItemDb?.channelId,
                SKU: null,
                Error: err.message,
              });
              await apiCallLog(
                "ReviseInventoryStatus",
                "QuantityUpdateCronKKGEMS",
                "QuantityUpdateKKGems",
                request,
                {},
                err,
                "error"
              );
              continue;
            }
          }

          eBayItemDb.quantity = 0;
          eBayItemDb.status = "OUT_OF_STOCK";
          await eBayItemDb.save();

          await apiCallLog(
            "ReviseInventoryStatus",
            "QuantityUpdateCronKKGEMS",
            "QuantityUpdateKKGems",
            { eBayItemDb },
            {},
            "success"
          );
        } catch (error) {
          console.error("Error fetching listing images:", error);
          errorLogArray.push({
            channelId: eBayItemDb?.channelId,
            SKU: null,
            Error: error.message,
          });
          await apiCallLog(
            "ReviseInventoryStatus",
            "QuantityUpdateCronKKGEMS",
            "QuantityUpdateKKGems",
            { eBayItemDb },
            {},
            error,
            "error"
          );
        }
      } else {
        console.log(
          "Item already has zero quantity or Item is not yet listed..."
        );
        errorLogArray.push({
          channelId: listing_id?.listing_id,
          SKU: listing_id?.skus[0],
          Error: "Item already has zero quantity or Item is not yet listed...",
        });
        await apiCallLog(
          "ReviseInventoryStatus",
          "QuantityUpdateCronKKGEMS",
          "QuantityUpdateKKGems",
          { listing_id },
          {},
          "Item already has zero quantity or Item is not yet listed...",
          "error"
        );
      }
    }
  } catch (error) {
    console.log(error);
    errorLogArray.push({
      channelId: null,
      SKU: null,
      Error: error.message,
    });
    await apiCallLog(
      "QuantityUpdateKKGems",
      "QuantityUpdateCronKKGEMS",
      "QuantityUpdateKKGems",
      {},
      {},
      error,
      "error"
    );
  }

  try {
    const emailSubject = "KK Gems Quantity Update Error Log";
    await sendErrorLogEmail(errorLogArray, emailSubject);
  } catch (error) {
    console.log(error);
    errorLogArray.push({
      channelId: null,
      SKU: null,
      Error: error.message,
    });
    await apiCallLog(
      "sendErrorLogEmail",
      "QuantityUpdateCronKKGEMS",
      "QuantityUpdateKKGems",
      {},
      {},
      error,
      "error"
    );
  }
};

const priceUpdate = async () => {
  const errorLogArray = [];

  try {
    const ebayItem = await csku.findAll({
      where: {
        accountName: "kkgemsandjewelry",
        marketplaceId: "7",
        userId: "f45ab936-014e-4ab1-a197-75c146199206",
        status: "live",
        config_id: { [Op.ne]: null },
        id: "1186946"
      },
      // limit: 100,
    });

    console.log("ebay item length >> ", ebayItem.length);
    const batches = chunkArray(ebayItem, 50);

    for (const batch of batches) {
      for (const item of batch) {
        const itemDetails = await csku.findOne({
          where: {
            isku: item.isku,
            accountName: "kkgemsandjewels",
            marketplaceId: "28",
            userId: "f45ab936-014e-4ab1-a197-75c146199206",
            // status: "live",
          },
        });

        if (itemDetails) {
          const dbToken = await Tokens.findOne({
            where: {
              userId: "f45ab936-014e-4ab1-a197-75c146199206",
              accountName: "kkgemsandjewels",
              marketPlaceId: "28",
            }
          });
          const token = dbToken?.dataValues?.refreshToken;
          let access_token = await refreshTokenEtsy(token);
          const url = `https://openapi.etsy.com/v3/application/listings/${itemDetails?.channelId}/inventory`;

          try {
            const response = await axios.get(url, {
              headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
                "x-api-key": "aromtbpn55c4qjlrimd52va5",
              },
            });
            const inventoryData = response.data;
            const channelId = item.channelId;
            console.log("channelId >> ", channelId);

            eBay.oAuth2.setCredentials(
              `v^1.1#i^1#r^0#p^3#f^0#I^3#t^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`
            );
            const newToken = await ebayAuthToken.getAccessToken(
              "PRODUCTION",
              "v^1.1#i^1#p^3#f^0#I^3#r^1#t^Ul4xMF82OkFBNjNFMDdGQ0EwRkQzODg0RjQ0OUU3ODA1NEY4OUJDXzFfMSNFXjI2MA==",
              scopes
            );
            eBay.oAuth2.setCredentials(JSON.parse(newToken).access_token);

            try {
              const ebayItem = await eBay.trading.GetItem({
                ItemID: channelId,
                DetailLevel: "ReturnAll",
                IncludeItemSpecifics: true,
                IncludeItemCompatibilityList: true,
              });
              console.log(
                inventoryData.products.length,
                "Inventory Data length "
              );
              if (inventoryData.products.length > 1) {
                console.log("Multiple products found for this SKU");
                const etsyToEbayVariation = await EtsyToEbayVariation(
                  inventoryData?.products
                );
                console.log(
                  "Etsy to eBay Variation >> ",
                  JSON.stringify(etsyToEbayVariation)
                );

                const eBayVariations = ebayItem?.Item?.Variations;
                console.log(
                  "eBay Variations >> ",
                  JSON.stringify(eBayVariations)
                );
                if (!eBayVariations) {
                  console.log("eBay Variations are not found");
                  errorLogArray.push({
                    channelId,
                    Error:
                      "eBay Variations are not found, Creating new Product on eBay",
                  });
                  const ebayDeleteItem = await eBay.trading.EndItem({
                    ItemID: channelId,
                    EndingReason: "NotAvailable",
                  });
                  console.log("ebayDeleteItem >> ", ebayDeleteItem);
                  await apiCallLog(
                    "deleteItem",
                    "deleteItem",
                    "priceUpdate",
                    { ItemID: channelId, EndingReason: "NotAvailable" },
                    {},
                    {},
                    "success"
                  );

                  const variationNames =
                    etsyToEbayVariation?.VariationSpecificsSet?.NameValueList.map(
                      (data) => data.Name.toLowerCase()
                    );
                  const newRequest = {
                    Item: {
                      Title: ebayItem?.Item?.Title,
                      Description: ebayItem?.Item?.Description,
                      PrimaryCategory: {
                        CategoryID: ebayItem?.Item?.PrimaryCategory.CategoryID,
                        CategoryName:
                          ebayItem?.Item?.PrimaryCategory.CategoryName,
                      },
                      ConditionID: ebayItem?.Item?.ConditionID,
                      Country: ebayItem?.Item?.Country,
                      Currency: ebayItem?.Item?.Currency,
                      PostalCode: ebayItem?.Item?.PostalCode,
                      PictureDetails: ebayItem?.Item?.PictureDetails,
                      Site: ebayItem?.Item?.Site,
                      SKU: ebayItem?.Item?.SKU,
                      Variations: etsyToEbayVariation,
                      VideoDetails: ebayItem?.Item?.VideoDetails,
                      Storefront: ebayItem?.Item?.Storefront,
                      ListingDuration: "GTC",
                      ListingType: "FixedPriceItem",
                      SellerProfiles: ebayItem?.Item?.SellerProfiles,
                      Location: ebayItem?.Item?.Location,
                      BestOfferDetails: {
                        BestOfferEnabled: false,
                      },
                      ItemSpecifics: {
                        NameValueList:
                          ebayItem?.Item?.ItemSpecifics?.NameValueList?.filter(
                            (specific) =>
                              !variationNames?.includes(
                                specific.Name.toLowerCase()
                              )
                          ),
                      },
                    },
                  };
                  console.log("newRequest >> ", JSON.stringify(newRequest));
                  try {
                    const createNewVariation = await eBay.trading.AddItem(
                      newRequest
                    );
                    console.log(
                      `Variation created for channelId ${channelId} and SKU ${ebayItem.Item.SKU}:`,
                      createNewVariation
                    );
                    if (createNewVariation.ItemID) {
                      await csku.update(
                        { channelId: createNewVariation.ItemID },
                        {
                          where: {
                            channelId: channelId,
                            marketplaceId: 7,
                          },
                        }
                      );
                    }
                    await apiCallLog(
                      "AddItem",
                      "AddItem",
                      "priceUpdate",
                      newRequest,
                      createNewVariation,
                      {},
                      "success"
                    );
                  } catch (error) {
                    console.log(error.meta);
                    errorLogArray.push({
                      channelId,
                      Error: error.message,
                    });
                    if (error.meta?.ItemID) {
                      await csku.update(
                        { channelId: error.meta.ItemID },
                        {
                          where: {
                            channelId: channelId,
                            marketplaceId: 7,
                          },
                        }
                      );
                    }
                    await apiCallLog(
                      "deleteItem",
                      "newVariation",
                      "priceUpdate",
                      {},
                      {},
                      error,
                      "error"
                    );
                  }
                  continue;
                }
                eBayVariations?.Variation.map((itm) => {
                  itm.StartPrice = itm.StartPrice.value.toString().includes(".")
                    ? itm.StartPrice.value.toString()
                    : itm.StartPrice.value.toString().concat(".00");
                  itm.Quantity = itm.Quantity.toString();
                  itm.VariationSpecifics.NameValueList = Array.isArray(
                    itm.VariationSpecifics.NameValueList
                  )
                    ? itm.VariationSpecifics.NameValueList
                    : [itm.VariationSpecifics.NameValueList];
                  delete itm.SellingStatus;
                  return itm;
                });
                eBayVariations.VariationSpecificsSet.NameValueList =
                  Array.isArray(
                    eBayVariations.VariationSpecificsSet.NameValueList
                  )
                    ? eBayVariations.VariationSpecificsSet.NameValueList
                    : [eBayVariations.VariationSpecificsSet.NameValueList];
                console.log(
                  "eBay Variations >> ",
                  JSON.stringify(eBayVariations)
                );

                // ebayVariaitions.write(JSON.stringify(eBayVariations, null, 2));
                // etsyToebayVariations.write(
                //   JSON.stringify(etsyToEbayVariation, null, 2)
                // );

                const isMatching = await compareVariations(
                  eBayVariations,
                  etsyToEbayVariation
                );
                console.log("Is Matching >> ", isMatching);

                if (isMatching) {
                  console.log("Variations specifics are matching");

                  const nonMatchingVariations = await findNonMatchingVariations(
                    eBayVariations,
                    etsyToEbayVariation
                  );
                  console.log(
                    "Non Matching Variations >> ",
                    nonMatchingVariations
                  );

                  if (nonMatchingVariations.length == 0) {
                    for (
                      let i = 0;
                      i < etsyToEbayVariation.Variation.length;
                      i++
                    ) {
                      const product = etsyToEbayVariation.Variation[i];
                      const variation = eBayVariations.Variation.find((itm) =>
                        _.isEqual(
                          itm.VariationSpecifics.NameValueList,
                          product.VariationSpecifics.NameValueList
                        )
                      );

                      console.log("variation >> ", JSON.stringify(variation));
                      console.log("Product >> ", JSON.stringify(product));

                      if (variation) {
                        console.log("variation >> ", variation);
                        console.log("Product >> ", product);

                        console.log("Start Price >> ", product.StartPrice);
                        console.log("Etsy Price >> ", variation.StartPrice);

                        if (
                          Number(variation.StartPrice) !==
                          Number(product.StartPrice)
                        ) {
                          const request = {
                            InventoryStatus: {
                              ItemID: channelId,
                              SKU: variation.SKU,
                              StartPrice: product.StartPrice,
                            },
                          };

                          try {
                            const res =
                              await eBay.trading.ReviseInventoryStatus(request);
                            console.log(
                              `Price updated for SKU ${variation.SKU}:`,
                              res
                            );
                            await apiCallLog(
                              "ReviseInventoryStatus",
                              "ReviseInventoryStatus",
                              "priceUpdate",
                              request,
                              res,
                              {},
                              "success"
                            );
                          } catch (error) {
                            console.log(error.meta);
                            console.error(
                              `Error updating price for SKU ${variation.SKU}:`,
                              error.response?.data || error.message
                            );
                            errorLogArray.push({
                              channelId,
                              SKU: variation.SKU,
                              Error: error.message,
                            });
                            await apiCallLog(
                              "ReviseInventoryStatus",
                              "ReviseInventoryStatus",
                              "priceUpdate",
                              request,
                              {},
                              error,
                              "error"
                            );
                          }
                        } else {
                          console.log(
                            `Price matches for SKU ${variation.SKU}, skipping update.`
                          );
                          await apiCallLog(
                            "ReviseInventoryStatus",
                            "ReviseInventoryStatus",
                            "priceUpdate",
                            `Price Matches for SKU ${variation.SKU}, skipping update.`,
                            product,
                            {},
                            "success"
                          );
                          continue;
                        }
                      } else {
                        console.log(
                          `Non matching variations found for SKU ${channelId}`
                        );
                        const request = {
                          Item: {
                            ItemID: channelId,
                            Variations: {
                              VariationSpecificsSet:
                                eBayVariations.VariationSpecificsSet,
                              Variation: nonMatchingVariations,
                            },
                          },
                        };
                        console.log("Request >> ", JSON.stringify(request));
                        try {
                          const updatingVariation =
                            await eBay.trading.ReviseFixedPriceItem(request);
                          console.log(
                            `Variation deleted for SKU ${channelId}:`,
                            updatingVariation
                          );
                          await apiCallLog(
                            "ReviseFixedPriceItem",
                            "ReviseFixedPriceItem",
                            "priceUpdate",
                            request,
                            deleteVariation,
                            {},
                            "success"
                          );
                        } catch (error) {
                          console.log(error.meta);
                          console.error(
                            `Error deleting variation for SKU ${channelId}:`,
                            error.response?.data || error.message
                          );
                          errorLogArray.push({
                            channelId,
                            SKU: null,
                            Error: error.message,
                          });
                          await apiCallLog(
                            "ReviseFixedPriceItem",
                            "ReviseFixedPriceItem",
                            "priceUpdate",
                            request,
                            {},
                            error,
                            "error"
                          );
                        }
                      }
                    }
                  } else if (nonMatchingVariations.length > 0) {
                    console.log(
                      `Non matching variations found for SKU ${channelId}`
                    );
                    const request = {
                      Item: {
                        ItemID: channelId,
                        Variations: {
                          VariationSpecificsSet:
                            eBayVariations.VariationSpecificsSet,
                          Variation: nonMatchingVariations,
                        },
                      },
                    };
                    console.log("Request >> ", JSON.stringify(request));
                    try {
                      const updatingVariation =
                        await eBay.trading.ReviseFixedPriceItem(request);
                      console.log(
                        `Variation deleted for SKU ${channelId}:`,
                        updatingVariation
                      );
                      await apiCallLog(
                        "ReviseFixedPriceItem",
                        "ReviseFixedPriceItem",
                        "priceUpdate",
                        request,
                        deleteVariation,
                        {},
                        "success"
                      );
                    } catch (error) {
                      console.log(error.meta);
                      console.error(
                        `Error deleting variation for SKU ${channelId}:`,
                        error.response?.data || error.message
                      );
                      errorLogArray.push({
                        channelId,
                        SKU: null,
                        Error: error.message,
                      });
                      await apiCallLog(
                        "ReviseFixedPriceItem",
                        "ReviseFixedPriceItem",
                        "priceUpdate",
                        request,
                        {},
                        error,
                        "error"
                      );
                    }
                  }
                } else {
                  console.log("Variations specifics are not matching");
                  delete eBayVariations.VariationSpecificsSet;
                  eBayVariations.Variation = eBayVariations.Variation.map(
                    (variation) => {
                      return {
                        ...variation,
                        Delete: true,
                      };
                    }
                  );
                  eBayVariations.Variation.push(
                    ...etsyToEbayVariation.Variation
                  );

                  eBayVariations.VariationSpecificsSet =
                    etsyToEbayVariation.VariationSpecificsSet;

                  const request = {
                    Item: {
                      ItemID: channelId,
                      Variations: eBayVariations,
                    },
                  };
                  console.log("Request >> ", JSON.stringify(request));
                  try {
                    const updatingVariation =
                      await eBay.trading.ReviseFixedPriceItem(request);
                    console.log(
                      `Variation updated for SKU ${channelId}:`,
                      updatingVariation
                    );
                    await apiCallLog(
                      "ReviseFixedPriceItem",
                      "ReviseFixedPriceItem",
                      "priceUpdate",
                      request,
                      updatingVariation,
                      {},
                      "success"
                    );
                  } catch (error) {
                    console.log(error.meta);
                    console.error(
                      `Error updating variation for SKU ${channelId}:`,
                      error.response?.data || error.message
                    );
                    errorLogArray.push({
                      channelId,
                      SKU: null,
                      Error: error.message,
                    });
                    await apiCallLog(
                      "ReviseFixedPriceItem",
                      "ReviseFixedPriceItem",
                      "priceUpdate",
                      request,
                      {},
                      error,
                      "error"
                    );
                  }
                }
              } else {
                const product = inventoryData.products[0];
                const startPrice = ebayItem.Item.StartPrice.value;
                const etsyPrice = product.offerings[0].price.amount / 100;

                console.log("Start Price >> ", startPrice);
                console.log("Etsy Price >> ", etsyPrice);

                if (startPrice !== etsyPrice) {
                  const request = {
                    InventoryStatus: {
                      ItemID: channelId,
                      StartPrice: etsyPrice,
                    },
                  };
                  console.log("Request >> ", request);
                  try {
                    const res = await eBay.trading.ReviseInventoryStatus(
                      request
                    );
                    console.log(`Price updated for ItemID ${channelId}:`, res);

                    await apiCallLog(
                      "ReviseInventoryStatus",
                      "ReviseInventoryStatus",
                      "priceUpdate",
                      request,
                      res,
                      {},
                      "success"
                    );
                  } catch (error) {
                    console.log(error.meta);
                    console.error(
                      `Error updating price for ItemID ${channelId}:`,
                      error.response?.data || error.message
                    );
                    errorLogArray.push({
                      channelId,
                      SKU: ebayItem?.SKU,
                      Error: error.message,
                    });
                    await apiCallLog(
                      "ReviseInventoryStatus",
                      "ReviseInventoryStatus",
                      "priceUpdate",
                      request,
                      {},
                      error,
                      "error"
                    );
                    continue;
                  }
                }
              }
            } catch (error) {
              console.error(
                `Error fetching eBay item for channelId ${channelId}:`,
                error.response?.data || error.message
              );
              console.log(error);
              errorLogArray.push({
                channelId,
                SKU: null,
                Error: error.message,
              });
              await apiCallLog(
                "GetItem",
                "GetItem",
                "priceUpdate",
                { ItemID: channelId },
                {},
                error,
                "error"
              );
              continue;
            }
          } catch (error) {
            console.error(
              `Error fetching inventory for channelId ${itemDetails.channelId}:`,
              error.response?.data || error.message
            );
            console.log(error);
            errorLogArray.push({
              channelId: itemDetails.channelId,
              SKU: null,
              Error: error.message,
            });
            await apiCallLog(
              "GetInventory",
              "GetInventory",
              "priceUpdate",
              { url },
              {},
              error,
              "error"
            );
            continue;
          }
        } else {
          console.log(`Item with isku ${item.isku} not found`);
          errorLogArray.push({
            channelId: null,
            SKU: item.isku,
            Error: "Item not found",
          });
          await apiCallLog(
            "FindItem",
            "FindItem",
            "priceUpdate",
            { isku: item.isku },
            {},
            "Item not found",
            "error"
          );
          continue;
        }
      }
    }
  } catch (error) {
    console.log(error);
    errorLogArray.push({ channelId: null, SKU: null, Error: error.message });
    await apiCallLog(
      "priceUpdate",
      "priceUpdate",
      "priceUpdate",
      {},
      {},
      error,
      "error"
    );
  }
  try {
    const emailSubject = "KK Gems Price Update Error Log";
    await sendErrorLogEmail(errorLogArray, emailSubject);
  } catch (error) {
    console.log(error);
    errorLogArray.push({ channelId: null, SKU: null, Error: error.message });
    await apiCallLog(
      "priceUpdate",
      "priceUpdate",
      "priceUpdate",
      {},
      {},
      error,
      "error"
    );
  }
};

const EtsyToEbayVariation = async (etsyVariationData) => {
  const variationData = {
    VariationSpecificsSet: { NameValueList: [] },
    Variation: [],
  };

  etsyVariationData?.forEach((product) => {
    product?.property_values?.forEach((property) => {
      // Sanitize property_name and property values
      let propertyName = property?.property_name;
      if (propertyName.includes("&quot;") || propertyName.includes("&amp;")) {
        propertyName = propertyName
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");
      }

      const existingProperty =
        variationData.VariationSpecificsSet.NameValueList.find(
          (item) => item.Name === propertyName
        );

      if (!existingProperty) {
        const sanitizedValues = [
          ...new Set(
            etsyVariationData
              .map((p) => {
                const prop = p?.property_values?.find(
                  (prop) => prop.property_name === property?.property_name
                );
                let value = prop?.values;

                // Sanitize values
                if (value && Array.isArray(value)) {
                  value = value.map((optionValue) => {
                    if (
                      optionValue.includes("&quot;") ||
                      optionValue.includes("&amp;")
                    ) {
                      optionValue = optionValue
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, "&");
                    }
                    return isIntegerString(optionValue)
                      ? Number(optionValue)
                      : optionValue;
                  });
                }

                return value;
              })
              .flat()
          ),
        ];

        variationData.VariationSpecificsSet?.NameValueList.push({
          Name: propertyName,
          Value: sanitizedValues,
        });
      }
    });
  });

  etsyVariationData?.forEach((product, index) => {
    const variantOffering = product?.offerings?.[0];
    const obj = {
      SKU: `${product.sku}_${product.product_id}`,
      StartPrice: (
        variantOffering?.price?.amount / variantOffering?.price?.divisor
      ).toFixed(2),
      Quantity: variantOffering?.quantity,
      VariationSpecifics: {
        NameValueList: [],
      },
    };

    product?.property_values?.forEach((property) => {
      let propertyName = property?.property_name;
      let propertyValue = property?.values?.[0];

      // Sanitize property name and value
      if (propertyName.includes("&quot;") || propertyName.includes("&amp;")) {
        propertyName = propertyName
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");
      }

      if (propertyValue.includes("&quot;") || propertyValue.includes("&amp;")) {
        propertyValue = propertyValue
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");
      }

      obj.VariationSpecifics.NameValueList.push({
        Name: propertyName,
        Value: isIntegerString(propertyValue)
          ? Number(propertyValue)
          : propertyValue,
      });
    });

    variationData?.Variation.push(obj);
  });
  return variationData;
};

function isIntegerString(str) {
  return Number.isInteger(Number(str));
}

const compareVariations = async (ebayVariation, etsyVariation) => {
  const ebayNameValueList = ebayVariation.VariationSpecificsSet.NameValueList;
  const etsyNameValueList = etsyVariation.VariationSpecificsSet.NameValueList;

  let flag = true;

  for (let etsyItem of etsyNameValueList) {
    const matchingEbayItem = ebayNameValueList.find(
      (ebayItem) => ebayItem.Name === etsyItem.Name
    );

    if (!matchingEbayItem) {
      flag = false;
      break;
    }

    // Check if every value in etsyItem.Value is included in matchingEbayItem.Value
    if (
      !etsyItem.Value.every((value) => matchingEbayItem.Value.includes(value))
    ) {
      flag = false;
      break;
    }
  }

  return flag;
};

const findNonMatchingVariations = async (ebayVariation, etsyVariation) => {
  const ebayVariations = ebayVariation.Variation;

  const etsyVariations = etsyVariation.Variation;

  const nonMatchingVariations = [];

  for (let etsyVar of etsyVariations) {
    const etsyNameValueList = etsyVar.VariationSpecifics.NameValueList;

    let isMatching = false;

    for (let ebayVar of ebayVariations) {
      const ebayNameValueList = ebayVar.VariationSpecifics.NameValueList;

      isMatching = etsyNameValueList.every((etsyItem) => {
        const matchingEbayItem = ebayNameValueList.find(
          (ebayItem) => ebayItem.Name === etsyItem.Name
        );

        // Ensure etsyItem.Value is an array
        const etsyValues = Array.isArray(etsyItem.Value)
          ? etsyItem.Value
          : [etsyItem.Value];

        // Ensure matchingEbayItem.Value is an array
        const ebayValues = Array.isArray(matchingEbayItem?.Value)
          ? matchingEbayItem.Value
          : [matchingEbayItem?.Value];

        const result =
          matchingEbayItem &&
          etsyValues.every((value) => ebayValues.includes(value));

        return result;
      });

      if (isMatching) break;
    }

    if (!isMatching) {
      etsyVar.Delete = true;

      nonMatchingVariations.push(etsyVar);
    }
  }

  return nonMatchingVariations;
};

const sendErrorLogEmail = async (errorLogArray, emailSubject) => {
  const workbook = new ExcelJS.Workbook();
  const sanitizedDate = new Date().toISOString().replace(/[*?:\\/[\]]/g, "-");
  const worksheet = workbook.addWorksheet(`${emailSubject} - ${sanitizedDate}`);

  worksheet.columns = [
    { header: "Channel ID", key: "channelId", width: 40 },
    { header: "SKU", key: "SKU", width: 40 },
    { header: "Error", key: "Error", width: 100 },
  ];

  errorLogArray.forEach((log) => {
    worksheet.addRow(log);
  });

  const buffer = await workbook.xlsx.writeBuffer();

  // Create a transporter
  let transporter = nodemailer.createTransport({
    host: "smtp.mailer91.com", // Replace with your SMTP host
    port: "587",
    secure: false, // true for 465, false for other ports
    auth: {
      user: "emailer@alert.sellerpundit.com", // Replace with your SMTP username
      pass: "8kfgEKb4GlPMMOl8", // Replace with your SMTP password
    },
  });

  const userData = await User.findOne({
    where: { id: "f45ab936-014e-4ab1-a197-75c146199206" },
  });

  if (userData) {
    // Set up email data
    console.log("Sending email to:", userData.dataValues.email);
    let mailOptions = {
      from: "No-reply@alert.sellerpundit.com", // Replace with your email
      to: userData.dataValues.email, // Replace with the receiver's email
      cc: "akhlaqansarievdtechnology@gmail.com, pratik@mergekart.com",
      // to:"pratik@mergekart.com",
      subject: emailSubject,
      text: `Error Logs for KK Gems & Jewels (eBay) associated with user kamleshkumarnatani@gmail.com . Please review and share feedback.`,
      attachments: [
        {
          filename: "ErrorLog-KKGems.xlsx",
          content: buffer,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
      }
      console.log("Message sent: %s", info.messageId);
    });
  }
};

const token =
  "180420697.wmz7jLoJ8vXfm_CnMZzogPhJX8wb_7HgFJnzV2KG7M8kcOGgLW_HK6EGH-xpd2eIlnu2lbcLN7ikO_wLIp8e6rF6n8";
module.exports = { QuantityUpdateKKGems, priceUpdate };
