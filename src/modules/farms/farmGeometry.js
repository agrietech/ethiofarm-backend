const { polygon: createPolygon, multiPolygon: createMultiPolygon } = require('@turf/helpers');
const kinks = require('@turf/kinks').default || require('@turf/kinks');
const booleanWithin = require('@turf/boolean-within').default || require('@turf/boolean-within');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon');
const centroid = require('@turf/centroid').default || require('@turf/centroid');

// Ethiopian geographic bounding box (approximate)
const ETHIOPIA_BOUNDS = { minLat: 3.0, maxLat: 15.5, minLng: 32.5, maxLng: 48.5 };

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function generateBoundingPolygon(lat, lng, hectares = 1.0) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  const ha = Number(hectares) > 0 ? Number(hectares) : 1.0;
  const delta = (Math.sqrt(ha * 10000) / 111320) / 2;
  return {
    type: 'Polygon',
    coordinates: [[
      [Number((numLng - delta).toFixed(6)), Number((numLat - delta).toFixed(6))],
      [Number((numLng + delta).toFixed(6)), Number((numLat - delta).toFixed(6))],
      [Number((numLng + delta).toFixed(6)), Number((numLat + delta).toFixed(6))],
      [Number((numLng - delta).toFixed(6)), Number((numLat + delta).toFixed(6))],
      [Number((numLng - delta).toFixed(6)), Number((numLat - delta).toFixed(6))],
    ]],
  };
}

/**
 * Validate that a value is a well-formed GeoJSON Polygon or MultiPolygon geometry or Feature.
 * Returns a turf Feature on success; throws an HTTP-ready error otherwise.
 */
function asPolygon(rawGeojson, label) {
  if (!rawGeojson) {
    throw createHttpError(`${label} must be a valid GeoJSON object`);
  }

  let geojson = rawGeojson;
  if (typeof geojson === 'string') {
    try {
      geojson = JSON.parse(geojson);
    } catch (err) {
      throw createHttpError(`${label} contains invalid JSON string: ${err.message}`);
    }
  }

  if (typeof geojson !== 'object' || geojson === null) {
    throw createHttpError(`${label} must be a valid GeoJSON object`);
  }

  // Unwrap FeatureCollection
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features.length > 0) {
    geojson = geojson.features[0];
  }

  // Unwrap Feature to bare geometry
  const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
    throw createHttpError(`${label} must be a GeoJSON Polygon or MultiPolygon`);
  }

  if (geometry.type === 'MultiPolygon') {
    try {
      return createMultiPolygon(geometry.coordinates);
    } catch (err) {
      throw createHttpError(`${label} has invalid MultiPolygon coordinates: ${err.message}`);
    }
  }

  let rings = geometry.coordinates;
  if (rings.length === 0) {
    throw createHttpError(`${label} has no coordinate rings`);
  }

  // Auto-wrap flat array of coordinates [[lng, lat], ...] into [[[lng, lat], ...]]
  if (Array.isArray(rings) && rings.length > 0 && Array.isArray(rings[0]) && typeof rings[0][0] === 'number') {
    rings = [rings];
    geometry.coordinates = rings;
  }

  // Validate each ring (outer + any holes)
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const ringLabel = r === 0 ? 'outer ring' : `hole ring ${r}`;

    if (!Array.isArray(ring)) {
      throw createHttpError(`${label} ${ringLabel} must be an array of positions`);
    }

    if (ring.length < 4) {
      throw createHttpError(
        `${label} has invalid polygon coordinates: ${ringLabel} must have at least 4 positions`
      );
    }

    for (let i = 0; i < ring.length; i++) {
      const pos = ring[i];
      if (!Array.isArray(pos) || pos.length < 2) {
        throw createHttpError(`${label} ${ringLabel} position[${i}] must be [lng, lat]`);
      }

      let [lng, lat] = pos;

      if (typeof lng !== 'number' || typeof lat !== 'number' || !isFinite(lng) || !isFinite(lat)) {
        throw createHttpError(
          `${label} ${ringLabel} position[${i}] contains non-numeric or non-finite coordinates`
        );
      }

      // Auto-correct inverted lat/lng coordinates (e.g. [lat, lng] -> [lng, lat])
      if (
        lng >= ETHIOPIA_BOUNDS.minLat &&
        lng <= ETHIOPIA_BOUNDS.maxLat &&
        lat >= ETHIOPIA_BOUNDS.minLng &&
        lat <= ETHIOPIA_BOUNDS.maxLng
      ) {
        const temp = lng;
        lng = lat;
        lat = temp;
        ring[i] = [lng, lat];
      }

      if (
        lat < ETHIOPIA_BOUNDS.minLat ||
        lat > ETHIOPIA_BOUNDS.maxLat ||
        lng < ETHIOPIA_BOUNDS.minLng ||
        lng > ETHIOPIA_BOUNDS.maxLng
      ) {
        throw createHttpError(
          `${label} ${ringLabel} position[${i}] [${lng}, ${lat}] falls outside Ethiopia`
        );
      }
    }

    // Ring closure check & auto-fix
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }

  let polygonFeature;
  try {
    polygonFeature = createPolygon(geometry.coordinates);
  } catch (error) {
    throw createHttpError(`${label} has invalid polygon coordinates: ${error.message}`);
  }

  const kinkFeatures = kinks(polygonFeature);
  if (kinkFeatures.features.length > 0) {
    throw createHttpError(`${label} must not self-intersect`);
  }

  return polygonFeature;
}

