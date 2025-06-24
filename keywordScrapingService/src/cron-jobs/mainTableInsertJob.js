// const cron = require("node-cron");
// const Product = require("../models/product");
// const UniqueProduct = require("../models/uniqueProduct");
// const ScratchProducts = require("../models/scratchProducts");
// const Project = require("../models/project");
// const ProductKeyword = require("../models/productKeyword");
// const {
//   evaluationForProductAge,
// } = require("../keyword/evaluateProductAge/evaluateProductAge");
// const { ProductInsertionType } = require("../utils/enum");
// const constants = require("../utils/constants");
// const TimedAttributes = require("../models/timedAttributes");

// let shouldStop = false;

// async function processBatch() {
//   //NOTE - get temp product which in not inserted in main product table
//   const rows = await ScratchProducts.findAll({
//     // where: { mainInsertion: false, isScraped: true, push_in_maintable: true},
//     where: { mainInsertion: false, isScraped: true },
//     limit: 500,
//   });

//   //NOTE - if no new temporary product are available for main table inseration
//   if (rows.length < 1) {
//     console.log(
//       "Cron for main table inseration",
//       constants.NO_PRODUCT_FOUND_FOR_INSERATION
//     );
//   }

//   //NOTE - if product found , start inseration in product and unique product table
//   await Promise.all(
//     rows.map(async (product) => {
//       const {
//         id: tempProductId,
//         asin,
//         projectId,
//         listingPosition,
//         domain,
//         url,
//         bestSellersRank,
//         brand,
//         manufacturer,
//         categories,
//         category,
//         currency,
//         keyword,
//         keywordName,
//         image,
//         marketplaceId,
//         price,
//         mrp,
//         title,
//         rating,
//         totalRatings,
//         totalReviews,
//         otherAttributes,
//         variants,
//         description,
//         insertionType,
//         size,
//         //images author publisher language edition pages cover weight origin
//         images,
//         author,
//         publisher,
//         language,
//         edition,
//         pages,
//         cover,
//         weight,
//         origin,
//         scrapCount
//       } = product;

//       if (scrapCount > 1) {

//         const uniqueProduct = await UniqueProduct.findOne({
//           where: { productId: productDetails.id },
//         });

//         await TimedAttributes.create({
//           unique_product_id: uniqueProduct.id,
//           price,
//           mrp,
//           rating_count: totalRatings,
//           reviews_count: totalReviews,
//           seller: brand,
//           seller_rating: rating,
//           bestSellersRank: bestSellersRank,
//         });
//       }

//       const checkProduct = await Product.findOne({ where: { PUID: asin } });

//       let productDetails;
//       let productExist = false;
//       let productAgeRecent = false;
//       if (checkProduct !== null) {
//         const { hasRecentAge } = await evaluationForProductAge({
//           product: checkProduct,
//         });

//         const projectIds = [...checkProduct.projectId, projectId];

//         [, [productDetails]] = await Product.update(
//           { projectId: projectIds, listingPosition },
//           { where: { id: checkProduct.id }, returning: true, limit: 1 }
//         );

//         productExist = true;
//         productAgeRecent = hasRecentAge;
//       } else {
//         console.log("checkProduct is not exist");
//         //NOTE - create a new product , if not exist
//         productDetails = await Product.create({
//           ASIN: asin,
//           PUID: asin,
//           projectId: [projectId],
//           domain,
//           listingPosition,
//           insertionType,
//           isScraped: true,
//         });

//         productExist = false;
//         productAgeRecent = false;
//       }

//       //NOTE - if the product have recent age then update the product details with project Id
//       if (productAgeRecent && productExist) {
//         console.log("productAgeRecent && productExist");
//         const uniqueProduct = await UniqueProduct.findOne({
//           where: { productId: productDetails.id },
//         });

//         await UniqueProduct.update(
//           { projectId: [...uniqueProduct.projectId, projectId] },
//           { where: { id: uniqueProduct.id } }
//         );

