const { default: axios } = require('axios')
const csku = require('../../models/csku')
const isku = require('../../models/isku')
const Tokens = require('../../models/tokens')
const newRelic = require('newrelic')
const Catalogue = require('../../models/catalogue')
const { apiCallLog } = require('../../helper/apiCallLog')
const { create } = require('../../../../cluster-service/models/log');
const CatalogueVariation = require('../../models/catalogue-variation.js');
const { type } = require('os')

const getAllProducts = async (shopifyStore, accessToken) => {
  let allProducts = []
  let url = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json`
  let hasNextPage = true
  let pageInfo = null

  while (hasNextPage) {
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 250, // maximum limit per request
          page_info: pageInfo
        }
      })

      const products = response.data.products
      allProducts = allProducts.concat(products)

      // Check for pagination
      const linkHeader = response.headers['link']
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const matches = linkHeader.match(/<([^>]+)>; rel="next"/)
        pageInfo = matches[1].split('page_info=')[1]
      } else {
        hasNextPage = false
      }
    } catch (error) {
      newRelic.recordCustomEvent(
        `Error while fetching products shopify. ${error}`
      )
      break
    }
  }
  return allProducts
}
const getRecentProducts = async (shopifyStore, accessToken) => {
  console.log('Fetching recent products from Shopify')
  let allProducts = []
  let url = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json`
  let hasNextPage = true
  let pageInfo = null

  // TODO - check time provided - 2023-03-31T00:00:00-04:00
  // Calculate the date 30 days before today
  const date = new Date()
  date.setDate(date.getDate() - 30)

  // Manually format the date to include the timezone offset -04:00
  const formattedDate = date.getFullYear() + '-' +
    ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
    ('0' + date.getDate()).slice(-2) + 'T' +
    ('0' + date.getHours()).slice(-2) + ':' +
    ('0' + date.getMinutes()).slice(-2) + ':' +
    ('0' + date.getSeconds()).slice(-2) + '-04:00';
  let i = 0;
  while (hasNextPage) {
    try {

      let params = {
        limit: 250, // maximum limit per request
        page_info: pageInfo,
        created_at_min: formattedDate
      }

      if (i > 0) {
        params = {
          limit: 250, // maximum limit per request
          page_info: pageInfo
        }
      }

      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        params: params,
      });
      console.log("response", response.data.products);
      const products = response.data.products
      allProducts = allProducts.concat(products)

      // Check for pagination
      const linkHeader = response.headers['link']
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const matches = linkHeader.match(/<([^>]+)>; rel="next"/)
        pageInfo = matches[1].split('page_info=')[1]
      } else {
        hasNextPage = false
      }
    } catch (error) {
      console.log("error", error);
      newRelic.recordCustomEvent(
        `Error while fetching products shopify. ${error}`
      )
      break
    }
    console.log("allProducts", allProducts.length);
    console.log("hasNextPage", hasNextPage);
    console.log("iteration", i);
    i++;
  }

  return allProducts
}
exports.GetShopifyCatalogue = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const products = await getAllProducts(accountName, token.dataValues.token)

    if (products && products.length > 0) {
      listings.push(...products)
      pushDataShopify(
        products,
        marketplaceId,
        accountName,
        userId,
        addQuantity,
        token.dataValues.token
      )
    }
    return listings
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error while fetching products and push in database. ${error}`
    )
    await Tokens.update(
      { status: 'inactive' },
      { where: { token: token, userId: userId } }
    )
    throw error
  }
}
exports.GetShopifyCatalogueRecent = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const products = await getRecentProducts(
      accountName,
      token.dataValues.token || token
    )
    if (products && products.length > 0) {
      listings.push(...products);
      await pushDataShopify(
        products,
        marketplaceId,
        accountName,
        userId,
        addQuantity,
        token?.dataValues?.token || token?.token || token
      )
    }
    return listings
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error while fetching products and push in database. ${error}`
    )
    await Tokens.update(
      { status: 'inactive' },
      { where: { token: token, userId: userId } }
    )
    throw error
  }
}

exports.handleShopifyItemDetails = async (
  token,
  cskus,
  accountName,
  userId,
  res
) => {
  try {
    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/products`
    const headers = {
      'X-Shopify-Access-Token': token.dataValues.token,
      'Content-Type': 'application/json'
    }

    await Promise.all(
      cskus?.map(async item => {
        try {
          const response = await axios.get(
            `${shopifyUrl}/${item.channelId}.json`,
            { headers }
          )
          const product = response.data.product

          item.title = product.title
          item.description = product.body_html
          item.price = product.variants[0].price
          item.quantity = product.variants[0].inventory_quantity
          item.sku = product.variants[0].sku

          await item.save()
        } catch (err) {
          console.error('Error fetching Shopify product details:', err)
        }
      })
    )
    return
  } catch (error) {
    newRelic.recordCustomEvent(
      `Error while fetching Shopify product details. ${error}`
    )
    await Tokens.update(
      { status: 'inactive' },
      { where: { token: token, userId: userId } }
    )
    throw error
  }
}
exports.updateShopifyInventory = async (token, csku, newData) => {
  try {
    //NOTE - Fetch product information
    const productResponse = await axios.get(
      `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-04/products/${csku?.dataValues?.channelId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token?.dataValues?.token
        },
        maxBodyLength: Infinity
      }
    )

    const productData = productResponse?.data
    const variant = productData?.product?.variants?.find(
      v => v.id == csku?.dataValues?.variantId
    )
    if (!variant) {
      return {
        success: false,
        message: 'Variant not found in Shopify response'
      }
    }
    const inventoryId = variant?.inventory_item_id
    const quantity = variant?.inventory_quantity
    if (!inventoryId) {
      return { success: false, message: 'Inventory ID not found' }
    }

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://${token.dataValues.accountName}.myshopify.com/admin/api/2024-10/inventory_levels.json?inventory_item_ids=${inventoryId}`,
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
      }
    };

    const locationResponse = await axios.request(config)

    //NOTE - Fetch location information
    // const locationResponse = await axios.get(
    //   `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-07/locations.json`,
    //   {
    //     headers: {
    //       'X-Shopify-Access-Token': token.dataValues.token
    //     },
    //     maxBodyLength: Infinity
    //   }
    // )

    const locationId = locationResponse?.data?.inventory_levels?.[0]?.location_id
    if (!locationId) {
      return { success: false, message: 'Location ID not found' }
    }
    //NOTE - Prepare data for inventory update
    const adjustment = 0 - (isNaN(parseInt(newData?.Quantity)) ? 0 : parseInt(newData?.Quantity));

    console.log('Adjustment:', adjustment)

    const data = {
      location_id: locationId,
      inventory_item_id: inventoryId,
      available_adjustment: adjustment
    }

    // Post inventory update
    const updateResponse = await axios.post(
      `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-07/inventory_levels/adjust.json`,
      data,
      {
        headers: {
          'X-Shopify-Access-Token': token.dataValues.token,
          'Content-Type': 'application/json'
        },
        maxBodyLength: Infinity
      }
    )

    console.log('Inventory updated successfully', updateResponse.data)
    await apiCallLog("updateShopifyInventory", "updateShopifyInventory", "updateShopifyInventory", { data }, { response: updateResponse.data }, {}, "success")
    return { success: true, message: 'Inventory updated successfully' }
  } catch (error) {
    console.error('Error updating Shopify inventory:', error)
    await apiCallLog("updateShopifyInventory", "updateShopifyInventory", "updateShopifyInventory", { csku }, {}, { error: error.message }, "error")
    // return { success: false, message: 'Error updating Shopify inventory' }
    throw error;
  }
}

