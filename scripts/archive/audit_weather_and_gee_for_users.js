const { prisma } = require('../src/config/db');
const weatherService = require('../src/modules/weather/weather.service');
const earthEngineConnector = require('../src/ingestion/connectors/earthEngineConnector');
const logger = require('../src/utils/logger');

async function audit() {
  console.log('================================================================================');
  console.log('   AUDIT: LIVE WEATHER & GEE METRICS EXTRACTION FOR ALL USERS AND FARMS');
  console.log('================================================================================\n');

  // 1. Load all users and farms from DB
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      role: true,
      woredaId: true,
      kebeleId: true,
      zoneId: true,
      regionId: true,
      farms: {
        select: {
          id: true,
          farmName: true,
          latitude: true,
          longitude: true,
          woredaId: true,
          kebeleId: true,
          areaHectares: true,
          primaryCrop: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const allFarms = await prisma.farm.findMany({
    select: {
      id: true,
      farmName: true,
      latitude: true,
      longitude: true,
      woredaId: true,
      kebeleId: true,
      userId: true,
      user: {
        select: { email: true, phoneNumber: true, role: true },
      },
      woreda: { select: { nameEn: true } },
      kebele: { select: { nameEn: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${users.length} total users in DB.`);
  console.log(`Found ${allFarms.length} total farms in DB.\n`);

  let passedTests = 0;
  let failedTests = 0;

  function report(success, title, details = '') {
    if (success) {
      console.log(`  ✅ [PASS] ${title}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${title} - ${details}`);
      failedTests++;
    }
  }

  // 2. Audit All Farms directly
  console.log('--------------------------------------------------------------------------------');
  console.log('1. AUDITING ALL FARMS: Live Weather & GEE Planetary Telemetry');
  console.log('--------------------------------------------------------------------------------');

  for (const farm of allFarms) {
    console.log(`\n🌾 Farm: "${farm.farmName}" (ID: ${farm.id})`);
    console.log(`   Location: Lat ${farm.latitude}, Lng ${farm.longitude} | Woreda: ${farm.woreda?.nameEn || farm.woredaId || 'N/A'}`);

    // Check Weather
    try {
      const forecast = await weatherService.getWeatherForecast({
        farmId: farm.id,
        lat: farm.latitude,
        lng: farm.longitude,
        days: 7,
        forceRefresh: true,
      });

      const cur = forecast.current;
      report(cur != null, `Farm Weather: Current object present`);
      report(typeof cur.relativeHumidity === 'number' && cur.relativeHumidity >= 0 && cur.relativeHumidity <= 100,
        `Farm Weather: Relative Humidity extracted = ${cur.relativeHumidity}%`);
      report(typeof cur.temperatureC === 'number' && cur.temperatureC > -20 && cur.temperatureC < 60,
        `Farm Weather: Temperature extracted = ${cur.temperatureC}°C (Min: ${cur.minTempC}°C, Max: ${cur.maxTempC}°C)`);
      report(typeof cur.feelsLikeC === 'number',
        `Farm Weather: Apparent Feels-Like Temp = ${cur.feelsLikeC}°C`);
      report(typeof cur.precipitationMm === 'number' && cur.precipitationMm >= 0,
        `Farm Weather: Precipitation extracted = ${cur.precipitationMm} mm`);
      report(typeof cur.windSpeedKmh === 'number' && cur.windSpeedKmh >= 0,
        `Farm Weather: Wind Speed = ${cur.windSpeedKmh} km/h (Direction: ${cur.windDirectionDeg}°)`);
      report(typeof cur.surfacePressureHpa === 'number' && cur.surfacePressureHpa > 600,
        `Farm Weather: Surface Pressure = ${cur.surfacePressureHpa} hPa`);
      report(typeof cur.uvIndex === 'number',
        `Farm Weather: UV Index = ${cur.uvIndex}`);
      report(typeof cur.et0EvapotranspirationMm === 'number',
        `Farm Weather: Reference Evapotranspiration (ET0) = ${cur.et0EvapotranspirationMm} mm`);
      report(cur.conditionEn && cur.conditionAm,
        `Farm Weather: Conditions = "${cur.conditionEn}" / "${cur.conditionAm}"`);
      report(Array.isArray(forecast.hourly) && forecast.hourly.length === 24,
        `Farm Weather: 24h Hourly Curve present (${forecast.hourly.length} hours)`);
      report(Array.isArray(forecast.daily) && forecast.daily.length >= 7,
        `Farm Weather: 7-day Daily Outlook present (${forecast.daily.length} days)`);

    } catch (err) {
      report(false, `Farm Weather Forecast failed`, err.message);
    }

    // Check GEE Planetary Metrics
    try {
      const gee = await earthEngineConnector.fetchPlanetaryMetrics({
        lat: farm.latitude,
        lng: farm.longitude,
        level: 'FARM',
      });

      report(gee != null, `Farm GEE: Planetary metrics object returned`);
      report(typeof gee.soilMoisturePct === 'number' && gee.soilMoisturePct >= 0 && gee.soilMoisturePct <= 100,
        `Farm GEE: Sentinel-1 SAR Soil Moisture = ${gee.soilMoisturePct}%`);
      report(typeof gee.soilDielectricConstant === 'number' && gee.soilDielectricConstant > 0,
        `Farm GEE: Soil Dielectric Constant = ${gee.soilDielectricConstant}`);
      report(typeof gee.sentinel2Ndvi === 'number' && gee.sentinel2Ndvi >= 0 && gee.sentinel2Ndvi <= 1,
        `Farm GEE: Sentinel-2 10m NDVI = ${gee.sentinel2Ndvi}`);
      report(typeof gee.ndreChlorophyll === 'number',
        `Farm GEE: NDRE Chlorophyll Index = ${gee.ndreChlorophyll}`);
      report(typeof gee.elevationMeters === 'number' && gee.elevationMeters > 0,
        `Farm GEE: SRTM 30m Elevation = ${gee.elevationMeters}m (Slope: ${gee.slopePercent}%, Aspect: ${gee.slopeAspect})`);
      report(typeof gee.landSurfaceTempCelsius === 'number',
        `Farm GEE: Thermal Land Surface Temp = ${gee.landSurfaceTempCelsius}°C`);
      report(gee.floodInundationRisk && gee.droughtStressAnomaly,
        `Farm GEE: Hazard Risks = Flood: ${gee.floodInundationRisk}, Drought: ${gee.droughtStressAnomaly}`);
    } catch (err) {
      report(false, `Farm GEE Planetary metrics failed`, err.message);
    }
  }

  // 3. Audit All User Scopes (Farmers, Development Agents, Woreda Officers, etc.)
  console.log('\n--------------------------------------------------------------------------------');
  console.log('2. AUDITING ALL USERS BY ROLE & ASSIGNED LOCATION SCOPE');
  console.log('--------------------------------------------------------------------------------');

  for (const user of users) {
    console.log(`\n👤 User: "${user.email || user.phoneNumber || user.id}" (Role: ${user.role})`);
    
    // Resolve location for this user
    let targetLoc;
    try {
      targetLoc = await weatherService.resolveTargetLocation({ user });
      report(targetLoc != null && typeof targetLoc.lat === 'number' && typeof targetLoc.lng === 'number',
        `User Location Resolved: Level=${targetLoc.level}, Name=${targetLoc.nameEn}, Lat=${targetLoc.lat}, Lng=${targetLoc.lng}`);
    } catch (err) {
      report(false, `User Location Resolution failed`, err.message);
      continue;
    }

    // Check Weather for user
    try {
      const forecast = await weatherService.getWeatherForecast({ user, days: 7, forceRefresh: true });
      const cur = forecast.current;
      report(cur != null && typeof cur.relativeHumidity === 'number',
        `User Weather: Relative Humidity = ${cur.relativeHumidity}%, Temp = ${cur.temperatureC}°C, Rain = ${cur.precipitationMm} mm`);
    } catch (err) {
      report(false, `User Weather Fetch failed`, err.message);
    }

    // Check GEE for user location
    try {
      const gee = await earthEngineConnector.fetchPlanetaryMetrics({
        lat: targetLoc.lat,
        lng: targetLoc.lng,
        level: targetLoc.level || 'WOREDA',
      });
      report(gee != null && typeof gee.soilMoisturePct === 'number' && typeof gee.sentinel2Ndvi === 'number',
        `User GEE: Soil Moisture = ${gee.soilMoisturePct}%, NDVI = ${gee.sentinel2Ndvi}, Elev = ${gee.elevationMeters}m`);
    } catch (err) {
      report(false, `User GEE Fetch failed`, err.message);
    }
  }

  console.log('\n================================================================================');
  console.log(`AUDIT RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('================================================================================');
}

audit().catch(console.error).finally(() => process.exit(0));
