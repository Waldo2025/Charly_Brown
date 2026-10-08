async function pdfFromImage(bytes) {
  const PDFDocument = require('pdfkit');
  const png = await require('sharp')(bytes).png().toBuffer();
  const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.image(png, 0, 0, { fit: [pdf.page.width, pdf.page.height], align: 'center', valign: 'center' });
  pdf.end();
  return done;
}

module.exports = { pdfFromImage };
