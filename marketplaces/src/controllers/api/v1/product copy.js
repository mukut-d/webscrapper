const { Op } = require("sequelize");
const Product = require("../../../models/product");
const Project = require("../../../models/project");
const UniqueProduct = require("../../../models/uniqueProduct");
const { getUser } = require("../../../utils/user.util");
const fetch = require("node-fetch");
const fs = require("fs");
const csv = require("fast-csv");
var csvParser = require("csv-parser");
const xlsx = require("xlsx");
const path = require("path");
const { Parser } = require("json2csv");
// const User = require("../../../models/user");
// const http = require("https");
// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
// const xpath = require("xpath-html");
// const { HTMLToJSON } = require('html-to-json-parser');

// const rp = require('request-promise');
// const cheerio = require('cheerio');
// const dummy = require('../../../../test.json');
// const { getDecodedToken } = require('../../../utils/headers.util');

// const jwt = require("jsonwebtoken")
// const { jwtDecode } = require('jwt-decode');

module.exports = {
  async Create(req, res, next) {
    try {
      const { type, projectId, isVariant, domains } = req.body;

      if (domains.length > 0) {
        let bulkInsertData = [];

        let puids = [];

        if (type == "productId") {
          for (let x of domains) {
            if (x["keyword"]) {
              puids.push(x["keyword"]);

              let existingProduct = await Product.findAll({
                where: {
                  [Op.and]: [
                    { PUID: x["keyword"] },
                    { domain: x["domain"] },
                    { projectId },
                  ],
                },
              });

              if (existingProduct.length === 0) {
                bulkInsertData.push({
                  PUID: x["keyword"],
                  projectId: projectId,
                  domain: x["domain"],
                });
              }
            }
          }
        }

        if (puids.length > 0) {
          let remainingProductsDestroyed = await Product.destroy({
            where: {
              projectId,
              PUID: { [Op.notIn]: puids },
            },
          });
        }

        let updatedProject = await Project.update(
          {
            filePath: null,
            fileOriginalName: null,
            variant: isVariant,
          },
          {
            where: {
              id: projectId,
            },
          }
        );

        if (bulkInsertData.length > 0) {
          Product.bulkCreate(bulkInsertData).then(async () => {
            fetch(process.env.SCRAPING_URL + "/scrape", {
              method: "POST",
              // Adding body or contents to send
              body: JSON.stringify({
                projectId,
                isVariant,
                fileStreamPath: "",
              }),
              // Adding headers to the request
              headers: {
                "Content-type": "application/json; charset=UTF-8",
              },
            }).catch((err) => {
              console.log(err);
            });

            return res.status(201).json({
              status: true,
            });
          });
        } else {
          return res.status(201).json({
            status: true,
          });
        }
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async list(req, res, next) {
    try {
      let limit = req.query.limit;
      let offset = req.query.offset;
      let prj_uuid = req.query.prj_id;

      let user = await getUser(req);

      if (user) {
        let condition = {
          user_id: user.id,
        };

        if (prj_uuid) {
          condition["projectuuid"] = prj_uuid;
        }

        const projects = await Project.findAll({
          where: condition,
          include: [
            {
              model: Product,
              include: [
                {
                  model: UniqueProduct,
                  required: true,
                },
              ],
              limit,
              offset,
            },
          ],
        });

        let productsData = [];

        if (projects.length > 0) {
          for (let x of projects) {
            if (x.products.length > 0) {
              let structuredProducts = [];
              for (let prod of x.products) {
                let obj = {
                  ...prod,
                };

                if (prod.unique_product) {
                  obj = {
                    ...prod,
                    ...prod.unique_product,
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

  async getByProject(req, res, next) {
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

  async bulkUpload(req, res, next) {
    try {
      const { projectId, isVariant } = req.body;

      let variant = false;

      if (isVariant && isVariant == "true") {
        variant = true;
      }

      if (req.file == undefined) {
        return res.status(400).send("Please upload a CSV file!");
      } else {
        await Project.update(
          {
            filePath: filePath,
            fileOriginalName: fileOriginalName,
            variant,
          },
          {
            where: {
              id: projectId,
            },
          }
        );

        fetch(process.env.SCRAPING_URL + "/scrape", {
          method: "POST",
          // Adding body or contents to send
          body: JSON.stringify({
            projectId,
            isVariant: variant,
            fileStreamPath: req.file.path,
          }),
          // Adding headers to the request
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        }).catch((err) => {
          console.log(err);
        });

        return res.status(201).json({
          status: 201,
        });
      }

      let insertProducts = [];
      let puids = [];

      const workbook = xlsx.readFile(req.file.path);
      let workbook_sheet = workbook.SheetNames;
      let workbook_response = xlsx.utils.sheet_to_json(
        workbook.Sheets[workbook_sheet[0]]
      );

      if (workbook_response && workbook_response.length > 0) {
        for (let wrkRes of workbook_response) {
          let firstKey = Object.keys(wrkRes)[0];
          let secondKey = Object.keys(wrkRes)[1];

          puids.push(String(wrkRes[secondKey]));

          // console.log('**********wrkRes[secondKey]**********')
          // console.log(wrkRes[secondKey])
          // console.log('**********wrkRes[firstKey]**********')
          // console.log(wrkRes[firstKey])
          // console.log('**********projectId**********')
          // console.log(projectId)

          // return;

          let existingProduct = await Product.findAll({
            where: {
              [Op.and]: [
                { PUID: String(wrkRes[secondKey]) },
                { domain: String(wrkRes[firstKey]) },
                { projectId },
              ],
            },
          });

          if (existingProduct.length === 0) {
            insertProducts.push({
              PUID: String(wrkRes[secondKey]),
              projectId,
              domain: String(wrkRes[firstKey]),
            });
          }
        }
      }

      if (puids.length > 0) {
        let remainingProductsDestroyed = await Product.destroy({
          where: {
            projectId,
            PUID: { [Op.notIn]: puids },
          },
        });
      }

      let filePath = req.file.storedPath;
      let fileOriginalName = req.file.originalname;

      await Project.update(
        {
          filePath: filePath,
          fileOriginalName: fileOriginalName,
          variant,
        },
        {
          where: {
            id: projectId,
          },
        }
      );

      if (insertProducts.length > 0) {
        Product.bulkCreate(insertProducts).then(async () => {
          fetch(process.env.SCRAPING_URL + "/scrape", {
            method: "POST",
            // Adding body or contents to send
            body: JSON.stringify({
              projectId,
              isVariant: variant,
            }),
            // Adding headers to the request
            headers: {
              "Content-type": "application/json; charset=UTF-8",
            },
          }).catch((err) => {
            console.log(err);
          });

          return res.status(201).json({
            status: 201,
            inserted_count: insertProducts.length,
          });
        });
      } else {
        return res.status(201).json({
          status: 201,
        });
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async exportToDoc(req, res, next) {
    try {
      const { projectId } = req.body;

      let user = await getUser(req);

      if (user) {
        let condition = {
          userId: user.id,
        };

        if (projectId) {
          condition["id"] = projectId;
        }

        const projects = await Project.findAll({
          where: condition,
          include: [
            {
              model: Product,
              required: true,
              include: [
                {
                  model: UniqueProduct,
                  attributes: {
                    exclude: [
                      "otherAttributes",
                      "uuid",
                      "productId",
                      "projectId",
                      "ISBN",
                      "currency",
                      "marketplaceId",
                      "variants",
                      "seller",
                      "createdAt",
                      "updatedAt",
                    ],
                  },
                },
              ],
            },
          ],
        });

        let productsData = [];

        if (projects.length > 0) {
          for (let x of projects) {
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
                    productsData.push(extData.dataValues);
                  }
                }
              }
            }
          }
        }

        if (productsData.length > 0) {
          // const fields = []
          const allData = [];
          let initialProd = productsData[0];

          let fields = [
            {
              label: "ID",
              value: "id",
            },
            {
              label: "URL",
              value: "url",
            },
            {
              label: "ASIN",
              value: "ASIN",
            },
            {
              label: "Brand",
              value: "Brand",
            },
            {
              label: "Manufacturer",
              value: "Manufacturer",
            },
            {
              label: "PUID",
              value: "PUID",
            },
            {
              label: "Main Image",
              value: "image",
            },
            {
              label: "Marketplace",
              value: "marketplaceName",
            },
            {
              label: "Price",
              value: "price",
            },
            {
              label: "MRP",
              value: "mrp",
            },
            {
              label: "Title",
              value: "title",
            },
            {
              label: "Rating",
              value: "rating",
            },
            {
              label: "Total Ratings",
              value: "totalRatings",
            },
            {
              label: "Description",
              value: "description",
            },
            {
              label: "Category",
              value: "category",
            },
            {
              label: "keyword List",
              value: "keywordlist",
            },
          ];

          // category,
          // keywordlist
          // bestseller

          // for(let inPrdKey in initialProd) {
          //     fields.push({
          //         label: inPrdKey,
          //         value: inPrdKey
          //     })
          // }

          let bestsellerHeaders = [];

          for (let inPrd of productsData) {
            console.log("*********inPrd*********");
            console.log(inPrd);

            if (inPrd["keywordName"] && inPrd["keywordName"].length > 0) {
              let kwrd = inPrd["keywordName"].join(", ");
              inPrd["keywordlist"] = kwrd;
            }
            if (inPrd["categories"] && inPrd["categories"].length > 0) {
              let ctgryValue = "";
              for (let ctgry of inPrd["categories"]) {
                if (ctgryValue) {
                  ctgryValue = ctgryValue + " > " + ctgry.name;
                } else {
                  ctgryValue = ctgry.name;
                }
              }
              inPrd["category"] = ctgryValue;
            }
            if (
              inPrd["BestSellersRank"] &&
              inPrd["BestSellersRank"].length > 0
            ) {
              let count = 0;
              let bestFields = [];

              for (let bsRnk of inPrd["BestSellersRank"]) {
                count += 1;

                let bestCategoryField = `BestSellersCategory${count}`;
                let bestRankField = `BestSellersRank${count}`;

                if (!bestsellerHeaders.includes(bestRankField)) {
                  bestsellerHeaders.push(bestRankField);
                  bestFields.push(
                    {
                      label: bestRankField,
                      value: bestRankField,
                    },
                    {
                      label: bestCategoryField,
                      value: bestCategoryField,
                    }
                  );
                }

                inPrd[bestRankField] = bsRnk.rank;
                inPrd[bestCategoryField] = bsRnk.category;
              }

              if (bestFields.length > 0) {
                fields = fields.concat(bestFields);
              }
            }
            allData.push(inPrd);
          }

          const json2csv = new Parser({ fields });

          const csv = json2csv.parse(allData);
          res.status(201).send(Buffer.from(csv));
        } else {
          return res.status(400).json({
            status: false,
            message: "No records found",
          });
        }
      }
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};
