const authService = require('./auth.service');
const mfaService = require('./mfa.service');
const sessionService = require('./session.service');
const securityMonitor = require('./security-monitor.service');

// Register user endpoint
async function register(req, res, next) {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// User login endpoint (Email or Phone) with brute-force protection & session tracking
async function login(req, res, next) {
  try {
    const identifier = req.body?.phoneNumber || req.body?.phone || req.body?.email || req.body?.identifier;
    if (identifier) {
      const isLocked = await securityMonitor.isAccountLocked(identifier);
      if (isLocked) {
        return res.status(423).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
          },
        });
      }
    }

    try {
      const result = await authService.loginUser(req.body);
      if (identifier) {
        await securityMonitor.recordLoginAttempt(identifier, true, req.ip, req.headers['user-agent']);
      }
      if (result && result.user) {
        const session = await sessionService.createSession(
          result.user.id,
          {
            device: req.headers['x-device-name'] || req.body?.deviceName,
            browser: req.headers['user-agent'],
            ipAddress: req.ip,
          },
          req.ip
        );
        result.session = session;
      }
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (identifier) {
        await securityMonitor.recordLoginAttempt(identifier, false, req.ip, req.headers['user-agent']);
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

// Refresh access token
async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Logout & blacklist tokens
async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const { refreshToken } = req.body || {};
    await authService.logoutUser(token, refreshToken);
    res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    next(error);
  }
}

