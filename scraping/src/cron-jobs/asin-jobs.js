/**
 * ASIN Scraping Cron Job
 * ----------------------
 * This file manages the periodic scraping of product data from various marketplaces.
 * It selects which project to scrape, fetches products, batches them by scraping method,
 * and pushes them to a queue for downstream processing.
 *
 * Key Sections:
 * 1. Imports & Setup
 * 2. Async Write Queue (for future use)
 * 3. Main Cron Job (runs every 5 minutes)
 *    - Project selection & prioritization
 *    - Product fetching & batching
 *    - Queueing for scraping
 * 4. Project Selection Logic (getProjectId)
 *    - Prioritizes frequency/timed projects
 *    - Falls back to next available project
 *    - Uses Redis for state tracking
 */

// 1. Imports & Setup
const newrelic = require("newrelic");
const cron = require("node-cron");
const { Sequelize, Op, fn, where, literal } = require("sequelize");
const ScratchProducts = require("../models/scratchProducts");
const { fetchProductsFromASIN } = require("../productById/amazon");
const { retrieveItemsForHaithiTrust } = require("../productById/hathi-trust");
const { retrieveItemsForExoticindia } = require("../productById/exoticindia");
const { retrieveItemsForViaterragear } = require("../productById/viaterragear");
const async = require("async");
const bull = require("bull");
const { Redis } = require("ioredis");
const Project = require("../models/project");
const marketplaces = require("../models/marketplace");
const scrapingVendor = require("../models/scrapingvendor");
const moment = require("moment");
const { sequelize } = require("../database/config");
const axios = require("axios");
const { apiCallLog } = require("../helper/apiCallLog");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const queueData = require("../models/queueData");

// const fetchQueue = new bull("scrapeQueue", { ... }); // (Legacy, not used)

// Threshold for queue length (not actively used)
const threshold = 600;

// 2. Async Write Queue (not actively used in this file, but set up for future concurrency control)
const writeQueue = async.queue((task, callback) => {
  task()
    .then(() => callback())
    .catch((err) => callback(err));
}, 6);

