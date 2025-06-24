const Product = require("../../models/product");
const UniqueProduct = require("../../models/uniqueProduct");
const ProductKeyword = require("../../models/productKeyword");

//NOTE - custome function to evaluate product age based on the age of the product is coming
exports.evaluateProductAge = async ({
  projectId,
  keyword,
  domain,
  limit,
  ageOfTheProduct,
}) => {
  try {
    //NOTE - check product exist or not
    const product = await Product.findOne({
      where: { PUID: keyword },
    });
    // NOTE - if product found then check the age of the product
    if (product) {
      ProductKeyword.create({
        projectId,
        productId: product.id,
        puid: keyword,
        marketplace: domain,
        scrapingCount: limit,
      });
      const productId = product.id;
      //NOTE - check product details in unique product table
      const productDetails = await UniqueProduct.findOne({
        where: { productId },
      });

      if (productDetails) {
        const currentDate = new Date();
        const createdAtDate = new Date(product.createdAt);
        //NOTE: Calculate the time difference in milliseconds
        const timeDifference = currentDate - createdAtDate;
        //NOTE: Calculate the number of days
        const daysDifference = timeDifference / (1000 * 3600 * 24);

        if (daysDifference > ageOfTheProduct) {
          //NOTE: Product is more than 3 days old
          return { productExist: true, hasRecentAge: false };
        } else {
          //NOTE: Product is not more than 3 days old
          return { productExist: true, hasRecentAge: true };
        }
      }
    } else {
      console.log("Product not found, create new product");
      //NOTE: Product not found, create new product
      return { productExist: false, hasRecentAge: false };
    }
  } catch (error) {
    console.log("error", error);
    //NOTE You can throw a new error with a custom message
    throw new Error("An error occurred while checking the age of the product.");
  }
};
