const weatherService = require('./weather.service');

/**
 * Weather Controller
 */

async function getForecast(req, res, next) {
  try {
    const user = req.user || {};
    const { farmId, kebeleId, woredaId, zoneId, regionId, lat, lng, days, forceRefresh } = req.query;

    const data = await weatherService.getWeatherForecast({
      farmId: farmId || null,
      kebeleId: kebeleId || null,
      woredaId: woredaId || null,
      zoneId: zoneId || null,
      regionId: regionId || null,
      lat: lat || null,
      lng: lng || null,
      user,
      days: days || 7,
      forceRefresh: forceRefresh === 'true' || forceRefresh === true,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getCurrentWeather(req, res, next) {
  try {
    const user = req.user || {};
    const { farmId, kebeleId, woredaId, zoneId, regionId, lat, lng, forceRefresh } = req.query;

    const forecast = await weatherService.getWeatherForecast({
      farmId: farmId || null,
      kebeleId: kebeleId || null,
      woredaId: woredaId || null,
      zoneId: zoneId || null,
      regionId: regionId || null,
      lat: lat || null,
      lng: lng || null,
      user,
      days: 1,
      forceRefresh: forceRefresh === 'true' || forceRefresh === true,
    });

    res.status(200).json({
      success: true,
      data: {
        location: forecast.location,
        current: forecast.current,
        dataSources: forecast.dataSources,
        timestamp: forecast.timestamp,
        isCached: forecast.isCached,
        updatedHourly: forecast.updatedHourly,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getLocations(req, res, next) {
  try {
    const user = req.user || {};
    const { q, limit } = req.query;

    const locations = await weatherService.searchWeatherLocations({
      query: q || '',
      limit: limit ? parseInt(limit, 10) : 20,
      userId: user.id || null,
    });

    res.status(200).json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getForecast,
  getCurrentWeather,
  getLocations,
};