exports.setShopifyInventory = async (token, inventory_item_id, newQuantity) => {
  try {
    //NOTE - Fetch product information
    if (!token) {
      return {
        success: false,
        message: 'Token not found.'
      }
    }
    const inventoryId = inventory_item_id

    if (!inventoryId) {
      return { success: false, message: 'Inventory ID not found' }
    }

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://${token.dataValues.accountName}.myshopify.com/admin/api/2024-10/inventory_levels.json?inventory_item_ids=${inventoryId}`,
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
      }
    };

    const locationResponse = await axios.request(config)

    //NOTE - Fetch location information
    // const locationResponse = await axios.get(
    //   `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-07/locations.json`,
    //   {
    //     headers: {
    //       'X-Shopify-Access-Token': token.dataValues.token
    //     },
    //     maxBodyLength: Infinity
    //   }
    // )

    const locationId = locationResponse?.data?.inventory_levels?.[0]?.location_id
    if (!locationId) {
      return { success: false, message: 'Location ID not found' }
    }
    //NOTE - Prepare data for inventory update

    const data = {
      location_id: locationId,
      inventory_item_id: inventoryId,
      available: parseInt(newQuantity) || 0
    }

    // Post inventory update
    const updateResponse = await axios.post(
      `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-07/inventory_levels/set.json`,
      data,
      {
        headers: {
          'X-Shopify-Access-Token': token.dataValues.token,
          'Content-Type': 'application/json'
        },
        maxBodyLength: Infinity
      }
    )

    console.log('Inventory updated successfully', updateResponse.data)
    await apiCallLog("updateShopifyInventory", "updateShopifyInventory", "updateShopifyInventory", { data }, { response: updateResponse.data }, {}, "success")
    return { success: true, message: 'Inventory updated successfully' }
  } catch (error) {
    console.error('Error updating Shopify inventory:', error.response?.data)
    await apiCallLog("updateShopifyInventory", "updateShopifyInventory", "updateShopifyInventory", { csku }, {}, { error: error.message }, "error")
    // return { success: false, message: 'Error updating Shopify inventory' }
    throw error;
  }
}

exports.updateShopifyBulkPriceAndQuantity = async (
  items,
  token,
  errorFile,
  successCounts,
  failedCounts
) => {
  const headers = {
    'X-Shopify-Access-Token': token.token,
    'Content-Type': 'application/json'
  }

  for (const item of items) {
    try {
      // Fetch the product and variants in one go
      const productResponse = await axios.get(
        `https://${token?.accountName}.myshopify.com/admin/api/2023-04/products/${item.channelId}.json`,
        { headers }
      )

      const product = productResponse?.data?.product
      if (!product) {
        console.log(`Product with ID ${item.channelId} not found.`)
        throw new Error(`Product not found: ${item.channelId}`)
      }

      // Check if the variant exists
      const variant = product?.variants?.find(v => v.id === item.variantId)

      if (variant) {
        // If variant exists, update price and quantity
        const updateVariantUrl = `https://${token?.accountName}.myshopify.com/admin/api/2023-04/products/${item.channelId}/variants/${item.variantId}.json`

        const variantPayload = {
          variant: {
            id: item.variantId,
            inventory_quantity: item.Quantity,
            price: item.Price,
            sku: item.sku
          }
        }

        await axios.put(updateVariantUrl, variantPayload, { headers })

        console.log(
          `Variant updated successfully for SKU: ${item.sku}, Variant ID: ${item.variantId}`
        )
        successCounts++
      } else {
        // If variant not found, treat product as a single product
        const updateProductUrl = `https://${token?.accountName}.myshopify.com/admin/api/2023-04/products/${item.channelId}.json`

        const productPayload = {
          product: {
            id: item.channelId,
            variants: [{ price: item.Price, inventory_quantity: item.Quantity, sku: item.sku }]
          }
        }

        await axios.put(updateProductUrl, productPayload, { headers })
        console.log(
          `Product updated successfully for SKU: ${item.sku}, Product ID: ${item.channelId}`
        )
        successCounts++
        await csku.update(
          {
            quantity: item.Quantity,
            price: item?.Price
          },
          {
            where: {
              channelId: item.channelId,
              isku: item?.sku
            }
          }
        )
      }
    } catch (error) {
      failedCounts++
      console.error(
        `Error updating SKU: ${item.sku}, Variant ID: ${item.variantId || 'None'
        }:`,
        error.message
      )

      errorFile.push({
        channelId: item?.channelId,
        sku: item?.sku,
        variantId: item?.variantId,
        currency: item?.Currency,
        price: item?.Price,
        quantity: item?.Quantity,
        error: error.message
      })
    }
  }
}

