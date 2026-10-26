const nodemailer = require('nodemailer');
const logger = require('../../utils/logger');
const env = require('../../config/env');

// In-memory record of sent emails for testing / dev inspection
const sentEmailsLog = [];

// Reserved / dummy / placeholder domains that do not have real public MX records
// Real SMTP dispatch to these domains is suppressed to prevent "Mail Delivery Subsystem / Address Not Found" bounces.
const DUMMY_DOMAINS = new Set([
  'ethiofarm.et',
  'phone.ethiofarm.et',
  'agrietech.et',
  'phone.agrietech.et',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'test.net',
  'invalid',
  'localhost',
  'dummy.com',
  'sample.com',
  'fake.com',
]);

/**
 * Checks whether an email address is a real deliverable domain or a synthetic/test/mock address
 */
function isDummyOrTestEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const normalized = email.trim().toLowerCase();
  
  // Format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return true;

  const parts = normalized.split('@');
  if (parts.length !== 2) return true;

  const [localPart, domain] = parts;

  // Check known placeholder domains
  if (DUMMY_DOMAINS.has(domain)) return true;
  if (domain.endsWith('.ethiofarm.et') || domain.endsWith('.agrietech.et') || domain.endsWith('.invalid') || domain.endsWith('.test') || domain.endsWith('.local') || domain.endsWith('.localhost')) {
    return true;
  }

  // Check synthetic account prefixes
  if (localPart.startsWith('user_') && domain.includes('phone')) return true;
  if (localPart.startsWith('mock_') || localPart.startsWith('test_') || localPart.startsWith('dummy_')) return true;

  return false;
}

// Initialize Nodemailer transporter if SMTP credentials are provided
let transporter = null;
if (env.SMTP_USER && env.SMTP_PASS && env.NODE_ENV !== 'test') {
  const isSecure = Number(env.SMTP_PORT) === 465;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT) || (isSecure ? 465 : 587),
    secure: isSecure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
  logger.info(`[Email Dispatcher] Initialized SMTP transporter for ${env.SMTP_USER} on ${env.SMTP_HOST || 'smtp.gmail.com'}:${env.SMTP_PORT || (isSecure ? 465 : 587)}`);
}

/**
 * Send an email message.
 * Uses real SMTP transport only for real, non-placeholder addresses in non-test environments.
 * Test, placeholder, and mock addresses are safely captured in memory to prevent Mail Delivery Subsystem bounces.
 *
 * @param {object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.text - Plain text content
 * @param {string} [options.html] - HTML content
 * @returns {Promise<{ success: boolean, messageId: string, to: string, deliveredVia: 'SMTP'|'SIMULATED' }>}
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to || typeof to !== 'string') {
    throw new Error('Recipient email address is required');
  }

  const cleanTo = to.trim().toLowerCase();
  // Ensure the From header matches the authenticated SMTP user to prevent Gmail SPF/DMARC bouncebacks
  const from = env.SMTP_USER
    ? `"EthioFarm Platform" <${env.SMTP_USER}>`
    : (env.EMAIL_FROM || '"EthioFarm" <no-reply@ethiofarm.et>');
  
  let messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const isDummy = isDummyOrTestEmail(cleanTo);
  const isTestEnv = env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';

  let deliveredVia = 'SIMULATED';

  if (transporter && !isDummy && !isTestEnv) {
    try {
      const info = await transporter.sendMail({
        from,
        to: cleanTo,
        replyTo: env.SMTP_USER || 'no-reply@ethiofarm.et',
        subject,
        text,
        html: html || text,
      });
      messageId = info.messageId;
      deliveredVia = 'SMTP';
      logger.info(`[Email Dispatcher] Sent real email to ${cleanTo} (MessageId: ${messageId})`);
    } catch (error) {
      logger.warn(`[Email Dispatcher] SMTP dispatch failed for ${cleanTo}: ${error.message}. Fallback to simulated delivery.`);
    }
  } else {
    logger.info(`[Email Dispatcher] Recorded notification to "${cleanTo}" | Subject: "${subject}" | MessageId: ${messageId}`);
  }

  const record = {
    messageId,
    to: cleanTo,
    from,
    subject,
    text,
    html: html || text,
    deliveredVia,
    sentAt: new Date().toISOString(),
  };

  sentEmailsLog.push(record);
  if (sentEmailsLog.length > 100) sentEmailsLog.shift();

  return {
    success: true,
    messageId,
    to: cleanTo,
    deliveredVia,
  };
}


/**
 * Shared HTML Email Wrapper to ensure bulletproof rendering across Gmail, Outlook, Apple Mail, iOS, and Android
 */
