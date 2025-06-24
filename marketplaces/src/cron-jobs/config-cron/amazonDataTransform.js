exports.transformAmazonDataToSchema = async(data) => {
    const requiredFields = data.required || [];
    const transformedProperties = {};
  
    // Helper function to process properties
    const processProperties = (properties) => {
      const result = {};
      for (const prop in properties) {
        const propData = properties[prop];
        result[prop] = {
          type: propData.type || "string"
        };
  
        // Add enum if available and type is not boolean
        if (propData.enum && propData.type !== "boolean") {
          result[prop].enum = propData.enum;
        }
  
        // Handle nested objects
        if (propData.type === "object" && propData.properties) {
          result[prop].properties = processProperties(propData.properties);
        }
  
        // Handle array type fields with items
        if (propData.type === "array" && propData.items) {
          result[prop].items = {
            type: propData.items.type || "string"
          };
  
          // Add enum if available and type is not boolean
          if (propData.items.enum && propData.items.type !== "boolean") {
            result[prop].items.enum = propData.items.enum;
          }
  
          // Process nested properties if they exist
          if (propData.items.properties) {
            result[prop].items.properties = processProperties(propData.items.properties);
          }
        }
      }
      return result;
    };
  
    // Process each required field
    for (const field of requiredFields) {
      if (data.properties && data.properties[field]) {
        const fieldData = data.properties[field];
  
        // Initialize the basic structure for this field
        transformedProperties[field] = {
          description: fieldData.description || "",
          type: fieldData.type || ""
        };
  
        // Handle array type fields with items
        if (fieldData.type === "array" && fieldData.items) {
          transformedProperties[field].items = {
            type: fieldData.items.type || "string",
          };
  
          // Add required fields if they exist
          if (fieldData.items.required && fieldData.items.required.length > 0) {
            transformedProperties[field].items.required = fieldData.items.required;
          }
  
          // Process properties if they exist
          if (fieldData.items.properties) {
            transformedProperties[field].items.properties = processProperties(fieldData.items.properties);
          }
        }
  
        // Add top-level enum if available and type is not boolean
        if (fieldData.enum && fieldData.type !== "boolean") {
          transformedProperties[field].enum = fieldData.enum;
        }
      }
    }
  
    // Create the final schema structure
    const schema = {
      description: "Amazon Product Data Schema",
      type: "array",
      items: {
        type: "object",
        properties: transformedProperties,
        required: requiredFields
      }
    };
  
    return schema;
  };

// exports.transformAmazonDataToSchema = async(data) => {
//     const requiredFields = data.required || [];
//     const transformedProperties = {};
  
//     // Process each required field
//     for (const field of requiredFields) {
//       if (data.properties && data.properties[field]) {
//         const fieldData = data.properties[field];
  
//         // Initialize the basic structure for this field
//         transformedProperties[field] = {
//           description: fieldData.description || "",
//           type: fieldData.type || ""
//         };
  
//         // Handle array type fields with items
//         if (fieldData.type === "array" && fieldData.items) {
//           transformedProperties[field].items = {
//             type: fieldData.items.type || "",
//           };
  
//           // Add required fields if they exist
//           if (fieldData.items.required && fieldData.items.required.length > 0) {
//             transformedProperties[field].items.required = fieldData.items.required;
//           }
  
//           // Process properties if they exist
//           if (fieldData.items.properties) {
//             transformedProperties[field].items.properties = {};
  
//             for (const prop in fieldData.items.properties) {
//               const propData = fieldData.items.properties[prop];
  
//               // Handle nested objects
//               if (propData.type === "object" && propData.properties) {
//                 transformedProperties[field].items.properties[prop] = {
//                   type: "object",
//                   properties: {}
//                 };
  
//                 // Process nested properties
//                 for (const nestedProp in propData.properties) {
//                   const nestedPropData = propData.properties[nestedProp];
//                   transformedProperties[field].items.properties[prop].properties[nestedProp] = {
//                     type: nestedPropData.type || "string"
//                   };
  
//                   // Add enum if available and type is not boolean
//                   if (nestedPropData.enum && nestedPropData.type !== "boolean") {
//                     transformedProperties[field].items.properties[prop].properties[nestedProp].enum = nestedPropData.enum;
//                   }
//                 }
//               } else {
//                 transformedProperties[field].items.properties[prop] = {
//                   type: propData.type || "string"
//                 };
  
//                 // Add enum if available and type is not boolean
//                 if (propData.enum && propData.type !== "boolean") {
//                   transformedProperties[field].items.properties[prop].enum = propData.enum;
//                 }
//               }
//             }
//           }
//         }
  
