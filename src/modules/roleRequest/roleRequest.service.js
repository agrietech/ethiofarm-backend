const { prisma } = require('../../config/db');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * Role Request Service
 * Handles hierarchical role application and approval system across 1 National Admin + 6 Roles
 */

// 5 Requestable professional roles
const REQUESTABLE_ROLES = [
  'DEVELOPMENT_AGENT',
  'WOREDA_OFFICER',
  'ZONAL_OFFICER',
  'REGIONAL_OFFICER',
  'RESEARCHER',
];

// Hierarchical delegation matrix for role approval
const ROLE_HIERARCHY = {
  DEVELOPMENT_AGENT: ['WOREDA_OFFICER', 'ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
  WOREDA_OFFICER: ['ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'],
  ZONAL_OFFICER: ['REGIONAL_OFFICER', 'ADMIN'],
  REGIONAL_OFFICER: ['ADMIN'],
  RESEARCHER: ['REGIONAL_OFFICER', 'ADMIN'],
};

/**
 * Submit a new role upgrade request
 */
async function submitRoleRequest(userId, requestData) {
  const requestedRole = requestData.requestedRole;
  let regionId = requestData.regionId;
  let regionName = requestData.regionName || requestData.jurisdictionRegion;
  let zoneId = requestData.zoneId;
  let zoneName = requestData.zoneName || requestData.jurisdictionZone;
  let woredaId = requestData.woredaId;
  let woredaName = requestData.woredaName || requestData.jurisdictionWoreda;
  const kebeleName = requestData.kebeleName || null;
  const staffIdNumber = requestData.staffIdNumber;
  const organizationName = requestData.organizationName;
  const justification = requestData.justification || requestData.reason || null;

  // Validate requestable role
  if (!REQUESTABLE_ROLES.includes(requestedRole)) {
    throw new BadRequestError(
      `Invalid requested role. Must be one of: ${REQUESTABLE_ROLES.join(', ')}`
    );
  }

  // Get user details
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, phoneNumber: true, email: true, role: true, regionId: true, zoneId: true, woredaId: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user already has this role
  if (user.role === requestedRole) {
    throw new BadRequestError(`You already have the ${requestedRole} role`);
  }

  // Check for duplicate pending request
  const existingRequest = await prisma.roleRequest.findFirst({
    where: {
      userId,
      requestedRole,
      status: 'PENDING',
    },
  });

  if (existingRequest) {
    throw new BadRequestError(
      `You already have a pending request for the ${requestedRole} role`
    );
  }

  // Validate required fields
  if (!staffIdNumber || !organizationName) {
    throw new BadRequestError('Staff ID number and organization name are required');
  }

  // Auto-resolve administrative boundary hierarchy from database if only names or IDs were provided
  if (woredaId || woredaName) {
    try {
      const woredaRecord = await prisma.woreda.findFirst({
        where: {
          OR: [
            ...(woredaId ? [{ id: woredaId }] : []),
            ...(woredaName ? [{ nameEn: { equals: woredaName, mode: 'insensitive' } }, { nameAm: woredaName }] : []),
          ],
        },
        include: {
          zone: {
            include: { region: true },
          },
        },
      });

      if (woredaRecord) {
        woredaId = woredaRecord.id;
        woredaName = woredaRecord.nameEn;
        zoneId = zoneId || woredaRecord.zoneId;
        zoneName = zoneName || woredaRecord.zone?.nameEn;
        regionId = regionId || woredaRecord.zone?.regionId;
        regionName = regionName || woredaRecord.zone?.region?.nameEn;
      }
    } catch (_) {}
  }

  if (zoneId || zoneName) {
    try {
      const zoneRecord = await prisma.zone.findFirst({
        where: {
          OR: [
            ...(zoneId ? [{ id: zoneId }] : []),
            ...(zoneName ? [{ nameEn: { equals: zoneName, mode: 'insensitive' } }, { nameAm: zoneName }] : []),
          ],
        },
        include: { region: true },
      });
      if (zoneRecord) {
        zoneId = zoneRecord.id;
        zoneName = zoneRecord.nameEn;
        regionId = regionId || zoneRecord.regionId;
        regionName = regionName || zoneRecord.region?.nameEn;
      }
    } catch (_) {}
  }

  if (regionId || regionName) {
    try {
      const regionRecord = await prisma.region.findFirst({
        where: {
          OR: [
            ...(regionId ? [{ id: regionId }, { code: regionId }] : []),
            ...(regionName ? [{ nameEn: { equals: regionName, mode: 'insensitive' } }, { nameAm: regionName }, { code: regionName }] : []),
          ],
        },
      });
      if (regionRecord) {
        regionId = regionRecord.id;
        regionName = regionRecord.nameEn;
      }
    } catch (_) {}
  }

  // Region, zone and woreda are all NOT NULL on RoleRequest, and reviewers are
  // scoped geographically (see getPendingRequests): a request stored without a
  // woreda would never appear in the reviewing officer's pending queue. Reject
  // it here with a clear 400 rather than letting Prisma fail on the insert.
  const missingLocation = [
    ['region', regionId, regionName],
    ['zone', zoneId, zoneName],
    ['woreda', woredaId, woredaName],
  ]
    .filter(([, id, name]) => !id || !name)
    .map(([label]) => label);

  if (missingLocation.length > 0) {
    throw new BadRequestError(
      `The following administrative location(s) must be selected: ${missingLocation.join(', ')}`
    );
  }

  // Create role request
  const roleRequest = await prisma.roleRequest.create({
    data: {
      userId: user.id,
      userName: user.fullName,
      userPhone: user.phoneNumber,
      userEmail: user.email,
      currentRole: user.role,
      requestedRole,
      regionId,
      regionName,
      zoneId,
      zoneName,
      woredaId,
      woredaName,
      kebeleName: kebeleName || null,
      staffIdNumber,
      organizationName,
      justification,
      status: 'PENDING',
    },
  });

  return roleRequest;
}

/**
 * Get user's own role requests
 */
async function getUserRoleRequests(userId, filters = {}) {
  const { status, limit = 10, offset = 0 } = filters;

  const where = { userId };
  if (status) {
    where.status = status;
  }

  const [requests, total] = await Promise.all([
    prisma.roleRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    }),
    prisma.roleRequest.count({ where }),
  ]);

  return {
    requests,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  };
}

