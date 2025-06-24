const { Op } = require("sequelize");
const xlsx = require("xlsx");
const constants = require("../../../utils/constants");
const Product = require("../../../models/product");
const Project = require("../../../models/project");
const {
  evaluateProductAge,
} = require("../../../productById/evaluateProductAge/evaluateProductAge");
const {
  amazonProductById,
} = require("../../../productById/amazon/amazonProductIdexisting");

//SECTION - check domain and product details based on the request
const checkDomainForScraping = async (projectId, isVariant, domains) => {
  try {
    Project.update(
      { status: "in-progress" },
      { where: { id: projectId } }
    ).then(() => {
      global.socketIo.emit("project-status", { id: projectId });
    });

    let requestedProductCount = 0;
    for (const details of domains) {
      const { keyword, domain, limit } = details;
      //NOTE: Update product count
      requestedProductCount = requestedProductCount + limit;

      //NOTE - if domain includes amzon
      if (domain.includes("amazon")) {
        const { productExist, hasRecentAge } = await evaluateProductAge({
          projectId,
          keyword,
          domain,
          limit,
          ageOfTheProduct: 3,
        });

        //NOTE - call amazonProductById function to create or update projects
        await amazonProductById({
          productExist,
          hasRecentAge,
          keyword,
          projectId,
          isVariant,
          domain,
        });
      }
    }
    //NOTE - update product count
    await Project.update(
      { productCount: requestedProductCount },
      { where: { id: projectId } }
    );
  } catch (error) {
    console.log("error", error.message);
  }
};

module.exports = {
  async scrape(req, res) {
    try {
      const { projectId, isVariant, fileStreamPath, domains } = req.body;

      if (projectId) {
        if (fileStreamPath) {
          let insertProducts = [];
          let puids = [];

          const workbook = xlsx.readFile(fileStreamPath);
          let workbook_sheet = workbook.SheetNames;
          let workbook_response = xlsx.utils.sheet_to_json(
            workbook.Sheets[workbook_sheet[0]]
          );

          if (workbook_response && workbook_response.length > 0) {
            for (let wrkRes of workbook_response) {
              let firstKey = Object.keys(wrkRes)[0];
              let secondKey = Object.keys(wrkRes)[1];

              let firstKeyField = String(wrkRes[firstKey]);
              let secondKeyField = String(wrkRes[secondKey]);

              puids.push(secondKeyField);

              let existingProduct = await Product.findAll({
                where: {
                  [Op.and]: [
                    { PUID: secondKeyField },
                    { domain: firstKeyField },
                    { projectId },
                  ],
                },
              });

              if (existingProduct.length === 0) {
                insertProducts.push({
                  PUID: secondKeyField,
                  projectId,
                  domain: firstKeyField,
                  insertionType: "byId",
                });
              }
            }
          }

          if (puids.length > 0) {
            await Product.destroy({
              where: { projectId, PUID: { [Op.notIn]: puids } },
            });
          }

          if (insertProducts.length > 0) {
            Product.bulkCreate(insertProducts).then(async () => {
              initiateScraping(projectId, isVariant);
            });
          } else {
            return res.status(201).json({
              status: 201,
            });
          }
        } else {
          //NOTE - send response to FE
          res.json({
            status: 200,
            message: constants.START_SCRAPING_PRODUCTS_SUCCESS,
          });

          //NOTE - check for scraping products
          checkDomainForScraping(projectId, isVariant, domains);
        }
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async test(req, res, next) {
    try {
      console.log("*********io*********");
      global.socketIo.emit("test-event", "******Hi from scraping module******");
      // io.emit('test-event', '******Hi from scraping module******');
      // console.log(io)
      return res.status(200).json({
        status: true,
        message: "Scraping Module Working!",
      });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};
