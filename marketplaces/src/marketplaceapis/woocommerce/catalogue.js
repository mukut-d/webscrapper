const csku = require('../../models/csku')
const isku = require('../../models/isku')
const moment = require('moment')
const axios = require('axios')
const Catalogue = require('../../models/catalogue')
exports.GetWoocommerceCatalogue = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const today = moment()
    const twoYearsAgo = moment().subtract(2, 'years')
    const perPage = 50
    let page = 1
    const formattedStartDate = moment(twoYearsAgo).startOf('day').toISOString()
    const formattedEndDate = moment(today).endOf('day').toISOString()
    accountName = accountName?.includes('.com')
      ? accountName
      : `${accountName}.com`
    let url = `https://${accountName}/wp-json/wc/v3/products`
    while (page != 0) {
      const response = await axios.get(url, {
        headers: {
          Authorization: 'Basic ' + token.dataValues.token
        },
        params: {
          after: formattedStartDate,
          before: formattedEndDate,
          per_page: perPage,
          page: page
        }
      })
      const data = response?.data
      listings.push(...data)
      if (data?.length) {
        await pushDataWooCommerce(
          data,
          marketplaceId,
          accountName,
          userId,
          token.dataValues.token,
          addQuantity
        )
      }
      if (data?.length < perPage) {
        page = 0
      } else {
        page++
      }
    }
    console.log(listings?.length, 'total')
    return []
    // return listings
  } catch (err) {
    console.log('error', err)
  }
}

exports.GetWoocommerceCatalogueRecent = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity
) => {
  let listings = []
  try {
    const today = moment()
    const thirtyDaysAgo = moment().subtract(30, 'days')
    const perPage = 100
    let page = 1
    const formattedStartDate = moment(thirtyDaysAgo)
      .startOf('day')
      .toISOString()
    const formattedEndDate = moment(today).endOf('day').toISOString()
    accountName = accountName?.includes('.com')
      ? accountName
      : `${accountName}.com`
    let url = `https://${accountName}/wp-json/wc/v3/products`
    while (page != 0) {
      console.log('page ---------->', page)
      const response = await axios.get(url, {
        headers: {
          Authorization: 'Basic ' + token
        },
        params: {
          after: formattedStartDate,
          before: formattedEndDate,
          per_page: perPage,
          page: page
        }
      })

      const data = response.data
      console.log('data ---------->', data?.legnth)
      listings.push(...data)
      await pushDataWooCommerce(
        data,
        marketplaceId,
        accountName,
        userId,
        addQuantity
      )
      if (data?.length < perPage) {
        page = 0
      } else {
        page++
      }
    }

    return listings
  } catch (err) {
    console.log('error', err)
  }
}

async function pushDataWooCommerce (
  data,
  marketplaceId,
  accountName,
  userId,
  token,
  addQuantity
) {
  try {
    const cskus = []
    const iskus = []

    await Promise.all(
      data.map(async item => {
        // console.log('Processing product:', item)
        const currency = await extractCurrencyCode(item?.price_html || '')
        //NOTE -  Handle product with variations
        if (item?.variations?.length) {
          const { success, variations } = await fetchProductVariations(
            accountName,
            token,
            item.id
          )
          if (success) {
            for (const variation of variations) {
              await processProduct(
                variation,
                item,
                currency,
                marketplaceId,
                accountName,
                userId,
                cskus
              )
            }
          } else {
            console.log('Error fetching variations for product:', item.id)
          }
        } else {
          //NOTE - Simple product or other types
          await processProduct(
            item,
            null,
            currency,
            marketplaceId,
            accountName,
            userId,
            cskus
          )
        }
        //NOTE - Check for existing ISKU
        const existingIsku = await isku.findOne({
          where: { isku: item?.sku, userId: userId, accountName: accountName }
        })
        if (existingIsku && addQuantity) {
          existingIsku.quantity += item?.stock_quantity || 0
          await existingIsku.save()
        } else if (!existingIsku) {
          iskus.push({
            isku: item?.sku,
            costPrice: item?.price,
            title: item?.name,
            images: item?.images.map(img => img?.src),
            quantity: item?.stock_quantity || 0,
            currency: currency || null,
            weight: item?.weight || 0,
            height:
              item?.dimensions?.height != '' ? item?.dimensions?.height : 0,
            depth:
              item?.dimensions?.length != '' ? item?.dimensions?.length : 0,
            width: item?.dimensions?.width != '' ? item?.dimensions?.width : 0,
            accountName: accountName,
            marketplaceId: marketplaceId,
            userId: userId
          })
        }
      })
    )

    console.log(iskus[0], iskus?.length, 'iskus')
    console.log(cskus[0], cskus?.length, 'cskus')
    // Batch insert for better performance
    if (iskus.length > 0) await isku.bulkCreate(iskus)
    if (cskus.length > 0) await csku.bulkCreate(cskus)
  } catch (err) {
    console.error(
      `Error pushing data: ${err.message} for account ${accountName}`
    )
    throw err
  }
}

