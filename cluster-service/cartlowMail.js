const cron = require("node-cron");
const { MailCron } = require("./models/mailcron");
const { Op, fn, col } = require("sequelize");
const moment = require("moment");
const ScratchProducts = require("./models/scratchProducts");
const Marketplace = require("./models/marketplace");
const Project = require("./models/project");
const CSVParser = require("json2csv").Parser;
const nodemailer = require("nodemailer");
const { apiCallLog } = require("./helper/apiCallLog");
const path = require("path");
require("dotenv").config({
  debug: true,
  path: path.resolve(__dirname + "/.env"),
});

/////////////////////////////////////////////////////////
async function produceCartlowCSV(projectId) {
  try {
    //     const data = await sequelize.query(`WITH min_price_19 AS (
    //         SELECT
    //             asin,
    //             MIN(price) AS price1
    //         FROM
    //             "scratchProducts"
    //         WHERE
    //             "marketplaceId" = '19' and "projectId" = '232' and owned = false
    //         GROUP BY
    //             asin
    //       ),
    //       min_price_20 AS (
    //         SELECT
    //             asin,
    //             MIN(price) AS price2
    //         FROM
    //             "scratchProducts"
    //         WHERE
    //             "marketplaceId" = '20' and "projectId" = '232' and owned = false
    //         GROUP BY
    //             asin
    //       )
    //       SELECT
    //           COALESCE(mp19.asin, mp20.asin) AS asin,
    //           19 AS "marketplaceId1",
    //           mp19.price1,
    //           20 AS "marketplaceId2",
    //           mp20.price2
    //       FROM
    //           min_price_19 mp19
    //       FULL OUTER JOIN
    //           min_price_20 mp20 ON mp19.asin = mp20.asin;
    // `);
    const startOfDay = moment().startOf('day').toISOString();
    const endOfDay = moment().endOf('day').toISOString();

    const data = await ScratchProducts.findAll({
      where: {
        projectId: projectId, owned: true, price: { [Op.ne]: 'undefined' }
      }
    })
    console.log(data.length)
    // console.log("data:::>", JSON.stringify(data))
    const result = [];
    // await Promise.all(
    //   data.map(async (item, index) => {
    for (var i = 0; i < data.length; i++) {
      const item = data[i];
      // const product = await ScratchProducts.findOne({
      //   where: {
      //     asin: item?.asin,
      //     owned: true,
      //     // marketplaceId: '22'
      //   },
      // });

      const price1Product = await ScratchProducts.findOne({
        attribute: [[fn('min', col('price')), 'price']],
        where: {
          asin: item?.dataValues?.asin,
          owned: false,
          [Op.and]: [
            {
              price: { [Op.ne]: "Not Found" },
            },
            {
              price: { [Op.ne]: "0" },
            },
            {
              price: { [Op.ne]: "-" },
            }
          ],
          // price: item.price1,
          is_competitor: true,
          marketplaceId: '19',
          createdAt: {
            [Op.gte]: startOfDay,
            [Op.lte]: endOfDay
          }
        },
      });

      const price2Product = await ScratchProducts.findOne({
        attribute: [[fn('min', col('price')), 'price']],
        where: {
          asin: item?.asin,
          owned: false,
          [Op.and]: [
            {
              price: { [Op.ne]: "Not Found" },
            },
            {
              price: { [Op.ne]: "0" },
            },
            {
              price: { [Op.ne]: "-" },
            }
          ],
          // price: item?.price2,
          is_competitor: true,
          marketplaceId: '20',
          createdAt: {
            [Op.gte]: startOfDay,
            [Op.lte]: endOfDay
          }
        },
      });

      const price3product = await ScratchProducts.findOne({
        attribute: [[fn('min', col('price')), 'price']],
        where: {
          asin: item?.asin,
          owned: false,
          [Op.and]: [
            {
              price: { [Op.ne]: "Not Found" },
            },
            {
              price: { [Op.ne]: "0" },
            },
            {
              price: { [Op.ne]: "-" },
            }
          ],
          // price: item?.price2,
          is_competitor: true,
          marketplaceId: '21',
          createdAt: {
            [Op.gte]: startOfDay,
            [Op.lte]: endOfDay
          }
        },
      });

      if (price3product && price3product.price) {
        price3product.price = price3product?.dataValues.price?.replace("undefined", "")
      }

      if (!price1Product && !price2Product && !price3product) {
        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        result.push({
          Sr: result.length + 1,
          ProductId: item.dataValues.asin,
          Title: item?.dataValues?.title,
          Country: "UAE",
          Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
          BestPrice: "Not Found",
          CompetitorPrice: "Not Found",
          carlowPrice: carlowPrice,
          price_parity: "Not Found",
          competitor_price_last_captured_on: moment(new Date()).format(
            "DD/MM/YY HH:mm"
          ),
          AMAZON_PID: "Not Found",
        });
      } else if (!price1Product && price2Product && !price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price2 = parseFloat(price2Product?.price?.replace(",", ""));

        result.push({
          Sr: result.length + 1,
          ProductId: item.asin,
          Title: item?.dataValues?.title,
          Country: "UAE",
          Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
          BestPrice: "Noon_UAE",
          CompetitorPrice: price2,
          carlowPrice: carlowPrice,
          price_parity:
            price2 > carlowPrice
              ? "Lower in cartlow"
              : price2 < carlowPrice
                ? "Higher in cartlow"
                : price2 == carlowPrice
                  ? "Price matched"
                  : null,
          competitor_price_last_captured_on: moment(new Date()).format(
            "DD/MM/YY HH:mm"
          ),
          Noon_PID: price2Product?.url,
        });

      } else if (price1Product && !price2Product && !price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = parseFloat(price1Product?.dataValues?.price?.replace(",", ""));

        result.push({
          Sr: result.length + 1,
          ProductId: item.dataValues.asin,
          Title: item?.dataValues?.title,
          Country: "UAE",
          Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
          BestPrice: "Amazon_UAE",
          CompetitorPrice: price1,
          carlowPrice: carlowPrice,
          price_parity:
            price1 > carlowPrice
              ? "Lower in cartlow"
              : price1 < carlowPrice
                ? "Higher in cartlow"
                : price1 == carlowPrice
                  ? "Price matched"
                  : null,
          competitor_price_last_captured_on: moment(new Date()).format(
            "DD/MM/YY HH:mm"
          ),
          AMAZON_PID:
            price1Product?.url,
        });


      } else if (!price1Product && !price2Product && price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = parseFloat(price3product?.dataValues?.price?.replace(",", "").replace("SAR ", "").replace("undefined ", ""));

        result.push({
          Sr: result.length + 1,
          ProductId: item.dataValues.asin,
          Title: item?.dataValues?.title,
          Country: "UAE",
          Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
          BestPrice: "Revibe_UAE",
          CompetitorPrice: price1,
          carlowPrice: carlowPrice,
          price_parity:
            price1 > carlowPrice
              ? "Lower in cartlow"
              : price1 < carlowPrice
                ? "Higher in cartlow"
                : price1 == carlowPrice
                  ? "Price matched"
                  : null,
          competitor_price_last_captured_on: moment(new Date()).format(
            "DD/MM/YY HH:mm"
          ),
          Revibe_PID:
            price3product?.dataValues.url,
        });

      } else if (price1Product && price2Product && !price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = parseFloat(price1Product?.dataValues.price?.replace(",", ""));
        const price2 = parseFloat(price2Product?.dataValues.price?.replace(",", ""));

        if (price1Product.dataValues.price != "Not Found" && price2Product.dataValues.price != "Not Found") {
          if (price1 < price2) {
            result.push({
              Sr: result.length + 1,
              ProductId: item.asin,
              Title: item.title,
              Country: "UAE",
              Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
              BestPrice: "Amazon_UAE",
              CompetitorPrice: price1,
              carlowPrice: carlowPrice,
              price_parity:
                price1 > carlowPrice
                  ? "Lower in cartlow"
                  : price1 < carlowPrice
                    ? "Higher in cartlow"
                    : price1 == carlowPrice
                      ? "Price matched"
                      : null,
              competitor_price_last_captured_on: moment(new Date()).format(
                "DD/MM/YY HH:mm"
              ),
              AMAZON_PID:
                price1Product?.url,
            });
          } else if (price1 > price2) {
            result.push({
              Sr: result.length + 1,
              ProductId: item.asin,
              Title: item?.title,
              Country: "UAE",
              Competitor: "Amazon_UAE, Noon_UAE",
              BestPrice: "Noon_UAE",
              CompetitorPrice: price2,
              carlowPrice: carlowPrice,
              price_parity:
                price2 > carlowPrice
                  ? "Lower in cartlow"
                  : price2 < carlowPrice
                    ? "Higher in cartlow"
                    : price2 == carlowPrice
                      ? "Price matched"
                      : null,
              competitor_price_last_captured_on: moment(new Date()).format(
                "DD/MM/YY HH:mm"
              ),
              Noon_PID: price2Product?.url,
            });
          }
        } else if (price1Product.dataValues.price != "Not Found" && price2Product.dataValues.price == "Not Found") {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Amazon_UAE",
            CompetitorPrice: price1,
            carlowPrice: carlowPrice,
            price_parity:
              price1 > carlowPrice
                ? "Lower in cartlow"
                : price1 < carlowPrice
                  ? "Higher in cartlow"
                  : price1 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            AMAZON_PID: price1Product?.url,
          });
        } else if (price1Product.dataValues.price == "Not Found" && price2Product.dataValues.price != "Not Found") {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Noon_UAE",
            CompetitorPrice: price2,
            carlowPrice: carlowPrice,
            price_parity:
              price2 > carlowPrice
                ? "Lower in cartlow"
                : price2 < carlowPrice
                  ? "Higher in cartlow"
                  : price2 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            Noon_PID: price2Product?.url,
          });
        } else if (price1Product.dataValues.price == "Not Found" && price2Product.dataValues.price == "Not Found") {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE,Revibe_UAE",
            BestPrice: "Not Found",
            CompetitorPrice: "Not Found",
            carlowPrice: carlowPrice,
            price_parity: "Not Found",
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
          });
        }

        // if (price1 < price2) {
        //   result.push({
        //     Sr: result.length + 1,
        //     ProductId: item.asin,
        //     Title: item?.dataValues?.title,
        //     Country: "UAE",
        //     Competitor: "Amazon_UAE, Noon_UAE",
        //     BestPrice: "Amazon_UAE",
        //     CompetitorPrice: price1,
        //     carlowPrice: carlowPrice,
        //     price_parity:
        //       price1 > carlowPrice
        //         ? "Lower in cartlow"
        //         : price1 < carlowPrice
        //           ? "Higher in cartlow"
        //           : price1 == carlowPrice
        //             ? "Price matched"
        //             : null,
        //     competitor_price_last_captured_on: moment(new Date()).format(
        //       "DD/MM/YY HH:mm"
        //     ),
        //     AMAZON_PID:
        //       price1Product?.url,
        //   });
        // } else if (price1 > price2) {
        //   result.push({
        //     Sr: result.length + 1,
        //     ProductId: item.asin,
        //     Title: item?.dataValues?.title,
        //     Country: "UAE",
        //     Competitor: "Amazon_UAE, Noon_UAE",
        //     BestPrice: "Noon_UAE",
        //     CompetitorPrice: price2,
        //     carlowPrice: carlowPrice,
        //     price_parity:
        //       price2 > carlowPrice
        //         ? "Lower in cartlow"
        //         : price2 < carlowPrice
        //           ? "Higher in cartlow"
        //           : price2 == carlowPrice
        //             ? "Price matched"
        //             : null,
        //     competitor_price_last_captured_on: moment(new Date()).format(
        //       "DD/MM/YY HH:mm"
        //     ),
        //     Noon_PID: price2Product?.url,
        //   });
        // }

      } else if (!price1Product && price2Product && price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = parseFloat(price2Product?.dataValues.price?.replace(",", ""));
        const price2 = parseFloat(price3product?.dataValues.price?.replace(",", "").replace("SAR ", "").replace("undefined ", ""));

        if (price1 <= price2) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Noon_UAE",
            CompetitorPrice: price1,
            carlowPrice: carlowPrice,
            price_parity:
              price1 > carlowPrice
                ? "Lower in cartlow"
                : price1 < carlowPrice
                  ? "Higher in cartlow"
                  : price1 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            AMAZON_PID:
              price2Product?.url,
          });
        } else if (price1 > price2) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Revibe_UAE",
            CompetitorPrice: price2,
            carlowPrice: carlowPrice,
            price_parity:
              price2 > carlowPrice
                ? "Lower in cartlow"
                : price2 < carlowPrice
                  ? "Higher in cartlow"
                  : price2 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            Revibe_PID: price3product?.dataValues.url,
          });
        }

      } else if (price1Product && !price2Product && price3product) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = isNaN(parseFloat(price1Product?.dataValues.price?.replace(",", ""))) ? 0 : parseFloat(price1Product?.dataValues.price?.replace(",", "")) ?? 0;
        const price2 = isNaN(parseFloat(price3product?.dataValues.price?.replace(",", "")?.replace("SAR ", "").replace("undefined ", ""))) ? 0 : parseFloat(price3product?.dataValues.price?.replace(",", "").replace("undefined ", "").replace("SAR ", "")) ?? 0;

        if (price1 < price2) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Amazon_UAE",
            CompetitorPrice: price1,
            carlowPrice: carlowPrice,
            price_parity:
              price1 > carlowPrice
                ? "Lower in cartlow"
                : price1 < carlowPrice
                  ? "Higher in cartlow"
                  : price1 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            AMAZON_PID:
              price1Product?.url,
          });
        } else if (price1 > price2) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Revibe_UAE",
            CompetitorPrice: price2,
            carlowPrice: carlowPrice,
            price_parity:
              price2 > carlowPrice
                ? "Lower in cartlow"
                : price2 < carlowPrice
                  ? "Higher in cartlow"
                  : price2 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            Revibe_PID: price3product?.url,
          });
        }

      } else if (price1Product != null && price2Product != null && price3product != null) {

        const carlowPrice = parseFloat(item?.dataValues?.price.replace(",", ""));
        const price1 = isNaN(parseFloat(price1Product?.dataValues.price?.replace(",", ""))) ? 0 : parseFloat(price1Product?.dataValues.price?.replace(",", "")) ?? 0;
        const price2 = isNaN(parseFloat(price2Product?.dataValues.price?.replace(",", ""))) ? 0 : parseFloat(price2Product?.dataValues.price?.replace(",", "")) ?? 0;
        const price3 = isNaN(parseFloat(price3product?.dataValues.price?.replace(",", "")?.replace("undefined ", "").replace("SAR ", "").trim())) ? 0 : parseFloat(price3product?.dataValues.price?.replace(",", "").replace("undefined ", "").replace("SAR ", "").trim()) ?? 0;
        if (price1 <= price2 && price1 <= price3) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Amazon_UAE",
            CompetitorPrice: price1,
            carlowPrice: carlowPrice,
            price_parity:
              price1 > carlowPrice
                ? "Lower in cartlow"
                : price1 < carlowPrice
                  ? "Higher in cartlow"
                  : price1 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            AMAZON_PID:
              price1Product?.url,
          });
        } else if (price1 >= price2 && price3 >= price2) {
          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Noon_UAE",
            CompetitorPrice: price2,
            carlowPrice: carlowPrice,
            price_parity:
              price2 > carlowPrice
                ? "Lower in cartlow"
                : price2 < carlowPrice
                  ? "Higher in cartlow"
                  : price2 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            Noon_PID: price2Product?.url,
          });
        } else if (price1 >= price3 && price2 >= price3) {

          result.push({
            Sr: result.length + 1,
            ProductId: item.asin,
            Title: item?.dataValues?.title,
            Country: "UAE",
            Competitor: "Amazon_UAE, Noon_UAE, Revibe_UAE",
            BestPrice: "Revibe_UAE",
            CompetitorPrice: price3,
            carlowPrice: carlowPrice,
            price_parity:
              price3 > carlowPrice
                ? "Lower in cartlow"
                : price3 < carlowPrice
                  ? "Higher in cartlow"
                  : price3 == carlowPrice
                    ? "Price matched"
                    : null,
            competitor_price_last_captured_on: moment(new Date()).format(
              "DD/MM/YY HH:mm"
            ),
            Revibe_PID: price3product?.url,
          });

        }

      }

      // const carlowPrice = parseFloat(product?.dataValues?.price.replace(",", ""));
      // const price1 = parseFloat(item.price1?.replace(",", ""));
      // const price2 = parseFloat(item.price2?.replace(",", ""));
    }
    //   )
    // );

    // Example usage
    const missingAsins = findMissingAsins(data, result);

    const fields = {
      Sr: "",
      ProductId: "",
      Title: "",
      Price: "",
      Country: "",
      Competitor: "",
      BestPrice: "",
      CompetitorPrice: "",
    };
    const parser = new CSVParser(fields);
    const csv = parser.parse(result);
    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname, // Replace with your SMTP host
      port: process.env.SMTP_Port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_Username, // Replace with your SMTP username
        pass: process.env.SMTP_Password, // Replace with your SMTP password
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Set up email data
    let mailOptions = {
      from: process.env.FROM_EMAIL, // Replace with your email
      to: "akhlaq@mergekart.com", // Replace with the receiver's email
      subject: "Cartlow Data",
      text: `Please find the attached CSV file for the extracted data. The missing ASINs are: ${missingAsins.join(", ")}`,
      attachments: [
        {
          filename: `Cartlow_${moment()
            .add(5, "hours")
            .add(30, "minutes")
            .format("DD/MM/YYYY")}.csv`,
          content: csv,
        },
      ],
    };

    // require("fs").writeFile("cartLow.csv", csv.toString(), () => { console.log("Here") })

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        // newRelic.recordCustomEvent(`Error while email sending:`, error);
        console.log(error);
      }
      console.log("Message sent: %s", info.messageId);
    });
  } catch (err) {
    console.log(err);
    await apiCallLog(
      "scrapeQueue",
      "produceCartlowCSV",
      "produceCartlowCSV",
      {},
      {},
      err,
      "error"
    );
  }
}

function findMissingAsins(data, result) {
  // Create a set of asin values from the result array
  const resultAsins = new Set(result.map(res => res.ProductId));

  // Filter data array to find asins not present in the result set
  const missingAsins = data
    .map(item => item.dataValues.asin)
    .filter(asin => !resultAsins.has(asin));

  return missingAsins;
}

// (async function () {

//   try {

//     await produceCartlowCSV(232);

//   } catch (err) {
//     console.log(err);
//   }

// }()) 

module.exports = {
  produceCartlowCSV
};