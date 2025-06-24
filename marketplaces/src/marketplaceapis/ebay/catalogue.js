const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const nodemailer = require("nodemailer");
const User = require("../../models/user");
const moment = require("moment");
const xlsx = require("xlsx");
const newRelic = require("newrelic");
const Tokens = require("../../models/tokens");
const csku = require("../../models/csku");
const Geosite = require("../../models/geosite");
const { ProductListingStatus } = require("../../utils/enum");
const Catalogue = require("../../models/catalogue");
const shippingPolicies = require("../../models/shippingPolicies");
const paymentPolicies = require("../../models/paymentPolicy");
const returnPolicies = require("../../models/returnPolicy");
const CatalogueVariation = require("../../models/catalogue-variation");
const { apiCallLog } = require("../../helper/apiCallLog");
const { pushData } = require("../../helper/pushData.js")
const CatalogueCrosslistingInfo = require("../../models/catalogue_crosslisting_info");
const ejs = require("ejs");
const axios = require("axios");
const FormData = require("form-data");
const Template = require("../../models/template");
const sequelize = require("../../database/config.js");

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

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token?.dataValues?.refreshToken || token?.refreshToken,
      scopes
    );
    if (JSON.parse(newToken)?.error) {
      await Tokens.update(
        {
          status: "inactive",
        },
        {
          where: {
            id: token?.dataValues?.id || token?.id,
          },
        }
      );
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
        where: { id: token?.dataValues?.userId || token?.userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: "Token Expired!",
          text: `Token for account name ${token?.dataValues?.accountName || token?.accountName
            } associated with user ${userData?.dataValues?.email
            } has expired. Please login to your account and reauthorize the token.`,
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
    await Tokens.update(
      {
        token: accessToken.access_token,
        lastTokenRefreshDate: moment()
          .add(5, "hours")
          .add(30, "minutes")
          .toISOString(),
      },
      {
        where: {
          id: token?.dataValues?.id || token?.id,
        },
      }
    );
  } catch (error) {
    newRelic.recordCustomEvent(`Error while token refresh: ${error?.message}`);
    console.log(error);
    throw error;
  }
}
exports.fetchEbayStoreCategories = async (token) => {
  try {
    const response = await axios.get(
      process.env.EBAY_STORE_CATEGORIES_API_URL,
      {
        headers: {
          Authorization: `Bearer ${token?.dataValues?.token}`,
        },
      }
    );

    const storeCategories = response.data.storeCategories;

    const extractLeafCategories = (
      node,
      parentCategoryName,
      parentCategoryId
    ) => {
      let arr = [];
      if (node.childrenCategories) {
        node.childrenCategories.forEach((child) => {
          const data = {
            userId: token?.dataValues?.userId,
            accountName: token?.dataValues?.accountName,
            categoryId: child.categoryId,
            categoryName: child.categoryName,
            categoryTree: `${parentCategoryName}>${child.categoryName}`,
            parentCategory: parentCategoryId ?? null,
            leafCategoryTreeNode: !!child.childrenCategories,
            siteId: 0,
            isStoreCategory: true,
          };
          arr.push(data);
          arr = arr.concat(
            extractLeafCategories(
              child,
              `${parentCategoryName}>${child.categoryName}`,
              child.categoryId
            )
          );
        });
      }
      return arr;
    };

    let arr = [];
    storeCategories.forEach((rootCategory) => {
      const data = {
        userId: token?.dataValues?.userId,
        accountName: token?.dataValues?.accountName,
        categoryId: rootCategory.categoryId,
        categoryName: rootCategory.categoryName,
        categoryTree: rootCategory.categoryName,
        parentCategory: rootCategory.categoryId ?? null,
        leafCategoryTreeNode: !!rootCategory.childrenCategories,
        siteId: 0,
        isStoreCategory: true,
      };
      arr.push(data);
      arr = arr.concat(
        extractLeafCategories(
          rootCategory,
          rootCategory.categoryName,
          rootCategory.categoryId
        )
      );
    });

    // Create or update categories in the database
    for (const item of arr) {
      // Check if the category already exists
      const existingCategory = await Catalogue.findOne({
        where: {
          categoryId: item.categoryId,
        },
      });

      if (existingCategory) {
        // Update the existing category
        await Catalogue.update(item, {
          where: {
            categoryId: item.categoryId,
          },
        });
      } else {
        // Create a new category
        await Catalogue.create(item);
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: arr,
      message: "Store Categories Retrieved Successfully.",
    };
  } catch (error) {
    console.error("Error fetching eBay store categories:", error);
    return {
      success: false,
      statusCode: 500,
      message: "Error fetching eBay store categories: " + error.message,
    };
  }
};
exports.getEbayStoreCategories = async (userId, accountName) => {
  try {
    // Fetch categories based on accountName and userId
    const categories = await Catalogue.findAll({
      where: {
        userId: userId,
        accountName: accountName,
      },
      attributes: ["categoryId", "categoryName"],
    });

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No categories found for this account.",
      });
    }
    return {
      success: true,
      statusCode: 200,
      data: arr,
      message: "Store Categories Retrieved Successfully.",
    };
  } catch (error) {
    console.error("Error fetching categories by account name:", error);
    return {
      success: false,
      statusCode: 500,
      message: "Error fetching categories by account name: " + error.message,
    };
  }
};
exports.generateExcelForEbayBulkCreate = async (
  accountName,
  userId,
  site,
  category,
  workbook,
  mainSheet,
  dropdownSheet,
  res
) => {
  try {
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      siteId: site?.dataValues?.siteId,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });

    // Fetching policies from the database
    const shippingPoliciesList = await shippingPolicies.findAll({
      where: {
        userId,
        accountName,
      },
      attributes: ["fulfillmentPolicyId", "name"],
    });
    console.log("shippingPoliciesList :>> ", shippingPoliciesList);

    const paymentPoliciesList = await paymentPolicies.findAll({
      where: {
        userId,
        accountName,
      },
      attributes: ["paymentPolicyId", "name"],
    });
    console.log("paymentPoliciesList :>> ", paymentPoliciesList);

    const returnPoliciesList = await returnPolicies.findAll({
      where: {
        userId,
        accountName,
      },
      attributes: ["returnPolicyId", "name"],
    });
    console.log("returnPoliciesList :>> ", returnPoliciesList);

    const categories = await Catalogue.findAll({
      where: {
        userId: userId,
        accountName: accountName,
      },
      attributes: ["categoryId", "categoryName"],
    });
    console.log("categories :>> ", categories);

    let aspectData = null;
    // Getting item aspects from eBay API
    try {
      const data = await eBay.commerce.taxonomy.getItemAspectsForCategory(
        site?.dataValues?.siteId,
        category?.categoryId
      );
      aspectData = data.aspects;
    } catch (error) {
      console.log(error);
    }

    // Define headers
    const headerKeys = {
      "*sku": "*sku",
      "*title": "*title",
      "*description": "*description",
      "*quantity": "*quantity",
      quantityLimitPerBuyer: "quantityLimitPerBuyer",
      "*country": "*country",
      "*conditionId": "*conditionId",
      "*price": "*price",
      "*currency": "*currency",
      packageType: "packageType",
      height: "height",
      width: "width",
      length: "length",
      weight: "weight",
      measureUnit: "measureUnit",
      "*images": "*images",
      "*location": "*location",
      "*fulfillmentPolicyId": "*fulfillmentPolicyId",
      "*paymentPolicyId": "*paymentPolicyId",
      "*returnPolicyId": "*returnPolicyId",
      storeCategoryId: "storeCategoryId",
      variant_sku: "variant_sku",
      variant_price: "variant_price",
      variant_quantity: "variant_quantity",
      variant_option1_name: "variant_option1_name",
      variant_option1_value: "variant_option1_value",
    };

    const enumValues = {
      measureUnit: ["English", "Metric"],
      "*conditionId": [
        "NEW_1000",
        "LIKE_NEW_2750",
        "NEW_OTHER_1500",
        "NEW_WITH_DEFECTS_1750",
        "CERTIFIED_REFURBISHED_2000",
        "EXCELLENT_REFURBISHED_2010",
        "VERY_GOOD_REFURBISHED_2020",
        "GOOD_REFURBISHED_2030",
        "SELLER_REFURBISHED_2500",
        "USED_EXCELLENT_3000",
        "USED_VERY_GOOD_4000",
        "USED_GOOD_5000",
        "USED_ACCEPTABLE_6000",
        "FOR_PARTS_OR_NOT_WORKING_7000",
      ],
      "*currency": [
        "AED",
        "AFN",
        "ALL",
        "AMD",
        "ANG",
        "AOA",
        "ARS",
        "AUD",
        "AWG",
        "AZN",
        "BAM",
        "BBD",
        "BDT",
        "BGN",
        "BHD",
        "BIF",
        "BMD",
        "BND",
        "BOB",
        "BRL",
        "BSD",
        "BTN",
        "BWP",
        "BYR",
        "BZD",
        "CAD",
        "CDF",
        "CHF",
        "CLP",
        "CNY",
        "COP",
        "CRC",
        "CUP",
        "CVE",
        "CZK",
        "DJF",
        "DKK",
        "DOP",
        "DZD",
        "EGP",
        "ERN",
        "ETB",
        "EUR",
        "FJD",
        "FKP",
        "GBP",
        "GEL",
        "GHS",
        "GIP",
        "GMD",
        "GNF",
        "GTQ",
        "GYD",
        "HKD",
        "HNL",
        "HRK",
        "HTG",
        "HUF",
        "IDR",
        "ILS",
        "INR",
        "IQD",
        "IRR",
        "ISK",
        "JMD",
        "JOD",
        "JPY",
        "KES",
        "KGS",
        "KHR",
        "KMF",
        "KPW",
        "KRW",
        "KWD",
        "KYD",
        "KZT",
        "LAK",
        "LBP",
        "LKR",
        "LRD",
        "LSL",
        "LTL",
        "LYD",
        "MAD",
        "MDL",
        "MGA",
        "MKD",
        "MMK",
        "MNT",
        "MOP",
        "MRO",
        "MUR",
        "MVR",
        "MWK",
        "MXN",
        "MYR",
        "MZN",
        "NAD",
        "NGN",
        "NIO",
        "NOK",
        "NPR",
        "NZD",
        "OMR",
        "PAB",
        "PEN",
        "PGK",
        "PHP",
        "PKR",
        "PLN",
        "PYG",
        "QAR",
        "RON",
        "RSD",
        "RUB",
        "RWF",
        "SAR",
        "SBD",
        "SCR",
        "SDG",
        "SEK",
        "SGD",
        "SHP",
        "SLL",
        "SOS",
        "SRD",
        "STD",
        "SYP",
        "SZL",
        "THB",
        "TJS",
        "TMT",
        "TND",
        "TOP",
        "TRY",
        "TTD",
        "TWD",
        "TZS",
        "UAH",
        "UGX",
        "USD",
        "UYU",
        "UZS",
        "VEF",
        "VND",
        "VUV",
        "WST",
        "XAF",
        "XCD",
        "XOF",
        "XPF",
        "YER",
        "ZAR",
        "ZMW",
        "ZWL",
      ],
      packageType: [
        "BulkyGoods",
        "Caravan",
        "Cars",
        "CustomCode",
        "Europallet",
        "ExpandableToughBags",
        "ExtraLargePack",
        "Furniture",
        "IndustryVehicles",
        "LargeCanadaPostBox",
        "LargeCanadaPostBubbleMailer",
        "LargeEnvelope",
        "Letter",
        "MailingBoxes",
        "MediumCanadaPostBox",
        "MediumCanadaPostBubbleMailer",
        "Motorbikes",
        "None",
        "OneWayPallet",
        "PackageThickEnvelope",
        "PaddedBags",
        "ParcelOrPaddedEnvelope",
        "Roll",
        "SmallCanadaPostBox",
        "SmallCanadaPostBubbleMailer",
        "ToughBags",
        "UPSLetter",
        "USPSFlatRateEnvelope",
        "USPSLargePack",
        "VeryLargePack",
        "Winepak",
      ],
    };

    let dropdownCurrentRow = 2; // For starting dropdown values in the dropdown sheet

    // Setting headers and policies dropdowns together
    Object.keys(headerKeys).forEach((header, index) => {
      try {
        const columnLetter = getColumnLetter(index);
        console.log(
          `Column Letter for header "${header}" at index ${index}: ${columnLetter}`
        );
        mainSheet.cell(`${columnLetter}1`).value(header);
        if (header === "*fulfillmentPolicyId" && shippingPoliciesList?.length) {
          // Shipping policies dropdown
          const shippingPolicyOptions = shippingPoliciesList.map(
            (policy) =>
              `${policy?.dataValues?.name}_${policy?.dataValues?.fulfillmentPolicyId}`
          );
          console.log("Shipping Policy Options: ", shippingPolicyOptions);

          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(shippingPolicyOptions.map((value) => [value]));

          const shippingPolicyDropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + shippingPolicyOptions.length - 1
            }`;
          console.log(
            "Shipping Policy Dropdown Range: ",
            shippingPolicyDropdownRange
          );

          if (shippingPolicyDropdownRange && columnLetter) {
            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: "list",
                formula1: shippingPolicyDropdownRange,
              });
          }

          dropdownCurrentRow += shippingPolicyOptions.length;
        } else if (
          header === "*paymentPolicyId" &&
          paymentPoliciesList?.length
        ) {
          // Payment policies dropdown
          const paymentPolicyOptions = paymentPoliciesList.map(
            (policy) =>
              `${policy?.dataValues?.name}_${policy?.dataValues?.paymentPolicyId}`
          );
          console.log("Payment Policy Options: ", paymentPolicyOptions);

          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(paymentPolicyOptions.map((value) => [value]));

          const paymentPolicyDropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + paymentPolicyOptions.length - 1
            }`;
          console.log(
            "Payment Policy Dropdown Range: ",
            paymentPolicyDropdownRange
          );

          if (paymentPolicyDropdownRange && columnLetter) {
            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: "list",
                formula1: paymentPolicyDropdownRange,
              });
          }

          dropdownCurrentRow += paymentPolicyOptions.length;
        } else if (header === "*returnPolicyId" && returnPoliciesList?.length) {
          // Return policies dropdown
          const returnPolicyOptions = returnPoliciesList.map(
            (policy) =>
              `${policy?.dataValues?.name}_${policy?.dataValues?.returnPolicyId}`
          );
          console.log("Return Policy Options: ", returnPolicyOptions);

          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(returnPolicyOptions.map((value) => [value]));

          const returnPolicyDropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + returnPolicyOptions.length - 1
            }`;
          console.log(
            "Return Policy Dropdown Range: ",
            returnPolicyDropdownRange
          );

          if (returnPolicyDropdownRange && columnLetter) {
            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: "list",
                formula1: returnPolicyDropdownRange,
              });
          }

          dropdownCurrentRow += returnPolicyOptions.length;
        } else if (header === "storeCategoryId" && categories?.length) {
          // Store Category dropdown
          const categoryOptions =
            categories?.map(
              (category) =>
                `${category?.dataValues?.categoryName}_${category?.dataValues?.categoryId}`
            ) || [];
          console.log("Category Options: ", categoryOptions);

          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(categoryOptions?.map((value) => [value]));

          const categoryDropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + categoryOptions.length - 1
            }`;
          console.log("Category Dropdown Range: ", categoryDropdownRange);

          if (categoryDropdownRange && columnLetter) {
            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: "list",
                formula1: categoryDropdownRange,
              });
          }

          dropdownCurrentRow += categoryOptions.length;
        } else if (enumValues[header]) {
          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(enumValues[header]?.map((value) => [value]));

          const headerDropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + enumValues[header].length - 1
            }`;
          console.log("Category Dropdown Range: ", headerDropdownRange);

          if (headerDropdownRange && columnLetter) {
            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: "list",
                formula1: headerDropdownRange,
              });
          }

          dropdownCurrentRow += enumValues[header].length;
        }
      } catch (error) {
        console.error(`Error setting header for column ${index}:`, error);
      }
    });

    console.log("aspectData :>> ", aspectData);

    // Aspect data handling (if required)
    let currentColumnIndex = Object.keys(headerKeys).length;
    aspectData?.map((aspect) => {
      console.log("aspect :>> ", aspect);
      const headerName = aspect?.aspectConstraint?.aspectRequired
        ? `*${aspect?.localizedAspectName}`
        : aspect?.localizedAspectName;
      const columnLetter = getColumnLetter(currentColumnIndex);
      mainSheet.cell(`${columnLetter}1`).value(headerName || "");

      if (aspect?.aspectValues && aspect?.aspectValues?.length > 0) {
        const options = aspect?.aspectValues?.map((val) => val.localizedValue);
        console.log("Options for aspect: ", options);

        dropdownSheet
          .cell(`A${dropdownCurrentRow}`)
          .value(options.map((value) => [value]));

        const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${dropdownCurrentRow + options.length - 1
          }`;
        console.log("Dropdown Range: ", dropdownRange);

        if (dropdownRange && columnLetter) {
          mainSheet
            .range(`${columnLetter}2:${columnLetter}100`)
            .dataValidation({
              type: "list",
              formula1: dropdownRange,
            });
        }

        dropdownCurrentRow += options.length;
      }

      currentColumnIndex++;
    });

    // Output the Excel file
    const excelBuffer = await workbook.outputAsync();
    res.setHeader("Content-Length", excelBuffer.length);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=data.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    console.error(error);
  }
};

