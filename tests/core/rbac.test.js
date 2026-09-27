const express = require('express');
const request = require('supertest');
const {
  authenticate,
  authorize,
  authorizeWoredaScope,
  authorizeZoneScope,
  authorizeRegionScope,
} = require('../../src/middleware/auth.middleware');
const { generateAccessToken } = require('../../src/modules/auth/auth.service');
const errorHandler = require('../../src/middleware/error-handler.middleware');

// Create test app with RBAC routes
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Admin-only route
  app.get('/admin-only', authenticate, authorize('ADMIN'), (req, res) => {
    res.json({ success: true, message: 'Admin access granted' });
  });

  // Regional officer & admin route
  app.get(
    '/regional-only',
    authenticate,
    authorize('REGIONAL_OFFICER', 'ADMIN'),
    (req, res) => {
      res.json({ success: true, message: 'Regional officer access granted' });
    }
  );

  // Zonal officer, regional officer & admin route
  app.get(
    '/zonal-only',
    authenticate,
    authorize('ZONAL_OFFICER', 'REGIONAL_OFFICER', 'ADMIN'),
    (req, res) => {
      res.json({ success: true, message: 'Zonal officer access granted' });
    }
  );

  // Woreda officer & DA route
  app.get(
    '/officers-only',
    authenticate,
    authorize('WOREDA_OFFICER', 'DEVELOPMENT_AGENT'),
    (req, res) => {
      res.json({ success: true, message: 'Officer access granted' });
    }
  );

  // Regional-scoped action route
  app.post(
    '/regions/:regionId/report',
    authenticate,
    authorizeRegionScope('regionId'),
    (req, res) => {
      res.json({ success: true, message: 'Regional action authorized' });
    }
  );

  // Zonal-scoped action route
  app.post(
    '/zones/:zoneId/advisory',
    authenticate,
    authorizeZoneScope('zoneId'),
    (req, res) => {
      res.json({ success: true, message: 'Zonal action authorized' });
    }
  );

  // Woreda-scoped action route
  app.post(
    '/woredas/:woredaId/risk-override',
    authenticate,
    authorizeWoredaScope('woredaId'),
    (req, res) => {
      res.json({ success: true, message: 'Woreda action authorized' });
    }
  );

  app.use(errorHandler);
  return app;
}

describe('Core Backend - RBAC & Boundary Authorization', () => {
  const app = createTestApp();

  const farmerUser = {
    id: 'u1',
    phoneNumber: '+251911000001',
    role: 'FARMER',
    woredaId: 'woreda-oromia-01',
  };
  const officerUser = {
    id: 'u2',
    phoneNumber: '+251911000002',
    role: 'WOREDA_OFFICER',
    woredaId: 'woreda-oromia-01',
  };
  const adminUser = { id: 'u3', phoneNumber: '+251911000003', role: 'ADMIN', woredaId: null };

  const zonalUser = {
    id: 'u4',
    phoneNumber: '+251911000004',
    role: 'ZONAL_OFFICER',
    regionId: 'reg_oromia_01',
    zoneId: 'zone-oromia-01',
    woredaId: null,
  };
  const regionalUser = {
    id: 'u5',
    phoneNumber: '+251911000005',
    role: 'REGIONAL_OFFICER',
    regionId: 'reg_oromia_01',
    zoneId: null,
    woredaId: null,
  };

  const farmerToken = generateAccessToken(farmerUser);
  const officerToken = generateAccessToken(officerUser);
  const zonalToken = generateAccessToken(zonalUser);
  const regionalToken = generateAccessToken(regionalUser);
  const adminToken = generateAccessToken(adminUser);

  describe('Role-Based Access Control (authorize)', () => {
    it('should allow ADMIN to access any restricted route', async () => {
      const res = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow REGIONAL_OFFICER to access regional route', async () => {
      const res = await request(app)
        .get('/regional-only')
        .set('Authorization', `Bearer ${regionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject ZONAL_OFFICER on regional-only route', async () => {
      const res = await request(app)
        .get('/regional-only')
        .set('Authorization', `Bearer ${zonalToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow ZONAL_OFFICER and REGIONAL_OFFICER to access zonal route', async () => {
      const resZonal = await request(app)
        .get('/zonal-only')
        .set('Authorization', `Bearer ${zonalToken}`);
      expect(resZonal.status).toBe(200);

      const resRegional = await request(app)
        .get('/zonal-only')
        .set('Authorization', `Bearer ${regionalToken}`);
      expect(resRegional.status).toBe(200);
    });

    it('should allow WOREDA_OFFICER to access officer route', async () => {
      const res = await request(app)
        .get('/officers-only')
        .set('Authorization', `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject FARMER on admin-only route with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Zonal Administrative Scoping (authorizeZoneScope)', () => {
    it('should allow zonal officer to perform action within assigned zone', async () => {
      const res = await request(app)
        .post('/zones/zone-oromia-01/advisory')
        .set('Authorization', `Bearer ${zonalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject zonal officer attempting action in a different zone', async () => {
      const res = await request(app)
        .post('/zones/zone-amhara-99/advisory')
        .set('Authorization', `Bearer ${zonalToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUT_OF_SCOPE');
    });

    it('should reject a regional officer outside their region while allowing admin national access', async () => {
      const resReg = await request(app)
        .post('/zones/zone-amhara-99/advisory')
        .set('Authorization', `Bearer ${regionalToken}`);
      expect(resReg.status).toBe(403);
      expect(resReg.body.error.code).toBe('OUT_OF_SCOPE');

      const resAdmin = await request(app)
        .post('/zones/zone-amhara-99/advisory')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
    });
  });

  describe('Woreda Administrative Scoping (authorizeWoredaScope)', () => {
    it('should allow officer to perform action within their assigned woreda', async () => {
      const res = await request(app)
        .post('/woredas/woreda-oromia-01/risk-override')
        .set('Authorization', `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject officer attempting action in a different woreda (403 OUT_OF_SCOPE)', async () => {
      const res = await request(app)
        .post('/woredas/woreda-amhara-99/risk-override')
        .set('Authorization', `Bearer ${officerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUT_OF_SCOPE');
    });

    it('should reject zonal and regional officers outside their parent geography while allowing admin national access', async () => {
      const resZonal = await request(app)
        .post('/woredas/woreda-amhara-99/risk-override')
        .set('Authorization', `Bearer ${zonalToken}`);
      expect(resZonal.status).toBe(403);
      expect(resZonal.body.error.code).toBe('OUT_OF_SCOPE');

      const resRegional = await request(app)
        .post('/woredas/woreda-amhara-99/risk-override')
        .set('Authorization', `Bearer ${regionalToken}`);
      expect(resRegional.status).toBe(403);
      expect(resRegional.body.error.code).toBe('OUT_OF_SCOPE');

      const resAdmin = await request(app)
        .post('/woredas/woreda-amhara-99/risk-override')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
    });
  });

  describe('Regional Administrative Scoping (authorizeRegionScope)', () => {
    it('should allow regional officer to perform action within assigned region', async () => {
      const res = await request(app)
        .post('/regions/reg_oromia_01/report')
        .set('Authorization', `Bearer ${regionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject regional officer attempting action in a different region', async () => {
      const res = await request(app)
        .post('/regions/reg_amhara_99/report')
        .set('Authorization', `Bearer ${regionalToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUT_OF_SCOPE');
    });

    it('should allow admin unrestricted access across regions', async () => {
      const res = await request(app)
        .post('/regions/reg_amhara_99/report')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
