const newRelic = require("newrelic");
const ebay = require("ebay-api");
const nodemailer = require("nodemailer");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const GeositeRepository = require("../../models/geosite");
const TokensRepository = require("../../models/tokens");
const UserRepository = require("../../models/user");
const CskuRepository = require("../../models/csku");
const Tokens = require("../../models/tokens");
const shippingPolicies = require("../../models/shippingPolicies");
const returnPolicies = require("../../models/returnPolicy");
const paymentPolicies = require("../../models/paymentPolicy");
const {apiCallLog}=require("../../helper/apiCallLog")
const moment = require('moment')


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
  const functionName="refreshTokenIfNeeded";
  let startdate = moment().add(5, 'hours').add(30, 'minutes');  
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);  
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

  if (hoursDifference >= 2) {
    await refreshToken(eBay,token)
   }
  // try {
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token?.token,
  //     },
  //   });
  //   eBay.OAuth2.setCredentials(token?.token);
  //   await apiCallLog("GetTokenStatus","/getEbayListingOne",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //   await apiCallLog("GetTokenStatus","/getEbayListingOne",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    // await refreshToken(eBay, token);
  //   const updatedToken = await TokensRepository.findOne({
  //     where: { userId, marketPlaceId, accountName },
  //     raw: true,
  //   });
  //   eBay.OAuth2.setCredentials(updatedToken?.token);
  // }
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

  if (offerId) {
    const updateOfferDetails = await eBay.sell.inventory.updateOffer(offerId, {
      ...offerPayload,
    });

    console.log("updateOffers", updateOfferDetails);
  } else {
    try {
      const newOffer = await eBay.sell.inventory.createOffer(offerPayload);
      console.log("newOffer", newOffer);
      offerId = newOffer?.offerId;
    } catch (err) {
      errors.push({
        marketplaceId: cskuExist?.marketplaceId,
        account: cskuExist?.accountName,
        siteId: cskuExist?.siteId,
        error: "An error occurred while creating the offer.",
        details: err,
      });
      await updateCSKU(cskuExist?.id, {
        quantityUpdationStatus: "FAILED",
        quantityUpdateErrors: errors,
        quantityUpdateDate: currentDate,
      });
    }
  }

  return offerId;
}

async function publishEbayOffer(eBay, offerId) {
  const publishOffer = await eBay.sell.inventory.publishOffer(offerId);

  console.log("publishOffer", publishOffer);
  return publishOffer?.listingId ?? null;
}

async function fetchAspects(title, description, categoryId, categoryName, eBay) {
  try {

    let aspectData = await eBay.commerce.taxonomy.getItemAspectsForCategory(0, categoryId);

    const requiredAspects = aspectData.aspects.filter(asp => asp.aspectConstraint.aspectRequired);
    // console.log(requiredAspects);
    const completion = await openai.chat.completions.create({
      messages: [{
        "role": "system", "content": `${title} ${description} ${categoryName}
                            Based on the text above extract ${requiredAspects.map(asp => asp.localizedAspectName).join(", ")} return 'NA' if not found and return in object form.
                            Note: Purity and Metal Purity are same.
                            `}],
      model: "gpt-3.5-turbo",
    });

    let aspects = {};

    completion.choices[0].message.content?.replace("{", "").replace("}", "").split("\n")?.map(item => {
      const [key, value] = item.split(":");

      if (key.includes("Brand")) {
        aspects["Brand"] = apiRes?.data?.product?.vendor;
      } else {
        if ((key != "" && key && !value?.includes("NA") && (!key.includes("N/A") && !key.includes("NA")))) {
          aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [value?.replaceAll("*", "").replaceAll("-", "").replace("US", "").replace("(", "").replace(")", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()];
        } else if (value?.includes("NA")) {
          aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [foundAspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()]];
        }
      }
    });

    return aspects;

  } catch (err) {
    console.log(err);
    throw err;
  }
}

async function fetchCategory(title, eBay) {
  try {
    const category = await eBay.commerce.taxonomy.getCategorySuggestions(0, item[0].title.replace(/[^a-zA-Z0-9 ]/g, ''));
    const categoryId = category.categorySuggestions[0].category.categoryId;
    const categoryName = category.categorySuggestions[0].category.categoryName;

    return { categoryId, categoryName };
  } catch (err) {
    console.log(err);
    throw err;
  }
}

