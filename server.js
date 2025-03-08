// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const { Pool } = require('pg');


// AWS SDK v3 and multer-s3-v3 for S3 integration
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const multerS3 = require('multer-s3-v3');

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

// ---------- AWS S3 Client & Storage Configuration ----------
// Create an S3 client using environment variables
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Configure multer-s3 storage so that each tenant gets its own "folder" (prefix)
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_BUCKET_NAME,
  // Do not set an ACL if your bucket is configured for "Bucket owner enforced"
  key: (req, file, cb) => {
    // Ensure tenant is authenticated
    const tenantId = req.session.tenant.id;
    const filename = Date.now() + '-' + file.originalname;
    // The key is structured as "tenantId/filename"
    cb(null, `${tenantId}/${filename}`);
  },
});

// Create a multer instance that uses the S3 storage
const uploadToS3 = multer({
  storage: s3Storage,
});

// ---------- Default Email Template ----------
const defaultEmailTemplate = {
  "counters": {
    "u_column": 2,
    "u_row": 2,
    "u_content_heading": 1,
    "u_content_text": 1,
    "u_content_button": 1,
    "u_content_html": 1
  },
  "body": {
    "id": "RRlfnUq63V",
    "rows": [
      {
        "id": "MZFVoRRGQL",
        "cells": [1],
        "columns": [
          {
            "id": "LYIL7TxJV0",
            "contents": [
              {
                "id": "4aylgaquuy",
                "type": "heading",
                "values": {
                  "containerPadding": "10px",
                  "anchor": "",
                  "headingType": "h1",
                  "fontSize": "22px",
                  "textAlign": "center",
                  "lineHeight": "140%",
                  "linkStyle": {
                    "inherit": true,
                    "linkColor": "#0000ee",
                    "linkHoverColor": "#0000ee",
                    "linkUnderline": true,
                    "linkHoverUnderline": true
                  },
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_styleGuide": null,
                  "_meta": {
                    "htmlID": "u_content_heading_1",
                    "htmlClassNames": "u_content_heading"
                  },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "<span><strong>Thank you for your order!</strong></span>",
                  "_languages": {}
                }
              }
            ],
            "values": {
              "backgroundColor": "",
              "padding": "0px",
              "border": {},
              "borderRadius": "0px",
              "_meta": {
                "htmlID": "u_column_1",
                "htmlClassNames": "u_column"
              }
            }
          }
        ],
        "values": {
          "displayCondition": null,
          "columns": false,
          "_styleGuide": null,
          "backgroundColor": "",
          "columnsBackgroundColor": "",
          "backgroundImage": {
            "url": "",
            "fullWidth": true,
            "repeat": "no-repeat",
            "size": "custom",
            "position": "center",
            "customPosition": ["50%", "50%"]
          },
          "padding": "0px",
          "anchor": "",
          "hideDesktop": false,
          "_meta": {
            "htmlID": "u_row_1",
            "htmlClassNames": "u_row"
          },
          "selectable": true,
          "draggable": true,
          "duplicatable": true,
          "deletable": true,
          "hideable": true
        }
      },
      {
        "id": "jDzKAOB95k",
        "cells": [1],
        "columns": [
          {
            "id": "1IOiGNytn1",
            "contents": [
              {
                "id": "CGHePeBHpe",
                "type": "text",
                "values": {
                  "containerPadding": "10px",
                  "anchor": "",
                  "fontSize": "14px",
                  "textAlign": "center",
                  "lineHeight": "140%",
                  "linkStyle": {
                    "inherit": true,
                    "linkColor": "#0000ee",
                    "linkHoverColor": "#0000ee",
                    "linkUnderline": true,
                    "linkHoverUnderline": true
                  },
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_styleGuide": null,
                  "_meta": {
                    "htmlID": "u_content_text_1",
                    "htmlClassNames": "u_content_text"
                  },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "<p style=\"line-height: 140%;\">Please click the button below to download your digital product.</p>",
                  "_languages": {}
                }
              },
              {
                "id": "tCTWWxVaA9",
                "type": "button",
                "values": {
                  "href": {
                    "name": "web",
                    "values": {
                      "href": "{{download_link}}",
                      "target": "_blank"
                    },
                    "attrs": {
                      "href": "{{href}}",
                      "target": "{{target}}"
                    }
                  },
                  "buttonColors": {
                    "color": "#FFFFFF",
                    "backgroundColor": "#28a745",
                    "hoverColor": "#FFFFFF",
                    "hoverBackgroundColor": "#3AAEE0"
                  },
                  "size": {
                    "autoWidth": true,
                    "width": "100%"
                  },
                  "fontSize": "19px",
                  "lineHeight": "120%",
                  "textAlign": "center",
                  "padding": "10px 20px",
                  "border": {},
                  "borderRadius": "4px",
                  "hideDesktop": false,
                  "displayCondition": null,
                  "_styleGuide": null,
                  "containerPadding": "10px",
                  "anchor": "",
                  "_meta": {
                    "htmlID": "u_content_button_1",
                    "htmlClassNames": "u_content_button"
                  },
                  "selectable": true,
                  "draggable": true,
                  "duplicatable": true,
                  "deletable": true,
                  "hideable": true,
                  "text": "<strong><span style=\"line-height: 22.8px;\">Download Now</span></strong>",
                  "_languages": {},
                  "calculatedWidth": 176,
                  "calculatedHeight": 43
                }
              }
            ],
            "values": {
              "backgroundColor": "",
              "padding": "0px",
              "border": {},
              "borderRadius": "0px",
              "_meta": {
                "htmlID": "u_column_2",
                "htmlClassNames": "u_column"
              }
            }
          }
        ],
        "values": {
          "displayCondition": null,
          "columns": false,
          "_styleGuide": null,
          "backgroundColor": "",
          "columnsBackgroundColor": "",
          "backgroundImage": {
            "url": "",
            "fullWidth": true,
            "repeat": "no-repeat",
            "size": "custom",
            "position": "center"
          },
          "padding": "0px",
          "anchor": "",
          "hideDesktop": false,
          "_meta": {
            "htmlID": "u_row_2",
            "htmlClassNames": "u_row"
          },
          "selectable": true,
          "draggable": true,
          "duplicatable": true,
          "deletable": true,
          "hideable": true
        }
      }
    ],
    "headers": [],
    "footers": [],
    "values": {
      "_styleGuide": null,
      "popupPosition": "center",
      "popupWidth": "600px",
      "popupHeight": "auto",
      "borderRadius": "10px",
      "contentAlign": "center",
      "contentVerticalAlign": "center",
      "contentWidth": "500px",
      "fontFamily": {
        "label": "Arial",
        "value": "arial,helvetica,sans-serif"
      },
      "textColor": "#000000",
      "popupBackgroundColor": "#FFFFFF",
      "popupBackgroundImage": {
        "url": "",
        "fullWidth": true,
        "repeat": "no-repeat",
        "size": "cover",
        "position": "center"
      },
      "popupOverlay_backgroundColor": "rgba(0, 0, 0, 0.1)",
      "popupCloseButton_position": "top-right",
      "popupCloseButton_backgroundColor": "#DDDDDD",
      "popupCloseButton_iconColor": "#000000",
      "popupCloseButton_borderRadius": "0px",
      "popupCloseButton_margin": "0px",
      "popupCloseButton_action": {
        "name": "close_popup",
        "attrs": {
          "onClick": "document.querySelector('.u-popup-container').style.display = 'none';"
        }
      },
      "language": {},
      "backgroundColor": "#F7F8F9",
      "preheaderText": "",
      "linkStyle": {
        "body": true,
        "linkColor": "#0000ee",
        "linkHoverColor": "#0000ee",
        "linkUnderline": true,
        "linkHoverUnderline": true
      },
      "backgroundImage": {
        "url": "",
        "fullWidth": true,
        "repeat": "no-repeat",
        "size": "custom",
        "position": "center"
      },
      "_meta": {
        "htmlID": "u_body",
        "htmlClassNames": "u_body"
      }
    }
  },
  "schemaVersion": 18,


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

// Render sign-up page
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
    const result = await pool.query(
      "SELECT emails_sent, orders_served FROM stats WHERE tenant_id = $1 AND date = $2",
      [tenantId, today]
    );
    if (result.rows.length) {
      res.json(result.rows[0]);
    } else {
      res.json({ emails_sent: 0, orders_served: 0 });
    }
  } catch (err) {
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

// ---------- File Upload & Assets API (Protected) ----------
// Instead of using local persistent directories, we now use S3.
// Endpoint: Upload a file to S3 and save its metadata to the assets table.
// Endpoint: Upload a file to S3 and save its metadata to the assets table.
app.post('/api/upload', ensureAuthenticated, uploadToS3.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  try {
    const tenantId = req.session.tenant.id;
    const s3Key = req.file.key;         // e.g. "tenantId/filename"
    const fileUrl = req.file.location;   // The public URL returned by multer-s3-v3
    const fileSize = req.file.size;

    // Save file metadata into the assets table.
    const result = await pool.query(
      "INSERT INTO assets (tenant_id, s3_key, file_url, file_size) VALUES ($1, $2, $3, $4) RETURNING *",
      [tenantId, s3Key, fileUrl, fileSize]
    );
    res.json({ message: 'File uploaded successfully', asset: result.rows[0] });
  } catch (err) {
    console.error("Error saving asset metadata:", err);
    res.status(500).json({ message: "File uploaded but failed to save metadata" });
  }
});

