const { Resend } = require('resend');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Resend Configuration
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'Restaurant Reservations <onboarding@resend.dev>';
const resend = resendApiKey ? new Resend(resendApiKey) : null;


// SMTP Fallback Configuration
const rawHost = process.env.SMTP_HOST || 'localhost';
const host = rawHost.replace(/^.*:\/\//, '');
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
const smtpFrom = process.env.SMTP_FROM || user || 'no-reply@restaurant-reservation.com';

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});

/**
 * Reusable asynchronous function to send transactional emails via Resend (with SMTP fallback)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} htmlBody - HTML formatted body
 * @returns {Promise<{success: boolean, id?: string, messageId?: string, error?: string}>}
 */

async function sendTransactionalEmail(to, subject, htmlBody) {
  if (!to) {
    console.warn(
      '[Email Service] No recipient email address provided.'
    );

    return {
      success: false,
      error: 'Recipient email is missing'
    };
  }

  let resendError = null;

  // 1. Primary delivery via Resend
  if (resend) {
    try {
      const { data, error } =
        await resend.emails.send({
          from: resendFromEmail,
          to: [to],
          subject,
          html: htmlBody
        });

      if (error) {
        console.error(
          '[Email Service] Resend API Error:',
          error
        );

        throw new Error(
          error.message ||
          'Resend email delivery failed'
        );
      }

      console.log(
        '[Email Service] Resend email dispatched successfully:',
        {
          to,
          subject,
          id: data?.id
        }
      );

      return {
        success: true,
        id: data?.id,
        provider: 'resend'
      };

    } catch (err) {
      resendError = err;

      console.error(
        '[Email Service] Resend dispatch failed:',
        err.message
      );
    }
  }

  // 2. SMTP fallback
  if (user && pass) {
    try {
      const info =
        await transporter.sendMail({
          from:
            `"Restaurant Reservations" <${smtpFrom}>`,
          to,
          subject,
          html: htmlBody
        });

      console.log(
        '[Email Service] SMTP email dispatched successfully:',
        {
          to,
          subject,
          messageId: info.messageId
        }
      );

      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp'
      };

    } catch (smtpErr) {
      console.error(
        '[Email Service] SMTP fallback failed:',
        smtpErr.message
      );

      return {
        success: false,
        error:
          smtpErr.message ||
          resendError?.message ||
          'Email delivery failed'
      };
    }
  }

  // 3. No working provider
  if (resendError) {
    return {
      success: false,
      error: resendError.message
    };
  }

  console.error(
    '[Email Service] No email provider is configured.'
  );

  return {
    success: false,
    error: 'No email provider configured'
  };
}

/**
 * Common Minimalist HTML Email Wrapper
 */
