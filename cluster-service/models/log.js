const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  ebayapiName: {
    type: String,
    required: true
  },
  apiName:{
    type:String,
    required:true
  },
  functionName:{
    type:String,
    required:true
  },
  requestDetails: {
    type: Object,
    required: true
  },
  response:{
    type:Object,
    required:false
  },
  errorDetails: {
    type: Object,
    required: false
  },
  status: {
    type: String,
    enum: ['success', 'error', 'started', 'ended'],
    default: 'success'
  }
}, {
  timestamps: true
});

const Log = mongoose.model('Log', logSchema);

module.exports = Log;