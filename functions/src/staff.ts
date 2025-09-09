import * as functions from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
const nodemailer = require('nodemailer');
const twilio = require('twilio');

interface CreateStaffUserData {
  contractorId: string;
  contractorCreatedEmail: string;
  phone?: string;
  personalEmail?: string;
}

export const createStaffUser = onCall(async (request) => {
  const data = request.data as CreateStaffUserData;
  const { contractorId, contractorCreatedEmail, phone, personalEmail } = data || {};
  if (!contractorId || !contractorCreatedEmail) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing contractorId or contractorCreatedEmail');
  }

  const tempPassword = crypto.randomBytes(12).toString('hex');
  const userRecord = await admin.auth().createUser({
    email: contractorCreatedEmail,
    password: tempPassword,
  });

  await admin.firestore().doc(`users/${userRecord.uid}`).set({
    contractorId,
    username: contractorCreatedEmail,
    ...(phone ? { phone } : {}),
    ...(personalEmail ? { personalEmail } : {}),
    mustChangePassword: true,
  });

  return { uid: userRecord.uid, contractorCreatedEmail, tempPassword };
});

interface SendStaffCredentialsData {
  uid: string;
  contractorCreatedEmail: string;
  tempPassword: string;
  phone?: string;
  personalEmail?: string;
  contractorEmail: string;
  contractorName: string;
  appUrl: string;
}

export const sendStaffCredentials = onCall(async (request) => {
  const data = request.data as SendStaffCredentialsData;
  const { uid, contractorCreatedEmail, tempPassword, phone, personalEmail, contractorEmail, contractorName, appUrl } = data || {};
  if (!uid || !contractorCreatedEmail || !tempPassword || !contractorEmail || !contractorName || !appUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  if (phone) {
    const twilioConfig = functions.config().twilio as { sid: string; token: string; from: string };
    const client = twilio(twilioConfig.sid, twilioConfig.token);
    await client.messages.create({
      from: twilioConfig.from,
      to: phone,
      body: `You have been added by ${contractorName}. Login at ${appUrl} using ${contractorCreatedEmail} and temporary password ${tempPassword}`,
    });
  }

  if (personalEmail) {
    const smtp = functions.config().smtp as { host: string; port: number; secure?: boolean; user: string; pass: string };
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.sendMail({
      to: personalEmail,
      cc: contractorEmail,
      subject: `Your ${contractorName} account`,
      text: `Login at ${appUrl} with email ${contractorCreatedEmail} and temporary password ${tempPassword}`,
    });
  }

  return { uid };
});

interface ReassignStaffContractorData {
  uid: string;
  newContractorId: string;
}

export const reassignStaffContractor = onCall(async (request) => {
  const data = request.data as ReassignStaffContractorData;
  const { uid, newContractorId } = data || {};
  if (!uid || !newContractorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid or newContractorId');
  }

  await admin.firestore().doc(`users/${uid}`).update({ contractorId: newContractorId });
  try {
    await admin.auth().revokeRefreshTokens(uid);
  } catch (err) {
    console.error('Failed to revoke tokens for user', uid, err);
  }
  return { uid, contractorId: newContractorId };
});

interface DeleteStaffUserData {
  uid: string;
  contractorId: string;
}

export const deleteStaffUser = onCall(async (request) => {
  const data = request.data as DeleteStaffUserData;
  const { uid, contractorId } = data || {};
  if (!uid || !contractorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid or contractorId');
  }
  const staffRef = admin.firestore().doc(`contractors/${contractorId}/staff/${uid}`);
  const snap = await staffRef.get();
  const staff = snap.data() as { email?: string; name?: string } | undefined;
  await staffRef.delete();
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    console.error('Failed to delete auth user', uid, err);
  }
  // logging handled by onStaffDeleted trigger
  return { uid, email: staff?.email };
});

export const onStaffDeleted = onDocumentDeleted(
  'contractors/{contractorId}/staff/{uid}',
  async (event) => {
    const { contractorId, uid } = event.params;
    const data = event.data?.data() as { email?: string; name?: string } | undefined;
    await admin
      .firestore()
      .collection('contractors')
      .doc(contractorId)
      .collection('logs')
      .add({
        type: 'staff_deleted',
        uid,
        email: data?.email || null,
        name: data?.name || null,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }
);

interface RestoreStaffUserData {
  logId: string;
  contractorId: string;
}

export const restoreStaffUser = onCall(async (request) => {
  const data = request.data as RestoreStaffUserData;
  const { logId, contractorId } = data || {};
  if (!logId || !contractorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing logId or contractorId');
  }
  const logRef = admin.firestore().doc(`contractors/${contractorId}/logs/${logId}`);
  const logSnap = await logRef.get();
  if (!logSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Log entry not found');
  }
  const logData = logSnap.data() as { email?: string; name?: string };
  const tempPassword = crypto.randomBytes(12).toString('hex');
  const user = await admin.auth().createUser({ email: logData.email, password: tempPassword });
  await admin
    .firestore()
    .doc(`contractors/${contractorId}/staff/${user.uid}`)
    .set({ email: logData.email || '', name: logData.name || '' });
  await logRef.delete();
  return { uid: user.uid, tempPassword };
});

interface SendPasswordResetEmailData {
  email: string;
  appCheckToken: string;
}

export const sendPasswordResetEmail = onCall(async (request) => {
  const data = request.data as SendPasswordResetEmailData;
  const { email, appCheckToken } = data || {};
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing email');
  }
  if (!appCheckToken) {
    throw new functions.https.HttpsError('failed-precondition', 'Missing App Check token');
  }
  try {
    await admin.appCheck().verifyToken(appCheckToken);
  } catch (err) {
    throw new functions.https.HttpsError('failed-precondition', 'Invalid App Check token');
  }
  await admin.auth().generatePasswordResetLink(email);
  return { email };
});
