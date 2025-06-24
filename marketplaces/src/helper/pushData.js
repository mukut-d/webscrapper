const CatalogueVariation = require("../models/catalogue-variation");
const csku = require("../models/csku");
const Geosite = require("../models/geosite");
const isku = require("../models/isku");
const newRelic = require('newrelic')
const _ = require('lodash');

exports.pushData = async (
  data,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  config_id = null, // Default to null if not provided
  variationMap = null,
  config_version=null
)=> {
  try {
    const cskus = [];
    let iskus = [];
    const variations = [];
    let sourceVariation;
    if(variationMap) {
      sourceVariation = _.keyBy(variationMap, (obj) => Object.keys(obj)[0])
    }
    await Promise.all(
      data.ItemArray.Item?.map(async item => {

        let sku = '';
        let storeCategoryId = "";
        let storeCategoryName = "";

        if (item.SKU) {
          sku = item.SKU;
        } else if (item.Variations) {
          sku = Array.isArray(item.Variations.Variation) ? item.ItemID : item.Variations.Variation.SKU;
        } else {
          sku = item.ItemID;
        }

        if (item.Storefront) {
          if (item.Storefront.StoreCategoryID && item.Storefront.StoreCategoryID != 0) {
            storeCategoryId = item.Storefront.StoreCategoryID;
            if (item.Storefront.StoreCategoryName) {
              storeCategoryName = item.StoreFront.StoreCategoryName;
            }
          } else if (item.Storefront.StoreCategory2ID && item.Storefront.StoreCategory2ID != 0) {
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
              userId: userId
            }
          })
          .then(async iskuExist => {
            if (iskuExist && addQuantity == true) {
              iskuExist.quantity = parseInt(iskuExist.quantity) + item.Quantity
              await iskuExist.save()
            } else if (!iskuExist) {
              iskus.push({
                isku: sku,
                costPrice: item.StartPrice?.value,
                title: item.Title,
                images: Array.isArray(item.PictureDetails?.PictureURL)
                  ? item.PictureDetails?.PictureURL
                  : [item.PictureDetails?.PictureURL],
                quantity: item.Quantity,
                currency: item.StartPrice.currencyID,
                accountName: accountName,
                marketplaceId: marketplaceId,
                userId: userId
              })
            }
          })
        await csku
          .findOne({
            where: {
              channelId: item.ItemID.toString(),
              userId: userId
            }
          })
          .then(async cskuExist => {
            let status = ''
            if (item.SellingStatus.ListingStatus == 'Active') {
              status = 'live'
            } else if (item.SellingStatus.ListingStatus == 'Completed') {
              status = 'completed'
            } else if (item.SellingStatus.ListingStatus == 'Ended') {
              status = 'deleted'
            }

            let site = ''
            if (item.Site) {
              const siteData = await Geosite.findOne({
                where: { countryName: item.Site }
              })
              site = siteData.dataValues.globalId
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
                quantity: item.Quantity,
                currency: item.StartPrice.currencyID,
                itemSpecifics: Array.isArray(item.ItemSpecifics?.NameValueList)
                ? item.ItemSpecifics.NameValueList
                : item.ItemSpecifics?.NameValueList
                  ? [item.ItemSpecifics.NameValueList]
                  : [],
                itemCompatibility: Array.isArray(item.ItemCompatibilityList?.NameValueList)
                ? item.ItemCompatibilityList.NameValueList
                : item.ItemCompatibilityList?.NameValueList
                  ? [item.ItemCompatibilityList.NameValueList]
                  : [],
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
                  ? { config_id
                } : {}),
                ...(config_version
                  ? { config_version
                } : {}),
              });

              if (item.Variations) {
                if (Array.isArray(item.Variations.Variation)) {
                  item.Variations.Variation.map(variation => {
                    let sourceVariationId;
                    if (variationMap) {
                      console.log("Variation map started for source");
                      const foundVariation = sourceVariation[variation.SKU] || null;                      
                      if (foundVariation) {
                        sourceVariationId = foundVariation[variation.SKU] || null ;
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
                      source_variant_id: sourceVariationId ? sourceVariationId : null,
                      ...(config_id
                        ? { config_id
                      } : {}), 
                      ...(config_version
                        ? { config_version
                      } : {}),         
                    })
                  })
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
                    const foundVariation = sourceVariation[item.Variations.Variation.SKU] || null;                      
                    if (foundVariation) {
                      sourceVariationId = foundVariation[item.Variations.Variation.SKU] || null ;
                    }
                  }
                  
                  variations.push({
                    channel_id: item.ItemID,
                    variation_id: item.Variations.Variation.SKU,
                    variation: item.Variations.Variation.VariationSpecifics.NameValueList,
                    price: item.Variations.Variation.StartPrice.value,
                    quantity: item.Variations.Variation.Quantity,
                    userId: userId,
                    account_name: accountName,
                    source_variant_id: sourceVariationId ? sourceVariationId : null,
                    ...(config_id
                      ? { config_id
                    } : {}), 
                    ...(config_version
                      ? { config_version
                    } : {}),
                  });
                }
              }

            } else {
              cskuExist.isku = item.SKU ? item.SKU : item.ItemID
              cskuExist.status = status;
              cskuExist.quantity= item.Quantity;
              cskuExist.itemSpecifics = Array.isArray(item.ItemSpecifics?.NameValueList)
              ? item.ItemSpecifics.NameValueList
              : item.ItemSpecifics?.NameValueList
                ? [item.ItemSpecifics.NameValueList]
                : [];
              await cskuExist.save()
            }
          })
      })
    );

    iskus = iskus.filter((obj, index, self) => {
      return index === self.findIndex((o) => (
        o.isku === obj.isku
      ));
    });

    await isku.bulkCreate(iskus);
    await csku.bulkCreate(cskus);
    await CatalogueVariation.bulkCreate(variations);
  } catch (err) {
    newRelic.recordCustomEvent(
      `Error for data push ${err.message} for account ${accountName}`
    )
    newRelic.recordCustomEvent(
      `Error for data push ${err.message} for account ${accountName}`
    )
    // newRelic.recordCustomEvent(
    //   'Error in catalogue fetch for: ',
    //   req.body.accountName,
    //   '. Error: ',
    //   err.message
    // )
    console.log(err)
    throw err
  }
}