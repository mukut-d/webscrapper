const UniqueProduct = require("../../../models/uniqueProduct");

// This function filters products based on conditions.
// It returns the filtered products if any, or an error message if none match the filters.


async function combinedFilter(req, res) {
  console.log("Combined filter controller");

  let rank = req.body.rank;
  let category = req.body.category;
  let existingProducts = await UniqueProduct.findAll({});
  let filteredProducts = [];

  existingProducts.forEach((product) => {
    let totalRatings = product.dataValues.totalRatings;
    let price = product.dataValues.price;

    let rankCondition =
      (rank === "Easier to rank" && totalRatings >= 0 && totalRatings <= 100) ||
      (rank === "Moderate to rank" &&
        totalRatings > 100 &&
        totalRatings <= 500) ||
      (rank === "Difficult to rank" &&
        totalRatings > 500 &&
        totalRatings <= 1000) ||
      (rank === "Very difficult to rank" && totalRatings > 1000);

    let priceCondition =
      (category === "Mass Product" && price >= 1 && price <= 20) ||
      (category === "Premium - 1" && price > 20 && price <= 50) ||
      (category === "Premium - 2" && price > 50 && price <= 100) ||
      (category === "Premium - 3" && price > 100);

    if (rank && category) {
      if (rankCondition && priceCondition) {
        filteredProducts.push(product);
      }
    } else if (rank) {
      if (rankCondition) {
        filteredProducts.push(product);
      }
    } else if (category) {
      if (priceCondition) {
        filteredProducts.push(product);
      }
    }
  });

  if (filteredProducts.length > 0) {
    return res.status(200).json({
      allProducts: filteredProducts,
      products: filteredProducts,
    });
  } else {
    return res.status(400).json({
      status: false,
      message: "No products found with the given filters",
    });
  }
}

module.exports = {
  combinedFilter,
};