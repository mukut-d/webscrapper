const newRelic = require("newrelic");
const fs = require("fs");
const AWS = require("aws-sdk");
const path = require("path");
const Marketplace = require("../../models/marketplace");
const Csku = require("../../models/csku");
const Tokens = require("../../models/tokens");
const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const cheerio = require("cheerio");
const { DOMParser } = require("xmldom");
const xpath = require("xpath");
const uploadFileToS3 = require("../../helper/uploadFileToS3");
const {

  BulkActionType,
  HistoryStatus,
} = require("../../utils/enum");
const Isku = require("../../models/isku");
const { Op, Sequelize } = require("sequelize");
const { sequelize } = require("../../database/config");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail");
const createExcelFromJSON = require("../../helper/createExcelFromJSON");
const math = require("mathjs");
const cron = require("node-cron");
const csku = require("../../models/csku");
const UserRepository = require("../../models/user");
const mathjs = require("mathjs");
const moment = require("moment");
const axios = require("axios");
const { pushData } = require("../../controllers/api/v1/catalogue");
const { getSellerProfile } = require("../../marketplaceapis/ebay/index");
const Geosite = require("../../models/geosite");
const Templates = require("../../models/template");
const { processImages } = require("../../helper/image-bg-color");
const { AddWatermark } = require("../../helper/addWatermark");
const shippingPolicies = require("../../models/shippingPolicies");
const paymentPolicies = require("../../models/paymentPolicy");
const returnPolicies = require("../../models/returnPolicy");
const { uploadToS3 } = require("../../helper/uploadFile");
const BulkUploadHistory = require("../../models/bulkUploadHistory");
const generateExcelFile = require("../../helper/generateExcelFile");
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
const s3 = new AWS.S3();
AWS.config.update({ region: "ap-south-1" });

const lambda = new AWS.Lambda();
const compa = fs.createWriteStream("compatabilityAutobucksParts.txt", {
  flags: "a",
});
// cron.schedule("0 0 */7 * *", () => {
//   mainFunction();
// });

