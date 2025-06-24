const { PassThrough, Readable } = require("stream");
const { Parser } = require("json2csv");
const { pipeline } = require("stream/promises");
const fetch = require("node-fetch");
const { Sequelize, Op } = require("sequelize");
const { getUser } = require("../../../utils/user.util");
const Product = require("../../../models/product");
const Project = require("../../../models/project");
const ProductKeyword = require("../../../models/productKeyword");
const UniqueProduct = require("../../../models/uniqueProduct");
const Marketplaces = require("../../../models/marketplace");
const ScratchProducts = require("../../../models/scratchProducts");
const constants = require("../../../utils/constants");
const Token = require("../../../models/tokens");
const { default: axios } = require("axios");

const {
  FIELD_CANT_BE_BLANK,
  PRODUCT_NOT_SCRAPED,
  USER_NOT_FOUND,
  FILE_UPLOAD_ON_PROCESS,
} = constants;
const {
  convertFile,
  pushToS3Bucket,
} = require("../../../utils/fileUpload.util");
const Bull = require('bull')
const { ProductInsertionType } = require("../../../utils/enum");
const { sequelize } = require("../../../database/config");
const productQueue = new Bull('bulkFileUploadQueue', {
  redis: {
    host: 'localhost',
    port: 6379
  }
})

const processFile = async (projectId, isVariant, base64Encoded) => {
  try {
    //NOTE: Convert base64 to JSON format
    const convertFileToBase64 = await convertFile(base64Encoded);

    //NOTE: Upload to S3
    const url = await pushToS3Bucket(base64Encoded, ProductInsertionType.BY_ID);

    //NOTE: Extract the file name from the S3 object URL
    const fileName = url.split("/").pop();

    //NOTE: Update the project
    await Project.update(
      {
        status: "in-progress",
        filePath: url,
        fileOriginalName: fileName,
        variant: isVariant,
      },
      { where: { id: projectId } }
    );

    // //NOTE: Emit project status through socket
    // global.socketIo.emit("project-status", { id: projectId });

    //NOTE: Product keyword table insertion
    const productKeywordsToCreate = convertFileToBase64.map(
      ({ Marketplace, ProductID }) => ({
        projectId,
        puid: ProductID,
        marketplace: Marketplace,
        scrapingCount: 1,
      })
    );
    await ProductKeyword.bulkCreate(productKeywordsToCreate);

    let batchIndex = 0;

    while (batchIndex < convertFileToBase64.length) {

      const chunk = convertFileToBase64.slice(batchIndex, batchIndex + 1000);

      //NOTE: Collect data for bulk create in ScratchProducts table
      let bulkCreateData = await Promise.all(
        chunk.map(
          async ({ Marketplace: domain, ProductID: keyword, HSKU, Variant, URL }) => {
            const marketplaceId = await Marketplaces.findOne({
              where: { parentMarketplace: domain },
              attributes: ["id", "id_url"],
            });
            const id = marketplaceId ? marketplaceId.id : null;
  
            const found = await ScratchProducts.findOne({
              where: {
                projectId,
                domain,
                asin: keyword || HSKU,
                sku: HSKU || keyword,
                marketplaceId: id,
              },
            });
            if (found) {
              found.email = true;
              await found.save();
              return null
            }
  
            if (!found) {
              let url = "";

              if (!URL && keyword) {
                url = marketplaceId.dataValues.id_url.trim() + keyword.trim();
              } else if (URL) {
                url = URL;
              }

              return {
                projectId,
                domain,
                asin: keyword || HSKU,
                marketplaceId: id,
                scrapingCount: 1,
                insertionType: URL ? ProductInsertionType.BY_URL : ProductInsertionType.BY_ID,
                url: url,
                sku: HSKU,
                variant: Variant,
                email: true
              };
            }
          }
        )
      );
      
      bulkCreateData = bulkCreateData.filter(Boolean);
      //NOTE: Use bulkCreate to insert all records at once
      await ScratchProducts.bulkCreate(bulkCreateData);
  
      const asins = convertFileToBase64.map(({ ProductId }) => ProductId);
      const skus = convertFileToBase64.map(({ HSKU }) => HSKU);
  
      //NOTE: update the existing products
      await ScratchProducts.update({
        email: false,
      }, {
        where: {
          projectId,
          asin: {
            [Op.notIn]: asins
          },
          sku: {
            [Op.notIn]: skus
          }
        }
      });

      batchIndex += 1000;

    }

    return constants.FILE_UPLOAD_SUCCESS;

    // return { status: 200, message: constants.FILE_UPLOAD_SUCCESS };
  } catch (error) {
    throw error;
  }
};

