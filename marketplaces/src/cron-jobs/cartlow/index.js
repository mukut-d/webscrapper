const newRelic = require("newrelic");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const Marketplace = require("../../models/marketplace");
const Csku = require("../../models/csku");
const Tokens = require("../../models/tokens");
const Isku = require("../../models/isku");
const FileStorages = require("../../models/fileStorages");
const convertPriceByFormula = require("../../helper/convertPriceByFormula");
const fetchCurrencyAndPrice = require("../../helper/fetchCurrency");
const { handleEbayListing, handleEbaybulkListing } = require("../../marketplaceapis/ebay/ebayBulk");
const addToQueueInBatches = require("../../helper/addToQueueInBatches");
const processFile = require("../../helper/convertFileToJson");
const { getConfigForClient } = require("../../helper/utilityFunctions");
const { handleAmazonListing, handleAmazonBulkUpdate } = require("../../marketplaceapis/amazon/amazonBulk");
const { Op } = require("sequelize");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail");
const { uploadFileToS3 } = require("../../helper/uploadFileToS3");
const createExcelFromJSON = require("../../helper/createExcelFromJSON");
const math = require("mathjs");

//SECTION: Function to start the cron job
const startCronJob = () => {
  return cron.schedule("0 * * * *", async () => {
    try {
      console.log("start Cron Job for cartlow");

      // Extract currency data for cartlow
      const cartlowConfig = await getConfigForClient("cartlow");
      const baseCurrency = cartlowConfig?.baseCurrency;
      const targetCurrency = cartlowConfig?.targetCurrency;
      const cartLowUserId = cartlowConfig?.sellerClient?.userId;
      const clientName = cartlowConfig?.sellerClient?.name;

      // Retrieve the file details for the specified user
      const file = await FileStorages.findOne({
        where: { userId: cartLowUserId },
        raw: true,
      });
      if (!file) {
        console.log("File not found");
        return; // Exit early if file is not found
      }

      const currentDate = new Date();
      currentDate.setHours(
        currentDate.getHours() + 5,
        currentDate.getMinutes() + 30
      );

      const report = await processFile(file?.fileUrl + `?t=${currentDate.getTime()}`);
      console.log("report", report.length);
      // Pre-fetch marketplaces and tokens for this user to minimize queries within the loop
      const marketplaces = await Marketplace.findAll({ raw: true });
      const tokens = await Tokens.findAll({
        where: { userId: file?.userId },
        raw: true,
      });

      // Create maps for marketplaces and tokens
      const marketplaceMap = Object.fromEntries(
        marketplaces.map((m) => [m.id, m])
      );
      const tokenMap = Object.fromEntries(
        tokens.map((t) => [`${t.marketPlaceId}_${t.accountName}`, t])
      );

      const bulkProducts = [];
      const autoCreate = [];
      const failedProducts = [];

      const NASellerSKU = report.filter(item => item["Seller SKU"] == "NA");
      const data = report.filter(item => item["Seller SKU"] !== "NA");

      const deduplicatedData = Object.values(
        data.reduce((acc, item) => {
          const key = item?.["Seller SKU"];
          if (!acc[key]) {
            acc[key] = { ...item };
          } else {
            if (item.variantQuantity > 0 && acc[key].variantQuantity > 0) {
              acc[key].variantQuantity += item.variantQuantity;
            } else if (item.variantQuantity > 0 && acc[key].variantQuantity === 0) {
              acc[key] = { ...item };
            }
          }
          return acc;
        }, {})
      );

      // Include objects with quantity 0 if they are not already included
      const finalData = [
        ...deduplicatedData,
        ...data.filter(
          item =>
            item.quantity === 0 &&
            !deduplicatedData.some(dedupItem => dedupItem.PartnerSKU === item.PartnerSKU && dedupItem.quantity > 0)
        ),
        ...NASellerSKU
      ];

      // Process each record in the report
      await Promise.all(
        finalData.map(async (data) => {
          let { variantSKU, variantSale, variantQuantity, SellerSKU } = data;
          // Find data in the csku table
          const cskuRecords = await Csku.findAll({
            where: {
              [Op.or]: [
                {
                  isku: String(variantSKU),
                },
                {
                  isku: String(data["Seller SKU"]),
                },
                {
                  variationId: String(variantSKU),
                }
              ],
              userId: file?.userId,
            },
            raw: true,
          });

          // if (cskuRecords.length === 0) {
          //   autoCreate.push(data);

          // }
          // Process each cskuRecord using map and Promise.all
          // await Promise.all(
          //   cskuRecords.map(async (value) => {
          for (var i = 0; i < cskuRecords.length; i++) {
            const value = cskuRecords[i];

            const marketplace = marketplaceMap[value?.marketplaceId];
            const token =
              tokenMap[`${value?.marketplaceId}_${value?.accountName}`];
            if (
              variantSale !== value?.price ||
              variantQuantity !== value?.quantity
            ) {
              //NOTE - If any changes in price
              let updatedPrice;
              let variationId = value?.variationId;
              let partnerSku = value?.partnerSku;
              if (variantSale !== value?.price && marketplace?.url?.includes("ebay")) {
                // Get price by currency
                const priceByCurrency = await fetchCurrencyAndPrice({
                  currency: baseCurrency,
                  amount: variantSale,
                  convertedTo: targetCurrency,
                });

                // Convert the price with formula
                // updatedPrice = await convertPriceByFormula({
                //   clientName,
                //   price: priceByCurrency,
                //   baseCurrency,
                //   targetCurrency,
                // });

                const formula = cartlowConfig.currencyConversions.find(c => c.category === "ebay");
                updatedPrice = math.evaluate(formula.formula, { price: priceByCurrency });

              } else if (variantSale !== value?.price && marketplace?.url?.includes("amazon")) {

                const formula = cartlowConfig.currencyConversions.find(c => c.category === "amazon");
                updatedPrice = math.evaluate(formula.formula, { price: variantSale });

              } else {
                updatedPrice = value?.price;
              }

              if (!variationId) {
                variationId = variantSKU;
              } else if (variationId !== variantSKU) {
                variationId = variantSKU;
              }
              if (!partnerSku) {
                partnerSku = data["Partner SKU"];
              } else if (partnerSku !== data["Partner SKU"]) {
                partnerSku = data["Partner SKU"];
              }

              // Update the csku record
              await Csku.update(
                {
                  price: parseFloat(updatedPrice).toFixed(2),
                  quantity: (marketplace?.url?.includes("amazon") && variantQuantity < 2) ? 0 : Number(variantQuantity),
                  // quantity: 0,
                  variationId: variationId,
                  partnerSku: partnerSku,
                  mrp: variantSale,
                },
                { where: { id: value.id } }
              );

              const cskuUpdate = await Csku.findOne({
                where: { id: value.id },
                raw: true,
              });
              // console.log("cskuUpdate", variantSKU, value);
              // Update in isku
              await Isku.update(
                { quantity: variantQuantity, costPrice: parseFloat(updatedPrice).toFixed(2) },
                {
                  where: {
                    isku: variantSKU,
                    marketplaceId: value?.marketplaceId,
                    accountName: value?.accountName,
                  },
                }
              );

              if (marketplace?.url?.includes("ebay")) {
                try {
                  await handleEbayListing(
                    marketplace,
                    cskuUpdate,
                    token,
                    data["Text Grade"],
                    variantQuantity,
                    // 0,
                    bulkProducts
                  );
                } catch (error) {
                  failedProducts.push({
                    productId: cskuUpdate?.id,
                    errors: error.message,
                  });
                }
              } else if (marketplace?.url?.includes("amazon")) {
                try {
                  //TODO - Add amazon logic
                  await handleAmazonListing(
                    cskuUpdate,
                    token,
                    variantQuantity,
                    bulkProducts
                  );
                } catch (error) {
                  failedProducts.push({
                    productId: cskuUpdate?.id,
                    errors: error.message,
                  });
                }
              }
            }
          }
          //   )
          // );

          return data; // Return the data for potential further processing
        })
      );
  
      // Perform bulk update if there are products to update
      try {
        if (bulkProducts.length > 0) {
          const queueName = "bulkUpdateQueue";
          const batchSize = 25;

          await addToQueueInBatches(queueName, bulkProducts, batchSize)
            .then(() => console.log("Data added to queue successfully"))
            .catch((err) => console.error("Error adding data to queue:", err));
        } else {
          console.log("No items to update in bulk");
        }

        // if (autoCreate.length > 0) {
        //   const queueName = "autoCreateQueue";
        //   const batchSize = 25;

        //   await addToQueueInBatches(queueName, bulkProducts, batchSize)
        //     .then(() => console.log("Data added to queue successfully"))
        //     .catch((err) => console.error("Error adding data to queue:", err));
  
        // }
      } catch (error) {
        console.error("Error in CategoryFeedUpload:", error.message);
        newRelic.recordCustomEvent("Error in price and quantity upload", {
          error: error.message,
        });
      }

      if (failedProducts.length > 0) {
        for (const data of failedProducts) {
          //NOTE - get products based on sku
          await updateCSKU(data?.productId, {
            quantityUpdationStatus: "FAILED",
            quantityUpdateErrors: [data?.errors],
            quantityUpdateDate: currentDate,
          });
        }
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
          recipients: 'aditya@sellerpundit.com, chinmayeedash6@gmail.com'
        };

        // Step 3: Send Email with the S3 File Link
        const mailOptions = {
          from: process.env.FROM_EMAIL,
          to: fileOptions.recipients, // Multiple recipients passed in fileOptions
          subject: `Failed Quentity and price Update Report - ${currentDate}`,
          text: `Hello, please find the attached failed update report.`,
          attachments: [
            {
              filename: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
              path: s3Response.Location // S3 file location
            }
          ]
        };

        await sendUpdateReportEmail(mailOptions)
      }

    } catch (err) {
      console.error("Error in CategoryFeedUpload:", err);
      newRelic.recordCustomEvent("Error in price and quantity upload", {
        error: err.message,
      });
    }
  });
};