// 3. Main Cron Job: Runs every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    // --- CRON START ---
    console.log("Cron job for product By Id started at", new Date());
    newrelic.recordCustomEvent("CronJobStart", { jobName: "productById" });

    // --- Project Selection & Prioritization ---
    // Uses getProjectId() to determine which project to process next.
    // Prioritizes frequency/timed projects (see getProjectId below).
    let {
      id,
      first_fetch,
      price_comparision,
      compare_marketplaces,
      changeDate,
      is_frequency,
    } = await getProjectId();

    // --- Product Fetching ---
    // Fetches products from ScratchProducts table for the selected project.
    // If price_comparision is enabled, fetches only owned products with a valid price.
    // Otherwise, fetches up to 500 products ready to be scraped.
    let rows = [];
    if (price_comparision) {
      rows = await ScratchProducts.findAll({
        where: {
          projectId: id,
          owned: true,
          pushed_in_queue: false,
          price: { [Op.ne]: "undefined" },
        },
        order: [["createdAt", "ASC"]],
        attributes: ["id", "marketplaceId"],
      });
      // Remove unowned products for price comparison projects
      await ScratchProducts.destroy({
        where: { projectId: id, owned: false, pushed_in_queue: false },
      });
    } else {
      rows = await ScratchProducts.findAll({
        where: {
          [Sequelize.Op.or]: [
            {
              isScraped: false,
              nextFetch: { [Sequelize.Op.ne]: null },
              nextFetch: moment()
                .add(5, "hours")
                .add(30, "minutes")
                .format("YYYY-MM-DD"),
            },
            { isScraped: false, scrap_count: 0 },
            {
              isScraped: false,
              scrap_count: { [Sequelize.Op.gt]: 0, [Sequelize.Op.lt]: 4 },
              nextFetch: { [Sequelize.Op.is]: null },
            },
            {
              isScraped: true,
              nextFetch: { [Sequelize.Op.ne]: null },
              nextFetch: moment()
                .add(5, "hours")
                .add(30, "minutes")
                .format("YYYY-MM-DD"),
            },
          ],
          projectId: 227, // Project ID for different scraping methods
          pushed_in_queue: false,
          to_be_scraped: true,
          [Sequelize.Op.and]: [
            { asin: { [Sequelize.Op.ne]: null } },
            Sequelize.where(
              Sequelize.literal('LENGTH(TRIM("scratchProducts"."asin"))'),
              ">",
              0
            ),
          ],
        },
        attributes: ["id", "marketplaceId"],
        limit: 500,
      });
    }

    // --- Batching by Scraping Method ---
    // For each product, determine the scraping method (api, proxy, nutristar) and batch accordingly.
    // Also collects vendor info for each marketplace.
    const ids = rows.map((row) => row.dataValues.id);
    const apiBatch = [];
    const proxyBatch = [];
    const nutristarBatch = [];
    const vendors = {};

    if (price_comparision) {
      // For price comparison, push all products as a single batch.
      const queueDataRes = await queueData.create({
        projectId: id,
        queueData: rows.map((itm) => itm.id.toString()), // this will be scratched data ids
      });
      const data = {
        batch: { mongoId: queueDataRes._id },
        type: "price_comparision",
        first_fetch: first_fetch ?? false,
        compare_marketplaces: compare_marketplaces,
      };
      const apiData = {
        data: data,
        queueName: "scrapeQueue",
        action: "add",
      };
      await axios.post("http://localhost:8000/queueManager", apiData);
      await ScratchProducts.update(
        { pushed_in_queue: true },
        { where: { id: { [Op.in]: ids } } }
      );
      return;
    } else {
      // For regular scraping, batch by scraping method.
      for (let i = 0; i < rows.length; i++) {
        const marketPlace = await marketplaces.findOne({
          where: { id: rows[i].dataValues.marketplaceId },
        });
        const vendor = marketPlace.dataValues.vendor_id[0];
        const vendorDetails = await scrapingVendor.findOne({
          where: { id: parseInt(vendor) },
        });
        if (marketPlace.dataValues.url.includes("nutristar")) {
          nutristarBatch.push({
            ...rows[i].dataValues,
            vendor: vendorDetails.dataValues,
          });
          if (!vendors[rows[i].dataValues.marketplaceId.toString()]) {
            vendors[rows[i].dataValues.marketplaceId.toString()] =
              vendorDetails.dataValues;
          }
          continue;
        }
        if (vendorDetails.dataValues.scraping_method === "api") {
          apiBatch.push({
            ...rows[i].dataValues,
            vendor: vendorDetails.dataValues,
          });
          if (!vendors[rows[i].dataValues.marketplaceId.toString()]) {
            vendors[rows[i].dataValues.marketplaceId.toString()] =
              vendorDetails.dataValues;
          }
        } else if (vendorDetails.dataValues.scraping_method === "proxy") {
          proxyBatch.push({
            ...rows[i].dataValues,
            vendor: vendorDetails.dataValues,
          });
          if (!vendors[rows[i].dataValues.marketplaceId.toString()]) {
            vendors[rows[i].dataValues.marketplaceId.toString()] =
              vendorDetails.dataValues;
          }
        }
      }
    }

    // --- Queueing for Scraping ---
    // Each batch is saved in queueData and sent to the queue manager for processing.
    if (apiBatch.length > 0) {
      const queueDataRes = await queueData.create({
        projectId: id,
        queueData: apiBatch.map((itm) => itm.id.toString()),
        vendors: vendors,
      });
      const data = {
        batch: { mongoId: queueDataRes._id },
        type: "api",
        first_fetch: first_fetch || false,
        changeDate: changeDate || false,
        is_frequency: is_frequency || false,
      };
      const apiData = { data: data, queueName: "scrapeQueue", action: "add" };
      await axios.post("http://localhost:8000/queueManager", apiData);
    } else if (proxyBatch.length > 0) {
      const queueDataRes = await queueData.create({
        projectId: id,
        queueData: proxyBatch.map((itm) => itm.id.toString()),
        vendors: vendors,
      });
      const data = {
        batch: { mongoId: queueDataRes._id },
        type: "proxy",
        first_fetch: first_fetch || false,
        changeDate: changeDate || false,
        is_frequency: is_frequency || false,
      };
      const apiData = { data: data, queueName: "scrapeQueue", action: "add" };
      await axios.post("http://localhost:8000/queueManager", apiData);
    } else if (nutristarBatch.length > 0) {
      const queueDataRes = await queueData.create({
        projectId: id,
        queueData: nutristarBatch.map((itm) => itm.id.toString()),
        vendors: vendors,
      });
      const data = {
        batch: { mongoId: queueDataRes._id },
        type: "nutristar",
        first_fetch: first_fetch || false,
        changeDate: changeDate || false,
        is_frequency: is_frequency || false,
      };
      const apiData = { data: data, queueName: "scrapeQueue", action: "add" };
      await axios.post("http://localhost:8000/queueManager", apiData);
    }

    // Mark all processed products as pushed_in_queue
    await ScratchProducts.update(
      { pushed_in_queue: true },
      { where: { id: { [Op.in]: ids } } }
    );

    // --- Logging & End ---
    newrelic.recordCustomEvent("CronJobEnd", { jobName: "productById" });
    console.log("Cron job for product By Id ended at", new Date());
  } catch (error) {
    // --- Error Handling ---
    console.error("Error in cron job:", error);
    newrelic.recordCustomEvent("CronJobError", { error: error.message });
    await apiCallLog(
      "scrapeCron",
      "scrapeCron",
      "cron-jobs/asin-jobs",
      {},
      {},
      error,
      "error"
    );
  }
});

