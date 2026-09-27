const boundariesService = require('./boundaries.service');

async function getRegions(req, res, next) {
  try {
    const includeGeometry = req.query.includeGeometry === 'true';
    const data = await boundariesService.getRegions(includeGeometry);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getZones(req, res, next) {
  try {
    const includeGeometry = req.query.includeGeometry === 'true';
    const data = await boundariesService.getZones(req.query.regionId, includeGeometry);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getWoredas(req, res, next) {
  try {
    const data = await boundariesService.getWoredas({
      zoneId: req.query.zoneId,
      regionId: req.query.regionId,
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset || req.query.skip,
    });
    res.status(200).json({ success: true, data: data.woredas || data, total: data.total, limit: data.limit, offset: data.offset, ...data });
  } catch (error) {
    next(error);
  }
}

async function getWoredaDetails(req, res, next) {
  try {
    const data = await boundariesService.getWoredaById(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Woreda not found' });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getKebeles(req, res, next) {
  try {
    const data = await boundariesService.getKebeles({
      woredaId: req.query.woredaId,
      agroZone: req.query.agroZone,
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json({ success: true, data: data.kebeles || data, total: data.total, limit: data.limit, offset: data.offset, ...data });
  } catch (error) {
    next(error);
  }
}


async function getKebeleDetails(req, res, next) {
  try {
    const data = await boundariesService.getKebeleById(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Kebele not found' });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getHierarchy(req, res, next) {
  try {
    const data = await boundariesService.getAdministrativeHierarchy();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getNationalSummary(req, res, next) {
  try {
    const data = await boundariesService.getNationalSummary();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function resolveCoordinates(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const woredaId = await boundariesService.resolveWoredaByCoords(lat, lng);
    const kebeleId = await boundariesService.resolveKebeleByCoords(lat, lng);
    res.status(200).json({ success: true, data: { woredaId, kebeleId, lat: Number(lat), lng: Number(lng) } });
  } catch (error) {
    next(error);
  }
}

async function updateKebelePolygon(req, res, next) {
  try {
    const { id } = req.params;
    const { polygonGeojson } = req.body;
    const data = await boundariesService.updateKebelePolygon({
      kebeleId: id,
      polygonGeojson,
      user: req.user,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRegions,
  getZones,
  getWoredas,
  getWoredaDetails,
  getKebeles,
  getKebeleDetails,
  updateKebelePolygon,
  getHierarchy,
  getNationalSummary,
  resolveCoordinates,
};