// exports.cartLowTesting = async (req, res) => {
//   try {
//     console.log("start Cron Job for cartlow");

//     // Extract currency data for cartlow
//     const cartlowConfig = await getConfigForClient("cartlow");
//     const baseCurrency = cartlowConfig?.baseCurrency;
//     const targetCurrency = cartlowConfig?.targetCurrency;
//     const cartLowUserId = cartlowConfig?.sellerClient?.userId;
//     const clientName = cartlowConfig?.sellerClient?.name;

//     // Retrieve the file details for the specified user
//     const file = await FileStorages.findOne({
//       where: { userId: cartLowUserId },
//       raw: true,
//     });
//     if (!file) {
//       console.log("File not found");
//       return; // Exit early if file is not found
//     }

//     const currentDate = new Date();
//     currentDate.setHours(
//       currentDate.getHours() + 5,
//       currentDate.getMinutes() + 30
//     );

//     const report = await processFile(file?.fileUrl + `?t=${currentDate.getTime()}`);
//     console.log("report", report.length);
//     // Pre-fetch marketplaces and tokens for this user to minimize queries within the loop
//     const marketplaces = await Marketplace.findAll({ raw: true });
//     const tokens = await Tokens.findAll({
//       where: { userId: file?.userId },
//       raw: true,
//     });