// 4. Redis Client Setup
const redisClient = new Redis();

/**
 * getProjectId: Determines which project should be scraped next.
 *
 * Prioritization Logic:
 * 1. Frequency Projects (Timed):
 *    - If a "Flipkart" project (IDs 226, 234, 235) is within 1 hour of its scheduled time, it is prioritized.
 *    - If any other frequency project is within 30 minutes of its scheduled time, it is prioritized.
 *    - Uses SQL to check project schedule against current time.
 * 2. Next Unprocessed Project:
 *    - If no frequency project is due, picks the next project with to_be_scraped: true that hasn't been processed yet.
 *    - Uses Redis to track processed projects and current project.
 * 3. Fallback:
 *    - If no project is found, defaults to project ID 1.
 */
async function getProjectId() {
  try {
    // --- Track processed projects in Redis ---
    let processedProjectIds = await redisClient.get("processedProjectIds");
    processedProjectIds = processedProjectIds
      ? JSON.parse(processedProjectIds)
      : [];

    // --- Fetch all projects marked for scraping ---
    const allProjects = await Project.findAll({
      where: { to_be_scraped: true },
      attributes: ["id"],
      order: [["id", "ASC"]],
    });

    // --- Reset processed list if all projects are done ---
    if (processedProjectIds.length >= allProjects.length) {
      processedProjectIds = [];
    }

    // --- Find next unprocessed project ---
    const nextProjectToScrape = allProjects.find(
      (project) => !processedProjectIds.includes(project.id)
    );

    // --- Get current project info from Redis ---
    let projectIdFromRedis = await redisClient.get("projectId");
    let first_fetch = await redisClient.get("first_fetch");
    first_fetch = first_fetch === "true";

    // --- Get current time (IST) for scheduling ---
    const currentTime = moment().add(5, "hours").add(30, "minutes");
    const currentHours = currentTime.get("hours").toString().padStart(2, "0");
    const currentMinutes = currentTime
      .get("minutes")
      .toString()
      .padStart(2, "0");
    const currentSeconds = currentTime
      .get("seconds")
      .toString()
      .padStart(2, "0");
    const formattedCurrentTime = `${currentHours}:${currentMinutes}:${currentSeconds}`;

    // --- 1. Flipkart Frequency Project (within 1 hour) ---
    const [results_fp] = await sequelize.query(`
      SELECT 
        p."id", p."first_fetch", p."price_comparision", p."compare_marketplaces", 
        p."multi_time", p."is_frequency", sub.time_index
      FROM "projects" p
      JOIN LATERAL (
        SELECT MIN(EXTRACT(EPOCH FROM (time - '${formattedCurrentTime}'::time))) as min_diff, time_index
        FROM UNNEST(p."multi_time") WITH ORDINALITY as t(time, time_index)
        WHERE EXTRACT(EPOCH FROM (time - '${formattedCurrentTime}'::time)) BETWEEN 0 AND 3600
        GROUP BY time_index
      ) sub ON TRUE
      WHERE p."is_frequency" = true AND p.id in (226, 235, 234) AND sub.min_diff BETWEEN 0 AND 3600;
    `);

    let flipkart_case = results_fp[0];
    if (flipkart_case) {
      let changeDate = false;
      if (flipkart_case.time_index == flipkart_case.multi_time.length) {
        changeDate = true;
      }
      await redisClient.set("projectId", parseInt(flipkart_case.id));
      await redisClient.set("first_fetch", flipkart_case.first_fetch ?? false);
      if (flipkart_case.id != projectIdFromRedis) {
        await Project.update(
          { first_fetch: false },
          { where: { id: projectIdFromRedis } }
        );
      }
      return {
        id: flipkart_case.id,
        first_fetch: flipkart_case.first_fetch,
        price_comparision: flipkart_case.price_comparision ?? false,
        compare_marketplaces: flipkart_case.compare_marketplaces ?? [],
        changeDate: changeDate,
        is_frequency: flipkart_case.is_frequency,
      };
    }

    // --- 2. Other Frequency Projects (within 30 minutes) ---
    const [results] = await sequelize.query(`
      SELECT 
        p."id", p."first_fetch", p."price_comparision", p."compare_marketplaces",
        p."multi_time", p."is_frequency", sub.time_index
      FROM "projects" p
      JOIN LATERAL (
        SELECT MIN(EXTRACT(EPOCH FROM (time - '${formattedCurrentTime}'::time))) as min_diff, time_index
        FROM UNNEST(p."multi_time") WITH ORDINALITY as t(time, time_index)
        WHERE EXTRACT(EPOCH FROM (time - '${formattedCurrentTime}'::time)) BETWEEN 0 AND 1800
        GROUP BY time_index
      ) sub ON TRUE
      WHERE p."is_frequency" = true AND sub.min_diff BETWEEN 0 AND 1800;
    `);

    let timed_project = results[0];
    if (timed_project) {
      let changeDate = false;
      if (timed_project.time_index == timed_project.multi_time.length) {
        changeDate = true;
      }
      await redisClient.set("projectId", timed_project.id);
      await redisClient.set("first_fetch", timed_project.first_fetch ?? false);
      if (timed_project.id != projectIdFromRedis) {
        await Project.update(
          { first_fetch: false },
          { where: { id: projectIdFromRedis } }
        );
      }
      return {
        id: timed_project.id,
        first_fetch: timed_project.first_fetch ?? false,
        price_comparision: timed_project.price_comparision ?? false,
        compare_marketplaces: timed_project.compare_marketplaces ?? [],
        changeDate: changeDate,
        is_frequency: timed_project.is_frequency,
      };
    }

    // --- 3. Next Unprocessed Project ---
    if (nextProjectToScrape) {
      processedProjectIds.push(nextProjectToScrape.id);
      await redisClient.set(
        "processedProjectIds",
        JSON.stringify(processedProjectIds)
      );
      await redisClient.set("projectId", nextProjectToScrape.id);
      await redisClient.set("first_fetch", false);
      return {
        id: nextProjectToScrape.id,
        first_fetch: false,
        price_comparision: false,
        compare_marketplaces: [],
      };
    }

    // --- 4. Fallback: Default to project ID 1 if nothing else is found ---
    if (isNaN(projectIdFromRedis)) {
      projectIdFromRedis = 1;
      await redisClient.set("projectId", 1);
      await redisClient.set("first_fetch", false);
      return {
        id: 1,
        first_fetch: first_fetch ?? false,
        price_comparision: false,
        compare_marketplaces: [],
      };
    }

    // --- 5. Try next project by incrementing ID ---
    const nextProjectId = parseInt(projectIdFromRedis) + 1;
    const nextProject = await Project.findOne({
      where: { id: nextProjectId, to_be_scraped: true, is_frequency: false },
    });

    if (nextProject) {
      await redisClient.set("projectId", nextProjectId);
      await redisClient.set(
        "first_fetch",
        nextProject.dataValues.first_fetch ?? false
      );
      if (nextProject.dataValues.id != projectIdFromRedis) {
        await Project.update(
          { first_fetch: false },
          { where: { id: projectIdFromRedis } }
        );
      }
      return {
        id: nextProject.id,
        first_fetch: nextProject.dataValues.first_fetch ?? false,
        price_comparision: nextProject.dataValues.price_comparision ?? false,
        compare_marketplaces: nextProject.dataValues.compare_marketplaces ?? [],
      };
    } else {
      // --- 6. Fallback to first available non-frequency project ---
      const projectIdFromDB = await Project.findOne({
        where: {
          id: { [Op.ne]: projectIdFromRedis },
          to_be_scraped: true,
          is_frequency: false,
        },
        order: [["id", "ASC"]],
      });

      if (projectIdFromDB && projectIdFromDB.dataValues) {
        await redisClient.set("projectId", projectIdFromDB.dataValues.id);
        await redisClient.set(
          "first_fetch",
          projectIdFromDB.dataValues.first_fetch ?? false
        );
        return {
          id: projectIdFromDB.dataValues.id,
          first_fetch: projectIdFromDB.dataValues.first_fetch ?? false,
          price_comparision:
            projectIdFromDB.dataValues.price_comparision ?? false,
          compare_marketplaces:
            projectIdFromDB.dataValues.compare_marketplaces ?? [],
        };
      } else {
        await redisClient.set("projectId", 1);
        await redisClient.set("first_fetch", false);
        return {
          id: 1,
          first_fetch: false,
          price_comparision: false,
          compare_marketplaces: [],
        };
      }
    }
  } catch (error) {
    await apiCallLog(
      "getProjectId",
      "getProjectId",
      "cron-jobs/asin-jobs",
      {},
      {},
      error,
      "error"
    );
    throw error;
  }
}

// End of file
