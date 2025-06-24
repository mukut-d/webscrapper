const { Op } = require('sequelize');
const csku = require('../../../models/csku');
const Tokens = require('../../../models/tokens');
const { bulkUpdateEbayPriceAndQuantity } = require('../../../marketplaceapis/ebay/catalogue');
const { apiCallLog } = require("../../../helper/apiCallLog");
const iskuModel = require('../../../models/isku');

class EbayRestock {

  static async getEbayToken(userId, accountName) {
    try {
      const token = await Tokens.findOne({
        where: {
          userId: userId,
          accountName: accountName,
          marketPlaceId: 7,
        },
        raw: true
      });

      if (!token) {
        throw new Error(`eBay token not found for user ${userId} and account ${accountName}`);
      }

      return token;
    } catch (error) {
      console.error('Error fetching eBay token:', error.message);
      throw error;
    }
  }

  static async getEbaySkus(userId, iskus = null) {
    try {
      const whereClause = {
        marketplaceId: 7,
        userId: userId,
        status: {
          [Op.in]: ['active', 'live']
        }
      };

      if (iskus && iskus.length > 0) {
        whereClause.isku = {
          [Op.in]: iskus.map(isku => isku.dataValues.isku.trim())
        };
      }

      const skus = await csku.findAll({
        where: whereClause,
        attributes: [
          'id',
          'channelId',
          'isku',
          'quantity',
          'price',
          'currency',
          'variantId',
          'accountName',
          "userId"
        ],
        raw: true
      });

      if (!skus) {
        throw new Error('No SKUs found');
      }

      return skus;
    } catch (error) {
      console.error('Error fetching eBay SKUs:', error.message);
      throw error;
    }
  }

  static formatSkusForEbay(skus, maxQuantityThreshold, orderedQuantity, inventoryQuantity, type) {
    if (!skus || skus.length === 0) {
      throw new Error('No SKUs to format');
    }
    console.log('maxQuantityThreshold', maxQuantityThreshold);
    console.log(skus[0].quantity);
    console.log(orderedQuantity);
    return skus.map(sku => {

      let updateQuantity = 0;

      if (type === 'orderCron') {

        let quantityDiff = Number(inventoryQuantity) - Number(orderedQuantity);
        let updateQuantity = 0;

        if (maxQuantityThreshold > 0) {
          if (quantityDiff < maxQuantityThreshold) {
            // If the quantity difference is less than the max threshold, use the quantity difference
            updateQuantity = quantityDiff;
          } else if (Math.max(0, sku.quantity - orderedQuantity) > maxQuantityThreshold) {
            // If the individual SKU quantity minus the ordered quantity is greater than the max threshold, use the max threshold
            updateQuantity = maxQuantityThreshold;
          } else if (Math.max(0, sku.quantity - orderedQuantity) < maxQuantityThreshold && quantityDiff > maxQuantityThreshold) {
            // If the individual SKU quantity minus the ordered quantity is less than the max threshold and the quantity difference is greater than the max threshold, use the max threshold
            updateQuantity = maxQuantityThreshold;
          }
        } else {
          // If the max threshold is 0, use the individual SKU quantity minus the ordered quantity
          updateQuantity = Math.max(0, sku.quantity - orderedQuantity);
        }

      } else if (type === 'quantityUpdate') {
        console.log("In Here")
        if (maxQuantityThreshold > 0 && orderedQuantity > maxQuantityThreshold) {
          updateQuantity = maxQuantityThreshold;
        } else {
          updateQuantity = orderedQuantity;
        }
      }

      return {
        channelId: sku.channelId,
        isku: sku.isku.trim(),
        quantity: updateQuantity,
        Price: sku.price,
        Currency: sku.currency,
        variantId: sku.variantId,
        accountName: sku.accountName,
        userId: sku.userId
      }
    });
  }

  static async updateEbayInventory(userId, iskus = null, orderedQuantity = 0, type) {
    try {
      console.log(`Starting eBay inventory update for user ${userId}${iskus ? ` and SKUs: ${iskus.join(', ')}` : ''}`);

      if (!iskus || iskus.length === 0) {
        console.log('No SKUs provided to update');
        await apiCallLog("bulkUpdateEbayPriceAndQuantity", "bulkUpdateEbayPriceAndQuantity", "updateEbayInventory", { iskus: 'BULK_UPDATE' }, {}, { error: 'No SKUs provided to update' }, "error");
        throw new Error('No SKUs provided to update');
      }

      const isku = await iskuModel.findOne({
        where: {
          isku: iskus[0].dataValues.isku,
          userId: userId
        }
      });

      const inventoryQuantity = isku.dataValues.quantity;

      // Get SKUs from database
      const skus = await this.getEbaySkus(userId, iskus);

      if (!skus || skus.length === 0) {
        console.log('No eBay SKUs found to update');
        await apiCallLog("bulkUpdateEbayPriceAndQuantity", "bulkUpdateEbayPriceAndQuantity", "updateEbayInventory", { iskus: iskus.join(',') }, {}, { error: 'No eBay SKUs found to update' }, "error");
        throw new Error('No eBay SKUs found to update');
      }

      // Group SKUs by accountName
      const skusByAccount = skus.reduce((acc, sku) => {
        if (!acc[sku.accountName]) {
          acc[sku.accountName] = [];
        }
        acc[sku.accountName].push(sku);
        return acc;
      }, {});

      let successCount = 0;
      let failedCount = 0;
      const errorFile = [];

      const results = [];

      // Iterate over each accountName group
      for (const accountName in skusByAccount) {
        const accountSkus = skusByAccount[accountName];

        // Get eBay token for the account
        const token = await this.getEbayToken(userId, accountName);

        if (!token || !token.token) {
          await apiCallLog("bulkUpdateEbayPriceAndQuantity", "bulkUpdateEbayPriceAndQuantity", "updateEbayInventory", { accountName }, {}, { error: 'Invalid eBay token' }, "error");
          console.log(`Invalid eBay token data for account ${accountName}`);
          continue;
        }

        const maxQuantityThreshold = token.max_quantity_threshold || 0;

        const formattedSkus = this.formatSkusForEbay(accountSkus, maxQuantityThreshold, orderedQuantity, inventoryQuantity, type);

        if (!formattedSkus || formattedSkus.length === 0) {
          console.log(`No SKUs found to update for account ${accountName}`);
          continue;
        }

        results.push(...formattedSkus);

      }

      // const result = {
      //   success: failedCount === 0,
      //   successCount,
      //   failedCount,
      //   errors: errorFile
      // };

      console.log('eBay inventory update completed:', results);
      return results;

    } catch (error) {
      console.error('Error updating eBay inventory:', error);

      await apiCallLog("bulkUpdateEbayPriceAndQuantity", "bulkUpdateEbayPriceAndQuantity", "updateEbayInventory", { iskus: iskus ? iskus.join(',') : 'BULK_UPDATE' }, {}, { error: error.message }, "error");

      // Log unexpected errors properly

      throw error;
    }
  }

  static async EbayRestock(accountName, iskus, userId) {
    try {
      if (!accountName || !iskus || iskus.length === 0) {
        throw new Error('Invalid input: accountName or iskus missing');
      }

      if (!userId) {
        throw new Error('Invalid input: userId missing');
      }

      return await this.updateEbayInventory(userId, iskus);
    } catch (error) {
      console.error('Error restocking eBay inventory:', error.message);
      throw error;
    }
  }
}

module.exports = EbayRestock;