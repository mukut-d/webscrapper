const fs = require("fs");
const path = require("path");
const xlsxPopulate = require("xlsx-populate");

//NOTE - generate Excel With Dropdown for product id
const generateExcelWithDropdownForProductId = async (
  marketplacesDetails,
  excelFilePath,
  type
) => {
  try {
    const workbook = await xlsxPopulate.fromBlankAsync();

    //NOTE: Create a new sheet for the dropdown list
    const dropdownSheet = workbook.addSheet("DropdownList");
    const dropdownValues = marketplacesDetails.map(({ parentMarketplace }) => [
      parentMarketplace,
    ]);

    dropdownSheet.cell("A1").value(dropdownValues);

    //NOTE: Create the main sheet
    const sheet = workbook.sheet(0);

    //NOTE: Set headers
    sheet.cell("A1").value("Marketplace");
    if (type === "byId") {
      sheet.cell("B1").value("ProductID");
    } else if (type === "byUrl") {
      sheet.cell("B1").value("URL");
      sheet.cell("C1").value("HSKU");
      sheet.cell("D1").value("Variant");
    }

    //NOTE: Set data validation for the entire "A" column
    const dropdownRange = `'DropdownList'!$A$1:$A${marketplacesDetails.length}`;
    sheet.range(`A2:A${marketplacesDetails.length + 1}`).dataValidation({
      type: "list",
      formula1: dropdownRange,
    });

    //NOTE: Set other values as needed
    marketplacesDetails.forEach(({ parentMarketplace }, index) => {
      const rowIndex = index + 2; // Start from the second row

      sheet.cell(`A${rowIndex}`).value(parentMarketplace);
      sheet.cell(`B${rowIndex}`).value("");
    });

    //NOTE: Save the workbook to the specified file path
    await workbook.toFileAsync(excelFilePath);
  } catch (error) {
    console.error("Error generating Excel file 2:", error);
  }
};

//ANCHOR - generate Excel And Return Base64
exports.generateExcelAndReturnBase64 = async (marketplacesDetails, type) => {
  try {
    const excelFilePath = path.join(__dirname, "marketplaces_details.xlsx");

    //NOTE: Generate Excel with headers and dropdown
    await generateExcelWithDropdownForProductId(
      marketplacesDetails,
      excelFilePath,
      type
    );

    //NOTE: Read the generated Excel file
    const fileData = await fs.promises.readFile(excelFilePath);

    //NOTE: Convert the file data to base64
    const base64Data = fileData.toString("base64");
    const fileName = "marketplaces_details.xlsx";

    return { base64Data, fileName };
  } catch (error) {
    console.error("Error generating Excel file 1:", error.message);
    throw error; // You may handle the error as needed in your application
  }
};