// Helper function to process individual products or variations
async function processProduct (
  product,
  parentProduct,
  currency,
  marketplaceId,
  accountName,
  userId,
  cskus
) {
  //NOTE - If parentProduct exists, it means this is a variation
  const productId = parentProduct ? parentProduct?.id : product?.id
  const sku = product?.sku || product.id.toString()
  console.log(product?.attributes, 'product?.attributes')
  let specificOptions = null
  if (parentProduct) {
    specificOptions = parentProduct?.attributes
      ?.map(attr => {
        if (attr?.visible) {
          const variantOption = product?.attributes?.filter(
            att => att?.name == attr?.name
          )[0]
          if (variantOption) {
            return {
              name: variantOption.name,
              value: variantOption.option
            }
          } else {
            return {
              name: attr.name,
              value: attr.options
            }
          }
        }
      })
      .filter(Boolean)
  } else {
    specificOptions = product?.attributes
      ?.map(attr => {
        return {
          name: attr.name,
          value: attr?.options || attr.option
        }
      })
      .filter(Boolean)
  }

  console.log(specificOptions)
  //NOTE - Check for existing CSKU
  const existingCsku = await csku.findOne({
    where: { channelId: productId?.toString(), userId: userId }
  })

  const updatedProductData = {
    channelId: productId?.toString() || product?.parent_id,
    variantId: product?.id,
    isku: sku,
    price: product?.price || 0,
    mrp: product?.regular_price || 0,
    currency: currency || null,
    images: product?.images
      ? product?.images?.map(img => img?.src)
      : [product?.image?.src],
    description:
      product?.description !== ''
        ? product?.description || parentProduct?.description
        : parentProduct?.description ||
          parentProduct?.short_description ||
          product?.short_description ||
          null,
    collections: product?.categories || parentProduct?.categories || null,
    categoryId:
      product?.categories?.[0]?.id ||
      parentProduct?.categories?.[0]?.id ||
      null,
    categoryName:
      product?.categories?.[0]?.name ||
      parentProduct?.categories?.[0]?.name ||
      null,
    quantity: product.stock_quantity || 0,
    weight: product?.weight || 0,
    height:
      product?.dimensions?.height !== '' ? product?.dimensions?.height : 0,
    depth: product?.dimensions?.length !== '' ? product?.dimensions?.length : 0,
    width: product?.dimensions?.width !== '' ? product?.dimensions?.width : 0,
    itemSpecifics: null,
    variation: specificOptions,
    marketplaceId: marketplaceId,
    accountName: accountName,
    userId: userId,
    title: parentProduct?.name || product?.name,
    status: product?.status === 'publish' ? 'live' : product?.status || 'draft'
  }

  if (existingCsku) {
    // If CSKU exists, update it
    await csku.update(updatedProductData, {
      where: { id: existingCsku.id }
    })
  } else {
    // If CSKU doesn't exist, create a new entry
    cskus.push(updatedProductData)
  }
}

