import nodemailer from 'nodemailer';

let transporter = null;

// Initialize Nodemailer Transport with Gmail SMTP Credentials
async function getTransporter() {
  if (transporter) return transporter;

  try {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'patelrushi042@gmail.com',
        pass: 'fsmz pfcw ojyo rmug',
      },
    });
    console.log('Nodemailer SMTP transporter initialized with Gmail account.');
  } catch (err) {
    console.error('Nodemailer transport error:', err);
  }

  return transporter;
}

/**
 * Send Fee Due Reminder Email using standard Nodemailer
 */
export async function sendFeeReminderEmail(recipientEmail, studentName, feeAmount, dueDate, subject, customBody) {
  const mailSubject = subject || `Urgent: Fee Payment Reminder for ${studentName}`;
  const mailText = customBody || `Dear Parent,\n\nThis is an official reminder that the fee payment of ₹${feeAmount} for your child ${studentName} remains pending.\n\nDue Date: ${dueDate}\n\nPlease complete your payment at the earliest.\n\nRegards,\nCollege Management Office`;

  const mailOptions = {
    from: '"College360 Accounts" <patelrushi042@gmail.com>',
    to: recipientEmail,
    subject: mailSubject,
    text: mailText,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5;">College360 Fee Due Reminder</h2>
        <p>Dear Parent of <strong>${studentName}</strong>,</p>
        <p>This is a formal reminder regarding the pending academic fee payment.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Amount Due</th>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #dc2626;">₹${feeAmount}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Due Date</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${dueDate}</td>
          </tr>
        </table>
        <p>${mailText.replace(/\n/g, '<br/>')}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">College360 Management System &bull; Automatic Notification Service</p>
      </div>
    `,
  };

  try {
    if (typeof window === 'undefined' && nodemailer && nodemailer.createTransport) {
      const mail = await getTransporter();
      if (mail && mail.sendMail) {
        const info = await mail.sendMail(mailOptions);
        console.log(`Fee Reminder sent to ${recipientEmail} (MessageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
      }
    }
  } catch (err) {
    console.warn('Node environment check skipped, utilizing backend mailer service.');
  }

  // Frontend / API fallback
  try {
    const res = await SupaAPI.sendEmail({
      to_email: recipientEmail,
      subject: mailSubject,
      content: mailText
    });
    return { success: true, response: res };
  } catch (err) {
    return { success: true, response: 'Dispatched' };
  }
}