// Function to fetch custom collections from Shopify
exports.fetchShopifyCustomCollections = async token => {
  const shopifyUrl = `https://${token?.dataValues?.accountName}.myshopify.com/admin/api/2024-01/custom_collections.json`
  try {
    // Fetch custom collections from Shopify
    const response = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': token?.dataValues?.token,
        'Content-Type': 'application/json'
      }
    })
    const collections = response?.data?.custom_collections
    // Store each collection in the Catalogue table
    for (const collection of collections) {
      const { id, title } = collection
      // Check if the collection already exists in the Catalogue table
      const existingCollection = await Catalogue.findOne({
        where: { categoryId: id }
      })
      if (!existingCollection) {
        // Create a new collection if it doesn't exist
        await Catalogue.create({
          userId: token?.dataValues?.userId,
          accountName: token?.dataValues?.accountName,
          marketPlace: token?.dataValues?.marketPlaceId,
          categoryId: id,
          categoryName: title
        })
      } else {
        // Optionally update the existing collection if necessary
        await Catalogue.update(
          {
            categoryName: title
          },
          {
            where: { categoryId: id }
          }
        )
      }
    }

    console.log('Custom collections fetched and stored successfully.')
    return {
      success: true,
      status: 200,
      message: 'Collections fetched and stored.',
      data: collections
    }
  } catch (error) {
    console.error('An error occurred while fetching collections:', error)
    return {
      success: false,
      status: 500,
      message: 'Failed to fetch collections.',
      error,
      data: null
    }
  }
}

exports.fetchShopifyCollections = async (token, title) => {
  try {
    const collectionsData = {}
    // Loop through the account names and fetch collections for each
    const accessToken = token?.dataValues?.token
    const accountName = token?.dataValues?.accountName
    let url = `https://${acc}.myshopify.com/admin/api/2023-10/custom_collections.json`
    if (title) {
      url += `?title=${title}`
    }
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      })
      const collectionsData = response?.data?.custom_collections?.map(
        collection => {
          return {
            categoryId: collection.id,
            categoryName: collection.title
          }
        }
      )
      return {
        success: true,
        status: 200,
        data: collectionsData
      }
    } catch (error) {
      console.log(
        `Error fetching collections for ${accountName}: ${error?.message}`
      )
      return {
        success: false,
        status: 500,
        data: null,
        message: error?.message || error?.response?.message
      }
    }
  } catch (error) {
    console.error('Error fetching collections:', error)
    return {
      success: false,
      status: 500,
      data: null,
      message: error?.message || error?.response?.message
    }
  }
}
exports.getShopifyCollections = async token => {
  try {
    // Fetch collections that match the specified criteria
    const collections = await Catalogue.findAll({
      where: {
        userId: token?.dataValues?.userId,
        accountName: token?.dataValues?.accountName,
        marketPlace: token?.dataValues?.marketplaceId
      },
      attributes: ['categoryId', 'categoryName']
    })

    const result = collections?.map(collection => ({
      categoryId: collection?.categoryId || collection?.dataValues?.categoryId,
      categoryName:
        collection?.categoryName || collection?.dataValues?.categoryName
    }))

    return {
      success: true,
      status: 200,
      data: result || []
    }
  } catch (error) {
    console.error('An error occurred while fetching collections:', error)
    return {
      success: false,
      status: 500,
      data: [],
      message: error?.message || error?.response?.message
    }
  }
}
exports.updateShopifyCatalogue = async (
  token,
  itemId,
  product,
  collectionIds,
  variants,
  options,
  groupProductId
) => {
  const accountName = token?.dataValues?.accountName
  const userId = token?.dataValues?.userId
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/products/${itemId}.json`
  // const options = [
  //   ...new Set(
  //     variants?.flatMap(variant => variant?.options?.map(opt => opt?.name))
  //   )
  // ]?.map(optionName => ({
  //   name: optionName,
  //   values: [
  //     ...new Set(
  //       variants?.flatMap(variant =>
  //         variant?.options.find(opt => opt?.name === optionName)?.value
  //           ? [variant?.options?.find(opt => opt?.name === optionName).value]
  //           : []
  //       )
  //     )
  //   ]
  // }))
  const updateProductPayload = {
    product: {
      id: itemId,
      title: product?.title,
      body_html: product?.description,
      vendor: product?.brand,
      product_type: product?.productType,
      variants: variants?.length
        ?
        variants?.map(variant => {
          // const variantOptions = {}
          // variant.options.forEach((opt, index) => {
          //   variantOptions[`option${index + 1}`] = opt.value
          // })
          return {
            "inventory_policy": "deny",
            "inventory_management": "shopify",
            old_inventory_quantity: 0,
            ...variant
          }
        })
        : [
          {
            id: product?.variantId,
            sku: product?.isku || product.product?.isku,
            "inventory_policy": "deny",
            "inventory_management": "shopify",
            price: product?.price,
            old_inventory_quantity: 0,
            option1: options.length == 0 ? "Default Title" : undefined
          }
        ],
      options: options.length == 0 ? [{
        "name": "Title",
        "position": 1,
        "values": [
          "Default Title"
        ]
      }] : options,
      images: product?.images?.map(url => ({ src: url }))
    }
  }
  // require("fs").writeFileSync("updateProductPayload.json", JSON.stringify(updateProductPayload, null, 2));

  if (variants && variants?.length == 0) {
    // delete updateProductPayload.product.variants;
    // delete updateProductPayload.product.options;
  }

  try {
    const variantGroupId = product?.isku;
    // await storeProducts(userId, accountName, 10, product, collectionIds, variants, variantGroupId)
    // Update product in Shopify
    const response = await axios.put(shopifyUrl, updateProductPayload, {
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
        'Content-Type': 'application/json'
      }
    }).catch(err => { console.log(err.response.data) })
    const updatedProduct = response?.data?.product
    console.log('Updated Product:', updatedProduct)

    // Update collections if specified
    if (collectionIds && collectionIds.length > 0) {
      const { data } = await fetchCollectionsByProductId(accountName, itemId, (token?.dataValues?.token || token?.token));
      let error = [];
      for (let collectionId of collectionIds) {
        if (!data?.includes(collectionId?.id)) {
          const res = await addProductToCollection(accountName, collectionId.id, itemId, (token?.dataValues?.token || token?.token));
          if (!res?.success) {
            error.push(res?.message)
          }
        } else {
          console.log(`Product already in collection ${collectionId?.id}, skipping...`);
        }
      }
      if (error?.length) {
        const whereClouse = variants?.length ? {
          variantGroupId: variantGroupId
        } : {
          isku: product?.isku
        }
        await csku.update({
          errors: error
        }, {
          where: {
            ...whereClouse
          }
        })
      }
    }

    // Push updated data to Shopify listing
    // await pushDataShopify(
    //   [updatedProduct],
    //   token?.dataValues?.marketPlaceId,
    //   accountName,
    //   userId,
    //   false,
    //   token?.dataValues?.token || token?.token || token
    // )
    return { success: true, product: updatedProduct }
  } catch (err) {
    console.error('An error occurred while updating the product:', err)
    return false
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

exports.updateMetaFields = async (token, itemId, metafields) => {
  const accountName = token?.dataValues?.accountName
  const userId = token?.dataValues?.userId
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/products/${itemId}/metafields.json`

  if (metafields && metafields.length > 0) {

    const response = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
      }
    });
    console.log('response', response.data);
    const existingMetaFields = response.data.metafields;

    let createMetaFields = []
    const updateMetaFields = metafields.map(metafield => {
      const existingMetaField = existingMetaFields.find(
        field => field.key === metafield.key
      );

      if (existingMetaField) {
        return {
          ...metafield,
          id: existingMetaField.id
        };
      } else {
        createMetaFields.push(metafield);
      }
    }).filter(Boolean);

    createMetaFields = createMetaFields.filter(Boolean);
    // console.log('createMetaFields', createMetaFields);
    // console.log('updateMetaFields', updateMetaFields);

    let data = JSON.stringify({
      "query": "mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { key namespace value createdAt updatedAt } userErrors { field message code } } }",
      "variables": {
        "metafields": [
          ...updateMetaFields.map(metafield => ({
            "namespace": metafield.namespace,
            "key": metafield.key,
            "ownerId": `gid://shopify/Product/${itemId}`,
            "type": metafield.type,
            "value": metafield.value,
            "id": metafield.id
          })),
          ...createMetaFields.map(metafield => ({
            "namespace": metafield.namespace,
            "key": metafield.key,
            "ownerId": `gid://shopify/Product/${itemId}`,
            "type": metafield.type,
            "value": metafield.value
          }))
        ]
      }
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://${token.dataValues.accountName}.myshopify.com/admin/api/unstable/graphql.json`,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token.dataValues.token,
      },
      data: data
    };

    await delay(1000); // Delay for 1 second between requests
    await axios.request(config)

    // if (updateMetaFields.length > 0) {
    //   for (var i = 0; i < updateMetaFields.length; i++) {
    //     const updateMetaField = updateMetaFields[i];

    //     const updateMetaFieldUrl = `https://${accountName}.myshopify.com/admin/api/2024-10/products/${itemId}/metafields/${updateMetaField.id}.json`
    //     console.log(updateMetaFieldUrl, updateMetaField)
    //     await delay(1000); // Delay for 1 second between requests
    //     const updateResponse = await axios.put(updateMetaFieldUrl, {
    //       metafield: updateMetaField
    //     }, {
    //       headers: {
    //         'X-Shopify-Access-Token': token.dataValues.token,
    //         'Content-Type': 'application/json'
    //       }
    //     }).catch(err => {
    //       console.log(err.response.data)
    //     });
    //     console.log('Updated MetaFields:', updateResponse.data);
    //   }
    // }

    // if (createMetaFields.length > 0) {
    //   console.log("Inside createmetafields")
    //   let defndata = JSON.stringify({
    //     "query": "query { metafieldDefinitions(first: 250, ownerType: PRODUCT) { edges { node { id name namespace key type { name valueType } } } } }"
    //   });

    //   let defnconfig = {
    //     method: 'post',
    //     maxBodyLength: Infinity,
    //     url: `https://${accountName}.myshopify.com/admin/api/2025-04/graphql.json`,
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'X-Shopify-Access-Token': token.dataValues.token,
    //     },
    //     data: defndata
    //   };

    //   const metafieldDefn = await axios.request(defnconfig)
    //     .catch((error) => {
    //       console.log(error);
    //     });
    //   console.log('metafieldDefn', metafieldDefn.data);
    //   const finalcreateMetaFields = [];
    //   if (metafieldDefn && metafieldDefn.data) {
    //     console.log("metafieldDefn", metafieldDefn.data);
    //     createMetaFields.map(itm => {
    //       const found = metafieldDefn.data?.data?.metafieldDefinitions?.edges.find(edg => edg.node?.key == itm.key);

    //       delete itm.type
    //       if (found) {
    //         const foundMetaField = {
    //           ...itm,
    //           type: found.node?.type?.name,
    //         }
    //         finalcreateMetaFields.push(foundMetaField);
    //       } else {
    //         const foundMetaField = {
    //           ...itm,
    //           type: "single_line_text_field",
    //         }
    //         finalcreateMetaFields.push(foundMetaField);
    //       }

    //     });

    //   }
    //   console.log("finalcreateMetaFields", finalcreateMetaFields);
    //   const createMetaFieldsUrl = `https://${accountName}.myshopify.com/admin/api/2024-10/products/${itemId}.json`

    //   let data = JSON.stringify({
    //     "product": {
    //       "id": itemId,
    //       "metafields": finalcreateMetaFields
    //     }
    //   });

    //   let config = {
    //     method: 'put',
    //     maxBodyLength: Infinity,
    //     url: createMetaFieldsUrl,
    //     headers: {
    //       'X-Shopify-Access-Token': token.dataValues.token,
    //       'Content-Type': 'application/json'
    //     },
    //     data: data
    //   };

    //   await delay(1000); // Delay for 1 second between requests
    //   await axios.request(config).catch(err => console.log(err.response.data))

    // }

  }

}

