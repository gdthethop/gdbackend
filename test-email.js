// Test email configuration
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

async function testEmail() {
    console.log('Testing email configuration...');
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***configured***' : 'NOT SET');

    try {
        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        console.log('Transporter created, verifying connection...');

        // Verify connection
        await transporter.verify();
        console.log('✅ Email server connection successful!');

        // Send test email
        console.log('Sending test email...');
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: 'Test Email - Gd Player',
            text: 'This is a test email from Gd Player password reset system.',
            html: '<p>This is a test email from Gd Player password reset system.</p>'
        });

        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('\nCheck your inbox at:', process.env.EMAIL_USER);
    } catch (error) {
        console.error('❌ Email test failed:');
        console.error('Error:', error.message);
        if (error.code) console.error('Code:', error.code);
        if (error.response) console.error('Response:', error.response);

        console.log('\n📋 Troubleshooting steps:');
        console.log('1. Verify 2FA is enabled on Gmail account');
        console.log('2. Verify App Password is correct (no spaces)');
        console.log('3. Check if "Less secure app access" needs to be enabled');
        console.log('4. Try generating a new App Password');
    }
}

testEmail();
