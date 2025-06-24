const cron = require("node-cron");
const axios = require("axios");
const CatalogueConfigRepo = require("../../models/catalogue-config");
const { apiCallLog } = require("../../helper/apiCallLog");
const nodemailer = require("nodemailer");

const queueName = "updateConfigQueue";
async function startCronJob() {
    cron.schedule("0 */2 * * *", async () => {
        try {
            const configs = await CatalogueConfigRepo.findAll({ where: { updateCron: true } });
    
            if (!configs || !Array.isArray(configs) || configs.length === 0) {
                console.log("No configs found to process.");
                return;
            }
    
            for (var i = 0; i < configs.length; i++) {
                const config = configs[i].dataValues;
    
                if (!config) {
                    console.log("Skipping null or undefined config.");
                    continue;
                }
    
                try {
                    await axios.post("http://localhost:8000/queueManager", {
                        data: { configId: config.id },
                        queueName,
                        action: "add",
                    });
                    console.log(`Config processed successfully: ${config.id || "unknown ID"}`);
                    await apiCallLog(
                        "updateConfigCron",
                        "updateConfigCron",
                        "updateConfigCron",
                        { configId: config },
                        {},
                        {},
                        "success"
                    );
                } catch (err) {
                    console.error(`Error processing config: ${config.id || "unknown ID"}`, err);
                    await apiCallLog(
                        "updateConfigCron",
                        "updateConfigCron",
                        "updateConfigCron",
                        { configId: config },
                        {},
                        { error: err.message },
                        "error"
                    );
                }
            }
        } catch (err) {
            console.error("Error fetching configs:", err);
            await apiCallLog(
                "updateConfigCron",
                "updateConfigCron",
                "updateConfigCron",
                {},
                {},
                { error: err.message },
                "error"
            );
    
            // Create a transporter
            let transporter = nodemailer.createTransport({
                host: process.env.SMTP_Hostname, // Replace with your SMTP host
                port: process.env.SMTP_Port,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_Username, // Replace with your SMTP username
                    pass: process.env.SMTP_Password, // Replace with your SMTP password
                },
            });
    
            // Set up email data
            let mailOptions = {
                from: process.env.FROM_EMAIL, // Replace with your email
                to: "aditya@mergekart.com, akhlaq@mergekart.com", // Replace with the receiver's email
                subject: "URGENT!! Error in updateConfigCron",
                text: `Error in updateConfigCron: ${err.message}`,
            };
    
            await transporter.sendMail(mailOptions, async function (error, info) {
                if (error) {
                    console.log(error);
                    await apiCallLog(
                        "updateConfigCron",
                        "updateConfigCron",
                        "updateConfigCron",
                        {},
                        {},
                        { error: error.message },
                        "error"
                    );
                } else {
                    console.log('Email sent: ' + info.response);
                }
            });
    
        }
    });
}

module.exports = startCronJob;