/**
 * Get pending requests for review with hierarchical & geographical filtering
 */
async function getPendingRequests(reviewerId, filters = {}) {
  const { requestedRole, woredaId, zoneId, regionId, limit = 50, offset = 0 } = filters;

  // Get reviewer details
  let reviewer = null;
  if (reviewerId) {
    reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { role: true, woredaId: true, zoneId: true, regionId: true },
    });
  }

  if (!reviewer) {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { role: true, woredaId: true, zoneId: true, regionId: true },
    });
    reviewer = adminUser || { role: 'ADMIN' };
  }

  const where = { status: 'PENDING' };

  // Apply role-based and geographic scope filtering
  if (reviewer.role === 'WOREDA_OFFICER') {
    // Woreda officers can only review Development Agents in their woreda
    where.requestedRole = 'DEVELOPMENT_AGENT';
    if (reviewer.woredaId) where.woredaId = reviewer.woredaId;
  } else if (reviewer.role === 'ZONAL_OFFICER') {
    // Zonal officers can review Woreda Officers and Development Agents in their zone
    where.requestedRole = { in: ['WOREDA_OFFICER', 'DEVELOPMENT_AGENT'] };
    if (reviewer.zoneId) where.zoneId = reviewer.zoneId;
  } else if (reviewer.role === 'REGIONAL_OFFICER') {
    // Regional officers can review Zonal Officers, Woreda Officers, DAs, and Researchers in their region
    where.requestedRole = { in: ['ZONAL_OFFICER', 'WOREDA_OFFICER', 'DEVELOPMENT_AGENT', 'RESEARCHER'] };
    if (reviewer.regionId) where.regionId = reviewer.regionId;
  } else if (reviewer.role === 'ADMIN') {
    // National admin can view and approve all requests across all levels
    if (requestedRole) where.requestedRole = requestedRole;
    if (woredaId) where.woredaId = woredaId;
    if (zoneId) where.zoneId = zoneId;
    if (regionId) where.regionId = regionId;
  } else {
    throw new ForbiddenError('You do not have permission to review role requests');
  }

  const [requests, total] = await Promise.all([
    prisma.roleRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            role: true,
          },
        },
      },
    }),
    prisma.roleRequest.count({ where }),
  ]);

  return {
    requests,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  };
}

/**
 * Approve a role request
 */
