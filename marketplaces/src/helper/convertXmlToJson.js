var xmljs = require("xml2js");
const axios = require('axios');

exports.ConvertXMLToJSON = async (xmlFileLink) => {
	try {
		const response = await axios.get(xmlFileLink);

		var result = await xmljs.parseStringPromise(response.data, { explicitArray: false });

		return result;

	} catch (err) {
		console.log(err);
		throw err;
	}
}