function extractCurrencyCode (htmlString) {
  // Map currency symbols to their respective ISO currency codes
  const currencySymbols = {
    '₹': 'INR', // Indian Rupee
    $: 'USD', // US Dollar
    '€': 'EUR', // Euro
    '£': 'GBP', // British Pound
    '¥': 'JPY', // Japanese Yen
    A$: 'AUD', // Australian Dollar
    C$: 'CAD', // Canadian Dollar
    '₣': 'CHF', // Swiss Franc
    '₩': 'KRW', // South Korean Won
    '₽': 'RUB', // Russian Ruble
    '฿': 'THB', // Thai Baht
    R$: 'BRL', // Brazilian Real
    '₺': 'TRY', // Turkish Lira
    'د.إ': 'AED', // UAE Dirham
    '₪': 'ILS', // Israeli Shekel
    '₦': 'NGN', // Nigerian Naira
    '₫': 'VND', // Vietnamese Dong
    '₴': 'UAH' // Ukrainian Hryvnia
  }

  // Map HTML entities to their respective currency symbols
  const entityMap = {
    '&#8377;': '₹', // Indian Rupee
    '&#36;': '$', // US Dollar
    '&#8364;': '€', // Euro
    '&#163;': '£', // British Pound
    '&#165;': '¥', // Japanese Yen
    '&#3647;': '฿', // Thai Baht
    '&#8361;': '₩', // South Korean Won
    '&#8372;': '₴', // Ukrainian Hryvnia
    '&#8355;': '₣', // Swiss Franc
    '&#8381;': '₽', // Russian Ruble
    '&#8362;': '₪', // Israeli Shekel
    '&#8356;': '₤', // Turkish Lira
    '&#8358;': '₦', // Nigerian Naira
    '&#8363;': '₫', // Vietnamese Dong
    '&#1605;&#1581;&#1583;&#1575;': 'د.إ', // UAE Dirham
    '&#82;': 'R$' // Brazilian Real
  }

  // Extract the currency entity from the HTML string
  const entityMatch = htmlString.match(/&#[0-9]+;/)
  if (!entityMatch) {
    return null // If no match is found
  }

  const entity = entityMatch[0] // Get the first matched entity

  // Convert HTML entity to currency symbol
  const symbol = entityMap[entity] || ''

  // Function to get currency code from the symbol
  const currencyCode = currencySymbols[symbol] || null

  return currencyCode
}

async function fetchProductVariations (accountName, token, productId) {
  try {
    const response = await axios.get(
      `https://${accountName}/wp-json/wc/v3/products/${productId}/variations`,
      {
        headers: {
          Authorization: 'Basic ' + token
        }
      }
    )
    return {
      success: true,
      variations: response.data
    }
  } catch (error) {
    return {
      success: false,
      variations: [],
      error: `Error Occured while fetching variations by product Id.`
    }
  }
}

exports.fetchWooCommerceCategories = async (token) => {
  try {
    const response = await axios.get(`https://${token?.dataValues?.accountName }.com/wp-json/wc/v3/products/categories`, {
      auth: {
        username: token?.dataValues?.client_id,
        password: token?.dataValues?.client_secret,
      },
    });

    // Map the response to only return id and name
    const categories = response?.data || [] ;
    for(const category of categories){
      const existingCategory = await Catalogue.findOne({
        where: { categoryId: category?.id },
      });
      if (!existingCategory) {
        // Create a new Category if it doesn't exist
        await Catalogue.create({
          userId: token?.dataValues?.userId,
          accountName: token?.dataValues?.accountName,
          marketPlace: token?.dataValues?.marketPlaceId,
          categoryId: category?.id,
          categoryName: category?.name,
        });
      } else {
        // Optionally update the existing Category if necessary
        await Catalogue.update(
          {
            categoryName: category?.name,
          },
          {
            where: { categoryId: category?.id },
          }
        );
      }
    }
    return {
      success : true,
      status : 200,
      data : categories
    };
  } catch (error) {
    console.error('An error occurred while fetching WooCommerce categories:', error);
    return {
      success : false,
      status : 500,
      data : null,
      message : error?.message || error?.response?.message
    };
  }
};

exports.getWooCommerceCategories = async (token) => {
  try {
    const categories = await Catalogue.findAll({
      where: {
        userId: token?.dataValues?.userId,
        accountName: token?.dataValues?.accountName,
        marketplaceId: token?.dataValues?.marketplaceId,
      },
      attributes: ['categoryId', 'categoryName'],
    });
    const result = categories?.map(category => ({
      categoryId: category?.categoryId || category?.dataValues?.categoryId,
      categoryName: category?.categoryName || category?.dataValues?.categoryName,
    }));
    return {
      success : true ,
      status : 200,
      data : result || []
    };
  } catch (error) {
    console.error('An error occurred while fetching collections:', error);
    return {
      success : false ,
      status : 500,
      data : [],
      message : error?.message || error?.response?.message
    };
  }
};

exports.createWooCommerceProduct = async (
  token,
  product,
  collectionIds,
  variations,
  groupProductId
) => {
  try {
    // Ensure account name is correctly formatted
    const accountName = token?.dataValues?.accountName?.includes('.com')
      ? token.dataValues.accountName
      : `${token.dataValues.accountName}.com`
    const authHeader = 'Basic ' + (token?.token || token?.dataValues?.token)
    const wooCommerceUrl = `https://${accountName}/wp-json/wc/v3/products`
    // Create base product payload
    const createProductPayload = {
      name: product?.title || '',
      regular_price: product?.price?.toString() || '0',
      description: product?.description || '',
      short_description: product?.shortDescription || '',
      sku: product?.isku ? String(product?.isku) : null,
      stock_quantity: Number(product?.quantity) || 0,
      images: product?.images?.map(url => ({ src: url })) || [],
      weight: String(product.packagingDetails?.weight?.value || 0) || null,
      categories: collectionIds,
      dimensions: {
        height:
          String(product.packagingDetails?.dimensions?.height || 0) || null,
        depth:
          String(product.packagingDetails?.dimensions?.length || 0) || null,
        width: String(product.packagingDetails?.dimensions?.width || 0) || null
      },
      type: variations?.length ? 'variable' : 'simple'
    }

    // Create record in the `csku` table
    const newCsku = await csku.create({
      isku: product?.isku,
      channelId: 'To Be Listed',
      price: Number(product?.price || 0),
      images: product?.images || [],
      title: product?.title || '',
      description: product?.description || '',
      quantity: Number(product?.quantity) || 0,
      height: Number(product.packagingDetails?.dimensions?.height || 0) || null,
      depth: Number(product.packagingDetails?.dimensions?.length || 0) || null,
      width: Number(product.packagingDetails?.dimensions?.width || 0) || null,
      weight: Number(product.packagingDetails?.weight?.value || 0) || null,
      status: 'under review',
      marketplaceId: token?.dataValues?.marketplaceId || token?.marketplaceId,
      accountName: accountName,
      userId: token?.dataValues?.userId || token?.userId,
      groupProductId: groupProductId || null,
      collections: collectionIds || []
    })

    if (!newCsku) {
      console.log('Failed to create record in `csku`.')
      return
    }

    console.log('Record created successfully:', newCsku)

    try {
      // Send product creation request to WooCommerce API
      const response = await axios.post(wooCommerceUrl, createProductPayload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        }
      })

      const newProduct = response.data
      console.log('Product created successfully in WooCommerce:', newProduct)

      // Update `csku` record with WooCommerce product ID if needed
      await csku.update(
        { channelId: newProduct.id, status: 'live' },
        { where: { id: newCsku.id } }
      )

      // Handle variations if present
      if (variations?.length) {
        for (const variation of variations) {
          const variationPayload = {
            regular_price: String(variation.price || 0),
            sku: variation.isku || null,
            stock_quantity: Number(variation.quantity) || 0,
            image: variation.image ? { src: variation.image } : null,
            attributes: variation.options.map(option => ({
              name: option.name,
              option: option.value
            }))
          }

          try {
            const variationResponse = await axios.post(
              `${wooCommerceUrl}/${newProduct.id}/variations`,
              variationPayload,
              {
                headers: {
                  Authorization: authHeader,
                  'Content-Type': 'application/json'
                }
              }
            )
            console.log('Variation created:', variationResponse.data)
          } catch (variationError) {
            console.error(
              'Error creating variation:',
              variationError?.response?.data || variationError.message
            )
            await csku.update(
              {
                status: 'failed',
                errors: variationError?.response?.data || variationError.message
              },
              { where: { id: newCsku.id } }
            )
          }
        }
      }
    } catch (error) {
      console.error(
        'Error while creating the product in WooCommerce:',
        error?.response?.data || error.message
      )
      await csku.update(
        { status: 'failed', errors: error?.response?.data || error.message },
        { where: { id: newCsku.id } }
      )
    }
  } catch (error) {
    console.error(
      'An error occurred in createWooCommerceProduct:',
      error?.message || error
    )
  }
}

