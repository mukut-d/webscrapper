const { default: axios } = require('axios')
const csku = require('../../models/csku')
const isku = require('../../models/isku')
const { v4: uuidv4 } = require('uuid')
const Token = require('../../models/tokens')
const qs = require('qs')
const { getCategoryAttributes } = require('./category')

async function getWalmartToken (token, correlationId) {
  const { client_id, client_secret } = token?.dataValues || token
  const base64Credentials = Buffer.from(
    `${client_id}:${client_secret}`
  ).toString('base64')
  const tokenHeaders = {
    Authorization: `Basic ${base64Credentials}`,
    'WM_SVC.NAME': 'Walmart Marketplace Price',
    'WM_QOS.CORRELATION_ID': correlationId,
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  const tokenRequestBody = qs.stringify({
    grant_type: 'client_credentials'
  })

  const tokenUrl = 'https://marketplace.walmartapis.com/v3/token'
  try {
    const tokenResponse = await axios.post(tokenUrl, tokenRequestBody, {
      headers: tokenHeaders
    })
    return tokenResponse.data.access_token
  } catch (error) {
    console.log('Error occurred while creating token:', error)
    throw new Error(`Failed to get Walmart token: ${error.message}`)
  }
}

const createHeaders = (correlationId, accessToken, serviceName) => ({
  'WM_QOS.CORRELATION_ID': correlationId,
  'WM_SEC.TIMESTAMP': Date.now().toString(),
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'WM_SEC.ACCESS_TOKEN': accessToken,
  'WM_SVC.NAME': serviceName
})

exports.GetWalmartCatalogue = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(token, correlationId)
    console.log(correlationId, accessToken, accountName, 'token')
    let offset = 0
    let limit = 50
    let totalItems = -1
    let fetchedItems = 0
    let data = []
    while (totalItems !== fetchedItems) {
      const url = `https://marketplace.walmartapis.com/v3/items?offset=${offset}&limit=${limit}`
      const cskusHeaders = await createHeaders(
        correlationId,
        accessToken,
        accountName
      )

      const response = await axios.get(url, { headers: cskusHeaders })
      data = [...data, ...response.data.ItemResponse]
      totalItems = response.data.totalItems
      fetchedItems += response.data.ItemResponse.length
      if (response.data.ItemResponse.length === limit) {
        offset += limit
      }
    }
    if (data && data?.length) {
      listings.push(...data)
      await pushDataWalmart(
        data,
        marketplaceId,
        accountName,
        userId,
        addQuantity,
        token
      )
    }
    return listings
  } catch (error) {
    if (error.response) {
      console.error('Error response from Walmart API:', error.response.data)
    }
  }
}
exports.GetWalmartRecentCatalogue = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(token, correlationId)
    let offset = count || 0
    let limit = 50
    let totalItems = -1
    let fetchedItems = 0
    let data = []
    while (totalItems !== fetchedItems) {
      const url = `https://marketplace.walmartapis.com/v3/items?offset=${offset}&limit=${limit}`
      const ordersHeaders = await createHeaders(
        correlationId,
        accessToken,
        accountName
      )
      const response = await axios.get(url, { headers: ordersHeaders })
      data = [...data, ...response.data.ItemResponse]
      totalItems = response.data.totalItems
      fetchedItems += response.data.ItemResponse.length
      if (response.data.ItemResponse.length === limit) {
        offset += limit
      }
    }
    if (data && data?.length) {
      listings.push(...data)
      await pushDataWalmart(
        data,
        marketplaceId,
        accountName,
        userId,
        addQuantity,
        token
      )
    }
    return listings
  } catch (error) {
    if (error.response) {
      console.error('Error response from Walmart API:', error.response.data)
    }
  }
}

async function pushDataWalmart (
  data,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  token
) {
  try {
    const cskus = []
    const iskus = []

    await Promise.all(
      data.map(async item => {
        let itemQty
        let productDetails = null
        try {
          const correlationId = uuidv4()
          const accessToken = await getWalmartToken(token, correlationId)
          const url = `https://marketplace.walmartapis.com/v3/inventory?sku=${item.sku}`
          let productDetailsUrl =
            'https://marketplace.walmartapis.com/v3/items/walmart/search?'

          const queryParams = []

          if (item?.upc) {
            queryParams.push(`upc=${item.upc}`)
          }
          if (item?.gtin) {
            queryParams.push(`gtin=${item.gtin}`)
          }
          if (queryParams.length > 0) {
            productDetailsUrl += queryParams.join('&')
          }
          const headers = await createHeaders(
            correlationId,
            accessToken,
            accountName
          )
          const response = await axios.get(url, { headers: headers })
          itemQty = response.data.quantity.amount

          try {
            const response = await axios.get(productDetailsUrl, {
              headers: headers
            })
            productDetails = response.data.items?.[0] || null
            console.log(
              'item ----------------------------> ',
              item,
              response?.data,
              response?.data?.items
            )
          } catch (error) {
            console.log(error)
          }
        } catch (err) {
          console.log('error', err)
          if (err.response) {
            console.error('Error response from Walmart API:', err.response.data)
          }
        }
        const existingIsku = await isku.findOne({
          where: {
            isku: item.sku.toString(),
            userId: userId
          }
        })
        // console.log("Processing item sdfghj:", existingIsku);
        if (existingIsku && addQuantity) {
          existingIsku.quantity += itemQty
          await existingIsku.save()
        } else if (!existingIsku) {
          iskus.push({
            isku: item?.sku,
            costPrice: productDetails?.price?.amount || item?.price?.amount,
            title: productDetails?.title || item?.productName,
            quantity: itemQty,
            currency: productDetails?.price?.currency || item?.price?.currency,
            accountName: accountName,
            marketplaceId: marketplaceId,
            userId: userId
          })
        }

        const existingCsku = await csku.findOne({
          where: {
            channelId: productDetails?.itemId || String(item.wpid),
            userId: userId
          }
        })
        console.log(
          item,
          productDetails,
          productDetails?.images?.map(img => img?.url)
        )
        if (!existingCsku) {
          cskus.push({
            channelId: productDetails?.itemId || String(item?.wpid),
            isku: item?.sku || item?.id,
            price: productDetails?.price?.amount || item?.price?.amount,
            mrp: productDetails?.price?.amount || item?.price?.amount,
            quantity: item?.availability == 'Out_of_stock' ? 0 : itemQty,
            currency: productDetails?.price?.currency || item?.price?.currency,
            categoryName:
              productDetails?.properties?.categories?.join(',') ||
              item?.productType ||
              productDetails?.productType,
            brand: productDetails?.brand || null,
            productIdType: item?.upc ? 'UPC' : item?.gtin ? 'GTIN' : null,
            productId: item?.upc || item?.gtin || null,
            marketplaceId: marketplaceId,
            siteId: item?.mart || null,
            accountName: accountName,
            userId: userId,
            title: productDetails?.title || item?.productName,
            description: productDetails?.description,
            images: productDetails?.images?.map(img => img?.url) || [],
            status:
              item?.lifecycleStatus?.toLowerCase() === 'active'
                ? 'live'
                : item?.lifecycleStatus?.toLowerCase() === 'archived'
                ? 'archived'
                : 'draft'
          })
        } else {
          await csku.update(
            {
              siteId: item?.mart || null,
              price: productDetails?.price?.amount || item?.price?.amount,
              mrp: productDetails?.price?.amount || item?.price?.amount,
              quantity: itemQty,
              currency:
                productDetails?.price?.currency || item?.price?.currency,
              categoryName:
                productDetails?.properties?.categories?.join(',') ||
                item?.productType ||
                productDetails?.productType ||
                null,
              brand: productDetails?.brand || null,
              productIdType: item?.upc ? 'UPC' : item?.gtin ? 'GTIN' : null,
              productId: item?.upc || item?.gtin || null,
              title: productDetails?.title || item?.productName,
              description: productDetails?.description,
              images: productDetails?.images?.map(img => img?.url) || [],
              status:
                item?.lifecycleStatus?.toLowerCase() === 'active'
                  ? 'live'
                  : item?.lifecycleStatus?.toLowerCase() === 'archived'
                  ? 'archived'
                  : 'draft'
            },
            {
              where: {
                id: existingCsku?.dataValues?.id
              }
            }
          )
        }
      })
    )
    await isku.bulkCreate(iskus)
    await csku.bulkCreate(cskus)
  } catch (err) {
    console.log(`Error for data push: ${err} for account ${accountName}`)
    throw err
  }
}

