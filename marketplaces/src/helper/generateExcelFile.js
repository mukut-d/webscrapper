const xlsxPopulate = require('xlsx-populate');
const { uploadToS3 } = require('./uploadFile');
const fs = require('fs') ;

const generateExcelFile = async (jsonData, filePath, headers) => {
  try {
    // console.log(jsonData ,jsonData?.length ,  'jsonData')
    // console.log(filePath , 'filePath')
    // console.log(headers , 'headers')
    console.log('generating the Update Report Excel --------->')
    // Create a new workbook
    const workbook = await xlsxPopulate.fromBlankAsync()
    // Get the first sheet
    const sheet = workbook.sheet(0)
    // Add headers to the sheet
    headers.forEach((header, index) => {
      sheet.cell(1, index + 1).value(header)
    })

    jsonData?.forEach((item, rowIndex) => {
      headers.forEach((header, colIndex) => {
        const cellValue = header === 'Error'
            ? item[header]?.meta?.message ||
              item[header]?.meta?.responses?.[0]?.errors?.[0]?.message
            : header === 'length' ? item['depth'] : item[header] || null
        sheet.cell(rowIndex + 2, colIndex + 1).value(cellValue)
      })
    })

    //NOTE - Save the workbook to a file
    await workbook.toFileAsync(filePath)
    console.log('sheet created ---->')
    console.log('generating the Update Report Excel Completed--------->')
    return true ;
  } catch (error) {
    console.log(
      'error occured while generating the Excel file ------------>',
      error
    )
    return false ;
  }
}

module.exports = generateExcelFile;