productQueue.process(async (job) => {
  try {
    const { projectId, isVariant, base64Encoded } = job.data;
    await processFile(projectId, isVariant, base64Encoded);
    await job.remove();
  } catch (error) {
    console.error('Error processing job:', error);
  }
});

module.exports = {
  async Create(req, res) {
    try {
      const { type, projectId, isVariant, domains } = req.body;

      if (domains.length > 0) {
        let bulkInsertData = [];

        let puids = [];

        // if (type == "productId") {
        //   for (let x of domains) {
        //     if (x["keyword"]) {
        //       puids.push(x["keyword"]);

        //       let existingProduct = await Product.findAll({
        //         where: {
        //           [Op.and]: [
        //             { PUID: x["keyword"] },
        //             { domain: x["domain"] },
        //             { projectId },
        //           ],
        //         },
        //       });

        //       if (existingProduct.length === 0) {
        //         bulkInsertData.push({
        //           PUID: x["keyword"],
        //           projectId: projectId,
        //           domain: x["domain"],
        //           insertionType: "byId",
        //         });
        //       }
        //     }
        //   }
        // }

        // if (puids.length > 0) {
        //   let remainingProductsDestroyed = await Product.destroy({
        //     where: {
        //       projectId,
        //       PUID: { [Op.notIn]: puids },
        //     },
        //   });
        // }

        // let updatedProject = await Project.update(
        //   {
        //     filePath: null,
        //     fileOriginalName: null,
        //     variant: isVariant,
        //   },
        //   {
        //     where: {
        //       id: projectId,
        //     },
        //   }
        // );

        // if (bulkInsertData.length > 0) {
        //   Product.bulkCreate(bulkInsertData).then(async () => {
        const response = await fetch(process.env.SCRAPING_URL + "/scrape", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            isVariant,
            fileStreamPath: "",
            domains,
          }),
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        });

        if (!response.ok) {
          console.error(
            "Failed to fetch:",
            response.status,
            response.statusText
          );
        }

        return res.status(201).json({
          status: true,
        });
        // });
        // }
        // else {
        //   return res.status(201).json({
        //     status: true,
        //   });
        // }
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async list(req, res) {
    try {
      let limit = req.query.limit;
      let offset = req.query.offset;
      let prj_uuid = req.query.prj_id;
      
      let user = await getUser(req);
      
      console.log("object");
      if (user) {
        let condition = {};

        if (prj_uuid) {
          condition["projectuuid"] = prj_uuid;
        }

        //NOTE - get project details
        const projects = await Project.findOne({
          where: condition,
        });

        let productsData = [];

        const products = await Product.findAll({
          where: {
            project_id: {
              [Sequelize.Op.contains]: Sequelize.literal(
                `ARRAY[${projects.id}]::integer[]`
              ),
            },
          },
          limit,
          offset,
          // include: [{ model: UniqueProduct, required: true }],
        });

        if (products.length > 0) {
          let structuredProducts = [];
          for (let prod of products) {
            let obj = { ...prod };

            if (prod.uniqueproductId) {

              const uniqueProduct = await UniqueProduct.findOne({
                where: {
                  id: prod.uniqueproductId,
                },
              });

              obj = {
                ...prod,
                ...uniqueProduct,
              };
            }

            structuredProducts.push(obj);
          }
          let extractedData = [...productsData, ...structuredProducts];

          if (extractedData.length > 0) {
            for (let extData of extractedData) {
              if (extData.dataValues) {
                productsData.push(extData.dataValues);
              }
            }
          }
        }

        return res.status(201).json({
          status: 201,
          products: productsData,
        });
      }
    } catch (error) {
      console.log("error", error);
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async getByProject(req, res) {
    try {
      let prj_uuid = req.query.prj_id;

      let user = await getUser(req);

      if (user) {
        let condition = {
          userId: user.id,
        };

        if (prj_uuid) {
          condition["projectuuid"] = prj_uuid;
        }

        const projects = await Project.findAll({
          where: condition,
          include: [
            {
              model: Product,
              required: true,
              // include: [{
              //     model: UniqueProduct
              // }]
            },
          ],
        });

        let productsData = [];

        if (projects.length > 0) {
          for (let x of projects) {
            var is_bulk = false;
            if (x.filePath) {
              is_bulk = true;
            }

            if (x.products.length > 0) {
              let structuredProducts = [];
              for (let prod of x.products) {
                let obj = {
                  ...prod,
                };

                if (prod.unique_product) {
                  obj = {
                    ...obj,
                    ...prod.unique_product,
                  };
                }

                structuredProducts.push(obj);
              }
              let extractedData = [...productsData, ...structuredProducts];

              if (extractedData.length > 0) {
                for (let extData of extractedData) {
                  if (extData.dataValues) {
                    extData.dataValues.is_bulk = is_bulk;
                    extData.dataValues["ASIN"] = extData.dataValues["PUID"];
                    extData.dataValues["marketplaceName"] =
                      extData.dataValues["domain"];
                    productsData.push(extData.dataValues);
                  }
                }
              }
            }
          }
        }

        return res.status(201).json({
          status: 201,
          // projects
          products: productsData,
        });
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  //SECTION - Bulk upload for product by Id
  async bulkUpload(req, res) {
    try {
      const { projectId, isVariant, file } = req.body;
      const base64Encoded = file.split(";base64,").pop();
      const decodedFile = Buffer.from(base64Encoded, 'base64').toString('binary');
      // Check the length of the decoded file
      const rows = decodedFile.split("\n");
      if (rows.length > 40000) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: "Upload a file between 1 to 40000 entries"
        });
      }
      //NOTE - send the response as the file is on process
      res.json({
        status: 200,
        message: FILE_UPLOAD_ON_PROCESS,
      });
      await productQueue.add({projectId, isVariant, base64Encoded})
    } catch (error) {
      console.log(error);
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },

  //SECTION - export To Doc
  async exportToDoc(req, res) {
    try {
      let { projectId, fields } = req.query;
      fields = fields.split(",");
      console.log(fields);
      if (fields.length === 0) {
        return res.status(400).json({
          status: 400,
          message: FIELD_CANT_BE_BLANK,
        });
      }

      // const user = await getUser(req);
      // if (!user) {
      //   return res.status(400).json({
      //     status: 400,
      //     message: USER_NOT_FOUND,
      //   });
      // }

      const defaultAttributes = [
        "id",
        `"createdAt"`,
        "price",
        "title",
        "brand",
        "seller",
        "mrp",
        "currency",
        "rating",
        "total_ratings",
        "best_sellers_rank",
        "a_s_i_n",
        "size",
        "url",
        "category",
        "images",
        "author",
        "publisher",
        "edition",
        "pages",
        "cover",
        "other_attributes",
        "weight",
        "origin",
        "marketplace_name",
      ];

      const includedAttributes = defaultAttributes.filter((attribute) =>
        fields.includes(attribute)
      );

      const attributeColumns = includedAttributes.join(", ");

      const query = `SELECT ${attributeColumns} FROM unique_products WHERE project_id @> ARRAY[${parseInt(
        projectId
      )}]::integer[]`;
      const products = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
      });

      console.log("products", products);
      if (!products || products.length === 0) {
        return res.status(400).json({
          status: 400,
          message: PRODUCT_NOT_SCRAPED,
        });
      }

      const json2csv = new Parser({ fields });
      const csv = json2csv.parse(products);

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="exported_data.csv"'
      );
      res.setHeader("Content-Type", "text/csv");
      res.status(200).end(csv);
      // const totalBytes = Buffer.byteLength(csv, 'utf8');
      // let bytesSent = 0;

      // const progressStream = new PassThrough();

      // progressStream.on('data', (chunk) => {
      //   bytesSent += chunk.length;
      //   const progressPercentage = Math.floor((bytesSent / totalBytes) * 100);
      //   console.log(`Download progress: ${progressPercentage}%`);
      // });

      // await pipeline(
      //   Readable.from(csv),
      //   progressStream,
      //   res
      // );
    } catch (error) {
      console.error("Error:", error);
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};