//     // Create maps for marketplaces and tokens
//     const marketplaceMap = Object.fromEntries(
//       marketplaces.map((m) => [m.id, m])
//     );
//     const tokenMap = Object.fromEntries(
//       tokens.map((t) => [`${t.marketPlaceId}_${t.accountName}`, t])
//     );

//     const bulkProducts = [];
//     const autoCreate = [];
//     const failedProducts = [];

//     const NASellerSKU = report.filter(item => item["Seller SKU"] == "NA");
//     const data = report.filter(item => item["Seller SKU"] !== "NA");

//     const deduplicatedData = Object.values(
//       data.reduce((acc, item) => {
//         const key = item?.["Seller SKU"];
//         if (!acc[key]) {
//           acc[key] = { ...item };
//         } else {
//           if (item.variantQuantity > 0 && acc[key].variantQuantity > 0) {
//             acc[key].variantQuantity += item.variantQuantity;
//           } else if (item.variantQuantity > 0 && acc[key].variantQuantity === 0) {
//             acc[key] = { ...item };
//           }
//         }
//         return acc;
//       }, {})
//     );

//     // Include objects with quantity 0 if they are not already included
//     const finalData = [
//       ...deduplicatedData,
//       ...data.filter(
//         item =>
//           item.variantQuantity === 0 &&
//           !deduplicatedData.some(dedupItem => dedupItem.PartnerSKU === item.PartnerSKU && dedupItem.variantQuantity > 0)
//       ),
//       ...NASellerSKU
//     ];

//     // Process each record in the report
//     await Promise.all(
//       finalData.slice(0, 1).map(async (data) => {
//         let { variantSKU, variantSale, variantQuantity, SellerSKU } = data;
//         // Find data in the csku table
//         const cskuRecords = await Csku.findAll({
//           where: {
//             [Op.or]: [
//               {
//                 isku: String(variantSKU),
//               },
//               {
//                 isku: String(data["Seller SKU"]),
//               },
//               {
//                 variationId: String(variantSKU),
//               }
//             ],
//             userId: file?.userId,
//           },
//           raw: true,
//         });

