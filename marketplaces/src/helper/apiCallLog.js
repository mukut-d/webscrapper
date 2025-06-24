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

  // Convert non-object parameters into objects
  const formatToObject = (data) => {
    if (data === null || data === undefined) {
      return {};
    }
    
    // Handle Error objects (including AxiosError)
    if (data instanceof Error) {
      return {
        message: data.message,
        name: data.name,
        stack: data.stack,
        ...(data.response && { 
          status: data.response.status,
          statusText: data.response.statusText,
          data: data.response.data 
        }),
        ...(data.config && {
          url: data.config.url,
          method: data.config.method
        })
      };
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      return { value: data };
    }
    
    return data;
  };


  const logObject = {
    ebayapiName,
    apiName,
    functionName,
    requestDetails: formatToObject(requestDetails),
    response: formatToObject(response),
    errorDetails: formatToObject(errorDetails),
    status,
  };

  try {
    await Log.create(logObject);
    console.log(`Logged ${status} for ${apiName} in ${functionName}`);
  } catch (logError) {
    console.error("Error logging API call:", logError);
    console.log( "logObject -------------------------------",logObject);
    
  }
}

module.exports = {
  apiCallLog,
};
