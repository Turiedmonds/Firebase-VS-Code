const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
admin.initializeApp();

exports.createStaffUser = onCall(async (request) => {
  const { email, password = "Test1234!" } = request.data;
  console.log("📥 Received data in function:", { email });

  if (!email) {
    throw new Error('Missing email');
  }

  const userRecord = await admin.auth().createUser({ email, password });
  return { uid: userRecord.uid };
});

exports.sendStaffCredentials = onCall(
  {
    secrets: ["GMAIL_USER", "GMAIL_PASS"]
  },
  async (request) => {

  const { staffName, staffEmail, password, contractorEmail } = request.data;

console.log("DEBUG - GMAIL_USER:", process.env.GMAIL_USER);
console.log("DEBUG - GMAIL_PASS is set:", !!process.env.GMAIL_PASS);

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: contractorEmail,
      subject: 'New Staff Login Created',
      text: `Kia ora,\n\nYou've created a new SHE\u0394R iQ staff login.\n\nName: ${staffName}\nEmail: ${staffEmail}\nTemporary Password: ${password}\n\nPlease forward these details to your staff member. They will be prompted to change their password on first login.\n\nNg\u0101 mihi,\nThe SHE\u0394R iQ Team`,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Error sending staff credentials', error);
    return { success: false, error: error.message };
  }
});
// Trigger redeploy
