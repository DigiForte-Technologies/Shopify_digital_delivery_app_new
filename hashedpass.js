const bcrypt = require('bcrypt');

const plainPassword = "NewYear@25!";
const saltRounds = 10; // Recommended salt rounds

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) {
    console.error("Error hashing password:", err);
  } else {
    console.log("Hashed password:", hash);
  }
});




INSERT INTO tenants (username, password, shopify_store_url, shopify_api_password)
VALUES ('admin', '$2b$10$H5Q6btaQwzkoLkZcGQz4q.ij.XCIE.ISTXo1jRfT0rsqSLWeQYzTS', 'quickstart-f8ccdfe2.myshopify.com', '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')
RETURNING *;
