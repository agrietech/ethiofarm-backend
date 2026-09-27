/**
 * Centralized Scope Filter Utility
 * Single source of truth for building Prisma `where` clauses based on
 * user role and administrative jurisdiction (Kebele → Woreda → Zone → Region → National).
 *
 * Usage:
 *   const { buildUserScope, buildFarmScope } = require('./scope-filter.utils');
 *   const where = buildFarmScope(req.user);
 *   const farms = await prisma.farm.findMany({ where });
 */
const { ForbiddenError } = require('../utils/errors');

/** Roles with national (unrestricted) access */
const NATIONAL_ROLES = ['ADMIN', 'RESEARCHER'];

/**
 * Check if user has national (unrestricted) scope
 */
function isNationalScope(user) {
  return NATIONAL_ROLES.includes(user?.role);
}

/**
 * Build scope filter for User queries
 * Returns a Prisma `where` clause that restricts users to the caller's jurisdiction
 */
function buildUserScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return { ...existingWhere };

  const role = (user.role || '').toUpperCase();
  const where = { ...existingWhere };

  if (role === 'FARMER') {
    // Farmers can only see themselves
    where.id = user.id;
  } else if (role === 'DEVELOPMENT_AGENT') {
    // DA: users within their woreda (kebele not stored on user model reliably for filtering)
    if (user.woredaId) {
      where.woredaId = user.woredaId;
    } else {
      where.id = user.id;
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.woredaId = user.woredaId;
    } else {
      where.id = user.id;
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.zoneId = user.zoneId;
    } else {
      where.id = user.id;
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.regionId = user.regionId;
    } else {
      where.id = user.id;
    }
  }

  return where;
}

/**
 * Build scope filter for Farm queries
 */
function buildFarmScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return { ...existingWhere };

  const role = (user.role || '').toUpperCase();
  const where = { ...existingWhere };

  if (role === 'FARMER') {
    where.userId = user.id;
  } else if (role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId) {
      where.kebeleId = user.kebeleId;
    } else if (user.woredaId) {
      where.woredaId = user.woredaId;
    } else {
      where.userId = user.id;
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.woredaId = user.woredaId;
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.woreda = { zoneId: user.zoneId };
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.woreda = { zone: { regionId: user.regionId } };
    }
  }

  return where;
}

/**
 * Build scope filter for Alert queries
 */
function buildAlertScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return { ...existingWhere };

  const role = (user.role || '').toUpperCase();
  const where = { ...existingWhere };

  if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.woredaId = user.woredaId;
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.woreda = { zoneId: user.zoneId };
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.woreda = { zone: { regionId: user.regionId } };
    }
  }

  return where;
}

/**
 * Build scope filter for Sensor queries
 * Sensors belong to farms, so we scope via the farm → woreda chain
 */
function buildSensorScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return { ...existingWhere };

  const role = (user.role || '').toUpperCase();
  const where = { ...existingWhere };

  if (role === 'FARMER') {
    where.farm = { userId: user.id };
  } else if (role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId) {
      where.farm = { kebeleId: user.kebeleId };
    } else if (user.woredaId) {
      where.farm = { woredaId: user.woredaId };
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.farm = { woredaId: user.woredaId };
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.farm = { woreda: { zoneId: user.zoneId } };
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.farm = { woreda: { zone: { regionId: user.regionId } } };
    }
  }

  return where;
}

/**
 * Build scope filter for DiseaseDiagnosis queries
 * Diagnoses belong to farms, so we scope via the farm → woreda chain
 */
function buildDiagnosisScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return { ...existingWhere };

  const role = (user.role || '').toUpperCase();
  const where = { ...existingWhere };

  if (role === 'FARMER') {
    where.farm = { userId: user.id };
  } else if (role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId) {
      where.farm = { kebeleId: user.kebeleId };
    } else if (user.woredaId) {
      where.farm = { woredaId: user.woredaId };
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId) {
      where.farm = { woredaId: user.woredaId };
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) {
      where.farm = { woreda: { zoneId: user.zoneId } };
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) {
      where.farm = { woreda: { zone: { regionId: user.regionId } } };
    }
  }

  return where;
}

/**
 * Build scope filter for AuditLog queries
 * Officers should only see audit events related to their jurisdiction
 */