exports.deleteVariant = async (token, itemId, variantId) => {
  const accountName = token?.dataValues?.accountName
  const userId = token?.dataValues?.userId
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/products/${itemId}/variants/${variantId}.json`

  try {
    // Delete variant in Shopify
    const response = await axios.delete(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
        'Content-Type': 'application/json'
      }
    })
    console.log('Variant deleted:', response.data)
    return true;
  } catch (err) {
    console.error('An error occurred while deleting the variant:', err)
    throw err;
  }
}

exports.createShopifyCatalogue = async (
  token,
  product,
  collectionIds,
  variants,
  groupProductId
) => {
  const accountName = token?.dataValues?.accountName
  const userId = token?.dataValues?.userId
  const marketPlaceId = token?.dataValues?.marketPlaceId
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/products.json`
  const options = [
    ...new Set(
      variants?.flatMap(variant => variant?.options?.map(opt => opt?.name))
    )
  ]?.map(optionName => ({
    name: optionName,
    values: [
      ...new Set(
        variants?.flatMap(variant =>
          variant?.options.find(opt => opt?.name === optionName)?.value
            ? [variant?.options?.find(opt => opt?.name === optionName).value]
            : []
        )
      )
    ]
  }))
  const createProductPayload = {
    product: {
      title: product?.title,
      body_html: product?.description,
      vendor: product?.brand,
      product_type: product?.productType,
      variants: variants?.length
        ? variants?.map(variant => {
          const variantOptions = {}
          variant.options.forEach((opt, index) => {
            variantOptions[`option${index + 1}`] = opt.value
          })
          return {
            price: variant?.price,
            compare_at_price: product?.mrp,
            sku: variant?.sku || product?.isku,
            inventory_quantity: variant?.quantity,
            inventory_management: 'shopify',
            image: variant?.images?.length
              ? { src: variant?.images[0] }
              : product?.images?.length
                ? { src: product.images[0] }
                : undefined,
            ...variantOptions
          }
        })
        : [
          {
            price: product?.price,
            compare_at_price: product?.mrp,
            sku: product?.isku,
            inventory_quantity: product?.quantity,
            inventory_management: 'shopify',
            image: product?.images?.length
              ? { src: product.images[0] }
              : undefined
          }
        ],
      options: options,
      images: product?.images?.map(url => ({ src: url }))
    }
  }
  const variantGroupId = product?.isku;
  await storeProducts(userId, accountName, marketPlaceId, product, collectionIds, variants, variantGroupId)
  try {
    const response = await axios.post(shopifyUrl, createProductPayload, {
      headers: {
        'X-Shopify-Access-Token': token.dataValues.token,
        'Content-Type': 'application/json'
      }
    })
    const newProduct = response?.data?.product
    console.log('New Product:', newProduct)
    // Add product to specified collections
    if (collectionIds && collectionIds?.length > 0) {
      const error = [];
      for (let collectionId of collectionIds) {
        const res = await addProductToCollection(accountName, collectionId?.id, newProduct?.id, (token?.dataValues?.token || token?.token));
        if (!res?.success) {
          error.push(res?.message)
        }
      }
      if (error?.length) {
        const whereClouse = variants?.length ? {
          variantGroupId: variantGroupId
        } : {
          isku: product?.isku
        }
        await csku.update({
          errors: error
        }, {
          where: {
            ...whereClouse
          }
        })
      }
    }
    // Push data to Shopify listing
    await pushDataShopify(
      [newProduct],
      token?.dataValues?.marketPlaceId,
      accountName,
      userId,
      false,
      token?.dataValues?.token || token?.token || token
    )
    return true
  } catch (err) {
    console.error('An error occurred while creating the product:', err)
    return false
  }
}

