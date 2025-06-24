const { Op } = require("sequelize");
const xlsx = require("xlsx");
const constants = require("../../../utils/constants");
const Product = require("../../../models/product");
const Project = require("../../../models/project");
const ProductKeyword = require("../../../models/productKeyword");
const ScratchProducts = require("../../../models/scratchProducts");
const Marketplace = require("../../../models/marketplace");

module.exports = {
  async scrape(req, res) {
    try {
      // How does it look like (domains?) what data is provided into the body;
      const { projectId, isVariant, fileStreamPath, domains } = req.body;

      if (projectId) {
        // if (fileStreamPath) {

        //   console.log('fileStreamPath', fileStreamPath);
        // let insertProducts = [];
        // let puids = [];

        // const workbook = xlsx.readFile(fileStreamPath);
        // let workbook_sheet = workbook.SheetNames;
        // let workbook_response = xlsx.utils.sheet_to_json(
        //   workbook.Sheets[workbook_sheet[0]]
        // );

        // if (workbook_response && workbook_response.length > 0) {
        //   for (let wrkRes of workbook_response) {
        //     let firstKey = Object.keys(wrkRes)[0];
        //     let secondKey = Object.keys(wrkRes)[1];

        //     let firstKeyField = String(wrkRes[firstKey]);
        //     let secondKeyField = String(wrkRes[secondKey]);

        //     puids.push(secondKeyField);

        //     let existingProduct = await Product.findAll({
        //       where: {
        //         [Op.and]: [
        //           { PUID: secondKeyField },
        //           { domain: firstKeyField },
        //           { projectId },
        //         ],
        //       },
        //     });

        //     if (existingProduct.length === 0) {
        //       insertProducts.push({
        //         PUID: secondKeyField,
        //         projectId,
        //         domain: firstKeyField,
        //         insertionType: "byId",
        //       });
        //     }
        //   }
        // }

        // if (puids.length > 0) {
        //   await Product.destroy({
        //     where: { projectId, PUID: { [Op.notIn]: puids } },
        //   });
        // }

        // if (insertProducts.length > 0) {
        //   Product.bulkCreate(insertProducts).then(async () => {
        //     initiateScraping(projectId, isVariant);
        //   });
        // } else {
        //   return res.status(201).json({
        //     status: 201,
        //   });
        // }
        // } else {
        //NOTE - send response to FE
        res.json({
          status: 200,
          message: constants.START_SCRAPING_PRODUCTS_SUCCESS,
        });
        Project.update(
          { status: "in-progress" },
          { where: { id: projectId } }
        ).then(() => {
          global.socketIo.emit("project-status", { id: projectId });
        });
        // NOTE - product keyword table insertion
        const productKeywordsToCreate = domains.map(
          ({ keyword, domain, limit }) => ({
            projectId,
            puid: keyword,
            marketplace: domain,
            scrapingCount: limit,
          })
        );
        await ProductKeyword.bulkCreate(productKeywordsToCreate);

        // NOTE: Collect data for bulk create in ScratchProducts table
        const bulkCreateData = await Promise.all(
          domains.map(async ({ keyword, domain, limit }) => {
            const marketplaceId = await Marketplace.findOne({
              where: { parentMarketplace: domain },
              attributes: ["id"],
            });
            const id = marketplaceId ? marketplaceId.id : null;
            return {
              projectId,
              domain,
              asin: keyword,
              marketplaceId: id,
              scrapingCount: limit,
              insertionType: "byId",
            };
          })
        );

        // NOTE: Use bulkCreate to insert all records at once
        await ScratchProducts.bulkCreate(bulkCreateData);
        // }
      }
    } catch (error) {
      return res.status(400).json({
        status: 400,
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
