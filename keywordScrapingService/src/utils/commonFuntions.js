exports.generateRankDetails = (bestSellersRank) => {
  //NOTE: Check if the array has values
  if (bestSellersRank.length > 0) {
    //NOTE: Declare an object to store the details
    let rankDetailsObject = {};

    //NOTE: Loop through the objects (up to four or the length of the array)
    for (let i = 0; i < Math.min(4, bestSellersRank.length); i++) {
      const rankKey = "bestSellerRank";
      const categoryKey = "bestSellerRankCategory";
      const linkKey = "bestSellerRankLink";

      //NOTE: Extract values from the current object
      const { rank, category, link } = bestSellersRank[i];

      //NOTE: Replace numeric suffix with corresponding word representation
      const suffix = i + 1 > 4 ? "Four" : ["One", "Two", "Three", "Four"][i];

      //NOTE: Assign values to the rankDetailsObject with the desired key names
      rankDetailsObject[`${rankKey}${suffix}`] = rank;
      rankDetailsObject[`${categoryKey}${suffix}`] = category;
      rankDetailsObject[`${linkKey}${suffix}`] = link;
    }

    //NOTE: Return the rankDetailsObject
    return rankDetailsObject;
  } else {
    //NOTE: Return an empty object if the array is empty
    return {};
  }
};