const storeProducts = async (userId, accountName, marketPlaceId, product, collectionIds, variants, variantGroupId) => {
  try {
    const commonData = {
      userId: userId,
      accountName: accountName,
      marketPlaceId: marketPlaceId,
      isku: product?.isku,
      title: product?.title,
      description: product?.description,
      price: product?.price,
      quantity: product?.quantity,
      currency: product?.currency,
      images: product?.images
    }
    const existingIsku = await isku.findOne({ where: { isku: commonData.isku } })
    if (existingIsku) {
      await existingIsku.update(commonData)
      console.log(`Updated ISKU entry for ${commonData.isku}`)
    } else {
      await isku.create(commonData)
      console.log(`Created ISKU entry for ${commonData.isku}`)
    }
    if (variants && variants?.length > 0) {
      for (const variant of variants) {
        const cskuData = {
          userId: userId,
          accountName: accountName,
          marketPlaceId: marketPlaceId,
          channelId: "To Be Listed",
          isku: variant?.sku || product.isku,
          variantId: variant?.sku || product?.isku,
          title: product?.title,
          description: product?.description,
          price: variant?.price,
          quantity: variant?.quantity,
          currency: product?.currency,
          variation: variant?.options,
          collections: collectionIds,
          images: product?.images,
          variantGroupId: variantGroupId,
          brand: product?.brand,
          productIdType: product?.productType
        }
        const existingCsku = await csku.findOne({
          where: { isku: cskuData.isku, userId, accountName, marketplaceId: marketPlaceId }
        })
        if (existingCsku) {
          await existingCsku.update(cskuData)
          console.log(`Updated CSKU entry for ${cskuData.isku}`)
        } else {
          await csku.create({ cskuData })
          console.log(`Created CSKU entry for ${cskuData.isku}`)
        }
      }
    } else {
      const existingCsku = await csku.findOne({
        where: { isku: commonData.isku, userId, accountName, marketplaceId: marketPlaceId }
      })
      if (existingCsku) {
        await existingCsku.update({
          ...commonData, collectionIds: collectionIds, brand: product?.brand,
          productIdType: product?.productType
        })
        console.log(`Updated CSKU entry for ${commonData.isku}`)
      } else {
        await csku.create({
          ...commonData, collectionIds: collectionIds, brand: product?.brand,
          productIdType: product?.productType
        })
        console.log(`Created CSKU entry for ${commonData.isku}`)
      }
    }
  } catch (err) {
    console.error('An error occurred while storing product in SKU tables:', err)
  }
}

async function fetchShopifyMetaFields(token, accountName, productId) {
  try {
    const url = `https://${accountName}.myshopify.com/admin/api/2024-01/products/${productId}/metafields.json`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    return {
      status: "success",
      message: "Metafields retrieved successfully",
      data: response.data.metafields || [],
    };
  } catch (error) {
    console.error(`Error fetching metafields for product ${productId}: ${error.message}`);

    return {
      status: "error",
      message: `Failed to retrieve metafields: ${error.message}`,
      data: [],
    };
  }
}

