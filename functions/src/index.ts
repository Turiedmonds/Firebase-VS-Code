import * as admin from 'firebase-admin';
admin.initializeApp();

export { createStaffUser, sendStaffCredentials, reassignStaffContractor } from './staff';
export { deleteStaffUser, onStaffDeleted, restoreStaffUser, sendPasswordResetEmail } from './staff';
