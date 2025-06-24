const Catalogue = require("../../models/catalogue");
const Marketplace = require("../../models/marketplace");
const Tokens = require("../../models/tokens");
const categoryAttributes = require('../../models/categoryAttributes')
const { v4: uuidv4 } = require('uuid');
const qs = require('qs');
const axios = require("axios");
const fs = require('fs')
const path = require('path');
const { getWalmartToken } = require("./catalogue");
const attributeJsonFilePath = path.join(__dirname , 'category.json')

exports.fetchwalmartCategories = async (req, res) =>
    {
     const {userId , accountName , marketplaceId} = req.body ;
      try {
        const marketPlace = await Marketplace.findOne({
            where: {
              id: marketplaceId,
            },
          });
          if (!marketPlace) {
            return res.status(400).json({
              success: false,
              message: "Market Place does not exist.",
            });
          }
          const token = await Tokens.findOne({
            where: {
              userId,
              accountName,
            },
          });
          if (!token) {
            return res.status(400).json({
              success: false,
              message: "Token not found for this account",
            });
          }
        const base64Credentials = Buffer.from(`${ token?.dataValues?.client_id }:${ token?.dataValues?.client_secret }`).toString('base64');
        console.log(base64Credentials , 'base64Credentials')
        const correlationId = uuidv4()
        console.log(correlationId , 'correlationId')
        let accessToken;
        const tokenHeaders = {
          'Authorization': `Basic ${ base64Credentials }`,
          'WM_SVC.NAME': `${ accountName }`,
          'WM_QOS.CORRELATION_ID': correlationId,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        };
        const tokenRequestBody = qs.stringify({
          grant_type: 'client_credentials'
        });
        const tokenUrl = 'https://marketplace.walmartapis.com/v3/token';
        try {
          const tokenResponse = await axios.post(tokenUrl, tokenRequestBody, { headers: tokenHeaders });
          accessToken = tokenResponse.data.access_token;
        } catch (error) {
          console.log("error", error)
          error.push({
            error: `An error occurred while creating token.`,
            details: error,
          });
        }
        console.log(accessToken , Date.now().toString() , 'accessToken')
        // const categoryUrl = 'https://marketplace.walmartapis.com/v3/items/taxonomy';
        const categoryUrl = 'https://marketplace.walmartapis.com/v3/utilities/taxonomy?version=5.0&feedType=MP_ITEM';
        const Headers = {
          'WM_SVC.NAME': 'Walmart Marketplace',
          'WM_QOS.CORRELATION_ID': correlationId,
          'WM_SEC.TIMESTAMP': Date.now().toString(),
          'Accept': 'application/json',
          'Content-Type': 'application/xml',
          'WM_SEC.ACCESS_TOKEN': accessToken
        };
        let categories = []
        try {
          const response = await axios.get(categoryUrl, { headers: Headers });
          console.log(response.data.itemTaxonomy , 'response.data.payload')
          const data = 
          await Promise.all(response.data.itemTaxonomy.map((category)=>{
            categories.push({
                marketPlace : marketplaceId ,
                categoryName: category?.category,
                categoryTree : category?.category,
                leafCategoryTreeNode : category?.productTypeGroup?.length ? false : true
            })
            if(category?.productTypeGroup?.length){
              category?.productTypeGroup?.map((subCat)=>{
                   categories.push({
                    marketPlace : marketplaceId ,
                    categoryName: subCat?.productTypeGroupName,
                    parentCategory : category?.category,
                    categoryTree : `${category?.category} > ${subCat?.productTypeGroupName}`,
                    leafCategoryTreeNode : subCat?.productType?.length ? false  : true
                   })
                   if(subCat?.productType?.length){
                    subCat?.productType?.map((subSubCat)=>{
                      categories.push({
                        marketPlace : marketplaceId ,
                        categoryName: subSubCat?.productTypeName,
                        parentCategory : subCat?.productTypeGroupName,
                        categoryTree : `${category?.category} > ${subCat?.productTypeGroupName} > ${subSubCat?.productTypeName}`,
                        leafCategoryTreeNode :  true
                       })
                    })
                   }
                }) 
            }
        }))
        await Catalogue.bulkCreate(categories)
        return res.status(200).json({
            success: true,
            data : categories,
            messages : 'category fetched successfully'
        });
        } catch (err) {
            return res.status(500).json({
                success: true,
                messages : err
            });
        } 
      } catch (err) {
        console.log("error", err)
        return res.status(500).json({
          success: false,
          message: err.message,
        });
      }
}