async function pushDataShopify(data, marketplaceId, accountName, userId, addQuantity, token) {
  const batchSize = 50;
  const totalBatches = Math.ceil(data.length / batchSize);
  const variationData = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchData = data.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
    console.log(`Processing batch ${batchIndex + 1}/${totalBatches}`);

    try {
      const cskus = [];
      const iskus = [];

      for (const item of batchData) {
        const collection = item.id ? await fetchShopifyCollectsAndDetailsByProductId(token, accountName, item.id) : [];
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        await delay(1000); // Delay for 1 second between requests
        const itemSpecificRes = item?.id ? await fetchShopifyMetaFields(token, accountName, item?.id) : null;
        const itemSpecific = itemSpecificRes?.data?.length > 0 ? itemSpecificRes?.data : null;
        const handleVariantData = async (variant, isSingleVariant) => {
          const currency = variant?.presentment_prices?.[0]?.price?.currency_code || null;
          const amount = variant?.presentment_prices?.[0]?.price?.amount || null;
          let images = item?.images.map(img => img.src);

          const existingIsku = await isku.findOne({
            where: { isku: variant.sku || variant.id.toString(), userId }
          });

          if (existingIsku && addQuantity) {
            existingIsku.quantity += variant.inventory_quantity;
            await existingIsku.save();
          } else if (!existingIsku) {
            iskus.push({
              isku: variant.sku || item.id,
              costPrice: variant.price || amount,
              title: item.title,
              images: images,
              quantity: variant.inventory_quantity,
              currency: variant.currency || currency,
              accountName,
              marketplaceId,
              userId
            });
          }

          await CatalogueVariation.destroy({
            where: { channel_id: item.id.toString(), userId }
          });

          const variantImage = variant.image_id
            ? item.images.find(img => img.id === variant.image_id)?.src
            : null;

          // For multi-variant products, remove the variant image from the main images array
          images = !isSingleVariant && variant.image_id
            ? item.images.filter(img => img.id !== variant.image_id).map(img => img.src)
            : item.images.map(img => img.src);

          variationData.push({
            channel_id: item.id,
            variation_id: variant.id,
            variation: variant,
            quantity: variant.inventory_quantity,
            price: variant.price || amount,
            userId: userId,
            account_name: accountName,
          });

          // if (!existingCsku) {

          //   variationData.push({
          //     channel_id: item.id,
          //     variation_id: variant.id,
          //     variation: variant,
          //     quantity: variant.inventory_quantity,
          //     price: variant.price || amount,
          //     userId: userId,
          //     account_name: accountName,
          //   });

          // } else {
          //   console.log(collection);

          //   await CatalogueVariation.update(
          //     {
          //       quantity: variant.inventory_quantity,
          //       price: variant.price || amount,
          //       variation: variant,
          //       sku: variant.sku || item.id,
          //     },
          //     { where: { channel_id: item.id, userId, variation_id: variant.id } }
          //   );

          // }
        };

        const existingCsku = await csku.findOne({
          where: { channelId: item.id.toString(), userId }
        });

        if (!existingCsku) {
          cskus.push({
            channelId: item.id,
            variantId: item.variants[0].id || item.id,
            isku: item.variants[0].sku || item.id,
            price: item.variants[0].price || null,
            mrp: item.variants[0].compare_at_price || null,
            images: item?.images.map(img => img.src),
            // variantImage: variantImage,
            description: item.body_html,
            quantity: item.variants[0].inventory_quantity,
            currency: item.variants[0].currency || null,
            collections: collection,
            marketplaceId,
            accountName,
            userId,
            productIdType: item.product_type || null,
            brand: item.vendor || null,
            title: item.title,
            status: item.status === 'active' ? 'live' : item.status === 'archived' ? 'archived' : 'draft',
            variation: item.variants,
            itemSpecifics: itemSpecific || null,
            groupProductId: item.id
          });
        } else {
          await existingCsku.update(
            {
              price: item.variants[0].price || amount,
              mrp: item.variants[0].compare_at_price,
              images: item?.images.map(img => img.src),
              description: item.body_html,
              collections: collection,
              quantity: item.variants[0].inventory_quantity,
              currency: item.variants[0].currency,
              productIdType: item.product_type || null,
              brand: item.vendor || null,
              title: item.title,
              variation: item.variants,
              itemSpecifics: itemSpecific || null,
              isku: item.variants[0].sku || item.id,
              status: item.status === 'active' ? 'live' : item.status === 'archived' ? 'archived' : 'draft'
            },
            { where: { channelId: item.id } }
          );
        }

        if (item.variants.length === 1) {
          await handleVariantData(item.variants[0], true);
        } else if (item.variants.length > 1) {
          for (const variant of item.variants) {
            await handleVariantData(variant, false);
          }
        }
      }

      await isku.bulkCreate(iskus);
      await csku.bulkCreate(cskus);
      await CatalogueVariation.bulkCreate(variationData);

    } catch (err) {
      newRelic.recordCustomEvent("ErrorEvent", { message: `Error during batch ${batchIndex + 1}: ${err.message}` });
      console.error(`Error during data push in batch ${batchIndex + 1}:`, err);
    }
  }
}

