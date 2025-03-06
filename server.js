// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer  = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// ---------- PostgreSQL Setup ----------
const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING
});

pool.connect()
  .then(client => {
    console.log("✅ PostgreSQL Connected Successfully!");
    client.release();
  })
  .catch(err => {
    console.error("❌ Error connecting to PostgreSQL:", err);
    process.exit(1);
  });

// ---------- Default Email Template ----------
// Contains both a design JSON and HTML with the placeholder {{download_link}}
const defaultEmailTemplate = {
  design: {
    "body": {
      "rows": [
        {
          "columns": [
            {
              "contents": [
                {
                  "type": "text",
                  "values": {
                    "text": "Thank you for your order."
                  }
                },
                {
                  "type": "button",
                  "values": {
                    "text": "Download Your Digital Product",
                    "link": "{{download_link}}",
                    "backgroundColor": "#28a745",
                    "textColor": "#ffffff"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  },
  html: `<html>
  <body style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>Thank you for your order!</h2>
    <p>Please click the button below to download your digital product.</p>
    <p>
      <a href="{{download_link}}" style="display: inline-block; background: #28a745; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px;">
        Download Now
      </a>
    </p>
  </body>
</html>`
};

// ---------- Middleware & Session ----------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false
}));

// Serve static CSS and public files
app.use('/css', express.static(path.join(__dirname, 'public/css')));

// ---------- Authentication & Multi‑Tenant Login ---------- //

// Render login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// New Sign-Up Page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Process Sign-Up – new tenants register their shop details
app.post('/signup', async (req, res) => {
  const { username, password, shopify_store_url, shopify_api_password } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO tenants (username, password, shopify_store_url, shopify_api_password) VALUES ($1, $2, $3, $4) RETURNING *",
      [username, password, shopify_store_url, shopify_api_password]
    );
    const tenant = result.rows[0];
    // Insert default email template for new tenant
    await pool.query(
      "INSERT INTO email_templates (tenant_id, design, html) VALUES ($1, $2, $3)",
      [tenant.id, JSON.stringify(defaultEmailTemplate.design), defaultEmailTemplate.html]
    );
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error signing up");
  }
});

// Process Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM tenants WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rows.length) {
      req.session.tenant = result.rows[0];
      res.redirect('/admin/home');
    } else {
      res.send("Invalid credentials");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Middleware to protect admin routes
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.tenant) {
    next();
  } else {
    res.redirect('/login');
  }
}

// ---------- Admin Pages (Protected) ----------
app.get('/admin/home', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.get('/admin/email-editor', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'email-editor.html'));
});
app.get('/admin/smtp', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'smtp.html'));
});
app.get('/admin/assets', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'assets.html'));
});
app.get('/admin/products', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'products.html'));
});
app.get('/admin/orders', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'orders.html'));
});

// ---------- Additional API Endpoints ---------- //

// Return current tenant details
app.get('/admin/api/tenant', ensureAuthenticated, async (req, res) => {
  res.json({ tenant: req.session.tenant });
});

