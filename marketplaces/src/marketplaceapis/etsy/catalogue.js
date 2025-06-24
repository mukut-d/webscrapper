const { default: axios } = require("axios");
const csku = require("../../models/csku");
const isku = require("../../models/isku");
const Tokens = require("../../models/tokens");
const Marketplace = require("../../models/marketplace");
const fs = require("fs");
const qs = require("qs");
const moment = require("moment");
const FormData = require("form-data");
let etsy_category_data = JSON.parse(
  fs.readFileSync(`${__dirname}/etsy_catagory.json`, "utf8")
);
const { apiCallLog } = require("../../helper/apiCallLog");
const CatalogueVariation = require("../../models/catalogue-variation");

exports.GetEtsyCatalogue = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity,
  type
) => {
  try {
    let startdate = moment().add(5, 'hours').add(30, 'minutes');
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;
    const id = access_token.split(".")[0];
    let response;

    try {
      response = await axios.get(
        `https://openapi.etsy.com/v3/application/users/${id}/shops`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-api-key": token.dataValues.client_id,
          },
        }
      );

      console.log("Shop Details:", response.data.shop_id);
    } catch (error) {
      if (error.response) {
        console.error("Error:", error.response.status, error.response.data);
      } else if (error.request) {
        console.error("No response:", error.request);
      } else {
        console.error("Error:", error.message);
      }
      return; // Exit on error
    }

    let shopId = response.data.shop_id;
    console.log("Access token", access_token);

    let offset = 0;
    let hasMoreListings = true;
    let pageNumber = 1;
    const limit = 100; // Increase this value for faster fetching
    let listings = [];

    while (hasMoreListings) {
      let startdate = moment();
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

      if (minuteDifference >= 45) {
        await refreshToken(token);
      }

      access_token = token.dataValues.token;
      const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`;

      try {
        let startdate = moment();
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

        if (minuteDifference >= 45) {
          await refreshToken(token);
        }
        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-api-key": token.dataValues.client_id,
          },
          params: {
            limit,
            offset,
            includes: [
              "Inventory",
              "Images",
              "Shop",
              "User",
              "Translations",
              "Shipping",
              "Videos",
            ],
            ...(type !== "firstFetch" && {
              sort_on: "created",
              sort_order: "desc",
            }),
          },
        });

        const { results, count } = response.data;
        let oneMonthBack;
        if (type !== "firstFetch") {
          oneMonthBack = moment().subtract(1, "months").unix();
        }
        if (results && results.length > 0) {
          const syncListings = [];
          const lastResultTimestamp =
            results[results.length - 1].created_timestamp;
          if (type !== "firstFetch") {
            if (lastResultTimestamp - oneMonthBack >= 0) {
              listings.push(...results);
              await this.pushDataToEtsy(results, userId, accountName, marketplaceId, addQuantity, shopId);
              offset += results.length;
              pageNumber++;
            } else if (lastResultTimestamp - oneMonthBack < 0) {
              console.log(
                "One month back - last result timestamp(going in <0):",
                lastResultTimestamp - oneMonthBack
              );
              for (const item of results) {
                if (item.created_timestamp - oneMonthBack >= 0) {
                  console.log(
                    "item timeStamp",
                    moment
                      .unix(item.created_timestamp)
                      .format("YYYY-MM-DD HH:mm:ss")
                  );
                  console.log(
                    "One month back - item timestamp(going in >=0)(when diff < 0):",
                    oneMonthBack - item.created_timestamp
                  );
                  syncListings.push(item);
                }
              }
              listings.push(...syncListings);
              await this.pushDataToEtsy(
                syncListings,
                userId,
                accountName,
                marketplaceId,
                addQuantity,
                shopId
              );

              hasMoreListings = false;
              break;
            }
          } else if (type == "firstFetch") {
            listings.push(...results);
            await this.pushDataToEtsy(
              results,
              userId,
              accountName,
              marketplaceId,
              addQuantity,
              shopId
            );
            offset += results.length;
            pageNumber++;
            hasMoreListings = count > offset;
            console.log(
              `Fetched ${results.length} listings from page ${pageNumber}. Total so far: ${offset}`
            );
          }
        } else {
          hasMoreListings = false;
        }
      } catch (error) {
        console.error(
          "Error fetching Etsy listings:",
          error.response?.data || error.message
        );
        throw error; // Rethrow the error to be handled upstream
      }
    }

    console.log("All listings have been fetched and stored.");
  } catch (error) {
    console.error("Error in GetEtsyCatalogue:", error.message);
  }
};

exports.pushDataToEtsy = async (
  results,
  userId,
  accountName,
  marketplaceId,
  addQuantity,
  shopId
) => {
  try {
    const cskus = [];
    const iskus = [];
    const variants = [];

    console.log("Push data going", userId, accountName, marketplaceId);

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const [imageUrls, categoryNames, itemSpecificsEtsy] = await Promise.all([
        Promise.resolve(item?.images?.map((image) => image.url_fullxfull)),
        findCategoryNamesByTaxonomyId(item?.taxonomy_id),
        gettingItemSpecificsEtsy(item.listing_id, shopId, userId, accountName),
      ]);

      const customPrice =
        item?.price?.amount && item?.price?.divisor
          ? item.price.amount / item.price.divisor
          : null;
      const uniqueSkus = item.skus?.length
        ? [...new Set(item.skus)].join(",")
        : "";

      const sellerProfile = {
        SellerReturnProfile: {
          ReturnProfileID: item.return_policy_id,
          ReturnProfileName: "Return Policy",
        },
        SellerPaymentProfile: {
          PaymentProfileID: item?.payment_profile_id || null,
          PaymentProfileName: "Payment Policy",
        },
        SellerShippingProfile: {
          ShippingProfileID: item.shipping_profile_id,
        },
      };

      const itemSpecifics = [
        {
          Tags: item.tags,
          Materials: item.materials,
          Brand: item?.production_partners?.[0]?.partner_name || "N/A",
          WhoMade: item.who_made,
          WhenMade: item.when_made,
          itemSpecificsEtsy,
        },
      ];

      const videoUrl = item?.videos?.[0]?.video_url || null;
      const status =
        item.state === "active"
          ? "live"
          : item.state === "ended"
            ? "completed"
            : item.state === "deleted"
              ? "deleted"
              : "";

      // Handle isku updates
      const iskuExist = await isku.findOne({
        where: {
          isku: uniqueSkus,
          userId: userId,
        },
      });

      if (iskuExist && addQuantity === true) {
        iskuExist.quantity = parseInt(iskuExist.quantity) + item.quantity;
        await iskuExist.save();
      } else if (!iskuExist) {
        iskus.push({
          isku: uniqueSkus,
          costPrice: customPrice,
          title: item.title,
          images: imageUrls,
          quantity: item.quantity,
          currency: item.price.currency_code,
          accountName: accountName,
          marketplaceId: marketplaceId,
          userId: userId,
        });
      }

      // Handle csku updates
      const cskuExist = await csku.findOne({
        where: {
          channelId: item.listing_id.toString(),
          userId: userId,
        },
      });

      if (!cskuExist) {
        cskus.push({
          channelId: item.listing_id,
          isku: uniqueSkus,
          price: customPrice,
          mrp: customPrice,
          images: imageUrls,
          description: item.description,
          categoryId: item.taxonomy_id,
          categoryName: categoryNames,
          quantity: item.quantity,
          currency: item.price.currency_code,
          itemSpecifics: itemSpecifics,
          itemCompatibility: item?.compitibility || null,
          sellerProfile: sellerProfile,
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId,
          title: item.title,
          videos: videoUrl,
          status: status,
          groupProductId: item.listing_id,
          siteId: "ETSY",
          sku_found: Boolean(uniqueSkus),
          storeCategoryId: item?.shop_section_id,
        });
      } else {
        await cskuExist.update({
          isku: uniqueSkus || item.listing_id,
          quantity: item.quantity,
          videos: videoUrl,
          images: imageUrls,
          status: status,
          storeCategoryId: item?.shop_section_id,
          price: customPrice,
          title: item.title,
          description: item.description,
        });

        await CatalogueVariation.destroy({
          where: {
            channel_id: item.listing_id.toString(),
            userId: userId,
            account_name: accountName,
            marketplace_id: marketplaceId,
          },
        });

      }

      // Handle variant updates
      if (item.inventory?.products?.length > 1) {
        await Promise.all(
          item.inventory.products.map(async (prdct) => {
            // const variantExist = await CatalogueVariation.findOne({
            //   where: {
            //     channel_id: item?.listing_id.toString(),
            //     variation_id: prdct?.product_id.toString(),
            //     userId: userId,
            //     account_name: accountName,
            //   },
            // });

            const transformedVariation = await transformData(prdct);

            const variantData = {
              channel_id: item.listing_id,
              variation_id: prdct?.product_id.toString(),
              price:
                prdct?.offerings?.[0]?.price?.amount /
                prdct?.offerings?.[0]?.price?.divisor,
              variation: prdct,
              quantity: prdct?.offerings?.[0]?.quantity,
              account_name: accountName,
              userId: userId,
              marketplace_id: marketplaceId,
              transformed_variation: transformedVariation
            };

            // if (!variantExist) {
            variants.push(variantData);
            // } else {
            //   await variantExist.update(variantData);
            // }
          })
        );
      }
    }

    console.log("CSKUs:", cskus);
    await isku.bulkCreate(iskus);
    await csku.bulkCreate(cskus);
    await CatalogueVariation.bulkCreate(variants);
  } catch (error) {
    console.log("Error in pushDataToEtsy:", error);
  }
};

exports.convertToDBFormat = async (
  results,
  userId,
  accountName,
  marketplaceId,
  addQuantity,
  shopId
) => {
  try {
    const cskus = [];
    const iskus = [];

    console.log("Push data going", userId, accountName, marketplaceId);

    for (const item of results || []) {
      const variants = [];
      console.log(item)
      const [imageUrls, categoryNames, itemSpecificsEtsy] = await Promise.all([
        Promise.resolve(item?.images?.map((image) => image.url_fullxfull)),
        await findCategoryNamesByTaxonomyId(item?.taxonomy_id),
        await gettingItemSpecificsEtsy(item.listing_id, shopId, userId, accountName),
      ]);

      const customPrice =
        item?.price?.amount && item?.price?.divisor
          ? item.price.amount / item.price.divisor
          : null;
      const uniqueSkus = item.skus?.length
        ? [...new Set(item.skus)].join(",")
        : "";

      const sellerProfile = {
        SellerReturnProfile: {
          ReturnProfileID: item.return_policy_id,
          ReturnProfileName: "Return Policy",
        },
        SellerPaymentProfile: {
          PaymentProfileID: item?.payment_profile_id || null,
          PaymentProfileName: "Payment Policy",
        },
        SellerShippingProfile: {
          ShippingProfileID: item.shipping_profile_id,
        },
      };

      const itemSpecifics = [
        {
          Tags: item.tags,
          Materials: item.materials,
          Brand: item?.production_partners?.[0]?.partner_name || "N/A",
          WhoMade: item.who_made,
          WhenMade: item.when_made,
          itemSpecificsEtsy,
        },
      ];

      const videoUrl = item?.videos?.[0]?.video_url || null;
      const status =
        item.state === "active"
          ? "live"
          : item.state === "ended"
            ? "completed"
            : item.state === "deleted"
              ? "deleted"
              : "";

      // Handle variant updates
      if (item.inventory?.products?.length > 1) {
        
        await Promise.all(
          item.inventory.products.map(async (prdct) => {

            
            const transformedVariation = await transformData(prdct);

            const variantData = {
              channel_id: item.listing_id,
              variation_id: prdct?.product_id.toString(),
              price:
                prdct?.offerings?.[0]?.price?.amount /
                prdct?.offerings?.[0]?.price?.divisor,
              variation: prdct,
              quantity: prdct?.offerings?.[0]?.quantity,
              account_name: accountName,
              userId: userId,
              marketplace_id: marketplaceId,
              transformed_variation: transformedVariation
            };

            variants.push(variantData);

          })
        );
      }

      cskus.push({
        channelId: item.listing_id,
        isku: uniqueSkus,
        price: customPrice,
        mrp: customPrice,
        images: imageUrls,
        description: item.description,
        categoryId: item.taxonomy_id,
        categoryName: categoryNames,
        quantity: item.quantity,
        currency: item.price.currency_code,
        itemSpecifics: itemSpecifics,
        itemCompatibility: item?.compitibility || null,
        sellerProfile: sellerProfile,
        marketplaceId: marketplaceId,
        accountName: accountName,
        userId: userId,
        title: item.title,
        videos: videoUrl,
        status: status,
        groupProductId: item.listing_id,
        siteId: "ETSY",
        sku_found: Boolean(uniqueSkus),
        storeCategoryId: item?.shop_section_id,
        variation: variants,
      });

    }

    fs.writeFileSync("cskus.json", JSON.stringify(cskus, null, 2));

    return cskus;

  } catch (error) {
    console.log("Error in pushDataToEtsy:", error);
  }
};

async function transformData(data) {
  let result = {};

  // console.log("Data received in transformData:", JSON.stringify(data, null, 2));
  console.log("Type of data.property_values:", typeof data.property_values);
  console.log("Is data.property_values an array?", Array.isArray(data.property_values));

  if (!data || typeof data !== "object") {
    console.log("Error: Data is not an object");
    return result;
  }

  if (Array.isArray(data.property_values)) {
    data.property_values.forEach((property) => {
      if (property.property_name && Array.isArray(property.values) && property.values.length > 0) {
        result[property.property_name] = property.values[0];
      }
    });
  } else {
    console.log("property_values is not an array or is undefined");
  }

  return result;
}

const gettingItemSpecificsEtsy = async (itemId, shop, userId, accountName) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // Utility function for delay

  const maxRetries = 5;
  const baseDelay = 3000;

  try {
    const token = await Tokens.findOne({
      where: {
        accountName,
        userId,
      },
    });

    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const response = await axios.get(
          `https://openapi.etsy.com/v3/application/shops/${shop}/listings/${itemId}/properties`,
          {
            headers: {
              Authorization: `Bearer ${token.token}`,
              "Content-Type": "application/json",
              "x-api-key": token.client_id,
            },
          }
        );
        const formattedData = response.data.results.map((item) => {
          const key = item.property_name;
          const value =
            item.scale_name && item.values.length === 1
              ? `${item.values[0]} ${item.scale_name}`
              : item.values.join(", ");
          return { [key]: value };
        });
        return formattedData;
      } catch (error) {
        if (error.response?.status === 429) {
          retries += 1;
          const backoffDelay = baseDelay * 2 ** retries;
          console.warn(
            `Rate limit exceeded. Retry ${retries} in ${backoffDelay}ms...`
          );
          await delay(backoffDelay);
        } else {
          console.error(
            "Error fetching listing properties:",
            error.response?.data || error.message
          );
          throw error;
        }
      }
    }

    throw new Error(
      "Max retries exceeded. Could not fetch listing properties."
    );
  } catch (error) {
    console.error("Error while getting item specifics:", error.message);
    throw error; // Re-throw the error to handle it in the calling function
  }
};

