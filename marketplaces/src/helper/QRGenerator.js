const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");

exports.generateQRHandler = async (req, res) => {
  const { sku, count } = req.body;

  if (!sku || !count || count <= 0) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const doc = new PDFDocument({ autoFirstPage: false });
  const barcodeWidth = 3.0 * 28.35;  
  const barcodeHeight = 1.2 * 28.35; 
  const margin = 20;
  const spacing = 22;
  const itemsPerRow = 5;

  const rows = Math.ceil(count / itemsPerRow);
  const pageHeight = margin * 2 + rows * (barcodeHeight + spacing);

  doc.addPage({ size: [595.28, pageHeight] }); 

  for (let i = 0; i < count; i++) {
    const col = i % itemsPerRow;
    const row = Math.floor(i / itemsPerRow);
    const x = margin + col * (barcodeWidth + spacing);
    const y = margin + row * (barcodeHeight + spacing);

    const pngBuffer = await bwipjs.toBuffer({
      bcid:        'code128',
      text:        sku,
      scale:       3,
      height:      10,           
      includetext: true,         
      textxalign:  'center',    
      textsize:    10,          
      backgroundcolor: 'FFFFFF' 
    });

    doc.image(pngBuffer, x, y, {
      width: barcodeWidth,
      height: barcodeHeight
    });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${sku}.pdf`);
  doc.pipe(res);
  doc.end();
};