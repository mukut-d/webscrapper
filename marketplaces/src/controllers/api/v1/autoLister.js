const axios = require("axios");
const XLSX = require("xlsx");
const newRelic = require("newrelic");
const {
  FILE_REQUIRED,
  LISTING_ON_PROCESS,
} = require("../../../helper/constants");
const {
  getConfigForClient,
  extractDomains,
  getFormulaForcategory,
} = require("../../../helper/utilityFunctions");
const sendUpdateReportEmail = require("../../../helper/sendUpdateReportEmail");
const createExcelFromJSON = require("../../../helper/createExcelFromJSON");
const { createAmazonProduct } = require("../../../marketplaceapis/amazon/createProduct");
const { handleEbaybulkListing } = require("../../../marketplaceapis/ebay/ebayBulk");

//SECTION - auto Lister For Vendor
exports.autoListerForVendor = async (req, res) => {
  try {
    const { clientName, marketPlaceFrom, marketPlaceTo } = req.body;
    const file = req.file;

    if (!req.file) {
      throw new Error(FILE_REQUIRED);
    }

    res.status(200).send({
      status: 200,
      message: LISTING_ON_PROCESS,
    });

    console.log("READING XLSX");

    const workbook = XLSX.read(file.buffer);
    const first_sheet_name = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[first_sheet_name];
    const convertedJson = XLSX.utils.sheet_to_json(worksheet, {
      rawNumbers: true,
    });

    await parseFiles(clientName, convertedJson, marketPlaceFrom, marketPlaceTo);
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error while auto Lister For Vendor: ${error.message}`
    );
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

//ANCHOR - file to read and process for listing
exports.parseFiles = async (clientName, convertedJson, marketPlaceFrom, marketPlaceTo) => {

  // Get the config json based on client name
  const clientConfig = await getConfigForClient(clientName);

  //NOTE - convert the JOSN to seller pudit JSON
  const sellerPunditJSON = await convertIntoSellerPunditJSON(convertedJson, clientConfig);

  console.log("sellerPunditJSON", sellerPunditJSON);

  let product;
  switch (marketPlaceFrom) {
    case "amazon":
      console.log("Not transformation required");
      product = await getProductsFromAmazon(sellerPunditJSON, clientConfig);
      break;
    case "flipkart":
      product = await getProductsFromAmazon(sellerPunditJSON, clientConfig); //FIXME - change the function when needed
      break;

    default:
      throw new Error(`Unsupported marketplace: ${marketPlaceFrom}`);
  }

  //NOTE - if product is coming
  if (product.length > 0) {
    switch (marketPlaceTo) {
      case "ebay":
        product = await handleEbaybulkListing(product, clientConfig);
        break;
      case "shopify":
        product = await getProductsFromAmazon(convertedJson, clientConfig); //FIXME - change the function when needed
        break;
      // case "amazon":
      //   product = await createAmazonProduct(product, clientConfig);
      //   break;

      default:
        throw new Error(`Unsupported marketplace: ${marketPlaceTo}`);
    }
  }
}

//ANCHOR - convert the JSON in to seller pundit JSON format
async function convertIntoSellerPunditJSON(jsonData, config) {
  console.log("Converting into Seller Pundit JSON format...");

  const { listingInfo } = config;
  const { asinColumn, siteReference, iskuColumn, title, price, category } =
    listingInfo;


  const fileOptions = {
    recipients: "chinmayeedash6@gmail.com",
  };

  // Check if the column name exists in the first item of jsonData
  if (
    !jsonData.length ||
    !Object.prototype.hasOwnProperty.call(jsonData[0], asinColumn)
  ) {
    const excelBuffer = await createExcelFromJSON(jsonData, 'Sheet1');

    // Step 2: Upload the Excel File to S3
    const s3Response = await uploadFileToS3({
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: excelBuffer,
      originalname: `${config?.sellerClient?.name}Failed_Auto_listing_Report_${currentDate}.xlsx`,
      bucketName: process.env.S3_BUCKET_NAME, // Assuming S3_BUCKET_NAME is set in your environment variables
      folderName: 'auto-listing'  // Specify the folder name here
    });

    console.log("s3Response", s3Response);


    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: fileOptions.recipients,
      subject: `Missing Column "${asinColumn}" in Listing File - ${currentDate}`,
      text: `The "${asinColumn}" column is missing from your file. Please check and update it.`,
      attachments: [
        {
          filename: `${config?.sellerClient?.name}Failed_Auto_listing_Report_${currentDate}.xlsx`,
          path: s3Response.Location // S3 file location
        }
      ]
    };

    await sendUpdateReportEmail(mailOptions).catch();
    throw new Error("Upload Failed !!");
  }

  const currentDate = new Date();
  currentDate.setHours(
    currentDate.getHours() + 5,
    currentDate.getMinutes() + 30
  );

  //NOTE: structure for Seller Pundit JSON conversion
  const sellerPunditData = {
    client: config.sellerClient?.name,
    userId: config.sellerClient?.userId ?? null,
    marketplace: config.marketPlace ?? [],
    baseCurrency: config.baseCurrency ?? null,
    targetCurrency: config.targetCurrency ?? null,
    productDetails: await Promise.all(
      jsonData.map(async (ele) => {
        return {
          asin: ele?.[asinColumn],
          isku: ele?.[iskuColumn],
          title: ele?.[title],
          price: ele?.[price],
          category: ele?.[category],
          variationId: ele?.[variationId],
          partnerSku: ele?.[partnerSku],
          domain: extractDomains(ele?.[siteReference]),
          formula: await getFormulaForcategory(
            config.sellerClient?.name,
            ele?.[category]
          ),
          date: currentDate.toISOString(),
        };
      })
    ),
  }; //FIXME - Add other fields as per requirment in future

  return sellerPunditData;
}

//ANCHOR - get product from amazon by asin Api
async function getProductsFromAmazon(jsonData, config) {
  console.log("get Products From Amazon", jsonData);
  const currentDate = new Date();
  currentDate.setHours(
    currentDate.getHours() + 5,
    currentDate.getMinutes() + 30
  );

  const { listingInfo } = config;

  const { asinColumn, siteReference } = listingInfo;


  const products = [];

  // Iterate over the jsonData array
  for (const [i, item] of jsonData.entries()) {
    const asinValue = item?.[asinColumn];

    if (asinValue) {
      const domains = extractDomains(item?.[siteReference]);

      // Map over the domains and process requests
      const domainRequests = domains.map(async (domain) => {
        const params = {
          api_key: process.env.ASIN_API,
          amazon_domain: domain,
          asin: asinValue, // Update here to use asinValue
          type: "product",
        };

        try {
          const result = await axios.get(process.env.ASIN_API_URL, { params });

          if (result?.data?.product) {
            const {
              title,
              categories,
              images,
              body_html,
              feature_bullets,
              attributes,
              specifications,
              variants,
            } = result.data.product;

            products.push({
              i,
              asin: asinValue, // Update here to use asinValue
              domain,
              title: title ?? null,
              status: item?.[siteReference],
              body_html,
              categories,
              images: images?.map((img) => img?.link),
              feature: feature_bullets,
              attributes,
              specifications,
              variants: variants ?? null,
            });
          } else {
            console.warn("No product found for ASIN", asinValue);

            products.push({
              i,
              asin: asinValue, // Update here to use asinValue
              status: item?.[siteReference],
              domain,
              error: result.data,
            });
          }
        } catch (asinError) {
          console.error("Error fetching ASIN data", asinError);

          products.push({
            i,
            asin: asinValue, // Update here to use asinValue
            status: item?.[siteReference],
            domain,
            error: asinError,
          });
        }
      });

      // Wait for all domain requests to complete for the current ASIN
      await Promise.all(domainRequests);
    }
  }

  return products;
}

// const openai = new OpenAI({
//   apiKey: "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",
// });
// const EbayAuthToken = require("ebay-oauth-nodejs-client");
// const ebayAuthToken = new EbayAuthToken({
//   clientId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
//   clientSecret: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
// });

// const scopes = [
//   "https://api.ebay.com/oauth/api_scope",
//   "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.marketing",
//   "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.inventory",
//   "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.account",
//   "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
//   "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.finances",
//   "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
//   "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.reputation",
//   "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
//   "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
//   "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
//   "https://api.ebay.com/oauth/api_scope/sell.stores",
//   "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
// ];
// const refreshToken =
//   "v^1.1#i^1#r^1#p^3#I^3#f^0#t^Ul4xMF83OjE0NDkzREVEQUYyMDA3NTk0RDM5MTc1MTFCREU5RThDXzBfMSNFXjI2MA==";
// const outputFilePath = path.join(
//   __dirname,
//   "cartlow_listed_products_batch3.json"
// );
// const j


// const policies = {
//   shipping: {
//     id: 249271168016,
//     name: "Shipping Policy 1",
//   },
//   payment: {
//     id: 249271151016,
//     name: "Payment Policy 1",
//   },
//   return: {
//     id: 249271158016,
//     name: "Return Policy 1",
//   },
// };

//ANCHOR listing product in ebay from amazon
// async function listingInEbay(products, config) {
//   console.log("value returned", products, config);

//   try {
//     let jsonArray = [];
//     let listedProducts = [];
//     let amazonData = [];
//     let headers = new Set();
//     const eBay = new ebay({
//       appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
//       certId: "PRD-fb4fbfcdf00b-9f7c-45f3-9b5a-a5ea",
//       sandbox: false,
//       autoRefreshToken: true,
//       siteId: 0,
//       devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
//     });
//     eBay.oAuth2.setCredentials(
//       `v^1.1#i^1#I^3#f^0#p^3#r^0#t^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`
//     );
//     // Load existing listed products from JSON file
//     if (fs.existsSync(jsonFilePath)) {
//       amazonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
//     }
//     if (fs.existsSync(outputFilePath)) {
//       listedProducts = JSON.parse(fs.readFileSync(outputFilePath, "utf8"));
//     }
//     //NOTE - Read the Excel file
//     const workbook = xlsx.readFile(excelFilePath);
//     const sheetName = workbook.SheetNames[0]; // Get the first sheet
//     const worksheet = workbook.Sheets[sheetName];

//     //NOTE - Convert the worksheet to JSON
//     jsonArray = xlsx.utils.sheet_to_json(worksheet);

//     const newToken = await ebayAuthToken.getAccessToken(
//       "PRODUCTION",
//       refreshToken,
//       scopes
//     );
//     // console.log(JSON.parse(newToken).access_token)
//     eBay.oAuth2.setCredentials(JSON.parse(newToken).access_token);
//     let start = moment();
//     for (let i = 5; i < 6; i++) {
//       const item = jsonArray[i];
//       console.log(i, item, item?.ASIN, i);
//       const itemDetails = amazonData?.filter(
//         (data) => data?.asin === item?.ASIN && !data?.error
//       )[0];

//       if (itemDetails && item?.ASIN != null && item?.ASIN != "") {
//         const end = moment();
//         if (end.diff(start, "hours") >= 2) {
//           const newToken = await ebayAuthToken.getAccessToken(
//             "PRODUCTION",
//             refreshToken,
//             scopes
//           );
//           eBay.oAuth2.setCredentials(JSON.parse(newToken).access_token);
//           start = moment();
//         }
//         let aspects = {};
//         itemDetails.specifications?.map((specific) => {
//           aspects[specific.name] = specific.value;
//         });
//         itemDetails.attributes?.map((att) => {
//           aspects[att.name] = att.value;
//         });
//         // const titleCompletion = await openai.chat.completions.create({
//         //   messages: [
//         //     {
//         //       role: 'system',
//         //       content: `Please shorten the following product title to a maximum of 80 characters, ensuring that it still contains the key features and details: "${itemDetails?.title?.replace(
//         //         /[^a-zA-Z0-9 ]/g,
//         //         ''
//         //       )}".The shortened title must not exceed 80 characters.`
//         //     }
//         //   ],
//         //   model: 'gpt-3.5-turbo'
//         // })

//         // const title =
//         //   titleCompletion?.choices[0]?.message?.content ||
//         //   itemDetails?.title(/[^a-zA-Z0-9 ]/g, '')
//         const title = item?.title;
//         //NOTE -  Get category suggestions (assuming eBay object exists and is configured)
//         const categories = await eBay.commerce.taxonomy.getCategorySuggestions(
//           0,
//           title
//         );
//         const { categoryId, categoryName } =
//           categories?.categorySuggestions[0]?.category;
//         const aspectData =
//           await eBay.commerce.taxonomy.getItemAspectsForCategory(0, categoryId);
//         const aspNames = new Set();
//         const requiredAspects = aspectData.aspects.filter(
//           (asp) => asp.aspectConstraint.aspectRequired
//         );
//         requiredAspects?.map((asp) => {
//           if (asp.localizedAspectName == "US Shoe Size") {
//             aspNames.add(
//               asp.localizedAspectName + " (convert into US Shoe Size)"
//             );
//             headers.add(
//               asp.localizedAspectName + " (convert into US Shoe Size)"
//             );
//           } else {
//             aspNames.add(asp.localizedAspectName);
//             headers.add(asp.localizedAspectName);
//           }
//         });

//         const completion = await openai.chat.completions.create({
//           messages: [
//             {
//               role: "system",
//               content: `${title} ${categoryName}
//                           Based on the text above extract ${Array.from(
//                             aspNames
//                           ).join(
//                             ", "
//                           )} return 'NA' if not found, return in json format.
//                           `,
//             },
//           ],
//           model: "gpt-3.5-turbo",
//         });
//         console.log(
//           completion.choices[0].message.content,
//           "completion.choices[0].message.content"
//         );
//         let fieldsDataMissing = {};
//         try {
//           let aspectsValues = JSON.parse(completion.choices[0].message.content);
//           Object.entries(aspectsValues)?.forEach(([key, value]) => {
//             console.log(key, value, "key");
//             if (value !== "NA" && value !== "N/A") {
//               if (key?.includes("Compatible Operating System")) {
//                 aspects[key?.trim()] =
//                   aspects["Operating System"] || value?.trim();
//                 delete aspects["Operating System"];
//               } else {
//                 aspects[key?.trim()] = aspects[key?.trim()] || value?.trim();
//               }
//             } else {
//               if (key?.includes("Compatible Operating System")) {
//                 aspects[key?.trim()] = aspects["Operating System"];
//               }
//               if (key?.includes("Screen Size")) {
//                 aspects[key?.trim()] = aspects["Standing screen display size"];
//                 delete aspects["Standing screen display size"];
//               } else {
//                 if (aspects[key?.trim()]) {
//                   aspects[key?.trim()] = aspects[key?.trim()];
//                 } else {
//                   fieldsDataMissing[key?.trim()] = "NA";
//                 }
//               }
//             }
//           });
//         } catch (parseError) {
//           console.error("Error parsing OpenAI response:", parseError);
//         }
//         // console.log(aspects, 'aspects')
//         // NOTE - A+ description
//         const description = await ejs.renderFile(ejsFilePath, {
//           title: title,
//           image: itemDetails?.images ? itemDetails?.images[0] : "",
//           features: itemDetails?.feature || [],
//           specifications: aspects,
//         });
//         // if (itemDetails?.variants != null && itemDetails?.variants?.length) {
//         //   const variantSpecificList = {}
//         //   const variation = itemDetails?.variants?.map(variant => {
//         //     const vari = {
//         //       SKU: item?.['variation_code (ISKU)'],
//         //       StartPrice: item['ebay price'],
//         //       Quantity: item?.quantity || 0,
//         //       VariationSpecifics: {
//         //         NameValueList: variant?.dimensions?.map(dim => {
//         //           if (!variantSpecificList[dim.name]) {
//         //             variantSpecificList[dim.name] = new Set()
//         //           }
//         //           variantSpecificList[dim.name].add(dim.value)
//         //           return {
//         //             Name: dim?.name,
//         //             Value: dim?.value
//         //           }
//         //         })
//         //       }
//         //     }

//         //     return vari
//         //   })
//         //   console.log(aspects , ItemSpecifics )
//         //   const request = {
//         //     Item: {
//         //       Country: 'IN',
//         //       Currency: 'USD',
//         //       Description: description,
//         //       BestOfferDetails: {
//         //         BestOfferEnabled: false
//         //       },
//         //       ListingDetails: {
//         //         BindingAuction: false,
//         //         HasReservePrice: false
//         //       },
//         //       ListingDuration: 'GTC',
//         //       Location: 'cartlow_AE_12345_store',
//         //       PrimaryCategory: {
//         //         CategoryID: categoryId,
//         //         CategoryName: categoryName
//         //       },
//         //       PrivateListing: true,
//         //       Site: 'US',
//         //       SKU:item?.['variation_code (ISKU)'],
//         //       Title: title,
//         //       PictureDetails: {
//         //         GalleryType: 'Gallery',
//         //         PictureURL: itemDetails?.images
//         //       },
//         //       Variations: {
//         //         VariationSpecificsSet: {
//         //           NameValueList: Object.keys(variantSpecificList)?.map((key)=>{
//         //             return {
//         //               Name: key,
//         //               Value: Array.from(variantSpecificList[key])
//         //             }
//         //           })
//         //         },
//         //         Variation: variation
//         //       },
//         //       ItemSpecifics: {
//         //         NameValueList: Object.entries(aspects)?.map(([key, value]) => {
//         //            const values ={}
//         //            if(value?.includes(',')){
//         //             value?.split(',')?.map((val)=>{
//         //                    values["Value"] = val
//         //             })
//         //            }else{
//         //             values["Value"] = value
//         //            }
//         //           return {
//         //             Name: key,
//         //             ...values

//         //           }
//         //         })
//         //       },
//         //       ConditionID: '1000',
//         //       SellerProfiles: sellerProfile
//         //     }
//         //   }
//         //   try {
//         //     const response = await eBay.trading.AddFixedPriceItem(request)
//         //     listedProducts.push({
//         //       i: i,
//         //      asin: item?.ASIN,
//         //       variationcode : item?.['variation_code (ISKU)'],
//         //       response: response?.data
//         //     })
//         //     fs.writeFileSync(
//         //       outputFilePath,
//         //       JSON.stringify(listedProducts, null, 2)
//         //     )
//         //     console.log(response?.data, 'response')
//         //   } catch (error) {
//         //     listedProducts.push({
//         //       i: i,
//         //       asin: item?.ASIN,
//         //       variationcode : item?.['variation_code (ISKU)'],
//         //       error: error
//         //     })
//         //     fs.writeFileSync(
//         //       outputFilePath,
//         //       JSON.stringify(listedProducts, null, 2)
//         //     )
//         //     console.log(error, 'error')
//         //     continue
//         //   }
//         // } else {
//         Object.entries(aspects)?.map(([key, value]) => {
//           aspects[key] = value?.includes(",") ? value?.split(",") : [value];
//         });
//         delete aspects["Best Sellers Rank"];
//         delete aspects["Customer Reviews"];
//         // Create or replace inventory item
//         const createInventory = {
//           product: {
//             title: title?.trim(),
//             // description: description.trim(),
//             aspects: aspects,
//             imageUrls: itemDetails?.images,
//           },
//           condition: "USED_EXCELLENT",
//           availability: {
//             shipToLocationAvailability: {
//               quantity: 0,
//             },
//           },
//         };
//         const createOffer = {
//           sku: item?.["variation_code (ISKU)"],
//           marketplaceId: "EBAY_US",
//           format: "FIXED_PRICE",
//           listingDescription: description?.trim(),
//           availableQuantity: 0,
//           quantityLimitPerBuyer: 0,
//           pricingSummary: {
//             price: {
//               currency: "USD",
//               value: item["eBay Selling Price($)"],
//             },
//           },
//           listingPolicies: {
//             fulfillmentPolicyId: policies.shipping.id,
//             paymentPolicyId: policies.payment.id,
//             returnPolicyId: policies.return.id,
//           },
//           categoryId: categoryId || "",
//           merchantLocationKey: "acac9b6d-000c-4649-9cb3-6ba2e671897b",
//           tax: {
//             vatPercentage: 10.2,
//             applyTax: true,
//             thirdPartyTaxCategory: "Electronics",
//           },
//         };
//         console.log(aspects, "aspects");
//         try {
//           const csku = await eBay.sell.inventory.createOrReplaceInventoryItem(
//             item?.["variation_code (ISKU)"],
//             createInventory
//           );
//           console.log(csku, "csku");
//         } catch (error) {
//           console.error(
//             "An error occurred while creating or replacing the inventory item:",
//             error?.meta
//           );
//           listedProducts.push({
//             i: i,
//             asin: item?.ASIN,
//             variationcode: item?.["variation_code (ISKU)"],
//             categoryId,
//             categoryName,
//             Headers: Array.from(headers),

//             categoryId,
//             categoryName,
//             title: title,
//             error: error,
//           });
//           fs.writeFileSync(
//             outputFilePath,
//             JSON.stringify(listedProducts, null, 2)
//           );
//           continue;
//         }
//         try {
//           const skuOffers = await eBay.sell.inventory.getOffers({
//             sku: item?.["variation_code (ISKU)"],
//           });

//           console.log(skuOffers, "skuOffers");
//           if (skuOffers?.offers[0]?.offerId) {
//             try {
//               const updateOffer = await eBay.sell.inventory.updateOffer(
//                 skuOffers?.offers[0]?.offerId,
//                 createOffer
//               );
//               const publishOffer = await eBay.sell.inventory.publishOffer(
//                 skuOffers?.offers[0]?.offerId
//               );
//               console.log(publishOffer, "publishOffer");
//               listedProducts.push({
//                 i: i,
//                 asin: item?.ASIN,
//                 variationcode: item?.["variation_code (ISKU)"],
//                 categoryId,
//                 categoryName,
//                 Headers: Array.from(headers),

//                 categoryId,
//                 categoryName,
//                 title: title,
//                 listingId: publishOffer?.listingId,
//                 offerId: skuOffers?.offers[0]?.offerId,
//               });
//               fs.writeFileSync(
//                 outputFilePath,
//                 JSON.stringify(listedProducts, null, 2)
//               );
//               continue;
//             } catch (error) {
//               listedProducts.push({
//                 i: i,
//                 asin: item?.ASIN,
//                 variationcode: item?.["variation_code (ISKU)"],
//                 categoryId,
//                 categoryName,
//                 Headers: Array.from(headers),

//                 categoryId,
//                 categoryName,
//                 title: title,
//                 offerId: skuOffers?.offers[0]?.offerId,
//                 error: error,
//               });
//               fs.writeFileSync(
//                 outputFilePath,
//                 JSON.stringify(listedProducts, null, 2)
//               );
//               continue;
//             }
//           }
//         } catch (error) {
//           // If no offer exists, create a new offer
//           console.log(error);
//           try {
//             const getOfferID = await eBay.sell.inventory.createOffer(
//               createOffer
//             );
//             if (getOfferID?.offerId) {
//               try {
//                 const publishOffer = await eBay.sell.inventory.publishOffer(
//                   getOfferID.offerId
//                 );
//                 console.log(publishOffer, "publishOffer");
//                 listedProducts.push({
//                   i: i,
//                   asin: item?.ASIN,
//                   variationcode: item?.["variation_code (ISKU)"],
//                   categoryId,
//                   categoryName,
//                   Headers: Array.from(headers),
//                   categoryId,
//                   categoryName,
//                   title: title,
//                   listingId: publishOffer?.listingId,
//                   offerId: getOfferID?.offerId,
//                 });
//                 fs.writeFileSync(
//                   outputFilePath,
//                   JSON.stringify(listedProducts, null, 2)
//                 );
//                 continue;
//               } catch (error) {
//                 listedProducts.push({
//                   i: i,
//                   asin: item?.ASIN,
//                   variationcode: item?.["variation_code (ISKU)"],
//                   categoryId,
//                   categoryName,
//                   Headers: Array.from(headers),
//                   categoryId,
//                   categoryName,
//                   title: title,
//                   offerId: getOfferID?.offerId,
//                   error: error,
//                 });
//                 fs.writeFileSync(
//                   outputFilePath,
//                   JSON.stringify(listedProducts, null, 2)
//                 );
//                 continue;
//               }
//             }
//           } catch (error) {
//             console.error(
//               "An unexpected error occurred while creating the offer:",
//               error
//             );
//             if (error?.firstError?.parameters?.[0]?.name === "offerId") {
//               try {
//                 const publishOffer = await eBay.sell.inventory.publishOffer(
//                   error?.firstError?.parameters[0]?.value
//                 );
//                 console.log(publishOffer, "publishOffer");
//                 listedProducts.push({
//                   i: i,
//                   asin: item?.ASIN,
//                   variationcode: item?.["variation_code (ISKU)"],
//                   categoryId,
//                   categoryName,
//                   Headers: Array.from(headers),

//                   categoryId,
//                   categoryName,
//                   title: title,
//                   listingId: publishOffer?.listingId,
//                   offerId: error?.firstError?.parameters[0]?.value,
//                 });
//                 fs.writeFileSync(
//                   outputFilePath,
//                   JSON.stringify(listedProducts, null, 2)
//                 );
//                 continue;
//               } catch (error) {
//                 listedProducts.push({
//                   i: i,
//                   asin: item?.ASIN,
//                   variationcode: item?.["variation_code (ISKU)"],
//                   categoryId,
//                   categoryName,
//                   Headers: Array.from(headers),

//                   categoryId,
//                   categoryName,
//                   title: title,
//                   offerId: error?.firstError?.parameters[0]?.value,
//                   error: error,
//                 });
//                 fs.writeFileSync(
//                   outputFilePath,
//                   JSON.stringify(listedProducts, null, 2)
//                 );
//                 continue;
//               }
//             }
//             listedProducts.push({
//               i: i,
//               asin: item?.ASIN,
//               variationcode: item?.["variation_code (ISKU)"],
//               categoryId,
//               categoryName,
//               Headers: Array.from(headers),

//               categoryId,
//               categoryName,
//               title: title,
//               error: error,
//             });
//             fs.writeFileSync(
//               outputFilePath,
//               JSON.stringify(listedProducts, null, 2)
//             );
//             continue;
//           }
//         }
//       }
//       // }
//     }
//   } catch (error) {
//     console.error("Error occurred:", error);
//   }
// }
