const { Op, Sequelize, json } = require('sequelize')
const Marketplace = require('../../../models/marketplace')
const Geosite = require('../../../models/geosite')
const Tokens = require('../../../models/tokens')
const Catalogue = require('../../../models/catalogue')
const ebay = require('ebay-api')
const moment = require('moment')
const csvtojson = require('csvtojson')
const { sequelize } = require('../../../database/config')
const EbayAuthToken = require('ebay-oauth-nodejs-client')
const eBayApi = require('ebay-api')
const csku = require('../../../models/csku')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios')
const path = require('path')
const os = require('os')
const xls = require('xlsx')
const xlsxPopulate = require('xlsx-populate')
const fs = require('fs')
const {
  createShopifyCatalogue,
  UpdateShopifyCatalogue,
  generateExcelForShopifyBulkCreate,
  bulkCreateShopifyCatalogue,
  bulkUpdateShopifyCatalogue
} = require('../../../marketplaceapis/shopify/catalogue')

const { configQueue } = require("../../../cron-jobs/config-cron/queueListener");
const xlsx = require('xlsx');
const User = require('../../../models/user')
const newRelic = require('newrelic')

const {
  createWalmartCatalogue,
  bulkCreateAndUpdateWalmartCatalogue,
  generateExcelForWalmartBulkCreate,
  updateWalmartCatalogue
} = require('../../../marketplaceapis/walmart/catalogue')
const {
  createEtsyCatalogue, updateEtsyCatalogue
} = require('../../../marketplaceapis/etsy/catalogue')
const { HistoryStatus, BulkActionType } = require('../../../utils/enum')
const BulkUploadHistory = require('../../../models/bulkUploadHistory')
const { uploadToS3 } = require('../../../helper/uploadFile')
const generateExcelFile = require('../../../helper/generateExcelFile')
const sendUpdateReportEmail = require('../../../helper/sendUpdateReportEmail')
const {
  getCategoryAttributes
} = require('../../../marketplaceapis/walmart/category')
const {
  upsertEbayProduct,
  generateExcelForEbayBulkCreate,
  bulkCreateAndUpdateEbayCatalogue
} = require('../../../marketplaceapis/ebay/catalogue')
const {
  createWooCommerceProduct,
  updateWooCommerceProduct
} = require('../../../marketplaceapis/woocommerce/catalogue')
const ebayAuthToken = new EbayAuthToken({
  clientId: process.env.APP_ID,
  clientSecret: process.env.CERT_ID
})

const scopes = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.reputation',
  'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
  'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.stores',
  'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
]

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      'PRODUCTION',
      token?.dataValues?.refreshToken,
      scopes
    )

    if (JSON.parse(newToken).error) {
      token.status = 'inactive'
      await token.save()

      const nodemailer = require('nodemailer')

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password
        }
      })

      const userData = await User.findOne({
        where: { id: token.dataValues.userId }
      })

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: 'aditya@mergekart.com', // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: 'Token Expired!',
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`
        }

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error)
            console.log(error)
          }
          console.log('Message sent: %s', info.messageId)
        })
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`)
      console.log(newToken.error)
      throw newToken.error
    }
    // console.log(newToken, "newToken");
    // console.log(token.dataValues.refreshToken, "refreshToken");
    const accessToken = JSON.parse(newToken)
    eBay.OAuth2.setCredentials(accessToken.access_token)
    token.token = accessToken.access_token
    token.lastTokenRefreshDate = moment()
      .add(5, 'hours')
      .add(30, 'minutes')
      .toISOString()
    await token.save()
  } catch (error) {
    console.log(error)
    throw error
  }
}