exports.getWalmartCategories = async (res) => {
  try {
    // Fetch only the categoryName field from categoryAttributes
    const categories = await categoryAttributes.findAll({
      attributes: ['categoryName']
    });

    // Extract the category names into a simple array
    const categoryNames = categories?.map(category => category.categoryName) || [];
    return res.status(200).json({
      success: true,
      status: 200,
      data: categoryNames,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    })
  }
};

// exports.getCategoryAttributes = async(category) => {
//   try{
//     const attributeData  =  await categoryAttributes.findOne({where : {
//       categoryName : category
//     }})
//     return {
//       success: true,
//       data : attributeData?.dataValues?.attributes || attributeData?.attributes || null ,
//     }
//   }catch(error){
//     console.log("error", error)
//     return {
//       success: false,
//       message: error?.message,
//     }
//   }
// }

// Helper function to map Walmart data types to eBay format
function mapWalmartTypeToEbay(walmartType) {
  const typeMap = {
    'number': 'NUMBER',
    'integer': 'NUMBER',
    'string': 'STRING',
    'boolean': 'STRING',
    'array': 'STRING'
  };
  
  return typeMap[walmartType] || 'STRING';
}

// Helper function to convert camelCase or snake_case to Title Case
function convertToTitleCase(str) {
  return str.replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/_/g, ' ') // Replace underscores with spaces
            .replace(/^./, function(str){ return str.toUpperCase(); }) // Capitalize the first letter
            .trim();
}

