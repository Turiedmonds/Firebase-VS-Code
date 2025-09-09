const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentDeleted } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
admin.initializeApp();

exports.createStaffUser = onCall(async (request) => {
  const { loginEmail, personalEmail, email } = request.data || {};
  const authEmail = loginEmail || email;
  console.log("📥 Received data in function:", { loginEmail: authEmail, personalEmail });

  if (!authEmail) {
    throw new Error('Missing loginEmail');
  }

  const userRecord = await admin.auth().createUser({ email: authEmail });
  return { uid: userRecord.uid, personalEmail: personalEmail || null };
});

async function sendCredentialsEmail({ staffName, loginEmail, personalEmail, contractorEmail, staffEmail }) {
  const authEmail = loginEmail || staffEmail;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const resetLink = await admin.auth().generatePasswordResetLink(authEmail);
  const recipientEmail = personalEmail || authEmail;

  const mailOptions = {
    from: process.env.GMAIL_USER,
    // Send to both contractor and staff
    to: [contractorEmail, recipientEmail],
    subject: 'New Staff Login Created',
    text: `Kia ora,\n\nYou've successfully created a new SHE\u0394R iQ staff login.\n\nHere are the details for your records:\n\nName: ${staffName}\nEmail: ${authEmail}\n\nPlease set your password using the following link:\n${resetLink}\n\nNg\u0101 mihi,\nThe SHE\u0394R iQ Team`,
  };

  await transporter.sendMail(mailOptions);
}

exports.sendStaffCredentials = onCall(
  {
    secrets: ["GMAIL_USER", "GMAIL_PASS"]
  },
  async (request) => {
    try {
      await sendCredentialsEmail(request.data);
      return { success: true };
    } catch (error) {
      console.error('Error sending staff credentials', error);
      return { success: false, error: error.message };
    }
  }
);

exports.sendPasswordResetEmail = onCall(
  {
    secrets: ["GMAIL_USER", "GMAIL_PASS"]
  },
  async (request) => {
    const { email, appCheckToken } = request.data || {};
    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing email');
    }

    try {
      await admin.appCheck().verifyToken(appCheckToken);
    } catch (err) {
      console.error('App Check verification failed', err);
      throw new functions.https.HttpsError('failed-precondition', 'Invalid App Check token');
    }

    try {
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Reset Your SHE\u0394R iQ Password',
        text: `Kia ora,\n\nWe received a request to reset your SHE\u0394R iQ password.\n\nPlease set your new password using the following link:\n${resetLink}\n\nIf you didn't request this, you can ignore this email.\n\nNg\u0101 mihi,\nThe SHE\u0394R iQ Team`,
      };

      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`Password reset requested for non-existent user: ${email}`);
        return { success: true };
      }
      console.error('Error sending password reset email', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

exports.deleteStaffUser = onCall(async (request) => {
  const { uid, contractorId } = request.data || {};
  if (!uid || !contractorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid or contractorId');
  }
  try {
    await admin.firestore().doc(`contractors/${contractorId}/staff/${uid}`).delete();
  } catch (error) {
    console.error('Error deleting staff document', error);
    throw new functions.https.HttpsError('internal', 'Unable to delete staff record');
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`Auth user ${uid} already deleted.`);
    } else {
      console.error('Error deleting auth user', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }

  return { success: true };
});
// Trigger redeploy
// ✅ Uses Secret Manager (future-safe)

// Listen for deleted staff user documents using v2 syntax
exports.onStaffDeleted = onDocumentDeleted(
  'contractors/{contractorId}/staff/{staffId}',
  async (event) => {
    const { contractorId, staffId } = event.params;
    const data = event.data?.data() || {};
    const name = data.name || 'Unknown';
    const email = data.email || 'Unknown';
    const deletedAt = admin.firestore.FieldValue.serverTimestamp();

    await admin
      .firestore()
      .collection(`contractors/${contractorId}/logs`)
      .add({
        type: 'staff_deleted',
        staffId,
        name,
        email,
        deletedAt,
      });

    console.log('Staff deleted', {
      contractorId,
      staffId,
      name,
      email,
    });
  }
);

exports.restoreStaffUser = onCall(
  {
    secrets: ["GMAIL_USER", "GMAIL_PASS"]
  },
  async (request) => {
    const { logId, contractorId } = request.data || {};
    if (!logId || !contractorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing logId or contractorId');
    }

    const logRef = admin.firestore().doc(`contractors/${contractorId}/logs/${logId}`);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Log not found');
    }

    const { name, email } = logSnap.data();
    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Log missing email');
    }

    let uid;

    try {
      const userRecord = await admin.auth().createUser({ email });
      uid = userRecord.uid;

      await admin
        .firestore()
        .doc(`contractors/${contractorId}/staff/${uid}`)
        .set({
          name,
          email,
          role: 'staff',
          contractorId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      const contractorUser = await admin.auth().getUser(contractorId);
      await sendCredentialsEmail({
        staffName: name,
        staffEmail: email,
        contractorEmail: contractorUser.email,
      });

      await logRef.delete();

      return { uid };
    } catch (error) {
      console.error('Failed to restore staff user', error);
      // Cleanup on failure to keep Firestore and Auth in sync
      if (uid) {
        await admin.firestore().doc(`contractors/${contractorId}/staff/${uid}`).delete().catch(() => {});
        await admin.auth().deleteUser(uid).catch(() => {});
      }
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
