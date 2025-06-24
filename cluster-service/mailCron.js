const cron = require("node-cron");
const { MailCron } = require("./models/mailcron");
const moment = require("moment");
const ScratchProducts = require("./models/scratchProducts");
const Marketplace = require("./models/marketplace");
const Project = require("./models/project");
const { Parser } = require("json2csv");
const nodemailer = require("nodemailer");
const { Op } = require("sequelize");

const ORIGINAL_FIELDS = [
  "sr",
  "asin",
  "sku",
  "url",
  "title",
  "brand",
  "price",
  "mrp",
  "seller",
  "dimensions",
  "reason",
];

function createRow(item, fields, sr) {
  const row = {};
  fields.forEach((field) => {
    if (field === "sr") {
      row.sr = sr;
    } else if (
      field in item &&
      item[field] !== undefined &&
      item[field] !== null
    ) {
      row[field] = item[field];
    } else {
      // Default values for known fields, else "Not Found"
      // here we could have more controller
      switch (field) {
        case "title":
        case "brand":
        case "price":
        case "mrp":
        case "dimensions":
          row[field] = "Not Found";
          break;
        case "reason":
          row[field] = "N/A";
          break;
        default:
          row[field] = "Not Found";
      }
    }
  });
  return row;
}

cron.schedule("*/30 * * * *", async () => {
  try {

    console.log("START");
    // const currentTime = moment("2025-02-05T12:00:00"); // for SERVER
    const currentTime = moment().add(5, "hours").add(30, "minutes"); // for localServer system time
    const formattedCurrentTime = currentTime.format("HH:mm:ss");
    console.log("Current local time:", formattedCurrentTime);

    const targetTime = moment(currentTime).add(30, "minutes").format("HH:mm:ss");
    console.log("Target time:", targetTime);

    const mailData = await MailCron.findAll({
      where: {
        email_time: {
          [Op.gt]: formattedCurrentTime, // Greater than or equal to current time
          [Op.lte]: targetTime, // Less than or equal to target time 
        },
        // id: "1"
      },
    });

    if (!mailData.length) return;

    for (const mailEntry of mailData) {
      const projectIds = mailEntry.dataValues.project_id;
      const attachments = [];

      for (const projectId of projectIds) {
        const project = await Project.findOne({ where: { id: projectId } });
        const requestedFields = Array.isArray(project?.requested_fields)
          ? project.requested_fields
          : [];

        const batchData = await ScratchProducts.findAll({
          where: { projectId },
        });

        await generateCsvAttachments(batchData, requestedFields, attachments);
      }

      await sendMail(mailEntry.dataValues.user_email, attachments);
    }
  } catch (error) {
    console.error("Error executing mail cron:", error);
  }
});

async function generateCsvAttachments(data, requestedFields, attachments) {
  // Determine fields to use: if requestedFields > 1, use them (in order), else use ORIGINAL_FIELDS
  let fields;
  if (Array.isArray(requestedFields) && requestedFields.length > 1) {
    const mergedFields = [];
    requestedFields.forEach((f) => {
      if (!mergedFields.includes(f)) mergedFields.push(f);
    });
    if (!mergedFields.includes("sr")) mergedFields.unshift("sr");
    fields = mergedFields;
  } else {
    fields = [...ORIGINAL_FIELDS];
  }

  const grouped = {};
  data.forEach((item) => {
    const key = item.marketplaceId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  for (const [marketplaceId, items] of Object.entries(grouped)) {
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId },
    });
    const rows = items.map((item, idx) => createRow(item, fields, idx + 1));
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    attachments.push({
      filename: `${marketplace?.dataValues?.parentMarketplace?.split(".")[0] ||
        "marketplace"
        }_${moment.utc().format("DD_MM_YYYY_HH_mm_ss")}.csv`,
      content: csv,
    });
  }
}

async function sendMail(email, attachments) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname,
      port: process.env.SMTP_Port,
      secure: false,
      auth: {
        user: process.env.SMTP_Username,
        pass: process.env.SMTP_Password,
      },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: email,
      cc: "akhlaq@mergekart.com",
      subject: "Extracted Data",
      text: "Please find the attached CSV file for the extracted data.",
      attachments,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error while sending email:", error);
      } else {
        console.log("Message sent:", info.messageId);
      }
    });

    console.log("After sending email");
  } catch (err) {
    console.log(err);
  }
}
