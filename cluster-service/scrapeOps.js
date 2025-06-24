const bull = require("bull");
// const async = require("async");
const newRelic = require("newrelic");
const ScrapingAntClient = require("@scrapingant/scrapingant-client");
const Marketplace = require("./models/marketplace");
const dom = require("xmldom").DOMParser;
const xpaths = require("./xpaths/xpath.json");
const xpath = require("xpath");
const validate = require("is-my-json-valid");
const ScratchProducts = require("./models/scratchProducts");
const puppeteer = require("puppeteer");
const { JSDOM } = require("jsdom");
const nodemailer = require("nodemailer");
const moment = require("moment/moment");
const CSVParser = require("json2csv").Parser;
const cheerio = require("cheerio");
const TimedAttributes = require("./models/timedAttributes");
const AWS = require("aws-sdk");
const { Op } = require("sequelize");
const axios = require("axios");
const rp = require("request-promise");
require("./database/config");
const qs = require("qs");

const { extractDataFromHtml } = require("./subprocess");
// const pLimit = require("p-limit");

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.S3_REGION,
});
const S3 = new AWS.S3();

async function uploadToS3(key, buffer) {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: "text/html",
        };

        S3.upload(params, (err, data) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(data.Location);
            }
        });
    });
}

const retryQueue = new bull("retryQueue", {
    redis: {
        host: "localhost",
        port: 6379,
        // add other Redis options if needed
    },
});

async function retryJob() {
    retryQueue.process(async (job) => {
        const { data, first_fetch } = job.data;

        let i = 0;
        while (i < data.length) {
            const batch = data.slice(i, i + 24);

            await scrapeOps(batch, first_fetch);

            i += 24;

        }

    });
}

async function scrapeOps(batch, first_fetch) {
    // Add your code here
    try {
        const finalProducts = [];

        const request = batch?.map(async (rowData) => {

            const proxyParams = {
                api_key: 'c77f33db-de31-4b51-9416-dd149b605b7a',
                url: rowData.url
            };

            const proxyUrl = 'https://proxy.scrapeops.io/v1/?' + qs.stringify(proxyParams);
            const requestOptions = {
                uri: proxyUrl,
                timeout: 30000
            };

            await rp(requestOptions)
                .then(async (response) => {
                    finalProducts.push({ html: response, ...rowData });
                      await uploadToS3(`flipkart_${rowData.asin}_scrapeops_${moment().add(5, "hours").add(30, "minutes").format("DD_MM_YYYY")}.html`, response);
                })
                .catch(error => {
                    console.error(error);
                    finalProducts.push({ html: "", ...rowData });
                });

        });

        await Promise.all(request);

        if (finalProducts.length > 0) {
            await extractDataFromHtml(finalProducts, first_fetch);
        }

    } catch (err) {

        console.log(err);

    }
}

// (async function () {
//   const data = await ScratchProducts.findAll({
//     where: {
//       projectId: { [Op.in]: [253] },
//       marketplaceId: { [Op.in]: [6] },
//       price: "Not Found",
//     },
//   });
//   let i = 0;
//   console.log(data.length);
//   while (i < data.length) {
//     console.log(i)
//     const batch = data.slice(i, i + 30).map((item) => item.dataValues);
//     const res = await scrapeOps(
//       batch,
//       false
//     );
//     i += 30;
//   }
// })();

// retryJob();