function buildAuditLogScope(user, existingWhere = {}) {
  if (!user) throw new ForbiddenError('Authentication required');
  // Only ADMIN sees all audit logs; others get restricted view
  if (user.role === 'ADMIN') return { ...existingWhere };

  const where = { ...existingWhere };
  // Non-admin users only see their own actions
  where.adminId = user.id;
  return where;
}

/**
 * Validate that a single resource is within the user's jurisdiction.
 * Used for GET-by-ID endpoints.
 *
 * @param {object} user - The authenticated user (req.user)
 * @param {object} resource - The resource to check (must include woredaId, woreda.zoneId, woreda.zone.regionId)
 * @param {string} resourceType - Human-readable resource type name for error messages
 * @returns {boolean} true if in scope
 * @throws {ForbiddenError} if out of scope
 */
function assertResourceInScope(user, resource, resourceType = 'resource') {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return true;

  const role = (user.role || '').toUpperCase();

  if (role === 'FARMER') {
    // Farmers: check userId ownership directly or via nested farm
    const ownerId = resource.userId || resource.farm?.userId;
    if (ownerId && ownerId !== user.id) {
      throw new ForbiddenError(`Access denied: this ${resourceType} does not belong to you`);
    }
    return true;
  }

  // For geographic-scope roles, check the kebele → woreda → zone → region chain
  const resourceKebeleId = resource.kebeleId || resource.farm?.kebeleId;
  const resourceWoredaId = resource.woredaId || resource.farm?.woredaId;
  const resourceZoneId = resource.zoneId || resource.woreda?.zoneId || resource.farm?.woreda?.zoneId || resource.farm?.zoneId;
  const resourceRegionId = resource.regionId || resource.woreda?.zone?.regionId || resource.farm?.woreda?.zone?.regionId || resource.farm?.regionId;

  if (role === 'DEVELOPMENT_AGENT') {
    if (user.kebeleId && resourceKebeleId && resourceKebeleId !== user.kebeleId) {
      throw new ForbiddenError(`Access denied: this ${resourceType} is outside your kebele jurisdiction`);
    }
    if (user.woredaId && resourceWoredaId && resourceWoredaId !== user.woredaId) {
      throw new ForbiddenError(`Access denied: this ${resourceType} is outside your woreda jurisdiction`);
    }
  } else if (role === 'WOREDA_OFFICER') {
    if (user.woredaId && resourceWoredaId && resourceWoredaId !== user.woredaId) {
      throw new ForbiddenError(`Access denied: this ${resourceType} is outside your woreda jurisdiction`);
    }
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId && resourceZoneId && resourceZoneId !== user.zoneId) {
      throw new ForbiddenError(`Access denied: this ${resourceType} is outside your zone jurisdiction`);
    }
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId && resourceRegionId && resourceRegionId !== user.regionId) {
      throw new ForbiddenError(`Access denied: this ${resourceType} is outside your region jurisdiction`);
    }
  }

  return true;
}

/**
 * Build a woreda-level Prisma where fragment for higher-level scopes.
 * Returns: { id: woredaId } | { zoneId } | { zone: { regionId } } | {}
 * Useful for dashboard helpers that query by woreda but need to support zone/region levels.
 */
function buildWoredaLevelFilter(user) {
  if (!user) throw new ForbiddenError('Authentication required');
  if (isNationalScope(user)) return {};

  const role = (user.role || '').toUpperCase();

  if (role === 'FARMER' || role === 'DEVELOPMENT_AGENT' || role === 'WOREDA_OFFICER') {
    if (user.woredaId) return { id: user.woredaId };
  } else if (role === 'ZONAL_OFFICER') {
    if (user.zoneId) return { zoneId: user.zoneId };
  } else if (role === 'REGIONAL_OFFICER') {
    if (user.regionId) return { zone: { regionId: user.regionId } };
  }

  return {};
}

module.exports = {
  isNationalScope,
  buildUserScope,
  buildFarmScope,
  buildAlertScope,
  buildSensorScope,
  buildDiagnosisScope,
  buildAuditLogScope,
  assertResourceInScope,
  buildWoredaLevelFilter,
  NATIONAL_ROLES,
};