// Endpoint: List uploaded files for the current tenant (by querying the assets table)
app.get('/api/uploads', ensureAuthenticated, async (req, res) => {
  const tenantId = req.session.tenant.id;
  try {
    const result = await pool.query(
      "SELECT * FROM assets WHERE tenant_id = $1 ORDER BY uploaded_at DESC",
      [tenantId]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error("Error fetching assets:", err);
    res.status(500).json({ error: "Error fetching assets" });
  }
});


// Import DeleteObjectCommand from AWS SDK v3 at the top (if not already imported)
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Endpoint: Delete an asset from S3 and the assets table.
// Expects a query parameter "s3_key" which is the S3 file key.
app.delete('/api/delete-asset', ensureAuthenticated, async (req, res) => {
  const { s3_key } = req.query;
  if (!s3_key) {
    return res.status(400).json({ message: "Missing s3_key parameter" });
  }
  try {
    // Delete the file from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3_key
    });
    await s3Client.send(deleteCommand);
    
    // Delete asset metadata from the database
    await pool.query("DELETE FROM assets WHERE s3_key = $1 AND tenant_id = $2", [s3_key, req.session.tenant.id]);
    res.json({ message: "Asset deleted successfully" });
  } catch (err) {
    console.error("Error deleting asset:", err);
    res.status(500).json({ message: "Error deleting asset" });
  }
});


