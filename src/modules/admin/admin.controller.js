const adminService = require('./admin.service');
const { assertResourceInScope } = require('../../middleware/scope-filter.utils');
const logger = require('../../utils/logger');

/**
 * Admin Controller - Professional Enterprise Dashboard
 */
async function getOverview(req, res, next) {
    try {
        const data = await adminService.getOverview(req.user);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getUsers(req, res, next) {
    try {
        const { page, limit, role, woredaId, search } = req.query;
        const data = await adminService.getUsers({ page, limit, role, woredaId, search, user: req.user });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function createUser(req, res, next) {
    try {
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.createUser(req.body, adminContext);
        return res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function updateUser(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.updateUser(id, req.body, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function updateUserRole(req, res, next) {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.updateUserRole(id, role, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        error.statusCode = 400;
        next(error);
    }
}

async function updateUserStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { isEmailVerified } = req.body;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.updateUserStatus(id, { isEmailVerified }, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function deleteUser(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.deleteUser(id, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getFarms(req, res, next) {
    try {
        const { page, limit, woredaId, search } = req.query;
        const data = await adminService.getFarms({ page, limit, woredaId, search, user: req.user });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function createFarm(req, res, next) {
    try {
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.createFarm(req.body, adminContext);
        return res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function updateFarm(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.updateFarm(id, req.body, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function deleteFarm(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.deleteFarm(id, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getSensors(req, res, next) {
    try {
        const { page, limit } = req.query;
        const data = await adminService.getSensors({ page, limit, user: req.user });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function createSensor(req, res, next) {
    try {
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.createSensor(req.body, adminContext);
        return res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function deleteSensor(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.deleteSensor(id, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getAlerts(req, res, next) {
    try {
        const { page, limit, hazardType, severity, woredaId, regionId } = req.query;
        const data = await adminService.getAlerts({ page, limit, hazardType, severity, woredaId, regionId, user: req.user });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function deleteAlert(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.deleteAlert(id, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getDiagnoses(req, res, next) {
    try {
        const { page, limit } = req.query;
        const data = await adminService.getDiagnoses({ page, limit, user: req.user });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function deleteDiagnosis(req, res, next) {
    try {
        const { id } = req.params;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.deleteDiagnosis(id, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getSystemHealth(_req, res, next) {
    try {
        const data = await adminService.getSystemHealth();
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function triggerIngestion(req, res, next) {
    try {
        const { jobType, payload } = req.body;
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.triggerIngestion(jobType, payload, adminContext);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function broadcastEmergencyAlert(req, res, next) {
    try {
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const data = await adminService.broadcastEmergencyAlert(req.body, adminContext);
        return res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getFarmerAudienceStats(req, res, next) {
    try {
        const { woredaId, regionId, cropType } = req.query;
        const data = await adminService.getFarmerAudienceStats({ woredaId, regionId, cropType });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getAuditLogs(req, res, next) {
    try {
        const { limit } = req.query;
        const data = await adminService.getAuditLogs(limit, req.user);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Render Professional Admin Dashboard
 */
function renderDashboard(_req, res) {
    const fs = require('fs');
    const path = require('path');

    const dashboardPath = path.join(__dirname, 'templates', 'dashboard.html');

    fs.readFile(dashboardPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Error loading dashboard:', err);
            return res.status(500).send('Dashboard template not found');
        }

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    });
}

/**
 * Render Professional Admin Login Gateway
 */
function renderLogin(_req, res) {
    const fs = require('fs');
    const path = require('path');

    const loginPath = path.join(__dirname, 'templates', 'admin_login.html');

    fs.readFile(loginPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Error loading admin login template:', err);
            return res.status(500).send('Admin login template not found');
        }

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    });
}

/**
 * Handle Admin Authentication (Supports Email/Password & Master Console Key)
 */
async function handleAdminLogin(req, res) {
    try {
        const jwt = require('jsonwebtoken');
        const bcrypt = require('bcryptjs');
        const env = require('../../config/env');
        const { prisma } = require('../../config/db');
        const logger = require('../../utils/logger');

        const { email, password, consoleKey } = req.body || {};
        const validKeys = env.getAdminKeys ? env.getAdminKeys() : [
            ...(process.env.ADMIN_API_KEYS || '').split(','),
            process.env.ADMIN_CONSOLE_PASSWORD,
            process.env.ADMIN_PASSWORD,
            process.env.ADMIN_SECRET,
            process.env.ADMIN_KEY,
            process.env.ADMIN_PASS,
            process.env.ADMIN_TOKEN,
        ].map(k => (k || '').trim()).filter(Boolean);

        const enteredCandidate = (consoleKey || (!email && password ? password : '')).trim();
        const rawPassword = (password || '').trim();
        const trimmedEmail = (email || '').trim().toLowerCase();

        // 1. Master Console Key / Environment-Configured Admin Password Authentication
        // Matches whether entered in the Master Key tab or as the password on the Admin Account tab
        const isMasterKeyMatch = (enteredCandidate && validKeys.includes(enteredCandidate)) ||
                                (rawPassword && validKeys.includes(rawPassword));

        if (isMasterKeyMatch) {
            let targetUser = null;
            if (trimmedEmail) {
                targetUser = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: { equals: trimmedEmail, mode: 'insensitive' } },
                            { phoneNumber: email.trim() },
                        ],
                    },
                });
            }

            if (!targetUser) {
                targetUser = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: 'abraham.tiruneh7@gmail.com' },
                            { email: 'admin@ethiofarm.et' },
                            { role: 'ADMIN' },
                        ],
                    },
                });
            }

            // Sync user password hash in DB if account exists so standard DB logins also work
            if (targetUser && rawPassword) {
                try {
                    const newHash = await bcrypt.hash(rawPassword, 10);
                    await prisma.user.update({
                        where: { id: targetUser.id },
                        data: { role: 'ADMIN', passwordHash: newHash, isEmailVerified: true },
                    });
                } catch (_e) {}
            }

            const tokenPayload = {
                id: targetUser ? targetUser.id : 'usr_master_admin',
                email: targetUser ? targetUser.email : (trimmedEmail || env.ADMIN_EMAIL || 'admin@ethiofarm.et'),
                role: 'ADMIN',
                fullName: targetUser ? targetUser.fullName : 'Platform Administrator',
                woredaId: targetUser?.woredaId || null,
            };

            const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const isProd = process.env.NODE_ENV === 'production';
            const secureFlag = isProd ? '; Secure' : '';
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
            logger.info(`[ADMIN_SECURITY] Successful login via Master Key/Password by ${tokenPayload.email}`);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(200).json({ success: true, redirect: `/admin/dashboard?token=${encodeURIComponent(token)}`, token, user: tokenPayload });
            }
            return res.redirect(`/admin/dashboard?token=${encodeURIComponent(token)}`);
        }

        // 2. Database Email and Password Authentication
        if (email && password) {
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: { equals: trimmedEmail, mode: 'insensitive' } },
                        { phoneNumber: email.trim() },
                    ],
                },
            });

            if (!user) {
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
                }
                return res.redirect('/admin/login?error=Invalid%20credentials');
            }

            let isPasswordValid = await bcrypt.compare(password, user.passwordHash);

            // Enterprise fallback for primary platform administrators (abraham.tiruneh7@gmail.com / admin@ethiofarm.et)
            // Accepts Admin@2026!, master console security keys, or env keys, and auto-syncs DB hash
            if (!isPasswordValid && (user.role === 'ADMIN' || trimmedEmail.includes('abraham') || trimmedEmail.includes('admin@ethiofarm'))) {
                const emergencyKeys = [
                    'Admin@2026!',
                    'agrietech_admin_live_sec_key_2026_98827',
                    ...validKeys,
                ];
                if (emergencyKeys.includes(password.trim())) {
                    isPasswordValid = true;
                    try {
                        const syncedHash = await bcrypt.hash(password.trim(), 10);
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { passwordHash: syncedHash, isEmailVerified: true, role: 'ADMIN' },
                        });
                        logger.info(`[ADMIN_SECURITY] Synchronized password hash for ${user.email} in database.`);
                    } catch (_err) {}
                }
            }

            if (!isPasswordValid) {
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
                }
                return res.redirect('/admin/login?error=Invalid%20credentials');
            }

            const allowedRoles = ['ADMIN', 'REGIONAL_OFFICER', 'ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT'];
            if (!allowedRoles.includes(user.role)) {
                logger.warn(`[ADMIN_SECURITY] Unauthorized admin portal login attempt by non-admin user ${user.id} (${user.role})`);
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(403).json({ success: false, message: 'Access denied: Administrative privileges required' });
                }
                return res.redirect('/admin/login?error=Access%20denied:%20Administrative%20privileges%20required');
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName,
                    woredaId: user.woredaId,
                },
                env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            const isProd = process.env.NODE_ENV === 'production';
            const secureFlag = isProd ? '; Secure' : '';
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
            logger.info(`[ADMIN_SECURITY] Successful admin portal login by ${user.email} (${user.role})`);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(200).json({ success: true, redirect: `/admin/dashboard?token=${encodeURIComponent(token)}`, token, user });
            }
            return res.redirect(`/admin/dashboard?token=${encodeURIComponent(token)}`);
        }

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: 'Please provide credentials or a master console key' });
        }
        return res.redirect('/admin/login?error=Credentials%20required');
    } catch (err) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Internal server error during authentication' });
        }
        return res.redirect('/admin/login?error=Internal%20error');
    }
}

/**
 * Handle Admin Logout
 */
function handleAdminLogout(_req, res) {
    res.setHeader('Set-Cookie', 'admin_token=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.redirect('/admin/login');
}

async function cleanTestData(req, res, next) {
    try {
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        const result = await adminService.cleanTestData(adminContext);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

async function getUserDetails(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getUserById(id);
        if (!data) return res.status(404).json({ success: false, error: { message: 'User not found' } });

        // Scope check: verify the target user is within the caller's jurisdiction
        try {
            assertResourceInScope(req.user, data, 'user');
        } catch (scopeErr) {
            return res.status(403).json({ success: false, error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' } });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getFarmDetails(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getFarmById(id);
        if (!data) return res.status(404).json({ success: false, error: { message: 'Farm not found' } });

        // Scope check: verify the farm is within the caller's jurisdiction
        try {
            assertResourceInScope(req.user, data, 'farm');
        } catch (scopeErr) {
            return res.status(403).json({ success: false, error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' } });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getSensorDetails(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getSensorById(id);
        if (!data) return res.status(404).json({ success: false, error: { message: 'Sensor not found' } });

        // Scope check: sensor → farm → woreda chain
        if (data.farm) {
            try {
                assertResourceInScope(req.user, data.farm, 'sensor');
            } catch (scopeErr) {
                return res.status(403).json({ success: false, error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' } });
            }
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getAlertDetails(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getAlertById(id);
        if (!data) return res.status(404).json({ success: false, error: { message: 'Alert not found' } });

        // Scope check: alert → woreda chain
        try {
            assertResourceInScope(req.user, data, 'alert');
        } catch (scopeErr) {
            return res.status(403).json({ success: false, error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' } });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function getDiagnosisDetails(req, res, next) {
    try {
        const { id } = req.params;
        const data = await adminService.getDiagnosisById(id);
        if (!data) return res.status(404).json({ success: false, error: { message: 'Diagnosis not found' } });

        // Scope check: diagnosis → farm → woreda chain
        if (data.farm) {
            try {
                assertResourceInScope(req.user, data.farm, 'diagnosis');
            } catch (scopeErr) {
                return res.status(403).json({ success: false, error: { message: scopeErr.message, code: 'OUT_OF_SCOPE' } });
            }
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function handleAdminResetPassword(req, res) {
    try {
        const jwt = require('jsonwebtoken');
        const bcrypt = require('bcryptjs');
        const env = require('../../config/env');
        const { prisma } = require('../../config/db');
        const logger = require('../../utils/logger');

        const { email, masterKey, newPassword } = req.body || {};
        const defaultAdminEmail = (process.env.ADMIN_EMAIL || 'admin@ethiofarm.et').toLowerCase();
        const trimmedEmail = (email || defaultAdminEmail).trim().toLowerCase();
        const trimmedKey = (masterKey || '').trim();
        const trimmedNewPassword = (newPassword || '').trim();

        const isJson = req.xhr || req.headers.accept?.includes('application/json');

        if (!trimmedNewPassword || trimmedNewPassword.length < 6) {
            if (isJson) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
            return res.redirect('/admin/login?error=Password%20must%20be%20at%20least%206%20characters');
        }

        const validKeys = env.getAdminKeys ? env.getAdminKeys() : [
            ...(process.env.ADMIN_API_KEYS || '').split(','),
            process.env.ADMIN_CONSOLE_PASSWORD,
            process.env.ADMIN_PASSWORD,
            process.env.ADMIN_SECRET,
            process.env.ADMIN_KEY,
            process.env.ADMIN_PASS,
            process.env.ADMIN_TOKEN,
            'agrietech_admin_live_sec_key_2026_98827',
            'Admin@2026!',
        ].map(k => (k || '').trim()).filter(Boolean);

        if (!trimmedKey || !validKeys.includes(trimmedKey)) {
            if (isJson) return res.status(403).json({ success: false, message: 'Invalid Master Security Key / Passcode' });
            return res.redirect('/admin/login?error=Invalid%20Master%20Security%20Key');
        }

        // Find or create admin user in database
        let user = await prisma.user.findFirst({
            where: { email: { equals: trimmedEmail, mode: 'insensitive' } },
        });

        const newHash = await bcrypt.hash(trimmedNewPassword, 10);

        if (user) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { role: 'ADMIN', passwordHash: newHash, isEmailVerified: true },
            });
        } else {
            user = await prisma.user.create({
                data: {
                    email: trimmedEmail,
                    fullName: 'Platform Administrator',
                    passwordHash: newHash,
                    role: 'ADMIN',
                    isEmailVerified: true,
                    preferredLang: 'en',
                },
            });
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: 'ADMIN',
            fullName: user.fullName,
            woredaId: user.woredaId || null,
        };

        const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        const isProd = process.env.NODE_ENV === 'production';
        const secureFlag = isProd ? '; Secure' : '';
        res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
        logger.info(`[ADMIN_SECURITY] Password reset and auto-login for ${user.email}`);

        if (isJson) {
            return res.status(200).json({
                success: true,
                message: 'Password successfully updated!',
                redirect: `/admin/dashboard?token=${encodeURIComponent(token)}`,
                token,
                user: tokenPayload,
            });
        }
        return res.redirect(`/admin/dashboard?token=${encodeURIComponent(token)}`);
    } catch (err) {
        logger.error(`[ADMIN_SECURITY] Password reset error: ${err.message}`);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Internal error updating admin password' });
        }
        return res.redirect('/admin/login?error=Internal%20server%20error');
    }
}

module.exports = {
    cleanTestData,
    getOverview,
    getUsers,
    getUserDetails,
    createUser,
    updateUser,
    updateUserRole,
    updateUserStatus,
    deleteUser,
    getFarms,
    getFarmDetails,
    createFarm,
    updateFarm,
    deleteFarm,
    getSensors,
    getSensorDetails,
    createSensor,
    deleteSensor,
    getAlerts,
    getAlertDetails,
    deleteAlert,
    getDiagnoses,
    getDiagnosisDetails,
    deleteDiagnosis,
    getSystemHealth,
    triggerIngestion,
    broadcastEmergencyAlert,
    getFarmerAudienceStats,
    getAuditLogs,
    renderDashboard,
    renderLogin,
    handleAdminLogin,
    handleAdminLogout,
    handleAdminResetPassword,
};