async function getSellerProfile (accountName, userId, geoSite) {
  try {

    const shippingPolicy = await shippingPolicies.findOne({
      where: {
        userId: userId,
        marketplaceId: geoSite?.globalId,
        accountName: accountName,
      },
      raw: true,
    });

    const returnPolicy = await returnPolicies.findOne({
      where: {
        userId: userId,
        marketplaceId: geoSite?.globalId,
        accountName: accountName,
      },
      raw: true,
    });

    const paymentPolicy = await paymentPolicies.findOne({
      where: {
        userId: userId,
        marketplaceId: geoSite?.globalId,
        accountName: accountName,
      },
      raw: true,
    });

    const sellerProfile = {
      SellerShippingProfile: {
        ShippingProfileID: shippingPolicy?.fulfillmentPolicyId,
      },
      SellerPaymentProfile: {
        PaymentProfileID: paymentPolicy?.paymentPolicyId,
      },
      SellerReturnProfile: {
        ReturnProfileID: returnPolicy?.returnPolicyId,
      },
    };

    return sellerProfile;

  } catch (err) {
    console.log(err);
    throw err;
  }
}

module.exports = { getSellerProfile };

async function handleEbayListingOne(
  marketplace,
  product,
  token,
  description,
  quantity,
  queueData,
  geoSite,
  condition
) {
  if (!marketplace?.url?.includes("ebay")) return;

  const errors = [];

  const currentDate = new Date();
  currentDate.setHours(
    currentDate.getHours() + 5,
    currentDate.getMinutes() + 30
  );

  const tokenDetails = await Tokens.findByPk(token.id);
  const eBay = await initializeEbayAPI(geoSite, tokenDetails);

  await refreshTokenIfNeeded(
    eBay,
    tokenDetails,
    product?.marketplaceId,
    product?.userId,
    product?.accountName
  );

  const geoSiteDb = await getGeoSite(geoSite);
  const language = geoSiteDb?.languageCode;

  const translatedDescription = await translateTextIfNeeded(
    eBay,
    description,
    language,
    "ITEM_DESCRIPTION"
  );

  try {
    // Attempt to get and update the item from eBay's inventory
    // let productInEbay = await eBay.sell.inventory.getInventoryItem(
    //   product?.isku
    // );

    const { categoryId, categoryName } = await fetchCategory(product?.title, eBay);

    const aspects = await fetchAspects(product.title, translatedDescription, categoryId, categoryName, eBay);

    const sellerProfile = await getSellerProfile(product?.accountName, product?.userId, geoSiteDb);

    const productInEbay = {
      sku: product.itemId,
      locale: "en_US",
      product: {
        title: product.title,
        aspects: aspects,
        imageUrls: product.images,
      },
      availability: {
        shipToLocationAvailability: {
          quantity: product.quantity,
        },
      },
      condition: condition,
    };

    await updateEbayInventoryItem(eBay, productInEbay, product?.quantity);

    const offerPayload = createOfferPayload(
      product,
      translatedDescription,
      quantity,
      geoSiteDb?.globalId,
      sellerProfile,
      geoSiteDb?.currency
    );

    const offerId = await createOrUpdateEbayOffer(
      eBay,
      offerPayload,
      product,
      errors
    );

    await publishEbayOffer(eBay, offerId);
  } catch (error) {
    console.error("Error during eBay inventory fetch:", error);
    await handleEbayListingError(
      eBay,
      product,
      translatedDescription,
      quantity,
      errors,
      currentDate,
      queueData,
      tokenDetails, //TODO: send token to add in queue
      description, //TODO: send token to add in queue
      marketplace //TODO: send token to add in queue
    );
  }
}

// Helper function to translate text if needed
async function translateTextIfNeeded(eBay, text, language, context) {
  return language === "en"
    ? text
    : await translateText(eBay, text, language, context);
}

