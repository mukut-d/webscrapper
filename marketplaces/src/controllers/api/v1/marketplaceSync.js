const Tokens = require('../../../models/tokens');
const csku = require('../../../models/csku');
const { Op } = require('sequelize');
const logErrorToCsku = require('./errorLogger');

const MARKETPLACE_CONFIG = {
  7: {
    name: 'eBay',
    updateFunction: async (skus, token, userId) => {
      const { bulkUpdateEbayPriceAndQuantity } = require('../../../marketplaceapis/ebay/catalogue');

      let successCounts = 0;
      let failedCounts = 0;
      const errorFile = [];

      try {

        await bulkUpdateEbayPriceAndQuantity(skus, token, errorFile, successCounts, failedCounts);


        if (errorFile.length > 0) {
          for (const error of errorFile) {
            const failedSku = skus.find(s => s.isku === error.isku);
            if (failedSku) {
              await logErrorToCsku(
                userId,
                failedSku.sku,
                failedSku.variantId,
                failedSku.databaseQuantity,
                failedSku.Quantity,
                failedSku.Price,
                failedSku.Currency,
                error.message || 'Update failed',
                error.code || 'EBAY_UPDATE_ERROR',
                {
                  apiError: error,
                  updateType: 'bulkUpdate',
                  timestamp: new Date()
                },
                failedSku.channelId
              );
            }
          }
        }

        return {
          success: failedCounts === 0,
          successCount: successCounts,
          failedCount: failedCounts,
          errors: errorFile
        };
      } catch (error) {
        throw error;
      }
    },
    formatData: (sku, quantity) => ({
      channelId: sku.channelId,
      sku: sku.isku.trim(),
      Quantity: sku.quantity > 0 ? 1 : 0,
      databaseQuantity:sku.quantity,
      Price: sku.price,
      Currency: sku.currency,
      variantId: sku.variantId
    })
  },

  18: {
    name: 'Walmart',
    updateFunction: async (skus, token, userId) => {
      const { bulkUpdateWalmartPriceAndQuantity } = require('../../../marketplaceapis/walmart/catalogue');

      let successCounts = 0;
      let failedCounts = 0;
      const errorFile = [];

      try {
        await bulkUpdateWalmartPriceAndQuantity(skus, token, errorFile, successCounts, failedCounts);

        if (errorFile.length > 0) {
          for (const error of errorFile) {
            const failedSku = skus.find(s => s.isku === error.isku);
            if (failedSku) {
              await logErrorToCsku(
                userId,
                failedSku.isku,
                failedSku.variantId,
                failedSku.originalQuantity,
                failedSku.Quantity,
                failedSku.Price,
                failedSku.Currency,
                error.message || 'Update failed',
                error.code || 'EBAY_UPDATE_ERROR',
                {
                  apiError: error,
                  updateType: 'bulkUpdate',
                  timestamp: new Date()
                },
                failedSku.channelId
              );
            }
          }
        }

        return {
          success: failedCounts === 0,
          successCount: successCounts,
          failedCount: failedCounts,
          errors: errorFile
        };
      } catch (error) {
        throw error;
      }
    },
    formatData: (sku, quantity) => ({
      channelId: sku.channelId,
      sku: sku.isku.trim(),
      variantId: sku.variantId,
      Currency: sku.currency,
      Price: sku.price,
      Quantity: quantity
    })
  },
  10: {
    name: 'Shopify',
    updateFunction: async (skus, token, userId) => {
      const { updateShopifyBulkPriceAndQuantity } = require('../../../marketplaceapis/shopify/catalogue');
      let successCounts = 0;
      let failedCounts = 0;
      const errorFile = [];

      try {
        await updateShopifyBulkPriceAndQuantity(
          skus,
          token,
          errorFile,
          successCounts,
          failedCounts
        );


        if (errorFile.length > 0) {
          for (const error of errorFile) {
            const failedSku = skus.find(s => s.isku === error.isku);
            if (failedSku) {
              await logErrorToCsku(
                userId,
                failedSku.isku,
                failedSku.variantId,
                failedSku.originalQuantity,
                failedSku.Quantity,
                failedSku.Price,
                failedSku.Currency,
                error.message || 'Update failed',
                error.code || 'EBAY_UPDATE_ERROR',
                {
                  apiError: error,
                  updateType: 'bulkUpdate',
                  timestamp: new Date()
                },
                failedSku.channelId
              );
            }
          }
        }

        return {
          success: failedCounts === 0,
          successCount: successCounts,
          failedCount: failedCounts,
          errors: errorFile
        };
      } catch (error) {
        throw error;
      }
    },
    formatData: (sku, quantity) => ({
      channelId: sku.channelId,
      sku: sku.isku.trim(),
      Quantity: quantity,
      Price: sku.price,
      Currency: sku.currency || '',
      variantId: sku.variantId || ''
    })
  },

  17: {
    name: 'WooCommerce',
    updateFunction: async (skus, token, userId) => {
      const { updateWooCommerceBulkPriceAndQuantity } = require('../marketplaceapis/woocommerce/catalogue');
      const connectDB = require('./database/db');

      let successCounts = 0;
      let failedCounts = 0;
      const errorFile = [];

      try {
        await connectDB();

        await updateWooCommerceBulkPriceAndQuantity(
          skus,
          token,
          errorFile,
          successCounts,
          failedCounts
        );
        if (errorFile.length > 0) {
          for (const error of errorFile) {
            const failedSku = skus.find(s => s.isku === error.isku);
            if (failedSku) {
              await logErrorToCsku(
                userId,
                failedSku.isku,
                failedSku.variantId,
                failedSku.originalQuantity,
                failedSku.Quantity,
                failedSku.Price,
                failedSku.Currency,
                error.message || 'Update failed',
                error.code || 'EBAY_UPDATE_ERROR',
                {
                  apiError: error,
                  updateType: 'bulkUpdate',
                  timestamp: new Date()
                },
                failedSku.channelId
              );
            }
          }
        }

        return {
          success: failedCounts === 0,
          successCount: successCounts,
          failedCount: failedCounts,
          errors: errorFile
        };
      } catch (error) {
        throw error;
      }
    },
    formatData: (sku, quantity) => ({
      channelId: sku.channelId,
      isku: sku.isku.trim(),
      Quantity: quantity,
      Price: sku.price,
      Currency: sku.currency,
      variantId: sku.variantId || '',
    })
  }

};