exports.generateExcelForEbayBulkUpdate = async (
  accountName,
  userId,
  site,
  categoryId,
  workbook,
  mainSheet,
  dropdownSheet,
  cskuData,
  res
) => {
  try {
    // Initialize eBay API
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      siteId: site?.dataValues?.siteId,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });
    const [
      shippingPoliciesList,
      paymentPoliciesList,
      returnPoliciesList,
      categories,
    ] = await Promise.all([
      shippingPolicies.findAll({
        where: { userId, accountName },
        attributes: ["fulfillmentPolicyId", "name"],
      }),
      paymentPolicies.findAll({
        where: { userId, accountName },
        attributes: ["paymentPolicyId", "name"],
      }),
      returnPolicies.findAll({
        where: { userId, accountName },
        attributes: ["returnPolicyId", "name"],
      }),
      Catalogue.findAll({
        where: { userId, accountName },
        attributes: ["categoryId", "categoryName"],
      }),
    ]);
    let aspectData = null;
    try {
      const { aspects } =
        await eBay.commerce.taxonomy.getItemAspectsForCategory(
          site?.dataValues?.siteId,
          categoryId
        );
      aspectData = aspects;
    } catch (error) {
      console.error("Error fetching item aspects:", error);
    }

    // Define Headers
    const headerKeys = {
      "*channelId": "*channelId",
      "*sku": "*sku",
      "*siteId": "*siteId",
      "*title": "*title",
      "*description": "*description",
      "*categoryId": "*categoryId",
      "*categoryName": "*categoryName",
      "*quantity": "*quantity",
      "quantityLimitPerBuyer": "quantityLimitPerBuyer",
      "*country": "*country",
      "*conditionId": "*conditionId",
      "*price": "*price",
      "*currency": "*currency",
      "packageType": "packageType",
      "height": "height",
      "width": "width",
      "length": "length",
      "weight": "weight",
      "measureUnit": "measureUnit",
      "*images": "*images",
      "*location": "*location",
      "*fulfillmentPolicyId": "*fulfillmentPolicyId",
      "*paymentPolicyId": "*paymentPolicyId",
      "*returnPolicyId": "*returnPolicyId",
      "storeCategoryId": "storeCategoryId",
      "variant_sku": "variant_sku",
      "variant_price": "variant_price",
      "variant_quantity": "variant_quantity",
    };

    const enumValues = {
      measureUnit: ["English", "Metric"],
      "*conditionId": [
        "NEW_1000",
        "LIKE_NEW_2750",
        "NEW_OTHER_1500",
        "NEW_WITH_DEFECTS_1750",
        "CERTIFIED_REFURBISHED_2000",
        "EXCELLENT_REFURBISHED_2010",
        "VERY_GOOD_REFURBISHED_2020",
        "GOOD_REFURBISHED_2030",
        "SELLER_REFURBISHED_2500",
        "USED_EXCELLENT_3000",
        "USED_VERY_GOOD_4000",
        "USED_GOOD_5000",
        "USED_ACCEPTABLE_6000",
        "FOR_PARTS_OR_NOT_WORKING_7000",
      ],
      "*currency": [
        "AED",
        "AFN",
        "ALL",
        "AMD",
        "ANG",
        "AOA",
        "ARS",
        "AUD",
        "AWG",
        "AZN",
        "BAM",
        "BBD",
        "BDT",
        "BGN",
        "BHD",
        "BIF",
        "BMD",
        "BND",
        "BOB",
        "BRL",
        "BSD",
        "BTN",
        "BWP",
        "BYR",
        "BZD",
        "CAD",
        "CDF",
        "CHF",
        "CLP",
        "CNY",
        "COP",
        "CRC",
        "CUP",
        "CVE",
        "CZK",
        "DJF",
        "DKK",
        "DOP",
        "DZD",
        "EGP",
        "ERN",
        "ETB",
        "EUR",
        "FJD",
        "FKP",
        "GBP",
        "GEL",
        "GHS",
        "GIP",
        "GMD",
        "GNF",
        "GTQ",
        "GYD",
        "HKD",
        "HNL",
        "HRK",
        "HTG",
        "HUF",
        "IDR",
        "ILS",
        "INR",
        "IQD",
        "IRR",
        "ISK",
        "JMD",
        "JOD",
        "JPY",
        "KES",
        "KGS",
        "KHR",
        "KMF",
        "KPW",
        "KRW",
        "KWD",
        "KYD",
        "KZT",
        "LAK",
        "LBP",
        "LKR",
        "LRD",
        "LSL",
        "LTL",
        "LYD",
        "MAD",
        "MDL",
        "MGA",
        "MKD",
        "MMK",
        "MNT",
        "MOP",
        "MRO",
        "MUR",
        "MVR",
        "MWK",
        "MXN",
        "MYR",
        "MZN",
        "NAD",
        "NGN",
        "NIO",
        "NOK",
        "NPR",
        "NZD",
        "OMR",
        "PAB",
        "PEN",
        "PGK",
        "PHP",
        "PKR",
        "PLN",
        "PYG",
        "QAR",
        "RON",
        "RSD",
        "RUB",
        "RWF",
        "SAR",
        "SBD",
        "SCR",
        "SDG",
        "SEK",
        "SGD",
        "SHP",
        "SLL",
        "SOS",
        "SRD",
        "STD",
        "SYP",
        "SZL",
        "THB",
        "TJS",
        "TMT",
        "TND",
        "TOP",
        "TRY",
        "TTD",
        "TWD",
        "TZS",
        "UAH",
        "UGX",
        "USD",
        "UYU",
        "UZS",
        "VEF",
        "VND",
        "VUV",
        "WST",
        "XAF",
        "XCD",
        "XOF",
        "XPF",
        "YER",
        "ZAR",
        "ZMW",
        "ZWL",
      ],
      packageType: [
        "BulkyGoods",
        "Caravan",
        "Cars",
        "CustomCode",
        "Europallet",
        "ExpandableToughBags",
        "ExtraLargePack",
        "Furniture",
        "IndustryVehicles",
        "LargeCanadaPostBox",
        "LargeCanadaPostBubbleMailer",
        "LargeEnvelope",
        "Letter",
        "MailingBoxes",
        "MediumCanadaPostBox",
        "MediumCanadaPostBubbleMailer",
        "Motorbikes",
        "None",
        "OneWayPallet",
        "PackageThickEnvelope",
        "PaddedBags",
        "ParcelOrPaddedEnvelope",
        "Roll",
        "SmallCanadaPostBox",
        "SmallCanadaPostBubbleMailer",
        "ToughBags",
        "UPSLetter",
        "USPSFlatRateEnvelope",
        "USPSLargePack",
        "VeryLargePack",
        "Winepak",
      ],
    };

    // Add dynamic headers for variations
    let maxVariations = 0;
    cskuData.forEach((row) => {
      maxVariations = Math.max(maxVariations, row?.variation?.length || 0);
    });
    for (let i = 1; i <= maxVariations; i++) {
      headerKeys[`variant_option${i}_name`] = `variant_option${i}_name`;
      headerKeys[`variant_option${i}_value`] = `variant_option${i}_value`;
    }

    // Utility to set dropdowns
    const setFormatedDropdown = (
      columnLetter,
      options,
      field1,
      field2,
      dropdownRow
    ) => {
      // console.log('columnLetter :>> ', columnLetter);
      // console.log('options :>> ', options);
      // console.log('field1 :>> ', field1);
      // console.log('field2 :>> ', field2);
      // console.log('dropdownRow :>> ', dropdownRow);
      const optionValues = options?.map(
        (opt) =>
          `${opt?.dataValues?.[field1]}_${opt?.dataValues?.[field2] || ""}`
      ) || [];
      dropdownSheet
        .cell(`A${dropdownRow}`)
        .value(optionValues?.map((value) => [value]));
      const dropdownRange = `DropdownList!$A$${dropdownRow}:$A$${dropdownRow + options.length - 1
        }`;
      mainSheet
        .range(`${columnLetter}2:${columnLetter}100`)
        .dataValidation({ type: "list", formula1: dropdownRange });
      return dropdownRow + options?.length;
    };

    const setDropDown = (columnLetter, options, dropdownRow) => {
      dropdownSheet
        .cell(`A${dropdownRow}`)
        .value(options?.map((value) => [value]));

      const headerDropdownRange = `DropdownList!$A$${dropdownRow}:$A$${dropdownRow + options?.length - 1
        }`;

      mainSheet.range(`${columnLetter}2:${columnLetter}100`).dataValidation({
        type: "list",
        formula1: headerDropdownRange,
      });
      return dropdownRow + options.length;
    };

    // Apply Headers & Policies dropdowns
    let dropdownRow = 2; // Start dropdown values from row 2 in the dropdown sheet
    Object.keys(headerKeys).forEach((header, index) => {
      const columnLetter = getColumnLetter(index);
      mainSheet.cell(`${columnLetter}1`).value(header);
      if (enumValues[header])
        dropdownRow = setDropDown(
          columnLetter,
          enumValues[header],
          dropdownRow
        );
      if (header === "*fulfillmentPolicyId" && shippingPoliciesList?.length)
        dropdownRow = setFormatedDropdown(
          columnLetter,
          shippingPoliciesList,
          "name",
          "fulfillmentPolicyId",
          dropdownRow
        );
      if (header === "*paymentPolicyId" && paymentPoliciesList?.length)
        dropdownRow = setFormatedDropdown(
          columnLetter,
          paymentPoliciesList,
          "name",
          "paymentPolicyId",
          dropdownRow
        );
      if (header === "*returnPolicyId" && returnPoliciesList?.length)
        dropdownRow = setFormatedDropdown(
          columnLetter,
          returnPoliciesList,
          "name",
          "returnPolicyId",
          dropdownRow
        );
      if (header === "storeCategoryId" && categories?.length)
        dropdownRow = setFormatedDropdown(
          columnLetter,
          categories,
          "categoryName",
          "categoryId",
          dropdownRow
        );
    });

    const aspectHeaderKeys = [];
    let currentColumnIndex = Object.keys(headerKeys).length;
    aspectData?.map((aspect) => {
      const columnLetter = getColumnLetter(currentColumnIndex);
      const isRequired = aspect?.aspectConstraint?.aspectRequired;
      const headerName = isRequired
        ? `*${aspect?.localizedAspectName}`
        : aspect?.localizedAspectName;
      const options =
        aspect?.aspectValues?.length > 0
          ? aspect?.aspectValues?.map((val) => val.localizedValue)
          : [];
      mainSheet.cell(`${columnLetter}1`).value(headerName || "");
      aspectHeaderKeys.push({
        headerKey: headerName,
        name: aspect?.localizedAspectName,
        isRequired: isRequired,
        options: options,
      });
      if (aspect?.aspectValues && aspect?.aspectValues?.length > 0) {
        dropdownRow = setDropDown(columnLetter, options, dropdownRow);
        // console.log('dropdownRow :>> ', dropdownRow);
      }
      currentColumnIndex++;
    });
    // console.log('aspectHeaderKeys :>> ', aspectHeaderKeys);
    // Populate Data Rows
    let rowNumber = 2;
    for (let i = 0; i < cskuData?.length; i++) {
      const row = cskuData[i]?.dataValues;
      console.log('row :>> ', row);
      Object?.keys(headerKeys)?.forEach((header, index) => {
        const columnLetter = getColumnLetter(index);
        const value = row?.[header?.replace("*", "")?.trim()] || null;
        if (header?.includes("sku")) {
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(row["isku"] || "");
        } else if (header?.includes("measureUnit")) {
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(row["unit"] || "");
        } else if (header?.includes("images")) {
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(row["images"]?.join(",") || "");
        } else if (
          ["variant_sku", "variant_price", "variant_quantity"]?.includes(header)
        ) {
          if (row?.["variantId"] && row?.['variation']?.length) {
            if (header?.includes("variant_sku")) {
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(row["variantId"] || row["isku"] || "");
            } else if (header?.includes("variant_price")) {
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(row["price"] || "");
            } else if (header?.includes("variant_quantity")) {
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(row["quantity"] || "");
            }
          } else {

          }
        } else if (
          [
            "*fulfillmentPolicyId",
            "*paymentPolicyId",
            "*returnPolicyId",
          ]?.includes(header)
        ) {
          if (row["sellerProfile"]) {
            if (header?.includes("*fulfillmentPolicyId")) {
              const shippingPolicy =
                row?.["sellerProfile"]?.["SellerShippingProfile"];
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(
                  `${shippingPolicy?.ShippingProfileName}_${shippingPolicy?.ShippingProfileID}` ||
                  ""
                );
            } else if (header?.includes("*paymentPolicyId")) {
              const paymentPolicy =
                row?.["sellerProfile"]?.["SellerPaymentProfile"];
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(
                  `${paymentPolicy?.PaymentProfileName}_${paymentPolicy?.PaymentProfileID}` ||
                  ""
                );
            } else if (header?.includes("*returnPolicyId")) {
              const returnPolicy =
                row?.["sellerProfile"]?.["SellerReturnProfile"];
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(
                  `${returnPolicy?.ReturnProfileName}_${returnPolicy?.ReturnProfileID}` ||
                  ""
                );
            }
          }
        } else if (
          header?.includes("conditionId") &&
          enumValues["*conditionId"] &&
          row["conditionId"]
        ) {
          const conditionValues = enumValues["*conditionId"];
          const conditionValue = conditionValues.find((val) =>
            val?.includes(value)
          );
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(conditionValue || "");
        } else if (header?.includes("storeCategoryId")) {
          const categoryId = row?.["storeCategoryId"];
          const categoryName = row?.["storeCategoryName"];
          const catValue =
            categoryId && categoryName ? `${categoryName}_${categoryId}` : "";
          mainSheet.cell(`${columnLetter}${rowNumber}`).value(catValue || "");
        } else if (header?.includes("variant_option")) {
          const optionIndex = getOptionIndex(header);
          if (
            row?.["variation"]?.length &&
            optionIndex < row?.["variation"]?.length
          ) {
            const variation = row?.["variation"][optionIndex];
            const variationValue =
              header?.includes?.("name") ||
              variation?.["name"] ||
              variation?.["value"];
            mainSheet
              .cell(`${columnLetter}${rowNumber}`)
              .value(variationValue || "");
          } else {
            mainSheet.cell(`${columnLetter}${rowNumber}`).value("");
          }
        } else {
          mainSheet.cell(`${columnLetter}${rowNumber}`).value(value || "");
        }
      });

      // Item specific values
      const itemSpecific = row?.itemSpecifics?.[0] || {};
      let dynamicColumnIndex = Object.keys(headerKeys)?.length;
      for (const aspectHeader of aspectHeaderKeys) {
        const columnLetter = getColumnLetter(dynamicColumnIndex);
        const aspectValue = itemSpecific?.[aspectHeader?.name] || "";
        const val = Array.isArray(aspectValue)
          ? aspectValue?.join(",")
          : aspectValue;
        // Write the final value into the Excel sheet
        mainSheet.cell(`${columnLetter}${rowNumber}`).value(val);
        dynamicColumnIndex++;
      }
      rowNumber++;
    }
    console.log("Excel generation completed successfully");
    // Output the Excel file
    const excelBuffer = await workbook.outputAsync();
    res.setHeader("Content-Length", excelBuffer.length);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=data.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    console.error("Error generating Excel:", error);
    res.status(500).send({ message: "Failed to generate Excel file", error });
  }
};
function getOptionIndex(header) {
  const match = header.match(/variant_option(\d+)_/);

  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
exports.updateEbayInventory = async (token, csku, newData) => {
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
    authToken: token?.dataValues?.token || token?.token,
  });
  eBay.OAuth2.setCredentials(token?.dataValues?.token || token?.token);
  let startdate = moment().add(5, "hours").add(30, "minutes");
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

  if (hoursDifference >= 2) {
    refreshToken(eBay, token);
  }

  try {
    let payload = {
      Item: {
        ItemID: csku.dataValues.channelId,
        Quantity: newData.Quantity,
        ISKU: csku?.dataValues?.isku,
      },
    };
    if (
      newData?.Height ||
      newData?.Length ||
      newData?.Width ||
      newData?.weight
    ) {
      payload.Item.ShippingPackageDetails = {
        MeasurementUnit: "Metric",
      };
    }
    if (newData?.Height)
      payload.Item.ShippingPackageDetails.PackageLength = Number(
        newData?.Height
      );
    if (newData?.Length)
      payload.Item.ShippingPackageDetails.PackageDepth = Number(
        newData?.Length
      );
    if (newData?.Width)
      payload.Item.ShippingPackageDetails.PackageWidth = Number(
        newData?.Width
      );
    if (newData?.weight)
      payload.Item.ShippingPackageDetails.WeightMajor = Number(
        newData?.weight
      );
    if (newData?.weight)
      payload.Item.ShippingPackageDetails.WeightMinor = Number(
        newData?.weight
      );

    // If inventory update fails, revise the fixed-price item
    await eBay.trading.ReviseFixedPriceItem(payload);
    return {
      success: true,
      message: "Fixed price item revised successfully",
    };
  } catch (err) {
    console.log("Error revising fixed price item on eBay:", err);
    // Handle errors and push to cskusError
    const errorMessage =
      err.message === "Item cannot be accessed"
        ? "This item cannot be accessed because the listing has been deleted"
        : err.message;
    await apiCallLog(
      "ReviseItem",
      "updateEbayInventory",
      "updateEbayInventory",
      csku,
      err,
      err,
      "Failed",
    );
    return { success: false, message: errorMessage };
  }

};
exports.bulkUpdateEbayPriceAndQuantity = async (
  data,
  token,
  errorFile,
  successCounts,
  failedCounts
) => {
  console.log("Updating price and quantity on eBay", failedCounts);
  try {
    console.log("Updating price and quantity on eBay");
    // console.log('token :>> ', token);
    console.log("Data :>> ", data);

    // Set up the eBay API instance with the provided credentials
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false, // Production environment
      siteId: process.env.SITE_ID || 0,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
      authToken: token.token,
    });

    eBay.OAuth2.setCredentials(token?.token);

    // Custom logic to split the array into batches of 4
    const batchSize = 4;
    const toBeUpdated = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, "hours");

      // Refresh the token if it's more than 2 hours old
      if (hoursDifference >= 2) {
        try {
          await refreshToken(eBay, token);
        } catch (error) {
          console.log("Error refreshing token:", error);
          return;
        }
      }

      // Create request payload for the batch
      const requestPayload = {
        InventoryStatus: batch.map((item) => {
          let quantity = item.Quantity
          if (item.Quantity < 0) {
            quantity = 0
          }
          return item.variantId && item?.variantId !== "" && item?.channelId != item?.sku
            ? {
              ItemID: item.channelId,
              SKU: item.isku, // SKU for variant
              Quantity: quantity,
              StartPrice: item?.Price,
            }
            : {
              ItemID: item.channelId, // Regular product
              Quantity: quantity,
              StartPrice: item?.Price,
            };
        }),
      };

      // console.log('requestPayload :>> ', requestPayload?.InventoryStatus);

      try {
        // Update price and quantity on eBay
        const ebayResponse = await eBay.trading.ReviseInventoryStatus(
          requestPayload
        );
        console.log(
          "Updated price and quantity on eBay for batch:",
          ebayResponse
        );
        console.log(`Successfully updated ${batch.length} items on eBay`);

        // Update local CSKU table and increment success count
        for (const item of batch) {
          await csku.update(
            {
              quantity: item.Quantity,
              price: item?.Price,
            },
            {
              where: {
                channelId: item.channelId,
                isku: item?.sku,
              },
            }
          );
          console.log(`Successfully updated CSKU for SKU: ${item.sku}`);
          const errorDetails = {
            channelId: item?.channelId,
            sku: item?.isku,
            variantId: item?.variantId,
            currency: item?.Currency,
            price: item?.Price,
            quantity: item?.Quantity,
            error: [], // Capture error message
            statusCode: 200
          };
          errorFile.push(errorDetails); // Add error details to errorFile array
          successCounts++;

          toBeUpdated.push({
            id: item.productId,
            quantity: item.Quantity,
            price: item?.Price,
          });

        }
      } catch (err) {
        console.error("Error updating eBay for batch:", err.meta);

        // Store error details for the failed batch
        for (const item of batch) {
          const errorDetails = {
            channelId: item?.channelId,
            sku: item?.isku,
            variantId: item?.variantId,
            currency: item?.Currency,
            price: item?.Price,
            quantity: item?.Quantity,
            error: err?.meta, // Capture error message
          };
          errorFile.push(errorDetails); // Add error details to errorFile array
          failedCounts++; // Increment failed count
        }
      }
    }

    if (toBeUpdated.length && toBeUpdated.length > 0) {
      await csku.bulkCreate(toBeUpdated, {
        updateOnDuplicate: ["quantity", "price"],
      });
    }

    // Optionally, write the errorFile to disk or return it after processing
    console.log("Success Counts:", successCounts);
    console.log("Failed Counts:", failedCounts);
    return { successCounts, failedCounts, failedProducts: errorFile };
  } catch (err) {
    console.error("Error in updateEbayPriceAndQuantity:", err);
  }
};
// exports.upsertEbayProduct = async (
//   userId,
//   accountName,
//   marketplaceId,
//   token,
//   siteId,
//   product,
//   sellerProfile,
//   storeCategory,
//   primaryCategory,
//   categoryAspects,
//   variants,
//   groupProductId,
//   channelId,
//   source
// ) => {
//   // Step 1: Field validation
//   const requiredFields = [
//     userId,
//     accountName,
//     marketplaceId,
//     token,
//     siteId,
//     product?.isku,
//     product?.title,
//     product?.description,
//     product?.price,
//     product?.currency,
//     product?.quantity,
//     product?.images,
//     product?.country,
//     product?.conditionId,
//     product?.location,
//     sellerProfile,
//     primaryCategory,
//     categoryAspects,
//   ];
//   console.log("starting to upload");
//   console.log("channelId ---------------", channelId)
//   if (requiredFields.some((field) => !field)) {
//     console.log(userId,
//       accountName,
//       marketplaceId,
//       token,
//       siteId,
//       product?.isku,
//       product?.title,
//       product?.description,
//       product?.price,
//       product?.currency,
//       product?.quantity,
//       product?.images,
//       product?.country,
//       product?.conditionId,
//       product?.location,
//       sellerProfile,
//       primaryCategory,
//       categoryAspects, channelId, "all fields")
//     throw Error("Missing required fields. Please check your input.");
//   }