// Current user profile
async function getProfile(req, res, next) {
  try {
    const profile = await authService.getUserProfile(req.user?.id);
    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

// Update profile (authenticated)
async function updateProfile(req, res, next) {
  try {
    const updated = await authService.updateUserProfile(req.user?.id, req.body);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

// Update device FCM token (authenticated)
async function updateDeviceToken(req, res, next) {
  try {
    const { deviceToken, token } = req.body || {};
    const resolvedToken = deviceToken || token;
    const updated = await authService.updateUserProfile(req.user?.id, { deviceToken: resolvedToken });
    res.status(200).json({ success: true, data: updated, message: 'Device token updated' });
  } catch (error) {
    next(error);
  }
}

// Update password (authenticated)
async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.updatePassword(req.user?.id, currentPassword, newPassword);
    res.status(200).json({ success: true, data: { message: 'Password updated successfully' } });
  } catch (error) {
    next(error);
  }
}

// Forgot password - Send reset link to email or phone SMS
async function forgotPassword(req, res, next) {
  try {
    const { email, identifier, phoneNumber, phone } = req.body;
    const result = await authService.forgotPassword(email || identifier || phoneNumber || phone || req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Reset password with token
async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Request login OTP via SMS (Passwordless Login)
async function requestLoginOtp(req, res, next) {
  try {
    const result = await authService.requestLoginOtp(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Verify login OTP and authenticate
async function verifyLoginOtp(req, res, next) {
  try {
    const result = await authService.verifyLoginOtp(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Verify sign-up phone ownership OTP
async function verifyPhoneOtp(req, res, next) {
  try {
    const result = await authService.verifyPhoneOtp(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Resend sign-up phone ownership OTP
async function resendPhoneOtp(req, res, next) {
  try {
    const result = await authService.resendPhoneOtp(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

function renderForgotPasswordHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forgot Password - EthioFarm Smart Farming</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #10b981;
      --primary-dark: #059669;
      --primary-light: #ecfdf5;
      --dark: #0f172a;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --radius: 10px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #f1f5f9 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      color: var(--text);
    }
    .card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      width: 100%;
      max-width: 440px;
      padding: 2.25rem 2rem;
      text-align: center;
    }
    .brand-icon {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #10b981, #059669);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem auto;
      font-size: 1.75rem;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    }
    h1 { font-size: 1.4rem; font-weight: 800; color: var(--dark); margin-bottom: 0.5rem; }
    p { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.75rem; line-height: 1.4; }
    .form-group { text-align: left; margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.8rem; font-weight: 700; color: #334155; margin-bottom: 0.35rem; }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.925rem;
      outline: none;
      transition: all 0.2s;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .btn {
      width: 100%;
      padding: 0.8rem 1.5rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .btn:hover { background: var(--primary-dark); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .footer-link { margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted); }
    .footer-link a { color: var(--primary); font-weight: 600; text-decoration: none; }
    .footer-link a:hover { text-decoration: underline; }
    .alert-box {
      padding: 0.75rem 1rem;
      border-radius: var(--radius);
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      display: none;
      text-align: left;
    }
    .alert-success { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .alert-error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-icon">🌱</div>
    <h1>Forgot Password?</h1>
    <p>Enter your registered email address to receive a secure 6-digit password reset code.</p>

    <div id="alertBox" class="alert-box"></div>

    <form id="forgotForm" onsubmit="event.preventDefault(); submitForgot();">
      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" placeholder="farmer@ethiofarm.et" required autocomplete="email">
      </div>
      <button type="submit" id="submitBtn" class="btn">Send Reset Code ➔</button>
    </form>

    <div class="footer-link">
      Remembered your password? <a href="/login">Sign In</a>
    </div>
  </div>

  <script>
    async function submitForgot() {
      const email = document.getElementById('email').value.trim();
      const btn = document.getElementById('submitBtn');
      const alertBox = document.getElementById('alertBox');

      btn.disabled = true;
      btn.innerHTML = 'Sending Code...';
      alertBox.style.display = 'none';

      try {
        const res = await fetch('/api/v1/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const json = await res.json();
        
        if (json.success) {
          alertBox.className = 'alert-box alert-success';
          alertBox.innerHTML = '<strong>Code Sent!</strong> If an account exists for ' + email + ', a 6-digit reset code has been dispatched.<br><br><a href="/reset-password?email=' + encodeURIComponent(email) + '" style="color:#15803d;font-weight:700;text-decoration:underline;">Click here to enter your 6-digit code</a>';
          alertBox.style.display = 'block';
          document.getElementById('forgotForm').reset();
        } else {
          alertBox.className = 'alert-box alert-error';
          alertBox.textContent = json.error?.message || 'Failed to send reset code';
          alertBox.style.display = 'block';
        }
      } catch (err) {
        alertBox.className = 'alert-box alert-error';
        alertBox.textContent = 'Network error. Please try again.';
        alertBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send Reset Code ➔';
      }
    }
  </script>
</body>
</html>`;
}

function renderResetPasswordHtml({ token = '', email: _email = '', code = '' } = {}) {
  const prefillCode = code || token || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - EthioFarm Smart Farming</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #10b981;
      --primary-dark: #059669;
      --primary-light: #ecfdf5;
      --secondary: #3b82f6;
      --danger: #ef4444;
      --warning: #f59e0b;
      --dark: #0f172a;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --radius: 10px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #f1f5f9 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      color: var(--text);
    }
    .card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      width: 100%;
      max-width: 460px;
      padding: 2.25rem 2rem;
    }
    .brand-header {
      text-align: center;
      margin-bottom: 1.75rem;
    }
    .brand-icon {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #10b981, #059669);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem auto;
      font-size: 1.75rem;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    }
    h1 { font-size: 1.45rem; font-weight: 800; color: var(--dark); margin-bottom: 0.35rem; }
    .subtitle { font-size: 0.875rem; color: var(--text-muted); }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.8rem; font-weight: 700; color: #334155; margin-bottom: 0.35rem; }
    .input-wrapper { position: relative; }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.925rem;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .toggle-pwd {
      position: absolute;
      right: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: #94a3b8;
      font-size: 0.9rem;
      user-select: none;
    }
    .strength-meter {
      height: 4px;
      width: 100%;
      background: #e2e8f0;
      border-radius: 2px;
      margin-top: 0.5rem;
      overflow: hidden;
    }
    .strength-bar {
      height: 100%;
      width: 0%;
      transition: all 0.3s ease;
      border-radius: 2px;
    }
    .strength-label {
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.35rem;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }
    .checklist {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.35rem;
    }
    .check-item { display: flex; align-items: center; gap: 0.35rem; }
    .check-item.valid { color: var(--primary-dark); font-weight: 600; }
    .btn {
      width: 100%;
      padding: 0.85rem 1.5rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .btn:hover { background: var(--primary-dark); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .alert-box {
      padding: 0.85rem 1rem;
      border-radius: var(--radius);
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
      display: none;
    }
    .alert-success { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; text-align: center; }
    .alert-error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .success-view { display: none; text-align: center; }
    .success-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #dcfce7;
      color: #15803d;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      margin: 0 auto 1rem auto;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-header">
      <div class="brand-icon">🔒</div>
      <h1>Set New Password</h1>
      <p class="subtitle">Enter your 6-digit reset code and choose a new secure password.</p>
    </div>

    <div id="alertBox" class="alert-box"></div>

    <div id="successView" class="success-view">
      <div class="success-icon">✓</div>
      <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem;">Password Reset Complete!</h2>
      <p style="font-size:0.9rem;color:#64748b;margin-bottom:1.5rem;">Your account password has been updated securely. You can now sign in with your new credentials.</p>
      <a href="/login" class="btn" style="text-decoration:none;">Proceed to Login ➔</a>
    </div>

    <form id="resetForm" onsubmit="event.preventDefault(); submitReset();">
      <div class="form-group">
        <label for="code">6-Digit Reset Code / Token *</label>
        <input type="text" id="code" value="${prefillCode}" placeholder="e.g. 749201" required autocomplete="one-time-code">
      </div>

      <div class="form-group">
        <label for="newPassword">New Password *</label>
        <div class="input-wrapper">
          <input type="password" id="newPassword" placeholder="Minimum 8 characters" required autocomplete="new-password" oninput="checkStrength()">
          <button type="button" class="toggle-pwd" onclick="togglePassword('newPassword', this)">👁️</button>
        </div>
        <div class="strength-meter">
          <div class="strength-bar" id="strengthBar"></div>
        </div>
        <div class="strength-label">
          <span>Password Strength:</span>
          <span id="strengthText" style="font-weight:700;">Too Weak</span>
        </div>
        <div class="checklist">
          <div class="check-item" id="checkLength"><span>○</span> Min 8 characters</div>
          <div class="check-item" id="checkNumber"><span>○</span> Has number (0-9)</div>
          <div class="check-item" id="checkUpper"><span>○</span> Uppercase letter</div>
          <div class="check-item" id="checkSymbol"><span>○</span> Special symbol</div>
        </div>
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm New Password *</label>
        <div class="input-wrapper">
          <input type="password" id="confirmPassword" placeholder="Re-enter password" required autocomplete="new-password" oninput="checkMatch()">
          <button type="button" class="toggle-pwd" onclick="togglePassword('confirmPassword', this)">👁️</button>
        </div>
        <div id="matchText" style="font-size:0.75rem;margin-top:0.35rem;font-weight:600;"></div>
      </div>

      <button type="submit" id="submitBtn" class="btn">Update Password ➔</button>
    </form>
  </div>

  <script>
    function togglePassword(inputId, btn) {
      const input = document.getElementById(inputId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    }

    function checkStrength() {
      const val = document.getElementById('newPassword').value;
      const bar = document.getElementById('strengthBar');
      const text = document.getElementById('strengthText');

      const hasLength = val.length >= 8;
      const hasNumber = /[0-9]/.test(val);
      const hasUpper = /[A-Z]/.test(val);
      const hasSymbol = /[^A-Za-z0-9]/.test(val);

      updateCheck('checkLength', hasLength);
      updateCheck('checkNumber', hasNumber);
      updateCheck('checkUpper', hasUpper);
      updateCheck('checkSymbol', hasSymbol);

      let score = 0;
      if (hasLength) score += 25;
      if (hasNumber) score += 25;
      if (hasUpper) score += 25;
      if (hasSymbol) score += 25;

      bar.style.width = score + '%';
      if (score <= 25) {
        bar.style.background = '#ef4444';
        text.textContent = 'Weak';
        text.style.color = '#ef4444';
      } else if (score <= 50) {
        bar.style.background = '#f59e0b';
        text.textContent = 'Fair';
        text.style.color = '#f59e0b';
      } else if (score <= 75) {
        bar.style.background = '#3b82f6';
        text.textContent = 'Good';
        text.style.color = '#3b82f6';
      } else {
        bar.style.background = '#10b981';
        text.textContent = 'Strong';
        text.style.color = '#10b981';
      }
      checkMatch();
    }

    function updateCheck(elementId, isValid) {
      const el = document.getElementById(elementId);
      if (isValid) {
        el.className = 'check-item valid';
        el.querySelector('span').textContent = '✓';
      } else {
        el.className = 'check-item';
        el.querySelector('span').textContent = '○';
      }
    }

    function checkMatch() {
      const pwd = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmPassword').value;
      const matchText = document.getElementById('matchText');

      if (!confirm) {
        matchText.textContent = '';
        return;
      }
      if (pwd === confirm) {
        matchText.textContent = '✓ Passwords match';
        matchText.style.color = '#10b981';
      } else {
        matchText.textContent = '✗ Passwords do not match';
        matchText.style.color = '#ef4444';
      }
    }

    async function submitReset() {
      const code = document.getElementById('code').value.trim();
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const btn = document.getElementById('submitBtn');
      const alertBox = document.getElementById('alertBox');

      if (newPassword !== confirmPassword) {
        alertBox.className = 'alert-box alert-error';
        alertBox.textContent = 'Passwords do not match';
        alertBox.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = 'Updating Password...';
      alertBox.style.display = 'none';

      try {
        const res = await fetch('/api/v1/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: code, code, newPassword })
        });
        const json = await res.json();

        if (json.success) {
          document.getElementById('resetForm').style.display = 'none';
          document.getElementById('successView').style.display = 'block';
        } else {
          alertBox.className = 'alert-box alert-error';
          alertBox.textContent = json.error?.message || json.message || 'Invalid or expired code';
          alertBox.style.display = 'block';
        }
      } catch (err) {
        alertBox.className = 'alert-box alert-error';
        alertBox.textContent = 'Network error. Please try again.';
        alertBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Update Password ➔';
      }
    }
  </script>
</body>
</html>`;
}

function renderVerificationHtml({ success, title, message }) {
  const icon = success
    ? `<div style="width: 72px; height: 72px; border-radius: 50%; background-color: #dcfce7; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>`
    : `<div style="width: 72px; height: 72px; border-radius: 50%; background-color: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - EthioFarm</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #f1f5f9 100%);
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1e293b;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 460px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      border: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      background-color: #ecfdf5;
      color: #059669;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #0f172a;
    }
    p {
      font-size: 15px;
      line-height: 1.5;
      color: #475569;
      margin: 0 0 28px 0;
    }
    .btn {
      display: inline-block;
      width: 100%;
      box-sizing: border-box;
      background-color: #10b981;
      color: #ffffff;
      font-weight: 600;
      font-size: 15px;
      padding: 13px 24px;
      border-radius: 8px;
      text-decoration: none;
      transition: background-color 0.2s ease;
    }
    .btn:hover {
      background-color: #059669;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #94a3af;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">EthioFarm Smart Farming</div>
    ${icon}
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${process.env.FRONTEND_URL || process.env.APP_URL || '/'}" class="btn">${success ? 'Open EthioFarm Platform' : 'Return to Home'}</a>
    <div class="footer">
      EthioFarm Smart Farming Platform for Ethiopia &bull; Addis Ababa
    </div>
  </div>
</body>
</html>`;
}

// Render Reset Password UI
function renderResetPasswordPage(req, res) {
  const token = req.query.token || req.query.code || '';
  const email = req.query.email || '';
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(renderResetPasswordHtml({ token, email, code: token }));
}

// Render Forgot Password UI
function renderForgotPasswordPage(_req, res) {
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(renderForgotPasswordHtml());
}

// Verify email address (supports both Browser Link clicks and API JSON calls)
async function verifyEmail(req, res, next) {
  const isBrowserGet = req.method === 'GET' && req.accepts(['html', 'json']) === 'html';
  try {
    const token = req.body?.token || req.query?.token;
    const result = await authService.verifyEmail(token);

    if (isBrowserGet) {
      return res.status(200).send(renderVerificationHtml({
        success: true,
        title: 'Email Verified Successfully!',
        message: result.message || 'Your email address has been verified. You can now access all EthioFarm features.',
      }));
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (isBrowserGet) {
      return res.status(error.statusCode || 400).send(renderVerificationHtml({
        success: false,
        title: 'Verification Link Expired or Invalid',
        message: error.message || 'This verification link is invalid or has expired. Please request a new one.',
      }));
    }
    next(error);
  }
}

// Resend email verification link
async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    const result = await authService.resendVerificationEmail(email);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Setup MFA - generate TOTP secret and backup recovery codes
async function setupMfa(req, res, next) {
  try {
    const identifier = req.user?.email || req.user?.phoneNumber || req.user?.id;
    const result = await mfaService.generateTOTPSecret(req.user.id, identifier);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Verify MFA setup token and activate MFA
async function verifyMfa(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Token is required' } });
    }
    const result = await mfaService.enableMFA(req.user.id, token);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: result.message } });
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Disable MFA for current user with password confirmation
async function disableMfa(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password is required to disable MFA' } });
    }

    const { prisma } = require('../../config/db');
    const bcrypt = require('bcryptjs');
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User verification failed' } });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash).catch(() => false);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password' } });
    }

    const result = await mfaService.disableMFA(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// List all active sessions for current user
async function listSessions(req, res, next) {
  try {
    const sessions = await sessionService.getUserSessions(req.user.id);
    res.status(200).json({ success: true, data: { sessions, count: sessions.length } });
  } catch (error) {
    next(error);
  }
}

// Terminate specific remote session
async function terminateSession(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sessionService.terminateSession(req.user.id, id);
    res.status(200).json({ success: true, data: result, message: 'Session terminated successfully' });
  } catch (error) {
    next(error);
  }
}

// Terminate all other sessions except current
async function terminateOtherSessions(req, res, next) {
  try {
    const currentSessionId = req.body?.currentSessionId || req.headers['x-session-id'];
    const result = await sessionService.terminateOtherSessions(req.user.id, currentSessionId);
    res.status(200).json({ success: true, data: result, message: 'Other sessions terminated successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  updateDeviceToken,
  updatePassword,
  forgotPassword,
  resetPassword,
  renderResetPasswordPage,
  renderForgotPasswordPage,
  verifyEmail,
  resendVerification,
  requestLoginOtp,
  verifyLoginOtp,
  verifyPhoneOtp,
  resendPhoneOtp,
  setupMfa,
  verifyMfa,
  disableMfa,
  listSessions,
  terminateSession,
  terminateOtherSessions,
};