//         // Add top-level enum if available and type is not boolean
//         if (fieldData.enum && fieldData.type !== "boolean") {
//           transformedProperties[field].enum = fieldData.enum;
//         }
//       }
//     }
  
//     // Create the final schema structure
//     const schema = {
//       description: "Amazon Product Data Schema",
//       type: "array",
//       items: {
//         type: "object",
//         properties: transformedProperties,
//         required: requiredFields
//       }
//     };
  
//     return schema;
//   };

// exports.transformAmazonDataToSchema = async(data) => {
//   const requiredFields = data.required || [];
//   const transformedProperties = {};
  
//   // Process each required field
//   for (const field of requiredFields) {
//     if (data.properties && data.properties[field]) {
//       const fieldData = data.properties[field];
      
//       // Initialize the basic structure for this field
//       transformedProperties[field] = {
//         description: fieldData.description || "",
//         type: fieldData.type || ""
//       };
      
//       // Handle array type fields with items
//       if (fieldData.type === "array" && fieldData.items) {
//         transformedProperties[field].items = {
//           type: fieldData.items.type || "",
//         };
        
//         // Add required fields if they exist
//         if (fieldData.items.required && fieldData.items.required.length > 0) {
//           transformedProperties[field].items.required = fieldData.items.required;
//         }
        
//         // Process properties if they exist
//         if (fieldData.items.properties) {
//           transformedProperties[field].items.properties = {};
          
//           for (const prop in fieldData.items.properties) {
//             const propData = fieldData.items.properties[prop];
            
//             // Handle nested objects
//             if (propData.type === "object" && propData.properties) {
//               transformedProperties[field].items.properties[prop] = {
//                 type: "object",
//                 properties: {}
//               };
              
//               // Process nested properties
//               for (const nestedProp in propData.properties) {
//                 const nestedPropData = propData.properties[nestedProp];
//                 transformedProperties[field].items.properties[prop].properties[nestedProp] = {
//                   type: nestedPropData.type || "string"
//                 };
                
//                 // Add enum if available and not batteries_required
//                 if (nestedPropData.enum && 
//                     field !== "batteries_required" && 
//                     prop !== "batteries_required" && 
//                     nestedProp !== "batteries_required") {
//                   transformedProperties[field].items.properties[prop].properties[nestedProp].enum = nestedPropData.enum;
//                 }
//               }
//             } else {
//               transformedProperties[field].items.properties[prop] = {
//                 type: propData.type || "string"
//               };
              
//               // Add enum if available and not batteries_required
//               if (propData.enum && field !== "batteries_required" && prop !== "batteries_required") {
//                 transformedProperties[field].items.properties[prop].enum = propData.enum;
//               }
//             }
//           }
//         }
//       }
      
//       // Add top-level enum if available and not batteries_required
//       if (fieldData.enum && field !== "batteries_required") {
//         transformedProperties[field].enum = fieldData.enum;
//       }
//     }
//   }
  
//   // Create the final schema structure
//   const schema = {
//     description: "Amazon Product Data Schema",
//     type: "array",
//     items: {
//       type: "object",
//       properties: transformedProperties,
//       required: requiredFields
//     }
//   };
  
//   return schema;
// };


// exports.transformAmazonDataToSchema = async(data) => {
//   const requiredFields = data.required || [];
//   const transformedProperties = requiredFields.reduce((acc, field) => {
//       if (data.properties && data.properties[field]) {
//           const fieldData = data.properties[field];
//           acc[field] = {
//               description: fieldData.description || "",
//               type: fieldData.type || "",
//           };

//           // Add enum if available at the top level, length <= 20, and field is not batteries_required
//           if (fieldData.enum && field !== "batteries_required") {
//               acc[field].enum = fieldData.enum;
//           }

//           if (fieldData.items) {
//               acc[field].items = {
//                   type: fieldData.items.type || "",
//                   required: fieldData.items.required || [],
//                   properties: {},
//               };

//               // Add enum if available at the items level, length <= 20, and field is not batteries_required
//               if (fieldData.items.enum && field !== "batteries_required") {
//                   acc[field].items.enum = fieldData.items.enum;
//               }

//               if (fieldData.items.properties) {
//                   for (const prop in fieldData.items.properties) {
//                       const propData = fieldData.items.properties[prop];

//                       // Handle nested properties correctly
//                       if (propData.type === "object" && propData.properties) {
//                           acc[field].items.properties[prop] = {
//                               properties: {}
//                           };

//                           // Process nested properties
//                           for (const nestedProp in propData.properties) {
//                               const nestedPropData = propData.properties[nestedProp];
//                               acc[field].items.properties[prop].properties[nestedProp] = {
//                                   type: nestedPropData.type || "string"
//                               };

