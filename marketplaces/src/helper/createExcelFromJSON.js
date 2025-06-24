const XLSX = require("xlsx");

async function createExcelFromJSON(
  data,
  sheetName = "Sheet1",
  options = { bookType: "xlsx", bookSST: false, type: "buffer" }
) {
  // Create a new workbook
  const workbook = XLSX.utils.book_new();
  // Convert JSON data to a worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  // Append the worksheet to the workbook with the provided sheet name
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  // Write the workbook to a buffer
  const buffer = XLSX.write(workbook, options);

  return buffer;
}

// Export the function
module.exports = createExcelFromJSON;
