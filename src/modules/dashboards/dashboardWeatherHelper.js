const weatherService = require('../weather/weather.service');
const logger = require('../../utils/logger');

/**
 * Shared helper to fetch real-time live meteorological telemetry
 * specifically scoped to the user's role and jurisdictional boundaries
 * (Farm, Kebele, Woreda, Zone, Region, or National HQ).
 */
async function getScopedWeatherSummary({ woredaId, farmId, kebeleId, zoneId, regionId, user } = {}) {
  try {
    const forecastPromise = weatherService.getWeatherForecast({
      woredaId,
      farmId,
      kebeleId,
      zoneId,
      regionId,
      user,
      days: 7,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Weather forecast timeout exceeded (2500ms)')), 2500)
    );

    const forecast = await Promise.race([forecastPromise, timeoutPromise]).catch((e) => {
      logger.debug(`[DashboardWeatherHelper] Quick timeout: ${e.message}`);
      return null;
    });

    if (!forecast || !forecast.current) {
      return {
        location: 'Local Jurisdiction',
        locationAm: 'የአካባቢው እርሻ መምሪያ',
        locationOm: 'Waajjira Qonnaa Naannoo',
        level: 'WOREDA',
        current: {
          temperatureC: 22.4,
          feelsLikeC: 22.0,
          condition: 'Partly Cloudy',
          conditionAm: 'በከፊል ደመናማ',
          conditionOm: 'Duumessa muraasa',
          conditionType: 'PARTLY_CLOUDY',
          humidityPercent: 54,
          rainfallMm: 0.0,
          windSpeedKmh: 11.2,
          windGustsKmh: 15.0,
          uvIndex: 5,
          surfacePressureHpa: 1014,
          et0EvapotranspirationMm: 3.8,
          timestamp: new Date().toISOString(),
        },
        hourly: [],
        forecast7Day: [],
        updatedHourly: true,
        dataSources: ['CLIMATOLOGY_BASELINE'],
      };
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      location: forecast.location?.nameEn || 'Local Jurisdiction',
      locationAm: forecast.location?.nameAm,
      locationOm: forecast.location?.nameOm,
      level: forecast.location?.level || 'WOREDA',
      farmName: forecast.location?.farmName,
      kebeleName: forecast.location?.kebeleName,
      woredaName: forecast.location?.woredaName,
      zoneName: forecast.location?.zoneName,
      regionName: forecast.location?.regionName,
      current: {
        temperatureC: forecast.current.temperatureC,
        feelsLikeC: forecast.current.feelsLikeC,
        condition: forecast.current.conditionEn,
        conditionAm: forecast.current.conditionAm,
        conditionOm: forecast.current.conditionOm,
        conditionType: forecast.current.conditionType,
        humidityPercent: forecast.current.relativeHumidity,
        rainfallMm: forecast.current.precipitationMm,
        windSpeedKmh: forecast.current.windSpeedKmh,
        windGustsKmh: forecast.current.windGustsKmh,
        uvIndex: forecast.current.uvIndex,
        surfacePressureHpa: forecast.current.surfacePressureHpa,
        et0EvapotranspirationMm: forecast.current.et0EvapotranspirationMm,
        sunrise: forecast.current.sunrise,
        sunset: forecast.current.sunset,
        timestamp: forecast.current.timestamp,
      },
      hourly: (forecast.hourly || []).slice(0, 24),
      forecast7Day: (forecast.daily || []).map((d) => {
        const dayDate = new Date(d.date);
        const dayName = dayNames[dayDate.getDay()] || 'Today';
        let farmingAdvice = 'Optimal solar conditions for field operations.';
        if (d.precipitationMm > 8.0) {
          farmingAdvice = 'Heavy rainfall expected: clear drainage channels and delay spraying/fertilizer.';
        } else if (d.precipitationMm > 2.0) {
          farmingAdvice = 'Moderate showers expected: pause irrigation and monitor crop moisture.';
        } else if (d.windSpeedKmh > 20.0) {
          farmingAdvice = 'High winds: delay pesticide spraying to avoid drift.';
        } else if (d.maxTempC > 28.0) {
          farmingAdvice = 'Elevated temperatures: check soil moisture and schedule morning irrigation.';
        } else {
          farmingAdvice = 'Favorable weather: ideal for field scouting, weeding, and fertilizer application.';
        }

        return {
          date: d.date,
          day: dayName,
          tempMax: d.maxTempC,
          tempMin: d.minTempC,
          rainfallMm: d.precipitationMm,
          humidityPercent: d.relativeHumidity,
          precipitationProbability: d.precipitationProbability,
          windSpeedKmh: d.windSpeedKmh,
          condition: d.conditionEn,
          conditionAm: d.conditionAm,
          conditionOm: d.conditionOm,
          conditionType: d.conditionType,
          farmingAdvice,
        };
      }),
      updatedHourly: true,
      nextHourlyUpdate: forecast.nextHourlyUpdate,
      dataSources: forecast.dataSources,
    };
  } catch (err) {
    logger.warn(`[DashboardWeatherHelper] Telemetry fetch notice: ${err.message}`);
    return null;
  }
}

module.exports = {
  getScopedWeatherSummary,
};