// Return today's stats for the tenant
app.get('/admin/api/stats', ensureAuthenticated, async (req, res) => {
  const tenantId = req.session.tenant.id;
  const today = new Date().toISOString().slice(0,10);
  try {
    const result = await pool.query("SELECT emails_sent, orders_served FROM stats WHERE tenant_id = $1 AND date = $2", [tenantId, today]);
    if (result.rows.length) {
      res.json(result.rows[0]);
    } else {
      res.json({ emails_sent: 0, orders_served: 0 });
    }
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ---------- API Endpoints for Tenant Settings ---------- //

// Email Template Endpoints – stored in email_templates table
app.get('/admin/api/email-template', ensureAuthenticated, async (req, res) => {
  try {
    const tenantId = req.session.tenant.id;
    const result = await pool.query(
      "SELECT design, html FROM email_templates WHERE tenant_id = $1",
      [tenantId]
    );
    let template;
    if (result.rows.length === 0 || !result.rows[0].design) {
      template = defaultEmailTemplate;
    } else {
      template = result.rows[0];
      if (typeof template.design === 'string') {
        try {
          template.design = JSON.parse(template.design);
        } catch (e) {
          console.error("Error parsing design JSON from DB:", e);
          template.design = defaultEmailTemplate.design;
        }
      }
      if (!template.html) {
        template.html = defaultEmailTemplate.html;
      }
    }
    console.log("Fetched email template for tenant", tenantId, template);
    res.json({ template });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/admin/api/email-template', ensureAuthenticated, async (req, res) => {
  try {
    const tenantId = req.session.tenant.id;
    const { design, html } = req.body;
    const result = await pool.query(
      "SELECT id FROM email_templates WHERE tenant_id = $1",
      [tenantId]
    );
    if (result.rows.length) {
      await pool.query(
        "UPDATE email_templates SET design = $1, html = $2, updated_at = NOW() WHERE tenant_id = $3",
        [JSON.stringify(design), html, tenantId]
      );
      res.json({ message: 'Template updated successfully' });
    } else {
      await pool.query(
        "INSERT INTO email_templates (tenant_id, design, html) VALUES ($1, $2, $3)",
        [tenantId, JSON.stringify(design), html]
      );
      res.json({ message: 'Template saved successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// SMTP Settings Endpoints – stored in smtp_settings table
app.get('/admin/api/smtp', ensureAuthenticated, async (req, res) => {
  try {
    const tenantId = req.session.tenant.id;
    const result = await pool.query(
      "SELECT host, port, smtp_user as \"user\", pass FROM smtp_settings WHERE tenant_id = $1",
      [tenantId]
    );
    res.json({ smtp: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/admin/api/smtp', ensureAuthenticated, async (req, res) => {
  try {
    const tenantId = req.session.tenant.id;
    const { host, port, user, pass } = req.body;
    const result = await pool.query(
      "SELECT id FROM smtp_settings WHERE tenant_id = $1",
      [tenantId]
    );
    if (result.rows.length) {
      await pool.query(
        "UPDATE smtp_settings SET host = $1, port = $2, smtp_user = $3, pass = $4, updated_at = NOW() WHERE tenant_id = $5",
        [host, port, user, pass, tenantId]
      );
      res.json({ message: 'SMTP settings updated successfully' });
    } else {
      await pool.query(
        "INSERT INTO smtp_settings (tenant_id, host, port, smtp_user, pass) VALUES ($1, $2, $3, $4, $5)",
        [tenantId, host, port, user, pass]
      );
      res.json({ message: 'SMTP settings saved successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ---------- File Upload & Assets API (Protected) ---------- //
// Use the persistent volume mount point (default: /data/uploads)
const persistentDir = process.env.PERSISTENT_DIR || '/data/uploads';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.session.tenant.id;
    // Build the destination path on the persistent volume
    const uploadDir = path.join(persistentDir, String(tenantId));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const uploadMiddleware = multer({ storage });

app.post('/api/upload', ensureAuthenticated, uploadMiddleware.single('file'), (req, res) => {
  res.json({ message: 'File uploaded successfully', file: req.file });
});

// Use the persistent volume mount point (default: /data/uploads)

app.get('/api/uploads', ensureAuthenticated, (req, res) => {
  const tenantId = req.session.tenant.id;
  // Build the full upload directory path using the persistent volume
  const uploadDir = path.join(persistentDir, String(tenantId));
  console.log(`Listing files in directory: ${uploadDir}`);

  // Check if the directory exists
  if (!fs.existsSync(uploadDir)) {
    console.log(`Directory ${uploadDir} does not exist. Returning empty file list.`);
    return res.json({ files: [] });
  }

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error(`Error reading directory ${uploadDir}:`, err);
      return res.status(500).json({ error: 'Error reading files', path: uploadDir });
    }
    console.log(`Files found in ${uploadDir}:`, files);
    res.json({ files });
  });
});


// ---------- Shopify Products & Attach File APIs (Protected) ----------
app.get('/api/products', ensureAuthenticated, async (req, res) => {
  try {
    const tenant = req.session.tenant;
    const response = await axios.get(`https://${tenant.shopify_store_url}/admin/api/2024-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': tenant.shopify_api_password,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data.products);
  } catch (err) {
    console.error("Error fetching products:", err.response?.data || err.message);
    res.status(500).json({ error: 'Error fetching products' });
  }
});

app.post('/api/attach-file', ensureAuthenticated, async (req, res) => {
  const { productId, fileUrl } = req.body;
  try {
    const tenant = req.session.tenant;
    let cleanFileName = fileUrl;
    // If fileUrl starts with "uploads/", remove that prefix.
    if (cleanFileName.startsWith("uploads/")) {
      cleanFileName = cleanFileName.replace(/^uploads\//, '');
    }
    // Now build the full path using the persistentDir mount point
    const fullPath = path.join(persistentDir, String(tenant.id), cleanFileName);
    const response = await axios.put(`https://${tenant.shopify_store_url}/admin/api/2024-01/products/${productId}.json`, {
      product: {
        id: productId,
        metafields: [{
          key: "digital_file",
          value: fullPath,
          type: "string",
          namespace: "digital_download"
        }]
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': tenant.shopify_api_password,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Error attaching file to product:", error.response?.data || error.message);
    res.status(500).json({ error: 'Error attaching file to product' });
  }
});

// ---------- Order Details API Endpoints ---------- //
// Save order details (this can be triggered from the webhook)
app.post('/admin/api/order', ensureAuthenticated, async (req, res) => {
  const tenantId = req.session.tenant.id;
  const { order_number, ordered_date, customer_name, customer_email, shopify_customer_url, latest_dispatched_email } = req.body;
  try {
    await pool.query(
      "INSERT INTO orders (tenant_id, order_number, ordered_date, customer_name, customer_email, shopify_customer_url, latest_dispatched_email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [tenantId, order_number, ordered_date, customer_name, customer_email, shopify_customer_url, latest_dispatched_email]
    );
    res.json({ message: "Order saved successfully" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Get orders for current tenant
app.get('/admin/api/orders', ensureAuthenticated, async (req, res) => {
  const tenantId = req.session.tenant.id;
  try {
    const result = await pool.query("SELECT * FROM orders WHERE tenant_id = $1 ORDER BY ordered_date DESC", [tenantId]);
    res.json({ orders: result.rows });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ---------- In-Memory Delivery & Download Endpoints (Public) ----------
const downloadTokens = {}; // For production, persist these tokens in the DB.
function generateDownloadToken(orderId, fileUrl) {
  const token = crypto.randomBytes(16).toString('hex');
  downloadTokens[token] = {
    orderId,
    fileUrl,
    expires: Date.now() + (24 * 60 * 60 * 1000),
    downloadsLeft: 3
  };
  return token;
}

app.get('/download/:token', (req, res) => {
  const tokenData = downloadTokens[req.params.token];
  console.log("Download token data:", tokenData);
  if (!tokenData) return res.status(404).send('Invalid download link.');
  if (Date.now() > tokenData.expires) return res.status(403).send('Download link expired.');
  if (tokenData.downloadsLeft <= 0) return res.status(403).send('Download limit exceeded.');
  tokenData.downloadsLeft--;
  console.log("Serving file at:", path.resolve(tokenData.fileUrl));
  if (tokenData.fileUrl.startsWith('http')) {
    return res.redirect(tokenData.fileUrl);
  } else {
    return res.download(path.resolve(tokenData.fileUrl));
  }
});


// ---------- Improved Custom Order Delivery Page (Public) ----------
app.get('/orders/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const deliveries = orderDeliveries[orderId];
  if (!deliveries || deliveries.length === 0) {
    return res.status(404).send('No digital products found for this order.');
  }
  let productsHtml = deliveries.map((item, index) => {
    return `
      <div class="product-card">
        <h3>Product ID: ${item.productId}</h3>
        <p>Click the button below to download your product.</p>
        <button class="download-btn" onclick="window.location.href='/download/${item.token}'">Download</button>
      </div>
    `;
  }).join('');
  res.send(`
    <html>
      <head>
        <title>Order ${orderId} - Digital Delivery</title>
        <link rel="stylesheet" type="text/css" href="/css/style.css">
        <style>
          .order-container { max-width: 800px; margin: 0 auto; padding: 20px; background: #fff; }
          .order-header { text-align: center; margin-bottom: 20px; }
          .product-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
          .download-btn { background: #28a745; color: #fff; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
          .download-btn:hover { background: #218838; }
        </style>
      </head>
      <body>
        <div class="order-container">
          <div class="order-header">
            <h1>Order #${orderId}</h1>
            <p>Your digital products are ready to download.</p>
          </div>
          ${productsHtml}
        </div>
      </body>
    </html>
  `);
});

// ---------- Shopify Order Webhook (Public) ----------
const orderDeliveries = {};

app.post('/webhook/order-created', async (req, res) => {
  const order = req.body;
  console.log('Received new order:', order.id);
  const shopifyDomain = new URL(order.order_status_url).hostname;
  console.log("Extracted shopify domain:", shopifyDomain);

  try {
    const tenantResult = await pool.query(
      "SELECT * FROM tenants WHERE shopify_store_url = $1",
      [shopifyDomain]
    );
    if (tenantResult.rows.length === 0) {
      console.error("Tenant not found for shop:", shopifyDomain);
      return res.sendStatus(500);
    }
    const tenant = tenantResult.rows[0];
    await Promise.all(order.line_items.map(async (item) => {
      const productId = item.product_id;
      let fileUrl = null;
      try {
        const metafieldRes = await axios.get(`https://${shopifyDomain}/admin/api/2024-01/products/${productId}/metafields.json`, {
          headers: {
            'X-Shopify-Access-Token': tenant.shopify_api_password,
            'Content-Type': 'application/json'
          }
        });
        const metafields = metafieldRes.data.metafields;
        const digitalFileField = metafields.find(field => field.namespace === 'digital_download' && field.key === 'digital_file');
        if (digitalFileField) {
          fileUrl = digitalFileField.value;
          // If fileUrl is not already an absolute path starting with our persistentDir, then prepend it.
          if (!fileUrl.startsWith(persistentDir)) {
            fileUrl = path.join(persistentDir, String(tenant.id), fileUrl);
          }
        }
      } catch (err) {
        console.error("Error fetching metafields for product", productId, err.response?.data || err.message);
      }
      if (fileUrl) {
        const token = generateDownloadToken(order.id, fileUrl);
        if (!orderDeliveries[order.id]) orderDeliveries[order.id] = [];
        orderDeliveries[order.id].push({ productId, token });
      }
    }));
    const downloadLink = `${process.env.APP_BASE_URL}/orders/${order.id}`;
    // Save order details extracted from payload:
    const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}`.trim() : "";
    const customerEmail = order.email || "";
    const shopifyCustomerUrl = order.customer && order.customer.id ? `https://${tenant.shopify_store_url}/admin/customers/${order.customer.id}` : "";
    const latestDispatchedEmail = new Date();
    await pool.query(
      "INSERT INTO orders (tenant_id, order_number, ordered_date, customer_name, customer_email, shopify_customer_url, latest_dispatched_email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [tenant.id, order.order_number, order.created_at, customerName, customerEmail, shopifyCustomerUrl, latestDispatchedEmail]
    );
    const templateResult = await pool.query(
      "SELECT html FROM email_templates WHERE tenant_id = $1",
      [tenant.id]
    );
    let templateHtml;
    if (templateResult.rows.length === 0) {
      templateHtml = defaultEmailTemplate.html;
    } else {
      templateHtml = templateResult.rows[0].html;
    }
    // Use global replace in case there are multiple occurrences.
    const emailHtml = templateHtml.replace(/{{download_link}}/g, downloadLink);
    const today = new Date().toISOString().slice(0,10);
    await pool.query(
      "INSERT INTO stats (tenant_id, date, emails_sent, orders_served) VALUES ($1, $2, 1, 1) ON CONFLICT (tenant_id, date) DO UPDATE SET emails_sent = stats.emails_sent + 1, orders_served = stats.orders_served + 1",
      [tenant.id, today]
    );
    const smtpResult = await pool.query(
      "SELECT host, port, smtp_user as \"user\", pass FROM smtp_settings WHERE tenant_id = $1",
      [tenant.id]
    );
    const smtpRow = smtpResult.rows[0];
    let smtpConfig = {
      host: smtpRow ? smtpRow.host : process.env.SMTP_HOST,
      port: smtpRow ? parseInt(smtpRow.port) : parseInt(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: smtpRow ? smtpRow.user : process.env.SMTP_USER,
        pass: smtpRow ? smtpRow.pass : process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false }
    };
    let transporter = nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({
      from: `"Your Shop" <${smtpConfig.auth.user}>`,
      to: order.email,
      subject: "Your Digital Download is Ready",
      text: `Thank you for your order. Access your digital downloads here: ${downloadLink}`,
      html: emailHtml
    });
    console.log('Email sent for order:', order.id);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing order webhook:', err);
    res.sendStatus(500);
  }
});

// ---------- Start the Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));