exports.updateWalmartCatalogue = async (
  accountName,
  product,
  categoryAspects,
  marketPlaceId,
  userId
) => {
  console.log('Updating Walmart product for:', product?.isku);

  // Get token as you're already doing
  const token = await Token.findOne({
    where: {
      accountName,
      marketPlaceId: parseInt(marketPlaceId)
    }
  });

  if (!token) {
    console.log('Token not found');
    return { error: 'Token not found', status: 404 };
  }

  const correlationId = uuidv4();
  let accessToken;
  const now = new Date();
  const tenMinutes = 10 * 60 * 1000;

  if (
    !token.lastTokenRefreshDate ||
    (now - new Date(token.lastTokenRefreshDate)) > tenMinutes
  ) {
    accessToken = await getWalmartToken(token, correlationId);
    token.token = accessToken;
    token.lastTokenRefreshDate = now;
    await token.save();
  } else {
    accessToken = token.token;
  }

  const updateItemUrl = 'https://marketplace.walmartapis.com/v3/feeds?feedType=MP_ITEM';

  const updateItemHeaders = {
    'WM_QOS.CORRELATION_ID': correlationId,
    'WM_SEC.TIMESTAMP': Date.now().toString(),
    'Accept': 'application/json',
    'WM_SEC.ACCESS_TOKEN': accessToken,
    'WM_SVC.NAME': 'Walmart Marketplace',
    'Content-Type': 'application/json'
  };

  // Transform variations into Walmart's variant structure
  const variantItems = [];
  const variantMappings = []; // To store mappings for database entries later

  if (product.variations && product.variations.combinations) {
    product.variations.combinations.forEach((combination, index) => {
      // Create a variant identifier from attributes (e.g. "Yellow-14Chain")
      const variantAttributes = {};
      const attributeValues = [];

      Object.entries(combination).forEach(([key, value]) => {
        if (key !== 'price' && key !== 'quantity') {
          variantAttributes[key] = value;
          attributeValues.push(value.replace(/[^a-zA-Z0-9]/g, ''));
        }
      });

      const variantIdentifier = attributeValues.join('-');

      // Only create variants if we have a valid identifier
      if (variantIdentifier) {
        const variantSku = `${product.isku}-${variantIdentifier}`;

        variantItems.push({
          sku: variantSku,
          productIdentifiers: {
            productIdType: product.type || 'GTIN',
            productId: `${product.id}-${variantIdentifier}`
          },
          price: {
            currency: product.currency || 'USD',
            amount: combination.price
          },
          ShippingWeight: {
            value: product.shippingWeight || "1",
            unit: "LB"
          },
          fulfillmentLagTime: "1",
          MustShipAlone: product.mustShipAlone || "No",
          isPrimaryVariant: index === 0 ? "Yes" : "No" // Set primary variant for the first combination
        });

        // Store mapping for later database entry
        variantMappings.push({
          sku: variantSku,
          attributes: variantAttributes,
          price: combination.price,
          quantity: combination.quantity || 1
        });
      }
    });
  }

  // Ensure we have a valid gemstone from the allowed list
  const validGemstones = [
    "Alexandrite", "Amber", "Cultured Diamond", "Ametrine", "Amethyst",
    "Zircon", "Beryl", "Aquamarine", "Iolite", "No Stone", "Sodalite",
    "Cat's Eye", "Moonstone", "Pearl", "Mother-of-Pearl", "Chrome Diopside",
    "Tanzanite", "White Topaz", "Jade", "Morganite", "Rhodonite", "Malachite",
    "Tourmaline", "Crystal", "Rose Quartz", "Sunstone", "Tsavorite", "Opal",
    "Chalcedony", "White Sapphire", "Garnet", "Sapphire", "Cubic Zirconia",
    "Emerald", "Citrine", "Ruby", "Turquoise", "Kunzite", "Diamond", "Quartz",
    "Carnelian", "Lapis Lazuli", "Other Stone", "Moissanite", "Spinel", "Coral",
    "Onyx", "Tiger's Eye", "Topaz", "Peridot", "Rhodolite"
  ];

  // Default to "Other Stone" if the current value isn't in the list
  const gemstone = categoryAspects.gemstone &&
    validGemstones.includes(categoryAspects.gemstone)
      ? categoryAspects.gemstone
      : "Other Stone";

  // Create the main payload
  const updatePayload = {
    "MPItemFeedHeader": {
      "version": "5.0.20240517-04_08_27-api",
      "locale": "en",
      "businessUnit": "WALMART_US"
    },
    "MPItem": [
      {
        "Orderable": {
          "sku": product?.isku,
          "productIdentifiers": {
            "productIdType": product?.type || 'GTIN',
            "productId": product?.id
          },
          "price": 10000,
          "ShippingWeight": 1,
          "MustShipAlone": product?.mustShipAlone || "No",
          "fulfillmentLagTime": 1,
          "variantGroupId": product?.isku,
          "variantAttributes": product.variations?.attributes?.map(attr => ({
            name: attr.name,
            values: attr.options.map(opt => opt.value)
          })) || []
        },
        "Visible": {
          [product?.category]: {
            "productName": `${product?.title}`,
            "shortDescription": product?.description.split(".")[0],
            "brand": product?.brand || "Generic",
            "manufacturer": product?.brand || "Generic",
            "manufacturerPartNumber": product?.isku || "123456",
            "mainImageUrl": categoryAspects?.mainImageUrl,
            "productSecondaryImageURL": categoryAspects?.additionalImages,
            "keyFeatures": categoryAspects?.keyFeatures || [`${product?.brand || 'Brand'} ${product?.title || 'Product'}`],
            "colorCategory": ["Yellow"],
            "color": "Yellow",
            "variantGroupId": "JEWELRY-NECKALCESSSS",
            "variantAttributeNames": ["color"],
            "isPrimaryVariant": "Yes",
            "material": categoryAspects?.material || "Other",
            "multipackQuantity": categoryAspects?.multipackQuantity || 1,
            "condition": categoryAspects?.condition || "New",
            "gemstone": [gemstone],
            "claspType": "S Hook",
            "necklaceStyle": ["Chain"],
            "ageGroup": categoryAspects?.ageGroup || "Adult",
            "metal": ["Gold"],
            "count": categoryAspects?.count || 1,
            "has_written_warranty": categoryAspects?.has_written_warranty || "No",
            "gender": categoryAspects?.gender || "Unisex",
            "countPerPack": categoryAspects?.countPerPack || 1,
            "jewelryStyle": categoryAspects?.jewelryStyle || "Fashion",
            "isProp65WarningRequired": categoryAspects?.isProp65WarningRequired || "No",
            "netContent": categoryAspects?.netContent || {
              "productNetContentMeasure": 1,
              "productNetContentUnit": "Each"
            },
            "smallPartsWarnings": categoryAspects?.smallPartsWarnings || ["0 - No warning applicable"],
            "prop65WarningText": categoryAspects?.prop65WarningText || "None",
          }
        }
      },
      ...variantItems // Add variant items to the payload
    ]
  };

  try {
    // Submit the update to Walmart
    const response = await axios.post(updateItemUrl, updatePayload, {
      headers: updateItemHeaders
    });

    const feedId = response.data?.feedId;

    if (!feedId) {
      throw new Error('No feedId returned from Walmart');
    }

    // Get the feed status
    const { itemId, newProductId, error } = await getFeedStatus(
      feedId,
      accessToken,
      correlationId
    );

    // Check the feed status
    if (error) {
      console.log('Error updating product:', error);
      return { error: error.toString(), status: 400 };
    }

    // Update the main product entry with the result
    console.log("channelId and status", itemId || feedId, 'under review');
    await csku.update({
      channelId: itemId || feedId,
      productId: newProductId || product?.id,
      status: 'under review',
      errors: error || null,
      variantGroupId: variantItems.length > 0 ? product?.isku : null
    }, {
      where: {
        isku: product?.isku
      }
    });

    // Delete existing variations from the CatalogueVariation table
    await CatalogueVariation.destroy({
      where: {
        product_id: product.id
      }
    });

    // Create new entries for each variation
    const channelId = itemId || feedId;
    for (const variant of variantMappings) {
      // Create a unique variation ID
      const variationId = `${product.isku}-${uuidv4().substring(0, 8)}`;

      // Format the variation data similar to the Etsy format
      const variationData = {
        product_id: product.id,
        sku: variant.sku,
        is_deleted: false,
        offerings: [{
          offering_id: variationId,
          quantity: variant.quantity,
          is_enabled: true,
          is_deleted: false,
          price: {
            amount: variant.price * 100, // Convert to cents
            divisor: 100,
            currency_code: product.currency || 'USD'
          }
        }],
        property_values: Object.entries(variant.attributes).map(([property_name, value]) => ({
          property_id: Math.floor(Math.random() * 1000) + 500, // Generate a random property ID
          property_name,
          scale_id: null,
          scale_name: null,
          value_ids: [Math.floor(Math.random() * 1000000000) + 10000000000], // Generate a random value ID
          values: [value]
        }))
      };

      // Create the entry in the CatalogueVariation table
      await CatalogueVariation.create({
        channel_id: channelId,
        variation_id: variationId,
        variation: variationData,
        quantity: variant.quantity,
        price: variant.price.toString(),
        userId: userId,
        account_name: accountName
      });
    }

    console.log('CSKU and variations updated successfully');
    return { feedId: feedId, status: 'success' };

  } catch (error) {
    console.log('Error updating CSKU', error);
    const err = error?.response ? error?.response?.data : error?.message;
    await csku.update({
      status: 'failed',
      errors: [err] || null,
    }, {
      where: {
        isku: product?.isku
      }
    });
    return { error: err.toString(), status: 400 };
  }
};