//                               // Add enum if available at the nested property level, length <= 20, and field is not batteries_required
//                               if (nestedPropData.enum && nestedPropData.enum.length <= 20 && field !== "batteries_required") {
//                                   acc[field].items.properties[prop].properties[nestedProp].enum = nestedPropData.enum;
//                               }
//                           }

//                           acc[field].items.properties[prop].type = "object";
//                       } else {
//                           acc[field].items.properties[prop] = {
//                               type: propData.type || "string"
//                           };

//                           // Add enum if available at the property level, length <= 20, and field is not batteries_required
//                           if (propData.enum && propData.enum.length <= 20 && field !== "batteries_required") {
//                               acc[field].items.properties[prop].enum = propData.enum;
//                           }
//                       }
//                   }
//               }
//           }
//       }
//       return acc;
//   }, {});
//   const schema = {
//       description: "Amazon Product Data Schema",
//       type: "array",
//       items: {
//           type: "object",
//           properties: transformedProperties,
//           required: requiredFields,
//       },
//   };
//   return schema;
// };

// exports.transformAmazonDataToSchema = async(data) => {
//   const requiredFields = data.required || [];
//   const transformedProperties = requiredFields.reduce((acc, field) => {
//       if (data.properties && data.properties[field]) {
//           const fieldData = data.properties[field];
//           acc[field] = {
//               description: fieldData.description || "",
//               type: fieldData.type || "",
//           };

//           // Add enum if available at the top level and length <= 20
//           if (fieldData.enum && fieldData.enum.length <= 20) {
//               acc[field].enum = fieldData.enum;
//           }

//           if (fieldData.items) {
//               acc[field].items = {
//                   type: fieldData.items.type || "",
//                   required: fieldData.items.required || [],
//                   properties: {},
//               };

//               // Add enum if available at the items level and length <= 20
//               if (fieldData.items.enum && fieldData.items.enum.length <= 20) {
//                   acc[field].items.enum = fieldData.items.enum;
//               }

//               if (fieldData.items.properties) {
//                   for (const prop in fieldData.items.properties) {
//                       const propData = fieldData.items.properties[prop];

//                       // Handle nested properties correctly
//                       if (propData.type === "object" && propData.properties) {
//                           acc[field].items.properties[prop] = {
//                               properties: {}
//                           };

//                           // Process nested properties
//                           for (const nestedProp in propData.properties) {
//                               const nestedPropData = propData.properties[nestedProp];
//                               acc[field].items.properties[prop].properties[nestedProp] = {
//                                   type: nestedPropData.type || "string"
//                               };

//                               // Add enum if available at the nested property level and length <= 20
//                               if (nestedPropData.enum && nestedPropData.enum.length <= 20) {
//                                   acc[field].items.properties[prop].properties[nestedProp].enum = nestedPropData.enum;
//                               }
//                           }

//                           acc[field].items.properties[prop].type = "object";
//                       } else {
//                           acc[field].items.properties[prop] = {
//                               type: propData.type || "string"
//                           };

//                           // Add enum if available at the property level and length <= 20
//                           if (propData.enum && propData.enum.length <= 20) {
//                               acc[field].items.properties[prop].enum = propData.enum;
//                           }
//                       }
//                   }
//               }
//           }
//       }
//       return acc;
//   }, {});
//   const schema = {
//       description: "Amazon Product Data Schema",
//       type: "array",
//       items: {
//           type: "object",
//           properties: transformedProperties,
//           required: requiredFields,
//       },
//   };
//   return schema;
// };

// exports.transformAmazonDataToSchema = async(data) => {
//   const requiredFields = data.required || [];
//   const transformedProperties = requiredFields.reduce((acc, field) => {
//       if (data.properties && data.properties[field]) {
//           const fieldData = data.properties[field];
//           acc[field] = {
//               description: fieldData.description || "",
//               type: fieldData.type || "",
//           };

//           // Add enum if available at the top level
//           if (fieldData.enum) {
//               acc[field].enum = fieldData.enum;
//           }

//           if (fieldData.items) {
//               acc[field].items = {
//                   type: fieldData.items.type || "",
//                   required: fieldData.items.required || [],
//                   properties: {},
//               };

//               // Add enum if available at the items level
//               if (fieldData.items.enum) {
//                   acc[field].items.enum = fieldData.items.enum;
//               }

//               if (fieldData.items.properties) {
//                   for (const prop in fieldData.items.properties) {
//                       const propData = fieldData.items.properties[prop];

//                       // Handle nested properties correctly
//                       if (propData.type === "object" && propData.properties) {
//                           acc[field].items.properties[prop] = {
//                               properties: {}
//                           };

