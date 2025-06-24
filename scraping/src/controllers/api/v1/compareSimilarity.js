const fuzz = require("fuzzball");
const UniqueProduct = require("../../../models/uniqueProduct");
const Category = require("../../../../../marketplaces/src/models/category");
const cron = require("node-cron");

async function compareSimilarity(req, res) {
  console.log("Hello from similarity");
  const products = await UniqueProduct.findAll({});
  const category = await Category.findAll({});

  async function compareCategories() {
    const products = await UniqueProduct.findAll({});
    const categories = await Category.findAll({});

    // Create a map of categories by name
    const categoryMap = new Map(
      categories.map((category) => [category.name, category])
    );

    let count = 0; // Counter for products with matching categories
    let comparedCount = 0; // Counter for products compared

    // Iterate over all products
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      comparedCount++; // Increment the compared counter

      // Iterate over the product's categories from last to first, excluding the last one
      for (let j = product.categories.length - 2; j >= 0; j--) {
        // Check if the category is an object, if so, get the category name from the object
        let productCategoryName;

        if (typeof product.categories[j] === "object") {
          if (product.categories[j].category) {
            productCategoryName = product.categories[j].category;
          } else if (product.categories[j].name) {
            productCategoryName = product.categories[j].name;
          }
        } else {
          try {
            const parsed = JSON.parse(product.categories[j]);
            productCategoryName = parsed.category || parsed.name;
          } catch (e) {
            productCategoryName = product.categories[j];
          }
        }

        let highestFuzzScore = 0;
        let bestMatchCategory = null;

        // Iterate over all categories in the categoryMap
        for (const [categoryName, category] of categoryMap.entries()) {
          // Calculate the fuzz score for the current category
          const fuzzScore = fuzz.token_sort_ratio(
            productCategoryName,
            categoryName
          );

          // If the fuzz score is higher than the highest so far, update the highest score and best match
          if (fuzzScore > highestFuzzScore) {
            highestFuzzScore = fuzzScore;
            bestMatchCategory = category;
          }
        }

        // If a matching category is found, log the category name and id, and the product category name
        if (bestMatchCategory) {
          console.log(
            `Best match category found: ${bestMatchCategory.name} (id: ${bestMatchCategory.id}), matched with product category: ${productCategoryName} with score: ${highestFuzzScore}`
          );
          count++; // Increment the counter
          break; // Stop the loop as we've found a match
        } else {
          // Log the product and its categories if no match was found
          console.log(
            `No match found for product with id: ${product.id} and category: ${productCategoryName}`
          );
          console.log(
            `Product categories: ${JSON.stringify(product.categories, null, 2)}`
          );
        }
      }
    }

    console.log(`Number of products with matching categories: ${count}`);
    console.log(`Number of products compared: ${comparedCount}`);
  }

  compareCategories();
}

// cron.schedule("* * * * *", compareSimilarity);

module.exports = { compareSimilarity };

// {
//   "categories": [
//     {"category": "Home"},
//     {"category": "Beauty and Grooming"},
//     {"category": "Bath & Shower"},
//     {"category": "Bath Essentials"},
//     {"category": "Body Wash"},
//     {"category": "PALMOLIVE Body Wash"}
//   ]
// }

// {
//   "categories": [
//     {
//       "link": "https://www.amazon.in/Home-Kitchen/b/ref=dp_bc_aui_C_1?ie=UTF8&node=976442031",
//       "name": "Home & Kitchen",
//       "category_id": "976442031"
//     },
//     {
//       "link": "https://www.amazon.in/Heating-Cooling/b/ref=dp_bc_aui_C_2?ie=UTF8&node=2083423031",
//       "name": "Heating, Cooling & Air Quality",
//       "category_id": "2083423031"
//     },
//     {
//       "link": "https://www.amazon.in/Air-Conditioners/b/ref=dp_bc_aui_C_3?ie=UTF8&node=3474656031",
//       "name": "Air Conditioners",
//       "category_id": "3474656031"
//     },
//     {
//       "link": "https://www.amazon.in/b/ref=dp_bc_aui_C_4?ie=UTF8&node=10545602031",
//       "name": "Split-System Air Conditioners",
//       "category_id": "10545602031"
//     }
//   ]
// }
