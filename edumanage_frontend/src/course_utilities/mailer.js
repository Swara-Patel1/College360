/**
 * mailer.js — Centralised Email Service for College360
 * =====================================================
 * All email sending in the frontend goes through this module.
 * Emails are dispatched via the Django backend (POST /api/fees/send-reminder/)
 * which uses the configured Gmail SMTP to actually deliver them.
 *
 * NOTE: nodemailer is a Node.js-only package and CANNOT run in the browser.
 *       All email is sent server-side through Django.
 *
 * Exported functions
 * ------------------
 *  sendFeeReminderEmail(recipientEmail, studentName, feeAmount, dueDate, subject?, body?)
 *  sendPerformanceAlertEmail(recipientEmail, studentName, subject?, body?)
 *  sendEmail(recipientEmail, subject, body)   ← generic, use for anything else
 */

import { API_URL } from '../api/client.js';

// ─── Internal helper ───────────────────────────────────────────────────────────

/**
 * Low-level send — POSTs to Django /api/fees/send-reminder/
 * Throws an Error with the backend's message if sending fails.
 *
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} body
 */
async function _dispatch(toEmail, subject, body) {
  const token = localStorage.getItem('access_token');

  const res = await fetch(`${API_URL}/api/fees/send-reminder/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ to_email: toEmail, subject, body }),
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Email failed (HTTP ${res.status})`);
  }

  return { success: true };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a Fee Due Reminder to a parent.
 *
 * @param {string} recipientEmail  Destination email
 * @param {string} studentName     Student's full name
 * @param {number} feeAmount       Outstanding amount (₹)
 * @param {string} dueDate         Formatted due-date string
 * @param {string} [subject]       Override default subject
 * @param {string} [customBody]    Override default body
 */
export async function sendFeeReminderEmail(
  recipientEmail,
  studentName,
  feeAmount,
  dueDate,
  subject,
  customBody,
) {
  const mailSubject =
    subject || `Urgent: Fee Payment Reminder for ${studentName}`;

  const mailBody =
    customBody ||
    `Dear Parent,

This is an official reminder that the fee payment of ₹${feeAmount} for your child ${studentName} remains pending.

Due Date: ${dueDate}

Please complete your payment at the earliest to avoid any academic interruption.

Regards,
College Management Office`;

  return _dispatch(recipientEmail, mailSubject, mailBody);
}

/**
 * Send an Academic Performance Alert to a parent.
 *
 * @param {string} recipientEmail  Destination email
 * @param {string} studentName     Student's full name
 * @param {string} [subject]       Override default subject
 * @param {string} [customBody]    Override default body (required if no template data provided)
 */
export async function sendPerformanceAlertEmail(
  recipientEmail,
  studentName,
  subject,
  customBody,
) {
  const mailSubject =
    subject || `Academic Alert: Performance Update for ${studentName}`;

  const mailBody =
    customBody ||
    `Dear Parent,

This is to notify you regarding your child ${studentName}'s recent academic performance.

Please contact the HOD office for further details or to schedule a review discussion.

Best regards,
HOD Office`;

  return _dispatch(recipientEmail, mailSubject, mailBody);
}

/**
 * Generic email — use this for any message type not covered above.
 *
 * @param {string} recipientEmail  Destination email
 * @param {string} subject         Email subject
 * @param {string} body            Email plain-text body
 */
export async function sendEmail(recipientEmail, subject, body) {
  if (!recipientEmail) throw new Error('Recipient email is required.');
  if (!subject)        throw new Error('Subject is required.');
  if (!body)           throw new Error('Email body is required.');
  return _dispatch(recipientEmail, subject, body);
}