async function getTokenFromDB(userId, marketplaceId,accountName) {
  try {
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
      attributes: ['token', 'lastTokenRefreshDate', 'refreshToken','id','accountName'],
    });
    return token;
  } catch (error) {
    console.error(`Error fetching token for marketplace ${marketplaceId}:`, error.message);
    throw error;
  }
}

async function getRelatedMarketplaceSKUs(ISKU, ignoreChannelId) {
  try {
    const cleanISKU = ISKU.trim();
    console.log(`Fetching related marketplace SKUs for ISKU: ${cleanISKU}`);

    const skus = await csku.findAll({
      where: {
        isku: {
          [Op.or]: [cleanISKU, `${cleanISKU}\n`, `${cleanISKU}\r\n`]
        },
        channelId: {
          [Op.ne]: ignoreChannelId
        }
      },
      attributes: [
        'id',
        'channelId',
        'isku',
        'quantity',
        'marketplaceId',
        'userId',
        'price',
        'variantId',
        'currency',
        'accountName'
      ],
      raw: true
    });

    const cleanedSkus = skus.map(sku => ({
      ...sku,
      isku: sku.isku.trim(),
      originalQuantity: sku.quantity
    }));

    console.log(skus,"skus");

    console.log(`Found ${cleanedSkus.length} related SKUs for ISKU: ${cleanISKU}`);
    return cleanedSkus;
  } catch (error) {
    console.error('Error fetching related marketplace SKUs:', error.message);
    throw error;
  }
}


async function updateLocalCSKU(ISKU, record, lineQuantity) {
  try {
    const cleanISKU = ISKU.trim();
    const currentQuantity = parseInt(record.quantity) || 0;
    const marketplaceName = MARKETPLACE_CONFIG[record.marketplaceId]?.name || 'Unknown';

    console.log(`Updating local CSKU for ISKU: ${cleanISKU}`);
    console.log(`Marketplace: ${marketplaceName}, Current Quantity: ${currentQuantity}, Line Quantity: ${lineQuantity}`);

    const newQuantity = Math.max(0, currentQuantity - lineQuantity);

    await csku.update(
      { quantity: newQuantity },
      {
        where: {
          id: record.id
        }
      }
    );

    return newQuantity;
  } catch (error) {
    console.error('Error updating local CSKU:', error.message);
    throw error;
  }
}