exports.updateWooCommerceProduct = async (
  token,
  product,
  collectionIds,
  variations
) => {
  try {
    // Ensure account name is correctly formatted
    const accountName = token?.dataValues?.accountName?.includes('.com')
      ? token.dataValues.accountName
      : `${token.dataValues.accountName}.com`

    // Construct the WooCommerce API URL
    const url = `https://${accountName}/wp-json/wc/v3/products/${product.dataValues.channelId}`

    // Prepare the base payload for the update request
    const payload = {
      id: product.dataValues.channelId,
      name: product.dataValues.title,
      sku: product.dataValues.isku,
      regular_price: product.price.toString(),
      weight: product.packagingDetails?.weight?.value
        ? String(product.packagingDetails.weight.value)
        : null,
      categories: collectionIds,
      dimensions: {
        height: product.packagingDetails?.dimensions?.height
          ? String(product.packagingDetails.dimensions.height)
          : null,
        depth: product.packagingDetails?.dimensions?.length
          ? String(product.packagingDetails.dimensions.length)
          : null,
        width: product.packagingDetails?.dimensions?.width
          ? String(product.packagingDetails.dimensions.width)
          : null
      }
    }

    // If variations are provided, add them to the payload
    if (variations && variations.length > 0) {
      payload.variations = variations.map(variation => ({
        id: variation.id, // Ensure you have the variation ID
        regular_price: variation.price.toString(),
        sku: variation.isku, // Assuming each variation has an SKU
        attributes: variation.attributes // Assuming variations have their own attributes
      }))
    }

    // Send the update request to WooCommerce
    const response = await axios.put(url, payload, {
      headers: {
        Authorization: 'Basic ' + token.token,
        'Content-Type': 'application/json'
      }
    })

    // Log the response data for debugging
    const data = response.data
    console.log('Product updated successfully:', data)
    return data
  } catch (err) {
    // Improved error logging
    console.error(
      'Error updating WooCommerce product:',
      err.response?.data || err.message || err
    )
    throw new Error('Failed to update WooCommerce product')
  }
}

