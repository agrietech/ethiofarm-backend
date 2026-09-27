const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter, userAuthLimiter } = require('../../middleware/rate-limiter.middleware');

// Role request routes
const roleRequestRoutes = require('../roleRequest/roleRequest.routes');

// Public authentication routes
router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, userAuthLimiter, controller.login);
router.post('/request-login-otp', authLimiter, controller.requestLoginOtp);
router.post('/verify-login-otp', authLimiter, userAuthLimiter, controller.verifyLoginOtp);
router.post('/refresh-token', authLimiter, controller.refreshToken);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.get('/forgot-password', controller.renderForgotPasswordPage);
router.post('/reset-password', authLimiter, controller.resetPassword);
router.get('/reset-password', controller.renderResetPasswordPage);
router.post('/verify-email', controller.verifyEmail);
router.get('/verify-email', controller.verifyEmail);
router.post('/resend-verification', authLimiter, controller.resendVerification);
router.post('/verify-phone-otp', authLimiter, userAuthLimiter, controller.verifyPhoneOtp);
router.post('/resend-phone-otp', authLimiter, controller.resendPhoneOtp);

// Protected routes (require valid JWT bearer token)
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.getProfile);
router.get('/profile', authenticate, controller.getProfile);
router.put('/me', authenticate, controller.updateProfile);
router.put('/profile', authenticate, controller.updateProfile);
router.patch('/me', authenticate, controller.updateProfile);
router.patch('/profile', authenticate, controller.updateProfile);
router.post('/device-token', authenticate, controller.updateDeviceToken);
router.patch('/update-password', authenticate, controller.updatePassword);

// MFA routes
router.post('/mfa/setup', authenticate, controller.setupMfa);
router.post('/mfa/verify', authenticate, controller.verifyMfa);
router.post('/mfa/disable', authenticate, controller.disableMfa);

// Active session tracking & remote revocation
router.get('/sessions', authenticate, controller.listSessions);
router.delete('/sessions/:id', authenticate, controller.terminateSession);
router.post('/sessions/terminate-others', authenticate, controller.terminateOtherSessions);

// Role upgrade application routes
router.use('/role-requests', roleRequestRoutes);

module.exports = router;
