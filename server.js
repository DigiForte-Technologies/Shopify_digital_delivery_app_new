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
app.use(express.static('public')); // Serve frontend files

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
function generateDownloadToken(orderId, fileUrl) {
  const token = crypto.randomBytes(16).toString('hex');
  downloadTokens[token] = {
    orderId,
    fileUrl,
    // Link valid for 24 hours
    expires: Date.now() + (24 * 60 * 60 * 1000),
    downloadsLeft: 3, // Limit to 3 downloads
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

  // If fileUrl starts with http, redirect; otherwise, serve as a local file.
  if (tokenData.fileUrl.startsWith('http')) {
    return res.redirect(tokenData.fileUrl);
  } else {
    return res.download(path.resolve(tokenData.fileUrl));
  }
});

// --- Shopify Order Webhook --- //
// Register this webhook in your Shopify admin.
app.post('/webhook/order-created', async (req, res) => {
  const order = req.body;
  console.log('Received new order:', order.id);

  // Assume the order has a line item and its product ID is used to fetch metafields.
  const digitalProduct = order.line_items && order.line_items[0];
  let fileUrl = null;
  if (digitalProduct) {
    const productId = digitalProduct.product_id;
    try {
      const metafieldRes = await axios.get(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products/${productId}/metafields.json`, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_API_PASSWORD,
          'Content-Type': 'application/json'
        }
      });
      const metafields = metafieldRes.data.metafields;
      const digitalFileField = metafields.find(field =>
        field.namespace === 'digital_download' && field.key === 'digital_file'
      );
      if (digitalFileField) {
        fileUrl = digitalFileField.value;
      }
    } catch (err) {
      console.error("Error fetching metafields:", err.response?.data || err.message);
    }
  }

  if (!fileUrl) {
    console.error("No digital file found for order", order.id);
    return res.sendStatus(500);
  }

  // Generate secure download token using the actual fileUrl.
  const token = generateDownloadToken(order.id, fileUrl);
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
// Lists files in the "uploads" directory.
app.get('/admin/uploads', (req, res) => {
  fs.readdir('uploads/', (err, files) => {
    if (err) return res.status(500).json({ error: 'Error reading files' });
    res.json({ files });
  });
});

// --- Admin: Fetch Shopify Products --- //
app.get('/admin/products', async (req, res) => {
  try {
    const response = await axios.get(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_API_PASSWORD,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data.products);
  } catch (err) {
    console.error("Error fetching products:", err.response?.data || err.message);
    res.status(500).json({ error: 'Error fetching products' });
  }
});

// --- Admin: Attach File to a Shopify Product --- //
// Updates a product metafield with the asset file URL.
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
          type: "string",
          namespace: "digital_download"
        }]
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_API_PASSWORD,
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