// Function to update bulk quantity and price on WooCommerce
exports.updateWooCommerceBulkPriceAndQuantity = async (
  items,
  token,
  errorFile,
  successCounts,
  failedCounts
) => {
  const { consumerKey, consumerSecret } = token
  const accountName = token?.accountName?.includes('.com')
    ? token?.accountName
    : `${token?.accountName}.com`

  // Base URL for WooCommerce API
  const baseUrl = `https://${accountName}/wp-json/wc/v3/products`

  for (const item of items) {
    try {
      let productUrl
      // Check if the item has a variantId, indicating it is a product variation
      if (item?.variantId && item?.variantId != '') {
        // Construct the API URL for the product variation
        productUrl = `${baseUrl}/${item.channelId}/variations/${item.variantId}`
      } else {
        // Construct the API URL for the product (regular product)
        productUrl = `${baseUrl}/${item.channelId}`
      }

      // Payload to update product variation's price and stock quantity
      const payload = {
        regular_price: item.Price.toString(),
        stock_quantity: item.Quantity,
        manage_stock: true
      }
      // Make the PUT request to update product or variation
      const response = await axios.put(productUrl, payload, {
        auth: {
          username: consumerKey,
          password: consumerSecret
        },
        headers: {
          'Content-Type': 'application/json'
        }
      })
      console.log('response :>> ', response)
      console.log(
        `Price and quantity updated successfully for SKU: ${item.sku}, Product ID: ${item.channelId}`
      )
      successCounts++
    } catch (error) {
      failedCounts++

      const errorMessage = error.response ? error.response.data : error.message
      console.error(
        `Error updating SKU: ${item.sku}, Product ID: ${item.channelId}: ${errorMessage}`
      )

      // Log the error in the errorFile array
      errorFile.push({
        channelId: item?.channelId,
        variantId: item?.variantId || null,
        sku: item?.sku,
        price: item?.Price,
        quantity: item?.Quantity,
        error: errorMessage
      })
    }
  }
}

exports.generateExcelForWoocommerceBulkCreate = async (
  workbook,
  mainSheet,
  dropdownSheet,
  res
) => {
  const headers = {
    '*sku': '*sku',
    '*quantity': '*quantity',
    '*price': '*price',
    '*siteId': '*siteId',
    '*height': '*height',
    '*width': '*width',
    '*length': '*length',
    '*weight': '*weight',
    '*imageUrls': '*imageUrls',
    '*title': '*title',
    '*description': '*description'
  }

  // Setting headers
  const headerKeys = Object.keys(headers)
  headerKeys.forEach((header, index) => {
    try {
      const columnLetter = getColumnLetter(index)
      mainSheet.cell(`${columnLetter}1`).value(header)
    } catch (error) {
      console.error(`Error setting header for column ${index}:`, error)
    }
  })

  let currentColumnIndex = headerKeys.length
  let dropdownCurrentRow = 2
  const excelBuffer = await workbook.outputAsync()
  res.setHeader('Content-Length', excelBuffer.length)
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader('Content-Disposition', `attachment; filename=data.xlsx`)
  res.send(excelBuffer)
}

function getColumnLetter (index) {
  let columnLetter = ''
  while (index >= 0) {
    columnLetter = String.fromCharCode((index % 26) + 65) + columnLetter
    index = Math.floor(index / 26) - 1
  }
  return columnLetter
}