// ---------- Secure Link Endpoint ----------
// Generate a temporary, secure (presigned) URL for a file stored in S3.
// Secure Link Endpoint: Generate a presigned URL valid for 24 hours
app.get('/secure-file', async (req, res) => {
  const key = req.query.key;
  if (!key) {
    return res.status(400).json({ error: "Missing 'key' query parameter" });
  }
  
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });
  
  try {
    // Generate a presigned URL valid for 24 hours (86400 seconds)
    const url = await getSignedUrl(s3Client, command, { expiresIn: 86400 });
    res.json({ url });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ error: "Error generating secure link" });
  }
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

// Endpoint: Attach an S3 file to a Shopify product as a metafield.
app.post('/api/attach-file', ensureAuthenticated, async (req, res) => {
  let { productId, fileUrl } = req.body;
  try {
    const tenant = req.session.tenant;
    
    // If fileUrl is an object, extract the s3_key.
    if (typeof fileUrl === 'object' && fileUrl.s3_key) {
      fileUrl = fileUrl.s3_key;
    }
    // Optionally, if fileUrl contains any unwanted prefix, remove it.
    if (typeof fileUrl === 'string' && fileUrl.startsWith("uploads/")) {
      fileUrl = fileUrl.replace(/^uploads\//, '');
    }
    // Now fileUrl should be a string (the S3 key, e.g. "tenantId/filename")
    const response = await axios.put(`https://${tenant.shopify_store_url}/admin/api/2024-01/products/${productId}.json`, {
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
// Save order details (triggered from a webhook)
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
const downloadTokens = {}; // For production, consider persisting these tokens in your DB.
// Set expiry to 1 year (31536000000 ms); adjust as needed.
function generateDownloadToken(orderId, fileUrl) {
  const token = crypto.randomBytes(16).toString('hex');
  downloadTokens[token] = {
    orderId,
    fileUrl,
    expires: Date.now() + 31536000000, // 1 year in milliseconds
    downloadsLeft: 3
  };
  return token;
}


app.get('/download/:token', async (req, res) => {
  const tokenData = downloadTokens[req.params.token];
  console.log("Download token data:", tokenData);
  if (!tokenData) return res.status(404).send('Invalid download link.');
  if (Date.now() > tokenData.expires) return res.status(403).send('Download link expired.');
  if (tokenData.downloadsLeft <= 0) return res.status(403).send('Download limit exceeded.');
  
  // Decrement the downloadsLeft counter
  tokenData.downloadsLeft--;

  // If fileUrl is a full URL, redirect to it.
  if (tokenData.fileUrl.startsWith('http')) {
    return res.redirect(tokenData.fileUrl);
  } else {
    // Otherwise, assume fileUrl is an S3 key; stream the file from S3.
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: tokenData.fileUrl, // This is the S3 key, e.g. "tenantId/filename"
    });
    try {
      const data = await s3Client.send(command);
      // Set Content-Disposition to trigger a download, using the filename part of the key.
      const filename = tokenData.fileUrl.split('/').pop();
      res.attachment(filename);
      // data.Body is a stream; pipe it to the response.
      data.Body.pipe(res);
    } catch (err) {
      console.error("Error fetching file from S3:", err);
      res.status(500).send('Error fetching file from S3.');
    }
  }
});
// ---------- Improved Custom Order Delivery Page (Public) ----------
const orderDeliveries = {};
app.get('/orders/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const deliveries = orderDeliveries[orderId];
  if (!deliveries || deliveries.length === 0) {
    return res.status(404).send('No digital products found for this order.');
  }
  let productsHtml = deliveries.map((item) => {
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
          // For S3 files, fileUrl should be the S3 key. If it isn’t already in the expected format, adjust it.
          if (!fileUrl.includes('/')) {
            // Assume fileUrl is just a filename; prefix with tenant id.
            fileUrl = `${tenant.id}/${fileUrl}`;
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
    // Replace the download_link placeholder with the actual link.
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
