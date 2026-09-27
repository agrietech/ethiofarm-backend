const { prisma } = require('../config/db');
const redis = require('../config/redis');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Permission-Based Access Control (PBAC) Middleware
 * Provides fine-grained permission checking beyond role-based access
 */
class RBACMiddleware {
  /**
   * Require specific permission(s) to access endpoint
   * Usage: requirePermission('farms.create', 'farms.update')
   */
  static requirePermission(...permissionCodes) {
    return async (req, res, next) => {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const userId = req.user.id;
      const role = req.user.role;

      try {
        // Get user permissions (with caching)
        const userPermissions = await this.getUserPermissions(userId, role);

        // Check if user has any of the required permissions
        const hasPermission = permissionCodes.some(code =>
          userPermissions.includes(code)
        );

        if (!hasPermission) {
          logger.warn(`[RBAC] Permission denied for user ${userId}: Required ${permissionCodes.join(' OR ')}, Has ${userPermissions.join(', ')}`);
          return next(new ForbiddenError(
            `Insufficient permissions. Required: ${permissionCodes.join(' or ')}`,
            'INSUFFICIENT_PERMISSIONS',
            { required: permissionCodes, userPermissions }
          ));
        }

        // Attach permissions to request for later use
        req.userPermissions = userPermissions;
        next();
      } catch (error) {
        logger.error(`[RBAC] Permission check failed: ${error.message}`);
        next(error);
      }
    };
  }

  /**
   * Check if user has permission (helper function)
   */
  static async hasPermission(userId, role, permissionCode) {
    const userPermissions = await this.getUserPermissions(userId, role);
    return userPermissions.includes(permissionCode);
  }

