const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

exports.createStaffUser = onCall(async (request) => {
  const { email, password } = request.data;
  console.log("📥 Received data in function:", { email });

  if (!email || !password) {
    throw new Error('Missing email or password');
  }

  const userRecord = await admin.auth().createUser({ email, password });
  return { uid: userRecord.uid };
});