const findCategoryNamesByTaxonomyId = async (taxonomyId) => {
  try {
    const findCategoryById = (categoryId, data) => {
      return data.find((category) => category.categoryId == categoryId);
    };

    let category = findCategoryById(taxonomyId, etsy_category_data);
    if (!category) {
      throw new Error(`Category with taxonomy_id: ${taxonomyId} not found`);
    }

    let categoryNames = category.categoryName;
    let currentCategory = category;

    while (currentCategory.parentCategory) {
      currentCategory = findCategoryById(
        currentCategory.parentCategory,
        etsy_category_data
      );

      if (currentCategory) {
        categoryNames = `${currentCategory.categoryName}, ${categoryNames}`;
      } else {
        break;
      }
    }

    return categoryNames;
  } catch (error) {
    console.error("Error finding category names by taxonomy_id:", error);
    return null;
  }
};


exports.createEtsyCatalogue = async (
  accountName,
  // quantity,
  // tokens,
  marketPlaceId,
  userId,
  data
) => {
  try {

    const accountname = accountName[0];
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountname,
      },
    });
    console.log(token);
    let error = [];
    let listing = [];
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;

    let shopId = token.dataValues?.shop_id || token?.shop_id;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); 
    const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`;
    const payload = qs.stringify({
      quantity: data.quantity,
      title: data.title,
      description: data.description,
      price: data.price,
      who_made: data.who_made,
      when_made: data.when_made,
      taxonomy_id: data?.category?.categoryId,
      shipping_profile_id:
        data.policies.SellerShippingProfile.ShippingProfileID,
      materials: data.material,
      tags: data.tags,
    });

    if (data.policies?.SellerReturnProfile?.ReturnProfileID) {
      payload.return_policy_id = data.policies.SellerReturnProfile.ReturnProfileID;
    }

    if(data?.storeCategoryId){
      payload.shop_section_id= data.storeCategoryId
    }

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "x-api-key": token.dataValues.client_id,
        },
      });
      const listingId = response?.data?.listing_id;
      console.log(listingId,"listingId")
      if (listingId) {
        for (let i = 0; i< data?.images.length; i++) {
          await delay(2000);
          const imageUrl = data?.images[i];

          try {
            const imageBuffer = await axios.get(imageUrl, {
              responseType: "arraybuffer",
            });

            const form = new FormData();
            form.append("image", imageBuffer.data, { filename: "image.png" });
            form.append("alt_text", "product image");
            form.append("rank",i+1)

            const response = await axios({
              method: "post",
              url: `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
              headers: {
                Authorization: `Bearer ${access_token}`,
                "x-api-key": token.dataValues.client_id,
                ...form.getHeaders(),
              },
              data: form,
            });
          } catch (err) {
            console.error(
              `Error uploading image from ${imageUrl}:`,
              err.response?.data || err.message
            );
            error.push({
              error: `An error occurred while adding images to product ${listingId}.`,
              details: err.message,
            });
            return { success: false, message: err.message };
          }
        }
      }

      if(data?.videoLink && listingId){
        try {
          const response = await axios.get(data?.videoLink, { responseType: 'stream' });
          const filename =`video_${listingId}.mp4`;
          const form = new FormData();
          form.append('video', response.data, { filename });
          form.append('name', filename);

          const uploadResponse = await axios.post(
            `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/videos`,
            form,
            {
              headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${access_token}`,
                "x-api-key": token.dataValues.client_id,
              },
            }
          );
        } catch (error) {
          console.error('Upload failed:', error.response?.data || error.message);
          throw error;
        }
      }

      if (data.categoryAspects && listingId) {
        const categoryAspectsArray = Object.values(data.categoryAspects);
        for (const property of categoryAspectsArray) {
          const { property_id, value, name } = property;
          let intVal = parseInt(value, 10);
          const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/properties/${property_id}`;
          const payload = qs.stringify({
            value_ids: intVal,
            values: JSON.stringify([name]),
          });
          try {
            const response = await axios.put(url, payload, {
              headers: {
                "x-api-key": token.dataValues.client_id,
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
            });
          } catch (error) {
            console.error(
              `Failed to update property ${property_id}:`,
              error.response?.data || error.message
            );
            return { success: false, message: error.message };
          }
        }
      }

      if (data?.variations && listingId) {
        let id = data.category?.categoryId;
        id = parseInt(id);
        const API_URL = `https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/${id}/properties`;
        try {
          const response = await axios.get(API_URL, {
            headers: {
              Authorization: `Bearer ${access_token}`,
              "x-api-key": token.dataValues.client_id,
              "Content-Type": "application/json",
            },
          });

          const properties = response.data.results;

          const etsyFormattedData = await transformVariationsToEtsyFormat(
            data,
            properties
          );

          const url = `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`;
          await delay(2000);
          try {
            const response = await axios.put(url, etsyFormattedData, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${access_token}`,
                "x-api-key": token.dataValues.client_id,
              },
            });

          } catch (err) {
            console.error("Error updating inventory:", err);
            error.push({
              error: `An error occurred while adding inventory to product ${listingId}.`,
              details: err.message,
            });
            return { success: false, message: err.message };
          }
        } catch (err) {
          console.error("Error fetching properties:", err);
          return { success: false, message: err.message };
        }
      }
      if (listingId) {
        const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`;
        try {
          const response = await axios.patch(
            url,
            {
              state: "active",
            },
            {
              headers: {
                "x-api-key": token.dataValues.client_id,
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          );
          if (response) {
            const etsyItem = await this.getEtsyItem(listingId, token);
            const pushDataBody = [etsyItem];
            await this.pushDataToEtsy(
              pushDataBody,
              userId,
              accountName[0],
              marketPlaceId,
              false,
              token.dataValues?.shop_id
            );
            return {
              success: true,
              message: `Product ${listingId} and ${data.isku} has been successfully listed with status Active on Etsy.`,
            };
          }
        } catch (error) {
          console.error(
            "Error updating the listing:",
            error.response?.data || error.message
          );
          return { success: false, message: error.message };
        }
      }
    } catch (err) {
      console.log(err, "Error")
      console.error(
        "Error creating draft listing:",
        err.response ? err.response.data : err.message
      );
      error.push({
        error: `An error occurred while creating a product on shop ${shopId}.`,
        details: err.message,
      });
      if (err.response?.data?.error) {
        return { success: false, message: err.response.data.error };
      }
      return { success: false, message: err.message };
    }
  } catch (err) {
    console.log(err);
    return { success: false, message: err.message };
  }
};

exports.updateEtsyCatalogue = async (
  userId,
  accountName,
  // quantity,
  marketPlaceId,
  token,
  data,
  channelId
) => {
  try {
    console.log("data", data);
    console.log("data policies: ", data?.policies);

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName,
      },
    });
    console.log(token);
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;

    const id = access_token.split(".")[0];
    let sellerProfile = {
      SellerReturnProfile: {
        ReturnProfileID:
          data?.policies?.SellerReturnProfile?.ReturnProfileID || null,
        ReturnProfileName: "Return Policy",
      },
      SellerPaymentProfile: {
        PaymentProfileID: data?.payment_profile_id || null,
        PaymentProfileName: "Payment Policy",
      },
      SellerShippingProfile: {
        ShippingProfileID:
          data.policies.SellerShippingProfile.ShippingProfileID,
      },
    };

    let response;
    // Helper function to delay execution by given milliseconds
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    await delay(2000);

    let shopId = token.dataValues.shop_id;
    if (channelId) {
      const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${channelId}`;
      try {
        response = await axios.patch(
          url,
          {
            state: "inactive",
          },
          {
            headers: {
              "x-api-key": token.dataValues.client_id,
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
      } catch (error) {
        console.error(
          "Error updating the listing:",
          error.response?.data || error.message
        );
        return { success: false, message: error.message };
      }
    }

    const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${channelId}`;
    const payload = qs.stringify({
      ...(data.quantity && { quantity: data.quantity }),
      ...(data.title && { title: data.title }),
      ...(data.description && { description: data.description }),
      ...(data.price && { price: data.price }),
      ...(data.who_made && { who_made: data.who_made }),
      ...(data.when_made && { when_made: data.when_made }),
      ...(data?.category?.categoryId && {
        taxonomy_id: data.category.categoryId,
      }),
      ...(data.policies?.SellerShippingProfile?.ShippingProfileID && {
        shipping_profile_id:
          data.policies.SellerShippingProfile.ShippingProfileID,
      }),
      ...(data.material && { materials: data.material }),
      ...(data.tags && { tags: data.tags }),
      is_supply: false,
    });
    console.log("Payload: ", payload);

    try {
      response = await axios.patch(url, payload, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "x-api-key": token.dataValues.client_id,
        },
      });
      const listingId = response?.data?.listing_id;
      if (listingId && data.images) {
        const imagesToSkip = []
        const url = `https://openapi.etsy.com/v3/application/listings/${channelId}/images`;
        try {
          response = await axios.get(url, {
            headers: {
              "x-api-key": token.dataValues.client_id,
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          });

          const images = response.data.results;
          for (const image of images) {
            if (data.images.includes(image.url_fullxfull)) {
              imagesToSkip.push(image.url_fullxfull);
              continue;
            }
            const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${channelId}/images/${image.listing_image_id}`;
            try {
              response = await axios.delete(url, {
                headers: {
                  "x-api-key": token.dataValues.client_id,
                  Authorization: `Bearer ${access_token}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              });
            } catch (error) {
              console.error(
                "Error deleting image:",
                error.response?.data || error.message
              );
              return { success: false, message: error.message };
            }
          }
        } catch (error) {
          console.error(
            "Error updating the listing:",
            error.response?.data || error.message
          );
          return { success: false, message: error.message };
        }

        for (const imageUrl of data.images) {
          await delay(2000);
          if (imagesToSkip.includes(imageUrl)) {
            continue;
          }
          try {
            const imageBuffer = await axios.get(imageUrl, {
              responseType: "arraybuffer",
            });

            const form = new FormData();
            form.append("image", imageBuffer.data, { filename: "image.png" });
            form.append("alt_text", "product image");

            response = await axios({
              method: "post",
              url: `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
              headers: {
                Authorization: `Bearer ${access_token}`,
                "x-api-key": token.dataValues.client_id,
                ...form.getHeaders(),
              },
              data: form,
            });
            console.log(`Uploaded image from ${imageUrl}:`, response.data);
          } catch (err) {
            console.error(
              `Error uploading image from ${imageUrl}:`,
              err.response?.data || err.message
            );
            return { success: false, message: err.message };
          }
        }
      }
      if (data.categoryAspects && listingId) {
        const categoryAspectsArray = Object.values(data.categoryAspects);
        for (const property of categoryAspectsArray) {
          const { property_id, value, name } = property;
          let intVal = parseInt(value, 10);
          const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/properties/${property_id}`;
          console.log(intVal, typeof intVal);
          console.log(name, typeof name);
          const payload = qs.stringify({
            value_ids: intVal,
            values: JSON.stringify([name]),
          });
          try {
            response = await axios.put(url, payload, {
              headers: {
                "x-api-key": token.dataValues.client_id,
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
            });
          } catch (error) {
            console.error(
              `Failed to update property ${property_id}:`,
              error.response?.data || error.message
            );
          }
        }
      }

      if (data.variations && listingId) {
        let id = data.category?.categoryId || data.category?.id;
        id = parseInt(id);
        const API_URL = `https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/${id}/properties`;
        try {
          response = await axios.get(API_URL, {
            headers: {
              Authorization: `Bearer ${access_token}`,
              "x-api-key": token.dataValues.client_id,
              "Content-Type": "application/json",
            },
          });

          const properties = response.data.results;
          console.log("properties: ", properties);

          const etsyFormattedData = await transformVariationsToEtsyFormat(
            data,
            properties
          );
          console.log(JSON.stringify(etsyFormattedData, null, 2));

          const url = `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`;
          await delay(2000);
          try {
            response = await axios.put(url, etsyFormattedData, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${access_token}`,
                "x-api-key": token.dataValues.client_id,
              },
            });

            console.log("Inventory updated successfully:", response.data);
          } catch (err) {
            console.error(
              "Error updating inventory:",
              err.response ? err.response.data : err.message
            );
            return { success: false, message: err.message };
          }
        } catch (err) {
          console.error("Error fetching properties:", err);
          return { success: false, message: err.message };
        }
      }
      if (listingId) {
        const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`;
        try {
          response = await axios.patch(
            url,
            {
              state: "active",
            },
            {
              headers: {
                "x-api-key": token.dataValues.client_id,
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          );
          if (response) {
            const etsyItem = await this.getEtsyItem(listingId, token);
            const pushDataBody = [etsyItem];
            await this.pushDataToEtsy(
              pushDataBody,
              userId,
              accountName,
              marketPlaceId,
              false,
              token.dataValues?.shop_id
            );
            return {
              success: true,
              message: `Product ${listingId} and ${data.isku} has been successfully Updated with status Active on Etsy.`,
            };
          }
        } catch (error) {
          console.error(
            "Error updating the listing:",
            error.response?.data || error.message
          );
          return { success: false, message: error.message };
        }
      }
    } catch (err) {
      console.error(
        "Error creating draft listing:",
        err.response ? err.response.data : err.message
      );
      return { success: false, message: err.message };
    }
  } catch (err) {
    console.log(err);
    return { success: false, message: err.message };
  }
};

exports.getEtsyItem = async (listingId, token) => {
  try {
    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;
    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/listings/${listingId}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "x-api-key": token.dataValues?.client_id,
        },
        params: {
          includes: [
            "Inventory",
            "Images",
            "Shop",
            "User",
            "Translations",
            "Shipping",
          ],
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      "Error fetching Etsy listing:",
      error.response?.data || error.message
    );
  }
};

exports.getEtsyItemBulk = async (listingIds, token) => {
  try {

    if (!listingIds || listingIds.length == 0) {
      throw new Error("Listing Ids required for bulk fetch");
    }

    if (!token || token == null || !token.lastTokenRefreshDate) {
      throw new Error("Token cannot be null");
    }

    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    let access_token = token.dataValues.token;
    if (minuteDifference >= 45) {
      access_token = await refreshToken(token);
    }

    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/listings/batch`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "x-api-key": token.dataValues?.client_id,
        },
        params: {
          includes: [
            "Inventory",
            "Images",
            "Shop",
            "User",
            "Translations",
            "Shipping",
          ],
          listing_ids: listingIds,
        },
      }
    );
    return response.data;
  } catch (error) {
    await apiCallLog("getEtsyItemBulk", "getEtsyItemBulk", "getEtsyItemBulk", { listingIds, token }, {}, { error: error.message }, "error")
    console.error(
      "Error fetching Etsy listing:",
      error.response?.data || error.message
    );
    return []
  }
};

exports.createEtsyProduct = async (
  userId,
  accountName,
  marketplaceId,
  token,
  product,
  sellerProfile,
  category,
  aspects,
  variants,
  source,
  config_id = null,
  version = null,
  sourceAccountName = null,
  source_channel_id = null
) => {
  try {
    console.log("Product:", product);
    console.log("Seller Profile:", sellerProfile);
    console.log("Category:", category);
    // console.log("Aspects:", aspects);
    // console.log("Variants:", variants);

    let error = [];
    let listing = [];
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token?.dataValues.token;
    console.log("Shop Id", token?.shop_id);
    const shopId = token.dataValues?.shop_id;
    const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`;
    const payload = qs.stringify({
      quantity: product.quantity,
      title: product.title,
      description: product.description,
      price: product.price,
      who_made: "i_did",
      when_made: "2020_2025",
      taxonomy_id: category.id,
      shipping_profile_id:
        sellerProfile.SellerShippingProfile?.ShippingProfileID,
      ...(sellerProfile.SellerReturnProfile?.ReturnProfileID
        ? {
          return_policy_id:
            sellerProfile.SellerReturnProfile?.ReturnProfileID,
        }
        : {}),
      ...(product.materials ? { materials: product.materials } : {}),
      ...(product.tags ? { tags: product.tags } : {}),
    });

    console.log("Payload: ", payload);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "x-api-key": token.dataValues.client_id,
        },
      });
      const listingId = response?.data?.listing_id;
      console.log("Listing Id:", listingId);
      // if (listingId) {
      //   for (const imageUrl of product.images) {
      //     await delay(2000);

      //     try {
      //       const imageBuffer = await axios.get(imageUrl, {
      //         responseType: "arraybuffer",
      //       });

      //       const form = new FormData();
      //       form.append("image", imageBuffer.data, { filename: "image.png" });
      //       form.append("alt_text", "product image");

      //       const response = await axios({
      //         method: "post",
      //         url: `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
      //         headers: {
      //           Authorization: `Bearer ${access_token}`,
      //           "x-api-key": token.dataValues.client_id,
      //           ...form.getHeaders(),
      //         },
      //         data: form,
      //       });
      //       console.log(`Uploaded image from ${imageUrl}:`, response.data);
      //     } catch (err) {
      //       console.error(
      //         `Error uploading image from ${imageUrl}:`,
      //         err.response?.data || err.message
      //       );
      //       error.push({
      //         error: `An error occurred while adding images to product ${listingId}.`,
      //         details: err.message,
      //       });
      //       return error;
      //     }
      //   }
      // }
      console.log("Listing Id:", listingId);
      // if (aspects && listingId) {
      //   aspects = JSON.parse(aspects);
      //   console.log(aspects.length, "aspects length >>>>> ")


      //   for (let i =0; i<aspects.length; i++) {
      //     const property = aspects[i];
      //     console.log("Ongoing Property:", property);
      //     const { property_id, value_ids, values } = property;
      //     const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/properties/${property_id}`;
      //     console.log("Property ID:", property_id);
      //     console.log("Value IDs:", value_ids);
      //     console.log("Values:", values);
      //     const payload = qs.stringify({
      //       value_ids: value_ids ? value_ids.join(",") : "",
      //       values: JSON.stringify(values),
      //     });
      //     console.log("Payload:", payload);
      //     try {
      //       const response = await axios.put(url, payload, {
      //         headers: {
      //           "x-api-key": token.dataValues.client_id,
      //           Authorization: `Bearer ${access_token}`,
      //           "Content-Type": "application/x-www-form-urlencoded",
      //         },
      //       });
      //       console.log(`Property ${property_id} updated successfully.`);
      //     } catch (error) {
      //       console.error(`Failed to update property ${property_id}:`, error);
      //     }
      //   }
      // }

      if (variants && listingId) {
        const url = `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`;
        console.log("Variants:", JSON.stringify(variants));
        // const products = variants?.products.map((variant) => ({
        //   sku: variant.sku,
        //   property_values: variant.property_values.map((property) => ({
        //     property_id: property.property_id,
        //     value_ids: property.value_ids,
        //     property_name: property.property_name,
        //     values: property.values,
        //   })),
        //   offerings: variant.offerings.map((offering) => ({
        //     price: offering.price,
        //     quantity: offering.quantity,
        //     is_enabled: offering.is_enabled,
        //   })),
        // }));
        const requestBody = {
          products: variants.products,
        };

        await delay(2000);

        try {
          const response = await axios.put(url, requestBody, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access_token}`,
              "x-api-key": token.dataValues.client_id,
            },
          });

          console.log("Inventory updated successfully:", response.data);
        } catch (error) {
          console.error(
            "Error updating inventory:",
            error
          );
          error.push({
            error: `An error occurred while adding inventory to product ${listingId}.`,
            details: error.message,
          });
          return error;
        }
      }
    } catch (err) {
      console.error(
        "Error creating draft listing:",
        err
      );
      error.push({
        error: `An error occurred while creating a product on shop ${shopId}.`,
        details: err.message,
      });
      return error;
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
};
const refreshToken = async (token) => {
  try {
    let refreshToken = token.refreshToken;
    const response = await axios.post(
      "https://api.etsy.com/v3/public/oauth/token",
      {
        grant_type: "refresh_token",
        client_id: token.client_id,
        client_secret: token.client_secret,
        refresh_token: refreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Save the new token
    token.token = response.data.access_token;
    console.log("last token refresh >> ", moment());
    token.lastTokenRefreshDate = moment().add(5, "hours").add(30, "minutes").toISOString();
    console.log("Token last refresh date:", token.lastTokenRefreshDate);
    await token.save();
    return response.data.access_token;
    console.log("Token refreshed successfully.");
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};

exports.getEtsyProductPropertiesByCategoryId = async (categoryId, token) => {
  try {
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;
    const url = `https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/${categoryId}/properties
    `;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "x-api-key": token.dataValues.client_id,
      },
    });

    return response.data.results;
  } catch (error) {
    console.error("Error fetching product properties:", error);
    throw error;
  }
};

const transformVariationsToEtsyFormat = async (data, properties) => {
  const { variations } = data;
  const products = [];
  const price_on_property = new Set();
  const quantity_on_property = [];
  const sku_on_property = [];

  // Get custom properties 513 and 514
  const customProperties = properties.filter(
    (property) => property.property_id === 513 || property.property_id === 514
  );

  variations.combinations.forEach((combination) => {
    const property_values = [];
    const combinationKeys = Object.keys(combination).filter(
      (key) => key !== "price" && key !== "quantity"
    );

    combinationKeys.forEach((key, index) => {
      let matchingProperty = properties.find(
        (property) => property.display_name === key
      );

      if (!matchingProperty) {
        matchingProperty = customProperties[index] || customProperties[0];
      }

      if (matchingProperty) {
        const option = matchingProperty.possible_values?.find(
          (opt) => opt.name === combination[key]
        );

        property_values.push({
          property_id: matchingProperty.property_id,
          value_ids: [
            option ? option.value_id : Math.floor(Math.random() * 1000000),
          ],
          property_name: key,
          values: [option ? option.name : combination[key]],
        });

        price_on_property.add(matchingProperty.property_id);
      }
    });

    products.push({
      sku: data.isku,
      property_values,
      offerings: [
        {
          price: parseFloat(combination.price),
          quantity: parseInt(combination.quantity, 10),
          is_enabled: true,
        },
      ],
    });

    // quantity_on_property.push(parseInt(combination.quantity, 10));
    // sku_on_property.push(data.isku);
  });

  return {
    products,
    price_on_property: Array.from(price_on_property),
    quantity_on_property,
    sku_on_property,
  };
};
