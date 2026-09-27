const roleRequestService = require('./roleRequest.service');

/**
 * Role Request Controller
 * Handles HTTP requests for role upgrade applications
 */

/**
 * Submit a new role upgrade request
 * POST /api/v1/auth/role-requests
 */
async function submitRoleRequest(req, res, next) {
  try {
    const userId = req.user.id;
    const requestData = req.body;

    const roleRequest = await roleRequestService.submitRoleRequest(userId, requestData);

    return res.status(201).json({
      success: true,
      message: 'Role upgrade request submitted successfully',
      data: roleRequest,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's own role requests
 * GET /api/v1/auth/role-requests/my-requests
 */
async function getMyRoleRequests(req, res, next) {
  try {
    const userId = req.user.id;
    const { status, limit, offset } = req.query;

    const result = await roleRequestService.getUserRoleRequests(userId, {
      status,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: result.requests,
      requests: result.requests,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get pending requests for review (hierarchical)
 * GET /api/v1/admin/role-requests/pending
 */
async function getPendingRequests(req, res, next) {
  try {
    const reviewerId = req.user.id;
    const { requestedRole, woredaId, limit, offset } = req.query;

    const result = await roleRequestService.getPendingRequests(reviewerId, {
      requestedRole,
      woredaId,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Approve a role request
 * POST /api/v1/admin/role-requests/:id/approve
 */
async function approveRoleRequest(req, res, next) {
  try {
    const { id } = req.params;
    const reviewerId = req.user.id;
    const reviewerName = req.user.email || req.user.fullName;

    const updatedRequest = await roleRequestService.approveRoleRequest(
      id,
      reviewerId,
      reviewerName
    );

    return res.status(200).json({
      success: true,
      message: 'Role request approved successfully',
      data: updatedRequest,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reject a role request
 * POST /api/v1/admin/role-requests/:id/reject
 */
async function rejectRoleRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const reviewerId = req.user.id;
    const reviewerName = req.user.email || req.user.fullName;

    const updatedRequest = await roleRequestService.rejectRoleRequest(
      id,
      reviewerId,
      reviewerName,
      rejectionReason
    );

    return res.status(200).json({
      success: true,
      message: 'Role request rejected',
      data: updatedRequest,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get role request statistics
 * GET /api/v1/admin/role-requests/stats
 */
async function getRoleRequestStats(req, res, next) {
  try {
    const stats = await roleRequestService.getRoleRequestStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitRoleRequest,
  getMyRoleRequests,
  getPendingRequests,
  approveRoleRequest,
  rejectRoleRequest,
  getRoleRequestStats,
};