//   const isVariantProduct = variants && variants.length > 0;
//   const whereClouse = isVariantProduct
//     ? {
//       marketplaceId,
//       variantGroupId: product?.isku,
//     }
//     : {
//       marketplaceId,
//       isku: product?.isku,
//     };
//     console.log(siteId, "siteId inside upsertEbayProduct")
//   try {
//     const geoSite = await Geosite.findOne({ where: { globalId: siteId } });
//     const convertToCurrency = geoSite?.currency;
//     // Step 2: Function to convert currency
//     const convertCurrency = async (amount, fromCurrency) => {
//       if (fromCurrency !== convertToCurrency) {
//         try {
//           const response = await axios.post(
//             "https://marketplaces.sellerpundit.com/currency/convert",
//             {
//               currency: fromCurrency,
//               amount: Number(amount),
//               convertedTo: convertToCurrency,
//             }
//           );
//           return response?.data?.data || amount;
//         } catch (error) {
//           return amount;
//         }
//       }
//       return amount; // No conversion needed
//     };

//     // Step 3: Prepare common SKU data
//     let cskuData = {
//       userId,
//       accountName,
//       marketplaceId,
//       currency: product.currency,
//       images: product.images,
//       quantityLimitPerBuyer: Number(product.quantityLimitPerBuyer || 0),
//       packageType: product.packagingDetails?.packageType || null,
//       height: Number(product.packagingDetails?.dimensions?.height || 0) || null,
//       depth: Number(product.packagingDetails?.dimensions?.length || 0) || null,
//       width: Number(product.packagingDetails?.dimensions?.width || 0) || null,
//       unit: product.packagingDetails?.unit || null,
//       weight: Number(product.packagingDetails?.weight?.value || 0) || null,
//       weightUnit: null,
//       categoryId: primaryCategory.id,
//       categoryName: primaryCategory.name,
//       storeCategoryId: storeCategory?.storeCategoryId || null,
//       storeCategoryName: storeCategory?.storeCategoryName || null,
//       siteId,
//       groupProductId,
//       itemSpecifics: [categoryAspects],
//       sellerProfile,
//       merchantLocation: product.location,
//     };

//     console.log(cskuData, "csku data prepared");


//     // Step 4: Refresh eBay token if needed
//     const eBay = new ebay({
//       appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
//       certId: "PRD-fb4fbfcd-a1fb9933",
//       sandbox: false,
//       autoRefreshToken: true,
//       siteId: geoSite?.dataValues?.siteId,
//       devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
//     });

//     eBay.oAuth2.setCredentials(token?.token);
//     if (moment().add(5, "hours").add(30, "minutes").diff(moment(token.lastTokenRefreshDate), "hours") >= 2) {
//       await refreshToken(eBay, token);
//     }

//     //NOTE  Step 5: Translate title and description if needed
//     const translateData = async (text, context) => {
//       if (!text || geoSite?.languageCode === "en") return text;
//       try {
//         const response = await eBay.commerce.translation.translate({
//           from: "en",
//           to: geoSite?.languageCode,
//           text: [text.replace("&", "and")],
//           translationContext: context,
//         });
//         return response.translations[0]?.translatedText || text;
//       } catch (error) {
//         return text;
//       }
//     };

//     const updatedTitle = await translateData(product.title, "ITEM_TITLE");
//     const updatedDescription = await translateData(
//       product.description,
//       "ITEM_DESCRIPTION"
//     );

//     // Step 6: Handle variants and price conversion
//     let variations = [];
//     if (isVariantProduct) {
//       for (let variant of variants) {
//         const price = await convertCurrency(variant.price, product.currency);
//         const variantFields = {
//           channelId: "To Be Listed",
//           variantGroupId: product?.isku,
//           variantId: variant?.sku,
//           isku: variant?.sku,
//           price,
//           quantity: variant?.quantity,
//           title: updatedTitle,
//           description: updatedDescription,
//           variation: variant?.options,
//         };
//         variations.push({
//           SKU: variant.sku,
//           StartPrice: price,
//           Quantity: variant.quantity,
//           VariationSpecifics: {
//             NameValueList: variant?.options?.map((opt) => ({
//               Name: opt.name,
//               Value: opt.value,
//             })),
//           },
//         });
//         const variantCskuData = { ...cskuData, ...variantFields };

//         // Check if the variant already exists
//         const existingCsku = await csku.findOne({
//           where: { isku: variant.sku, marketplaceId },
//         });
//         if (existingCsku && source !== "mainFunction") {
//           await csku.update(variantCskuData, {
//             where: { isku: variant.sku, marketplaceId },
//           });
//         } else {
//           await csku.create(variantCskuData);
//         }
//       }
//     } else {
//       const price = await convertCurrency(product.price, product.currency);
//       const singleProductFields = {
//         isku: product.isku,
//         price,
//         quantity: product.quantity,
//         channelId: "To Be Listed",
//       };

//       const singleProductCskuData = { ...cskuData, ...singleProductFields };

//       // Check if the single product already exists
//       const existingCsku = await csku.findOne({
//         where: { isku: product.isku, marketplaceId },
//       });
//       if (existingCsku && source !== "mainFunction") {
//         await csku.update(singleProductCskuData, {
//           where: { isku: product.isku, marketplaceId },
//         });
//       } else {
//         await csku.create(singleProductCskuData);
//       }
//     }

//     if (isVariantProduct && variants?.length) {
//       variants.forEach((variant) => {
//         variant?.options?.forEach((option) => {
//           variantSpecificList[option.name] =
//             variantSpecificList[option.name] || new Set();
//           variantSpecificList[option.name].add(option.value);
//         });
//       });

//       Object.keys(variantSpecificList)?.forEach((asp) => {
//         if (categoryAspects[asp]) {
//           delete categoryAspects[asp];
//         }
//       });
//     }
//     // Step 8: Prepare the eBay listing request

