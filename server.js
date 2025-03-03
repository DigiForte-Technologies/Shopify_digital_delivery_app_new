// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const multer  = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

app.use(express.static('public'));

// --- File Upload Configuration --- //
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// --- In-memory Token Store --- //
// For MVP only—later move to a DB!
const downloadTokens = {};

// --- Generate Secure Download Token --- //
function generateDownloadToken(orderId, filePath) {
  const token = crypto.randomBytes(16).toString('hex');
  downloadTokens[token] = {
    orderId,
    filePath,
    // Link valid for 24 hours
    expires: Date.now() + (24 * 60 * 60 * 1000),
    downloadsLeft: 3, // Example: limit to 3 downloads
  };
  return token;
}

// --- File Upload Endpoint --- //
app.post('/upload', upload.single('file'), (req, res) => {
  // In production, save file metadata to your database
  res.json({ message: 'File uploaded successfully', file: req.file });
});

// --- Secure Download Endpoint --- //
app.get('/download/:token', (req, res) => {
  const tokenData = downloadTokens[req.params.token];
  if (!tokenData) return res.status(404).send('Invalid download link.');
  if (Date.now() > tokenData.expires) return res.status(403).send('Download link expired.');
  if (tokenData.downloadsLeft <= 0) return res.status(403).send('Download limit exceeded.');

  // Decrement available downloads
  tokenData.downloadsLeft--;

  // Send the file to the customer
  res.download(path.resolve(tokenData.filePath));
});

// --- Shopify Order Webhook --- //
// Make sure to register this webhook in your Shopify admin
app.post('/webhook/order-created', async (req, res) => {
  const order = req.body;
  console.log('Received new order:', order.id);

  // For each order, determine the corresponding digital file.
  // This sample assumes a simple mapping; replace with your business logic.
  const filePath = 'uploads/sample-file.png';

  // Generate a secure download token
  const token = generateDownloadToken(order.id, filePath);
  const downloadLink = `${process.env.APP_BASE_URL}/download/${token}`;

  // --- Send Email Notification --- //
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    let info = await transporter.sendMail({
      from: `"Your Shop" <${process.env.SMTP_USER}>`,
      to: order.email,
      subject: "Your Digital Download is Ready",
      text: `Thank you for your order. Download your file here: ${downloadLink}`,
      html: `<p>Thank you for your order.</p><p><a href="${downloadLink}">Download your file</a></p>`,
    });
    console.log('Email sent:', info.messageId);
  } catch (err) {
    console.error('Error sending email:', err);
  }

  res.sendStatus(200);
});

// --- Admin: List Uploaded Files --- //
// This can serve as your standalone admin panel endpoint.
app.get('/admin/uploads', (req, res) => {
  fs.readdir('uploads/', (err, files) => {
    if (err) return res.status(500).json({ error: 'Error reading files' });
    res.json({ files });
  });
});

// --- Admin: Attach File to a Shopify Product --- //
// This endpoint shows how to update a product with a file URL via Shopify API.
app.post('/admin/attach-file', async (req, res) => {
    const { productId, fileUrl } = req.body;
  
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products/${productId}.json`;
  
    try {
      const response = await axios.put(url, {
        product: {
          id: productId,
          metafields: [{
            key: "digital_file",
            value: fileUrl,
            type: "string", // Updated from `value_type`
            namespace: "digital_download"
          }]
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_API_PASSWORD, // Use OAuth token if it's a public app
          'Content-Type': 'application/json',
        }
      });
  
      res.json(response.data);
    } catch (error) {
      console.error("Error attaching file to product:", error.response?.data || error.message);
      res.status(500).json({ error: 'Error attaching file to product' });
    }
  });
  

// --- Start the Server --- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));