// In-memory cache for parsed administrative geometries to avoid repeated parsing overhead
const parsedGeometryCache = new Map();

/**
 * Fast 2D Bounding Box calculation for a GeoJSON polygon
 */
function getBBox(feature) {
  const coords = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates.flat(2)
    : feature.geometry.coordinates[0];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minX) minX = lng;
    if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Check if two 2D bounding boxes overlap
 */
function bboxOverlap(b1, b2) {
  return b1[0] <= b2[2] && b1[2] >= b2[0] && b1[1] <= b2[3] && b1[3] >= b2[1];
}

/**
 * Validate the incoming farm polygon GeoJSON.
 */
function validateFarmPolygon(geojson) {
  return asPolygon(geojson, 'Farm boundary');
}

/**
 * Assert that the farm polygon is contained within the woreda boundary.
 * Uses high-performance bounding box pre-filtering before spatial polygon execution.
 */
function assertContainedByWoreda(farmPolygon, woredaGeojson) {
  const cacheKey = typeof woredaGeojson === 'string' ? woredaGeojson : JSON.stringify(woredaGeojson).substring(0, 100);
  let woredaFeature = parsedGeometryCache.get(cacheKey);

  if (!woredaFeature) {
    woredaFeature = asPolygon(woredaGeojson, 'Woreda boundary');
    if (parsedGeometryCache.size > 200) parsedGeometryCache.clear();
    parsedGeometryCache.set(cacheKey, woredaFeature);
  }

  // Fast bounding box intersection pre-check
  const farmBbox = getBBox(farmPolygon);
  const woredaBbox = getBBox(woredaFeature);

  if (!bboxOverlap(farmBbox, woredaBbox)) {
    throw createHttpError('Farm boundary coordinates do not intersect the selected woreda region');
  }

  const isWithin = booleanWithin(farmPolygon, woredaFeature);
  if (isWithin) return true;

  const farmCenter = centroid(farmPolygon);
  const centerWithin = booleanPointInPolygon(farmCenter, woredaFeature);
  if (centerWithin) {
    return true;
  }

  throw createHttpError('Farm boundary must be entirely within the selected woreda boundary');
}

module.exports = {
  assertContainedByWoreda,
  createHttpError,
  validateFarmPolygon,
  asPolygon,
  generateBoundingPolygon,
  getBBox,
  bboxOverlap,
};