async function syncMarketplaceQuantities(ISKU, currentQuantity, userId, sourceMarketplace, lineQuantity, accountName, ignoreChannelId) {
  try {
    const cleanISKU = ISKU.trim();
    console.log(`Starting sync for ISKU: ${cleanISKU} with quantity: ${currentQuantity}`);
    console.log(`Source marketplace: ${sourceMarketplace}, Line Quantity: ${lineQuantity}`);

    // Fetch related SKUs, including accountName
    const relatedSKUs = await getRelatedMarketplaceSKUs(cleanISKU, ignoreChannelId);
    //console.log('Related SKUs:', relatedSKUs);


    const skusByMarketplace = relatedSKUs.reduce((acc, sku) => {
      const marketplaceId = sku.marketplaceId.toString();
      if (!acc[marketplaceId]) {
        acc[marketplaceId] = [];
      }
      acc[marketplaceId].push(sku);
      return acc;
    }, {});

    const results = [];

    const newActualQuantity = Math.max(0, parseInt(currentQuantity) - parseInt(lineQuantity));
    console.log('New actual quantity:', newActualQuantity);

    for (const [marketplaceId, skus] of Object.entries(skusByMarketplace)) {
      if (!MARKETPLACE_CONFIG[marketplaceId]) {
        //console.log(`Skipping unknown marketplace ID: ${marketplaceId}`);
        continue;
      }

      // Format quantity based on marketplace
      const formattedSkus = skus.map(sku => {
        const ebayQuantity = marketplaceId === '7' ? (newActualQuantity > 0 ? 1 : 0) : newActualQuantity;
        return {
          ...sku,
          marketplaceId: parseInt(marketplaceId),
          quantity: newActualQuantity, 
          formattedQuantity: ebayQuantity, 
          originalQuantity: parseInt(sku.quantity)
        };
      });

      try {
        for (const sku of formattedSkus) {
          await updateLocalCSKU(sku.isku, sku, lineQuantity);
        }

        const skuAccountName = skus[0]?.accountName || accountName; 

        const result = await updateMarketplace(
          formattedSkus,
          parseInt(marketplaceId),
          userId,
          lineQuantity,
          skuAccountName
        );

        results.push({
          marketplace: MARKETPLACE_CONFIG[marketplaceId].name,
          success: true,
          result,
          newQuantity: newActualQuantity,
          marketplaceQuantity: marketplaceId === '7' ? (newActualQuantity > 0 ? 1 : 0) : newActualQuantity
        });
      } catch (error) {
        console.error(`Error updating ${MARKETPLACE_CONFIG[marketplaceId].name}:`, error);
        results.push({
          marketplace: MARKETPLACE_CONFIG[marketplaceId].name,
          success: false,
          error: error.message,
          attemptedQuantity: newActualQuantity
        });
      }
    }

    console.log(`Sync completed for ISKU: ${cleanISKU}`);
    console.log('Results:', results);
    console.log('New quantity after sync:', newActualQuantity);

    return {
      success: results.every(r => r.success),
      message: `Sync completed for ISKU: ${cleanISKU}`,
      results,
      newQuantity: newActualQuantity
    };
  } catch (error) {
    console.error('Error syncing quantities:', error.message);
    return {
      success: false,
      message: `Failed to sync ISKU: ${ISKU}`,
      error: error.message
    };
  }
}


async function updateLocalCSKU(ISKU, record, lineQuantity) {
  try {
    const cleanISKU = ISKU.trim();
    const currentQuantity = parseInt(record.originalQuantity) || 0;
    const marketplaceName = MARKETPLACE_CONFIG[record.marketplaceId]?.name || 'Unknown';

    console.log(`Updating local CSKU for ISKU: ${cleanISKU}`);
    console.log(`Marketplace: ${marketplaceName}, Current Quantity: ${currentQuantity}, Line Quantity: ${lineQuantity}`);

    const newQuantity = Math.max(0, currentQuantity - lineQuantity);
    console.log(`New quantity for ${marketplaceName}: ${newQuantity}`);

    await csku.update(
      { quantity: newQuantity },
      {
        where: {
          id: record.id
        }
      }
    );

    return newQuantity;
  } catch (error) {
    console.error('Error updating local CSKU:', error.message);
    throw error;
  }
}

async function updateMarketplace(skus, marketplaceId, userId, lineQuantity, accountName) {
  console.log(`Updating marketplace ${accountName} for marketplace ID: ${marketplaceId}`);
  try {
    if (!skus || skus.length === 0) return;


    const marketplaceConfig = MARKETPLACE_CONFIG[marketplaceId];

    if (!marketplaceConfig) {
      throw new Error(`No configuration found for marketplace ID: ${marketplaceId}`);
    }

    const tokenData = await getTokenFromDB(userId, marketplaceId, accountName);
    if (!tokenData) {
      throw new Error(`No token found for marketplace ${marketplaceConfig.name}`);
    }
    const updatedSkus = skus.map(sku => {
      const formattedData = marketplaceConfig.formatData(sku, sku.formattedQuantity);
      console.log(`Formatting ${marketplaceConfig.name} SKU:`, {
        sku: sku.isku,
        originalQuantity: sku.originalQuantity,
        newQuantity: sku.quantity,
        marketplaceQuantity: sku.formattedQuantity
      });
      return formattedData;
    });

    console.log(`${marketplaceConfig.name} update data:`, updatedSkus);

    const result = await marketplaceConfig.updateFunction(updatedSkus, tokenData?.dataValues, userId);

    console.log(`${marketplaceConfig.name} update results:`, {
      success: result.success,
      successCount: result.successCount,
      failedCount: result.failedCount
    });

    return {
      success: result.failedCount === 0,
      successCount: result.successCount,
      failedCount: result.failedCount,
      errors: result.errors
    };
  } catch (error) {
    console.error(`Error updating marketplace ${marketplaceId}:`, error);
    throw error;
  }
}

module.exports = syncMarketplaceQuantities;