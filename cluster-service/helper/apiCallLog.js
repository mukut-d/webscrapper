const Log = require("../models/log");

async function apiCallLog(
  ebayapiName,
  apiName,
  functionName,
  requestDetails,
  response = {},
  errorDetails = {},
  status = "success"
) {
  const logObject = {
    ebayapiName,
    apiName,
    functionName,
    requestDetails,
    response,
    errorDetails,
    status,
  };

  try {
    await Log.create(logObject);
    console.log(`Logged ${status} for ${apiName} in ${functionName}`);
  } catch (logError) {
    console.error("Error logging API call:", logError);
  }
}

module.exports = {
  apiCallLog,
};
