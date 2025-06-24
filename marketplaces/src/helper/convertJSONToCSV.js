const CSVParser = require("json2csv").Parser;

exports.ConvertJSONToCSV = async (jsonData, fields = {}) => {
	try {
		const json2csvParser = new CSVParser(fields);
		const csv = json2csvParser.parse(jsonData);
		return csv;
	} catch (err) {
		console.log(err);
		throw err;
	}
};