//         // if (cskuRecords.length === 0) {
//         //   autoCreate.push(data);

//         // }
//         // Process each cskuRecord using map and Promise.all
//         // await Promise.all(
//         //   cskuRecords.map(async (value) => {
//         for (var i = 0; i < cskuRecords.length; i++) {
//           const value = cskuRecords[i];

//           const marketplace = marketplaceMap[value?.marketplaceId];
//           const token =
//             tokenMap[`${value?.marketplaceId}_${value?.accountName}`];
//           if (
//             variantSale !== value?.price ||
//             variantQuantity !== value?.quantity
//           ) {
//             //NOTE - If any changes in price
//             let updatedPrice;
//             let variationId = value?.variationId;
//             let partnerSku = value?.partnerSku;
//             if (variantSale !== value?.price && marketplace?.url?.includes("ebay")) {
//               // Get price by currency
//               const priceByCurrency = await fetchCurrencyAndPrice({
//                 currency: baseCurrency,
//                 amount: variantSale,
//                 convertedTo: targetCurrency,
//               });
//               console.log(priceByCurrency, "priceByCurrency");
//               // Convert the price with formula
//               // updatedPrice = await convertPriceByFormula({
//               //   clientName,
//               //   price: priceByCurrency,
//               //   baseCurrency,
//               //   targetCurrency,
//               // });

//               const formula = cartlowConfig.currencyConversions.find(c => c.category === "ebay");
//               console.log("formula", formula);
//               updatedPrice = math.evaluate(formula.formula, { price: priceByCurrency });

//               console.log("updatedPrice", updatedPrice);

//             } else if (variantSale !== value?.price && marketplace?.url?.includes("amazon")) {

//               const formula = cartlowConfig.currencyConversions.find(c => c.category === "amazon");
//               updatedPrice = math.evaluate(formula.formula, { price: variantSale });

//             } else {
//               updatedPrice = value?.price;
//             }

//             if (!variationId) {
//               variationId = variantSKU;
//             } else if (variationId !== variantSKU) {
//               variationId = variantSKU;
//             }
//             if (!partnerSku) {
//               partnerSku = data["Partner SKU"];
//             } else if (partnerSku !== data["Partner SKU"]) {
//               partnerSku = data["Partner SKU"];
//             }

//             // Update the csku record
//             await Csku.update(
//               {
//                 price: parseFloat(updatedPrice).toFixed(2),
//                 quantity: (marketplace?.url?.includes("amazon") && variantQuantity < 2) ? 0 : Number(variantQuantity),
//                 // quantity: 0,
//                 variationId: variationId,
//                 partnerSku: partnerSku,
//                 mrp: variantSale,
//               },
//               { where: { id: value.id } }
//             );

//             const cskuUpdate = await Csku.findOne({
//               where: { id: value.id },
//               raw: true,
//             });
//             // console.log("cskuUpdate", variantSKU, value);
//             // Update in isku
//             await Isku.update(
//               { quantity: variantQuantity, costPrice: parseFloat(updatedPrice).toFixed(2) },
//               {
//                 where: {
//                   isku: variantSKU,
//                   marketplaceId: value?.marketplaceId,
//                   accountName: value?.accountName,
//                 },
//               }
//             );

//             if (marketplace?.url?.includes("ebay")) {
//               try {
//                 await handleEbayListing(
//                   marketplace,
//                   cskuUpdate,
//                   token,
//                   data["Text Grade"],
//                   variantQuantity,
//                   // 0,
//                   bulkProducts
//                 );
//               } catch (error) {
//                 failedProducts.push({
//                   productId: cskuUpdate?.id,
//                   errors: error.message,
//                 });
//               }
//             }
//             // else
//             //   if (marketplace?.url?.includes("amazon")) {
//             //     try {
//             //       //TODO - Add amazon logic
//             //       await handleAmazonListing(
//             //         cskuUpdate,
//             //         token,
//             //         variantQuantity,
//             //         bulkProducts
//             //       );
//             //     } catch (error) {
//             //       failedProducts.push({
//             //         productId: cskuUpdate?.id,
//             //         errors: error.message,
//             //       });
//             //     }
//             //   }
//             // }
//             // else if (marketplace?.url?.includes("amazon")) {
//             //   try {
//             //     //TODO - Add amazon logic
//             //     await handleAmazonListing(
//             //       cskuUpdate,
//             //       token,
//             //       variantQuantity,
//             //       bulkProducts
//             //     );
//             //   } catch (error) {
//             //     failedProducts.push({
//             //       productId: cskuUpdate?.id,
//             //       errors: error.message,
//             //     });
//             //   }
//             // }
//             // }
//             // else if (marketplace?.url?.includes("amazon")) {
//             //   try {
//             //     //TODO - Add amazon logic
//             //     await handleAmazonListing(
//             //       cskuUpdate,
//             //       token,
//             //       variantQuantity,
//             //       bulkProducts
//             //     );
//             //   } catch (error) {
//             //     failedProducts.push({
//             //       productId: cskuUpdate?.id,
//             //       errors: error.message,
//             //     });
//             //   }
//             // }
//             // }
//           }
//         }
//         //   )
//         // );

