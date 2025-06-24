const axios = require('axios');
const xlsx = require('xlsx');
const csvtojson = require('csvtojson');
const ScratchProducts = require('../models/scratchProducts');
const { OpenAI } = require('openai');
const FileStorages = require('../../../marketplaces/src/models/fileStorages');
const cron = require('node-cron');
const Project = require('../models/project');

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY, project: process.env.OPENAI_API_PROJECT_ID });

function convertCsvToJson(csvFilePath) {
	return new Promise((resolve, reject) => {
		csvtojson()
			.fromString(csvFilePath)
			.then((jsonArray) => {
				resolve(jsonArray);
			})
			.catch((error) => {
				reject(error);
			});
	});
}

async function processFile(fileUrl) {
	try {
		// Download the file from the URL
		const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
		if (!response.data) {
			throw new Error('No data received from the file URL');
		}

		const buffer = Buffer.from(response.data, 'binary');

		if (fileUrl.includes("xlsx")) {
			// Process the file using xlsx (works for both Excel and CSV)
			const workbook = xlsx.read(buffer, { type: 'buffer' });
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			const report = xlsx.utils.sheet_to_json(worksheet, { rawNumbers: true });

			return report;
		} else if (fileUrl.includes("csv")) {
			// Process the file using xlsx (works for both Excel and CSV)
			const report = await convertCsvToJson(buffer);

			return report;
		}
	} catch (error) {
		console.error('Error processing file:', error);
	}
}

async function main(userId) {

	try {


		const feedFileLink = await FileStorages.findOne({
			where: {
				userId: userId,
				type: "price_comparison"
			}
		});

		if (!feedFileLink || !feedFileLink.dataValues.fileUrl) {
			console.log("No file found for price comparison");
			throw new Error("No file found for price comparison")
		}

		const report = await processFile(feedFileLink.dataValues.fileUrl);

		if (!report) {
			console.log("No report found");
			throw new Error("No report found")
		}

		for (var i = 0; i < report.length; i++) {

			const { source_variation, min_price, title } = report[i];

			console.log(source_variation, min_price, title);

			if (min_price == 0) {

				await ScratchProducts.update({
					price: min_price,
					title: title,
					owned: false
				}, {
					where: {
						asin: source_variation.toString(),
						title: title
					}
				});

			} else {

				let itemExists = await ScratchProducts.findOne({
					where: {
						asin: source_variation.toString(),
						title: title
					}
				});

				if (!itemExists) {
					itemExists = await ScratchProducts.findOne({
						where: {
							asin: source_variation.toString()
						}
					})

					if (itemExists) {
						await ScratchProducts.update({
							price: min_price.toString(),
							title: title,
							owned: true
						}, {
							where: {
								asin: source_variation.toString(),
								owned: true
							}
						});
					} else {

						const itemSpecifics = await generateItemSpecifics(title);

						await ScratchProducts.create({
							asin: source_variation.toString(),
							price: min_price.toString(),
							title: title,
							owned: true,
							brand: itemSpecifics.Brand,
							model: itemSpecifics.Model,
							storage: itemSpecifics.Storage,
							ram: itemSpecifics.RAM,
							color: itemSpecifics.Color,
							marketplaceId: "22",
							projectId: "232"
						});
					}
				} else {
					await ScratchProducts.update({
						price: min_price.toString(),
						title: title,
						owned: true
					}, {
						where: {
							asin: source_variation.toString(),
							title: title
						}
					});
				}

			}

		}

		console.log(report);
	} catch (err) {
		console.log(err);
		throw err;
	}
}

async function generateItemSpecifics(title) {

	const prompt = `Give me the attributes like Brand, Model, Storage, RAM, and Color from this title: \n
            ${title} \n\n
            
                Example:\n
                Title: Apple iPhone 12 Pro 512GB - Graphite\n
                Brand: Apple,\n
                Model: iPhone 12 Pro\n
                Storage: 512GB\n
                RAM: "",\n
                Color: Graphite\n\n

                Example 2:\n\n

                Title: Apple iPhone XR 64GB 3GB RAM- Red\n
                Brand: Apple,\n
                Model: iPhone XR\n
                Storage: 64GB\n
                RAM: 3GB,\n
                Color: Red\n\n

                Return the data in JSON format.
            `;

	const response = await openai.chat.completions.create({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: "system",
				content: "You are a helpful assistant that extracts the attributes like Brand, Model, Storage, RAM, and Color from the title."
			},
			{
				role: "user",
				content: prompt
			}
		]
	});

	const obj = JSON.parse(response.choices[0].message.content.replaceAll("`", "").replaceAll("json", ""));

	return obj;
}

cron.schedule('0 0 * * *', async () => {
	const priceComparision = await Project.findAll({ where: { price_comparision: true, to_be_scraped: true } }) // Replace with the actual user ID
	if (priceComparision.length > 0) {
		for (var i = 0; i < priceComparision.length; i++) {
			try {
				await main(priceComparision[i].dataValues.userId);
			} catch (error) {
				const mailOptions = {
					from: process.env.FROM_EMAIL,
					to: "akhlaq@mergekart.com",
					subject: "feed file update error",
					text: `Error in updating feed file: ${error.message} for project: ${JSON.parse(priceComparision[i])}`,
				};

				const nodemailer = require('nodemailer');

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

				await transporter.sendMail(mailOptions, function (error, info) {
					if (error) {
						console.log(error);
					} else {
						console.log('Email sent: ' + info.response);
					}
				});
			}
		}
	}
});

module.exports = {
	main
};