exports.getCategoryAttributes = async (category, userTokens) => {
  try {
    const tokenCredentials = {
      client_id: userTokens[0]?.client_id,
      client_secret: userTokens[0]?.client_secret
    }

    console.log(category?.categoryName , 'category?.categoryName --------------------' )
    
    const correlationId = uuidv4()
    const accessToken = await getWalmartToken(tokenCredentials, correlationId)
    const config = {
      headers: {
        'WM_SEC.ACCESS_TOKEN': accessToken,
        'WM_QOS.CORRELATION_ID': uuidv4(),
        'WM_CONSUMER.CHANNEL.TYPE': uuidv4(),
        'WM_SVC.NAME': 'Walmart Marketplace',
        'Content-Type': 'application/json'
      }
    };

    // Request body
    const requestBody = {
      feedType: "MP_WFS_ITEM",
      version: "5.0.20240517-04_08_27-api",
      productTypes: [
        category.categoryName
      ]
    };

    // Make request to Walmart's API
    const response = await axios.post(
      `https://marketplace.walmartapis.com/v3/items/spec`,
      requestBody,
      config
    );
    
    // Extract the schema properties for the category
    const schema = response.data.schema;
    const categoryProperties = schema?.properties?.MPItem?.items?.properties;
    
    // Transform properties into aspects format
    const aspects = [];
    
    // Use the properties under "Visible" from the schema
    const visibleProps = categoryProperties?.Visible?.properties || {};

    // Transform into eBay-like response
    for (const [key, value] of Object.entries(visibleProps)) {
      if (value.type === 'object' && value.properties) {
        // If the property is an object, iterate its inner properties.
        // Use the parent's "required" array for determining required fields.
        const requiredFields = value.required || [];
        for (const [innerKey, innerValue] of Object.entries(value.properties)) {
          if (innerValue.type && innerKey !== 'sku' && innerKey !== 'productName' && innerKey !== 'mainImageUrl' && innerKey !== 'productSecondaryImageURL' && innerKey !== 'assembledProductLength' && innerKey !== 'assembledProductWidth'&& innerKey !== 'assembledProductWeight'&& innerKey !== 'assembledProductHeight') { // Skip sku if needed
            const aspect = {
              localizedAspectName: convertToTitleCase(innerKey),
              aspectConstraint: {
                aspectDataType: mapWalmartTypeToEbay(innerValue.type),
                itemToAspectCardinality: innerValue.type === 'array' ? 'MULTI' : 'SINGLE',
                aspectMode: innerValue.enum || innerValue?.items?.enum ? 'SELECTION_ONLY' : 'FREE_TEXT',
                aspectRequired: requiredFields.includes(innerKey),
                aspectUsage: requiredFields.includes(innerKey) ? 'RECOMMENDED' : 'OPTIONAL',
                aspectEnabledForVariations: false,
                aspectApplicableTo: ['PRODUCT']
              },
              aspectValues: innerValue.enum ? innerValue.enum.map(val => ({
                localizedValue: val.toString()
              })) : innerValue?.items?.enum ? innerValue?.items?.enum.map(val => ({
                localizedValue: val.toString()
              })): []
            };
            if (innerValue.examples) {
              aspect.example = innerValue.examples;
            }
            aspects.push(aspect);
          }
        }
      } else if (value.type && key !== 'sku' && key !== 'productName' && key !== 'mainImageUrl' && key !== 'productSecondaryImageURL' && key !== 'assembledProductLength' && key !== 'assembledProductWidth'&& key !== 'assembledProductWeight'&& key !== 'assembledProductHeight') {
        // Fallback handling for non-object schema fields
        const aspect = {
          localizedAspectName: convertToTitleCase(key),
          aspectConstraint: {
            aspectDataType: mapWalmartTypeToEbay(value.type),
            itemToAspectCardinality: value.type === 'array' ? 'MULTI' : 'SINGLE',
            aspectMode: value.enum || value?.items?.enum ? 'SELECTION_ONLY' : 'FREE_TEXT',
            // Fallback to Orderable required fields if available
            aspectRequired: (categoryProperties?.Orderable?.required || []).includes(key),
            aspectUsage: (categoryProperties?.Orderable?.required || []).includes(key) ? 'RECOMMENDED' : 'OPTIONAL',
            aspectEnabledForVariations: false,
            aspectApplicableTo: ['PRODUCT']
          },
          aspectValues: value.enum ? value.enum.map(val => ({
            localizedValue: val.toString()
          })) : value?.items?.enum ? value?.items?.enum.map(val => ({
            localizedValue: val.toString()
          })):  []
        };
        if (value.examples) {
          aspect.example = value.examples;
        }
        aspects.push(aspect);
      }
    }
    const transformedData = {
      'WALMART_US': {
        categoryId: {
          id: category.categoryId,
          name: category.categoryName
        },
        aspects: aspects
      }
    };

    return {
      success: true,
      status: 200,
      data: transformedData
    };

  } catch (error) {
    console.error("Walmart API Error:", error?.response?.data || error.message);
    return {
      success: false,
      status: 400,  // Added status to match eBay response
      message: error?.response?.data?.message || error.message
    };
  }
};
exports.insertCategoryAttributesFromFile = async () => {
  try {
    let categories = null;

    // Check if the file exists and read its content
    if (fs.existsSync(attributeJsonFilePath)) {
      categories = JSON.parse(fs.readFileSync(attributeJsonFilePath, 'utf8'));
    }

    // Loop through the categories and insert them into the database
    for (const category of Object.keys(categories)) {
      const categoryAttr = categories[category];
      try {
        await categoryAttributes.create({
          marketPlaceId: 18,
          categoryName: category,
          attributes: categoryAttr
        });
      } catch (dbError) {
        console.error(`Error inserting category "${category}" into categoryAttributes table:`, dbError);
      }
    }

    console.log('Data successfully inserted into the categoryAttributes table.');
  } catch (error) {
    console.error('Error inserting data into categoryAttributes table:', error);
  }
};







    