function getEmailLayout(title, content, footerHtml = null) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 30px 15px;
      line-height: 1.6;
    }
    .email-container {
      max-width: 580px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      background-color: #0f172a;
      color: #ffffff;
      padding: 24px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: -0.02em;
    }
    .content {
      padding: 30px;
    }
    .notice {
      font-size: 16px;
      color: #334155;
      margin-bottom: 24px;
    }
    .card {
      background-color: #f1f5f9;
      border-left: 4px solid #0284c7;
      padding: 18px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }
    .lookup-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 15px;
      font-weight: 700;
      color: #0284c7;
      word-break: break-all;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .details-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    .details-table td.label {
      font-weight: 600;
      color: #64748b;
      width: 35%;
    }
    .details-table td.value {
      color: #0f172a;
      font-weight: 500;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .status-CONFIRMED {
      background-color: #dcfce7;
      color: #15803d;
    }
    .status-PENDING {
      background-color: #fef9c3;
      color: #854d0e;
    }
    .status-DECLINED {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    .btn-container {
      text-align: center;
      margin-top: 28px;
    }
    .btn {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 6px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      background-color: #fafafa;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Restaurant Reservation Service</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      ${footerHtml || '<p>Thank you for choosing our restaurant. Use your Tracking ID to view or cancel anytime on our website.</p>'}
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 1. Template: 'Reservation Received'
 */
function generateReservationReceivedEmail(reservation) {
  const customerName = reservation.name || reservation.customer_name || 'Guest';
  const resDate = reservation.date || reservation.reservation_date || 'N/A';
  const resTime = reservation.time || reservation.reservation_time || 'N/A';
  const guests = reservation.guests || reservation.party_size || 'N/A';

  const content = `
    <p class="notice">We have received your reservation request and it is currently awaiting confirmation from the restaurant.</p>

    <div class="card">
      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reservation Tracking ID</div>
      <div class="lookup-id">${reservation.id}</div>
    </div>

    <table class="details-table">
      <tr>
        <td class="label">Customer Name</td>
        <td class="value">${customerName}</td>
      </tr>
      <tr>
        <td class="label">Status</td>
        <td class="value"><span class="status-badge status-PENDING">PENDING</span></td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td class="value">${resDate}</td>
      </tr>
      <tr>
        <td class="label">Time</td>
        <td class="value">${resTime}</td>
      </tr>
      <tr>
        <td class="label">Guests</td>
        <td class="value">${guests} guests</td>
      </tr>
      ${reservation.special_requests ? `
      <tr>
        <td class="label">Special Requests</td>
        <td class="value">${reservation.special_requests}</td>
      </tr>` : ''}
    </table>

    <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 20px;">
      You can track or cancel this reservation anytime directly from our website using your Tracking ID.
    </p>
  `;

  return getEmailLayout('Reservation Request Received', content);
}

/**
 * 2. Template: 'Reservation Status Updated'
 */
function generateReservationStatusUpdatedEmail(reservation, status) {
  const normalizedStatus = (status || reservation.status || 'CONFIRMED').toUpperCase();
  const customerName = reservation.name || reservation.customer_name || 'Guest';
  const resDate = reservation.date || reservation.reservation_date || 'N/A';
  const resTime = reservation.time || reservation.reservation_time || 'N/A';
  const guests = reservation.guests || reservation.party_size || 'N/A';

  const content = `
    <p class="notice">Your reservation status has been updated to: <strong>[${normalizedStatus}]</strong></p>

    <div class="card">
      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reservation Tracking ID</div>
      <div class="lookup-id">${reservation.id}</div>
    </div>

    <table class="details-table">
      <tr>
        <td class="label">Customer Name</td>
        <td class="value">${customerName}</td>
      </tr>
      <tr>
        <td class="label">Current Status</td>
        <td class="value"><span class="status-badge status-${normalizedStatus}">${normalizedStatus}</span></td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td class="value">${resDate}</td>
      </tr>
      <tr>
        <td class="label">Time</td>
        <td class="value">${resTime}</td>
      </tr>
      <tr>
        <td class="label">Guests</td>
        <td class="value">${guests} guests</td>
      </tr>
      ${reservation.special_requests ? `
      <tr>
        <td class="label">Special Requests</td>
        <td class="value">${reservation.special_requests}</td>
      </tr>` : ''}
    </table>
  `;

  return getEmailLayout(`Reservation Status: ${normalizedStatus}`, content);
}

/**
 * 3. Template: 'Manual Reservation Booked'
 */
function generateManualReservationEmail(reservation) {
  const customerName = reservation.name || reservation.customer_name || 'Guest';
  const resDate = reservation.date || reservation.reservation_date || 'N/A';
  const resTime = reservation.time || reservation.reservation_time || 'N/A';
  const guests = reservation.guests || reservation.party_size || 'N/A';

  const content = `
    <p class="notice">A new reservation has been booked for you by the restaurant coordinator.</p>

    <div class="card">
      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reservation Tracking ID</div>
      <div class="lookup-id">${reservation.id}</div>
    </div>

    <table class="details-table">
      <tr>
        <td class="label">Customer Name</td>
        <td class="value">${customerName}</td>
      </tr>
      <tr>
        <td class="label">Booking Status</td>
        <td class="value"><span class="status-badge status-CONFIRMED">CONFIRMED</span></td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td class="value">${resDate}</td>
      </tr>
      <tr>
        <td class="label">Time</td>
        <td class="value">${resTime}</td>
      </tr>
      <tr>
        <td class="label">Guests</td>
        <td class="value">${guests} guests</td>
      </tr>
      ${reservation.special_requests ? `
      <tr>
        <td class="label">Special Requests</td>
        <td class="value">${reservation.special_requests}</td>
      </tr>` : ''}
    </table>
  `;

  return getEmailLayout('Your Reservation is Confirmed', content);
}

/**
 * Helper triggers to package and dispatch emails
 */
async function sendReservationReceivedNotification(reservation) {
  const targetEmail = reservation.email || reservation.customer_email;
  if (!reservation || !targetEmail) return;
  const html = generateReservationReceivedEmail(reservation);
  return sendTransactionalEmail(
    targetEmail,
    'Reservation Request Received - Tracking ID Inside',
    html
  );
}

async function sendReservationStatusUpdatedNotification(reservation, status) {
  const targetEmail = reservation.email || reservation.customer_email;
  if (!reservation || !targetEmail) return;
  const normalizedStatus = (status || reservation.status || 'UPDATED').toUpperCase();
  const html = generateReservationStatusUpdatedEmail(reservation, normalizedStatus);
  return sendTransactionalEmail(
    targetEmail,
    `Reservation Update: Status is now [${normalizedStatus}]`,
    html
  );
}

async function sendManualReservationNotification(reservation) {
  const targetEmail = reservation.email || reservation.customer_email;
  if (!reservation || !targetEmail) return;
  const html = generateManualReservationEmail(reservation);
  return sendTransactionalEmail(
    targetEmail,
    'New Reservation Confirmed by Restaurant Coordinator',
    html
  );
}

/**
 * 4. Template: Restaurant Owner Welcome Email
 */

// I.C added
function generateRestaurantWelcomeEmail({
  fullName,
  restaurantName,
  restaurantId
}) {
  const safeName = fullName || 'Restaurant Owner';
  const safeRestaurantName = restaurantName || 'Your Restaurant';

  const adminUrl =
    `${process.env.APP_BASE_URL || 'http://localhost:3000'}` +
    `/admin.html?restaurant_id=${encodeURIComponent(restaurantId)}`;

  const content = `
    <p class="notice">
      Hi <strong>${safeName}</strong>,
    </p>

    <p class="notice">
      Welcome to TableAI. Your restaurant workspace for
      <strong>${safeRestaurantName}</strong>
      has been created successfully.
    </p>

    <div class="card">
      <div
        style="
          font-size:13px;
          color:#64748b;
          margin-bottom:6px;
          text-transform:uppercase;
          letter-spacing:0.05em;
          font-weight:600;
        "
      >
        Restaurant Workspace
      </div>

      <div
        style="
          font-size:18px;
          font-weight:700;
          color:#0f172a;
        "
      >
        ${safeRestaurantName}
      </div>
    </div>

    <p
      style="
        font-size:14px;
        color:#64748b;
        line-height:1.7;
      "
    >
      From your Admin Hub you can manage reservations,
      customers, opening hours, capacity settings and
      your restaurant profile.
    </p>

    <div class="btn-container">
      <a
        href="${adminUrl}"
        class="btn"
      >
        Open Admin Hub
      </a>
    </div>

    <p
      style="
        font-size:13px;
        color:#94a3b8;
        text-align:center;
        margin-top:24px;
      "
    >
      You can return to your Admin Hub anytime using
      your TableAI account.
    </p>
  `;

  return getEmailLayout(
    `Welcome to TableAI - ${safeRestaurantName}`,
    content
  );
}


// I.C added
async function sendRestaurantWelcomeNotification({
  email,
  fullName,
  restaurantName,
  restaurantId
}) {
  if (!email) {
    console.warn(
      '[Email Service] Welcome email skipped: owner email missing.'
    );

    return {
      success: false,
      error: 'Owner email is missing'
    };
  }

  const html =
    generateRestaurantWelcomeEmail({
      fullName,
      restaurantName,
      restaurantId
    });

  return sendTransactionalEmail(
    email,
    `Welcome to TableAI - ${restaurantName}`,
    html
  );
}

/**
 * 5. Template: restaurant owner alert (new booking / guest cancellation)
 * All guest-supplied values are HTML-escaped.
 */
function escapeEmailHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateOwnerReservationAlertEmail(reservation, { type = 'NEW', restaurantName = '' } = {}) {
  const isCancellation = type === 'CANCELLED';
  const title = isCancellation ? 'Reservierung storniert' : 'Neue Reservierung';
  const statusLabel = (reservation.status || '').toUpperCase() === 'CONFIRMED' ? 'Bestätigt' : 'Wartet auf Bestätigung';

  const rows = [
    ['Gast', reservation.name || reservation.customer_name || 'Gast'],
    ['Datum', reservation.date || reservation.reservation_date || ''],
    ['Uhrzeit', String(reservation.time || reservation.reservation_time || '').slice(0, 5)],
    ['Personen', reservation.guests || reservation.party_size || ''],
    ['E-Mail', reservation.email || reservation.customer_email || ''],
    ['Telefon', reservation.phone || reservation.customer_phone || ''],
    ['Status', isCancellation ? 'Vom Gast storniert' : statusLabel],
    ['Besondere Wünsche', reservation.special_requests || '']
  ].filter(([, value]) => value !== '' && value !== null && value !== undefined);

  const adminUrl = `${process.env.APP_BASE_URL || ''}/admin.html?view=reservations`;

  const content = `
    <p class="notice">
      ${isCancellation ? 'Eine Reservierung wurde vom Gast storniert' : 'Es ist eine neue Online-Reservierung eingegangen'}${restaurantName ? ` für <strong>${escapeEmailHtml(restaurantName)}</strong>` : ''}.
    </p>
    <table class="details-table">
      ${rows.map(([label, value]) => `
      <tr>
        <td class="label">${escapeEmailHtml(label)}</td>
        <td class="value">${escapeEmailHtml(value)}</td>
      </tr>`).join('')}
    </table>
    ${adminUrl.startsWith('http') ? `<p class="notice"><a href="${escapeEmailHtml(adminUrl)}">Im Admin-Bereich öffnen</a></p>` : ''}
  `;

  return getEmailLayout(
    title,
    content,
    '<p>Diese Benachrichtigung können Sie in den Einstellungen unter „Benachrichtigungen“ deaktivieren.</p>'
  );
}

async function sendOwnerReservationAlert(to, reservation, { type = 'NEW', restaurantName = '' } = {}) {
  if (!to || !reservation) return;
  const html = generateOwnerReservationAlertEmail(reservation, { type, restaurantName });
  const when = `${reservation.date || reservation.reservation_date || ''} ${String(reservation.time || reservation.reservation_time || '').slice(0, 5)}`.trim();
  const subject = type === 'CANCELLED'
    ? `Reservierung storniert: ${when}`
    : `Neue Reservierung: ${when} · ${reservation.guests || reservation.party_size || ''} Pers.`;
  return sendTransactionalEmail(to, subject, html);
}

module.exports = {
  resend,
  sendTransactionalEmail,
  generateReservationReceivedEmail,
  generateReservationStatusUpdatedEmail,
  generateManualReservationEmail,
  sendReservationReceivedNotification,
  sendReservationStatusUpdatedNotification,
  sendManualReservationNotification,

  // I.C added

  generateRestaurantWelcomeEmail,
  sendRestaurantWelcomeNotification,
  generateOwnerReservationAlertEmail,
  sendOwnerReservationAlert
};