// Helper function to create offer payload
function createOfferPayload(product, translatedDescription, quantity, siteId, sellerProfile, currency) {
  return {
    sku: product?.isku.toString(),
    marketplaceId: siteId == "EBAY_MOTORS_US" ? "EBAY_MOTORS" : siteId,
    format: "FIXED_PRICE",
    listingDescription: translatedDescription,
    availableQuantity: Number(quantity),
    quantityLimitPerBuyer: Number(product?.quantityLimitPerBuyer),
    pricingSummary: {
      price: { currency: currency, value: Number(product?.price) },
    },
    listingPolicies: {
      fulfillmentPolicyId:
        sellerProfile?.SellerShippingProfile?.ShippingProfileID,
      paymentPolicyId:
        sellerProfile?.SellerPaymentProfile?.PaymentProfileID,
      returnPolicyId:
        sellerProfile?.SellerReturnProfile?.ReturnProfileID,
    },
    categoryId: categoryId,
    merchantLocationKey: merchantLocation,
  };
}

// Helper function to handle errors during eBay listing
async function handleEbayListingError(
  eBay,
  product,
  translatedDescription,
  quantity,
  errors,
  currentDate,
  queueData,
  tokenDetails,
  description,
  marketplace
) {
  try {
    await migrateAndFetchItem(eBay, product);
    const productInEbay = await eBay.sell.inventory.getInventoryItem(
      product?.isku
    );
    await updateEbayInventoryItem(eBay, productInEbay, product?.quantity);

    const offerPayload = createOfferPayload(
      product,
      translatedDescription,
      quantity
    );
    const offerId = await createOrUpdateEbayOffer(eBay, offerPayload, product);
    await publishEbayOffer(eBay, offerId);
  } catch (innerError) {
    console.error("Error during bulk migration or SKU fix:", innerError);
    await handleFinalEbayListingError(
      eBay,
      product,
      innerError,
      errors,
      currentDate,
      queueData,
      tokenDetails, //TODO: send token to add in queue
      description, //TODO: send token to add in queue
      quantity, //TODO: send token to add in queue
      marketplace //TODO: send token to add in queue
    );
  }
}

// Helper function to update eBay inventory item
async function updateEbayInventoryItem(eBay, productInEbay, quantity) {
  await eBay.sell.inventory.createOrReplaceInventoryItem(productInEbay?.sku, {
    product: { ...productInEbay.product },
    availability: {
      shipToLocationAvailability: {
        quantity: Number(quantity),
      },
    },
  });
}

// Helper function to handle final eBay listing errors
async function handleFinalEbayListingError(
  eBay,
  product,
  error,
  errors,
  currentDate,
  queueData,
  tokenDetails,
  description,
  quantity,
  marketplace
) {
  try {
    await reviseItemSKU(eBay, product);
  } catch (finalError) {
    console.error("Final attempt to revise SKU failed:", finalError);
    errors.push({
      marketplaceId: product?.marketplaceId,
      account: product?.accountName,
      siteId: product?.siteId,
      error: "An error occurred while handling the eBay update",
      details: finalError,
    });
    await updateCSKU(product?.id, {
      quantityUpdationStatus: "FAILED",
      quantityUpdateErrors: errors,
      quantityUpdateDate: currentDate,
    });
    //NOTE - add products in queue
    queueData.push({
      product: product,
      token: tokenDetails,
      description,
      quantity,
      marketplace,
    });
  }
}

// Helper function to migrate and fetch item
async function migrateAndFetchItem(eBay, product) {
  await eBay.sell.inventory.bulkMigrateListing({
    requests: [{ listingId: product?.channelId }],
  });
}

// Helper function to revise the item's SKU using eBay's Trading API
async function reviseItemSKU(eBay, product) {
  const functionName="reviseItemSKU";
  try {
    await eBay.trading.ReviseItem({
      Item: {
        ItemID: product?.channelId,
        SKU: product?.isku,
      },
    });
    await apiCallLog("ReviseItem","handleFinalEbayListingError",functionName,{
      Item: {
        ItemID: product?.channelId,
        SKU: product?.isku,
      },
    },{}, {}, 'success');
  } catch (error) {
    await apiCallLog("ReviseItem","handleFinalEbayListingError",functionName,{
      Item: {
        ItemID: product?.channelId,
        SKU: product?.isku,
      },
    },{}, error.meta, 'error');
  }
}

module.exports = { handleEbayListingOne };