async function approveRoleRequest(requestId, reviewerId, reviewerName) {
  const request = await prisma.roleRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        select: { id: true, role: true, woredaId: true },
      },
    },
  });

  if (!request) {
    throw new NotFoundError('Role request not found');
  }

  if (request.status !== 'PENDING') {
    throw new BadRequestError(`Request is already ${request.status.toLowerCase()}`);
  }

  let reviewer = null;
  if (reviewerId) {
    reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { id: true, role: true, woredaId: true, zoneId: true, regionId: true },
    });
  }

  if (!reviewer) {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, role: true, woredaId: true, zoneId: true, regionId: true },
    });
    reviewer = adminUser || { id: null, role: 'ADMIN' };
  }

  // Check if reviewer's role is in the allowed approvers hierarchy
  const allowedApprovers = ROLE_HIERARCHY[request.requestedRole] || [];
  if (!allowedApprovers.includes(reviewer.role)) {
    throw new ForbiddenError(
      `Your role (${reviewer.role}) cannot approve ${request.requestedRole} requests`
    );
  }

  // Enforce geographic boundary matching for subordinate reviewers
  if (reviewer.role === 'WOREDA_OFFICER' && reviewer.woredaId && reviewer.woredaId !== request.woredaId) {
    throw new ForbiddenError('You can only approve requests within your assigned Woreda');
  }
  if (reviewer.role === 'ZONAL_OFFICER' && reviewer.zoneId && reviewer.zoneId !== request.zoneId) {
    throw new ForbiddenError('You can only approve requests within your assigned Zone');
  }
  if (reviewer.role === 'REGIONAL_OFFICER' && reviewer.regionId && reviewer.regionId !== request.regionId) {
    throw new ForbiddenError('You can only approve requests within your assigned Region');
  }

  // Update request and user role in a transaction
  const [updatedRequest] = await prisma.$transaction([
    prisma.roleRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reviewedById: reviewer.id || null,
        reviewedByName: reviewerName || 'Administrator',
        reviewedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: request.userId },
      data: {
        role: request.requestedRole,
        regionId: request.regionId,
        zoneId: request.zoneId,
        woredaId: request.woredaId,
        kebeleName: request.kebeleName,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'ROLE_REQUEST_APPROVED',
        adminId: reviewer.id || null,
        adminEmail: reviewerName || 'admin@ethiofarm.et',
        details: `Approved ${request.requestedRole} role for user ${request.userName} (${request.userId}) by ${reviewer.role}`,
      },
    }),
  ]);

  return updatedRequest;
}

/**
 * Reject a role request
 */
async function rejectRoleRequest(requestId, reviewerId, reviewerName, rejectionReason) {
  const request = await prisma.roleRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new NotFoundError('Role request not found');
  }

  if (request.status !== 'PENDING') {
    throw new BadRequestError(`Request is already ${request.status.toLowerCase()}`);
  }

  let reviewer = null;
  if (reviewerId) {
    reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { id: true, role: true, woredaId: true, zoneId: true, regionId: true },
    });
  }

  if (!reviewer) {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, role: true, woredaId: true, zoneId: true, regionId: true },
    });
    reviewer = adminUser || { id: null, role: 'ADMIN' };
  }

  const allowedApprovers = ROLE_HIERARCHY[request.requestedRole] || [];
  if (!allowedApprovers.includes(reviewer.role)) {
    throw new ForbiddenError(
      `Your role (${reviewer.role}) cannot reject ${request.requestedRole} requests`
    );
  }

  // Enforce geographic boundary matching for subordinate reviewers
  if (reviewer.role === 'WOREDA_OFFICER' && reviewer.woredaId && reviewer.woredaId !== request.woredaId) {
    throw new ForbiddenError('You can only reject requests within your assigned Woreda');
  }
  if (reviewer.role === 'ZONAL_OFFICER' && reviewer.zoneId && reviewer.zoneId !== request.zoneId) {
    throw new ForbiddenError('You can only reject requests within your assigned Zone');
  }
  if (reviewer.role === 'REGIONAL_OFFICER' && reviewer.regionId && reviewer.regionId !== request.regionId) {
    throw new ForbiddenError('You can only reject requests within your assigned Region');
  }

  // Update request
  const [updatedRequest] = await prisma.$transaction([
    prisma.roleRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason || 'Request rejected by reviewing officer',
        reviewedById: reviewer.id || null,
        reviewedByName: reviewerName || 'Administrator',
        reviewedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'ROLE_REQUEST_REJECTED',
        adminId: reviewer.id || null,
        adminEmail: reviewerName || 'admin@ethiofarm.et',
        details: `Rejected ${request.requestedRole} role for user ${request.userName} (${request.userId}). Reason: ${rejectionReason || 'No reason provided'}`,
      },
    }),
  ]);

  return updatedRequest;
}

/**
 * Get request statistics across roles
 */
async function getRoleRequestStats() {
  const [total, pending, approved, rejected, byRole] = await Promise.all([
    prisma.roleRequest.count(),
    prisma.roleRequest.count({ where: { status: 'PENDING' } }),
    prisma.roleRequest.count({ where: { status: 'APPROVED' } }),
    prisma.roleRequest.count({ where: { status: 'REJECTED' } }),
    prisma.roleRequest.groupBy({
      by: ['requestedRole', 'status'],
      _count: true,
    }),
  ]);

  return {
    total,
    pending,
    approved,
    rejected,
    byRoleAndStatus: byRole,
  };
}

module.exports = {
  submitRoleRequest,
  getUserRoleRequests,
  getPendingRequests,
  approveRoleRequest,
  rejectRoleRequest,
  getRoleRequestStats,
  REQUESTABLE_ROLES,
  ROLE_HIERARCHY,
};

