const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();

exports.createStaffUser = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    try {
      const userRecord = await admin.auth().createUser({ email, password });
      res.status(200).json({ uid: userRecord.uid });
    } catch (err) {
      console.error('Failed to create user', err);
      res.status(500).json({ error: err.message });
    }
  });
});