  /**
   * Get all permissions for a user (role + user-specific)
   */
  static async getUserPermissions(userId, role) {
    // Check cache first
    const cacheKey = `permissions:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Get role-based permissions
    const rolePerms = await prisma.rolePermission.findMany({
      where: { role, granted: true },
      include: { permission: true }
    });

    // Get user-specific permission grants/revocations
    const userPerms = await prisma.userPermission.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } }
        ]
      },
      include: { permission: true }
    });

    const permissions = new Set();

    // Add role permissions
    for (const rp of rolePerms) {
      permissions.add(rp.permission.code);
    }

    // Apply user-specific grants/revocations
    for (const up of userPerms) {
      if (up.granted) {
        permissions.add(up.permission.code);
      } else {
        permissions.delete(up.permission.code);
      }
    }

    const permArray = Array.from(permissions);

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(permArray));

    return permArray;
  }

  /**
   * Require resource-level access (for specific farms, sensors, etc.)
   * Usage: requireResourceAccess('Farm', 'READ')
   */
  static requireResourceAccess(resourceType, accessLevel = 'READ') {
    return async (req, res, next) => {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const userId = req.user.id;
      const resourceId = req.params.id || req.body.id || req.query.id;

      if (!resourceId) {
        return next(new ForbiddenError('Resource ID required for access check'));
      }

      try {
        const hasAccess = await this.checkResourceAccess(
          userId,
          req.user,
          resourceType,
          resourceId,
          accessLevel
        );

        if (!hasAccess) {
          logger.warn(`[RBAC] Resource access denied: User ${userId} -> ${resourceType}/${resourceId} (${accessLevel})`);
          return next(new ForbiddenError(
            `You do not have ${accessLevel} access to this ${resourceType}`,
            'RESOURCE_ACCESS_DENIED'
          ));
        }

        next();
      } catch (error) {
        logger.error(`[RBAC] Resource access check failed: ${error.message}`);
        next(error);
      }
    };
  }

  /**
   * Check resource access
   */
  static async checkResourceAccess(userId, user, resourceType, resourceId, requiredLevel) {
    // Admin and Researcher have global access
    if (['ADMIN', 'RESEARCHER'].includes(user.role)) {
      return true;
    }

    // Check direct resource access grant
    const access = await prisma.resourceAccess.findUnique({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType,
          resourceId
        }
      }
    });

    if (access) {
      // Check expiration
      if (access.expiresAt && access.expiresAt < new Date()) {
        return false;
      }

      // Check access level hierarchy: ADMIN > WRITE > READ
      const levels = { READ: 1, WRITE: 2, ADMIN: 3 };
      return levels[access.accessLevel] >= levels[requiredLevel];
    }

    // Check ownership
    const isOwner = await this.checkOwnership(userId, resourceType, resourceId);
    if (isOwner) return true;

    // Check jurisdictional access
    return await this.checkJurisdictionalAccess(userId, user, resourceType, resourceId);
  }

  /**
   * Check ownership of a resource
   */
  static async checkOwnership(userId, resourceType, resourceId) {
    const modelName = resourceType.toLowerCase();

    try {
      const resource = await prisma[modelName].findUnique({
        where: { id: resourceId },
        select: { userId: true }
      });

      return resource?.userId === userId;
    } catch (e) {
      // Model might not have userId field
      return false;
    }
  }

  /**
   * Check jurisdictional access based on woreda/zone/region
   */
  static async checkJurisdictionalAccess(userId, user, resourceType, resourceId) {
    const role = user.role;

    // Farmers only access their own resources
    if (role === 'FARMER') {
      return false;
    }

    try {
      const modelName = resourceType.toLowerCase();
      const resource = await prisma[modelName].findUnique({
        where: { id: resourceId },
        select: {
          woredaId: true,
          woreda: {
            select: {
              zoneId: true,
              zone: {
                select: { regionId: true }
              }
            }
          }
        }
      });

      if (!resource) return false;

      // Development Agent & Woreda Officer: same woreda
      if (['DEVELOPMENT_AGENT', 'WOREDA_OFFICER'].includes(role)) {
        return resource.woredaId === user.woredaId;
      }

      // Zonal Officer: same zone
      if (role === 'ZONAL_OFFICER') {
        return resource.woreda?.zoneId === user.zoneId;
      }

      // Regional Officer: same region
      if (role === 'REGIONAL_OFFICER') {
        return resource.woreda?.zone?.regionId === user.regionId;
      }

      return false;
    } catch (e) {
      logger.error(`[RBAC] Jurisdictional check failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Grant resource access to a user
   */
  static async grantAccess(params) {
    const { userId, resourceType, resourceId, accessLevel, grantedById, expiresAt, reason } = params;

    await prisma.resourceAccess.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType,
          resourceId
        }
      },
      create: {
        userId,
        resourceType,
        resourceId,
        accessLevel,
        grantedById,
        expiresAt
      },
      update: {
        accessLevel,
        expiresAt
      }
    });

    // Log the grant
    await prisma.auditLog.create({
      data: {
        action: 'RESOURCE_ACCESS_GRANTED',
        adminId: grantedById,
        details: JSON.stringify({
          userId,
          resourceType,
          resourceId,
          accessLevel,
          reason,
          expiresAt
        })
      }
    });

    // Clear permission cache
    await redis.del(`permissions:${userId}`);

    logger.info(`[RBAC] Access granted: User ${userId} -> ${resourceType}/${resourceId} (${accessLevel})`);
  }

  /**
   * Revoke resource access
   */
  static async revokeAccess(userId, resourceType, resourceId, revokedById) {
    await prisma.resourceAccess.delete({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType,
          resourceId
        }
      }
    });

    // Log the revocation
    await prisma.auditLog.create({
      data: {
        action: 'RESOURCE_ACCESS_REVOKED',
        adminId: revokedById,
        details: JSON.stringify({ userId, resourceType, resourceId })
      }
    });

    // Clear permission cache
    await redis.del(`permissions:${userId}`);

    logger.info(`[RBAC] Access revoked: User ${userId} -> ${resourceType}/${resourceId}`);
  }

  /**
   * Grant a permission to a user
   */
  static async grantPermission(userId, permissionCode, grantedById, expiresAt = null, reason = null) {
    // Find permission
    const permission = await prisma.permission.findUnique({
      where: { code: permissionCode }
    });

    if (!permission) {
      throw new Error(`Permission ${permissionCode} not found`);
    }

    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id
        }
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: true,
        grantedById,
        expiresAt,
        reason
      },
      update: {
        granted: true,
        expiresAt,
        reason
      }
    });

    // Clear cache
    await redis.del(`permissions:${userId}`);

    logger.info(`[RBAC] Permission granted: ${permissionCode} to user ${userId}`);
  }

  /**
   * Revoke a permission from a user
   */
  static async revokePermission(userId, permissionCode, revokedById) {
    const permission = await prisma.permission.findUnique({
      where: { code: permissionCode }
    });

    if (!permission) {
      throw new Error(`Permission ${permissionCode} not found`);
    }

    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id
        }
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: false,
        grantedById: revokedById
      },
      update: {
        granted: false
      }
    });

    // Clear cache
    await redis.del(`permissions:${userId}`);

    logger.info(`[RBAC] Permission revoked: ${permissionCode} from user ${userId}`);
  }

  /**
   * Clear permission cache for a user
   */
  static async clearPermissionCache(userId) {
    await redis.del(`permissions:${userId}`);
  }

  /**
   * Get user's current permissions (for display)
   */
  static async getUserPermissionsList(userId, role) {
    const permissions = await this.getUserPermissions(userId, role);

    // Get full permission details
    const fullPermissions = await prisma.permission.findMany({
      where: { code: { in: permissions } }
    });

    return fullPermissions.map(p => ({
      code: p.code,
      name: p.name,
      description: p.description,
      resource: p.resource,
      action: p.action,
      scope: p.scope
    }));
  }
}

module.exports = RBACMiddleware;