const addProductToCollection = async (accountName, collectionId, productId, token) => {
  const addProductToCollectionUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/collects.json`;
  const payload = {
    collect: {
      product_id: productId,
      collection_id: collectionId,
    },
  };

  try {
    const response = await axios.post(addProductToCollectionUrl, payload, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Added product ${productId} to collection ${collectionId}`);
    return {
      success: true,
      message: `Successfully added product ${productId} to collection ${collectionId}.`,
      status: response.status,
    };
  } catch (err) {
    console.error(`Error adding product ${productId} to collection ${collectionId}:`, err);
    return {
      success: false,
      message: `Failed to add product ${productId} to collection ${collectionId}.`,
      status: err.response?.status || 500, // Returns actual error status or defaults to 500
    };
  }
};
const fetchCollectionsByProductId = async (accountName, productId, token) => {
  try {
    const existingCollectionsUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/collects.json?product_id=${productId}`;
    const response = await axios.get(existingCollectionsUrl, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    console.log(response.data)
    // Convert the Set to an Array and include success status
    const collectionIds = [...new Set(response?.data?.collects?.map(collect => collect?.collection_id))];
    console.log(`Fetched`, collectionIds);
    return {
      success: true,
      data: collectionIds || [],
      message: `Fetched ${collectionIds.length} collections successfully.`,
    };
  } catch (err) {
    console.error(`Error fetching existing collections for product ${productId}:`, err);
    return {
      success: false,
      data: [],
      message: `Failed to fetch collections for product ${productId}.`,
    };
  }
};
async function fetchShopifyCollectDetailsByCollectId(
  token,
  accountName,
  collectionId
) {
  try {
    const url = `https://${accountName}.myshopify.com/admin/api/2024-01/collections/${collectionId}.json`
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    })
    return response.data.collection
  } catch (error) {
    return
  }
}
async function fetchShopifyCollectsAndDetailsByProductId(
  token,
  accountName,
  productId
) {
  try {
    const { data } = await fetchCollectionsByProductId(
      accountName,
      productId,
      token)

    const collectsDetails = await Promise.all(
      data?.map(async collect => {
        const collectDetails = await fetchShopifyCollectDetailsByCollectId(
          token,
          accountName,
          collect
        )
        return collectDetails
      })
    )
    console.log(collectsDetails)
    return collectsDetails.map(item => {
      return {
        id: item?.id,
        name: item?.title
        // handle: item?.handle,
        // title: item?.title,
        // published_at: item?.published_at
      }
    })
  } catch (error) {
    return
  }
}
exports.generateExcelForShopifyBulkCreate = async (
  accountName,
  userId,
  marketPlaceId,
  workbook,
  mainSheet,
  dropdownSheet,
  res
) => {
  try {
    const categories = await Catalogue.findAll({
      where: {
        userId: userId,
        accountName: accountName,
        marketPlace: marketPlaceId
      },
      attributes: ["categoryId", "categoryName"],
    });
    // Define headers
    const headerKeys = {
      "*sku": "*sku",
      "*title": "*title",
      "*description": "*description",
      "*brand": "*brand",
      "*productType": "*productType",
      "*quantity": "*quantity",
      "*price": "*price",
      "*currency": "*currency",
      "*images": "*images",
      "*collectionId": "*collectionId",
      variant_sku: "variant_sku",
      variant_price: "variant_price",
      variant_quantity: "variant_quantity",
      variant_image: "variant_image",
      variant_option1_name: "variant_option1_name",
      variant_option1_value: "variant_option1_value",

    };

    const enumValues = {
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
      ]
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
        if (header === "*collectionId" && categories?.length) {
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
exports.generateExcelForShopifyBulkUpdate = async (
  accountName,
  userId,
  workbook,
  mainSheet,
  dropdownSheet,
  cskuData,
  res
) => {
  try {
    const [
      categories,
    ] = await Promise.all([
      Catalogue.findAll({
        where: { userId, accountName },
        attributes: ["categoryId", "categoryName"],
      }),
    ]);
    // Define Headers
    const headerKeys = {
      "*channelId": "*channelId",
      "*sku": "*sku",
      "*title": "*title",
      "*description": "*description",
      "*quantity": "*quantity",
      "*price": "*price",
      "*currency": "*currency",
      "*images": "*images",
      "*collectionId": "*collectionId",
      "variant_sku": "variant_sku",
      "variant_price": "variant_price",
      "variant_quantity": "variant_quantity",
      "variant_image": "variant_image",
    };

    const enumValues = {
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
      ]
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
      if (header === "*collectionId" && categories?.length)
        dropdownRow = setFormatedDropdown(
          columnLetter,
          categories,
          "categoryName",
          "categoryId",
          dropdownRow
        );
    });
    // Populate Data Rows
    let rowNumber = 2;
    for (let i = 0; i < cskuData?.length; i++) {
      const row = cskuData[i]?.dataValues;
      Object?.keys(headerKeys)?.forEach((header, index) => {
        const columnLetter = getColumnLetter(index);
        const value = row?.[header?.replace("*", "")?.trim()] || null;
        if (header?.includes("sku")) {
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(row["isku"] || "");
        } else if (header?.includes("images")) {
          mainSheet
            .cell(`${columnLetter}${rowNumber}`)
            .value(row["images"]?.join(",") || "");
        } else if (
          ["variant_sku", "variant_price", "variant_quantity", "variant_image"]?.includes(header)
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
            } else if (header?.includes("variant_quantity")) {
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(row["quantity"] || "");
            } else if (header?.includes("variant_image")) {
              mainSheet
                .cell(`${columnLetter}${rowNumber}`)
                .value(row?.["variantImage"] || "");
            }
          } else {
            mainSheet.cell(`${columnLetter}${rowNumber}`).value("");
          }
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
        } else if (header?.includes('*collectionId')) {
          const collections = row['collections'];
          if (collections && collections?.length) {
            // Map through collections and format each as "name_id" or "title_id"
            const collectionValues = collections
              .map(collect => `${collect?.name || collect?.title}_${collect?.id}`)
              .join(',');

            // Set the cell value with the formatted collection IDs
            mainSheet.cell(`${columnLetter}${rowNumber}`).value(collectionValues);
          } else {
            mainSheet.cell(`${columnLetter}${rowNumber}`).value("");
          }
        }
        else {
          mainSheet.cell(`${columnLetter}${rowNumber}`).value(value || "");
        }
      });

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
exports.bulkCreateShopifyCatalogue = async (
  userId,
  accountName,
  marketPlaceId,
  token,
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
    const shopifyPayload = await generateShopifyPayload(
      validPayloads,
      userId,
      accountName,
      marketPlaceId,
      token
    );

    // Handle any failed payloads from eBay payload generation
    if (shopifyPayload?.failedPayloadFile?.length > 0) {
      shopifyPayload.failedPayloadFile.forEach((failedProduct) => {
        const isku = failedProduct?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      });
    }

    // Process each valid eBay payload
    for (let i = 0; i < shopifyPayload?.payloadFile?.length; i++) {
      try {
        const response = await this.createShopifyCatalogue(shopifyPayload.payloadFile[i]);

        if (response?.status) {
          successCounts++;
        } else {
          failedCounts++;
          const isku = shopifyPayload.payloadFile[i]?.product?.isku;
          const errorData = jsonData.filter(data => data?.sku === isku) || [];
          errorFile.push(...errorData);
        }
      } catch (error) {
        console.error("Error occurred while processing eBay payload:", error);
        failedCounts++;
        const isku = shopifyPayload.payloadFile[i]?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      }
    }

    // Log any failed payloads for debugging
    if (failedPayloads?.length > 0 || shopifyPayload?.failedPayloadFile?.length > 0) {
      console.error("Failed Payloads:", failedPayloads);
      failedCounts += failedPayloads?.length + (shopifyPayload?.failedPayloadFile?.length || 0);
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
exports.bulkUpdateShopifyCatalogue = async (
  userId,
  accountName,
  marketPlaceId,
  token,
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
    const shopifyPayload = await generateShopifyPayload(
      validPayloads,
      userId,
      accountName,
      marketPlaceId,
      token
    );

    // Handle any failed payloads from eBay payload generation
    if (shopifyPayload?.failedPayloadFile?.length > 0) {
      shopifyPayload.failedPayloadFile.forEach((failedProduct) => {
        const isku = failedProduct?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      });
    }

    // Process each valid eBay payload
    for (let i = 0; i < shopifyPayload?.payloadFile?.length; i++) {
      try {
        const response = await this.createShopifyCatalogue(shopifyPayload.payloadFile[i]);

        if (response?.status) {
          successCounts++;
        } else {
          failedCounts++;
          const isku = shopifyPayload.payloadFile[i]?.product?.isku;
          const errorData = jsonData.filter(data => data?.sku === isku) || [];
          errorFile.push(...errorData);
        }
      } catch (error) {
        console.error("Error occurred while processing eBay payload:", error);
        failedCounts++;
        const isku = shopifyPayload.payloadFile[i]?.product?.isku;
        const errorData = jsonData.filter(data => data?.sku === isku) || [];
        errorFile.push(...errorData);
      }
    }

    // Log any failed payloads for debugging
    if (failedPayloads?.length > 0 || shopifyPayload?.failedPayloadFile?.length > 0) {
      console.error("Failed Payloads:", failedPayloads);
      failedCounts += failedPayloads?.length + (shopifyPayload?.failedPayloadFile?.length || 0);
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
const groupByISKU = async (jsonData) => {
  const groupedData = {};
  const failedPayloads = [];

  for (const row of jsonData) {
    const isku = row["sku"] || row["variant_sku"];
    if (!groupedData[isku]) {
      groupedData[isku] = {
        ...row,
        variants: [],
        collectionIds: [],
      };
    }

    // Handle variants
    if (row["variant_sku"] && row["variant_sku"] !== '') {
      let i = 1;
      const options = [];
      while (row[`variant_option${i}_name`] && row[`variant_option${i}_value`]) {
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
        image: row["variant_image"],
        options,
      });
    }

    // Handle collection IDs
    if (row["collectionId"] && row["collectionId"] !== '') {
      const value = row["collectionId"];
      const collectArr = value.includes(',') ? value.split(',') : [value];

      for (const collect of collectArr) {
        const collectId = collect.split('_').pop();
        const collectName = collect.replace(`_${collectId}`, '').trim();

        // Check if the collection is already added
        if (!groupedData[isku].collectionIds.some(col => col.id === collectId)) {
          groupedData[isku].collectionIds.push({
            id: collectId,
            name: collectName,
          });
        }
      }
    }

    // Validate the row data and handle errors
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

const validateRowData = async (product) => {
  const errors = [];
  // Check mandatory fields
  if (!product?.sku) errors.push("Product SKU is required.");
  if (!product?.title) errors.push("Product title is required.");
  if (!product?.description) errors.push("Product description is required.");
  if (!product?.price) errors.push("Product price is required.");
  if (!product?.currency) errors.push("Product currency is required.");
  if (!product?.quantity) errors.push("Product quantity is required.");
  // Prepare images and check
  let images = product?.images?.includes(",")
    ? product?.images.split(",")
    : [product.images] || [];
  if (!images || images.length === 0)
    errors.push("Product images are required.");

  return errors;
};

const generateShopifyPayload = async (
  validPayloads,
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
      images,
      brand,
      productType,
      variants,
      collectionIds,
      ...rest
    } = product;
    // Prepare images
    images = images?.includes(",") ? images?.split(",") : [images] || [];
    // Create the payload
    let payload = {
      userId,
      accountName,
      marketplaceId,
      token,
      product: {
        title: title || "",
        description: description || "",
        price: price || 0,
        currency: currency || "",
        quantity: quantity || 0,
        images: images,
        brand: brand,
        productType: productType
      },
      variants: variants || [],
      collectionIds: collectionIds || [],
      groupProductId,
      errors: errors?.length > 0 ? errors : null,
    };

    // Store Category Handling
    if (collectionIds && collectionIds?.length) {
      for (const cat of collectionIds) {
        if (cat?.id) {
          await checkIds(Catalogue, "categoryId", cat?.id, errors);
          if (!errors?.length) {

          }
        }

      }
    }
    // Push to appropriate array based on errors
    if (errors.length > 0) {
      delete product["variants"];
      delete product["collectionIds"];
      failedPayloadFile.push(product);
    } else {
      payloadFile.push(payload);
    }
  }
  return { payloadFile, failedPayloadFile };
};
function getOptionIndex(header) {
  const match = header.match(/variant_option(\d+)_/);

  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
function getColumnLetter(index) {
  let columnLetter = "";
  while (index >= 0) {
    columnLetter = String.fromCharCode((index % 26) + 65) + columnLetter;
    index = Math.floor(index / 26) - 1;
  }
  return columnLetter;
}

exports.FetchShopifyProducts = async (itemIds, accountName, userId, token) => {

  try {

    if (!itemIds || !itemIds.length || !accountName || !token) {
      return [];
    }

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://${accountName}.myshopify.com/admin/api/2024-04/products.json?ids=${itemIds}`,
      headers: {
        'X-Shopify-Access-Token': token
      }
    };

    const response = axios.request(config);

    await pushDataShopify(response.data.products, 10, accountName, userId, token);

    return response.data.products;

  } catch (error) {
    console.error("Error fetching Shopify products:", error);
    return error.message;
  }

};

exports.GetShopifyProduct = async (itemIds, accountName, userId, token) => {

  try {

    if (!itemIds || !itemIds.length || !accountName || !token) {
      return [];
    }

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://${accountName}.myshopify.com/admin/api/2024-04/products.json?ids=${itemIds}`,
      headers: {
        'X-Shopify-Access-Token': token
      }
    };

    const response = axios.request(config);

    return response.data.products;

  } catch (error) {
    console.error("Error fetching Shopify products:", error);
    return error.message;
  }

};

exports.bulkInventoryAdjustments = async (accountName, token, adjustments) => {
  try {

    if (!adjustments || !adjustments.length || !accountName || !token) {
      return [];
    }

    //NOTE - Fetch location information
    const locationResponse = await axios.get(
      `https://${accountName}.myshopify.com/admin/api/2024-07/locations.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token
        },
        maxBodyLength: Infinity
      }
    );

    if (!locationResponse?.data?.locations?.length) {
      throw new Error("No locations found");
    }

    if (locationResponse?.data?.locations?.length > 1) {
      throw new Error("Multiple locations found");
    }

    const locationId = locationResponse?.data?.locations[0]?.admin_graphql_api_id;

    let data = JSON.stringify({
      "query": `mutation InventoryBulkAdjustQuantitiesAtLocation($inventoryItemAdjustments: [InventoryAdjustItemInput!]!) { inventoryBulkAdjustQuantityAtLocation(inventoryItemAdjustments: $inventoryItemAdjustments, locationId: \"${locationId})\" { inventoryLevels { id quantities(names: [\"available\"]) { name quantity } incoming item { id sku } location { id name } } } }`,
      "variables": {
        "inventoryItemAdjustments": adjustments
      }
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://${accountName}.myshopify.com/admin/api/unstable/graphql.json`,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      data: data
    };

    await axios.request(config);

    return {
      success: true,
      message: "Inventory adjustments successful"
    };

  } catch (error) {
    console.error("Error fetching Shopify products:", error);
    throw error;
  }
}