//                           // Process nested properties
//                           for (const nestedProp in propData.properties) {
//                               const nestedPropData = propData.properties[nestedProp];
//                               acc[field].items.properties[prop].properties[nestedProp] = {
//                                   type: nestedPropData.type || "string"
//                               };

//                               // Add enum if available at the nested property level
//                               if (nestedPropData.enum) {
//                                   acc[field].items.properties[prop].properties[nestedProp].enum = nestedPropData.enum;
//                               }
//                           }

//                           acc[field].items.properties[prop].type = "object";
//                       } else {
//                           acc[field].items.properties[prop] = {
//                               type: propData.type || "string"
//                           };

//                           // Add enum if available at the property level
//                           if (propData.enum) {
//                               acc[field].items.properties[prop].enum = propData.enum;
//                           }
//                       }
//                   }
//               }
//           }
//       }
//       return acc;
//   }, {});
//   const schema = {
//       description: "Amazon Product Data Schema",
//       type: "array",
//       items: {
//           type: "object",
//           properties: transformedProperties,
//           required: requiredFields,
//       },
//   };
//   return schema;
// };

// exports.transformAmazonDataToSchema = async(data) => {
//   const requiredFields = data.required || [];

//   const transformedProperties = requiredFields.reduce((acc, field) => {
//       if (data.properties && data.properties[field]) {
//           const fieldData = data.properties[field];
//           acc[field] = {
//               description: fieldData.description || "",
//               type: fieldData.type || "",
//           };

//           if (fieldData.items) {
//               acc[field].items = {
//                   type: fieldData.items.type || "",
//                   required: fieldData.items.required || [],
//                   properties: {},
//               };

//               if (fieldData.items.properties) {
//                   for (const prop in fieldData.items.properties) {
//                       const propData = fieldData.items.properties[prop];

//                       // Handle nested properties correctly
//                       if (propData.type === "object" && propData.properties) {
//                           acc[field].items.properties[prop] = {
//                               properties: {}
//                           };

//                           // Process nested properties
//                           for (const nestedProp in propData.properties) {
//                               acc[field].items.properties[prop].properties[nestedProp] = {
//                                   type: propData.properties[nestedProp].type || "string"
//                               };
//                           }

//                           acc[field].items.properties[prop].type = "object";
//                       } else {
//                           acc[field].items.properties[prop] = {
//                               type: propData.type || "string"
//                           };
//                       }
//                   }
//               }
//           }
//       }
//       return acc;
//   }, {});

//   const schema = {
//       description: "Amazon Product Data Schema",
//       type: "array",
//       items: {
//           type: "object",
//           properties: transformedProperties,
//           required: requiredFields,
//       },
//   };

//   return schema;
// };

// exports.transformAmazonDataToSchema = async(data) => {
//     const requiredFields = data.required || [];

//   const transformedProperties = requiredFields.reduce((acc, field) => {
//     if (data.properties && data.properties[field]) {
//       const fieldData = data.properties[field];
//       acc[field] = {
//         description: fieldData.description || "",
//         type: fieldData.type || "",
//       };

//       if (fieldData.items) {
//         acc[field].items = {
//           type: fieldData.items.type || "",
//           required: fieldData.items.required || [],
//           properties: {},
//         };

//         if (fieldData.items.properties) {
//           for (const prop in fieldData.items.properties) {
//             acc[field].items.properties[prop] = {
//               type: fieldData.items.properties[prop].type || "string",
//             };
//           }
//         }
//       }
//     }
//     return acc;
//   }, {});

//   const schema = {
//     description: "Amazon Product Data Schema",
//     type: "array",
//     items: {
//       type: "object",
//       properties: transformedProperties,
//       required: requiredFields,
//     },
//   };

//   return schema;
// };

// // exports.transformAmazonDataToSchema = (data) => {
// //   const requiredFields = data.required || [];

// //   const transformedProperties = requiredFields.reduce((acc, field) => {
// //     if (data.properties[field]) {
// //       const fieldData = data.properties[field];
// //       acc[field] = {
// //         description: fieldData.description || "",
// //         type: fieldData.type || "",
// //       };

// //       if (fieldData.items) {
// //         acc[field].items = {
// //           type: fieldData.items.type || "",
// //           required: fieldData.items.required || [],
// //           properties: {},
// //         };

// //         for (const prop in fieldData.items.properties) {
// //           acc[field].items.properties[prop] = {
// //             type: "string",
// //           };
// //         }
// //       }
// //     }
// //     return acc;
// //   }, {});

// //   const schema = {
// //     description: "Amazon Product Data Schema",
// //     type: "array",
// //     items: {
// //       type: "object",
// //       properties: transformedProperties,
// //       required: requiredFields,
// //     },
// //   };

// //   return schema;
// // };
