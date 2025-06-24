const csku = require('../../../models/csku');

async function logErrorToCsku(userId, isku, variantId, originalQuantity, attemptedQuantity, price, currency, errorMessage, errorCode, errorDetails, channelId) {
  try {
    const errorData = {
      userId,
      isku,
      variantId,
      originalQuantity,
      attemptedQuantity,
      price,
      currency,
      errorMessage,
      errorCode,
      errorDetails
    };
    
    await csku.update(
      { errors: [errorData] },
      {
        where: {
          isku,
          channelId // Make sure channelId is included in the update condition
        }
      }
    );
  } catch (error) {
    console.error('Error logging error to csku:', error.message); // Log the error message
    throw error; // Rethrow the error for further handling if necessary
  }
}

module.exports = logErrorToCsku;
