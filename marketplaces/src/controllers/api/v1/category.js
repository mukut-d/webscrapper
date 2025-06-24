const {
  getEbayStoreCategories
} = require('../../../marketplaceapis/ebay/catalogue')
const {
  getShopifyCollections,
  fetchShopifyCustomCollections
} = require('../../../marketplaceapis/shopify/catalogue')
const {
  getWalmartCategories
} = require('../../../marketplaceapis/walmart/category')
const {
  fetchWooCommerceCategories,
  getWooCommerceCategories
} = require('../../../marketplaceapis/woocommerce/catalogue')
const Category = require('../../../models/category')
const Marketplace = require('../../../models/marketplace')
const Tokens = require('../../../models/tokens') 
const axios = require('axios')

exports.getMarketPlaceCategories = async (req, res) => {
  try {
    const { userId, accountNames, marketPlaceId } = req.body

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId
      }
    })

    if (!marketPlace) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'MarketPlace not found'
      })
    }
    let categories = {}
    let categoryResponse = null ;
    for (let i = 0; i < accountNames?.length; i++) {
      const accountName = accountNames[i] ;
      const token = await Tokens.findOne({
        where: {
          userId: userId,
          accountName: accountName,
          marketPlaceId: marketPlaceId
        }
      })
      if (!token) {
        categories[accountName] = []
        continue
      }
      if (marketPlace?.url?.includes('ebay')) {
      } else if (marketPlace?.url?.includes('shopify')) {
        categoryResponse = await getShopifyCollections(token)
      } else if (marketPlace.url?.includes('woocommerce')) {
        categoryResponse = await getWooCommerceCategories(token)
      } else if (marketPlace.url?.includes('walmart')) {
        return await getWalmartCategories(res)
      } else if (marketPlace.url?.includes('sellerflex')) {
      }

      categories[accountName] = categoryResponse?.success ? categoryResponse?.data : [];
    }

    return res.status(200).json({
      success: true,
      status: 200,
      data: categories
    })
  } catch (err) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.fetchMarketPlaceCategories = async (req, res) => {
  try {
    const { userId, accountName, marketPlaceId } = req.body

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketPlaceId
      }
    })
    if (!marketPlace) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'MarketPlace not found'
      })
    }

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        accountName: accountName,
        marketPlaceId: marketPlaceId
      }
    })
    if (!marketPlace) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: 'Token not found'
      })
    }
    let categoriesResponse = null
    if (marketPlace?.url?.includes('ebay')) {
    } else if (marketPlace?.url?.includes('shopify')) {
      categoriesResponse = await fetchShopifyCustomCollections(token)
    } else if (marketPlace.url?.includes('woocommerce')) {
      categoriesResponse = await fetchWooCommerceCategories(token)
    } else if (marketPlace.url?.includes('walmart')) {
      return await getWalmartCategories(res)
    } else if (marketPlace.url?.includes('sellerflex')) {
    }
    if (categoriesResponse) {
      return res.status(categoriesResponse?.status).json({
        success: categoriesResponse?.success,
        status: categoriesResponse?.status,
        data: categoriesResponse?.data,
        message: categoriesResponse?.message
      })
    }
  } catch (err) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message
    })
  }
}

exports.getRootSubcategories = async (req, res) => {
  try {
    const allRootSubcategories = await Category.findAll({
      where: {
        parentCategoryId: null
      }
    })
    if (allRootSubcategories.length === 0) {
      return res.status(404).json({ message: 'No root subcategories found' })
    }
    return res.status(200).json({
      allRootSubcategories
      // rootSubcategories: allRootSubcategories,
    })
  } catch (error) {
    return res.status(400).json({
      status: false,
      message: error.message
    })
  }
}
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id, {
      include: [
        {
          model: Category,
          as: 'children',
          foreignKey: 'parentCategoryId'
        }
      ]
    })
    if (category == null) {
      return res.status(404).json({ message: 'Cannot find category' })
    }
    return res.status(200).json({
      category
      // categoryById: category,
    })
  } catch (error) {
    return res.status(400).json({
      status: false,
      message: error.message
    })
  }
}
exports.FetchStoreCategories = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName } = req.body

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId
      }
    })

    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: 'Market Place does not exist.'
      })
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName
      }
    })

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token not found for this account'
      })
    }

    if (marketPlace.url.includes('ebay')) {
      const categoriesResponse = await fetchEbayStoreCategories(token)

      if (!categoriesResponse.success) {
        return res.status(categoriesResponse.statusCode).json({
          success: false,
          message: categoriesResponse.message
        })
      }

      return res.status(200).json({
        success: true,
        data: categoriesResponse.data,
        message: 'Store Categories Retrieved Successfully.'
      })
    }

    return res.status(400).json({
      success: false,
      message: 'Unsupported marketplace'
    })
  } catch (error) {
    console.error('Error in FetchStoreCategories:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
}
exports.getStoreCategories = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName } = req.body

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId
      }
    })

    if (!marketPlace) {
      return res.status(400).json({
        success: false,
        message: 'Market Place does not exist.'
      })
    }

    const token = await Tokens.findOne({
      where: {
        userId,
        accountName
      }
    })

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token not found for this account'
      })
    }

    if (marketPlace.url.includes('ebay')) {
      const categoriesResponse = await getEbayStoreCategories(
        userId,
        accountName
      )
      if (!categoriesResponse.success) {
        return res.status(categoriesResponse.statusCode).json({
          success: false,
          message: categoriesResponse.message
        })
      }
      return res.status(200).json({
        success: true,
        data: categoriesResponse.data,
        message: 'Store Categories Retrieved Successfully.'
      })
    }

    return res.status(400).json({
      success: false,
      message: 'Unsupported marketplace'
    })
  } catch (error) {
    console.error('Error in FetchStoreCategories:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
}