//     const ebayRequest = {
//       Item: {
//         Title: updatedTitle,
//         Description: updatedDescription,
//         PrimaryCategory: {
//           CategoryID: primaryCategory.id,
//           CategoryName: primaryCategory.name,
//         },
//         Country: product.countryCode,
//         Currency: convertToCurrency,
//         StartPrice: isVariantProduct
//           ? Math.min(...variants.map((v) => v?.price))
//           : product.price,
//         Quantity: isVariantProduct
//           ? variants.reduce((sum, v) => sum + (v.quantity || 0), 0)
//           : product.quantity,
//         QuantityRestrictionPerBuyer: {
//           MaximumQuantity: product.quantityLimitPerBuyer,
//         },
//         ConditionID: product.conditionId,
//         ListingDuration: "GTC",
//         Location: product.location,
//         ItemSpecifics: {
//           NameValueList: Object.entries(categoryAspects)?.map(
//             ([key, value]) => ({ Name: key, Value: value })
//           ),
//         },
//         PictureDetails: {
//           GalleryType: "Gallery",
//           PictureURL: product.images.slice(0, 12),
//         },
//         SellerProfiles: sellerProfile,
//       },
//     };

//     console.log(ebayRequest, "ebay request created");


//     if (product?.quantityLimitPerBuyer) {
//       ebayRequest.Item.QuantityRestrictionPerBuyer = {
//         MaximumQuantity: product.quantityLimitPerBuyer,
//       };
//     }
//     if (product.packagingDetails) {
//       ebayRequest.Item.ShippingPackageDetails = {
//         MeasurementUnit: product.packagingDetails.unit,
//         PackageDepth: product.packagingDetails.dimensions?.height,
//         PackageLength: product.packagingDetails.dimensions?.length,
//         PackageWidth: product.packagingDetails.dimensions?.width,
//         ShippingIrregular: product.packagingDetails.shippingIrregular,
//         ShippingPackage: product.packagingDetails.packageType,
//         WeightMajor: product.packagingDetails.weight?.value,
//         WeightMinor: product.packagingDetails.weight?.value,
//       };
//     }

//     if (storeCategory) {
//       ebayRequest.Item.Storefront = {
//         StoreCategoryID: storeCategory.storeCategoryId,
//         StoreCategoryName: storeCategory.storeCategoryName,
//       };
//     }

//     if (isVariantProduct && variations?.length) {
//       ebayRequest.Item.Variations = {
//         VariationSpecificsSet: {
//           NameValueList: Object.keys(variantSpecificList).map((key) => ({
//             Name: key,
//             Value: Array.from(variantSpecificList[key]),
//           })),
//         },
//         Variation: variations,
//       };
//     }

//     // Step 9: Create or update eBay listing
//     let ebayResponse;
//     if (channelId) {
//       //const cskuData = await csku.findByPk(channelId);
//       // const productChannelId = cskuData?.dataValues?.channelId;
//       const productChannelId = channelId;
//       if (productChannelId && productChannelId !== 'To Be Listed') {
//         ebayRequest.Item.ItemID = productChannelId;
//         ebayResponse = await eBay.trading.ReviseFixedPriceItem(ebayRequest);
//         console.log(`Updated product: ${ebayResponse.ItemID}`);
//       } else {
//         ebayResponse = await eBay.trading.AddFixedPriceItem(ebayRequest);
//         console.log(`Listed product: ${ebayResponse.ItemID}`);
//       }
//     } else {
//       ebayResponse = await eBay.trading.AddFixedPriceItem(ebayRequest);
//       console.log(`Listed product: ${ebayResponse.ItemID}`);
//     }

//     if (ebayResponse.ItemID) {
//       console.log("channelId of listed product: -----------", ebayResponse.ItemID)
//       if(source !== "mainFunction") {
//       await csku.update(
//         { status: ProductListingStatus.LIVE, channelId: ebayResponse.ItemID },
//         { where: { ...whereClouse } }
//       );}
//       return {
//         status: true,
//         statusCode: 200,
//         message: "Product listed successfully on eBay",
//         channelId: ebayResponse.ItemID,
//       };
//     } else {
//       console.error("eBay listing error:", ebayResponse.Errors);
//       if(source !== "mainFunction") {
//       await csku.update(
//         { status: ProductListingStatus.FAILED },
//         { where: { ...whereClouse } }
//       );}
//       return {
//         status: false,
//         statusCode: 500,
//         message: "Failed to list product on eBay",
//         errors: ebayResponse.Errors,
//       };
//     }
//   } catch (error) {
//     console.error("Error in upsertEbayProduct:", error.meta);
//     if (error?.meta?.ItemID) {
//       await csku.update(
//         { status: ProductListingStatus.LIVE, channelId: error?.meta?.ItemID },
//         { where: { ...whereClouse } }
//       );
//       return {
//         status: true,
//         statusCode: 200,
//         message: "Product listed successfully on eBay",
//         channelId: error?.meta?.ItemID,
//       };
//     } else {
//       console.error("eBay listing error:", error);
//       await csku.update(
//         { status: ProductListingStatus.FAILED },
//         { where: { ...whereClouse } }
//       );
//       return {
//         status: false,
//         statusCode: 500,
//         message: "Failed to list product on eBay",
//         errors: error?.meta?.message,
//       };
//     }
//   }
// };