exports.updateWalmartCatalogue = async (req, res) => {
  try {
    const { accountName, product, categoryAspects, marketPlaceId, userId } = req.body;
    const result = await updateWalmartCatalogue(accountName, product, categoryAspects, marketPlaceId, userId);
    if (result && result.error) {
      return res.status(400).json(result);
    }
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error in updateWalmartCatalogueHandler:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.updateWalmartCatalogueHandler = async (req, res) => {
  try {
    const {
      userId,
      accountName,
      marketPlaceId,
      product,
      categoryAspects,
      cskuExist
    } = req.body;

    await exports.updateWalmartCatalogue(
      userId,
      accountName,
      marketPlaceId,
      product,
      categoryAspects,
      cskuExist
    );

    return res.status(200).json({
      success: true,
      message: 'Walmart catalogue updated successfully'
    });
  } catch (error) {
    console.error("Error in updateWalmartCatalogueHandler:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Function to update inventory quantity for a Walmart product SKU
exports.updateWalmartInventory = async (
  accountName,
  sku,
  quantity,
  marketPlaceId,
  userId
) => {
  console.log('Updating Walmart inventory for:', sku, 'to quantity:', quantity);
  
  // Get token
  const token = await Token.findOne({
    where: {
      accountName,
      marketPlaceId: parseInt(marketPlaceId)
    }
  });
  
  if (!token) {
    console.log('Token not found');
    return { error: 'Token not found', status: 404 };
  }
  
  const correlationId = uuidv4();
  let accessToken;
  const now = new Date();
  const tenMinutes = 10 * 60 * 1000; 

  // Check if token needs refresh
  if (
    !token.lastTokenRefreshDate ||
    (now - new Date(token.lastTokenRefreshDate)) > tenMinutes
  ) {
    accessToken = await getWalmartToken(token, correlationId);
    token.token = accessToken;
    token.lastTokenRefreshDate = now;
    await token.save();
  } else {
    accessToken = token.token;
  }

  console.log(accessToken, "token---------------------")
  
  // Walmart Inventory API endpoint
  const inventoryUrl = 'https://marketplace.walmartapis.com/v3/inventory?sku=UBAUS3QU3NIU12NIO';

  // Headers required for Walmart API
  const inventoryHeaders = {
    'WM_QOS.CORRELATION_ID': correlationId,
    'WM_SEC.TIMESTAMP': Date.now().toString(),
    'Accept': 'application/json',
    'WM_SEC.ACCESS_TOKEN': accessToken,
    'WM_SVC.NAME': 'Walmart Marketplace',
    'Content-Type': 'application/json'
  };

  // Inventory update payload
  const inventoryPayload = {
    
      
        "sku": "UBAUS3QU3NIU12NIO",
        "quantity": {
          "amount": quantity.toString(),
          "unit": "EACH"
        }

     
  };
  
  try {
    // Submit inventory update to Walmart
    const response = await axios.put(inventoryUrl, inventoryPayload, {
      headers: inventoryHeaders
    });
    
    console.log('Inventory update response:', response.data);
    
  } catch (error) {
    console.error(
      'Error updating inventory:',
      error.response ? error.response.data : error.message
    );
    
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
      status: error.response ? error.response.status : 500
    };
  }
};

exports.updateWalmartInventoryHandler = async (req, res) => {
  try {
    const { accountName,
      sku,
      quantity,
      marketPlaceId,
      userId } = req.body;
    const result = await this.updateWalmartInventory(accountName, sku, quantity, marketPlaceId, userId);
    if (result && result.error) {
      return res.status(400).json(result);
    }
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error in createWalmartCatalogueHandler:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


// exports.createWalmartCatalogue = async (
//   accountName,
//   product,
//   categoryAspects,
//   marketPlaceId,
//   userId
// ) => {
//   console.log('Creating Walmart product for:', product?.isku);
  
//   // Get token as you're already doing
//   const token = await Token.findOne({
//     where: {
//       accountName,
//       marketPlaceId: parseInt(marketPlaceId)
//     }
//   });
  
//   if (!token) {
//     console.log('Token not found');
//     return { error: 'Token not found', status: 404 };
//   }
  
//   const correlationId = uuidv4();
//   let accessToken;
//   const now = new Date();
//   const tenMinutes = 10 * 60 * 1000; 

//   if (
//     !token.lastTokenRefreshDate ||
//     (now - new Date(token.lastTokenRefreshDate)) > tenMinutes
//   ) {
//     accessToken = await getWalmartToken(token, correlationId);
//     token.token = accessToken;
//     token.lastTokenRefreshDate = now;
//     await token.save();
//   } else {
//     accessToken = token.token;
//   }
  
//   const createItemUrl = 'https://marketplace.walmartapis.com/v3/feeds?feedType=MP_ITEM';

//   const createItemHeaders = {
//     'WM_QOS.CORRELATION_ID': correlationId,
//     'WM_SEC.TIMESTAMP': Date.now().toString(),
//     'Accept': 'application/json',
//     'WM_SEC.ACCESS_TOKEN': accessToken,
//     'WM_SVC.NAME': 'Walmart Marketplace',
//     'Content-Type': 'application/json'
//   };

//   // Transform variations into Walmart's variant structure
//   const variantItems = [];
//   const variantMappings = []; // To store mappings for database entries later

//   if (product.variations && product.variations.combinations) {
//     product.variations.combinations.forEach(combination => {
//       // Create a variant identifier from attributes (e.g. "Yellow-14Chain")
//       const variantAttributes = {};
//       const attributeValues = [];
      
//       Object.entries(combination).forEach(([key, value]) => {
//         if (key !== 'price' && key !== 'quantity') {
//           variantAttributes[key] = value;
//           attributeValues.push(value.replace(/[^a-zA-Z0-9]/g, ''));
//         }
//       });
      
//       const variantIdentifier = attributeValues.join('-');
      
//       // Only create variants if we have a valid identifier
//       if (variantIdentifier) {
//         const variantSku = `${product.isku}-${variantIdentifier}`;
        
//         variantItems.push({
//           sku: variantSku,
//           productIdentifiers: {
//             productIdType: product.type || 'GTIN',
//             productId: `${product.id}-${variantIdentifier}`
//           },
//           price: {
//             currency: product.currency || 'USD',
//             amount: combination.price
//           },
//           ShippingWeight: {
//             value: product.shippingWeight || "1",
//             unit: "LB"
//           },
//           fulfillmentLagTime: "1",
//           MustShipAlone: product.mustShipAlone || "No"
//         });
        
//         // Store mapping for later database entry
//         variantMappings.push({
//           sku: variantSku,
//           attributes: variantAttributes,
//           price: combination.price,
//           quantity: combination.quantity || 1
//         });
//       }
//     });
//   }



//   // Ensure we have a valid gemstone from the allowed list
//   const validGemstones = [
//     "Alexandrite", "Amber", "Cultured Diamond", "Ametrine", "Amethyst", 
//     "Zircon", "Beryl", "Aquamarine", "Iolite", "No Stone", "Sodalite", 
//     "Cat's Eye", "Moonstone", "Pearl", "Mother-of-Pearl", "Chrome Diopside", 
//     "Tanzanite", "White Topaz", "Jade", "Morganite", "Rhodonite", "Malachite", 
//     "Tourmaline", "Crystal", "Rose Quartz", "Sunstone", "Tsavorite", "Opal", 
//     "Chalcedony", "White Sapphire", "Garnet", "Sapphire", "Cubic Zirconia", 
//     "Emerald", "Citrine", "Ruby", "Turquoise", "Kunzite", "Diamond", "Quartz", 
//     "Carnelian", "Lapis Lazuli", "Other Stone", "Moissanite", "Spinel", "Coral", 
//     "Onyx", "Tiger's Eye", "Topaz", "Peridot", "Rhodolite"
//   ];
  
//   // Default to "Other Stone" if the current value isn't in the list
//   const gemstone = categoryAspects.gemstone && 
//     validGemstones.includes(categoryAspects.gemstone)
//       ? categoryAspects.gemstone 
//       : "Other Stone";

//   // Create the main payload

//   const feedPayload = {
//     "MPItemFeedHeader": {
//       "version": "5.0.20240517-04_08_27-api",
//       "locale": "en",
//       "businessUnit": "WALMART_US"
//     },
//     "MPItem": [
//       {
//         "Orderable": {
//           "sku": `UBAUS3QU3NIU12NIOAS8A`,
//           "productIdentifiers": {
//             "productIdType": product?.type || 'GTIN',
//             "productId": product?.id
//           },
//           "price": 10000,
//           "ShippingWeight": 1,
//           "MustShipAlone": product?.mustShipAlone || "No",
//           "fulfillmentLagTime": 1,
//         },
//         "Visible": {
//           [product?.category]: {
//             "productName": `${product?.title}`,
//             "shortDescription": product?.description.split(".")[0],
//             "brand": product?.brand || "Generic",
//             "manufacturer": product?.brand || "Generic",
            
//             "manufacturerPartNumber": product?.isku || "123456",
//             "mainImageUrl": categoryAspects?.mainImageUrl,
//             "productSecondaryImageURL": categoryAspects?.additionalImages,
//             "keyFeatures": categoryAspects?.keyFeatures || [`${product?.brand || 'Brand'} ${product?.title || 'Product'}`],
//             "colorCategory": ["Yellow"],
//             "color": "Yellow",
//             "variantGroupId": "JEWELRY-NECKALCESSSS",
//             "variantAttributeNames": ["color"],
//             "isPrimaryVariant": "Yes",
//             "material": categoryAspects?.material || "Other",
//             "multipackQuantity": categoryAspects?.multipackQuantity || 1,
//             "condition": categoryAspects?.condition || "New",
//             "gemstone": [gemstone],
//             "claspType": "S Hook",
//             "necklaceStyle": ["Chain"],
//             "ageGroup": categoryAspects?.ageGroup || "Adult",
//             "metal": ["Gold"],
//             "count": categoryAspects?.count || 1,
//             "has_written_warranty": categoryAspects?.has_written_warranty || "No",
//             "gender": categoryAspects?.gender || "Unisex",
//             "countPerPack": categoryAspects?.countPerPack || 1,
//             "jewelryStyle": categoryAspects?.jewelryStyle || "Fashion",
//             "isProp65WarningRequired": categoryAspects?.isProp65WarningRequired || "No",
//             "netContent": categoryAspects?.netContent || {
//               "productNetContentMeasure": 1,
//               "productNetContentUnit": "Each"
//             },
//             "smallPartsWarnings": categoryAspects?.smallPartsWarnings || ["0 - No warning applicable"],
//             "prop65WarningText": categoryAspects?.prop65WarningText || "None", 
//           }
//         }
//       },
//       {
//         "Orderable": {
//           "sku": `UBAUS3QU3NIU12NIO`,
//           "productIdentifiers": {
//             "productIdType": product?.type || 'GTIN',
//             "productId": product?.variantId
//           },
//           "price": 10000,
//           "ShippingWeight": 1,
//           "MustShipAlone": product?.mustShipAlone || "No",
//           "fulfillmentLagTime": 1,
//         },
//         "Visible": {
//           [product?.category]: {
//             "productName": `${product?.title} - White`,
//             "shortDescription": product?.description.split(".")[0],
//             "brand": product?.brand || "Generic",
//             "manufacturer": product?.brand || "Generic",
//             "manufacturerPartNumber": product?.isku || "123456",
//             "mainImageUrl": categoryAspects?.mainImageUrl,
//             "productSecondaryImageURL": categoryAspects?.additionalImages,
//             "keyFeatures": categoryAspects?.keyFeatures || [`${product?.brand || 'Brand'} ${product?.title || 'Product'}`],
//             "colorCategory": ["White"],
//             "color": "White",
//             "variantGroupId": "JEWELRY-NECKALCESSSS",
//             "variantAttributeNames": ["color"],
//             "isPrimaryVariant": "No",
//             "material": categoryAspects?.material || "Gold",
//             "multipackQuantity": categoryAspects?.multipackQuantity || 1,
//             "condition": categoryAspects?.condition || "New",
//             "gemstone": [gemstone],
//             "claspType": "S Hook",
//             "necklaceStyle": ["Chain"],
//             "ageGroup": categoryAspects?.ageGroup || "Adult",
//             "metal": ["Gold"],
//             "count": categoryAspects?.count || 1,
//             "has_written_warranty": categoryAspects?.has_written_warranty || "No",
//             "gender": categoryAspects?.gender || "Unisex",
//             "countPerPack": categoryAspects?.countPerPack || 1,
//             "jewelryStyle": categoryAspects?.jewelryStyle || "Fashion",
//             "isProp65WarningRequired": categoryAspects?.isProp65WarningRequired || "No",
//             "netContent": categoryAspects?.netContent || {
//               "productNetContentMeasure": 1,
//               "productNetContentUnit": "Each"
//             },
//             "smallPartsWarnings": categoryAspects?.smallPartsWarnings || ["0 - No warning applicable"],
//             "prop65WarningText": categoryAspects?.prop65WarningText || "None", 
//           }
//         }
//       },
//       {
//         "Orderable": {
//           "sku": `UBAUS3QU3NIU12NIOAIIN9`,
//           "productIdentifiers": {
//             "productIdType": product?.type || 'GTIN',
//             "productId": product?.variantId
//           },
//           "price": 10000,
//           "ShippingWeight": 1,
//           "MustShipAlone": product?.mustShipAlone || "No",
//           "fulfillmentLagTime": 1,
//         },
//         "Visible": {
//           [product?.category]: {
//             "productName": `${product?.title} - Rose`,
//             "shortDescription": product?.description.split(".")[0],
//             "brand": product?.brand || "Generic",
//             "manufacturer": product?.brand || "Generic",
//             "manufacturerPartNumber": product?.isku || "123456",
//             "mainImageUrl": categoryAspects?.mainImageUrl,
//             "productSecondaryImageURL": categoryAspects?.additionalImages,
//             "keyFeatures": categoryAspects?.keyFeatures || [`${product?.brand || 'Brand'} ${product?.title || 'Product'}`],
//             "colorCategory": ["Pink"],
//             "color": "Pink",
//             "variantGroupId": "JEWELRY-NECKALCESSSS",
//             "variantAttributeNames": ["color"],
//             "isPrimaryVariant": "No",
//             "material": categoryAspects?.material || "Gold",
//             "multipackQuantity": categoryAspects?.multipackQuantity || 1,
//             "condition": categoryAspects?.condition || "New",
//             "gemstone": [gemstone],
//             "claspType": "S Hook",
//             "necklaceStyle": ["Chain"],
//             "ageGroup": categoryAspects?.ageGroup || "Adult",
//             "metal":  ["Gold"],
//             "count": categoryAspects?.count || 1,
//             "has_written_warranty": categoryAspects?.has_written_warranty || "No",
//             "gender": categoryAspects?.gender || "Unisex",
//             "countPerPack": categoryAspects?.countPerPack || 1,
//             "jewelryStyle": categoryAspects?.jewelryStyle || "Fashion",
//             "isProp65WarningRequired": categoryAspects?.isProp65WarningRequired || "No",
//             "netContent": categoryAspects?.netContent || {
//               "productNetContentMeasure": 1,
//               "productNetContentUnit": "Each"
//             },
//             "smallPartsWarnings": categoryAspects?.smallPartsWarnings || ["0 - No warning applicable"],
//             "prop65WarningText": categoryAspects?.prop65WarningText || "None", 
//           }
//         }
//       }
//     ]
//   };

//   // Add variants if they exist
//   if (variantItems.length > 0) {
//     feedPayload.MPItem[0].Orderable.variants = variantItems;
//     feedPayload.MPItem[0].Orderable.variantGroupId = product?.isku;
    
//     // Format the variantAttributes correctly for Walmart
//     if (product.variations && product.variations.attributes) {
//       feedPayload.MPItem[0].Orderable.variantAttributes = 
//         product.variations.attributes.map(attr => ({
//           name: attr.name,
//           values: attr.values
//         }));
//     }
//   }
  
//   try {
//     // Create the main product entry in the csku table
//     const newCsku = await csku.create({
//       isku: product?.isku,
//       channelId: "To Be Listed",
//       title: product?.title,
//       price: Number(product?.price),
//       images: categoryAspects?.mainImageUrl
//         ? [categoryAspects?.mainImageUrl]
//         : [],
//       currency: product?.currency,
//       marketplaceId: marketPlaceId,
//       accountName: accountName,
//       productId: product?.id,
//       productIdType: product?.type,
//       brand: product?.brand,
//       mustShipAlone: product?.mustShipAlone,
//       weight: product?.shippingWeight,
//       categoryName: product?.category || null,
//       quantity: product?.quantity,
//       itemSpecifics: [categoryAspects],
//       status: 'under review',
//       variations: product.variations, // Store variations in the database
//       userId
//     });

//     // Check if isku entry exists and create if not
//     const iskuData = await isku.findOne({
//       where: {
//         isku: product?.isku
//       }
//     });

//     if (!iskuData) {
//       await isku.create({
//         marketplaceId: marketPlaceId,
//         accountName,
//         userId,
//         isku: product?.isku,
//         costPrice: product?.price,
//         images: categoryAspects?.mainImageUrl
//           ? [categoryAspects?.mainImageUrl]
//           : [],
//         currency: product?.currency,
//         weight: product?.shippingWeight,
//         title: product?.title,
//         quantity: product?.quantity
//       });
//     }

//     try {
//       // Submit the feed to Walmart
//       const response = await axios.post(createItemUrl, feedPayload, {
//         headers: createItemHeaders
//       });
      
//       const feedId = response.data?.feedId;
      
//       if (!feedId) {
//         throw new Error('No feedId returned from Walmart');
//       }
      
//       // Get the feed status
//       const { itemId, newProductId, error } = await getFeedStatus(
//         feedId,
//         accessToken,
//         correlationId
//       );
      
//       // Update the main product entry with the result
//       console.log("channelId and status", itemId || feedId, error ? 'failed' : 'under review')
//       await csku.update({
//         channelId: itemId || feedId,
//         productId: newProductId || product?.id,
//         status: error ? 'failed' : 'under review',
//         errors: error || null,
//         variantGroupId: variantItems.length > 0 ? product?.isku : null
//       },{
//         where: {
//           id: newCsku?.dataValues?.id
//         }
//       });
      
//       // If the listing was successful, create entries for each variation
//       if (!error && variantMappings.length > 0) {
//         const channelId = itemId || feedId;
        
//         // Create an entry in the CatalogueVariation table for each variant
//         for (const variant of variantMappings) {
//           // Create a unique variation ID
//           const variationId = `${product.isku}-${uuidv4().substring(0, 8)}`;
          
//           // Format the variation data similar to the Etsy format
//           const variationData = {
//             product_id: product.id,
//             sku: variant.sku,
//             is_deleted: false,
//             offerings: [{
//               offering_id: variationId,
//               quantity: variant.quantity,
//               is_enabled: true,
//               is_deleted: false,
//               price: {
//                 amount: variant.price * 100, // Convert to cents
//                 divisor: 100,
//                 currency_code: product.currency || 'USD'
//               }
//             }],
//             property_values: Object.entries(variant.attributes).map(([property_name, value]) => ({
//               property_id: Math.floor(Math.random() * 1000) + 500, // Generate a random property ID
//               property_name,
//               scale_id: null,
//               scale_name: null,
//               value_ids: [Math.floor(Math.random() * 1000000000) + 10000000000], // Generate a random value ID
//               values: [value]
//             }))
//           };
          
//           // Create the entry in the CatalogueVariation table
//           await CatalogueVariation.create({
//             channel_id: channelId,
//             variation_id: variationId,
//             variation: variationData,
//             quantity: variant.quantity,
//             price: variant.price.toString(),
//             userId: userId,
//             account_name: accountName
//           });
//         }
//       }
      
//       console.log('CSKU and variations created successfully');
//       return { feedId: feedId, status: 'success' };
      
//     } catch(error) {
//       console.log('Error creating CSKU', error);
//       const err = error?.response ? error?.response?.data : error?.message;
//       await csku.update({
//         status: 'failed',
//         errors: [err] || null,
//       },{
//         where: {
//           id: newCsku?.dataValues?.id
//         }
//       });
//       return { error: err.toString(), status: 400 };
//     }
//   } catch (err) {
//     console.error(
//       'Error creating item:',
//       err.response ? err.response.data : err.message
//     );
//     return { error: err.message, status: 400 };
//   }
// };

exports.createWalmartCatalogue = async (
  accountName,
  product,
  categoryAspects,
  marketPlaceId,
  userId
) => {
  console.log('Creating Walmart product for:', product?.isku);

  // Get token as you're already doing
  const token = await Token.findOne({
    where: {
      accountName,
      marketPlaceId: parseInt(marketPlaceId)
    }
  });

  if (!token) {
    console.log('Token not found');
    return { error: 'Token not found', status: 404 };
  }

  const correlationId = uuidv4();
  let accessToken;
  const now = new Date();
  const tenMinutes = 10 * 60 * 1000;

  if (
    !token.lastTokenRefreshDate ||
    (now - new Date(token.lastTokenRefreshDate)) > tenMinutes
  ) {
    accessToken = await getWalmartToken(token, correlationId);
    token.token = accessToken;
    token.lastTokenRefreshDate = now;
    await token.save();
  } else {
    accessToken = token.token;
  }

  const createItemUrl = 'https://marketplace.walmartapis.com/v3/feeds?feedType=MP_ITEM';

  const createItemHeaders = {
    'WM_QOS.CORRELATION_ID': correlationId,
    'WM_SEC.TIMESTAMP': Date.now().toString(),
    'Accept': 'application/json',
    'WM_SEC.ACCESS_TOKEN': accessToken,
    'WM_SVC.NAME': 'Walmart Marketplace',
    'Content-Type': 'application/json'
  };

  // Transform variations into Walmart's variant structure
  const variantItems = [];
  const variantMappings = []; // To store mappings for database entries later

  if (product.variations && product.variations.combinations) {
    product.variations.combinations.forEach((combination, index) => {
      // Create a variant identifier from attributes (e.g. "Yellow-14Chain")
      const variantAttributes = {};
      const attributeValues = [];

      Object.entries(combination).forEach(([key, value]) => {
        if (key !== 'price' && key !== 'quantity') {
          variantAttributes[key] = value;
          attributeValues.push(value.replace(/[^a-zA-Z0-9]/g, ''));
        }
      });

      const variantIdentifier = attributeValues.join('-');

      // Only create variants if we have a valid identifier
      if (variantIdentifier) {
        const variantSku = `${product.isku}-${variantIdentifier}`;

        variantItems.push({
          sku: variantSku,
          productIdentifiers: {
            productIdType: product.type || 'GTIN',
            productId: `${product.id}-${variantIdentifier}`
          },
          price: {
            currency: product.currency || 'USD',
            amount: combination.price
          },
          ShippingWeight: {
            value: product.shippingWeight || "1",
            unit: "LB"
          },
          fulfillmentLagTime: "1",
          MustShipAlone: product.mustShipAlone || "No",
          isPrimaryVariant: index === 0 ? "Yes" : "No" // Set primary variant for the first combination
        });

        // Store mapping for later database entry
        variantMappings.push({
          sku: variantSku,
          attributes: variantAttributes,
          price: combination.price,
          quantity: combination.quantity || 1
        });
      }
    });
  }

  // Ensure we have a valid gemstone from the allowed list
  const validGemstones = [
    "Alexandrite", "Amber", "Cultured Diamond", "Ametrine", "Amethyst",
    "Zircon", "Beryl", "Aquamarine", "Iolite", "No Stone", "Sodalite",
    "Cat's Eye", "Moonstone", "Pearl", "Mother-of-Pearl", "Chrome Diopside",
    "Tanzanite", "White Topaz", "Jade", "Morganite", "Rhodonite", "Malachite",
    "Tourmaline", "Crystal", "Rose Quartz", "Sunstone", "Tsavorite", "Opal",
    "Chalcedony", "White Sapphire", "Garnet", "Sapphire", "Cubic Zirconia",
    "Emerald", "Citrine", "Ruby", "Turquoise", "Kunzite", "Diamond", "Quartz",
    "Carnelian", "Lapis Lazuli", "Other Stone", "Moissanite", "Spinel", "Coral",
    "Onyx", "Tiger's Eye", "Topaz", "Peridot", "Rhodolite"
  ];

  // Default to "Other Stone" if the current value isn't in the list
  const gemstone = categoryAspects.gemstone &&
    validGemstones.includes(categoryAspects.gemstone)
      ? categoryAspects.gemstone
      : "Other Stone";

  // Create the main payload
  const feedPayload = {
    "MPItemFeedHeader": {
      "version": "5.0.20240517-04_08_27-api",
      "locale": "en",
      "businessUnit": "WALMART_US"
    },
    "MPItem": [
      {
        "Orderable": {
          "sku": product?.isku,
          "productIdentifiers": {
            "productIdType": product?.type || 'GTIN',
            "productId": product?.id
          },
          "price": 10000,
          "ShippingWeight": 1,
          "MustShipAlone": product?.mustShipAlone || "No",
          "fulfillmentLagTime": 1,
          "variantGroupId": product?.isku,
          "variantAttributes": product.variations?.attributes?.map(attr => ({
            name: attr.name,
            values: attr.options.map(opt => opt.value)
          })) || []
        },
        "Visible": {
          [product?.category]: {
            "productName": `${product?.title}`,
            "shortDescription": product?.description.split(".")[0],
            "brand": product?.brand || "Generic",
            "manufacturer": product?.brand || "Generic",
            "manufacturerPartNumber": product?.isku || "123456",
            "mainImageUrl": categoryAspects?.mainImageUrl,
            "productSecondaryImageURL": categoryAspects?.additionalImages,
            "keyFeatures": categoryAspects?.keyFeatures || [`${product?.brand || 'Brand'} ${product?.title || 'Product'}`],
            "colorCategory": ["Yellow"],
            "color": "Yellow",
            "variantGroupId": "JEWELRY-NECKALCESSSS",
            "variantAttributeNames": ["color"],
            "isPrimaryVariant": "Yes",
            "material": categoryAspects?.material || "Other",
            "multipackQuantity": categoryAspects?.multipackQuantity || 1,
            "condition": categoryAspects?.condition || "New",
            "gemstone": [gemstone],
            "claspType": "S Hook",
            "necklaceStyle": ["Chain"],
            "ageGroup": categoryAspects?.ageGroup || "Adult",
            "metal": ["Gold"],
            "count": categoryAspects?.count || 1,
            "has_written_warranty": categoryAspects?.has_written_warranty || "No",
            "gender": categoryAspects?.gender || "Unisex",
            "countPerPack": categoryAspects?.countPerPack || 1,
            "jewelryStyle": categoryAspects?.jewelryStyle || "Fashion",
            "isProp65WarningRequired": categoryAspects?.isProp65WarningRequired || "No",
            "netContent": categoryAspects?.netContent || {
              "productNetContentMeasure": 1,
              "productNetContentUnit": "Each"
            },
            "smallPartsWarnings": categoryAspects?.smallPartsWarnings || ["0 - No warning applicable"],
            "prop65WarningText": categoryAspects?.prop65WarningText || "None",
          }
        }
      },
      ...variantItems // Add variant items to the payload
    ]
  };

  try {
    // Create the main product entry in the csku table
    const newCsku = await csku.create({
      isku: product?.isku,
      channelId: "To Be Listed",
      title: product?.title,
      price: Number(product?.price),
      images: categoryAspects?.mainImageUrl
        ? [categoryAspects?.mainImageUrl]
        : [],
      currency: product?.currency,
      marketplaceId: marketPlaceId,
      accountName: accountName,
      productId: product?.id,
      productIdType: product?.type,
      brand: product?.brand,
      mustShipAlone: product?.mustShipAlone,
      weight: product?.shippingWeight,
      categoryName: product?.category || null,
      quantity: product?.quantity,
      itemSpecifics: [categoryAspects],
      status: 'under review',
      variations: product.variations, // Store variations in the database
      userId
    });

    // Check if isku entry exists and create if not
    const iskuData = await isku.findOne({
      where: {
        isku: product?.isku
      }
    });

    if (!iskuData) {
      await isku.create({
        marketplaceId: marketPlaceId,
        accountName,
        userId,
        isku: product?.isku,
        costPrice: product?.price,
        images: categoryAspects?.mainImageUrl
          ? [categoryAspects?.mainImageUrl]
          : [],
        currency: product?.currency,
        weight: product?.shippingWeight,
        title: product?.title,
        quantity: product?.quantity
      });
    }

    try {
      // Submit the feed to Walmart
      const response = await axios.post(createItemUrl, feedPayload, {
        headers: createItemHeaders
      });

      const feedId = response.data?.feedId;

      if (!feedId) {
        throw new Error('No feedId returned from Walmart');
      }

      // Get the feed status
      const { itemId, newProductId, error } = await getFeedStatus(
        feedId,
        accessToken,
        correlationId
      );

      // Update the main product entry with the result
      console.log("channelId and status", itemId || feedId, error ? 'failed' : 'under review')
      await csku.update({
        channelId: itemId || feedId,
        productId: newProductId || product?.id,
        status: error ? 'failed' : 'under review',
        errors: error || null,
        variantGroupId: variantItems.length > 0 ? product?.isku : null
      }, {
        where: {
          id: newCsku?.dataValues?.id
        }
      });

      // If the listing was successful, create entries for each variation
      if (!error && variantMappings.length > 0) {
        const channelId = itemId || feedId;

        // Create an entry in the CatalogueVariation table for each variant
        for (const variant of variantMappings) {
          // Create a unique variation ID
          const variationId = `${product.isku}-${uuidv4().substring(0, 8)}`;

          // Format the variation data similar to the Etsy format
          const variationData = {
            product_id: product.id,
            sku: variant.sku,
            is_deleted: false,
            offerings: [{
              offering_id: variationId,
              quantity: variant.quantity,
              is_enabled: true,
              is_deleted: false,
              price: {
                amount: variant.price * 100, // Convert to cents
                divisor: 100,
                currency_code: product.currency || 'USD'
              }
            }],
            property_values: Object.entries(variant.attributes).map(([property_name, value]) => ({
              property_id: Math.floor(Math.random() * 1000) + 500, // Generate a random property ID
              property_name,
              scale_id: null,
              scale_name: null,
              value_ids: [Math.floor(Math.random() * 1000000000) + 10000000000], // Generate a random value ID
              values: [value]
            }))
          };

          // Create the entry in the CatalogueVariation table
          await CatalogueVariation.create({
            channel_id: channelId,
            variation_id: variationId,
            variation: variationData,
            quantity: variant.quantity,
            price: variant.price.toString(),
            userId: userId,
            account_name: accountName
          });
        }
      }

      console.log('CSKU and variations created successfully');
      return { feedId: feedId, status: 'success' };

    } catch (error) {
      console.log('Error creating CSKU', error);
      const err = error?.response ? error?.response?.data : error?.message;
      await csku.update({
        status: 'failed',
        errors: [err] || null,
      }, {
        where: {
          id: newCsku?.dataValues?.id
        }
      });
      return { error: err.toString(), status: 400 };
    }
  } catch (err) {
    console.error(
      'Error creating item:',
      err.response ? err.response.data : err.message
    );
    return { error: err.message, status: 400 };
  }
};

exports.createWalmartCatalogueHandler = async (req, res) => {
  try {
    const { accountName, product, categoryAspects, marketPlaceId, userId } = req.body;
    const result = await createWalmartCatalogue(accountName, product, categoryAspects, marketPlaceId, userId);
    if (result && result.error) {
      return res.status(400).json(result);
    }
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error in createWalmartCatalogueHandler:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

//NOTE -  Function to handle bulk product creation from Excel
exports.bulkCreateAndUpdateWalmartCatalogue = async (
  accountName,
  token,
  marketPlaceId,
  userId,
  category,
  jsonData,
  errorFile
) => {
  try {
    let successCounts = 0
    let failedCounts = 0
    const attributeResponse = await getCategoryAttributes(category)
    if (!attributeResponse?.success) {
      return {
        success: false,
        status: 404,
        message: 'Failed to get category attributes'
      }
    }
    const attributes = attributeResponse.data.properties || {}
    const requiredFields = attributeResponse.data.required || []

    // Iterate over the rows of jsonData to create product payload
    for (const rowIndex in jsonData) {
      const errors = []
      const cskuExist = null
      const row = jsonData[rowIndex]
      const {
        sku,
        productId,
        productIdType,
        price,
        currency,
        quantity,
        brand,
        shippingWeight,
        category,
        mustShipAlone,
        ...inputAspects
      } = row
      console.log('row :>> ', row)
      if (row?.channelId != undefined) {
        cskuExist = await csku.findOne({
          where: {
            channelId: row.channelId
          }
        })
        if (!cskuExist) {
          errors.push('Channel Id does not exist')
          failedCounts++
          errorFile.push({
            ...row,
            error: errors?.join(',')
          })
          continue
        }
      }
      // Prepare product object
      const product = {
        id: productId,
        type: productIdType,
        shippingWeight: shippingWeight,
        mustShipAlone: mustShipAlone,
        brand: brand,
        category: category
      }

      // Create the categoryAspects payload by iterating through the attribute properties
      let categoryAspects = {}
      for (const [key, attribute] of Object.entries(attributes)) {
        console.log('key :>> ', key, inputAspects[key])
        const isRequired = requiredFields.includes(key)
        // Check if inputAspects contains this key and it's not null, undefined, or empty
        if (attribute.type === 'string') {
          const inputValue = inputAspects[key]
          // For strings, assign directly
          if (
            inputValue !== undefined &&
            inputValue !== null &&
            inputValue !== ''
          ) {
            categoryAspects[key] = inputValue
          } else {
            if (isRequired && key != 'brand') {
              errors.push(`Missing required field: ${key}`)
            }
          }
        } else if (
          attribute.type === 'array' &&
          !attribute?.items?.properties
        ) {
          // For arrays, ensure the input is properly parsed
          const inputValue = inputAspects[key]
          if (
            inputValue !== undefined &&
            inputValue !== null &&
            inputValue !== ''
          ) {
            if (Array.isArray(inputValue)) {
              categoryAspects[key] = inputValue
            } else if (typeof inputValue === 'string') {
              categoryAspects[key] = inputValue
                .split(',')
                .map(item => item.trim())
            } else {
              errors.push(`Invalid array format for ${key} in row ${rowIndex}`)
            }
          } else {
            if (isRequired) {
              errors.push(`Missing required field: ${key}`)
            }
          }
        } else if (attribute.type === 'object') {
          // For objects, process nested structure
          const objectFields = attribute.properties || {}
          const nestedObject = {}
          for (const subKey of Object.keys(objectFields)) {
            if (
              inputAspects[`${key}_${subKey}`] !== undefined &&
              inputAspects[`${key}_${subKey}`] !== null &&
              inputAspects[`${key}_${subKey}`] !== ''
            ) {
              nestedObject[subKey] = inputAspects[`${key}_${subKey}`]
            }
          }
          if (Object?.keys(nestedObject)?.length) {
            categoryAspects[key] = nestedObject
          } else {
            if (isRequired) {
              errors.push(`Missing required field: ${key}`)
            }
          }
        } else if (attribute?.items?.properties) {
          const itemProperties = attribute.items.properties || {}
          // Now we map the collected subKey values into the object array
          const object = {}
          for (const [subKey, subValues] of Object.entries(itemProperties)) {
            if (
              inputAspects[`${key}_${subKey}`] != undefined &&
              inputAspects[`${key}_${subKey}`] != null &&
              inputAspects[`${key}_${subKey}`] != ''
            ) {
              object[subKey] = inputAspects[`${key}_${subKey}`]
            }
          }
          if (Object?.keys(object)?.length) {
            categoryAspects[key] = [object]
          } else {
            if (isRequired) {
              errors.push(`Missing required field: ${key}`)
            }
          }
        }
      }
      console.log('categoryAspects :>> ', categoryAspects)
      // If no errors, proceed with creating the catalog entry
      if (errors.length === 0) {
        successCounts++
        if (cskuExist) {
          await this.updateWalmartCatalogue(
            userId,
            accountName,
            marketPlaceId,
            token,
            sku,
            product,
            inputAspects?.productName,
            categoryAspects,
            price,
            currency,
            quantity,
            cskuExist
          )
        } else {
          await this.createWalmartCatalogue(
            accountName,
            product,
            inputAspects?.productName,
            categoryAspects, // Processed category aspects
            sku,
            price,
            currency,
            token,
            marketPlaceId,
            userId,
            quantity
          )
        }
      } else {
        failedCounts++
        errorFile.push({
          ...row,
          error: errors?.join(',')
        })
        if (cskuExist) {
          await csku.update(
            {
              errors: errors,
              status: 'failed'
            },
            {
              where: {
                id: cskuExist?.id || cskuExist?.dataValues?.id
              }
            }
          )
        } else {
          await csku.create({
            isku: sku,
            channelId: null,
            title: inputAspects?.productName,
            price: Number(price),
            images: categoryAspects?.mainImageUrl
              ? [categoryAspects?.mainImageUrl]
              : [],
            currency: currency,
            marketplaceId: marketPlaceId,
            accountName: accountName,
            productId: product?.id,
            productIdType: product?.type,
            brand: product?.brand,
            mustShipAlone: product?.mustShipAlone,
            weight: product?.shippingWeight,
            categoryName: product?.category || null,
            quantity: quantity,
            itemSpecifics: [categoryAspects],
            status: 'failed',
            errors: errors || null,
            userId
          })
        }
        console.error(`Errors found in row ${rowIndex}:`, errors)
      }
    }
    return {
      success: true,
      successCount: successCounts,
      failedCount: failedCounts
    }
  } catch (error) {
    console.error(
      'Error in Walmart bulk upload:',
      error?.response ? error?.response?.data : error?.message
    )
    return {
      success: false,
      status: 500,
      message: 'Bulk upload failed',
      error: error?.message || ''
    }
  }
}

const updateWalmartQuantity = async (
  sku,
  quantity,
  correlationId,
  accessToken
) => {
  const quantityUpdationUrl = `https://marketplace.walmartapis.com/v3/inventory`
  const updateHeaders = createHeaders(
    correlationId,
    accessToken,
    `Walmart Marketplace Inventory`
  )
  const quantityUpdatePayload = {
    sku: sku,
    quantity: {
      unit: 'EACH',
      amount: quantity
    }
  }
  try {
    const response = await axios.put(
      quantityUpdationUrl,
      quantityUpdatePayload,
      {
        headers: updateHeaders
      }
    )
    console.log('Quantity updated successfully:', response.data)
    return { success: true }
  } catch (error) {
    console.error(
      'Error updating quantity:',
      error.response ? error.response.data : error.message
    )
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    }
  }
}
const updateWalmartPrice = async (
  sku,
  price,
  currency,
  correlationId,
  accessToken
) => {
  const priceUpdationUrl = `https://marketplace.walmartapis.com/v3/price`
  const updateHeaders = createHeaders(
    correlationId,
    accessToken,
    `Walmart Marketplace Price`
  )
  const priceUpdatePayload = {
    sku: sku,
    pricing: [
      {
        currentPriceType: 'BASE',
        currentPrice: {
          currency: currency,
          amount: price
        }
      }
    ]
  }
  try {
    const response = await axios.put(priceUpdationUrl, priceUpdatePayload, {
      headers: updateHeaders
    })
    console.log('Price updated successfully:', response.data)
    return { success: true }
  } catch (error) {
    console.error(
      'Error updating price:',
      error.response ? error.response.data : error.message
    )
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    }
  }
}
const updateWalmartBulkQuantity = async (items, token) => {
  const correlationId = uuidv4()
  const accessToken = await getWalmartToken(token, correlationId)
  const quantityUpdationUrl = `https://marketplace.walmartapis.com/v3/feeds?feedType=inventory`
  const updateHeaders = createHeaders(
    correlationId,
    accessToken,
    `Walmart Marketplace Inventory`
  )
  // Create payload for bulk quantity update
  const payload = items.map(item => ({
    sku: item.sku,
    quantity: {
      unit: 'EACH',
      amount: item.Quantity
    }
  }))
  console.log('payload :>> ', payload)
  try {
    const response = await axios.post(quantityUpdationUrl, payload, {
      headers: updateHeaders
    })
    console.log('Bulk quantity updated successfully:', response.data)
  } catch (error) {
    console.error(
      'Error updating bulk quantity:',
      error.response ? error.response.data : error.message
    )
  }
}
const updateWalmartBulkPrice = async (items, token) => {
  const correlationId = uuidv4()
  const accessToken = await getWalmartToken(token, correlationId)
  const priceUpdationUrl = `https://marketplace.walmartapis.com/v3/feeds?feedType=PRICE_AND_PROMOTION`
  const updateHeaders = createHeaders(
    correlationId,
    accessToken,
    `Walmart Marketplace Price`
  )
  const updatePayload = {
    MPItemFeedHeader: {
      businessUnit: 'WALMART_US',
      version: '2.0.20240126-12_25_52-api',
      locale: 'en'
    },
    MPItem: items.map(item => ({
      sku: item.sku,
      price: item?.Price
    }))
  }
  // // Create payload for bulk price update
  // const payload = items.map(item => ({
  //   sku: item.sku,
  //   pricing: [
  //     {
  //       currentPriceType: 'BASE',
  //       currentPrice: {
  //         currency: item.Currency,
  //         amount: item.Price
  //       }
  //     }
  //   ]
  // }));
  console.log('updatePayload :>> ', updatePayload)
  try {
    const response = await axios.put(priceUpdationUrl, updatePayload, {
      headers: updateHeaders
    })
    console.log('Bulk price updated successfully:', response.data)
  } catch (error) {
    console.error(
      'Error updating bulk price:',
      error.response ? error.response.data : error.message
    )
  }
}

exports.bulkUpdateWalmartPriceAndQuantity = async (
  items,
  token,
  errorFile = []
) => {
  try {
    let successCounts = 0 ;
    let failedCounts = 0 ;
    for (let i = 0; i < items?.length; i++) {
      const item = items[i]
      const correlationId = uuidv4()
      const accessToken = await getWalmartToken(token, correlationId)
      let itemFailed = false // Track if any part of the item fails
      // Update Quantity
      const quantityResult = await updateWalmartQuantity(
        item?.sku,
        item?.Quantity,
        correlationId,
        accessToken
      )
      if (!quantityResult.success) {
        itemFailed = true // Mark the item as failed if quantity update fails
        errorFile.push({
          channelId: item?.channelId,
          sku: item?.sku,
          variantId: item?.variantId,
          currency: item?.Currency,
          price: item?.Price,
          quantity: item?.Quantity,
          type: 'quantity',
          error: quantityResult.error
        })
      }

      // Update Price
      const priceResult = await updateWalmartPrice(
        item?.sku,
        item?.Price,
        item?.Currency,
        correlationId,
        accessToken
      )
      if (!priceResult.success) {
        itemFailed = true // Mark the item as failed if price update fails
        errorFile.push({
          channelId: item?.channelId,
          sku: item?.sku,
          variantId: item?.variantId,
          currency: item?.Currency,
          price: item?.Price,
          quantity: item?.Quantity,
          type: 'price',
          error: priceResult.error
        })
      }

      // Increment the correct count based on success or failure
      if (itemFailed) {
        failedCounts++
      } else {
        successCounts++
        await csku.update(
          {
            quantity: item.Quantity,
            price: item?.Price
          },
          {
            where: {
              channelId: item.channelId,
              isku: item?.isku
            }
          }
        )
      }
    }

    console.log('Final Success Count:', successCounts.total)
    console.log('Final Failed Count:', failedCounts.total)
    console.log('Errors:', errorFile?.length)
    return {
      success: true,
      successCount: successCounts,
      failedCount: failedCounts
    }
  } catch (error) {
    console.log('Error in bulkUpdateWalmartPriceAndQuantity:', error?.message)
    return {
      success: false,
      status: 500,
      message: 'Bulk update Quantity and Price Failed',
      error: error?.message || ''
    }
  }
}
async function getFeedStatus (
  channelId,
  accessToken,
  correlationId,
  productType
) {
  const headers = createHeaders(
    correlationId,
    accessToken,
    'Walmart Marketplace'
  )
  try {
    const response = await axios.get(
      `https://marketplace.walmartapis.com/v3/feeds/${channelId}?includeDetails=true`,
      { headers }
    )

    const feedData = response.data
    const itemDetails = feedData.itemDetails?.itemIngestionStatus?.[0]

    // Extract the required details
    const itemId =
      itemDetails?.itemid && itemDetails?.itemid != ''
        ? itemDetails?.itemid
        : null
    const newProductId =
      itemDetails?.productIdentifiers?.productIdentifier?.filter(
        prod => prod?.productIdType == productType
      )?.[0]?.productId || null
    const ingestionStatus = itemDetails?.ingestionStatus || 'UNKNOWN'
    const error = itemDetails?.ingestionErrors?.ingestionError || null

    return {
      itemId,
      status: feedData.feedStatus,
      ingestionStatus,
      newProductId,
      error
    }
  } catch (error) {
    console.error(
      `Error fetching feed status for channelId ${channelId}:`,
      error.message
    )
    return {
      itemId: null,
      status: 'FAILED',
      ingestionStatus: 'FAILED',
      newProductId,
      error: error.message
    }
  }
}

exports.updateWalmartProductStatus = async () => {
  try {
    // Step 1: Filter 'under review' data from csku table
    const underReviewProducts = await csku.findAll({
      where: { status: 'under review', marketplaceId: 18 } // Filter products with status 'under review'
    })

    // If no products are under review, exit early
    if (!underReviewProducts.length) {
      console.log('No products are under review')
      return
    }
    console.log(underReviewProducts?.length, 'products')

    // Step 2: Iterate over the filtered products using a for loop
    for (let i = 0; i < underReviewProducts?.length; i++) {
      const product = underReviewProducts[i]?.dataValues
      const {
        channelId,
        isku,
        marketplaceId,
        accountName,
        userId,
        productId,
        quantity,
        price,
        currency
      } = product

      // Step 3: Get token from tokens table based on accountName and userId
      const userToken = await Token.findOne({
        where: { accountName, userId, marketPlaceId: marketplaceId }
      })

      if (!userToken) {
        console.error(
          `No token found for account: ${accountName}, user: ${userId}`
        )
        continue
      }

      // Step 4: Get the feed status using the new function
      const correlationId = uuidv4()
      const accessToken = await getWalmartToken(userToken, correlationId)
      const { itemId, status, ingestionStatus, newProductId, error } =
        await getFeedStatus(channelId, accessToken, correlationId)

      // Determine the new status based on the feed status and itemId
      let newStatus = product?.status
      let newChannelId = channelId
      let prdctId = newProductId || productId

      if ((status === 'PROCESSED' || ingestionStatus === 'SUCCESS') && itemId) {
        newStatus = 'live' // Update status to 'live' if the feed is processed and itemId is present
        newChannelId = itemId // Update channelId to the new itemId
        // Call the quantity update function
        await updateWalmartQuantity(isku, quantity, correlationId, accessToken)
        // Call the price update function
        await updateWalmartPrice(
          isku,
          price,
          currency,
          correlationId,
          accessToken
        )
      } else if (
        status === 'FAILED' ||
        ingestionStatus === 'FAILED' ||
        !itemId
      ) {
        newStatus = 'failed' // Set status to 'failed' if feed failed or itemId is empty
      } else {
        newStatus = 'under review' // Keep it 'under review' otherwise
      }

      // Step 5: Update the product status and channelId in csku table
      await csku.update(
        {
          status: itemId ? 'live' : newStatus,
          channelId: newChannelId,
          errors: error,
          productId: prdctId
        },
        { where: { channelId } }
      )
      console.log(
        `Updated SKU ${isku} to status: ${newStatus}, channelId: ${newChannelId}`
      )
    }
  } catch (error) {
    console.error('Error updating Walmart product status:', error)
  }
}

exports.generateExcelForWalmartBulkCreate = async (
  category,
  workbook,
  mainSheet,
  dropdownSheet,
  res
) => {
  try {
    const attibuteResponse = await getCategoryAttributes(category)
    if (attibuteResponse?.success) {
      const attributes = attibuteResponse.data
      const requiredFields = attributes?.required || []
      const properties = attributes?.properties || {}

      // Default headers
      const headers = {
        '*productId': '*productId',
        '*productIdType': '*productIdType',
        '*sku': '*sku',
        '*quantity': '*quantity',
        '*price': '*price',
        '*currency': '*currency',
        '*shippingWeight': '*shippingWeight'
      }

      const enums = {
        '*productIdType': ['UPC', 'EAN', 'ISBN', 'GTIN']
      }

      const headerKeys = Object.keys(headers)
      let currentColumnIndex = headerKeys.length
      let dropdownCurrentRow = 2

      // Set default headers in the main sheet
      headerKeys.forEach((header, index) => {
        try {
          const columnLetter = getColumnLetter(index) // Helper to convert index to column letter
          if (enums[header]) {
            dropdownSheet
              .cell(`A${dropdownCurrentRow}`)
              .value(enums[header].map(value => [value]))

            const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
              dropdownCurrentRow + enums[header].length - 1
            }`

            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: 'list',
                formula1: dropdownRange
              })
            dropdownCurrentRow += enums[header].length
          }
          mainSheet.cell(`${columnLetter}1`).value(header)
        } catch (error) {
          console.error(`Error setting header for column ${index}:`, error)
        }
      })

      // Iterate over each property in attributes.properties
      for (const [key, attribute] of Object.entries(properties)) {
        const isRequired = requiredFields.includes(key)
        const headerName = isRequired ? `*${key}` : key // Add * for required fields

        if (attribute.type === 'object' && attribute.properties) {
          // Handle nested fields for object type
          for (const [subKey, subAttribute] of Object.entries(
            attribute.properties
          )) {
            const nestedKey = `${key}_${subKey}` // Format: parentKey_subKey
            const nestedHeaderName = isRequired ? `*${nestedKey}` : nestedKey

            const columnLetter = getColumnLetter(currentColumnIndex)
            mainSheet.cell(`${columnLetter}1`).value(nestedHeaderName)
            if (subAttribute?.enum || subAttribute?.items?.enum) {
              const enumValues = subAttribute?.enum || subAttribute?.items?.enum
              dropdownSheet
                .cell(`A${dropdownCurrentRow}`)
                .value(enumValues.map(value => [value]))
  
              const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
                dropdownCurrentRow + enumValues.length - 1
              }`
  
              mainSheet
                .range(`${columnLetter}2:${columnLetter}100`)
                .dataValidation({
                  type: 'list',
                  formula1: dropdownRange,
                  allowBlank:
                    subAttribute?.type?.toLowerCase() == 'array' ||
                    subAttribute?.items?.type?.toLowerCase() == 'array'
                      ? true
                      : false // Allow blank, user can add multiple values manually
                })
  
              dropdownCurrentRow += enumValues.length
            }
            currentColumnIndex++
          }
        } else if (attribute?.items?.properties) {
          // Handle array of object type
          for (const [itemKey, itemAttribute] of Object.entries(
            attribute.items.properties
          )) {
            const arrayKey = `${key}_${itemKey}` // Format: arrayKey_itemKey

            const arrayHeaderName = isRequired ? `*${arrayKey}` : arrayKey

            const columnLetter = getColumnLetter(currentColumnIndex)
            mainSheet.cell(`${columnLetter}1`).value(arrayHeaderName)

            // Handle enums for array items
            if (itemAttribute?.enum || itemAttribute?.items?.enum) {
              const enumValues =
                itemAttribute?.enum || itemAttribute?.items?.enum
              dropdownSheet
                .cell(`A${dropdownCurrentRow}`)
                .value(enumValues.map(value => [value]))

              const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
                dropdownCurrentRow + enumValues.length - 1
              }`

              mainSheet
                .range(`${columnLetter}2:${columnLetter}100`)
                .dataValidation({
                  type: 'list',
                  formula1: dropdownRange,
                  allowBlank:
                    itemAttribute?.type?.toLowerCase() == 'array' ||
                    itemAttribute?.items?.type?.toLowerCase() == 'array'
                      ? true
                      : false // Allow blank, user can add multiple values manually
                })

              dropdownCurrentRow += enumValues.length
            }

            currentColumnIndex++
          }
        } else {
          // Handle regular fields
          const columnLetter = getColumnLetter(currentColumnIndex)
          mainSheet.cell(`${columnLetter}1`).value(headerName)

          // Handle fields with enum values (dropdown)
          if (attribute?.enum || attribute?.items?.enum) {
            const enumValues = attribute?.enum || attribute?.items?.enum

            dropdownSheet
              .cell(`A${dropdownCurrentRow}`)
              .value(enumValues.map(value => [value]))

            const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
              dropdownCurrentRow + enumValues.length - 1
            }`

            mainSheet
              .range(`${columnLetter}2:${columnLetter}100`)
              .dataValidation({
                type: 'list',
                formula1: dropdownRange,
                allowBlank:
                  attribute?.type?.toLowerCase() == 'array' ||
                  attribute?.items?.type?.toLowerCase() == 'array'
                    ? true
                    : false // Allow blank, user can add multiple values manually
              })

            dropdownCurrentRow += enumValues.length
          }

          currentColumnIndex++
        }
      }
      const excelBuffer = await workbook.outputAsync()
      // Sending the generated Excel file
      res.setHeader('Content-Length', excelBuffer.length)
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=walmart-create.xlsx`
      )
      res.send(excelBuffer)
    }
  } catch (error) {
    console.error('Error generating Walmart bulk action Excel:', error)
  }
}

exports.generateExcelForWalmartBulkUpdate = async (
  category,
  workbook,
  mainSheet,
  dropdownSheet,
  cskuData,
  res
) => {
  try {
    const attributeResponse = await getCategoryAttributes(category)

    if (attributeResponse?.success) {
      const attributes = attributeResponse.data
      const properties = attributes?.properties || {}
      const requiredFields = attributes?.required || []

      // Static headers
      const headers = {
        '*channelId': '*channelId',
        '*productId': '*productId',
        '*productIdType': '*productIdType',
        '*sku': '*sku',
        '*quantity': '*quantity',
        '*price': '*price',
        '*currency': '*currency',
        '*shippingWeight': '*shippingWeight'
      }

      // Enum values for headers
      const enums = {
        '*productIdType': ['UPC', 'EAN', 'ISBN', 'GTIN']
      }

      let currentColumnIndex = Object.keys(headers).length
      let dropdownCurrentRow = 2

      // 1. Write static headers to the main sheet
      Object.keys(headers).forEach((header, index) => {
        const columnLetter = getColumnLetter(index) // Helper function for column conversion
        mainSheet.cell(`${columnLetter}1`).value(header)
        // Apply dropdown if enum exists
        if (enums[header]) {
          const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
            dropdownCurrentRow + enums[header].length - 1
          }`
          mainSheet
            .range(`${columnLetter}2:${columnLetter}100`)
            .dataValidation({
              type: 'list',
              formula1: dropdownRange,
              allowBlank: true
            })

          dropdownSheet
            .cell(`A${dropdownCurrentRow}`)
            .value(enums[header].map(value => [value]))
          dropdownCurrentRow += enums[header].length
        }
      })

      // Collect headers dynamically for item specifics (but don’t increment the column index yet)
      const dynamicHeaders = []
      for (const [key, attribute] of Object.entries(properties)) {
        const isRequired = requiredFields.includes(key)
        const headerName = isRequired ? `*${key}` : key // Add * for required fields

        if (attribute.type === 'object' && attribute.properties) {
          // Handle nested fields for object type
          for (const [subKey, subAttribute] of Object.entries(
            attribute.properties
          )) {
            const nestedKey = `${key}_${subKey}` 
            const nestedHeaderName = isRequired ? `*${nestedKey}` : nestedKey
            dynamicHeaders.push(nestedHeaderName)
            const columnLetter = getColumnLetter(currentColumnIndex)
            mainSheet.cell(`${columnLetter}1`).value(nestedHeaderName)
            if (subAttribute?.enum || subAttribute?.items?.enum) {
              const enumValues = subAttribute?.enum || subAttribute?.items?.enum
              dropdownSheet
                .cell(`A${dropdownCurrentRow}`)
                .value(enumValues.map(value => [value]))
  
              const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
                dropdownCurrentRow + enumValues.length - 1
              }`
  
              mainSheet
                .range(`${columnLetter}2:${columnLetter}100`)
                .dataValidation({
                  type: 'list',
                  formula1: dropdownRange,
                  allowBlank:
                    subAttribute?.type?.toLowerCase() == 'array' ||
                    subAttribute?.items?.type?.toLowerCase() == 'array'
                      ? true
                      : false // Allow blank, user can add multiple values manually
                })
  
              dropdownCurrentRow += enumValues.length
            }
            currentColumnIndex++;
          }
        } else if (attribute?.items?.properties) {
          // Handle array of object type
          for (const [itemKey, itemAttribute] of Object.entries(
            attribute.items.properties
          )) {
            const arrayKey = `${key}_${itemKey}` 
            const arrayHeaderName = isRequired ? `*${arrayKey}` : arrayKey
            dynamicHeaders.push(arrayHeaderName)
            const columnLetter = getColumnLetter(currentColumnIndex)
            mainSheet.cell(`${columnLetter}1`).value(arrayHeaderName)
            // Handle enums for array items
            if (itemAttribute?.enum || itemAttribute?.items?.enum) {
              const enumValues =
                itemAttribute?.enum || itemAttribute?.items?.enum
              dropdownSheet
                .cell(`A${dropdownCurrentRow}`)
                .value(enumValues.map(value => [value]))

              const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
                dropdownCurrentRow + enumValues.length - 1
              }`

              mainSheet
                .range(`${columnLetter}2:${columnLetter}100`)
                .dataValidation({
                  type: 'list',
                  formula1: dropdownRange,
                  allowBlank:
                    itemAttribute?.type?.toLowerCase() == 'array' ||
                    itemAttribute?.items?.type?.toLowerCase() == 'array'
                      ? true
                      : false // Allow blank, user can add multiple values manually
                })

              dropdownCurrentRow += enumValues.length
            }
            currentColumnIndex++
          }
        } else {
            // Handle regular fields
            const columnLetter = getColumnLetter(currentColumnIndex)
            mainSheet.cell(`${columnLetter}1`).value(headerName)
          dynamicHeaders.push(headerName)
                    // Handle fields with enum values (dropdown)
                    if (attribute?.enum || attribute?.items?.enum) {
                      const enumValues = attribute?.enum || attribute?.items?.enum
          
                      dropdownSheet
                        .cell(`A${dropdownCurrentRow}`)
                        .value(enumValues.map(value => [value]))
          
                      const dropdownRange = `DropdownList!$A$${dropdownCurrentRow}:$A$${
                        dropdownCurrentRow + enumValues.length - 1
                      }`
          
                      mainSheet
                        .range(`${columnLetter}2:${columnLetter}100`)
                        .dataValidation({
                          type: 'list',
                          formula1: dropdownRange,
                          allowBlank:
                            attribute?.type?.toLowerCase() == 'array' ||
                            attribute?.items?.type?.toLowerCase() == 'array'
                              ? true
                              : false // Allow blank, user can add multiple values manually
                        })
          
                      dropdownCurrentRow += enumValues.length
                    }
                    currentColumnIndex++
        }
      }

      // 3. Populate CSKU data rows
      let rowNumber = 2
      for (const data of cskuData) {
        // Static headers values
        Object.keys(headers).forEach((header, index) => {
          const columnLetter = getColumnLetter(index)
          if (header?.includes('sku')) {
            mainSheet
              .cell(`${columnLetter}${rowNumber}`)
              .value(data?.dataValues?.['isku'] || '')
          } else if (header?.includes('shippingWeight')) {
            mainSheet
              .cell(`${columnLetter}${rowNumber}`)
              .value(data?.dataValues?.['weight'] || '')
          } else {
            mainSheet
              .cell(`${columnLetter}${rowNumber}`)
              .value(data?.dataValues?.[header?.replace('*', '')?.trim()] || '')
          }
        })

        // Item specific values
        const itemSpecific = data?.dataValues?.itemSpecifics[0] || {}
        let dynamicColumnIndex = Object.keys(headers).length // Start after static headers
        for (const header of dynamicHeaders) {
          const columnLetter = getColumnLetter(dynamicColumnIndex)
          const key = header.replace('*', '').trim()
          // Split the key by underscore to separate parentKey and childKey
          const keyParts = key.split('_')
          const parentKey = keyParts[0] // First part of the key
          const childKey = keyParts[1] // Second part of the key (if exists)
          let parentValue = ''
          let finalValue = ''
          // Get the value for parentKey from itemSpecific
          if(itemSpecific[key]){
             parentValue = itemSpecific[key] || '' ;
          }else{
           parentValue = itemSpecific[parentKey] || '' ;
          }

          

          if (typeof parentValue === 'object' && !Array.isArray(parentValue)) {
            // 1. If parentValue is an object, extract childKey value if exists
            if (childKey && parentValue[childKey] !== undefined) {
              finalValue = parentValue[childKey]
            } else {
              finalValue = parentValue
            }
          } else if (Array.isArray(parentValue)) {
            // 2. If parentValue is an array of objects, extract childKey from the first object
            if (parentValue.length > 0 && typeof parentValue[0] === 'object') {
              finalValue = childKey ? parentValue[0][childKey] : parentValue[0]
            }else{
              finalValue = parentValue
            }
          } else {
            // If it's not an object or array, just assign the value directly
            finalValue = parentValue
          }

          // If finalValue is an array, join it into a string
          if (Array.isArray(finalValue)) {
            finalValue = finalValue.join(',')
          }

          // Write the final value into the Excel sheet
          mainSheet.cell(`${columnLetter}${rowNumber}`).value(finalValue)
          dynamicColumnIndex++
        }

        rowNumber++
      }

      const excelBuffer = await workbook.outputAsync()

      // Sending the generated Excel file as a response
      res.setHeader('Content-Length', excelBuffer.length)
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=walmart-update.xlsx`
      )
      res.send(excelBuffer)
    }
  } catch (error) {
    console.error('Error generating Walmart bulk update Excel:', error)
  }
}

function getColumnLetter (index) {
  let column = ''
  let temp = index + 1
  while (temp > 0) {
    const mod = (temp - 1) % 26
    column = String.fromCharCode(65 + mod) + column
    temp = Math.floor((temp - mod) / 26)
  }
  return column
}

exports.getWalmartProductDetails = async (
  userId,
  accountName,
  marketPlaceId,
  productId,
  showDuplicateItems = false
) => {
  try {
    // Get token from database
    const token = await Token.findOne({
      where: {
        accountName,
        marketPlaceId: parseInt(marketPlaceId)
      }
    });

    if (!token) {
      return {
        success: false,
        status: 404,
        message: 'Token not found'
      };
    }

    // Generate correlation ID
    const correlationId = uuidv4();
    
    // Get access token using existing function
    const accessToken = await getWalmartToken(token, correlationId);

    // Create request headers
    const headers = createHeaders(
      correlationId,
      accessToken,
      'Walmart Marketplace'
    );

    // Construct URL with query parameters
    const baseUrl = 'https://marketplace.walmartapis.com/v3/items';
    const queryParams = new URLSearchParams({
      'productIdType': 'SKU',
      'showDuplicateItemDetails': showDuplicateItems
    });
    const url = `${baseUrl}/${productId}?${queryParams}`;

    // Make request to Walmart API
    const response = await axios.get(url, { headers });

    // Log successful request
    console.log('Product details retrieved successfully for:', productId);

    return {
      success: true,
      status: 200,
      data: response.data,
      correlationId
    };

  } catch (error) {
    // Handle different types of errors
    console.error(
      'Error fetching product details:',
      error.response ? error.response.data : error.message
    );

    const errorResponse = {
      success: false,
      correlationId: error.config?.headers['WM_QOS.CORRELATION_ID'],
      status: error.response?.status || 500,
      message: 'Failed to fetch product details',
      error: error.response?.data || error.message
    };

    // Specific error handling
    if (error.response?.status === 404) {
      errorResponse.message = 'Product not found';
    } else if (error.response?.status === 401) {
      errorResponse.message = 'Authentication failed';
    } else if (error.response?.status === 429) {
      errorResponse.message = 'Rate limit exceeded';
    }

    return errorResponse;
  }
};



exports.getWalmartToken = getWalmartToken