//         await ScratchProducts.update(
//           { mainInsertion: true },
//           { where: { id: tempProductId } }
//         );
//       } else {
//         //NOTE - create new unique Product
//         await UniqueProduct.create({
//           url,
//           productId: productDetails.id,
//           projectId: [projectId],
//           ASIN: asin,
//           BestSellersRank: bestSellersRank,
//           Brand: brand,
//           Manufacturer: manufacturer,
//           PUID: asin,
//           categories,
//           category,
//           currency,
//           image,
//           keyword,
//           keywordName,
//           marketplaceId,
//           marketplaceName: domain,
//           price,
//           mrp,
//           title,
//           rating,
//           totalRatings,
//           otherAttributes,
//           variants,
//           description,
//           size,
//           images,
//           author,
//           publisher,
//           language,
//           edition,
//           pages,
//           cover,
//           weight,
//           origin,
//         }).then(async (response) => {
//           if (insertionType === ProductInsertionType.BY_ID) {
//             await ProductKeyword.update(
//               { productId: productDetails.id },
//               { where: { projectId, puid: asin } }
//             );
//           }

//           await Product.update(
//             {
//               uniqueproduct_id: response.id,
//             },
//             {
//               where: { id: productDetails.id },
//             }
//           );

//           await ScratchProducts.update(
//             { mainInsertion: true },
//             // {  push_in_maintable: false },
//             { where: { id: tempProductId } }
//           );
//         });
//       }

//       //NOTE: check if all product of the project is inserted on main table or not
//       const productCount = await ScratchProducts.count({
//         where: { projectId, mainInsertion: false },
//       });
//       if (productCount === 0) {
//         await Project.update(
//           { status: "completed" },
//           { where: { id: projectId } }
//         ).then(() => {
//           global.socketIo.emit("keyword-update-status", { id: projectId });
//         });
//       }
//     })
//   );

//   console.log("Processed a batch of products");

//   if (!shouldStop) {
//     setTimeout(processBatch, 2000);
//   }
// }

// cron.schedule("*/1 * * * *", async () => {
//   shouldStop = false;

//   setTimeout(() => {
//     shouldStop = true;
//   }, 4.5 * 60 * 1000);

//   try {
//     console.log("Cron job is running!");
//     await processBatch();
//   } catch (error) {
//     console.log("Cron job error:", error.message);
//   }
// });
///////////////////////////////////////////////////////



const cron = require("node-cron");
const Bull = require("bull"); // Queue management
const Product = require("../models/product");
const UniqueProduct = require("../models/uniqueProduct");
const ScratchProducts = require("../models/scratchProducts");
const Project = require("../models/project");
const ProductKeyword = require("../models/productKeyword");
const {
  evaluationForProductAge,
} = require("../keyword/evaluateProductAge/evaluateProductAge");
const { ProductInsertionType } = require("../utils/enum");
const constants = require("../utils/constants");
const TimedAttributes = require("../models/timedAttributes");
const axios = require("axios");

// Create a queue to process product insertions
const productQueue = new Bull("productQueue", {
  redis: {
    host: "localhost",
    port: 6379,
  },
});

// Flag to control the stopping of the queue
let shouldStop = false;

// Function to process batches and continuously check for new products
async function processBatch() {
  // Start timing for the entire batch process
  console.time("Full Batch Processing Time");
  // while (!shouldStop) {
  // Fetch new products
  const rows = await ScratchProducts.findAll({
    where: { mainInsertion: false, isScraped: true, push_in_maintable: true },
    limit: 500,
  });

  // Add product rows to the queue if products are found
  if (rows.length > 0) {
    // await productQueue.add({ products: rows });
    const response = await axios.post("http://localhost:8000/queueManager", {
      data: { products: rows },
      queueName: "productQueue",
      action: "add",
    });
    console.log("Added batch to queue");
  } else {
    console.log(
      "Cron for main table inseration",
      constants.NO_PRODUCT_FOUND_FOR_INSERATION
    );
  }

  // Wait for 2 seconds before checking for the next batch
  await new Promise((resolve) => setTimeout(resolve, 2000));
  // }
}

