import * as functions from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

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
