import nodemailer from 'nodemailer';

let testAccount = null;
let transporter = null;

// Initialize Nodemailer Transport
async function getTransporter() {
  if (transporter) return transporter;

  try {
    // Generate test Ethereal SMTP account for development/demo
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('✉️  Nodemailer test transporter configured:', testAccount.user);
  } catch (err) {
    // Fallback transport simulation if offline
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
    console.log('✉️  Nodemailer fallback JSON transport active.');
  }

  return transporter;
}

/**
 * Send Fee Due Reminder Email using Nodemailer
 */
export async function sendFeeReminderEmail(recipientEmail, studentName, feeAmount, dueDate) {
  const mail = await getTransporter();

  const mailOptions = {
    from: '"College360 Accounts" <finance@college360.edu>',
    to: recipientEmail,
    subject: `⚠️ Fee Payment Reminder: Due Date ${dueDate}`,
    text: `Dear ${studentName},\n\nThis is a reminder that your pending fee of $${feeAmount} is due on ${dueDate}.\n\nPlease complete your payment at the earliest.\n\nRegards,\nCollege Management Office`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5;">College360 Fee Due Reminder</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>This is a formal reminder regarding your pending academic fees.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Amount Due</th>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #dc2626;">$${feeAmount}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Due Date</th>
            <td style="padding: 10px; border: 1px solid #ddd;">${dueDate}</td>
          </tr>
        </table>
        <p>Please log in to your student portal to complete your payment.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">College360 Management System &bull; Automatic Notification Service</p>
      </div>
    `,
  };

  const info = await mail.sendMail(mailOptions);
  
  let previewUrl = null;
  if (testAccount && nodemailer.getTestMessageUrl) {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`✉️ Fee Reminder sent to ${recipientEmail} → Preview URL: ${previewUrl}`);
  } else {
    console.log(`✉️ Fee Reminder sent to ${recipientEmail}`);
  }

  return {
    messageId: info.messageId,
    previewUrl: previewUrl || 'JSON Transport Simulated'
  };
}
