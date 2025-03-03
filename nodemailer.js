require('dotenv').config();
const nodemailer = require('nodemailer');

// SMTP configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // Set to true if using port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false // Helps with some SMTP providers
    }
});

// Test email options
const mailOptions = {
    from: process.env.SMTP_USER,
    to: 'jsdeep467@gmail.com', // Change to your test recipient
    subject: 'SMTP Test Email',
    text: 'This is a test email sent from Node.js using Nodemailer.',
};

// Send test email
transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error('Error sending email:', error);
    } else {
        console.log('Email sent successfully:', info.response);
    }
});