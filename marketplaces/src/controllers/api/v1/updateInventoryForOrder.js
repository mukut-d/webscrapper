const csku  = require('../../../models/csku');
const  isku  = require('../../../models/isku');
const sequelize = require('../../../database/config');
const { Op } = require('sequelize');

async function updateInventoryForOrder(orderItems, userId, accountName) {
  try {
    for (const item of orderItems) {
      // Find all related CSKUs for the ordered item
      const relatedCskus = await csku.findAll({
        where: {
          [Op.or]: [
            { channelId: item.legacyItemId.toString() },
            { isku: item.sku }
          ]
        }
      });

      // Update quantity for each related CSKU
      for (const cskuRecord of relatedCskus) {
        const newQuantity = Math.max(0, cskuRecord.quantity - item.quantity);
        
        // Update CSKU quantity
        await csku.update(
          { quantity: newQuantity },
          { 
            where: { 
              id: cskuRecord.id 
            }
          }
        );

        // Find and update related ISKU
        const iskuRecord = await isku.findOne({
          where: { 
            isku: cskuRecord.isku,
            userId: userId,
            accountName: accountName
          }
        });

        if (iskuRecord) {
          const newIskuQuantity = Math.max(0, iskuRecord.quantity - item.quantity);
          await isku.update(
            { quantity: newIskuQuantity },
            { 
              where: { 
                id: iskuRecord.id 
              }
            }
          );

          // Sync quantities across marketplaces
          try {
            await syncEbayAndWalmartQuantity(
              cskuRecord.isku,
              newIskuQuantity,
              userId,
              'eBay'
            );
          } catch (syncError) {
            console.error(`Error syncing quantities for ISKU ${cskuRecord.isku}:`, syncError);
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
}

module.exports = { updateInventoryForOrder };