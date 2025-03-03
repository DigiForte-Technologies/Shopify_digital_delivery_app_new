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
app.use(bodyParser.urlencoded({ extended: true })); // for form submissions
app.use(express.static('public')); // Serve static files from public folder

// --- Basic Auth Middleware --- //
function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).send('Authentication required.');
  }
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.user = username; // store username for later use
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).send('Authentication required.');
  }
}

// --- Serve Admin Pages Protected by Basic Auth --- //
// Main Admin UI (index.html)
app.get('/admin', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Email Editor Page (email-editor.html)
app.get('/admin/email-editor', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'email-editor.html'));
});


// --- Settings (SMTP & Email Template) --- //
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}));
    return {};
  }
  let rawData = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
  if (!rawData) return {};
  try {
    return JSON.parse(rawData);
  } catch (e) {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// GET: Retrieve email template for the logged-in admin
app.get('/admin/settings/email-template', basicAuth, (req, res) => {
  let settings = loadSettings();
  let userSettings = settings[req.user] || {};
  let emailTemplate = userSettings.emailTemplate || null;
  res.json({ template: emailTemplate });
});
  
// POST: Update email template for the logged-in admin
app.post('/admin/settings/email-template', basicAuth, (req, res) => {
  let settings = loadSettings();
  let userSettings = settings[req.user] || {};
  userSettings.emailTemplate = req.body; // expects { design: ..., html: ... }
  settings[req.user] = userSettings;
  saveSettings(settings);
  res.json({ message: 'Template updated successfully' });
});
  
// GET: Retrieve SMTP settings for the logged-in admin
app.get('/admin/settings/smtp', basicAuth, (req, res) => {
  let settings = loadSettings();
  let userSettings = settings[req.user] || {};
  let smtpSettings = userSettings.smtp || null;
  res.json({ smtp: smtpSettings });
});
  
// POST: Update SMTP settings for the logged-in admin
app.post('/admin/settings/smtp', basicAuth, (req, res) => {
  let settings = loadSettings();
  let userSettings = settings[req.user] || {};
  userSettings.smtp = req.body; // expects { host, port, user, pass }
  settings[req.user] = userSettings;
  saveSettings(settings);
  res.json({ message: 'SMTP settings updated successfully' });
});


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

// --- In-memory Order Delivery Store --- //
// Mapping orderId => array of { productId, token }
const orderDeliveries = {};

// --- Shopify Order Webhook --- //
app.post('/webhook/order-created', async (req, res) => {
  const order = req.body;
  console.log('Received new order:', order.id);

  // For each line item, generate a download token if it’s digital.
  // (This is a simplified example; add your own logic to determine if an item is digital)
  await Promise.all(order.line_items.map(async (item) => {
    const productId = item.product_id;
    let fileUrl = null;
    try {
      // Fetch product metafields to get the digital file URL
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
      console.error("Error fetching metafields for product", productId, err.response?.data || err.message);
    }

    if (fileUrl) {
      // Generate a secure download token for this digital product
      const token = generateDownloadToken(order.id, fileUrl);
      // Store the token under the order ID for later retrieval on the delivery page
      if (!orderDeliveries[order.id]) orderDeliveries[order.id] = [];
      orderDeliveries[order.id].push({ productId, token });
    }
  }));

  // Instead of sending separate links, send a consolidated link to a custom order delivery page.
  const downloadLink = `${process.env.APP_BASE_URL}/orders/${order.id}`;

  // --- Send Email Notification --- //
  // Create transporter (using process.env SMTP settings here)
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    let info = await transporter.sendMail({
      from: `"Your Shop" <${process.env.SMTP_USER}>`,
      to: order.email,
      subject: "Your Digital Download is Ready",
      text: `Thank you for your order. Access your digital downloads here: ${downloadLink}`,
      html: `<p>Thank you for your order.</p><p><a href="${downloadLink}">Click here to view your downloads</a></p>`,
    });
    console.log('Email sent:', info.messageId);
  } catch (err) {
    console.error('Error sending email:', err);
  }

  res.sendStatus(200);
});

// --- Admin: List Uploaded Files --- //
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

// --- Custom Order Delivery Page (Customer-Facing) --- //
app.get('/orders/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const deliveries = orderDeliveries[orderId];
  if (!deliveries || deliveries.length === 0) {
    return res.status(404).send('No digital products found for this order.');
  }

  // Build a simple HTML page with collapsible panels for each product.
  let productsHtml = deliveries.map((item, index) => {
    return `
      <div style="margin-bottom: 20px; border: 1px solid #ccc; padding: 10px;">
        <button onclick="toggleContent('content${index}')" style="background:#007acc; color:#fff; padding:10px; border:none; border-radius:5px; cursor:pointer;">
          Product ${item.productId}
        </button>
        <div id="content${index}" style="display:none; margin-top:10px;">
          <a href="/download/${item.token}" style="text-decoration:none; background:#28a745; color:#fff; padding:10px 20px; border-radius:5px;">Download</a>
        </div>
      </div>
    `;
  }).join('');

  res.send(`
    <html>
      <head>
        <title>Order ${orderId} - Digital Delivery</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
        </style>
        <script>
          function toggleContent(id) {
            var content = document.getElementById(id);
            if (content.style.display === "none") {
              content.style.display = "block";
            } else {
              content.style.display = "none";
            }
          }
        </script>
      </head>
      <body>
        <h1>Order #${orderId}</h1>
        <p>Your purchased digital products are ready to download:</p>
        ${productsHtml}
      </body>
    </html>
  `);
});

// --- Start the Server --- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));