// Queue processing logic for each product batch
productQueue.process(async (job) => {
  const { products } = job.data;

  await Promise.all(
    products.map(async (product) => {
      const {
        id: tempProductId,
        asin,
        projectId,
        listingPosition,
        domain,
        url,
        bestSellersRank,
        brand,
        manufacturer,
        categories,
        category,
        currency,
        keyword,
        keywordName,
        image,
        marketplaceId,
        price,
        mrp,
        title,
        rating,
        totalRatings,
        totalReviews,
        otherAttributes,
        variants,
        description,
        insertionType,
        size,
        images,
        author,
        publisher,
        language,
        edition,
        pages,
        cover,
        weight,
        origin,
        scrapCount,
      } = product;
      // const projectId = 235; // Hardcoded project ID for testing
      if (scrapCount > 1) {
        const uniqueProduct = await UniqueProduct.findOne({
          where: { productId: product.id },
        });

        await TimedAttributes.create({
          unique_product_id: uniqueProduct.id,
          price,
          mrp,
          rating_count: totalRatings,
          reviews_count: totalReviews,
          seller: brand,
          seller_rating: rating,
          bestSellersRank: bestSellersRank,
        });
      }

      const checkProduct = await Product.findOne({ where: { PUID: asin } });

      let productDetails;
      let productExist = false;
      let productAgeRecent = false;
      if (checkProduct !== null) {
        const { hasRecentAge } = await evaluationForProductAge({
          product: checkProduct,
        });

        const projectIds = [...checkProduct.projectId, projectId];

        [, [productDetails]] = await Product.update(
          { projectId: projectIds, listingPosition },
          { where: { id: checkProduct.id }, returning: true, limit: 1 }
        );

        productExist = true;
        productAgeRecent = hasRecentAge;
      } else {
        // Create a new product if it doesn't exist
        console.log("checkProduct is not exist");

        productDetails = await Product.create({
          ASIN: asin,
          PUID: asin,
          projectId: [projectId],
          domain,
          listingPosition,
          insertionType,
          isScraped: true,
        });

        productExist = false;
        productAgeRecent = false;
      }

      // If product exists and has recent age, update product details
      if (productAgeRecent && productExist) {
        console.log("productAgeRecent && productExist");
        const uniqueProduct = await UniqueProduct.findOne({
          where: { productId: productDetails.id },
        });

        await UniqueProduct.update(
          { projectId: [...uniqueProduct.projectId, projectId] },
          { where: { id: uniqueProduct.id } }
        );

        await ScratchProducts.update(
          { mainInsertion: true },
          { where: { id: tempProductId } }
        );
      } else {
        // Create a new unique product if it doesn't exist
        await UniqueProduct.create({
          url,
          productId: productDetails.id,
          projectId: [projectId],
          ASIN: asin,
          BestSellersRank: bestSellersRank,
          Brand: brand,
          Manufacturer: manufacturer,
          PUID: asin,
          categories,
          category,
          currency,
          image,
          keyword,
          keywordName,
          marketplaceId,
          marketplaceName: domain,
          price,
          mrp,
          title,
          rating,
          totalRatings,
          otherAttributes,
          variants,
          description,
          size,
          images,
          author,
          publisher,
          language,
          edition,
          pages,
          cover,
          weight,
          origin,
        }).then(async (response) => {
          if (insertionType === ProductInsertionType.BY_ID) {
            await ProductKeyword.update(
              { productId: productDetails.id },
              { where: { projectId, puid: asin } }
            );
          }

          await Product.update(
            {
              uniqueproduct_id: response.id,
            },
            {
              where: { id: productDetails.id },
            }
          );

          await ScratchProducts.update(
            { mainInsertion: true, push_in_maintable: false },
            { where: { id: tempProductId } }
          );
        });
      }

      // Check if all products in the project are inserted
      const productCount = await ScratchProducts.count({
        where: { projectId, mainInsertion: false },
      });
      if (productCount === 0) {
        await Project.update(
          { status: "completed" },
          { where: { id: projectId } }
        ).then(() => {
          global.socketIo.emit("keyword-update-status", { id: projectId });
        });
      }
    })
  );

  console.log("Processed a batch of products");
  // End timing after batch processing is complete
  console.timeEnd("Full Batch Processing Time");

  await job.remove();

  await productQueue.close();
});

// Schedule cron job to start batch processing
cron.schedule("*/5 * * * *", async () => {
  shouldStop = false;

  setTimeout(() => {
    shouldStop = true;
  }, 4.5 * 60 * 1000); // Stop after 4.5 minutes

  try {
    console.log("Cron job is running!");
    await processBatch();
  } catch (error) {
    console.log("Cron job error:", error.message);
  }
});

// "projectId" = 235

// wsl sudo service redis-server start
// redis-cli ping

// npm run dev

// redis-cli
// FLUSHDB
// EXIT

