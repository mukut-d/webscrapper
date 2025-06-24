const UniqueProduct = require("../../models/uniqueProduct");
const { ProductAgeBasedOnDomain } = require("../../utils/enum");

//ANCHOR - check age from domain dynamically
const getProductAgeForDomain = (domain) => {
  //NOTE: Convert the domain to uppercase to handle case-insensitivity
  const uppercasedDomain = domain.toUpperCase().replace(".", "_");

  //NOTE: Check if the domain is present in the enum, otherwise return a default value
  return ProductAgeBasedOnDomain[uppercasedDomain] || 1;
};

//NOTE - custome function to evaluate product age based on the age of the product is coming
exports.evaluationForProductAge = async ({ product }) => {
  try {
    const { id, domain } = product;
    //NOTE - check product details in unique product table
    const productDetails = await UniqueProduct.findOne({
      where: { productId: id },
    });

    console.log("productDetails", productDetails);

    //ANCHOR - check age from domain dynamically
    const checkAgeBasedOnDomain = getProductAgeForDomain(domain);

    console.log("checkAgeBasedOnDomain", checkAgeBasedOnDomain);

    if (productDetails) {
      const currentDate = new Date();
      const createdAtDate = new Date(product.createdAt);
      //NOTE: Calculate the time difference in milliseconds
      const timeDifference = currentDate - createdAtDate;
      //NOTE: Calculate the number of days
      const daysDifference = timeDifference / (1000 * 3600 * 24);

      if (daysDifference > checkAgeBasedOnDomain) {
        //NOTE: Product is more the specific days define for the domain
        return { hasRecentAge: false };
      } else {
        //NOTE: Product is not more then specific days define for the domain
        return { hasRecentAge: true };
      }
    } else {
      return { hasRecentAge: false };
    }
  } catch (error) {
    //NOTE You can throw a new error with a custom message
    console.log("error", error.message);
    throw new Error("An error occurred while checking the age of the product.");
  }
};