exports.mainFunction = async () => {
  try {
    const getCronUsers = await UserRepository.findAll({
      where: {
        ebay_cron: true,
      },
      raw: true,
    });

    if (getCronUsers.length > 0) {
      for (var i = 0; i < getCronUsers.length; i++) {
        const userData = getCronUsers[i];
        console.log(userData);
        const tokenData = await Tokens.findAll({
          where: {
            userId: userData.id,
            marketPlaceId: 7,
          },
          raw: true,
        });
        tokenData.forEach(async (token) => {
          // console.log("Processing token:", token);
          await cronFunction(token);
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
};

async function cronFunction(userData) {
  try {
    let failedProduct = [];
    let failedCount = 0;
    let successCount = 0;
    const todayDate = moment().add(5, "hours").add(30, "minutes");
    const startDay = todayDate.clone().subtract(7, "days").startOf("day");
    const endDay = todayDate.clone().endOf("day");
    // const startDay = new Date("2024-09-25T17:36:14.793+05:30");
    // const endDay = new Date("2024-09-25T17:36:14.793+05:30");
    console.log("goING IN FOR: ", userData);
    const configFile = JSON.parse(
      fs.readFileSync(path.join("cron-config.json"), "utf8")
    );

    // Navigate through the JSON structure to access sourceAccounts.dreamnify-motors
    const userConfig = await configFile.find(
      (config) => config[userData.userId]
    );
    console.log("userConfig: ", userConfig);
    const migrateSourceConfig =
      userConfig?.[userData.userId]?.accounts?.sourceAccounts?.[
        userData.accountName
      ];
    console.log("migrate Source config>> ", migrateSourceConfig);
    const siteId = migrateSourceConfig?.ebaySite;

    if (migrateSourceConfig) {
      let data = JSON.stringify({
        userId: userData.userId,
        marketplaceId: userData.marketPlaceId,
        accountName: userData.accountName,
        addQuantity: false,
        date: startDay,
      });

      // let config = {
      //   method: "post",
      //   maxBodyLength: Infinity,
      //   url: "http://localhost:5001/catalogue/sync-catalogue",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   data: data,
      // };
      // await axios.request(config).then((response) => {
      //   console.log(JSON.stringify(response.data));
      // });
      // const sourceAccount = userConfig?.[userData.userId]?.accounts?.sourceAccounts;
      // console.log("source Account", sourceAccount)

      if (
        migrateSourceConfig?.migrate_to &&
        typeof migrateSourceConfig.migrate_to === "object"
      ) {
        // Object.entries(migrateSourceConfig.migrate_to).forEach(
        //   async ([destAccount, shouldMigrate]) => {
        for (const [destAccount, shouldMigrate] of Object.entries(
          migrateSourceConfig.migrate_to
        )) {
          if (shouldMigrate) {
            console.log(`Migrating to account: ${destAccount}`);
            const destinationConfig =
              userConfig?.[userData.userId]?.accounts?.destinationAccounts?.[
                destAccount
              ]?.[userData.accountName];
            // const cskuData = await csku.findAll({
            //   where: {
            //     createdAt: {
            //       [Op.between]: [startDay, endDay],
            //     },
            //     userId: userData.userId,
            //     marketplaceId: userData.marketPlaceId,
            //     accountName: userData.accountName,
            //     currency:
            //       userConfig?.[userData.userId]?.accounts?.sourceAccounts?.[
            //         userData.accountName
            //       ]?.currency,
            //   },
            //   attributes: ["channelId"],
            //   group: ["channelId"],
            // });
            // console.log("cskuData.length: ", cskuData.length);
            const itemArray = ["374350844937"];
            if (itemArray.length > 0) {
              // cskuData.forEach((item) => {
              //   itemArray.push(item.dataValues.channelId);
              // });
              // const geoSite = await Geosite.findOne({
              //   where: {
              //     globalId: config.ebaySite,
              //   },
              //   raw: true,
              // });
              // const sellerProfile = await getSellerProfile(
              //   userData.userId,
              //   userData.accountName,
              //   userData.marketPlaceId,
              //   geoSite
              // );
              console.log("item Array: ", itemArray);
              console.log(destinationConfig.config_data);
              console.log(
                "Data: ",
                JSON.stringify(userData?.accountName),
                JSON.stringify(destAccount),
                JSON.stringify(userData.userId),
                JSON.stringify(userData.userId),
                itemArray
              );
              const sourceToken = await Tokens.findOne({
                where: {
                  accountName: userData?.accountName,
                  userId: userData.userId,
                },
              });
              const destToken = await Tokens.findOne({
                where: { accountName: destAccount, userId: userData.userId },
              });
              const totalItem = itemArray.length;
              for (let i = 0; i < itemArray.length; i++) {
                const item = itemArray[i];
                const cskuData = await csku.findOne({
                  where: {
                    isku: item,
                    userId: userData.userId,
                    marketplaceId: userData.marketPlaceId,
                    accountName: destAccount,
                  },
                });
                // if (cskuData){
                // failedProduct.push({
                // ...items,
                // error: `Already Migrated to ${destAccount}`
                // })
                // failedCount++;
                //   continue;
                // }
                const items = await csku.findOne({
                  where: {
                    channelId: item,
                    userId: userData.userId,
                    marketplaceId: userData.marketPlaceId,
                    accountName: userData.accountName,
                  },
                });
                // console.log("items: ",items)
                const geoSite = await Geosite.findOne({
                  where: {
                    siteId:
                      userConfig?.[userData.userId]?.accounts?.sourceAccounts[
                        userData.accountName
                      ].SiteId,
                  },
                  raw: true,
                });
                console.log(
                  "SiteId:",
                  userConfig?.[userData.userId]?.accounts?.sourceAccounts[
                    userData.accountName
                  ]?.SiteId
                );
                const sourceEbay = new ebay({
                  appId: process.env.APP_ID,
                  certId: process.env.CERT_ID,
                  sandbox: false,
                  siteId:
                    userConfig?.[userData.userId]?.accounts?.sourceAccounts[
                      userData.accountName
                    ].SiteId,
                  devId: process.env.DEV_ID,
                  acceptLanguage: geoSite.localeValue,
                  contentLanguage: geoSite.localeValue,
                });
                console.log("source ebay >> ", sourceEbay);
                sourceEbay.oAuth2.setCredentials(sourceToken.dataValues.token);
                let startdate = moment();
                let tokenExpiresDate = moment(sourceToken.lastTokenRefreshDate);
                let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

                if (hoursDifference >= 2) {
                  await refreshToken(sourceEbay, sourceToken);
                }
                // console.log("dest config: ",destinationConfig)
                const destGeoSite = await Geosite.findOne({
                  where: {
                    siteId: destinationConfig.config_data.SiteId,
                  },
                  raw: true,
                });
                // console.log(geoSite)
                const destEbay = new ebay({
                  appId: process.env.APP_ID,
                  certId: process.env.CERT_ID,
                  sandbox: false,
                  siteId: destinationConfig.config_data.SiteId,
                  marketplaceId: destinationConfig.config_data.ebaySiteId,
                  devId: process.env.DEV_ID,
                  acceptLanguage: destGeoSite.localeValue,
                  contentLanguage: destGeoSite.localeValue,
                  // authToken: token.dataValues.token,
                });
                console.log("Dest Ebay >> ", destEbay);
                destEbay.oAuth2.setCredentials(destToken.dataValues.token);
                startdate = moment();
                tokenExpiresDate = moment(destToken.lastTokenRefreshDate);
                hoursDifference = startdate.diff(tokenExpiresDate, "hours");

                if (hoursDifference >= 2) {
                  await refreshToken(destEbay, destToken);
                }
                const configFile = JSON.parse(
                  fs.readFileSync(path.join("cron-config.json"), "utf8")
                );
                // if (item.channelId != "375644951471") {
                //   continue;
                // }
                const userConfigs = configFile.find(
                  (config) => config[userData.userId]
                );
                const response = await sourceEbay.trading.GetItem({
                  ItemID: item,
                  DetailLevel: "ReturnAll",
                  IncludeItemCompatibilityList: true,
                  IncludeItemSpecifics: true,
                });
                console.log(response.Item);
                const fulfillmentPolicy = await shippingPolicies.findOne({
                  where: {
                    name: response.Item.SellerProfiles.SellerShippingProfile
                      .ShippingProfileName,
                    userId: userData.userId,
                    accountName: destAccount,
                  },
                });
                console.log("Shipping Profile Id >> ", fulfillmentPolicy);

                // if (!fulfillmentPolicy) {
                //   return res.status(404).json({
                //     success: false,
                //     message: "Fulfillment policy for this id not found",
                //   });
                // }

                const paymentPolicy = await paymentPolicies.findOne({
                  where: {
                    name: response.Item.SellerProfiles.SellerPaymentProfile
                      .PaymentProfileName,
                    userId: userData.userId,
                    accountName: destAccount,
                  },
                });
                // console.log("payment policy: ",paymentPolicy)
                // if (!paymentPolicy) {
                //   return res.status(404).json({
                //     success: false,
                //     message: "Payment policy for this id not found",
                //   });
                // }

                const returnPolicy = await returnPolicies.findOne({
                  where: {
                    name: response.Item.SellerProfiles.SellerReturnProfile
                      .ReturnProfileName,
                    userId: userData.userId,
                    accountName: destAccount,
                  },
                });
                // console.log("return", returnPolicy)
                // if (!returnPolicy) {
                //   return res.status(404).json({
                //     success: false,
                //     message: "Fulfillment policy for this id not found",
                //   });
                // }
                const sellerProfile = {
                  SellerShippingProfile: {
                    // ShippingProfileID:
                    // fulfillmentPolicy?.dataValues?.fulfillmentPolicyId,
                    ShippingProfileID: "237364493026",
                    ShippingProfileName: fulfillmentPolicy?.dataValues?.name,
                  },
                  SellerReturnProfile: {
                    // ReturnProfileID: returnPolicy?.dataValues?.policy_details.returnPolicyId,
                    ReturnProfileID: "237109241026",
                    ReturnProfileName: returnPolicy?.dataValues?.name,
                  },
                  SellerPaymentProfile: {
                    PaymentProfileID: paymentPolicy.paymentPolicyId,
                    PaymentProfileName: paymentPolicy?.name,
                  },
                };
                console.log("sellerProfile:", sellerProfile);
                const destinationEbayConfig =
                  userConfigs?.[userData.userId]?.accounts.destinationAccounts[
                    destAccount
                  ][userData.accountName].config_data;
                const sourceEbayConfig =
                  userConfigs?.[userData.userId]?.accounts?.sourceAccounts[
                    userData.accountName
                  ];
                const sourceEbaySite = sourceEbayConfig?.ebaySite;
                const destinationEbaySite = destinationEbayConfig?.ebaySite;
                console.log(
                  "Source - ",
                  sourceEbaySite,
                  destinationEbaySite,
                  "- Dest"
                );
                let request = {};
                // SAME EBAY SITE
                if (sourceEbaySite === destinationEbaySite) {
                  const descriptionTemplate = await Templates.findOne({
                    where: {
                      user_id: userData.userId,
                      template_name: destinationEbayConfig.template_name,
                      template_id: destinationEbayConfig.templateId,
                    },
                  });

                  console.log("same");
                  const $ = cheerio.load(items.description ?? "");
                  //   console.log("Item description", item.description);

                  const doc = new DOMParser().parseFromString($.xml());
                  let prodDetails;
                  prodDetails = xpath.select1("//div[@id='description']", doc);
                  if (prodDetails === undefined) {
                    prodDetails = xpath.select1("//font", doc);
                    // console.log("Prod Details:", prodDetails.textContent);
                  }
                  let desc = descriptionTemplate.html;
                  desc = desc.replace(
                    "{itemDescription}",
                    prodDetails.textContent ?? ""
                  );
                  const price = response.Item.StartPrice.value;
                  const custom_price = mathjs.evaluate(
                    destinationEbayConfig.priceFormula,
                    { price }
                  );
                  let watermarkedImages = [
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-651304fc-c933-4547-b158-8127b4c20d9d.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-7d3c050d-b5b9-4e32-801b-89759885bec6.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-e4b06503-0b43-439f-b305-bfa61aabfd8e.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-e9db5bde-0cfd-4dc3-a41d-3b93bf2fd622.jpg",
                  ];
                  // let watermarkedImages = [];
                  // if (destinationEbayConfig?.watermark) {

                  //   const imageFromS3= await getImageFromS3Lambda(item.channelId);
                  // const imageFromS3 = [
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/1.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/10.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/11.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/12.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/13.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/14.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/15.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/2.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/3.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/4.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/5.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/6.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/7.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/8.png',
                  //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/9.png'
                  // ]
                  // if (!imageFromS3){
                  //   failedProduct.push({
                  //     ...items,
                  //     error : "No image found in S3"
                  //   })
                  //   failedCount++;
                  //   continue;
                  // }
                  // const whiteBgImages = await processImages(
                  //   imageFromS3
                  // );
                  // watermarkedImages = await AddWatermark(
                  //   whiteBgImages,
                  //   destinationEbayConfig?.watermark
                  // );
                  // if(!watermarkedImages){
                  //   failedProduct.push({
                  //     ...items,
                  //     error : "Watermark not added"
                  //   })
                  //   failedCount++;
                  //   continue;
                  // }
                  // } else {
                  //   watermarkedImages = items.images;
                  // }
                  // const custom_price =parseFloat(response.Item.StartPrice.value) -0.5;
                  let images = [
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-3991b2b1-ae33-48d7-8986-a6ac72f45615.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-18059c2e-3d76-4da3-90fc-54e5515caea2.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-034bda42-2bd3-4177-b1cf-bc2da241cba6.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-2fbe3166-43e1-45f4-ad4b-3252d6150287.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-baf5c5e8-4bbb-4454-81a1-915dd7840519.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-6e0704f9-4b3f-4207-9596-6987fd92fb33.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-d3fc8228-8c95-42ac-96a6-8c03c636ea13.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-f863d416-7603-4091-9ce9-369c458d2ec1.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-f2ea3454-422b-44d8-98cf-90d271869587.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-771ee949-3aa4-42b3-b9cb-3dab133e84dc.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-5985f19d-30f0-45ad-9f37-53867cce0aae.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-cece9f35-df32-4903-8706-a35e3c94ab54.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-97e01437-8c0b-4a1a-9778-a392b50f7221.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-9f02cf87-9a31-4359-9dae-992c00122cce.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-0aec0bd7-e5bb-43f5-ae12-000e8b360d3a.jpg",
                    "https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/watermarked-8332e1c3-637f-454b-97fa-0d81cbbdae19.jpg",
                  ];
                  request = {
                    Item: {
                      Country: destinationEbayConfig.Country,
                      Currency: destinationEbayConfig?.Currency,
                      Description: desc,
                      BestOfferDetails: {
                        BestOfferEnabled: false,
                      },
                      ListingDetails: {
                        BindingAuction: false,
                        HasReservePrice: false,
                      },
                      ListingDuration: "GTC",
                      ListingType: "FixedPriceItem",
                      Location: destinationEbayConfig?.Location,
                      PrimaryCategory: {
                        CategoryID: response.Item.PrimaryCategory.CategoryID,
                        CategoryName:
                          response.Item.PrimaryCategory.CategoryName,
                      },
                      PrivateListing: true,
                      // Storefront: {
                      //   StoreCategoryID:""
                      // },

                      Quantity: 0,
                      Site: destinationEbayConfig?.Site,
                      StartPrice: custom_price,
                      Title: response?.Item?.Title,
                      PictureDetails: {
                        GalleryType: "Gallery",
                        PictureURL: watermarkedImages,
                      },
                      SKU: items.isku,
                      ...(response?.Item?.Variations
                        ? { Variations: response.Item.Variations }
                        : {}),
                      ...(response?.Item?.ItemCompatibilityList
                        ? {
                            ItemCompatibilityList:
                              response.Item.ItemCompatibilityList,
                          }
                        : {}),
                      // ItemCompatibilityList: itemCompatability,
                      ItemSpecifics: response.Item.ItemSpecifics,
                      ConditionID: destinationEbayConfig?.ConditionId,
                      SellerProfiles: sellerProfile,
                    },
                  };
                }
                // DIFFERENT EBAY SITE
                else if (sourceEbaySite != destinationEbaySite) {
                  console.log("different");
                  const $ = cheerio.load(items.description ?? "");
                  //   console.log("Item description", item.description);

                  const descriptionTemplate = await Templates.findOne({
                    where: {
                      user_id: userData.userId,
                      template_name: destinationEbayConfig.template_name,
                      template_id: destinationEbayConfig.templateId,
                    },
                  });
                  const doc = new DOMParser().parseFromString($.xml());
                  let prodDetails;
                  prodDetails = xpath.select1("//div[@id='description']", doc);
                  if (prodDetails === undefined) {
                    prodDetails = xpath.select1("//font", doc);
                    // console.log("Prod Details:", prodDetails.textContent);
                  }
                  let desc = descriptionTemplate.html;
                  desc = desc.replace(
                    "{itemDescription}",
                    prodDetails.textContent ?? ""
                  );
                  const price = response.Item.StartPrice.value;

                  const custom_price = mathjs.evaluate(
                    destinationEbayConfig.priceFormula,
                    { price }
                  );
                  let watermarkedImages = [];
                  if (destinationEbayConfig?.watermark) {
                    const imageFromS3 = await getImageFromS3Lambda(
                      item.channelId
                    );
                    // const imageFromS3 = [
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/1.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/10.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/11.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/12.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/13.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/14.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/15.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/2.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/3.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/4.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/5.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/6.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/7.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/8.png',
                    //   'https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/9.png'
                    // ]
                    if (!imageFromS3) {
                      failedProduct.push({
                        ...items,
                        error: "No image found in S3",
                      });
                      failedCount++;
                      continue;
                    }
                    const whiteBgImages = await processImages(imageFromS3);
                    if (!whiteBgImages) {
                      failedProduct.push({
                        ...items,
                        error: "Image Background Color Change Error",
                      });
                      failedCount++;
                      continue;
                    }
                    watermarkedImages = await AddWatermark(
                      whiteBgImages,
                      destinationEbayConfig?.watermark
                    );
                    if (!watermarkedImages) {
                      failedProduct.push({
                        ...items,
                        error: "Watermark not added to item ",
                      });
                      failedCount++;
                      continue;
                    }
                  } else {
                    watermarkedImages = items.images;
                  }

                  let itemCompatibility;
                  if (response.Item.ItemCompatibilityList) {
                    const compatibilityStructure =
                      destinationEbayConfig.itemCompatibility;
                    itemCompatibility = await EbayItemCompatibility(
                      response.Item.ItemCompatibilityList.Compatibility,
                      compatibilityStructure
                    );
                    if (!itemCompatibility) {
                      failedProduct.push({
                        ...items,
                        error: "Matching Compatibility Not Found for item",
                      });
                      failedCount++;
                      continue;
                    }
                  }
                  console.log("itemCompatibility:::>>> ", itemCompatibility);
                  request = {
                    Item: {
                      Country: destinationEbayConfig.Country,
                      Currency: destinationEbayConfig?.Currency,
                      Description: desc,
                      BestOfferDetails: {
                        BestOfferEnabled: false,
                      },
                      ListingDetails: {
                        BindingAuction: false,
                        HasReservePrice: false,
                      },
                      ListingDuration: "GTC",
                      ListingType: "FixedPriceItem",
                      Location: destinationEbayConfig?.Location,
                      PrimaryCategory: {
                        CategoryID: items.categoryId,
                        CategoryName: items.categoryName,
                      },
                      PrivateListing: true,
                      // Storefront: {
                      //   StoreCategoryID:""
                      // },

                      Quantity: 0,
                      Site: destinationEbayConfig?.Site,
                      StartPrice: custom_price,
                      Title: response?.Item?.Title,
                      PictureDetails: {
                        GalleryType: "Gallery",
                        PictureURL: watermarkedImages,
                      },
                      SKU: items.isku,
                      ...(response?.Item?.Variations
                        ? { Variations: response.Item.Variations }
                        : {}),
                      // ...(response?.Item?.ItemCompatibilityList ? { ItemCompatibilityList: itemCompatibility } : {}),
                      ItemCompatibilityList: itemCompatibility,
                      ItemSpecifics: response.Item.ItemSpecifics,
                      ConditionID: destinationEbayConfig?.ConditionId,
                      SellerProfiles: sellerProfile,
                    },
                  };
                  // if (response?.Item?.VideoDetails?.VideoID) {
                  //   request.Item.VideoDetails = { VideoID: response.Item.VideoDetails.VideoID };
                  // }
                  // return
                }
                console.log(
                  "Request autobucks: ",
                  request.Item.ItemCompatibilityList.Compatibility
                );
                compa.write(JSON.stringify(request.Item.ItemCompatibilityList));
                try {
                  const addItemResponse = await destEbay.trading.AddItem(
                    request
                  );
                  console.log("Response:", addItemResponse);
                  successCount++;
                  if (addItemResponse) {
                    const message = `Data for ${item} with Item ID ${addItemResponse.ItemID} has been successfully listed on eBay.`;
                    // ebayListingEtsySuccess.write(`"${item.channelId}",\n`)
                    // ebayEtsySuccess.write(`"${item.channelId}", "${addItemResponse.ItemID}"\n`)

                    console.log(message);

                    // Fetch detailed information about the listed item
                    const ebayRes = await destEbay.trading.GetItem({
                      ItemID: addItemResponse.ItemID,
                      DetailLevel: "ReturnAll",
                      IncludeItemCompatibilityList: true,
                      IncludeItemSpecifics: true,
                    });

                    if (ebayRes && ebayRes.Item) {
                      await csku.destroy({
                        where: {
                          channelId: "To Be Migrated",
                          isku: item.isku,
                          userId: destUserId,
                          accountName: destAccount,
                        },
                      });
                      const pushDataBody = {
                        ItemArray: {
                          Item: [ebayRes.Item],
                        },
                      };
                      await pushData(
                        pushDataBody,
                        destToken.dataValues.marketPlaceId,
                        destAccount,
                        destUserId,
                        false
                      );
                    }
                  }
                } catch (error) {
                  console.error(
                    "Error occurred while adding the item:",
                    error.meta
                  );
                  console.error("Error message:", error.message);
                  failedProduct.push({
                    ...items,
                    error: error.meta,
                  });
                  failedCount++;
                  continue;
                }
              }
              if (failedProduct?.length > 0) {
                const formattedDate = new Date()
                  .toISOString()
                  .replace(/[:]/g, "-");
                const fileName = `${userData.userId}-${userData.accountName}-${destAccount}-copied-failed-${formattedDate}-data.xlsx`;
                const outputDir = path.join(__dirname, "dreamify-motors");
                if (!fs.existsSync(outputDir)) {
                  fs.mkdirSync(outputDir, { recursive: true });
                }
                const excelFilePath = path.join(outputDir, fileName);
                try {
                  const res = await generateExcelFile(
                    failedProduct,
                    excelFilePath,
                    [...Object.keys(failedProduct[0])]
                  );
                  console.log("response > ", res);
                } catch (error) {
                  console.error("Error generating Excel file:", error);
                }
                try {
                  const fileBuffer = fs.readFileSync(excelFilePath);
                  errorFileLocation = await uploadToS3({
                    mimetype:
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    buffer: fileBuffer,
                    originalname: `failed-report/${fileName}`,
                  });
                  console.log(`Error file generated at ${errorFileLocation}`);
                } catch (error) {
                  console.error("Error uploading file to S3:", error);
                }
                await BulkUploadHistory.create({
                  actionType: BulkActionType.CREATE_CATALOGUE,
                  userId: userData.userId,
                  sourceAccountName: userData.accountName,
                  destinationAccountName: destAccount,
                  siteId: siteId || null,
                  totalItems: totalItem,
                  errorFilePath: errorFileLocation,
                  uploadedFilePath: errorFileLocation,
                  status: HistoryStatus.COMPLETED,
                  failedItems: failedCount,
                  successItems: successCount,
                });
                // const mailOptions = {
                //   from: process.env.FROM_EMAIL,
                //   to: "dreamnifymotors@gmail.com",
                //   // cc: ["akhlaqansarievdtechnology@gmail.com", "aditya@mergekart.com"],
                //   cc: ["pratiksharma860@gmail.com"],
                //   subject: `Copy Products Report - ${new Date().toLocaleDateString()}`,
                //   text: "Hello, please find the attached file for Listing.",
                // };

                // if (errorFileLocation) {
                //   mailOptions.attachments = [
                //     {
                //       filename: fileName,
                //       path: errorFileLocation,
                //     },
                //   ];
                // } else {
                //   mailOptions.text = `Error While generating Error Excel File.`;
                // }
                // await sendUpdateReportEmail(mailOptions);
              }
            }
          }
        }
      } else {
        console.log("No account to migrate!!!");
        return;
      }
    } else {
      return;
    }
  } catch (err) {
    console.log(err);
  }
}

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.dataValues.refreshToken,
      scopes
    );

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
    // await token.save()
  } catch (error) {
    // newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`)
    console.log(error);
    throw error;
  }
}

const getImageFromS3Lambda = async () => {
  const params = {
    FunctionName: "fetchImageS3", // Replace with your Lambda function name
    Payload: JSON.stringify({ channelId: "374350844937" }), // Pass input as a JSON string
  };

  try {
    const result = await lambda.invoke(params).promise();
    const response = JSON.parse(result.Payload); // Parse the response payload
    console.log("Lambda response:", response);
    return response;
  } catch (error) {
    console.error("Error invoking Lambda:", error);
  }
};

const EbayItemCompatibility = async (
  itemCompatability,
  compatibilityStructure
) => {
  let compatibilities = [];
  // console.log("ITEM COMP>:::  ",itemCompatability);
  const updatedItemComp = itemCompatability.map((entry) => {
    return entry.NameValueList.reduce((acc, obj) => {
      if (obj.Name && obj.Value) {
        acc[obj.Name] = obj.Value;
      }
      return acc;
    }, {});
  });

  console.log("Updated ITEM COMP:", updatedItemComp);
  // return ;
  // try {
  //   const compatibilityData =
  //     await eBay.sell.inventory.getProductCompatibility(item);
  //   compatibilities = compatibilityData.compatibleProducts;

  //   // fs.writeFileSync(
  //   //   "Compatibility.json",
  //   //   JSON.stringify(compatibilityData)
  //   // );
  //   // console.log("Compatability Data before delete: ", compatibilities);
  // } catch (err) {
  //   console.log(err);
  // }
  let isTrim = false;
  let isSubmodel = false;
  // compatibilities = compatibilities?.map((comp) => {
  //   delete comp.productFamilyProperties;
  //   return comp;
  // });

  const ItemCompatibility = [];

  let unfilteredData = [];
  let uniqueFinalData = [];
  let uniqueData = [];
  console.log("compatabi. length : ", updatedItemComp.length);

  for (const item of updatedItemComp) {
    let isTrim = false;
    let isSubmodel = false;
    let trim = null;
    let submodel = null;
    let model = null;
    let year = null;
    let make = null;

    if (item.Trim) {
      isTrim = true;
      trim = item.Trim;
      const log = `\n"${item.isku}",`;
      console.log("trim log >> ", log);
      // TrimArr.write(log);
      continue;
    }

    if (item.Submodel) {
      isSubmodel = true;
      submodel = item.Submodel;
    }

    model = item.Model || null;
    year = item.Year || null;
    make = item.Make || null;

    console.log(year, make, model, submodel);

    const returnData = async (make, model, year, submodel, isSubmodel) => {
      let data = [];
      let filteredData = [];
      let finalData = [];

      if (isSubmodel) {
        console.log(
          "*****************************************SUBMODEL RUNS******************************************"
        );

        const insertQuery = `select * from compatibilities where make='${make}' and model='${model}' and year='${year}'`;

        data = await sequelize.query(insertQuery, {
          type: Sequelize.QueryTypes.SELECT,
        });
      }

      console.log("DATA LENGTH AND ISSUBMODEL:", data.length, isSubmodel);
      // if (data.length == 0) {
      //   let swap = model;
      //   model = submodel;
      //   submodel = swap;
      //   const query = `select * from compatibilities where make='${make}' and submodel='${model}' and year='${year}'`;
      //   data = await sequelize.query(query, {
      //     type: Sequelize.QueryTypes.SELECT,
      //   });
      // }

      if (data.length > 0 && isSubmodel) {
        console.log("GOES FOR '''''SUBMODEL''''", submodel);

        let desiredSubmodel = submodel;
        filteredData = data.filter((itm) =>
          itm.submodel.includes(desiredSubmodel)
        );
      }

      if (filteredData.length > 0) {
        finalData.push(
          ...filteredData?.map((abc) => ({
            productFamilyProperties: {
              Make: abc.make,
              Model: abc.model,
              year: abc.year,
              Submodel: abc.submodel,
              Variant: abc.variant,
            },
          }))
        );
      }
      return finalData;
    };
    unfilteredData = await returnData(make, model, year, submodel, isSubmodel);
    if (unfilteredData.length == 0) {
      unfilteredData = await returnData(
        make,
        submodel,
        year,
        model,
        isSubmodel
      );
    }
    uniqueFinalData = unfilteredData.filter(
      (value, index, self) =>
        index ===
        self.findIndex(
          (t) =>
            t.productFamilyProperties.Make ===
              value.productFamilyProperties.Make &&
            t.productFamilyProperties.Model ===
              value.productFamilyProperties.Model &&
            t.productFamilyProperties.year ===
              value.productFamilyProperties.year &&
            t.productFamilyProperties.Submodel ===
              value.productFamilyProperties.Submodel
        )
    );

    uniqueData.push(...uniqueFinalData);
  }
  uniqueData = uniqueData.filter(
    (value, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.productFamilyProperties.Make ===
            value.productFamilyProperties.Make &&
          t.productFamilyProperties.Model ===
            value.productFamilyProperties.Model &&
          t.productFamilyProperties.year ===
            value.productFamilyProperties.year &&
          t.productFamilyProperties.Submodel ===
            value.productFamilyProperties.Submodel
      )
  );
  console.log("UNIQUE DATA LENGTH:::::", uniqueData.length);

  const fields = compatibilityStructure;

  //   const ItemCompatibility = [];
  await Promise.all(
    uniqueData?.map(async (cpm) => {
      let nameValueList = [];

      Object.entries(cpm.productFamilyProperties)?.forEach(([key, value]) => {
        fields?.compatibilityProperties?.forEach((pr) => {
          if (pr.localizedName.toLowerCase() === key.toLowerCase()) {
            nameValueList.push({
              Name: pr.name,
              Value: value ?? "",
            });
          }
        });
      });

      ItemCompatibility.push({
        NameValueList: nameValueList,
      });
    })
  );

  const itemComp = {
    Compatibility: ItemCompatibility,
  };
  return itemComp;

  // for (var j = 0; j < updatedItemComp.length; j++) {
  //   let data = [];
  //   let make;
  //   let year;
  //   let model;
  //   let submodel;
  //   const compatibility = updatedItemComp[j];
  //   const property = compatibility;
  //   const propertyTrim = compatibility.name;

  //   if (propertyTrim === "Trim") {
  //     const log = `\n"${item}",`;
  //     TrimArr.write(log);
  //     continue;
  //   }
  //   // console.log("Property:::", property);

  //   for (let i = 0; i < property.length; i++) {
  //     const trimKey = property.find(
  //       (property) => property.name === "Trim"
  //     );
  //     const submodelKey = property.find(
  //       (property) => property.name === "Submodel"
  //     );
  //     const modelKey = property.find(
  //       (property) => property.name === "Model"
  //     );
  //     // if (trimKey) {
  //     //   isTrim = true;
  //     //   const log = `\n"${item.isku}",`;
  //     //   TrimArr.write(log);
  //     //   continue;
  //     //   if (property[i].name === "Trim") {
  //     //     submodel = property[i].value;
  //     //   }
  //     // }
  //     if (submodelKey) {
  //       isSubmodel = true;
  //       if (property[i].name === "Model") {
  //         submodel = property[i].value;
  //       }
  //     }
  //     model = trimKey
  //       ? modelKey.value
  //       : submodelKey
  //       ? modelKey.value
  //       : null;
  //     if (property[i].name === "Year") {
  //       year = property[i].value;
  //     }
  //     if (property[i].name === "Make") {
  //       make = property[i].value;
  //     }
  //   }

  //   console.log(make, year, model);
  //   return;
  //   const returnData = async (make, model, year, isSubmodel) => {
  //     let data = [];
  //     let filteredData = [];
  //     let finalData = [];

  //     if (isSubmodel) {
  //       console.log(
  //         "*****************************************SUBMODEL RUNS******************************************"
  //       );

  //       const insertQuery = `select * from compatibilities where make='${make}' and model='${model}' and year='${year}'`;

  //       data = await sequelize.query(insertQuery, {
  //         type: Sequelize.QueryTypes.SELECT,
  //       });
  //     }

  //     console.log("DATA LENGTH AND ISSUBMODEL:", data.length, isSubmodel);
  //     // if (data.length == 0) {
  //     //   let swap = model;
  //     //   model = submodel;
  //     //   submodel = swap;
  //     //   const query = `select * from compatibilities where make='${make}' and submodel='${model}' and year='${year}'`;
  //     //   data = await sequelize.query(query, {
  //     //     type: Sequelize.QueryTypes.SELECT,
  //     //   });
  //     // }

  //     if (data.length > 0 && isSubmodel) {
  //       console.log("GOES FOR '''''SUBMODEL''''", submodel);

  //       let desiredSubmodel = submodel;
  //       filteredData = data.filter((itm) =>
  //         itm.submodel.includes(desiredSubmodel)
  //       );
  //     }

  //     if (filteredData.length > 0) {
  //       finalData.push(
  //         ...filteredData?.map((abc) => ({
  //           productFamilyProperties: {
  //             Make: abc.make,
  //             Model: abc.model,
  //             year: abc.year,
  //             Submodel: abc.submodel,
  //             Variant: abc.variant,
  //           },
  //         }))
  //       );
  //     }
  //     return finalData;
  //   };
  //   // const returndata = async (make, model, year, isSubmodel) => {
  //   //   let data = [];
  //   //   let filteredData = [];
  //   //   let finalData = [];

  //   //   if (isSubmodel) {
  //   //     console.log(
  //   //       "*****************************************SUBMODEL RUNS******************************************"
  //   //     );

  //   //     const insertQuery = `select * from compatibilities where make='${make}' and model='${model}' and year='${year}'`;

  //   //     data = await sequelize.query(insertQuery, {
  //   //       type: Sequelize.QueryTypes.SELECT,
  //   //     });
  //   //   }

  //   //   console.log("DATA LENGTH AND ISSUBMODEL:", data.length, isSubmodel);

  //   //   if (data.length > 0 && isSubmodel) {
  //   //     console.log("GOES FOR '''''SUBMODEL in uniquee ''''", submodel);

  //   //     let desiredSubmodel = submodel;
  //   //     filteredData = data.filter((itm) =>
  //   //       itm.submodel.includes(desiredSubmodel)
  //   //     );
  //   //   }

  //   //   if (filteredData.length > 0) {
  //   //     finalData.push(
  //   //       ...filteredData?.map((abc) => ({
  //   //         productFamilyProperties: {
  //   //           Make: abc.make,
  //   //           Model: abc.model,
  //   //           year: abc.year,
  //   //           Submodel: abc.submodel,
  //   //           Variant: abc.variant,
  //   //         },
  //   //       }))
  //   //     );
  //   //   }
  //   //   return finalData;
  //   // };

  //   unfilteredData = await returnData(make, model, year, isSubmodel);
  //   console.log("Final data Length:", unfilteredData.length);

  //   if (isTrim) {
  //     console.log(
  //       "*****************************************TRIM RUNS******************************************"
  //     );
  //     continue;
  //     const insertQuery = `select * from compatibilities where make = '${make}' and model = '${model}' and year = '${year}'`;

  //     data = await sequelize.query(insertQuery, {
  //       type: Sequelize.QueryTypes.SELECT,
  //     });
  //     console.log("Data in trim:", data);
  //   }
  //   // console.log("******query ends");

  //   // if (isSubmodel) {
  //   //   console.log(
  //   //     "*****************************************SUBMODEL RUNS******************************************"
  //   //   );

  //   //   const insertQuery = `select * from compatibilities where make='${make}' and model='${model}' and year='${year}'`;

  //   //   data = await sequelize.query(insertQuery, {
  //   //     type: Sequelize.QueryTypes.SELECT,
  //   //   });
  //   //   // console.log("Data in submodel:", data);
  //   // }

  //   uniqueFinalData = unfilteredData.filter(
  //     (value, index, self) =>
  //       index ===
  //       self.findIndex(
  //         (t) =>
  //           t.productFamilyProperties.Make ===
  //             value.productFamilyProperties.Make &&
  //           t.productFamilyProperties.Model ===
  //             value.productFamilyProperties.Model &&
  //           t.productFamilyProperties.year ===
  //             value.productFamilyProperties.year &&
  //           t.productFamilyProperties.Submodel ===
  //             value.productFamilyProperties.Submodel
  //       )
  //   );

  //   uniqueData.push(...uniqueFinalData);

  //   // console.log("unique DATA LENGTH::::", uniqueData.length);
  //   // if (uniqueData.length >= 0) {
  //   //   for (let i = 0; i < property.length; i++) {
  //   //     const trimKey = property.find(
  //   //       (property) => property.name === "Trim"
  //   //     );
  //   //     const submodelKey = property.find(
  //   //       (property) => property.name === "Submodel"
  //   //     );
  //   //     const modelKey = property.find(
  //   //       (property) => property.name === "Model"
  //   //     );
  //   //     // if (trimKey) {
  //   //     //   isTrim = true;
  //   //     //   const log = `\n"${item.isku}",`;
  //   //     //   TrimArr.write(log);
  //   //     //   continue;
  //   //     //   if (property[i].name === "Trim") {
  //   //     //     submodel = property[i].value;
  //   //     //   }
  //   //     // }
  //   //     if (submodelKey) {
  //   //       isSubmodel = true;
  //   //       if (property[i].name === "Model") {
  //   //         submodel = property[i].value;
  //   //       }
  //   //     }
  //   //     model = trimKey
  //   //       ? modelKey.value
  //   //       : submodelKey
  //   //       ? submodelKey.value
  //   //       : null;
  //   //     if (property[i].name === "Year") {
  //   //       year = property[i].value;
  //   //     }
  //   //     if (property[i].name === "Make") {
  //   //       make = property[i].value;
  //   //     }
  //   //   }
  //   //   console.log(make, model, year);
  //   //   unfilteredData = await returnData(make, model, year, isSubmodel);
  //   //   uniqueFinalData = unfilteredData.filter(
  //   //     (value, index, self) =>
  //   //       index ===
  //   //       self.findIndex(
  //   //         (t) =>
  //   //           t.productFamilyProperties.Make ===
  //   //             value.productFamilyProperties.Make &&
  //   //           t.productFamilyProperties.Model ===
  //   //             value.productFamilyProperties.Model &&
  //   //           t.productFamilyProperties.year ===
  //   //             value.productFamilyProperties.year &&
  //   //           t.productFamilyProperties.Submodel ===
  //   //             value.productFamilyProperties.Submodel
  //   //       )
  //   //   );
  //   //   uniqueData.push(...uniqueFinalData);
  //   // }
  //   // continue;
  // }
  // uniqueData = uniqueData.filter(
  //   (value, index, self) =>
  //     index ===
  //     self.findIndex(
  //       (t) =>
  //         t.productFamilyProperties.Make ===
  //           value.productFamilyProperties.Make &&
  //         t.productFamilyProperties.Model ===
  //           value.productFamilyProperties.Model &&
  //         t.productFamilyProperties.year ===
  //           value.productFamilyProperties.year &&
  //         t.productFamilyProperties.Submodel ===
  //           value.productFamilyProperties.Submodel
  //     )
  // );
  // console.log("UNIQUE DATA LENGTH:::::", uniqueData.length);

  // const fields = {
  //   compatibilityProperties: [
  //     { localizedName: "make", name: "AUM_Make" },
  //     { localizedName: "model", name: "AUM_Model" },
  //     { localizedName: "year", name: "Year" },
  //     { localizedName: "submodel", name: "AUM_Submodel" },
  //     { localizedName: "power", name: "AUM_Power" },
  //   ],
  // };

  // //   const ItemCompatibility = [];
  // await Promise.all(
  //   uniqueData?.map(async (cpm) => {
  //     let nameValueList = [];

  //     Object.entries(cpm.productFamilyProperties)?.forEach(
  //       ([key, value]) => {
  //         fields?.compatibilityProperties?.forEach((pr) => {
  //           if (pr.localizedName.toLowerCase() === key.toLowerCase()) {
  //             nameValueList.push({
  //               Name: pr.name,
  //               Value: value ?? "",
  //             });
  //           }
  //         });
  //       }
  //     );

  //     ItemCompatibility.push({
  //       NameValueList: nameValueList,
  //     });
  //   })
  // );

  // const itemComp = {
  //   Compatibility: ItemCompatibility,
  // };
  // return itemComp;
};