exports.uploadVideos = async (videoLink, destination_account) => {
  try {

    let videoId;
    // Download video
    const videoUrl = videoLink;
    const videoBufferResponse = await axios.get(videoUrl, {
      responseType: "arraybuffer",
    });
    const videoBuffer = videoBufferResponse.data;

    // Create video metadata
    const createVideoResponse = await axios.post(
      "https://apim.ebay.com/commerce/media/v1_beta/video",
      {
        classification: ["ITEM"],
        description: "Product video",
        size: videoBuffer.byteLength,
        title: "Product Showcase Video",
      },
      {
        headers: {
          Authorization: `Bearer ${destination_account.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Extract video ID from response
    const video_id = createVideoResponse.headers.location
      .split("/")
      .pop();
    console.log("eBay Video ID:", video_id);

    // Prepare video upload request
    const form = new FormData();
    form.append("video", videoBuffer, {
      filename: "product_video.mp4",
    });

    const uploadUrl = `https://apim.ebay.com/commerce/media/v1_beta/video/${video_id}/upload`;

    // Upload video to eBay
    await axios.post(uploadUrl, videoBuffer, {
      headers: {
        Authorization: `Bearer ${destination_account.token}`,
        "Content-Type": "application/octet-stream",
      },
    });

    console.log("Video uploaded successfully.");
    videoId = video_id;
    console.log("Video ID:", videoId);
    return videoId
  } catch (error) {
    console.error("Error uploading video:", error);
    throw error;
  }

}

exports.convertCompatibility = async (input, compatibilityProperties) => {
  const converted = input.map(vehicle => {
    const nameValueList = [];

    // Add each field only if it exists and is non-empty
    if (vehicle.year) {
      const foundYearKey = compatibilityProperties.compatibilityProperties.find(
        property => property.name.toLowerCase().includes("year")
      );
      if (foundYearKey) {
        nameValueList.push({ Name: foundYearKey.name, Value: vehicle.year });
      }
    }

    if (vehicle.make) {
      const foundMakeKey = compatibilityProperties.compatibilityProperties.find(
        property => property.name.toLowerCase().includes("make")
      );
      if (foundMakeKey) {
        nameValueList.push({ Name: foundMakeKey.name, Value: vehicle.make });
      }
    }

    if (vehicle.model) {
      const foundModelKey = compatibilityProperties.compatibilityProperties.find(
        property => property.name.toLowerCase().includes("model")
      );
      if (foundModelKey) {
        nameValueList.push({ Name: foundModelKey.name, Value: vehicle.model });
      }
    }

    if (vehicle.trim) {
      const foundTrimKey = compatibilityProperties.compatibilityProperties.find(
        property => property.name.toLowerCase().includes("trim")
      );
      if (foundTrimKey) {
        nameValueList.push({ Name: foundTrimKey.name, Value: vehicle.trim });
      }
    }

    if (vehicle.submodel) {
      const foundSubmodelKey = compatibilityProperties.compatibilityProperties.find(
        property => property.name.toLowerCase().includes("submodel")
      );
      if (foundSubmodelKey) {
        nameValueList.push({ Name: foundSubmodelKey.name, Value: vehicle.submodel });
      }
    }

    // Optional hardcoded engine data (can be made dynamic)
    // nameValueList.push({
    //   Name: "Engine",
    //   Value: "3.5L 3498CC V6 GAS DOHC Naturally Aspirated"
    // });

    return { NameValueList: nameValueList };
  });

  return converted;
}

exports.upsertEbayProduct = async (
  userId,
  accountName,
  marketplaceId,
  token,
  siteId,
  product,
  sellerProfile,
  storeCategory,
  primaryCategory,
  categoryAspects,
  variants,// Also pass variants of source and destination
  groupProductId,
  channelId = null,
  source,
  config_id = null,
  version = null,
  sourceAccountName = null,
  source_channel_id = null,
  videoLink = null,
  compatibility = null,
  aPlusDescription = null,
  gpsrDetails = null,
) => {
  // Step 1: Field validation
  const requiredFields = [
    userId,
    accountName,
    marketplaceId,
    token,
    siteId,
    product?.isku,
    product?.title,
    product?.description,
    product?.price,
    product?.currency,
    product?.quantity.toString(),
    product?.images,
    product?.country,
    product?.conditionId,
    product?.location,
    sellerProfile,
    primaryCategory,
    categoryAspects,
  ];
  console.log("starting to upload");
  console.log(requiredFields, "required fields")
  console.log("channelId ---------------", channelId)
  if (requiredFields.some((field) => !field)) {
    console.log(userId,
      accountName,
      marketplaceId,
      token,
      siteId,
      product?.isku,
      product?.title,
      product?.description,
      product?.price,
      product?.currency,
      product?.quantity,
      product?.images,
      product?.country,
      product?.conditionId,
      product?.location,
      sellerProfile,
      primaryCategory,
      categoryAspects, "all fields")
    throw Error("Missing required fields. Please check your input.");
  }
  let variantMap
  if (variants?.variantMap) {
    variantMap = variants.variantMap;
    delete variants.variantMap;
  }
  console.log("variant Map >> ", variantMap)
  console.log("Config ID >> ", config_id)
  console.log("Ebay Variation >> ", JSON.stringify(variants));

  const isVariantProduct = variants && variants.length > 0;
  let variationNames;
  if (source === "mainFunction") {
    variationNames = variants?.VariationSpecificsSet?.NameValueList.map((data) => data.Name.toLowerCase());
  } else {
    variationNames = variants?.attributes.map(attr => attr.name.toLowerCase());
  }
  console.log("variationNames", variationNames)
  const whereClouse = isVariantProduct
    ? {
      marketplaceId,
      variantGroupId: product?.isku,
      userId,
      accountName
    }
    : {
      marketplaceId,
      isku: product?.isku,
      userId,
      accountName
    };
  console.log(siteId, "siteId inside upsertEbayProduct")
  try {
    const geoSite = await Geosite.findOne({ where: { globalId: siteId } });
    const convertToCurrency = geoSite?.currency;
    // // Step 2: Function to convert currency
    // const convertCurrency = async (amount, fromCurrency) => {
    //   if (fromCurrency !== convertToCurrency) {
    //     try {
    //       const response = await axios.post(
    //         "https://marketplaces.sellerpundit.com/currency/convert",
    //         {
    //           currency: fromCurrency,
    //           amount: Number(amount),
    //           convertedTo: convertToCurrency,
    //         }
    //       );
    //       return response?.data?.data || amount;
    //     } catch (error) {
    //       return amount;
    //     }
    //   }
    //   return amount; // No conversion needed
    // };

    // Step 3: Prepare common SKU data
    let cskuData = {
      userId,
      accountName,
      marketplaceId,
      currency: product.currency,
      images: product.images,
      quantityLimitPerBuyer: Number(product.quantityLimitPerBuyer || 0),
      packageType: product.packagingDetails?.packageType || null,
      height: Number(product.packagingDetails?.dimensions?.height || 0) || null,
      depth: Number(product.packagingDetails?.dimensions?.length || 0) || null,
      width: Number(product.packagingDetails?.dimensions?.width || 0) || null,
      unit: product.packagingDetails?.unit || null,
      weight: Number(product.packagingDetails?.weight?.value || 0) || null,
      weightUnit: null,
      categoryId: primaryCategory.id,
      categoryName: primaryCategory.name,
      storeCategoryId: storeCategory?.storeCategoryId || null,
      storeCategoryName: storeCategory?.storeCategoryName || null,
      siteId,
      groupProductId,
      itemSpecifics: [categoryAspects],
      sellerProfile,
      merchantLocation: product.location,
    };

    // console.log(cskuData, "csku data prepared");


    // Step 4: Refresh eBay token if needed
    const eBay = new ebay({
      appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
      certId: "PRD-fb4fbfcd-a1fb9933",
      sandbox: false,
      autoRefreshToken: true,
      siteId: geoSite?.dataValues?.siteId,
      devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
    });

    eBay.oAuth2.setCredentials(token?.token);
    if (moment().add(5, "hours").add(30, "minutes").diff(moment(token.lastTokenRefreshDate), "hours") >= 2) {
      await refreshToken(eBay, token);
    }

    //NOTE  Step 5: Translate title and description if needed
    const translateData = async (text, context) => {
      if (!text || geoSite?.languageCode === "en") return text;
      try {
        const response = await eBay.commerce.translation.translate({
          from: "en",
          to: geoSite?.languageCode,
          text: [text.replace("&", "and")],
          translationContext: context,
        });
        return response.translations[0]?.translatedText || text;
      } catch (error) {
        return text;
      }
    };

    const updatedTitle = await translateData(product.title, "ITEM_TITLE");
    const updatedDescription = await translateData(
      product.description,
      "ITEM_DESCRIPTION"
    );

    let newProduct = null

    let videoId = null;
    if (videoLink) {

      videoId = await this.uploadVideos(videoLink, token);

    }

    let itemComaptibility = null;
    if (compatibility && compatibility.length && compatibility.length > 0) {

      const compatibilityProperties = await eBay.commerce.taxonomy.getCompatibilityProperties(geoSite?.dataValues?.siteId, primaryCategory.id);
      console.log(compatibilityProperties, "compatibilityProperties ---")
      itemComaptibility = await this.convertCompatibility(compatibility, compatibilityProperties);
      console.log(JSON.stringify(itemComaptibility), "itemComaptibility -----")
    }

    let description = product.description;

    const aspects = Object.entries(categoryAspects).map(
      ([key, value]) => ({ key: key, value: value })
    );

    if (aPlusDescription) {
      const descTemplate = await Template.findOne({
        where: {
          id: aPlusDescription,
        },
      });

      if (!descTemplate) {
        throw new Error("Template not found");
      }

      let ejsData = {}

      if (
        descTemplate?.dataValues?.ejsKeys &&
        descTemplate?.dataValues?.ejsKeys.length > 0
      ) {
        descTemplate?.dataValues?.ejsKeys.forEach((key) => {
          switch (key) {
            case "title":
              ejsData["title"] = product.title;
              break;
            case "description":
              ejsData["description"] = product.description;
              break;
            case "specifications":
              ejsData["specifications"] = aspects;
              break;
            case "images":
              ejsData["images"] = product.images.slice(0, 5);
              break;
            default:
              break;
          }
        });

        description = await ejs.render(
          descTemplate.dataValues.ejs,
          ejsData
        );
      }

    }

    // Step 6: Handle variants and price conversion
    // let variations = [];
    // if (isVariantProduct) {
    //   for (let variant of variants) {
    //     const price = await convertCurrency(variant.price, product.currency);
    //     const variantFields = {
    //       channelId: "To Be Listed",
    //       variantGroupId: product?.isku,
    //       variantId: variant?.sku,
    //       isku: variant?.sku,
    //       price,
    //       quantity: variant?.quantity,
    //       title: updatedTitle,
    //       description: updatedDescription,
    //       variation: variant?.options,
    //     };
    //     variations.push({
    //       SKU: variant.sku,
    //       StartPrice: price,
    //       Quantity: variant.quantity,
    //       VariationSpecifics: {
    //         NameValueList: variant?.options?.map((opt) => ({
    //           Name: opt.name,
    //           Value: opt.value,
    //         })),
    //       },
    //     });
    //     const variantCskuData = { ...cskuData, ...variantFields };

    //     if (channelId) {

    //       // Check if the variant already exists
    //       const existingCsku = await csku.findOne({
    //         where: {
    //           isku: variant.sku,
    //           marketplaceId,
    //           channelId,
    //           userId,
    //           accountName
    //         },
    //       });
    //       if (existingCsku && source !== "mainFunction") {
    //         await csku.update(variantCskuData, {
    //           where: { isku: variant.sku, marketplaceId },
    //         });
    //       }
    //     } else {
    //       newProduct = await csku.create(variantCskuData);
    //     }

    //   }
    // } else {
    //   const price = await convertCurrency(product.price, product.currency);
    //   const singleProductFields = {
    //     isku: product.isku,
    //     price,
    //     quantity: product.quantity,
    //     channelId: "To Be Listed",
    //   };

    //   const singleProductCskuData = { ...cskuData, ...singleProductFields };

    //   // Check if the single product already exists
    //   if (channelId) {
    //     const existingCsku = await csku.findOne({
    //       where: {
    //         isku: product.isku,
    //         marketplaceId,
    //         channelId,
    //         userId,
    //         accountName
    //       },
    //     });
    //     if (existingCsku && source !== "mainFunction") {
    //       await csku.update(singleProductCskuData, {
    //         where: { isku: product.isku, marketplaceId },
    //       });
    //     }
    //   } else {
    //     newProduct = await csku.create(singleProductCskuData);
    //   }
    // }
    // console.log(variations, "variations created")
    // let variantSpecificList = {};
    // if (isVariantProduct && variants?.length) {
    //   variations.forEach((variant) => {
    //     variant?.options?.forEach((option) => {
    //       variantSpecificList[option.name] =
    //         variantSpecificList[option.name] || new Set();
    //       variantSpecificList[option.name].add(option.value);
    //     });
    //   });

    //   console.log(variantSpecificList, "variantSpecificList")

    //   // Object.keys(variantSpecificList)?.forEach((asp) => {
    //   //   if (categoryAspects[asp]) {
    //   //     delete categoryAspects[asp];
    //   //   }
    //   // });
    // }
    // Step 8: Prepare the eBay listing request

    const ebayRequest = {
      Item: {
        Title: updatedTitle,
        Description: description,
        PrimaryCategory: {
          CategoryID: primaryCategory.id,
          CategoryName: primaryCategory.name,
        },
        Country: product.country,
        Currency: convertToCurrency,
        SKU: product.isku,
        StartPrice: product.price,
        Quantity: product.quantity,
        ...(product?.quantityLimitPerBuyer && {
          QuantityRestrictionPerBuyer: {
            MaximumQuantity: product?.quantityLimitPerBuyer,
          },
        }),
        Variations: [],
        ...(product?.storeCategoryId && {
          Storefront: {
            StoreCategoryID: product.storeCategoryId,
          },
        }),
        ConditionID: product.conditionId,
        ListingDuration: "GTC",
        Location: product.location,
        ItemSpecifics: {
          NameValueList: Object.entries(categoryAspects)?.map(
            ([key, value]) => {
              if (!variationNames?.includes(key.toLowerCase())) {
                return {
                  Name: key,
                  Value: value
                };
              }
            }
          ),
        },
        PictureDetails: {
          GalleryType: "Gallery",
          PictureURL: product.images.slice(0, 12),
        },
        SellerProfiles: sellerProfile,
      },
    };

    let handleVariations = [];
    if (variants && Object.keys(variants).length > 0) {
      const { attributes, combinations } = variants

      // Process all variation combinations
      combinations.forEach(combination => {
        const variationSpecifics = {};

        // Add each attribute to the variation specifics
        attributes.forEach(attr => {
          if (combination[attr.name]) {
            variationSpecifics[attr.name] = [combination[attr.name]];
          }
        });

        // Add this variation to the list
        handleVariations.push({
          SKU: `${product.isku}-${Object.values(variationSpecifics).flat().join('-')}`,
          Quantity: combination.quantity,
          StartPrice: combination.price,
          VariationSpecifics: {
            NameValueList: Object.entries(variationSpecifics).map(([name, values]) => ({
              Name: name,
              Value: values
            }))
          }
        });
      });

      // Add the variation set to the request
      ebayRequest.Item.Variations = {
        Variation: handleVariations,
        VariationSpecificsSet: {
          NameValueList: attributes.map(attr => ({
            Name: attr.name,
            Value: attr.options.map(option => option.value)
          }))
        }
      };
    } else {
      delete ebayRequest.Item.Variations;
    }

    if (handleVariations && handleVariations.length > 0) {

      delete ebayRequest.Item.StartPrice;
      delete ebayRequest.Item.Quantity;

    }

    if (videoId) {
      ebayRequest.Item.VideoDetails = {
        VideoID: [videoId]
      }
    }

    if (itemComaptibility) {
      ebayRequest.Item.ItemCompatibilityList = {
        Compatibility: itemComaptibility
      }
    }

if (gpsrDetails && Object.keys(gpsrDetails).length > 0) {
      console.log("Inside gpsr")
      ebayRequest.Item.Regulatory = {
        ResponsiblePersons: {
          ResponsiblePerson: 
            {
              CityName: gpsrDetails.city,
              CompanyName: gpsrDetails.company_name,
              ContactURL: gpsrDetails.contact_url,
              Country: gpsrDetails.country,
              Email: gpsrDetails.email,
              Phone: gpsrDetails.phone,
              PostalCode: gpsrDetails.postal_code,
              StateOrProvince: gpsrDetails.state_or_province,
              Street1: gpsrDetails.street1,
              Street2: gpsrDetails.street2,
              Types: {
                Type: gpsrDetails.type
              }
            }
          
        }
      }
    }

    // console.log(ebayRequest, "ebay request created");


    // if (product?.quantityLimitPerBuyer) {
    //   ebayRequest.Item.QuantityRestrictionPerBuyer = {
    //     MaximumQuantity: product.quantityLimitPerBuyer,
    //   };
    // }

    if (product.packagingDetails && product.packagingDetails.unit) {
      ebayRequest.Item.ShippingPackageDetails = {
        MeasurementUnit: product.packagingDetails.unit,
        PackageDepth: product.packagingDetails.dimensions?.height,
        PackageLength: product.packagingDetails.dimensions?.length,
        PackageWidth: product.packagingDetails.dimensions?.width,
        ShippingIrregular: product.packagingDetails.shippingIrregular,
        ShippingPackage: product.packagingDetails.packageType,
        WeightMajor: product.packagingDetails.weight?.value,
        WeightMinor: product.packagingDetails.weight?.value,
      };
    }
    if (product?.storeCategoryId) {
      ebayRequest.Item.Storefront = {
        StoreCategoryID: product.storeCategoryId,
      };
    }

    if (variants && Object.keys(variants).length == 0) {
      ebayRequest.Item.StartPrice = product.price;
      ebayRequest.Item.Quantity = product.quantity;
    }


    // if (isVariantProduct && variations?.length) {
    //   ebayRequest.Item.Variations = {
    //     VariationSpecificsSet: {
    //       NameValueList: Object.keys(variantSpecificList).map((key) => ({
    //         Name: key,
    //         Value: Array.from(variantSpecificList[key]),
    //       })),
    //     },
    //     Variation: variations,
    //   };
    // }

    // Step 9: Create or update eBay listing
    let ebayResponse;

    if (channelId) {
      //const cskuData = await csku.findByPk(channelId);
      // const productChannelId = cskuData?.dataValues?.channelId;
      const productChannelId = channelId;
      if (productChannelId && productChannelId !== 'To Be Listed') {
        ebayRequest.Item.ItemID = productChannelId;
        ebayResponse = await eBay.trading.ReviseFixedPriceItem(ebayRequest);
        console.log(`Updated product: ${ebayResponse.ItemID}`);
      } else {
        ebayResponse = await eBay.trading.AddFixedPriceItem(ebayRequest);
        console.log(`Listed product: ${ebayResponse.ItemID}`);
      }
    } else {
      ebayResponse = await eBay.trading.AddFixedPriceItem(ebayRequest);
      console.log(ebayResponse, "ebay response");
      require("fs").writeFileSync("ebayRequest.json", JSON.stringify(ebayRequest.meta || ebayRequest, null, 2));
      console.log(`Listed product: ${ebayResponse.ItemID}`);
    }

    if (ebayResponse.ItemID) {
      console.log("channelId of listed product: -----------", ebayResponse.ItemID)
      await apiCallLog(
        "upsertEbayProduct",
        "AddFixedPricedItem",
        "AddFIxedPricedItem",
        ebayRequest,
        ebayResponse,
        "",
        "success",
      );
      if (source !== "mainFunction" && channelId) {
        await apiCallLog(
          "upsertEbayProduct",
          "AddFixedPricedItem",
          "AddFIxedPricedItem",
          ebayRequest,
          ebayResponse,
          "",
          "success",
        );
        if (source_channel_id && sourceAccountName) {
          await apiCallLog(
            "upsertEbayProduct",
            "AddFixedPricedItem",
            "AddFIxedPricedItem",
            ebayRequest,
            ebayResponse,
            "",
            "success",
          );
          await CatalogueCrosslistingInfo.create({
            source_channel_id: source_channel_id,
            dest_channel_id: ebayResponse.ItemID,
            user_id: userId,
            source_account_name: sourceAccountName,
            dest_account_name: accountName,
          })
        }

        const newEbayItem = await eBay.trading.GetItem({ ItemID: ebayResponse.ItemID });
        const pushDataBody = {
          ItemArray: {
            Item: [newEbayItem.Item],
          },
        };
        await pushData(
          pushDataBody,
          marketplaceId,
          accountName,
          userId,
          false,
          config_id,
          variantMap
        );
      } else {
        if (source_channel_id && sourceAccountName) {
          await apiCallLog(
            "upsertEbayProduct",
            "AddFixedPricedItem",
            "AddFIxedPricedItem",
            ebayRequest,
            ebayResponse,
            "",
            "success",
          );
          await CatalogueCrosslistingInfo.create({
            source_channel_id: source_channel_id,
            dest_channel_id: ebayResponse.ItemID,
            user_id: userId,
            source_account_name: sourceAccountName,
            dest_account_name: accountName,
          })
        }
        const newEbayItem = await eBay.trading.GetItem({ ItemID: ebayResponse.ItemID, DetailLevel: "ReturnAll", IncludeItemSpecifics: true });
        const pushDataBody = {
          ItemArray: {
            Item: [newEbayItem.Item],
          },
        };
        await pushData(
          pushDataBody,
          marketplaceId,
          accountName,
          userId,
          false,
          config_id,
          variantMap ? variantMap : {},
          version
        );
      }
      return {
        status: true,
        statusCode: 200,
        message: "Product listed successfully on eBay",
        channelId: ebayResponse.ItemID,
      };
    } else {
      console.error("eBay listing error:", ebayResponse.Errors);
      await apiCallLog(
        "upsertEbayProduct",
        "AddFixedPricedItem",
        "AddFIxedPricedItem",
        ebayRequest,
        ebayResponse.meta,
        "",
        "error",
      );
      return {
        status: false,
        statusCode: 500,
        message: "Failed to list product on eBay",
        errors: ebayResponse.Errors,
      };
    }

    // if (ebayResponse.ItemID) {
    //   console.log("channelId of listed product: -----------", ebayResponse.ItemID)
    //   if (source !== "mainFunction" && channelId) {
    //     await csku.update(
    //       { status: ProductListingStatus.LIVE, channelId: ebayResponse.ItemID },
    //       { where: { ...whereClouse } }
    //     );
    //   } else {

    //     await csku.update(
    //       { status: ProductListingStatus.LIVE, channelId: ebayResponse.ItemID },
    //       { where: { id: newProduct.dataValues.id } }
    //     );

    //   }
    //   return {
    //     status: true,
    //     statusCode: 200,
    //     message: "Product listed successfully on eBay",
    //     channelId: ebayResponse.ItemID,
    //   };
    // } else {
    //   console.error("eBay listing error:", ebayResponse.Errors);
    //   if (source !== "mainFunction" && channelId) {
    //     await csku.update(
    //       { status: ProductListingStatus.FAILED },
    //       { where: { ...whereClouse, channelId } }
    //     );
    //   } else {

    //     await csku.update(
    //       { status: ProductListingStatus.FAILED },
    //       { where: { id: newProduct.dataValues.id } }
    //     );

    //   }
    //   return {
    //     status: false,
    //     statusCode: 500,
    //     message: "Failed to list product on eBay",
    //     errors: ebayResponse.Errors,
    //   };
    // }
  } catch (error) {
    console.error("Error in upsertEbayProduct:", error.meta);
    await apiCallLog(
      "upsertEbayProduct",
      "AddFixedPricedItem",
      "AddFIxedPricedItem",
      { product, sellerProfile, primaryCategory, categoryAspects, variants },
      { error: error.meta },
      "",
      "error",
    );
    if (error?.meta?.ItemID) {
      await csku.update(
        { status: ProductListingStatus.LIVE, channelId: error?.meta?.ItemID },
        { where: { ...whereClouse } }
      );
      return {
        status: true,
        statusCode: 200,
        message: "Product listed successfully on eBay",
        channelId: error?.meta?.ItemID,
      };
    } else {
      console.error("eBay listing error:", error);

      await apiCallLog(
        "upsertEbayProduct",
        "AddFixedPricedItem",
        "AddFIxedPricedItem",
        { product, sellerProfile, primaryCategory, categoryAspects, variants },
        { error: error?.message },
        "",
        "error",
      );
      await csku.update(
        { status: ProductListingStatus.FAILED },
        { where: { ...whereClouse } }
      );
      return {
        status: false,
        statusCode: 500,
        message: "Failed to list product on eBay",
        errors: error?.meta?.message,
      };
    }
  }
};

exports.bulkCreateAndUpdateEbayCatalogue = async (
  userId,
  accountName,
  marketPlaceId,
  token,
  category,
  siteId,
  jsonData,
  errorFile
) => {
  let successCounts = 0;
  let failedCounts = 0;
  try {
    // Group the data into valid and invalid payloads
    const { validPayloads, failedPayloads } = await groupByISKU(jsonData);

    // Push failed payloads into the errorFile
    errorFile.push(...failedPayloads);

    // Process the valid payloads to generate eBay-specific payloads
    const ebayPayload = await generateEbayPayload(
      validPayloads,
      siteId,
      category,
      userId,
      accountName,
      marketPlaceId,
      token
    );

    // Handle any failed payloads from eBay payload generation
    if (ebayPayload?.failedPayloadFile?.length > 0) {
      ebayPayload.failedPayloadFile.forEach((failedProduct) => {
        const isku = failedProduct?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      });
    }

    // Process each valid eBay payload
    for (let i = 0; i < ebayPayload?.payloadFile?.length; i++) {
      try {
        const response = await this.upsertEbayProduct(ebayPayload.payloadFile[i]);

        if (response?.status) {
          successCounts++;
        } else {
          failedCounts++;
          const isku = ebayPayload.payloadFile[i]?.product?.isku;
          const errorData = jsonData.filter(data => data?.sku === isku) || [];
          errorFile.push(...errorData);
        }
      } catch (error) {
        console.error("Error occurred while processing eBay payload:", error);
        failedCounts++;
        const isku = ebayPayload.payloadFile[i]?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      }
    }

    // Log any failed payloads for debugging
    if (failedPayloads.length > 0 || ebayPayload?.failedPayloadFile?.length > 0) {
      console.error("Failed Payloads:", failedPayloads);
      failedCounts += failedPayloads.length + (ebayPayload?.failedPayloadFile?.length || 0);
    }

    return {
      success: true,
      status: 200,
      successCount: successCounts,
      failedCount: failedCounts
    };

  } catch (error) {
    console.error("An error occurred during bulk create and update:", error);
    return {
      success: false,
      status: 500,
      successCount: successCounts,
      failedCount: failedCounts
    };
  }
};
// Function to group by ISKU and validate
const groupByISKU = async (jsonData) => {
  const groupedData = {};
  const failedPayloads = [];

  for (const row of jsonData) {
    const isku = row["sku"] || row["variant_sku"];
    if (!groupedData[isku]) {
      groupedData[isku] = {
        ...row,
        variants: [],
      };
    }

    if (row["variant_sku"]) {
      let i = 1;
      const options = [];
      while (
        row[`variant_option${i}_name`] &&
        row[`variant_option${i}_value`]
      ) {
        options.push({
          name: row[`variant_option${i}_name`],
          value: row[`variant_option${i}_value`],
        });
        i++;
      }
      groupedData[isku].variants.push({
        sku: row["variant_sku"],
        price: row["variant_price"],
        quantity: row["variant_quantity"],
        options,
      });
    }

    const errors = await validateRowData(groupedData[isku]);
    if (errors.length > 0) {
      failedPayloads.push({
        ...row,
        errors,
      });
    }
  }

  // Convert grouped data to an array for easier processing
  const validPayloads = Object.values(groupedData).filter(
    (product) => !failedPayloads.some((failed) => failed.sku === product.sku)
  );

  return { validPayloads, failedPayloads };
};
// Function to validate row data
const validateRowData = async (product) => {
  const errors = [];
  // Check mandatory fields
  if (!product?.sku) errors.push("Product SKU is required.");
  if (!product?.title) errors.push("Product title is required.");
  if (!product?.description) errors.push("Product description is required.");
  if (product?.price == null) errors.push("Product price is required.");
  if (!product?.currency) errors.push("Product currency is required.");
  if (product?.quantity == null) errors.push("Product quantity is required.");

  // Prepare images and check
  let images = product?.images?.includes(",")
    ? product?.images.split(",")
    : [product.images] || [];
  if (!images || images.length === 0)
    errors.push("Product images are required.");

  if (!product?.country) errors.push("Product country is required.");
  if (!product?.conditionId) errors.push("Product condition ID is required.");
  if (!product?.location) errors.push("Product location is required.");
  if (!product?.categoryId || !product?.categoryName)
    errors.push("Primary category information is required.");
  if (!product?.fulfillmentPolicyId || product?.fulfillmentPolicyId === "")
    errors.push("Shipping Policy Id is required.");
  if (!product?.paymentPolicyId || product?.paymentPolicyId === "")
    errors.push("Payment Policy Id is required.");
  if (!product?.returnPolicyId || product?.returnPolicyId === "")
    errors.push("Return Policy Id is required.");

  return errors;
};

const checkIds = async (model, field, value, err) => {
  try {
    const data = await model.findOne({
      where: { [field]: value?.toString() },
    });
    if (!data) {
      err.push(`Data Not Found For The ${field}: ${value}`);
      return null;
    }
    return data;
  } catch (error) {
    err.push("An error occurred while fetching  Details.");
    return null;
  }
};

const generateEbayPayload = async (
  validPayloads,
  siteId,
  category,
  userId,
  accountName,
  marketplaceId,
  token
) => {
  const payloadFile = [];
  const failedPayloadFile = [];
  const groupProductId = uuidv4();
  for (const product of validPayloads) {
    let errors = [];
    let {
      title,
      description,
      price,
      currency,
      quantity,
      quantityLimitPerBuyer,
      country,
      conditionId,
      images,
      location,
      measureUnit,
      packageType,
      length,
      width,
      height,
      weight,
      storeCategoryId,
      fulfillmentPolicyId,
      returnPolicyId,
      paymentPolicyId,
      variants,
      ...rest
    } = product;
    // Prepare images
    images = images?.includes(",") ? images.split(",") : [images] || [];
    conditionId = conditionId?.spilt("_")?.pop();

    let categoryAspects = {};
    for (const [key, value] of Object.entries(rest)) {
      // Exclude variant_sku, variant_price, variant_quantity, and variant_option${i}_name / variant_option${i}_value
      if (
        key === "variant_sku" ||
        key === "variant_price" ||
        key === "variant_quantity" ||
        /variant_option\d+_name/.test(key) ||
        /variant_option\d+_value/.test(key)
      ) {
        continue;
      }

      // Add valid keys to categoryAspects
      categoryAspects[key] = value.includes(",") ? value.split(",") : [value];
    }
    // Create the payload
    let payload = {
      userId,
      accountName,
      marketplaceId,
      token,
      siteId,
      product: {
        title: title || "",
        description: description || "",
        price: price || 0,
        currency: currency || "",
        quantity: quantity || 0,
        quantityLimitPerBuyer: quantityLimitPerBuyer || null,
        country: country || "",
        conditionId: conditionId || null,
        images: images,
        location: location || "",
        packagingDetails: {
          unit: measureUnit || "",
          packagingType: packageType || "",
          dimensions: {
            height: height || 0,
            width: width || 0,
            length: length || 0,
          },
          weight: {
            value: weight || 0,
          },
        },
      },
      sellerProfile: null,
      storeCategory: null,
      primaryCategory: {
        id: category?.categoryId || null,
        name: category?.categoryName || "",
      },
      categoryAspects:
        Object?.keys(categoryAspects)?.length > 0 ? categoryAspects : null,
      variants: variants || [],
      groupProductId,
      errors: errors.length > 0 ? errors : null,
    };

    // Store Category Handling
    if (storeCategoryId && storeCategoryId !== "") {
      const [name, id] = storeCategoryId.split("_");
      if (id) {
        await checkIds(Catalogue, "categoryId", id, errors);
        if (!errors?.length) {
          payload.storeCategory = {
            storeCategoryId: id,
            storeCategoryName: name,
          };
        }
      }
    }
    // Check Policies
    fulfillmentPolicyId = fulfillmentPolicyId?.split("_")?.pop();
    paymentPolicyId = paymentPolicyId?.split("_")?.pop();
    returnPolicyId = returnPolicyId?.split("_")?.pop();
    const shippingProfile = await checkIds(
      shippingPolicies,
      "fulfillmentPolicyId",
      fulfillmentPolicyId,
      errors
    );
    const paymentProfile = await checkIds(
      paymentPolicies,
      "paymentPolicyId",
      paymentPolicyId,
      errors
    );
    const returnProfile = await checkIds(
      returnPolicies,
      "returnPolicyId",
      returnPolicyId,
      errors
    );

    if (shippingProfile && paymentProfile && returnProfile) {
      payload.sellerProfile = {
        SellerShippingProfile: {
          ShippingProfileID: parseInt(fulfillmentPolicyId, 10),
          ShippingProfileName:
            shippingProfile?.dataValues?.name || shippingProfile?.name,
        },
        SellerReturnProfile: {
          ReturnProfileID: parseInt(returnPolicyId, 10),
          ReturnProfileName:
            returnProfile?.dataValues?.name || returnProfile?.name,
        },
        SellerPaymentProfile: {
          PaymentProfileID: parseInt(paymentPolicyId, 10),
          PaymentProfileName:
            paymentProfile?.dataValues?.name || paymentProfile?.name,
        },
      };
    }

    // Push to appropriate array based on errors
    if (errors.length > 0) {
      delete product["variants"];
      failedPayloadFile.push(product);
    } else {
      payloadFile.push(payload);
    }
  }
  return { payloadFile, failedPayloadFile };
};

function getColumnLetter(index) {
  let columnLetter = "";
  while (index >= 0) {
    columnLetter = String.fromCharCode((index % 26) + 65) + columnLetter;
    index = Math.floor(index / 26) - 1;
  }
  return columnLetter;
}


exports.GetItemEbay = async (eBay, channelId) => {
  try {
    const Item = await eBay.trading.GetItem({
      ItemID: channelId,
      DetailLevel: "ReturnAll",
      IncludeItemSpecifics: true,
      IncludeItemCompatibilityList: true,
    })
    return Item
  } catch (error) {
    console.log(error);
    throw new Error(error)
  }
}

exports.FeedFileGenerate = async (eBay, feedType) => {
  try {

    const response = await eBay.sell.feed.createInventoryTask({
      "schemaVersion": "1.0",
      "feedType": feedType,
    });

    if (response == "") {
      return true;
    } else {
      return false;
    }

  } catch (error) {
    console.log(error);
    throw error;
  }
}

exports.GetInventoryTasks = async (token, feedType, startDate, endDate) => {
  try {

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://api.ebay.com/sell/feed/v1/inventory_task?feed_type=${feedType}&date_range=${startDate}..${endDate}`,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      }
    };

    const feeds = await axios.request(config);
    console.log("feeds :>> ", feeds.data.tasks.length);
    if (feeds && feeds.data && feeds.data.tasks && feeds.data.tasks.length > 0) {
      return feeds.data;
    } else {
      return null;
    }

  } catch (error) {
    console.log(error);
    throw error;
  }
}

// exports.UpdateEbayItem = async (req, res) => {
//   const { userId, accountName, ebayItem, marketplaceId } = req.body;
//   console.log('ebayItem :>> ', ebayItem);
//   console.log('marketplaceId :>> ', marketplaceId);
//   console.log('accountName :>> ', accountName);
//   console.log('userId :>> ', userId);

//   if(!userId || !accountName || !marketplaceId || !ebayItem) {
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: 'Missing required fields. Please check your input.'
//     });
//   }


//   // Get user token
//   const token = await Tokens.findOne({
//     where: {
//       userId: userId,
//       marketPlaceId: marketplaceId,
//       accountName: accountName
//     }
//   });

//   if (!token) {
//     return res.status(500).json({
//       success: false,
//       status: 500,
//       message: 'Token for this user not found.'
//     });
//   }

//   // Initialize eBay API
//   const eBay = new ebay({
//     appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
//     certId: "PRD-fb4fbfcd-a1fb9933",
//     sandbox: false,
//     autoRefreshToken: true,
//     siteId: ebayItem?.siteId,
//     devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
//   });

//   // Set credentials and refresh token if needed
//   eBay.oAuth2.setCredentials(token?.token);
//   if (moment().add(5, "hours").add(30, "minutes").diff(moment(token.lastTokenRefreshDate), "hours") >= 2) {
//     await refreshToken(eBay, token);
//   }

//   // Initialize eBay request and CSKU update data
//   let ebayRequest = {
//     Item: {
//       ItemID: ebayItem?.channelId
//     }
//   };

//   let cskuUpdateData = {};

//   // Basic item details
//   if (ebayItem?.title?.trim()) {
//     ebayRequest.Item.Title = ebayItem.title;
//     cskuUpdateData.title = ebayItem.title;
//   }

//   if (ebayItem?.description?.trim()) {
//     ebayRequest.Item.Description = ebayItem?.description;
//     cskuUpdateData.description = ebayItem?.description;
//   }

//   if (ebayItem?.categoryAspects?.category?.id) {
//     ebayRequest.Item.PrimaryCategory = {
//       CategoryID: ebayItem.categoryAspects.category.id,
//       CategoryName: ebayItem.categoryAspects.category.name
//     };
//     cskuUpdateData.categoryId = ebayItem.categoryAspects.category.id;
//     cskuUpdateData.categoryName = ebayItem.categoryAspects.category.name;
//   }

//   // Handle images
//   if (ebayItem?.images?.length > 0) {
//     ebayRequest.Item.PictureDetails = {
//       PictureURL: ebayItem.images
//     };
//     cskuUpdateData.images = ebayItem.images;
//   }

//   // Handle shipping package details
//   if (ebayItem?.weightMajor || ebayItem?.weightMinor ||
//     ebayItem?.height || ebayItem?.length || ebayItem?.depth) {
//     ebayRequest.Item.ShippingPackageDetails = {};

//     // Handle weight
//     if (ebayItem?.weightMajor || ebayItem?.weightMinor) {
//       ebayRequest.Item.ShippingPackageDetails.WeightMajor = ebayItem?.weightMajor?.toString();
//       ebayRequest.Item.ShippingPackageDetails.WeightMinor = ebayItem?.weightMinor?.toString();
//       ebayRequest.Item.ShippingPackageDetails.WeightUnit = ebayItem?.weightUnit;

//       cskuUpdateData.weight = ebayItem?.weightMajor;
//       cskuUpdateData.weightUnit = ebayItem?.weightUnit;
//     }

//     // Handle dimensions
//     if (ebayItem.unit) {
//       if (ebayItem.height) {
//         ebayRequest.Item.ShippingPackageDetails.Height = ebayItem.height;
//         cskuUpdateData.height = ebayItem.height;
//       }
//       if (ebayItem.length) {
//         ebayRequest.Item.ShippingPackageDetails.Length = ebayItem.length;
//         cskuUpdateData.length = ebayItem.length;
//       }
//       if (ebayItem.depth) {
//         ebayRequest.Item.ShippingPackageDetails.Width = ebayItem.depth;
//         cskuUpdateData.depth = ebayItem.depth;
//       }

//       ebayRequest.Item.ShippingPackageDetails.MeasurementUnit = ebayItem.unit;
//       cskuUpdateData.unit = ebayItem.unit;
//     }
//   }

//   // Handle quantity and price
//   if (ebayItem?.quantity) {
//     ebayRequest.Item.Quantity = ebayItem.quantity;
//     cskuUpdateData.quantity = ebayItem.quantity;
//   }

//   if (ebayItem?.price) {
//     ebayRequest.Item.StartPrice = ebayItem.price;
//     cskuUpdateData.price = ebayItem.price;
//   }

//   // Handle policies
//   if (ebayItem?.policies) {
//     ebayRequest.Item.SellerProfiles = ebayItem.policies;
//     cskuUpdateData.sellerProfile = ebayItem.policies;
//   }

//   // Handle itemSpecifics and categoryAspects
//   const itemSpecificsList = [];

//   // Process the flat itemSpecifics structure
//   if (ebayItem?.itemSpecifics) {
//     Object.entries(ebayItem.itemSpecifics).forEach(([name, value]) => {
//       if (value) {
//         itemSpecificsList.push({
//           Name: name,
//           Value: Array.isArray(value) ? value : [value]
//         });
//       }
//     });
//   }

//   // Process category aspects
//   if (ebayItem?.categoryAspects?.aspects?.length > 0) {
//     ebayItem.categoryAspects.aspects.forEach(aspect => {
//       itemSpecificsList.push({
//         Name: aspect.name,
//         Value: Array.isArray(aspect.value) ? aspect.value : [aspect.value]
//       });
//     });
//   }

//   if (itemSpecificsList.length > 0) {
//     ebayRequest.Item.ItemSpecifics = {
//       NameValueList: itemSpecificsList
//     };
//     // Store flat structure in CSKU
//     cskuUpdateData.itemSpecifics = ebayItem.itemSpecifics || {};
//   }

//   if(ebayItem?.customized_images?.length > 0) {
//     cskuUpdateData.customized_images = ebayItem.customized_images;
//   }

//   console.log('ebayRequest :>> ', ebayRequest);


//   try {
//     // Create a promise that resolves with null after 15 seconds
//     const timeout = new Promise((resolve) => {
//       setTimeout(() => {
//           resolve(null);
//       }, 20000);
//   });

//   // Update eBay item with timeout
//   const ebayResponse = await Promise.race([
//       eBay.trading.ReviseItem(ebayRequest),
//       timeout
//   ]);

//   // Check if we got a timeout (null response)
//   if (!ebayResponse) {
//       const err = {
//           error: 'No response from eBay after 15 seconds'
//       };
//       newRelic.recordCustomEvent('ebay_timeout_error', err);
//       await apiCallLog(
//           "ReviseItem",
//           "updateEbayItem",
//           "updateEbayItem",
//           ebayRequest,
//           "",
//           err,
//           "failed",
//       );
//       return res.status(500).json({
//           success: false,
//           status: 500,
//           message: 'failed to update product'
//       });
//   }
//     console.log(`Updated product: ${ebayResponse.ItemID}`);

//     // Update CSKU record
//     const cskuRecord = await csku.findOne({
//       where: {
//         userId,
//         marketplaceId,
//         accountName,
//         channelId: ebayItem.channelId
//       }
//     });

//     if (cskuRecord) {
//       await cskuRecord.update({
//         ...cskuUpdateData,
//         updated_at: sequelize.literal('CURRENT_TIMESTAMP')
//       });
//     }

//     await apiCallLog(
//       "ReviseItem",
//       "updateEbayItem",
//       "updateEbayItem",
//       ebayRequest,
//       ebayResponse,
//       "",
//       "Success",
//     );

//     return res.status(200).json({
//       success: true,
//       status: 200,
//       data: {
//         ebayResponse,
//         cskuUpdate: cskuUpdateData
//       }
//     });
//   } catch (error) {
//     console.log('Error updating eBay item:', error.meta);
//     if (error.meta.message === 'This operation is not allowed for inventory items') {
//       try {
//         const ebayInventoryItem = await UpdateEbayInventoryItem(eBay, ebayRequest);
//         // Update CSKU for inventory item
//         const cskuRecord = await csku.findOne({
//           where: {
//             userId,
//             marketplaceId,
//             accountName,
//             channelId: ebayItem.channelId
//           }
//         });

//         if (cskuRecord) {
//           await cskuRecord.update({
//             ...cskuUpdateData,
//             updated_at: sequelize.literal('CURRENT_TIMESTAMP')
//           });
//         }

//         await apiCallLog(
//           "UpdateEbayInventoryItem",
//           "updateEbayItem",
//           "updateEbayItem",
//           ebayRequest,
//           ebayInventoryItem,
//           "",
//           "Success",
//         );

//         return res.status(200).json({
//           success: true,
//           status: 200,
//           data: {
//             ebayResponse: ebayInventoryItem,
//             cskuUpdate: cskuUpdateData
//           }
//         });
//       } catch (inventoryError) {
//         console.error('Error updating inventory item:', inventoryError);
//         const err = {
//           error: inventoryError?.message
//         }
//         newRelic.recordCustomEvent('ebay_inventory_update_error', err);
//         await apiCallLog(
//           "",
//           "updateEbayItem",
//           "updateEbayItem",
//           "",
//           "",
//           inventoryError,
//           "failed",
//         );
//         return res.status(500).json({
//           success: false,
//           status: 500,
//           message: 'Failed to update inventory item',
//           error: inventoryError.message
//         });
//       }
//     }
//     const err = {
//       error: error?.message
//     }
//     newRelic.recordCustomEvent('error_updating_item', err);
//     return res.status(500).json({
//       success: false,
//       status: 500,
//       message: 'Failed to update eBay item',
//       error: error.message
//     });
//   }
// };

async function UpdateEbayInventoryItem(eBay, ebayRequest) {
  try {
    console.log('Updating eBay inventory item with request:', ebayRequest);
    const inventoryData = await eBay.sell.inventory.getInventoryItem(ebayRequest?.isku);
    if (!inventoryData) {
      throw new Error('Inventory item not found');
    }
    console.log('Fetched eBay inventory item:', JSON.stringify(inventoryData));
    if(ebayRequest.quantity){
      inventoryData.availability.shipToLocationAvailability.quantity = ebayRequest.quantity;
    }
    if(ebayRequest.categoryAspects?.aspects){
      inventoryData.product.aspects = ebayRequest.categoryAspects.aspects;
    }
    if(ebayRequest.images && ebayRequest.images.length > 0){
      inventoryData.product.imageUrls = ebayRequest.images
    }
    if(ebayRequest.title){
      inventoryData.product.title = ebayRequest.title;
    }
    if(inventoryData?.packageWeightAndSize?.weight.value === 0){
      delete inventoryData.packageWeightAndSize
    }

    console.log('Inventory data before update:', JSON.stringify(inventoryData));
    console.log('eBay request SKU:', inventoryData);
    // return
    try {
      await eBay.sell.inventory.createOrReplaceInventoryItem(ebayRequest?.isku, inventoryData);
    } catch (error) {
      console.error("Error updating eBay inventory item:", error);
      return {
      success: false,
      status: 500,
      message: 'Failed to update eBay inventory item',
      error: error.meta.message
     };
    }
    let eBayOffer;

    try {
      eBayOffer = await eBay.sell.inventory.getOffers({ sku: ebayRequest?.isku });
    } catch (error) {
      console.log("Error fetching eBay offer", error);
    }
    const offerId = eBayOffer.offers[0].offerId;
    const eBayOfferRequest = eBayOffer.offers[0];
    delete eBayOfferRequest.offerId;
    delete eBayOfferRequest.sku;

    console.log("eBay Offer Request before update:", JSON.stringify(eBayOfferRequest));

    if(ebayRequest?.description){
      eBayOfferRequest.listingDescription = ebayRequest?.description;
    }
    if(ebayRequest?.price){
      eBayOfferRequest.pricingSummary.price.value = ebayRequest?.price;
    }
    if(ebayRequest?.policies){
      if(ebayRequest?.policies?.SellerShippingProfile){
        eBayOfferRequest.listingPolicies.fulfillmentPolicyId = ebayRequest?.policies?.SellerShippingProfile?.ShippingProfileID;
      }
      if(ebayRequest?.policies?.SellerReturnProfile){
        eBayOfferRequest.listingPolicies.returnPolicyId = ebayRequest?.policies?.SellerReturnProfile?.ReturnProfileID;
      }
      if(ebayRequest?.policies?.SellerPaymentProfile){
        eBayOfferRequest.listingPolicies.paymentPolicyId = ebayRequest?.policies?.SellerPaymentProfile?.PaymentProfileID;
      }
    }
    if(ebayRequest?.storeCategory){
      eBayOfferRequest.storeCategoryNames = [ebayRequest?.storeCategory?.storeCategoryName];
    }
    
    try {
    const res = await eBay.sell.inventory.updateOffer(
      offerId,
      eBayOfferRequest
    );
    console.log("Inventory Item Created", res);
    return {
      success: true,
      status: 200,
      message: 'eBay inventory item updated successfully',
      data: res
    };
  } catch (error) {
    console.log("Error Message >> ",error.meta.message)
    return {
      success: false,
      status: 500,
      message: 'Failed to update eBay inventory item',
      error: error.meta.message
     };
    }
    console.log("Data inventory successfully updated");
  } catch (error) {
    console.error('Error updating eBay inventory item:', error);
  }
}


exports.UpdateEbayItem = async (req, res) => {
  const { userId, accountName, ebayItem, marketplaceId } = req.body;
  console.log('ebayItem :>> ', ebayItem);
  console.log('marketplaceId :>> ', marketplaceId);
  console.log('accountName :>> ', accountName);
  console.log('userId :>> ', userId);

  if (!userId || !accountName || !marketplaceId || !ebayItem) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Missing required fields. Please check your input.'
    });
  }

  // Get user token
  const token = await Tokens.findOne({
    where: {
      userId: userId,
      marketPlaceId: marketplaceId,
      accountName: accountName
    }
  });

  if (!token) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Token for this user not found.'
    });
  }

  // Initialize eBay API
  const eBay = new ebay({
    appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
    certId: "PRD-fb4fbfcd-a1fb9933",
    sandbox: false,
    autoRefreshToken: true,
    siteId: ebayItem?.siteId,
    devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
  });

  // Set credentials and refresh token if needed
  eBay.oAuth2.setCredentials(token?.token);
  if (moment().add(5, "hours").add(30, "minutes").diff(moment(token.lastTokenRefreshDate), "hours") >= 2) {
    await refreshToken(eBay, token);
  }

  // Initialize eBay request and CSKU update data
  let ebayRequest = {
    Item: {
      ItemID: ebayItem?.channelId
    }
  };

  let cskuUpdateData = {};

  // Basic item details
  if (ebayItem?.title?.trim()) {
    ebayRequest.Item.Title = ebayItem.title;
    cskuUpdateData.title = ebayItem.title;
  }

  if (ebayItem?.description?.trim()) {
    ebayRequest.Item.Description = ebayItem?.description;
    cskuUpdateData.description = ebayItem?.description;
  }

  if (ebayItem?.categoryAspects?.category?.id) {
    ebayRequest.Item.PrimaryCategory = {
      CategoryID: ebayItem.categoryAspects.category.id,
      CategoryName: ebayItem.categoryAspects.category.name
    };
    cskuUpdateData.categoryId = ebayItem.categoryAspects.category.id;
    cskuUpdateData.categoryName = ebayItem.categoryAspects.category.name;
  }

  // Handle images
  if (ebayItem?.images?.length > 0) {
    ebayRequest.Item.PictureDetails = {
      PictureURL: ebayItem.images
    };
    cskuUpdateData.images = ebayItem.images;
  }

  // Handle shipping package details
  if (ebayItem?.weightMajor || ebayItem?.weightMinor ||
    ebayItem?.height || ebayItem?.length || ebayItem?.depth) {
    ebayRequest.Item.ShippingPackageDetails = {};

    // Handle weight
    if (ebayItem?.weightMajor || ebayItem?.weightMinor) {
      ebayRequest.Item.ShippingPackageDetails.WeightMajor = ebayItem?.weightMajor?.toString();
      ebayRequest.Item.ShippingPackageDetails.WeightMinor = ebayItem?.weightMinor?.toString();
      ebayRequest.Item.ShippingPackageDetails.WeightUnit = ebayItem?.weightUnit;

      cskuUpdateData.weight = ebayItem?.weightMajor;
      cskuUpdateData.weightUnit = ebayItem?.weightUnit;
    }

    // Handle dimensions
    if (ebayItem.unit) {
      if (ebayItem.height) {
        ebayRequest.Item.ShippingPackageDetails.Height = ebayItem.height;
        cskuUpdateData.height = ebayItem.height;
      }
      if (ebayItem.length) {
        ebayRequest.Item.ShippingPackageDetails.Length = ebayItem.length;
        cskuUpdateData.length = ebayItem.length;
      }
      if (ebayItem.depth) {
        ebayRequest.Item.ShippingPackageDetails.Width = ebayItem.depth;
        cskuUpdateData.depth = ebayItem.depth;
      }

      ebayRequest.Item.ShippingPackageDetails.MeasurementUnit = ebayItem.unit;
      cskuUpdateData.unit = ebayItem.unit;
    }
  }

  // Handle quantity and price
  if (ebayItem?.quantity) {
    ebayRequest.Item.Quantity = ebayItem.quantity;
    cskuUpdateData.quantity = ebayItem.quantity;
  }

  if (ebayItem?.price) {
    ebayRequest.Item.StartPrice = ebayItem.price;
    cskuUpdateData.price = ebayItem.price;
  }

  // Handle policies
  if (ebayItem?.policies) {
    ebayRequest.Item.SellerProfiles = ebayItem.policies;
    cskuUpdateData.sellerProfile = ebayItem.policies;
  }

  // Handle itemSpecifics and categoryAspects
  const itemSpecificsList = [];

  // Process the flat itemSpecifics structure
  if (ebayItem?.itemSpecifics) {
    Object.entries(ebayItem.itemSpecifics).forEach(([name, value]) => {
      if (value) {
        itemSpecificsList.push({
          Name: name,
          Value: Array.isArray(value) ? value : [value]
        });
      }
    });
  }

  // Process category aspects
  if (ebayItem?.categoryAspects?.aspects?.length > 0) {
    ebayItem.categoryAspects.aspects.forEach(aspect => {
      itemSpecificsList.push({
        Name: aspect.name,
        Value: Array.isArray(aspect.value) ? aspect.value : [aspect.value]
      });
    });
  }

  if (itemSpecificsList.length > 0) {
    ebayRequest.Item.ItemSpecifics = {
      NameValueList: itemSpecificsList
    };
    // Store flat structure in CSKU
    cskuUpdateData.itemSpecifics = ebayItem.itemSpecifics || {};
  }

  if (ebayItem?.customized_images?.length > 0) {
    cskuUpdateData.customized_images = ebayItem.customized_images;
  }

  // Handle variations
  const hasVariations = ebayItem?.variations &&
    ebayItem.variations.attributes &&
    ebayItem.variations.combinations &&
    ebayItem.variations.attributes.length > 0 &&
    ebayItem.variations.combinations.length > 0;

  if (hasVariations) {
    const variations = [];
    const { attributes, combinations } = ebayItem.variations;

    // Process all variation combinations
    combinations.forEach(combination => {
      const variationSpecifics = {};

      // Add each attribute to the variation specifics
      attributes.forEach(attr => {
        if (combination[attr.name]) {
          variationSpecifics[attr.name] = [combination[attr.name]];
        }
      });

      // Add this variation to the list
      variations.push({
        SKU: `${ebayItem.isku}-${Object.values(variationSpecifics).flat().join('-')}`,
        Quantity: combination.quantity,
        StartPrice: combination.price,
        VariationSpecifics: {
          NameValueList: Object.entries(variationSpecifics).map(([name, values]) => ({
            Name: name,
            Value: values
          }))
        }
      });
    });

    // Add the variation set to the request
    ebayRequest.Item.Variations = {
      Variation: variations,
      VariationSpecificsSet: {
        NameValueList: attributes.map(attr => ({
          Name: attr.name,
          Value: attr.options.map(option => option.value)
        }))
      }
    };

    // Delete existing variations from CatalogueVariation table
    await CatalogueVariation.destroy({
      where: { channel_id: ebayItem.channelId }
    });

    // Create new variations in CatalogueVariation table
    const variationPromises = combinations.map(async (combination) => {
      // Create a unique SKU for this variation (if needed)
      const variationSku = `${ebayItem.isku}-${Object.values(combination).join('-')}`;

      // Create the catalogue variation record
      return await CatalogueVariation.create({
        userId,
        marketplaceId,
        account_name: accountName,
        channel_id: ebayItem.channelId,
        variation_id: ebayItem.channelId,
        isku: ebayItem.isku,
        variation: ebayItem.variations,
        price: combination.price,
        quantity: combination.quantity
      });
    });

    // Wait for all variation records to be created
    await Promise.all(variationPromises);

    // Update CSKU table with new variations
    cskuUpdateData.variations = ebayItem.variations;
  } else {
    // Delete existing variations from CatalogueVariation table
    const existingVariations = await CatalogueVariation.findAll({
      where: { channel_id: ebayItem?.channelId }
    });
    if (existingVariations.length > 0) {
    await CatalogueVariation.destroy({
      where: { channel_id: ebayItem?.channelId }
    });

    // Set variations column in CSKU table to null
    cskuUpdateData.variations = null;
   }
  }

  console.log('ebayRequest :>> ', ebayRequest);

  try {
    // Create a promise that resolves with null after 15 seconds
    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 20000);
    });

    // Update eBay item with timeout
    // const ebayResponse = await Promise.race([
    //   eBay.trading.ReviseItem(ebayRequest).catch((err) => { console.log(err.meta,"Data from error") }),
    //   timeout
    // ]);

    const ebayResponse = await eBay.trading.ReviseItem(ebayRequest);
    // Check if we got a timeout (null response)
    if (!ebayResponse) {
      const err = {
        error: 'No response from eBay after 15 seconds'
      };
      newRelic.recordCustomEvent('ebay_timeout_error', err);
      await apiCallLog(
        "ReviseItem",
        "updateEbayItem",
        "updateEbayItem",
        ebayRequest,
        "",
        err,
        "error",
      );
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'failed to update product'
      });
    }
    console.log(`Updated product: ${ebayResponse.ItemID}`);

    // Update CSKU record
    // const cskuRecord = await csku.findOne({
    //   where: {
    //     userId,
    //     marketplaceId,
    //     accountName,
    //     channelId: ebayItem.channelId
    //   }
    // });

    // if (cskuRecord) {
    //   await cskuRecord.update({
    //     ...cskuUpdateData,
    //     // updated_at: sequelize.literal('CURRENT_TIMESTAMP')
    //   });
    // }

    const item = await this.GetItemEbay(eBay, ebayItem.channelId);
    const pushDataBody = {
    ItemArray: {
      Item: [item.Item],
    },
    };
    console.log(pushDataBody);
    await pushData(
      pushDataBody,
      marketplaceId,
      accountName,
      userId
    );

    await apiCallLog(
      "ReviseItem",
      "updateEbayItem",
      "updateEbayItem",
      ebayRequest,
      ebayResponse,
      "",
      "success",
    );

    return res.status(200).json({
      success: true,
      status: 200,
      data: {
        ebayResponse,
        cskuUpdate: cskuUpdateData
      }
    });
  } catch (error) {
    console.log('Error updating eBay item:', error);
    if (error.meta.Errors.length > 0) {
      console.error('Error details:', error.meta.Errors[0]);
      const response = await UpdateEbayInventoryItem(eBay, ebayItem);
      if(response.success){
        return res.status(200).json({
          success: true,
          status: 200,
          data: `Item Updated successfully ${ebayItem.channelId}`,
        });
      }else {
        return res.status(500).json({
          success: false,
          status: 500,
          message: response.error
        });
      }
    }
    if (error.meta?.message == 'This operation is not allowed for inventory items' || error.meta?.Errors.ShortMessage == 'This operation is not allowed for inventory items' || error=='EbayApiError: This operation is not allowed for inventory items.') {
      try {
        const ebayInventoryItem = await UpdateEbayInventoryItem(eBay, ebayItem);
        // // const ebayInventoryItem = await updateEbayInventoryItem(eBay, ebayRequest, ebayRequest.Item.Quantity);
        // // Update CSKU for inventory item
        // const cskuRecord = await csku.findOne({
        //   where: {
        //     userId,
        //     marketplaceId,
        //     accountName,
        //     channelId: ebayItem.channelId
        //   }
        // });

        const item = await this.GetItemEbay(eBay, ebayItem.channelId);
        const pushDataBody = {
        ItemArray: {
          Item: [item.Item],
        },
        };
        console.log(pushDataBody);
        await pushData(
          pushDataBody,
          marketplaceId,
          accountName,
          userId
        );

        // if (cskuRecord) {
        //   await cskuRecord.update({
        //     ...cskuUpdateData,
        //     // updated_at: sequelize.literal('CURRENT_TIMESTAMP')
        //   });
        // }

        await apiCallLog(
          "UpdateEbayInventoryItem",
          "updateEbayItem",
          "updateEbayItem",
          ebayRequest,
          ebayInventoryItem,
          "",
          "success",
        );

        return res.status(200).json({
          success: true,
          status: 200,
          data: {
            ebayResponse: ebayInventoryItem,
            cskuUpdate: cskuUpdateData
          }
        });
      } catch (inventoryError) {
        console.error('Error updating inventory item:', inventoryError);
        const err = {
          error: inventoryError?.message
        }
        newRelic.recordCustomEvent('ebay_inventory_update_error', err);
        await apiCallLog(
          "ERROR WHILE UPDATING INVENTORY ITEM",
          "updateEbayItem",
          "updateEbayItem",
          "",
          "",
          inventoryError,
          "error",
        );
        return res.status(500).json({
          success: false,
          status: 500,
          message: 'Failed to update inventory item',
          error: inventoryError.message
        });
      }
    }
    const err = {
      error: error?.message
    }
    newRelic.recordCustomEvent('error_updating_item', err);
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Failed to update eBay item',
      error: error.message
    });
  }
};
exports.CreateEbayItem = async (req, res) => {
  const { userId, accountName, ebayItem, marketplaceId } = req.body;

  if (!userId || !accountName || !marketplaceId || !ebayItem) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Missing required fields. Please check your input.'
    });
  }


  // Get user token
  const token = await Tokens.findOne({
    where: {
      userId: userId,
      marketPlaceId: marketplaceId,
      accountName: accountName
    }
  });


  if (!token) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Token for this user not found.'
    });
  }

  // Initialize eBay API
  const eBay = new ebay({
    appId: "paulrich-pauzha-PRD-0fb4fbfcd-a1fb9933",
    certId: "PRD-fb4fbfcd-a1fb9933",
    sandbox: false,
    autoRefreshToken: true,
    //siteId: ebayItem?.siteId,
    devId: "4aa1cd36-24ef-4c3d-9728-abeb8ce39606",
  });

  // Set credentials and refresh token if needed
  eBay.oAuth2.setCredentials(token?.token);
  if (moment().add(5, "hours").add(30, "minutes").diff(moment(token.lastTokenRefreshDate), "hours") >= 2) {
    await refreshToken(eBay, token);
  }

  // Check if we have variations
  const hasVariations = ebayItem?.variations &&
    ebayItem.variations.attributes &&
    ebayItem.variations.combinations &&
    ebayItem.variations.attributes.length > 0 &&
    ebayItem.variations.combinations.length > 0;

  // Build eBay request
  let ebayRequest = {
    Item: {
      Title: ebayItem?.title,
      Description: ebayItem?.description,
      PrimaryCategory: {
        CategoryID: ebayItem?.category?.categoryId,
        CategoryName: ebayItem?.category?.categoryName
      },
      Currency: ebayItem?.currency,
      Country: ebayItem?.country,
      Site: ebayItem?.siteId,
      SellerProfiles: ebayItem?.policies,
      Location: ebayItem?.location
    }
  };

  // Handle non-variation specific fields
  if (!hasVariations) {
    ebayRequest.Item.StartPrice = ebayItem?.price;
    ebayRequest.Item.Quantity = ebayItem?.quantity;
    ebayRequest.Item.SKU = ebayItem?.isku;
    ebayRequest.Item.ListingType = "FixedPriceItem";
    ebayRequest.Item.ListingDetails = {
      BindingAuction: false,
      HasReservePrice: false
    };
    ebayRequest.Item.ListingDuration = "GTC";
  } else {
    // For variations, set the required fields
    ebayRequest.Item.ListingType = "FixedPriceItem";
    ebayRequest.Item.ListingDuration = "GTC";

    // Add variations to the request
    const variations = [];
    const { attributes, combinations } = ebayItem.variations;

    // Process all variation combinations
    combinations.forEach(combination => {
      const variationSpecifics = {};

      // Add each attribute to the variation specifics
      attributes.forEach(attr => {
        if (combination[attr.name]) {
          variationSpecifics[attr.name] = [combination[attr.name]];
        }
      });

      // Add this variation to the list
      variations.push({
        SKU: `${ebayItem.isku}-${Object.values(variationSpecifics).flat().join('-')}`,
        Quantity: combination.quantity,
        StartPrice: combination.price,
        VariationSpecifics: {
          NameValueList: Object.entries(variationSpecifics).map(([name, values]) => ({
            Name: name,
            Value: values
          }))
        }
      });
    });

    // Add the variation set to the request
    ebayRequest.Item.Variations = {
      Variation: variations,
      VariationSpecificsSet: {
        NameValueList: attributes.map(attr => ({
          Name: attr.name,
          Value: attr.options.map(option => option.value)
        }))
      }
    };
  }

  // Handle images
  if (ebayItem?.images?.length > 0) {
    ebayRequest.Item.PictureDetails = {
      PictureURL: ebayItem?.images
    };
  }

  // Handle shipping package details
  if (ebayItem?.weightUnit || ebayItem?.height || ebayItem?.length || ebayItem?.depth) {
    ebayRequest.Item.ShippingPackageDetails = {};

    // Handle weight
    if (ebayItem?.weightMajor || ebayItem?.weightMinor) {
      ebayRequest.Item.ShippingPackageDetails.WeightMajor = parseInt(ebayItem?.weightMajor);
      ebayRequest.Item.ShippingPackageDetails.WeightMinor = parseInt(ebayItem?.weightMinor);
      ebayRequest.Item.ShippingPackageDetails.WeightUnit = ebayItem?.weightUnit;
    }

    // Handle dimensions
    if (ebayItem.unit) {
      if (ebayItem.height) {
        ebayRequest.Item.ShippingPackageDetails.Height = ebayItem?.height;
      }
      if (ebayItem.length) {
        ebayRequest.Item.ShippingPackageDetails.Length = ebayItem?.length;
      }
      if (ebayItem.depth) {
        ebayRequest.Item.ShippingPackageDetails.Width = ebayItem?.depth;
      }
      ebayRequest.Item.ShippingPackageDetails.MeasurementUnit = ebayItem?.unit;
    }
  }

  // Handle item specifics and category aspects
  const itemSpecificsList = [];

  if (ebayItem?.itemSpecifics) {
    Object.entries(ebayItem?.itemSpecifics).forEach(([name, value]) => {
      if (value) {
        itemSpecificsList.push({
          Name: name,
          Value: Array.isArray(value) ? value : [value]
        });
      }
    });
  }

  if (ebayItem?.categoryAspects?.aspects?.length > 0) {
    ebayItem.categoryAspects.aspects.forEach(aspect => {
      itemSpecificsList.push({
        Name: aspect.name,
        Value: Array.isArray(aspect.value) ? aspect.value : [aspect.value]
      });
    });
  }

  if (itemSpecificsList.length > 0) {
    ebayRequest.Item.ItemSpecifics = {
      NameValueList: itemSpecificsList
    };


  }

  const itemSpecificsArray = ebayItem?.itemSpecifics ?
    Object.entries(ebayItem.itemSpecifics).map(([name, value]) => ({ name, value })) :
    [];



  try {
    // Create a promise that resolves with null after 20 seconds
    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 20000);
    });

    // Choose the appropriate API method based on whether we have variations
    const apiMethod = hasVariations ? 'AddFixedPriceItem' : 'AddItem';

    // Update eBay item with timeout
    const ebayResponse = await Promise.race([
      eBay.trading[apiMethod](ebayRequest),
      timeout
    ]);

    // Check if we got a timeout (null response)
    if (!ebayResponse) {
      const err = {
        error: 'No response from eBay after 20 seconds'
      };
      newRelic.recordCustomEvent('ebay_timeout_error', err);
      await apiCallLog(
        apiMethod,
        "createEbayItem",
        "createEbayItem",
        ebayRequest,
        "",
        err,
        "failed",
      );
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'failed to Create product'
      });
    }

    console.log(`Created product: ${ebayResponse.ItemID}`);

    // Prepare CSKU data
    const cskuData = {
      userId,
      marketplaceId,
      accountName,
      channelId: ebayResponse?.ItemID,
      isku: ebayItem?.isku,
      title: ebayItem?.title,
      description: ebayItem?.description,
      images: ebayItem?.images,
      ...(ebayItem?.customized_images?.length > 0 && {
        customized_images: ebayItem?.customized_images,
      }),
      categoryId: ebayItem?.categoryAspects?.category?.id,
      categoryName: ebayItem?.categoryAspects?.category?.name,
      weight: ebayItem?.weightMajor,
      weightUnit: ebayItem?.weightUnit,
      height: ebayItem?.height,
      length: ebayItem?.length,
      depth: ebayItem?.depth,
      unit: ebayItem?.unit,
      price: ebayItem?.price,
      currency: ebayItem?.currency,
      itemSpecifics: itemSpecificsArray,
      sellerProfile: ebayItem?.policies,
      siteId: ebayItem?.siteId,
      merchantLocation: ebayItem?.location,
      status: "live"
    };

    // If the product has variations, generate a unique variantId,
    // include the variations info, and do not set a parent quantity.
    if (hasVariations) {
      const variantId = `var-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      cskuData.variations = ebayItem.variations;
      cskuData.variantId = variantId;
      cskuData.quantity = ebayItem?.quantity;
    } else {
      cskuData.quantity = ebayItem?.quantity;
    }

    // Create CSKU record
    const cskuRecord = await csku.create(cskuData);

    // For products with variations, create each combination as a separate entry
    if (hasVariations) {
      const variationPromises = ebayItem.variations.combinations.map(async (combination) => {
        // Create a unique SKU for this variation (if needed)
        const variationSku = `${ebayItem.isku}-${Object.values(combination).join('-')}`;

        // Create the catalogue variation record
        return await CatalogueVariation.create({
          userId,
          marketplaceId,
          account_name: accountName,
          channel_id: cskuRecord?.channelId,
          variation_id: cskuRecord.variantId,
          isku: ebayItem?.isku,
          variation: ebayItem?.variations,
          price: combination.price,
          quantity: combination.quantity
        });
      });

      // Wait for all variation records to be created
      await Promise.all(variationPromises);
    }

    await apiCallLog(
      apiMethod,
      "createEbayItem",
      "createEbayItem",
      ebayRequest,
      ebayResponse,
      "",
      "Success",
    );

    return res.status(200).json({
      success: true,
      status: 200,
      data: {
        ebayResponse,
        cskuRecord
      }
    });
  } catch (error) {
    console.error('Error creating eBay item:', error.meta);
    const err = {
      error: error?.message
    }
    newRelic.recordCustomEvent('error_creating_item', err);
    await apiCallLog(
      hasVariations ? "AddFixedPriceItem" : "AddItem",
      "createEbayItem",
      "createEbayItem",
      ebayRequest,
      "",
      error,
      "failed",
    );
    return res.status(500).json({
      success: false,
      status: 500,
      message: 'Failed to create eBay item',
      error: error.message
    });
  }
};
exports.RelistEbayItem = async (eBay, channelId) => {
  try {

    if (!channelId) {
      throw new Error("Channel Id is required");
    }

    const response = await eBay.trading.RelistFixedPriceItem({
      Item: {
        ItemID: channelId,
        Quantity: 1
      }
    });

    return response;

  } catch (err) {
    console.log(err.meta);
    throw err;
  }
}