exports.GetCskusFromIsku = async (req, res) => {
  try {
    const { isku, userId } = req.params;

    if (!isku || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    const decodedIsku = decodeURIComponent(isku);

    const products = await csku.findAll({
      where: {
        isku:decodedIsku, userId, status: {
          [Op.ne]: 'completed'
        }
      },
      attributes: [
        'channelId',
        'accountName',
        'marketplaceId',
        'siteId',
        'quantity',
        'price'
      ],
      raw: true
    });

    return res.status(200).json({
      success: true,
      data: products,
      message: 'Products fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    const err = {
      error: error.message,
    }

    newRelic.recordCustomEvent(`Error_while_fetching_products: `, err)
    console.log(error)

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
}

exports.CreateMarketPlaceProduct = async (req, res) => {
  const functionName = 'CreateMarketPlaceProduct'
  try {
    const {
      userId,
      marketPlaceId,
      accountName,
      siteIds,
      isku,
      policies,
      product,
      categoryAspects,
      collectionIds,
      variants,
      options,
      videoLink,
      compatibility,
      aPlusDescription,
      status,
      storeCategories,
      gpsrDetails
    } = req.body

    // Validate required fields
    if (!userId || !marketPlaceId || !accountName || !isku) {
      return res
        .status(400)
        .json({ error: 'Missing required fields in request body' })
    }

    // Fetch marketplace details
    let marketPlace
    try {
      marketPlace = await Marketplace.findOne({ where: { id: marketPlaceId } })
      if (!marketPlace) {
        return res.status(404).json({ error: 'MarketPlace not found' })
      }
    } catch (error) {
      console.error('Error fetching marketplace:', error)
      return res
        .status(500)
        .json({ success: false, message: 'Error fetching the marketplace.' })
    }

    // Fetch tokens for accounts
    let tokens
    try {
      const tokenPromises = accountName.map(account =>
        Tokens.findOne({
          where: {
            userId,
            marketPlaceId,
            accountName: account
          }
        })
      )
      tokens = await Promise.all(tokenPromises)
      if (tokens.some(token => !token)) {
        return res
          .status(404)
          .json({ error: 'Token for one or more accounts not found.' })
      }
    } catch (error) {
      console.error('Error fetching tokens:', error)
      return res
        .status(500)
        .json({ success: false, message: 'Error fetching tokens.' })
    }

    let listings = []
    let errors = []
    const groupProductId = uuidv4()
    // Return response with errors and listings
    // res.status(200).json({
    //   success: true,
    //   message: 'Product processing started.'
    // })

    //NOTE  Process products based on the marketplace
    if (marketPlace.url.includes('ebay')) {
      await Promise.all(
        accountName?.map(async (account, accountIndex) => {
          await Promise.all(
            siteIds?.map(async siteId => {
              try {
                if (status == "draft") {

                  await csku.create({
                    values: {
                      channelId: "To Be Listed",
                      isku: product?.isku,
                      title: product?.title,
                      description: product?.description,
                      price: product?.price,
                      mrp: product?.mrp || product?.price,
                      quantity: product?.quantity,
                      sellerProfile: policies[account][siteId],
                      categoryId: storeCategories?.[account]?.id,
                      categoryName: storeCategories?.[account]?.name,
                      itemSpecifics: Array.isArray(categoryAspects[siteId]?.aspects || []) ? (categoryAspects[siteId]?.aspects || []) : [categoryAspects[siteId]?.aspects],
                      itemCompatibility: compatibility,
                      length: product?.length,
                      width: product?.width,
                      depth: product?.height,
                      unit: product?.unit,
                      weight: product?.weight,
                      weightUnit: product?.weightUnit,
                      images: product.images,
                      videos: videoLink,
                      accountName: account,
                      siteId: siteId,
                      userId: userId,
                      marketplaceId: marketPlaceId,
                      groupProductId: groupProductId,
                      status: "draft",
                      aPlusDescription: aPlusDescription,
                    }
                  })

                } else {
                  const token = tokens.find(
                    tkn => tkn.dataValues.accountName === account
                  )
                  const listing = await upsertEbayProduct(
                    userId,
                    account,
                    marketPlaceId,
                    token?.dataValues,
                    siteId,
                    product,
                    policies[account][siteId],
                    storeCategories?.[account] || null,
                    {
                      id: categoryAspects[siteId]?.category?.id,
                      name: categoryAspects[siteId]?.category?.name
                    },
                    categoryAspects[siteId]?.aspects,
                    variants,
                    groupProductId,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    videoLink,
                    compatibility,
                    aPlusDescription,
                    gpsrDetails
                  )
                  if (listing && listing?.channelId) {
                    // Return a message with the itemId
                    return res.status(200).json({
                      success: true,
                      message: `eBay product listed successfully with ItemID: ${listing?.channelId}`,
                      itemId: listing?.channelId
                    });
                  } else {
                    return res.status(500).json({
                      success: false,
                      message: 'Failed to list eBay product.'
                    });
                  }
                }
              } catch (error) {
                console.error(
                  `Error upserting eBay product for account: ${account}, siteId: ${siteId}`,
                  error
                )
                errors.push({ account, siteId, error: error.message })
              }
            })
          )
        })
      )
    } else if (marketPlace.url.includes('shopify')) {
      for (let i = 0; i < accountName?.length; i++) {
        const token = tokens.find(
          tkn => tkn?.dataValues?.accountName === accountName[i]
        )
        try {
          await createShopifyCatalogue(
            token,
            product,
            collectionIds,
            variants,
            options,
            groupProductId
          )
        } catch (error) {
          console.error(
            `Error creating Shopify catalogue for account: ${accountName[i]}`,
            error
          )
          errors.push({ account: accountName[i], error: error.message })
        }
      }
    } else if (marketPlace?.url?.includes('walmart')) {
      for (let i = 0; i < accountName?.length; i++) {
        const token = tokens.find(
          tkn => tkn?.dataValues?.accountName === accountName[i]
        )
        try {
          await createWalmartCatalogue(
            accountName[i],
            product,
            categoryAspects,
            token,
            marketPlaceId,
            userId
          )
        } catch (error) {
          console.error(
            `Error creating Walmart catalogue for account: ${accountName[i]}`,
            error
          )
          errors.push({ account: accountName[i], error: error.message })
        }
      }
    } else if (marketPlace?.url.includes('woocommerce')) {
      for (let i = 0; i < accountName?.length; i++) {
        const token = tokens.find(
          tkn => tkn?.dataValues?.accountName === accountName[i]
        )
        try {
          await createWooCommerceProduct(
            token,
            product,
            collectionIds,
            variants,
            groupProductId
          )
        } catch (error) {
          console.error(
            `Error creating WooCommerce product for account: ${accountName[i]}`,
            error
          )
          errors.push({ account: accountName[i], error: error.message })
        }
      }
    } else if (marketPlace.url?.includes('etsy')) {
      if (
        !req.body ||
        !req.body.title ||
        !req.body.description ||
        !req.body.isku ||
        !req.body.policies ||
        !req.body.price ||
        !req.body.quantity ||
        !req.body.who_made ||
        !req.body.when_made ||
        !req.body.tags ||
        !req.body.material ||
        !req.body.category
      ) {
        return res
          .status(400)
          .json({ error: 'Missing required fields in request body' })
      }
      const listing = await createEtsyCatalogue(
        accountName,
        // quantity,
        // tokens,
        marketPlaceId,
        userId,
        req.body
      )
      listings = listing;
      return res.json({
        ...listings
      })
    }
  } catch (error) {
    console.error(
      'An unexpected error occurred in CreateProductMarketPlace:',
      error
    )
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred.',
        error: error.message
      })
    }
  }
}
exports.UpdateMarketPlaceProduct = async (req, res) => {
  const functionName = 'UpdateMarketPlaceProduct'
  try {
    const { id } = req.params
    const {
      userId,
      marketPlaceId,
      accountName,
      siteId,
      product,
      policies,
      storeCategory,
      primaryCategory,
      categoryAspects,
      variants,
      options,
      collectionIds
    } = req.body

    const errors = []
    const groupProductId = uuidv4()

    // Check if CSKU data exists
    const cskuExist = await csku.findByPk(id)
    if (!cskuExist) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'CSKU data not found.'
      })
    }

    // Retrieve marketplace and token information
    const marketplace = await Marketplace.findOne({
      where: { id: marketPlaceId }
    })
    const token = await Tokens.findOne({
      where: { marketPlaceId, userId, accountName }
    })

    // Check if token or marketplace was found
    if (!token || !marketplace) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: !token
          ? 'Token for this user not found.'
          : 'Marketplace not found.'
      })
    }

    // Log readiness to list the product
    res.status(200).json({
      success: true,
      status: 200,
      message: 'Product is going for Update'
    })

    // Upsert product based on the marketplace
    try {
      if (marketplace.url.includes('ebay')) {
        await upsertEbayProduct(
          userId,
          accountName,
          marketPlaceId,
          token.dataValues,
          siteId,
          product,
          policies,
          storeCategory,
          primaryCategory,
          categoryAspects,
          variants,
          groupProductId,
          cskuExist.dataValues.id
        )
      } else if (marketplace.url.includes('shopify')) {
        await UpdateShopifyCatalogue(
          token,
          product,
          collectionIds,
          variants,
          options
        )
      } else if (marketplace.url.includes('woocommerce')) {
        await updateWooCommerceProduct(token, product, collectionIds, variants)
      } else if (marketplace.url.includes('walmart')) {
        await updateWalmartCatalogue(
          userId,
          accountName,
          marketPlaceId,
          token,
          product,
          categoryAspects,
          cskuExist
        )
      } else if (marketplace.url.includes('etsy')) {
        await updateEtsyCatalogue(
          userId,
          accountName,
          marketPlaceId,
          token,
          product,
          cskuExist.dataValues.channelId
        )
      }
    } catch (error) {
      console.error(
        `Error processing marketplace update for ${marketplace.url}:`,
        error
      )
      errors.push({ error: error.message })
      // Optionally, return the errors collected during the processing
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Error updating marketplace product.',
        errors
      })
    }
  } catch (error) {
    console.error(`${functionName} encountered an error:`, error)
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message
    })
  }
}
exports.generateExcel = async (req, res) => {
  try {
    const { marketPlaceId, accountName, userId, siteId, categoryId } = req.query

    const marketPlace = await Marketplace.findOne({
      where: { id: marketPlaceId }
    })

    const token = await Tokens.findOne({
      where: { userId, marketPlaceId, accountName }
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'Token for this user not found.'
      })
    }
    const site = await Geosite.findOne({
      where: {
        siteId
      }
    })
    if (!site) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'geosite not found'
      })
    }
    const category = await Catalogue.findOne({
      where: {
        categoryId
      }
    })
    if (!category) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'category not found'
      })
    }
    const workbook = await xlsxPopulate.fromBlankAsync()
    const mainSheet = workbook.sheet(0).name('MainSheet')
    const dropdownSheet = workbook.addSheet('DropdownList')
    if (marketPlace.url?.includes('ebay')) {
      return await generateExcelForEbayBulkCreate(
        accountName,
        userId,
        site,
        category,
        workbook,
        mainSheet,
        dropdownSheet,
        res
      )
    } else if (marketPlace.url?.includes('woocommerce')) {
      return await generateExcelForWooCommerce(
        workbook,
        mainSheet,
        dropdownSheet,
        res
      )
    } else if (marketPlace.url?.includes('walmart')) {
      return await generateExcelForWalmartBulkCreate(
        categoryId,
        workbook,
        mainSheet,
        dropdownSheet,
        res
      )
    } else if (marketPlace?.url?.includes('shopify')) {
      return await generateExcelForShopifyBulkCreate(
        accountName,
        userId,
        marketPlaceId,
        workbook,
        mainSheet,
        dropdownSheet,
        res
      )
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported marketplace.'
      })
    }
  } catch (error) {
    console.error(error)
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
      fullError: error.toString()
    })
  }
}
exports.CreateBulkProductMarketPlace = async (req, res) => {
  try {
    let {
      userId,
      accountName,
      marketPlaceId,
      merchantLocationKey,
      category,
      siteId
    } = req.body
    category = JSON.parse(category)
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'File not uploaded' })
    }
    if (
      req.file.mimetype !==
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid file type' })
    }
    if (!userId || !accountName || !marketPlaceId || !category) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing Required Fields' })
    }
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName
      }
    })
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token not found'
      })
    }
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId
      }
    })
    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: 'MarketPlace not found'
      })
    }

    if (marketPlace?.url?.includes('ebay')) {
      if (!siteId) {
        return res.status(400).json({
          success: false,
          message: 'Site ID is required for eBay'
        })
      }
    }
    const buffer = Buffer.from(req.file.buffer)
    const workbook = xls.read(buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    // Convert worksheet to JSON
    let jsonData = xls.utils.sheet_to_json(worksheet, { defval: null })
    jsonData = Array.isArray(jsonData) ? jsonData : [jsonData]
    let groupProductId = uuidv4()
    //NOTE - upload original file to S3 Bucket
    const originalFilePath = await uploadToS3({
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buffer,
      originalname: `failed-report/${groupProductId}-${req?.file?.originalname}`
    })
    console.log(originalFilePath, 'originalFilePath')
    // NOTE - add it to bulk upload history
    const bulkUploadHistory = await BulkUploadHistory.create({
      actionType: BulkActionType.CREATE_CATALOGUE,
      userId,
      sourceAccountName: accountName,
      marketplaceId: Number(marketPlaceId),
      merchantLocationKey,
      categoryData: category,
      siteId,
      uploadedFilePath: originalFilePath || null,
      totalItems: jsonData?.length || 0,
      status: HistoryStatus.INPROGRESS
    })
    const newHistory = bulkUploadHistory?.dataValues
    let errorFile = []
    let successCounts = 0
    let failedCounts = 0
    const rowsWithEmptyFields = []
    const rowsWithoutEmptyFields = []
    let transformedRow = {}
    let rows = []
    jsonData.forEach(row => {
      let hasEmptyField = false
      for (const key in row) {
        if (key.startsWith('*') && (!row[key] || row[key] === '')) {
          hasEmptyField = true
          rows.push(key)
        }
        const newKey = key.replace(/^\*|'/g, '')
        if (row[key]) {
          transformedRow[newKey] = row[key]
        }

        if (hasEmptyField) {
          rowsWithEmptyFields.push(transformedRow)
        } else {
          rowsWithoutEmptyFields.push(transformedRow)
        }
      }
    })
    const transformKeys = data => {
      return data?.map(row => {
        const newRow = {}
        for (const key in row) {
          const newKey = key.startsWith('*') ? key.slice(1) : key
          newRow[newKey] = row[key]
        }
        return newRow
      })
    }
    jsonData = transformKeys(jsonData)
    res.status(200).json({
      success: true,
      message: 'Products have been started uploading',
      errors: null
    })
    if (marketPlace?.url?.includes('ebay')) {
      const bulkRes = await bulkCreateAndUpdateEbayCatalogue(
        userId,
        accountName,
        marketPlaceId,
        token,
        category,
        siteId,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    } else if (marketPlace.url.includes('woocommerce')) {
    } else if (marketPlace?.url?.includes('walmart')) {
      const bulkRes = await bulkCreateAndUpdateWalmartCatalogue(
        accountName,
        token,
        marketPlaceId,
        userId,
        category?.name,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    } else if (marketPlace?.url?.includes('shopify')) {
      const bulkRes = await bulkCreateShopifyCatalogue(
        userId,
        accountName,
        marketPlaceId,
        token,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    }
    let errorFileLocation = null
    if (errorFile?.length) {
      console.log('successCounts :>> ', successCounts)
      console.log('failedCounts :>> ', failedCounts)
      //NOTE - make a dynamic excel file path
      const fileName = `${groupProductId}-${userId}-${accountName}-create-failed-${new Date().getTime()}-data.xlsx`
      const excelFilePath = path.join(__dirname, fileName)
      const res = await generateExcelFile(errorFile, excelFilePath, [
        ...Object.keys(errorFile[0])
      ])
      console.log('res :>> ', res)
      if (res && fs.existsSync(excelFilePath)) {
        //NOTE -  Read the Excel file as a buffer
        const fileBuffer = fs.readFileSync(excelFilePath)
        //NOTE -  Upload the Excel File to S3
        try {
          errorFileLocation = await uploadToS3({
            mimetype:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: fileBuffer,
            originalname: `failed-report/${fileName}`
          })
          fs.unlink(excelFilePath, err => {
            if (err) {
              console.error('Error deleting file:', err)
            }
            console.log('File deleted successfully')
          })
          console.log(`Error file generated at ${errorFileLocation}`)
        } catch (error) {
          console.error('Error uploading file to S3:', error)
        }
      }
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: 'aditya@mergekart.com',
        cc: 'pallavisolday12@gmail.com',
        subject: `CSKU Bulk Create Failed Products Report ${new Date()}`,
        text: 'Hello, please find the attached file.'
      }
      if (errorFileLocation) {
        mailOptions.attachments = [
          {
            filename: fileName,
            path: errorFileLocation
          }
        ]
      } else {
        mailOptions.text = `Error While generating Error Excel File.`
      }
      await sendUpdateReportEmail(mailOptions)
    }
    await BulkUploadHistory.update(
      {
        errorFilePath: errorFileLocation,
        status: HistoryStatus.COMPLETED,
        failedItems: failedCounts,
        successItems: successCounts
      },
      { where: { id: newHistory?.id } }
    )
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}
exports.UpdateBulkProductMarketPlace = async (req, res) => {
  const functionName = 'UpdateBulkProductMarketPlace'
  try {
    let { userId, accountName, marketPlaceId, category, siteId } = req.body
    if (category) {
      category = JSON.parse(category)
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'File not uploaded' })
    }
    if (
      req.file.mimetype !==
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid file type' })
    }

    if (!userId || !accountName || !marketPlaceId) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing Required Fields' })
    }
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketPlaceId,
        accountName: accountName
      }
    })
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token not found'
      })
    }
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId
      }
    })
    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: 'MarketPlace not found'
      })
    }
    let site = null
    if (site) {
      site = await Geosite.findOne({
        where: {
          globalId: siteId
        }
      })
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        })
      }
    }

    const buffer = Buffer.from(req.file.buffer)
    const workbook = xls.read(buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    // Convert worksheet to JSON
    let jsonData = xls.utils.sheet_to_json(worksheet, { defval: null })
    jsonData = Array.isArray(jsonData) ? jsonData : [jsonData]
    // NOTE - upload original file to S3 Bucket
    const originalFilePath = await uploadToS3({
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buffer,
      originalname: `failed-report/${req?.file?.originalname
        }-${new Date().getTime()}`
    })
    console.log(originalFilePath, 'originalFilePath')
    // NOTE - add it to bulk upload history
    const bulkUploadHistory = await BulkUploadHistory.create({
      actionType: BulkActionType.UPDATE_CATALOGUE,
      userId,
      sourceAccountName: accountName,
      marketplaceId: Number(marketPlaceId),
      categoryData: category,
      siteId,
      uploadedFilePath: originalFilePath,
      totalItems: jsonData?.length || 0,
      status: HistoryStatus.INPROGRESS
    })
    const newHistory = bulkUploadHistory?.dataValues
    let errorFile = []
    let successCounts = 0
    let failedCounts = 0
    const rowsWithEmptyFields = []
    const rowsWithoutEmptyFields = []
    let transformedRow = {}
    let rows = []

    jsonData.forEach(row => {
      let hasEmptyField = false
      for (const key in row) {
        if (key.startsWith('*') && !row[key]) {
          hasEmptyField = true
          rows.push(key)
        }
        const newKey = key.replace(/^\*|'/g, '')
        if (row[key]) {
          transformedRow[newKey] = row[key]
        }

        if (hasEmptyField) {
          rowsWithEmptyFields.push(transformedRow)
        } else {
          rowsWithoutEmptyFields.push(transformedRow)
        }
      }
    })
    const transformKeys = data => {
      return data.map(row => {
        const newRow = {}
        for (const key in row) {
          const newKey = key.startsWith('*') ? key.slice(1) : key
          newRow[newKey] = row[key]
        }
        return newRow
      })
    }

    jsonData = transformKeys(jsonData)
    let groupProductId = uuidv4()
    res.status(200).json({
      success: true,
      message: 'Products have been started uploading',
      errors: null
    })
    if (marketPlace?.url?.includes('ebay')) {
      const bulkRes = await bulkCreateAndUpdateEbayCatalogue(
        userId,
        accountName,
        marketPlaceId,
        token,
        category,
        siteId,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    } else if (marketPlace?.url?.includes('shopify')) {
      const bulkRes = await bulkUpdateShopifyCatalogue(
        userId,
        accountName,
        marketPlaceId,
        token,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    } else if (marketPlace.url.includes('woocommerce')) {
    } else if (marketPlace.url.includes('walmart')) {
      const bulkRes = await bulkCreateAndUpdateWalmartCatalogue(
        accountName,
        token,
        marketPlaceId,
        userId,
        category?.name,
        jsonData,
        errorFile
      )
      if (!bulkRes?.success) {
        return res.status(bulkRes?.status || 404).json({
          success: false,
          message: bulkRes?.message
        })
      }
      successCounts = bulkRes?.successCount
      failedCounts = bulkRes?.failedCount
    }

    let errorFileLocation = null
    if (errorFile?.length) {
      console.log('successCounts :>> ', successCounts)
      console.log('failedCounts :>> ', failedCounts)
      // console.log(errorFile[0], 'error')
      //NOTE - make a dynamic excel file path
      const fileName = `${groupProductId}-${userId}-${accountName}-update-failed-${new Date().getTime()}-data.xlsx`
      const excelFilePath = path.join(__dirname, fileName)
      const res = await generateExcelFile(errorFile, excelFilePath, [
        ...Object.keys(errorFile[0])
      ])
      console.log('res :>> ', res)
      if (res && fs.existsSync(excelFilePath)) {
        //NOTE -  Read the Excel file as a buffer
        const fileBuffer = fs.readFileSync(excelFilePath)
        //NOTE -  Upload the Excel File to S3
        try {
          errorFileLocation = await uploadToS3({
            mimetype:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: fileBuffer,
            originalname: `failed-report/${fileName}`
          })
          fs.unlink(excelFilePath, err => {
            if (err) {
              console.error('Error deleting file:', err)
            }
            console.log('File deleted successfully')
          })
          console.log(`Error file generated at ${errorFileLocation}`)
        } catch (error) {
          console.error('Error uploading file to S3:', error)
        }
      }
      const mailOptions = {
        from: process.env.FROM_EMAIL,
        to: 'aditya@mergekart.com',
        cc: 'pallavisolday12@gmail.com',
        subject: `CSKU Bulk Update Failed Products Report ${new Date()}`,
        text: 'Hello, please find the attached file.'
      }
      if (errorFileLocation) {
        mailOptions.attachments = [
          {
            filename: fileName,
            path: errorFileLocation
          }
        ]
      } else {
        mailOptions.text = `Error While generating Error Excel File.`
      }
      await sendUpdateReportEmail(mailOptions)
    }

    await BulkUploadHistory.update(
      {
        errorFilePath: errorFileLocation,
        status: HistoryStatus.COMPLETED,
        failedItems: failedCounts,
        successItems: successCounts
      },
      { where: { id: newHistory?.id } }
    )
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}
exports.GetAspectsInventory = async (req, res) => {
  try {
    const { marketPlaceId, accountName, userId, category, categoryTreeIds } =
      req.body
    console.log("Category Tree Ids >> ", categoryTreeIds);
    console.log("Category >> ", category);
    console.log("Marketplace Id >> ", marketPlaceId);
    console.log("Account Name >> ", accountName);
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId
      }
    })
    let userTokens = []
    const tokenPromises = accountName.map(acc =>
      Tokens.findOne({
        where: {
          userId: userId,
          marketPlaceId: marketPlaceId,
          accountName: acc
        }
      })
    );

    userTokens = await Promise.all(tokenPromises);

    if (userTokens.some(token => !token)) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: 'Token for this user not found.'
      });
    }

    let aspectsData = {}
    if (marketPlace.url?.includes('ebay')) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        autoRefreshToken: true
      })
      eBay.OAuth2.setCredentials(
        userTokens[0]?.dataValues?.token || userTokens[0]?.token
      )
      let startdate = moment().add(5, 'hours').add(30, 'minutes')
      let tokenExpiresDate = moment(userTokens[0]?.lastTokenRefreshDate)
      let hoursDifference = startdate.diff(tokenExpiresDate, 'hours')

      if (hoursDifference > 2) {
        refreshToken(eBay, userTokens[0])
      }
      //NOTE - Fetch item aspects for each category ID under each category tree ID
      await Promise.all(
        categoryTreeIds?.map(async ({ siteId, globalId }) => {
          console.log(siteId, globalId, "siteid and global id-----------")
          try {
            const aspects =
              await eBay.commerce.taxonomy.getItemAspectsForCategory(
                siteId,
                category?.categoryId || category?.id
              )
            aspectsData[globalId] = {
              categoryId: {
                id: category?.categoryId || category?.id,
                name: category?.categoryName || category?.name
              },
              aspects: aspects?.aspects
            }
          } catch (error) {
            try {
              const categories =
                await eBay.commerce.taxonomy.getCategorySuggestions(
                  siteId,
                  category?.categoryName || category?.name
                )
              if (categories) {
                const aspects =
                  await eBay.commerce.taxonomy.getItemAspectsForCategory(
                    siteId,
                    categories?.categorySuggestions[0]?.category.categoryId
                  )
                aspectsData[globalId] = {
                  categoryId: {
                    id: categories?.categorySuggestions[0]?.category.categoryId,
                    name: categories?.categorySuggestions[0]?.category
                      .categoryName
                  },
                  aspects: aspects?.aspects
                }
              }
            } catch (error) {
              console.log(error, category?.categoryName, globalId)
            }
          }
        })
      )
      return res.status(200).json({
        success: true,
        status: 200,
        data: aspectsData
      })
    } else if (marketPlace?.url?.includes('walmart')) {
      try {
        const resData = await getCategoryAttributes(category, userTokens)
        if (resData?.success) {
          return res.status(200).json({
            success: true,
            status: 200,
            data: resData?.data
          })
        } else {
          return res.status(400).json({
            success: false,
            status: 400,
            message: res?.message || 'Failed to get Category Attributes'
          })
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          status: 500,
          message: error?.message || 'Unexpected Error Occured.error'
        })
      }
    } else if (marketPlace?.url?.includes('etsy')) {
      console.log("Category Id >> ", category?.categoryId);
      console.log("Category Name >> ", category);
      try {
        const taxonomyId = category?.categoryId || category?.id;
        const access_token = await refreshTokenEtsy(userTokens[0]?.dataValues);
        try {
          const response = await axios.get(`https://openapi.etsy.com/v3/application/buyer-taxonomy/nodes/${taxonomyId}/properties`, {
            headers: {
              'x-api-key': userTokens[0]?.dataValues.client_id,
              'Authorization': `Bearer ${access_token}`,
              "Content-Type": "application/json"
            }
          });
          aspectsData = {
            categoryId: {
              id: taxonomyId,
              name: category?.categoryName || category?.name
            },
            aspects: response.data.results
          };
          return res.status(200).json({
            success: true,
            status: 200,
            data: aspectsData
          });
        } catch (error) {
          console.error('Error fetching Etsy taxonomy properties:', error);
          throw error;
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          status: 500,
          message: error?.message || 'Unexpected Error Occurred.'
        });
      }
    }
  } catch (err) {
    console.log(err, 'error')
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
      fullError: err.toString()
    })
  }
}

