const adminService = require('./admin.service');
const servicesRegistryService = require('./servicesRegistry.service');
const { assertResourceInScope } = require('../../middleware/scope-filter.utils');

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
    const env = require('../../config/env');

    const dashboardPath = path.join(__dirname, 'templates', 'dashboard.html');

    fs.readFile(dashboardPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Error loading dashboard:', err);
            return res.status(500).send('Dashboard template not found');
        }

        const sanitizedHtml = html.replace('{{GOOGLE_MAPS_API_KEY}}', env.GOOGLE_MAPS_API_KEY || '');

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(sanitizedHtml);
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

        const { email, password, consoleKey, masterKey } = req.body || {};
        const validKeys = env.getAdminKeys ? env.getAdminKeys() : [];
        const trimmedEmail = (email || '').trim().toLowerCase();
        const rawPassword = (password || '').trim();
        const directCandidate = (consoleKey || masterKey || (!email && password ? password : '')).toString().trim();

        const isMasterKeyDirect = directCandidate && validKeys.includes(directCandidate);
        const isPasswordMasterKey = rawPassword && validKeys.includes(rawPassword);

        // 1. Render Environment Master Key Authentication
        if (isMasterKeyDirect || (trimmedEmail && isPasswordMasterKey)) {
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
                    where: { role: 'ADMIN' },
                });
            }

            if (!targetUser) {
                const defaultEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@ethiofarm.et').toLowerCase();
                const keyToHash = rawPassword || directCandidate || 'Admin123!';
                const hash = await bcrypt.hash(keyToHash, 10);
                targetUser = await prisma.user.create({
                    data: {
                        email: defaultEmail,
                        fullName: 'National Super Administrator',
                        role: 'ADMIN',
                        passwordHash: hash,
                        isEmailVerified: true,
                        preferredLang: 'en',
                    },
                });
            }

            // Sync user password hash in DB if password provided
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
                id: targetUser.id,
                email: targetUser.email,
                role: 'ADMIN',
                fullName: targetUser.fullName,
                woredaId: targetUser.woredaId || null,
            };

            const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const isProd = process.env.NODE_ENV === 'production';
            const secureFlag = isProd ? '; Secure' : '';
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
            logger.info(`[ADMIN_SECURITY] Successful login via Render Master Key by ${tokenPayload.email}`);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(200).json({
                    success: true,
                    redirect: `/admin/dashboard?token=${encodeURIComponent(token)}`,
                    token,
                    user: tokenPayload,
                });
            }
            return res.redirect(`/admin/dashboard?token=${encodeURIComponent(token)}`);
        }

        if (!trimmedEmail || !rawPassword) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'Administrator credentials or Master Security Key required' });
            }
            return res.redirect('/admin/login?error=Credentials%20required');
        }

        // 2. Strict Database Email/Phone and Password Authentication
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: { equals: trimmedEmail, mode: 'insensitive' } },
                    { phoneNumber: email.trim() },
                ],
            },
        });

        if (!user) {
            logger.warn(`[ADMIN_SECURITY] Admin login failed: User '${trimmedEmail}' not found in database`);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
            }
            return res.redirect('/admin/login?error=Invalid%20credentials');
        }

        const isPasswordValid = await bcrypt.compare(rawPassword, user.passwordHash || '').catch(() => false);
        if (!isPasswordValid) {
            logger.warn(`[ADMIN_SECURITY] Admin login failed: Invalid password for '${trimmedEmail}'`);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
            }
            return res.redirect('/admin/login?error=Invalid%20credentials');
        }

        // Strict National Super Administrator privilege check
        if (user.role !== 'ADMIN') {
            logger.warn(`[ADMIN_SECURITY] Unauthorized admin portal login attempt by non-admin user ${user.id} (${user.role})`);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ success: false, message: 'Access denied: National Super Administrator privileges required' });
            }
            return res.redirect('/admin/login?error=Access%20denied:%20National%20Super%20Administrator%20privileges%20required');
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
        logger.info(`[ADMIN_SECURITY] Successful National Super Admin login by ${user.email} (${user.id})`);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(200).json({
                success: true,
                redirect: `/admin/dashboard?token=${encodeURIComponent(token)}`,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName,
                    woredaId: user.woredaId,
                },
            });
        }
        return res.redirect(`/admin/dashboard?token=${encodeURIComponent(token)}`);
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
        const validKeys = env.getAdminKeys ? env.getAdminKeys() : [];
        const trimmedKey = (masterKey || '').trim();
        const trimmedNewPassword = (newPassword || '').trim();
        const defaultAdminEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@ethiofarm.et').toLowerCase();
        const targetEmail = (email || defaultAdminEmail).trim().toLowerCase();

        const isJson = req.xhr || req.headers.accept?.includes('application/json');

        if (!trimmedNewPassword || trimmedNewPassword.length < 6) {
            if (isJson) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
            return res.redirect('/admin/login?error=Password%20must%20be%20at%20least%206%20characters');
        }

        if (!trimmedKey || !validKeys.includes(trimmedKey)) {
            if (isJson) return res.status(403).json({ success: false, message: 'Invalid Master Security Key from Render environment' });
            return res.redirect('/admin/login?error=Invalid%20Master%20Security%20Key');
        }

        const newHash = await bcrypt.hash(trimmedNewPassword, 10);
        let user = await prisma.user.findFirst({
            where: { email: { equals: targetEmail, mode: 'insensitive' } },
        });

        if (user) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { role: 'ADMIN', passwordHash: newHash, isEmailVerified: true },
            });
        } else {
            user = await prisma.user.create({
                data: {
                    email: targetEmail,
                    fullName: 'National Super Administrator',
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
        logger.info(`[ADMIN_SECURITY] Password updated via Render Master Key for ${user.email}`);

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
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Internal error updating password' });
        }
        return res.redirect('/admin/login?error=Internal%20error');
    }
}

async function getServicesRegistry(req, res, next) {
    try {
        const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
        const data = await servicesRegistryService.getServicesRegistry(forceRefresh);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function pingService(req, res, next) {
    try {
        const serviceId = req.body?.serviceId || req.query?.serviceId;
        if (!serviceId) {
            const data = await servicesRegistryService.getServicesRegistry(true);
            return res.status(200).json({ success: true, message: 'All services pinged successfully', data: data.services });
        }
        const data = await servicesRegistryService.pingService(serviceId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function executeServiceAction(req, res, next) {
    try {
        const { action, serviceId, payload } = req.body || {};
        const adminContext = { id: req.user?.id, email: req.user?.email, ip: req.ip };
        let result;

        switch (action) {
            case 'purgeCache':
                result = await servicesRegistryService.purgeCache();
                await adminService.logAuditAction({
                    action: 'SERVICES_CACHE_PURGED',
                    adminId: adminContext.id,
                    adminEmail: adminContext.email,
                    details: 'Purged Redis query caches and rate limiters',
                    ipAddress: adminContext.ip,
                });
                break;
            case 'clearRateLimits':
                result = await servicesRegistryService.clearRateLimits();
                break;
            case 'sendTestNotification':
                result = await servicesRegistryService.sendTestNotification(payload?.channel, payload?.recipient);
                await adminService.logAuditAction({
                    action: 'SERVICES_TEST_NOTIFICATION_SENT',
                    adminId: adminContext.id,
                    adminEmail: adminContext.email,
                    details: `Dispatched test ${payload?.channel || 'SMS'} to ${payload?.recipient || 'default'}`,
                    ipAddress: adminContext.ip,
                });
                break;
            case 'triggerIngestion':
                result = await adminService.triggerIngestion(payload?.jobType || 'pullWeatherForecast', payload || {}, adminContext);
                break;
            case 'ping':
                result = await servicesRegistryService.pingService(serviceId);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: { message: `Unknown action '${action}'. Valid: purgeCache, clearRateLimits, sendTestNotification, triggerIngestion, ping` }
                });
        }

        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
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
    getServicesRegistry,
    pingService,
    executeServiceAction,
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
