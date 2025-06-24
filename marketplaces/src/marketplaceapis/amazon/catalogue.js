const axios = require("axios");

exports.createAmazonCatalogue = async (
  destinationSite,
  destination_account,
  isku,
  payload
) => {
  const url = `https://sellingpartnerapi-${
    destinationSite?.localeValue
  }.amazon.com/listings/2021-08-01/items/${
    destination_account?.sellerId
  }/${encodeURIComponent(isku)}`;
  try {
    const response = await axios.put(url, payload, {
      headers: {
        "x-amz-access-token": destination_account.token,
        "Content-Type": "application/json",
      },
      params: {
        marketplaceIds: destinationSite?.globalId,
      },
    });
    if (response.data?.issues.length > 0) {
      const data = response?.data.issues;
      return data;
    }
    console.log("Success:", response.data);
  } catch (error) {
    console.error("Error:", error);
    console.error("Error:", error.response.data.errors);
  }
};

exports.fetchAmazonListings = async (
  accountName,
  token,
  marketplaceId,
  userId,
  addQuantity,
  type
) => {
  try {
    
  } catch (error) {
    console.log(error);
    return error;
  }
};
