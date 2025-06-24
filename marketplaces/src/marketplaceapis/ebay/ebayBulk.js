const newRelic = require("newrelic");
const ebay = require("ebay-api");
const nodemailer = require("nodemailer");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const GeositeRepository = require("../../models/geosite");
const TokensRepository = require("../../models/tokens");
const UserRepository = require("../../models/user");
const CskuRepository = require("../../models/csku");
const Tokens = require("../../models/tokens");
const addToQueueInBatches = require("../../helper/addToQueueInBatches");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail");
const { uploadFileToS3 } = require("../../helper/uploadFileToS3");
const createExcelFromJSON = require("../../helper/createExcelFromJSON");
const { apiCallLog } = require("../../helper/apiCallLog")
const moment = require('moment');
const { bulkUpdateEbayPriceAndQuantity } = require("./catalogue");
const { update } = require("lodash");


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

async function getGeoSite(siteId) {
  return await GeositeRepository.findOne({
    where: { globalId: siteId },
    raw: true,
  });
}

async function initializeEbayAPI(siteId, token) {
  const geoSite = await getGeoSite(siteId);

  return new ebay({
    siteId: 0,
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
    autoRefreshToken: true,
  });
}

async function refreshToken(eBay, token) {
  try {
    console.log("Refreshing token", token);
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token?.refreshToken,
      scopes
    );

    if (JSON.parse(newToken).error) {
      token.status = "inactive";
      await token.save();

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

      const userData = await UserRepository.findOne({
        where: { id: token?.userId },
        raw: true,
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData?.email,
          subject: "Token Expired!",
          text: `Token for account name ${token?.accountName} associated with user ${userData?.email} has expired. Please login to your account and reauthorize the token.`,
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
    eBay.OAuth2.setCredentials(accessToken.access_token);
    token.token = accessToken.access_token;
    token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
    await token.save();
  } catch (error) {
    newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`);
    console.log(error);
    throw error;
  }
}
async function refreshTokenIfNeeded(
  eBay,
  token,
  marketPlaceId,
  userId,
  accountName
) {
  const functionName = "refreshTokenIfNeeded"
  let startdate = moment().add(5, 'hours').add(30, 'minutes');
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');
  console.log("hoursDifference", hoursDifference, tokenExpiresDate, startdate);
  if (hoursDifference >= 2) {
    console.log("Token expired, refreshing token");
    await refreshToken(eBay, token)
  } else {
    console.log("Token not expired");
    eBay.OAuth2.setCredentials(token?.token);
  }
  // try {
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token?.token,
  //     },
  //   });
  //   eBay.OAuth2.setCredentials(token?.token);
  //   await apiCallLog("GetTokenStatus","MarketPlaceApis",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //   await apiCallLog("GetTokenStatus","MarketPlaceApis",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
  // await refreshToken(eBay, token);
  //   const updatedToken = await TokensRepository.findOne({
  //     where: { userId, marketPlaceId, accountName },
  //     raw: true,
  //   });
  //   eBay.OAuth2.setCredentials(updatedToken?.token);
  // }
}

async function createOrUpdateEbayOffer(eBay, offerPayload, cskuExist, errors) {
  let offerId = cskuExist?.offerId || null;

  if (!offerId) {
    const skuOffers = await eBay.sell.inventory.getOffers({
      sku: offerPayload.sku,
    });

    const matchedOffer = skuOffers.offers?.find(
      (offer) => offer.listing?.listingId === cskuExist?.channelId
    );

    offerId = matchedOffer?.offerId ?? null;

    await updateCSKU(cskuExist?.id, { offerId: offerId });
  }

  // if (offerId) {
  //   await eBay.sell.inventory.updateOffer(offerId, {
  //     ...offerPayload,
  //   });

  // } else {
  //   try {
  //     const newOffer = await eBay.sell.inventory.createOffer(offerPayload);
  //     offerId = newOffer?.offerId;
  //   } catch (err) {
  //     errors.push({
  //       marketplaceId: cskuExist?.marketplaceId,
  //       account: cskuExist?.accountName,
  //       siteId: cskuExist?.siteId,
  //       error: "An error occurred while creating the offer.",
  //       details: err,
  //     });
  //     await updateCSKU(cskuExist?.id, {
  //       quantityUpdationStatus: "FAILED",
  //       quantityUpdateErrors: errors,
  //       quantityUpdateDate: currentDate,
  //     });
  //   }
  // }

  return offerId;
}

// Helper function to create offer payload
function createOfferPayload(product, translatedDescription, quantity) {
  return {
    sku: product?.isku.toString(),
    marketplaceId: product?.siteId,
    format: "FIXED_PRICE",
    listingDescription: translatedDescription,
    availableQuantity: Number(quantity),
    quantityLimitPerBuyer: Number(product?.quantityLimitPerBuyer),
    pricingSummary: {
      price: { currency: product?.currency, value: Number(product?.price) },
    },
    listingPolicies: {
      fulfillmentPolicyId:
        product?.sellerProfile?.SellerShippingProfile?.ShippingProfileID,
      paymentPolicyId:
        product?.sellerProfile?.SellerPaymentProfile?.PaymentProfileID,
      returnPolicyId:
        product?.sellerProfile?.SellerReturnProfile?.ReturnProfileID,
    },
    categoryId: product?.categoryId,
    merchantLocationKey: product?.merchantLocation,
    tax: {
      vatPercentage: 10.2,
      applyTax: true,
      thirdPartyTaxCategory: "Electronics",
    },
  };
}

async function translateText(eBay, text, language, translationContext) {
  if (!text || !translationContext) return "";

  const translationData = {
    from: "en",
    to: language,
    text: [text.replaceAll("&", "and")],
    translationContext,
  };

  try {
    const newLanguage = await eBay.commerce.translation.translate(
      translationData
    );
    return newLanguage.translations[0].translatedText;
  } catch (error) {
    console.error("An error occurred while translating text:", error);
    throw new Error("Translation failed");
  }
}

async function updateCSKU(cskuId, updates) {
  await CskuRepository.update(updates, { where: { id: cskuId } });
}

// Helper function to translate text if needed
async function translateTextIfNeeded(eBay, text, language, context) {
  return language === "en"
    ? text
    : await translateText(eBay, text, language, context);
}

exports.handleEbayListing = async (
  marketplace,
  product,
  token,
  description,
  quantity,
  bulkProducts
) => {
  const functionName = "handleEbayListing";
  if (!marketplace?.url?.includes("ebay")) return;

  const errors = [];

  const currentDate = new Date();
  currentDate.setHours(
    currentDate.getHours() + 5,
    currentDate.getMinutes() + 30
  );

  const tokenDetails = await Tokens.findByPk(token?.id);
  const eBay = await initializeEbayAPI(product?.siteId, tokenDetails);

  eBay.OAuth2.setCredentials(tokenDetails?.token);

  await refreshTokenIfNeeded(
    eBay,
    tokenDetails,
    product?.marketplaceId,
    product?.userId,
    product?.accountName
  );

  const geoSite = await getGeoSite(product?.siteId);
  const language = geoSite?.languageCode;

  const translatedDescription = await translateTextIfNeeded(
    eBay,
    description,
    language,
    "ITEM_DESCRIPTION"
  );

  try {
    const {
      id,
      channelId,
      isku,
      price,
      currency,
      marketplaceId,
      userId,
      accountName,
      threshhold,
    } = product

    let ebayItem = {};
    let errors = [];
    console.log("channelId", channelId);
    try {

      ebayItem = await eBay.trading.GetItem({
        ItemID: channelId
      });
      console.log("ebayItem", ebayItem);

    } catch (err) {
      errors = err.meta
    }

    console.log("ebayItem", ebayItem);

    if (ebayItem && ebayItem?.Item?.SellingStatus?.ListingStatus != "Completed" && ebayItem?.Item?.SellingStatus?.ListingStatus != "Ended") {
      bulkProducts.push({
        ...ebayItem.Item,
        productId: id,
        channelId: channelId,
        isku: isku,
        Quantity: quantity > 0 ? 1 : 0,
        currency: currency,
        Price: price,
        tokenId: tokenDetails?.id,
        marketplaceId: marketplaceId,
        userId,
        accountName: accountName,
        threshhold: threshhold,
        type: "ebay"
      });
    } else {
      errors.push({
        marketplaceId: marketplaceId,
        account: accountName,
        siteId: product?.siteId,
        error: "Offer ID not found",
      });
    }
  }

  // try {
  //   // Step 1: Attempt to get the item from eBay's inventory
  //   let productInEbay = await eBay.sell.inventory.getInventoryItem(
  //     product?.isku
  //   );

  //   if (!productInEbay) {
  //     // Step 2: If not found, use bulkMigrateListing
  //     await eBay.sell.inventory.bulkMigrateListing({
  //       requests: [{ listingId: product?.channelId }],
  //     });

  //     // Step 3: Try to get the item again
  //     productInEbay = await eBay.sell.inventory.getInventoryItem(product?.isku);

  //     if (!productInEbay) {
  //       // Step 4: If still not found, use ReviseItem
  //       try {
  //         await eBay.trading.ReviseItem({
  //           Item: {
  //             ItemID: product?.channelId,
  //             SKU: product?.isku,
  //           },
  //         });
  //         await apiCallLog("ReviseItem", "handleEbayListing-marketplaceapis", functionName, {
  //           Item: {
  //             ItemID: product?.channelId,
  //             SKU: product?.isku,
  //           },
  //         }, {}, {}, 'success');
  //       } catch (error) {
  //         await apiCallLog("ReviseItem", "handleEbayListing-marketplaceapis", functionName, {
  //           Item: {
  //             ItemID: product?.channelId,
  //             SKU: product?.isku,
  //           },
  //         }, {}, error.meta, 'error');
  //       }
  //       // Step 5: Use bulkMigrateListing again
  //       await eBay.sell.inventory.bulkMigrateListing({
  //         requests: [{ listingId: product?.channelId }],
  //       });

  //       // Step 6: Try to get the item again
  //       productInEbay = await eBay.sell.inventory.getInventoryItem(
  //         product?.isku
  //       );
  //     }
  //   }

  //   // Step 7: If found, add it to bulkProducts for bulk update with updatedQuantity, currency, and price
  //   if (productInEbay) {

  //   }
  catch (error) {
    console.error("An error occurred while updating the product:", error);
    errors.push({
      marketplaceId: product?.marketplaceId,
      account: product?.accountName,
      siteId: product?.siteId,
      error: error.message,
      details: error.stack, // Assuming finalError should be replaced with error.stack
    });

    await updateCSKU(product?.id, {
      quantiyUpdationStatus: "FAILED",
      quantityUpdateErrors: errors,
      quantityUpdateDate: currentDate,
    });
  }
};

exports.handleEbaybulkListing = async (values) => {
  // Access the data within Job.data
  const bulkProducts = values;
  console.log("In bulk update quantity and price");
  const errors = [];
  const retryProducts = [];
  const failedProducts = [];

  const currentDate = new Date();
  currentDate.setHours(
    currentDate.getHours() + 5,
    currentDate.getMinutes() + 30
  );

  const tokenDetails = await Tokens.findByPk(bulkProducts[0]?.tokenId);
  console.log("Token Details", tokenDetails);
  const eBay = new ebay({
    siteId: 0,
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
    autoRefreshToken: true,
  });
  console.log("Before token update")
  await refreshTokenIfNeeded(
    eBay,
    tokenDetails,
    bulkProducts[0].marketplaceId,
    bulkProducts[0]?.userId,
    bulkProducts[0]?.accountName
  );
  console.log("Before token update")

  try {
    let successCount = 0;
    let failedCount = 0;
    // Check if bulkProducts array is not empty
    const payload = {
      data: bulkProducts,
      token: tokenDetails.dataValues,
      failedProducts,
      successCount,
      failedCount
    };
    console.log(tokenDetails.dataValues, "Token Details", payload);
    const successProducts = [];
    const toBeUpdate = []
    try {
      // Perform the bulk update operation with the constructed payload
      const succesResult = await bulkUpdateEbayPriceAndQuantity(
        payload.data, payload.token, payload.failedProducts, payload.successCount, payload.failedCount
      );

      //NOTE - if success udate
      if (succesResult && succesResult?.failedProducts?.length > 0) {
        for (var i = 0; i < succesResult.failedProducts.length; i++) {
          const items = succesResult.failedProducts[i];
          if (items?.statusCode === 200) {
            //NOTE - get products based on sku
            const product = bulkProducts.find((itm) => itm.isku == items.isku);

            // await updateCSKU(product.productId, {
            //   quantiyUpdationStatus: "SUCCESS",
            //   quantityUpdateDate: currentDate,
            //   threshhold: 0
            // });

            toBeUpdate.push({
              id: product.productId,
              quantity: product?.Quantity?.toString(),
              quantiyUpdationStatus: "SUCCESS",
              quantityUpdateDate: currentDate,
              threshhold: 0
            })

            failedProducts.push({ ...product, status: "SUCCESS" });
          } else {
            //NOTE - get products based on offerId for retry
            const retryProduct = bulkProducts.find(
              (itm) => (itm.isku == items.isku) && itm.threshhold < 2
            );
            retryProducts.push({ ...retryProduct });

            //NOTE - get products with is failed
            const failedData = bulkProducts.find(
              (itm) =>
                (itm.channelId == items.channelId || itm.isku == items.isku) &&
                (itm.threshhold === 2 || itm.threshhold > 2)
            );
            if (failedData) {
              failedProducts.push({ ...failedData, status: "FAILED" });
            } else {
              console.log(`Failed product with channelId ${items.channelId} or SKU ${items.sku} not found or threshold exceeded`);
            }
          }
        }
      }
    } catch (uploadError) {

      if (uploadError?.meta?.responses) {
        for (const data of uploadError?.meta?.responses) {

          if (data?.statusCode === 400) {
            //NOTE - get products based on offerId for retry
            // const retryProducts = bulkProducts.find(
            //   (itm) => itm.offerId === data.offerId && itm.threshhold < 2
            // );
            // retryProducts.push({ ...retryProducts });

            //NOTE - get products with is failed
            const failedData = bulkProducts.find(
              (itm) =>
                itm.offerId === data.offerId 
              //&& (itm.threshhold === 2 || itm.threshhold > 2)
            );
            failedProducts.push({ ...failedData });

            // await updateCSKU(retryProducts.productId, {
            //   threshhold: retryProducts.threshhold + 1,
            // });

            toBeUpdate.push({
              id: retryProducts.productId,
              threshhold: retryProducts.threshhold + 1,
            });
          }
        }
      }
    }
    await CskuRepository.bulkCreate(toBeUpdate, { updateOnDuplicate: ['threshhold', "quantity", "quantiyUpdationStatus", "quantityUpdateDate"] });

    // if (retryProducts.length > 0) {
    //   const queueName = "bulkUpdateQueue";
    //   const batchSize = 25;

    //   await addToQueueInBatches(queueName, bulkProducts, batchSize)
    //     .then(() => console.log("Data added to queue successfully"))
    //     .catch((err) => console.error("Error adding data to queue:", err));
    // }
    const failedProductsDb = [];
    if (failedProducts.length > 0) {
      for (const data of failedProducts) {
        //NOTE - get products based on sku
        // await updateCSKU(data?.productId, {
        //   quantiyUpdationStatus: data.status,
        //   quantityUpdateErrors: data?.errors,
        //   quantityUpdateDate: currentDate,
        //   threshhold: 0
        // });
        failedProductsDb.push({
          id: data.productId,
          quantiyUpdationStatus: data.status,
          quantityUpdateErrors: data?.errors,
          quantityUpdateDate: currentDate,
          threshhold: 0
        });
      }
      await CskuRepository.bulkCreate(failedProductsDb, { updateOnDuplicate: ['quantiyUpdationStatus', "quantityUpdateErrors", "quantityUpdateDate", "threshhold"] });
      // Step 1: Generate Excel File from failedProducts
      const excelBuffer = await createExcelFromJSON(failedProducts, 'Failed Sheet');

      // Step 2: Upload the Excel File to S3
      const s3Response = await uploadFileToS3({
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: excelBuffer,
        originalname: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
        bucketName: process.env.S3_BUCKET_NAME, // Assuming S3_BUCKET_NAME is set in your environment variables
        folderName: 'failed-report'  // Specify the folder name here
      });

      const fileOptions = {
        recipients: 'akhlaqansarievdtechnology@gmail.com'
      };

      // Step 3: Send Email with the S3 File Link
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: fileOptions.recipients, // Multiple recipients passed in fileOptions
        subject: `Failed Ebay Quentity and price Update Report - ${currentDate}`,
        text: `Hello, please find the attached failed update report.`,
        attachments: [
          {
            filename: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
            path: s3Response.Location // S3 file location
          }
        ]
      };

      try {
        await sendUpdateReportEmail(mailOptions);
      } catch (err) {
        console.log(err);
        await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
      }
    }
  } catch (error) {
    console.log(error);
    newRelic.recordCustomEvent(
      `Error while bulk update quantity and price: ${error.message}`
    );
  }

  if (errors.length > 0) {
    // Handle the errors (e.g., log them, notify someone, etc.)
    console.error("Errors occurred during bulk listing update:", errors);
  }
};
