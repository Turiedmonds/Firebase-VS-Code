const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.createStaffUser = functions.https.onCall(async (data, context) => {
  const { email, password } = data;
  if (!email || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing email or password');
  }

  try {
    const userRecord = await admin.auth().createUser({ email, password });
    return { uid: userRecord.uid };
  } catch (err) {
    console.error('Failed to create user', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});