//         return data; // Return the data for potential further processing
//       })
//     );

//     // Perform bulk update if there are products to update
//     try {
//       if (bulkProducts.length > 0) {
//         const queueName = "bulkUpdateQueue";
//         const batchSize = 25;

//         // await addToQueueInBatches(queueName, bulkProducts, batchSize)
//         //   .then(() => console.log("Data added to queue successfully"))
//         //   .catch((err) => console.error("Error adding data to queue:", err));

//         const ebayBatch = bulkProducts.filter((item) => item.type === "ebay");
//         const sellerflexBatch = bulkProducts.filter((item) => item.type === "sellerflex");

//         console.log("ebayBatch", ebayBatch);
//         console.log("sellerflexBatch", sellerflexBatch);

//         if (ebayBatch.length > 0) {
//           console.log("In ebay")
//           await handleEbaybulkListing(ebayBatch);
//         }
//         if (sellerflexBatch.length > 0) {
//           await handleAmazonBulkUpdate(sellerflexBatch);
//         }

//       } else {
//         console.log("No items to update in bulk");
//       }

//       // if (autoCreate.length > 0) {
//       //   const queueName = "autoCreateQueue";
//       //   const batchSize = 25;

//       //   await addToQueueInBatches(queueName, bulkProducts, batchSize)
//       //     .then(() => console.log("Data added to queue successfully"))
//       //     .catch((err) => console.error("Error adding data to queue:", err));

//       // }
//     } catch (error) {
//       console.error("Error in CategoryFeedUpload:", error.message);
//       newRelic.recordCustomEvent("Error in price and quantity upload", {
//         error: error.message,
//       });
//     }

//     if (failedProducts.length > 0) {
//       for (const data of failedProducts) {
//         //NOTE - get products based on sku
//         await updateCSKU(data?.productId, {
//           quantityUpdationStatus: "FAILED",
//           quantityUpdateErrors: [data?.errors],
//           quantityUpdateDate: currentDate,
//         });
//       }
//       // Step 1: Generate Excel File from failedProducts
//       const excelBuffer = await createExcelFromJSON(failedProducts, 'Failed Sheet');

//       // Step 2: Upload the Excel File to S3
//       const s3Response = await uploadFileToS3({
//         mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//         buffer: excelBuffer,
//         originalname: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
//         bucketName: process.env.S3_BUCKET_NAME, // Assuming S3_BUCKET_NAME is set in your environment variables
//         folderName: 'failed-report'  // Specify the folder name here
//       });

//       const fileOptions = {
//         recipients: 'aditya@sellerpundit.com, chinmayeedash6@gmail.com'
//       };

//       // Step 3: Send Email with the S3 File Link
//       const mailOptions = {
//         from: process.env.FROM_EMAIL,
//         to: fileOptions.recipients, // Multiple recipients passed in fileOptions
//         subject: `Failed Quentity and price Update Report - ${currentDate}`,
//         text: `Hello, please find the attached failed update report.`,
//         attachments: [
//           {
//             filename: `Failed_Sellerpundit_Update_Quantity_and_Price_Report_${currentDate}.xlsx`,
//             path: s3Response.Location // S3 file location
//           }
//         ]
//       };

//       await sendUpdateReportEmail(mailOptions)
//     }

//   } catch (err) {
//     console.error("Error in CategoryFeedUpload:", err);
//     newRelic.recordCustomEvent("Error in price and quantity upload", {
//       error: err.message,
//     });
//   }
// }

async function updateCSKU(cskuId, updates) {
  await Csku.update(updates, { where: { id: cskuId } });
}

// Start the cron job and stop it after 29 minutes
const job = startCronJob();

module.exports = {
  startCronJob,
  // cartLowTesting,
}
// setTimeout(() => {
//   console.log("Stopping cron job...");
//   console.log("Time at it stops: ", new Date());
//   job.stop(); // Stop the cron job
// }, 29 * 60 * 1000);