const refreshTokenEtsy = async (token) => {
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
    const refreshedToken = token.token;
    return refreshedToken
    console.log("Token refreshed successfully.");
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};
exports.handleBulkCreateFromCustomFile = async (req, res) => {
  const { configId, userId, accountName, marketPlaceId } = req.body;
  const file = req.file; // File comes directly from the request via multer


  // Validate required parameters
  if (!configId || !userId || !accountName || !marketPlaceId || !file) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Missing required parameters (configId, userId, accountName, marketPlaceId, or file)",
    });
  }

  try {
    // Parse the file directly from the request buffer
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use the first sheet
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // Get rows as arrays

    // Get headers from the first row
    const headers = rows[0];
    const dataRows = rows.slice(1); // Skip header row

    if (dataRows.length === 0) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "No data found in the uploaded file",
      });
    }

    // Fetch the mapping for the account (assuming a mappings table/model exists)
    const mapping = await mappings.findOne({
      where: {
        accountName: accountName,
        userId: userId,
      },
    });

    if (!mapping) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "No mapping found for the specified account",
      });
    }

    const mappingData = mapping.data; // Assuming mapping.data contains the field mappings (e.g., { "column1": "field1" })

    // Convert each row to an object based on the mapping
    const products = dataRows.map((row) => {
      const product = {};

      // Map each column based on the mapping
      headers.forEach((header, index) => {
        const mappedField = mappingData[header] || header; // Use mapped field name or original header if no mapping
        product[mappedField] = row[index]; // Assign value directly, no special conditions
      });

      // Add required fields
      product.accountName = accountName;
      product.channelId = marketPlaceId; // Using marketPlaceId as channelId
      return product;
    });

    // Queue the job with the products array directly
    const jobData = {
      config: configId,
      batch_size: products.length,
      first_run: false,
      cskuData: products, // Pass the products array directly
    };

    const job = await configQueue.add(jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: `Successfully queued configuration ${configId} with ${products.length} products for processing`,
    });

  } catch (error) {
    console.error('Error in handleBulkCreateFromCustomFile:', error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: `Failed to process file: ${error.message}`,
    });
  }
};