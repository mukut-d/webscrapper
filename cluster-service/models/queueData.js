const mongoose = require('mongoose');

const queueDataSchema = new mongoose.Schema({
	projectId: {
		type: String,
		required: true
	},
	queueData: {
		type: [String],
		required: true,
	},
	vendors: {
		type: Object,
		required: true
	}
}, {
	timestamps: true
});

const queueData = mongoose.model('queueData', queueDataSchema);

module.exports = queueData;