function buildEmailShell({ title, badge, preheader, contentHtml, footerAmharic }) {
  const currentYear = new Date().getFullYear();
  const appUrl = env.APP_URL || 'https://agrietech.onrender.com';

  return `
    <!DOCTYPE html>
    <html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light">
      <meta name="supported-color-schemes" content="light">
      <title>${title}</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
      <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        @media only screen and (max-width: 620px) {
          .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
          .header-pad { padding: 28px 20px !important; }
          .body-pad { padding: 28px 20px !important; }
          .footer-pad { padding: 24px 20px !important; }
          .cta-btn { width: 100% !important; text-align: center !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <!-- Hidden Preheader for inbox preview snippet -->
      <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        ${preheader || title}
      </div>

      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 8px;">
        <tr>
          <td align="center">
            <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
              
              <!-- Brand Header -->
              <tr>
                <td class="header-pad" style="background: linear-gradient(135deg, #0b3d16 0%, #15803d 50%, #16a34a 100%); padding: 36px 40px; text-align: left;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <div style="display: inline-block; background-color: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); border-radius: 20px; padding: 5px 14px; margin-bottom: 12px;">
                          <span style="color: #bbf7d0; font-weight: 700; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase;">
                            ${badge || '🌱 EthioFarm Smart Farming'}
                          </span>
                        </div>
                        <h1 style="margin: 0; color: #ffffff; font-size: 23px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.3;">
                          ${title}
                        </h1>
                        <p style="margin: 6px 0 0 0; color: #dcfce7; font-size: 13px; font-weight: 400; opacity: 0.95;">
                          Federal Democratic Republic of Ethiopia &bull; Ministry of Agriculture
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Dynamic Body -->
              <tr>
                <td class="body-pad" style="padding: 36px 40px; color: #334155; line-height: 1.65; font-size: 15px;">
                  ${contentHtml}

                  ${footerAmharic ? `
                  <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 28px;">
                    <p style="margin: 0; font-size: 13px; color: #64748b; font-style: italic; line-height: 1.6;">
                      🇪🇹 <strong>የአማርኛ ማሳሰቢያ፦</strong> ${footerAmharic}
                    </p>
                  </div>
                  ` : ''}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td class="footer-pad" style="background-color: #f8fafc; padding: 28px 40px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
                  <p style="margin: 0 0 6px 0; font-weight: 700; color: #1e293b; font-size: 13px;">
                    EthioFarm Smart Farming & Advisory Platform
                  </p>
                  <p style="margin: 0 0 8px 0;">
                    Addis Ababa, Ethiopia &bull; <a href="${appUrl}" style="color: #15803d; text-decoration: none; font-weight: 600;">${appUrl}</a>
                  </p>
                  <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                    &copy; ${currentYear} EthioFarm. This is an automated notification. Please do not reply directly.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Dispatch a Password Reset Email with 6-digit code and direct action link
 */
async function sendPasswordResetEmail(email, resetToken, resetLink) {
  const subject = '🔒 Reset Your EthioFarm Account Password';
  const resolvedLink = resetLink || `${env.APP_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
  
  const text = `EthioFarm Smart Farming Platform\n\nPassword Reset Request\n\nHello,\n\nWe received a request to reset the password for your EthioFarm account associated with ${email}.\n\nYour 6-Digit Verification Code:\n>>> ${resetToken} <<<\n\nPlease click the link below or enter the 6-digit code on the reset page:\n${resolvedLink}\n\nThis code and link are valid for 5 minutes.\n\nIf you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.\n\nBest regards,\nEthioFarm Platform Team\nAddis Ababa, Ethiopia\n${env.APP_URL}`;

  const contentHtml = `
    <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">
      Hello,
    </p>
    <p style="margin: 0 0 16px 0;">
      We received a password reset request for your account associated with <strong style="color: #0f172a;">${email}</strong>.
    </p>

    <!-- 6-Digit Numeric OTP Code Container -->
    <div style="background-color: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 22px 16px; text-align: center; margin: 24px 0;">
      <div style="font-size: 12px; color: #15803d; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
        Your 6-Digit Reset Code
      </div>
      <div style="font-size: 38px; font-weight: 900; color: #14532d; letter-spacing: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
        ${resetToken}
      </div>
      <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
        ⏱️ Valid for 5 minutes
      </div>
    </div>

    <p style="margin: 0 0 20px 0;">
      You can either enter the 6-digit code on your device or click the secure button below:
    </p>

    <!-- CTA Button -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); box-shadow: 0 4px 14px rgba(22,163,74,0.35);">
                <a href="${resolvedLink}" target="_blank" class="cta-btn" style="display: inline-block; padding: 15px 36px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                  🔒 Reset My Password &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Direct Fallback Link -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 24px 0 18px 0;">
      <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
        Direct link:
      </p>
      <p style="margin: 0; word-break: break-all; font-size: 12px; color: #15803d;">
        <a href="${resolvedLink}" style="color: #15803d; text-decoration: underline;">${resolvedLink}</a>
      </p>
    </div>

    <!-- Security Alert Box -->
    <div style="background-color: #fefce8; border-left: 4px solid #eab308; border-radius: 6px; padding: 12px 16px; margin-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #854d0e; line-height: 1.5;">
        <strong>Security Notice:</strong> If you did not request a password reset, no action is needed. Your account remains completely secure.
      </p>
    </div>
  `;

  const html = buildEmailShell({
    title: 'Password Reset Request',
    badge: '🔒 Security Verification',
    preheader: `Your EthioFarm password reset code is ${resetToken}. Valid for 5 minutes.`,
    contentHtml,
    footerAmharic: 'የይለፍ ቃልዎን ለመቀየር ከላይ ያለውን ባለ 6-አሃዝ ኮድ ይጠቀሙ (ለ 5 ደቂቃዎች ብቻ ያገለግላል) ወይም አረንጓዴውን ማስፈንጠሪያ ይጫኑ።',
  });


  return sendEmail({ to: email, subject, text, html });
}

/**
 * Dispatch an Email Verification Link for New Registrations
 */
async function sendVerificationEmail(email, verificationToken, verificationLink) {
  const subject = '🌿 Verify Your EthioFarm Account';
  const resolvedLink = verificationLink || `${env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;

  const text = `Welcome to EthioFarm Smart Farming Platform!\n\nHello,\n\nThank you for registering. Please verify your email address by clicking the link below:\n${resolvedLink}\n\nThis verification link is valid for 24 hours.\n\nOnce verified, you will unlock full access to:\n- Woreda-level climate & drought early warnings\n- AI crop disease diagnosis & treatments\n- Satellite vegetation vigor (NDVI) monitoring\n\nThank you,\nEthioFarm Platform Team\nAddis Ababa, Ethiopia\n${env.APP_URL}`;

  const contentHtml = `
    <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">
      Welcome to the EthioFarm platform!
    </p>
    <p style="margin: 0 0 16px 0;">
      Thank you for registering an account with <strong style="color: #0f172a;">${email}</strong>. Please confirm your email address to unlock full early warning and precision advisory tools.
    </p>

    <!-- Platform Capabilities Grid -->
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin: 22px 0;">
      <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.6px;">
        ✨ Platform Features Unlocked Upon Verification:
      </p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding: 5px 0; font-size: 13.5px; color: #14532d;">
            🛰️ <strong>Drought & Flood Forecasts:</strong> High-resolution satellite analytics for your woreda.
          </td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-size: 13.5px; color: #14532d;">
            🌿 <strong>Dual-AI Crop Diagnosis:</strong> Multimodal botanical analysis and treatment guides.
          </td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-size: 13.5px; color: #14532d;">
            📊 <strong>Hyper-Local Soil & Climatology:</strong> Downscaled EthioSIS recommendations.
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); box-shadow: 0 4px 14px rgba(22,163,74,0.35);">
                <a href="${resolvedLink}" target="_blank" class="cta-btn" style="display: inline-block; padding: 16px 38px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                  ✅ Confirm Email & Activate Account &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 20px;">
      <span style="display: inline-block; background-color: #f1f5f9; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 600; color: #475569;">
        ⏱️ Verification link expires in 24 hours
      </span>
    </div>

    <!-- Direct Fallback Link -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 20px 0;">
      <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
        Button not working? Copy this link into your browser:
      </p>
      <p style="margin: 0; word-break: break-all; font-size: 12px; color: #15803d;">
        <a href="${resolvedLink}" style="color: #15803d; text-decoration: underline;">${resolvedLink}</a>
      </p>
    </div>
  `;

  const html = buildEmailShell({
    title: 'Welcome to EthioFarm Platform',
    badge: '🌱 Account Activation',
    preheader: 'Welcome to EthioFarm! Please verify your email address to activate your account.',
    contentHtml,
    footerAmharic: 'የኢትዮፋርም መለያዎን ለማረጋገጥ እና አገልግሎቶችን ለመጀመር ከላይ ያለውን አረንጓዴ ማስፈንጠሪያ ይጫኑ።',
  });

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Dispatch an Emergency Hazard Early Warning Alert Email
 */
async function sendEmergencyHazardAlertEmail({ email, woredaName, hazardType, severity, headline, message, actionSteps = [] }) {
  const subject = `⚠️ [${severity}] ${hazardType} Early Warning Alert — ${woredaName}`;
  const isCritical = severity === 'CRITICAL' || severity === 'RED';
  const badgeColor = isCritical ? '#ef4444' : '#f59e0b';
  const appUrl = env.APP_URL || 'https://agrietech.onrender.com';

  const text = `EMERGENCY HAZARD ALERT - EthioFarm Platform\n\nSeverity: ${severity}\nHazard: ${hazardType}\nWoreda: ${woredaName}\nHeadline: ${headline}\n\nMessage:\n${message}\n\nRecommended Actions:\n${actionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nView live map: ${appUrl}/risk-map`;

  const contentHtml = `
    <div style="background-color: ${isCritical ? '#fef2f2' : '#fffbeb'}; border-left: 5px solid ${badgeColor}; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
      <div style="font-size: 12px; font-weight: 800; color: ${isCritical ? '#b91c1c' : '#b45309'}; text-transform: uppercase; letter-spacing: 0.8px;">
        ${severity} RISK NOTIFICATION
      </div>
      <h2 style="margin: 6px 0 0 0; color: #0f172a; font-size: 18px; font-weight: 800;">
        ${headline}
      </h2>
    </div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px; font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #64748b; width: 120px;"><strong>Hazard Type:</strong></td>
        <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${hazardType}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #64748b;"><strong>Location:</strong></td>
        <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${woredaName}, Ethiopia</td>
      </tr>
    </table>

    <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.6;">
      ${message}
    </p>

    ${actionSteps.length > 0 ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase;">
        🛡️ Required Agricultural Protective Actions:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.6;">
        ${actionSteps.map((step) => `<li style="margin-bottom: 6px;">${step}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <!-- Live Map CTA Button -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #0f172a 0%, #334155 100%);">
                <a href="${appUrl}/risk-map" target="_blank" class="cta-btn" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px;">
                  🗺️ View Interactive Risk Map &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const html = buildEmailShell({
    title: `${severity} Hazard Alert: ${hazardType}`,
    badge: `🚨 Hazard Early Warning`,
    preheader: `[${severity}] ${hazardType} alert for ${woredaName}: ${headline}`,
    contentHtml,
    footerAmharic: 'የአካባቢዎን የአደጋ ሁኔታ ለመከታተል እና ጥንቃቄዎችን ለመውሰድ ከላይ ያለውን የካርታ ማስፈንጠሪያ ይጫኑ።',
  });

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Get in-memory email log (for tests)
 */
function getSentEmailsLog() {
  return sentEmailsLog;
}

/**
 * Dispatch a Phone Verification OTP Code via Email (Dual-Channel Delivery Fallback)
 */
async function sendPhoneVerificationOtpEmail(email, phone, otpCode) {
  const subject = `🔑 Your EthioFarm Phone Verification Code: ${otpCode}`;
  const text = `EthioFarm Smart Farming Platform\n\nPhone Verification Code\n\nHello,\n\nYour 6-digit phone verification code for ${phone} is:\n>>> ${otpCode} <<<\n\nPlease enter this code on the verification screen to activate your account.\n\nThis code is valid for 10 minutes.\n\nBest regards,\nEthioFarm Platform Team\nAddis Ababa, Ethiopia\n${env.APP_URL}`;

  const contentHtml = `
    <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">
      Hello,
    </p>
    <p style="margin: 0 0 16px 0;">
      Here is your phone verification code to activate your EthioFarm account for mobile number <strong style="color: #0f172a;">${phone}</strong>.
    </p>

    <!-- 6-Digit Numeric OTP Code Container -->
    <div style="background-color: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 22px 16px; text-align: center; margin: 24px 0;">
      <div style="font-size: 12px; color: #15803d; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
        Your 6-Digit Verification Code
      </div>
      <div style="font-size: 38px; font-weight: 900; color: #14532d; letter-spacing: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
        ${otpCode}
      </div>
      <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
        ⏱️ Valid for 10 minutes &bull; Do not share this code
      </div>
    </div>

    <p style="margin: 0 0 16px 0; font-size: 13.5px; color: #475569;">
      Enter this code in the mobile application to complete verification and access your command center.
    </p>
  `;

  const html = buildEmailShell({
    title: 'Phone Verification Code',
    badge: '📱 Phone Verification',
    preheader: `Your EthioFarm phone verification code is ${otpCode}. Valid for 10 minutes.`,
    contentHtml,
    footerAmharic: 'የስልክ ቁጥር ማረጋገጫ ኮድዎን በሞባይል መተግበሪያው ላይ በማስገባት መለያዎን ያረጋግጡ።',
  });

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Clear email log (for tests)
 */
function clearSentEmailsLog() {
  sentEmailsLog.length = 0;
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendPhoneVerificationOtpEmail,
  sendEmergencyHazardAlertEmail,
  getSentEmailsLog,
  clearSentEmailsLog,
};

