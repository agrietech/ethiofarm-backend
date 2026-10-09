/**
 * @file animalHealth.service.js
 * @description Animal Health & Livestock Surveillance Service for Ethiopia.
 * Covers disease outbreak tracking, livestock population registry, vaccination campaigns,
 * pasture/forage condition monitoring, and veterinary calendar management.
 */

const { prisma } = require('../../config/db');
const { LIVESTOCK_DISEASES, ETHIOPIAN_LIVESTOCK_BREEDS, getDiseaseById, getDiseasesByAnimalType, getZoonoticDiseases, getNotifiableDiseases, getSeasonalHighRiskDiseases } = require('./diseaseDatabase');
const { getUpcomingVetTasks } = require('./veterinaryCalendar');
const earthEngineConnector = require('../../ingestion/connectors/earthEngineConnector');
const { getWoredaCoordinates } = require('../boundaries/boundaries.service');
const logger = require('../../utils/logger');

// ─── Disease Reference ────────────────────────────────────────────────────────

function getAllDiseases({ animalType, zoonotic, notifiable, season } = {}) {
  let diseases = (notifiable === 'true' || notifiable === true) ? getNotifiableDiseases() : [...LIVESTOCK_DISEASES];

  if (animalType) {
    diseases = getDiseasesByAnimalType(animalType);
  }
  if (zoonotic === 'true' || zoonotic === true) {
    diseases = diseases.filter((d) => d.isZoonotic);
  }
  if (season) {
    diseases = diseases.filter((d) => {
      const risk = d.seasonalRisk[season.toUpperCase()];
      return risk === 'CRITICAL' || risk === 'HIGH';
    });
  }

  return {
    totalDiseases: diseases.length,
    diseases,
    breeds: ETHIOPIAN_LIVESTOCK_BREEDS,
  };
}

function getDiseaseDetails(diseaseId) {
  const disease = getDiseaseById(diseaseId);
  if (!disease) return null;
  return disease;
}

// ─── Outbreak & Campaign Helpers ─────────────────────────────────────────────

async function resolveValidWoreda(woredaId) {
  if (woredaId) {
    const existing = await prisma.woreda.findUnique({
      where: { id: woredaId },
      select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true },
    });
    if (existing) return existing;
  }
  const adama = await prisma.woreda.findUnique({
    where: { id: 'woreda_adama_01' },
    select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true },
  });
  if (adama) return adama;
  return await prisma.woreda.findFirst({
    select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true },
  });
}

// ─── Disease Outbreak Reporting & Tracking ────────────────────────────────────

async function reportOutbreak({
  woredaId,
  kebeleId,
  kebele,
  diseaseName,
  diseaseId,
  animalType,
  confirmedCases,
  suspectedCases,
  deaths,
  mortalities,
  severity,
  reportedBy,
  reporterPhone,
  quarantineStatus,
  notes,
  latitude,
  longitude,
}) {
  const woreda = await resolveValidWoreda(woredaId);
  const diseaseInfo = diseaseId ? getDiseaseById(diseaseId) : null;
  const resolvedDiseaseName = diseaseName || (diseaseInfo ? diseaseInfo.nameEn : 'Unknown Disease');
  const resolvedSeverity = severity || (diseaseInfo ? diseaseInfo.severity : 'MODERATE');

  const createdRecord = await prisma.animalDiseaseOutbreak.create({
    data: {
      woredaId: woreda ? woreda.id : (woredaId || 'woreda_adama_01'),
      kebeleId: kebeleId || null,
      diseaseName: resolvedDiseaseName,
      diseaseId: diseaseId || null,
      animalType: animalType || 'CATTLE',
      confirmedCases: Number(confirmedCases) || 0,
      suspectedCases: Number(suspectedCases) || 1,
      deaths: Number(deaths ?? mortalities) || 0,
      severity: resolvedSeverity,
      status: 'ACTIVE',
      latitude: latitude ?? (woreda?.centerLat ?? 8.54),
      longitude: longitude ?? (woreda?.centerLng ?? 39.27),
      reportedBy: reportedBy || 'Field Officer',
      notes: notes || (kebele ? `Reported from Kebele: ${kebele}` : null),
    },
    include: {
      woreda: { select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true } },
    },
  });

  logger.info(`[AnimalHealth] Outbreak reported: ${createdRecord.diseaseName} in woreda ${woreda?.nameEn || woredaId} (${createdRecord.suspectedCases} suspected cases)`);

  return {
    ...createdRecord,
    woredaName: createdRecord.woreda?.nameEn || createdRecord.woredaId,
    woredaNameAm: createdRecord.woreda?.nameAm || createdRecord.woreda?.nameEn || createdRecord.woredaId,
    coordinates: {
      lat: createdRecord.latitude,
      lng: createdRecord.longitude,
    },
    mortalities: createdRecord.deaths,
    diseaseInfo: diseaseInfo ? {
      symptomsEn: diseaseInfo.symptomsEn,
      symptomsAm: diseaseInfo.symptomsAm,
      treatmentEn: diseaseInfo.treatmentEn,
      treatmentAm: diseaseInfo.treatmentAm,
      preventionEn: diseaseInfo.preventionEn,
      preventionAm: diseaseInfo.preventionAm,
    } : null,
  };
}

async function getOutbreaks({ woredaId, zoneId, regionId, status = 'ACTIVE', animalType, limit = 50 } = {}) {
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (woredaId) where.woredaId = woredaId;
  if (animalType) where.animalType = animalType;
  if (zoneId) where.woreda = { zoneId };
  if (regionId) where.woreda = { zone: { regionId } };

  const dbOutbreaks = await prisma.animalDiseaseOutbreak.findMany({
    where,
    orderBy: { reportedAt: 'desc' },
    take: Number(limit) || 50,
    include: {
      woreda: { select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true } },
    },
  });

  return (dbOutbreaks || []).map((o) => ({
    ...o,
    woredaName: o.woreda?.nameEn || o.woredaId,
    woredaNameAm: o.woreda?.nameAm || o.woreda?.nameEn || o.woredaId,
    coordinates: {
      lat: o.latitude ?? o.woreda?.centerLat ?? 8.54,
      lng: o.longitude ?? o.woreda?.centerLng ?? 39.27,
    },
    mortalities: o.deaths,
  }));
}

async function getOutbreakById(id) {
  const outbreak = await prisma.animalDiseaseOutbreak.findUnique({
    where: { id },
    include: {
      woreda: { select: { id: true, nameEn: true, nameAm: true, centerLat: true, centerLng: true } },
    },
  });

  if (!outbreak) return null;

  const diseaseInfo = outbreak.diseaseId ? getDiseaseById(outbreak.diseaseId) : null;
  return {
    ...outbreak,
    woredaName: outbreak.woreda?.nameEn || outbreak.woredaId,
    woredaNameAm: outbreak.woreda?.nameAm || outbreak.woreda?.nameEn || outbreak.woredaId,
    coordinates: {
      lat: outbreak.latitude ?? outbreak.woreda?.centerLat ?? 8.54,
      lng: outbreak.longitude ?? outbreak.woreda?.centerLng ?? 39.27,
    },
    mortalities: outbreak.deaths,
    diseaseInfo: diseaseInfo ? {
      symptomsEn: diseaseInfo.symptomsEn,
      symptomsAm: diseaseInfo.symptomsAm,
      treatmentEn: diseaseInfo.treatmentEn,
      treatmentAm: diseaseInfo.treatmentAm,
      preventionEn: diseaseInfo.preventionEn,
      preventionAm: diseaseInfo.preventionAm,
    } : null,
  };
}

// ─── Livestock Registry ───────────────────────────────────────────────────────

async function registerLivestock({
  woredaId,
  kebeleId,
  userId,
  animalType,
  breedName,
  headCount,
  healthStatus,
  notes,
}) {
  const coords = await getWoredaCoordinates(woredaId);

  const record = {
    id: `livestock_${woredaId}_${animalType}_${Date.now()}`,
    woredaId: coords.id || woredaId,
    woredaName: coords.nameEn,
    kebeleId: kebeleId || null,
    userId: userId || null,
    animalType: animalType || 'CATTLE',
    breedName: breedName || 'Mixed/Local',
    headCount: Number(headCount) || 0,
    healthStatus: healthStatus || 'HEALTHY',
    notes: notes || null,
    registeredAt: new Date().toISOString(),
    breedInfo: ETHIOPIAN_LIVESTOCK_BREEDS[animalType]?.find((b) => b.breed.toLowerCase() === (breedName || '').toLowerCase()) || null,
  };

  try {
    await prisma.livestockHerd.create({
      data: {
        woredaId: record.woredaId,
        kebeleId: record.kebeleId,
        userId: record.userId,
        animalType: record.animalType,
        breedName: record.breedName,
        headCount: record.headCount,
        healthStatus: record.healthStatus,
        notes: record.notes,
      },
    });
    logger.info(`[AnimalHealth] Livestock registered: ${record.headCount} ${record.animalType} in ${record.woredaName}`);
  } catch (dbErr) {
    logger.warn(`[AnimalHealth] Livestock DB persist notice: ${dbErr.message}`);
  }

  return record;
}

async function getLivestockByWoreda(woredaId) {
  try {
    return await prisma.livestockHerd.findMany({
      where: { woredaId },
      orderBy: { registeredAt: 'desc' },
      include: {
        woreda: { select: { id: true, nameEn: true, nameAm: true } },
      },
    });
  } catch (_err) {
    return [];
  }
}

// ─── Vaccination Campaigns ────────────────────────────────────────────────────

async function recordVaccination({
  woredaId,
  herdId,
  animalType,
  vaccineName,
  dosesAdministered,
  targetPopulation,
  campaignDate,
  nextDueDate,
  administeredBy,
}) {
  const coords = await getWoredaCoordinates(woredaId);
  const coverage = targetPopulation > 0
    ? Math.round((dosesAdministered / targetPopulation) * 100)
    : 0;

  const record = {
    id: `vax_${woredaId}_${Date.now()}`,
    woredaId: coords.id || woredaId,
    woredaName: coords.nameEn,
    herdId: herdId || null,
    animalType: animalType || 'CATTLE',
    vaccineName,
    dosesAdministered: Number(dosesAdministered) || 0,
    targetPopulation: Number(targetPopulation) || 0,
    coveragePercent: coverage,
    campaignDate: campaignDate || new Date().toISOString(),
    nextDueDate: nextDueDate || null,
    administeredBy: administeredBy || 'Woreda Veterinary Office',
    status: coverage >= 80 ? 'COMPLETE' : (coverage >= 50 ? 'IN_PROGRESS' : 'BELOW_TARGET'),
    recordedAt: new Date().toISOString(),
  };

  try {
    await prisma.vaccinationRecord.create({
      data: {
        woredaId: record.woredaId,
        herdId: record.herdId,
        animalType: record.animalType,
        vaccineName: record.vaccineName,
        dosesAdministered: record.dosesAdministered,
        targetPopulation: record.targetPopulation,
        coveragePercent: record.coveragePercent,
        campaignDate: new Date(record.campaignDate),
        nextDueDate: record.nextDueDate ? new Date(record.nextDueDate) : null,
        administeredBy: record.administeredBy,
      },
    });
  } catch (dbErr) {
    logger.warn(`[AnimalHealth] Vaccination DB persist notice: ${dbErr.message}`);
  }

  return record;
}

async function getVaccinationStatus({ woredaId, animalType } = {}) {
  try {
    const where = {};
    if (woredaId) where.woredaId = woredaId;
    if (animalType) where.animalType = animalType;

    return await prisma.vaccinationRecord.findMany({
      where,
      orderBy: { campaignDate: 'desc' },
      take: 50,
      include: {
        woreda: { select: { id: true, nameEn: true, nameAm: true } },
      },
    });
  } catch (_err) {
    return [];
  }
}

// ─── Pasture / Forage Condition ───────────────────────────────────────────────

async function getPastureCondition({ lat, lng, woredaId }) {
  let latitude = Number(lat);
  let longitude = Number(lng);
  let woredaName = null;

  if (woredaId && (!lat || !lng)) {
    const coords = await getWoredaCoordinates(woredaId);
    latitude = coords.lat;
    longitude = coords.lng;
    woredaName = coords.nameEn;
  }

  // Get vegetation indices from Earth Engine connector
  const planetary = await earthEngineConnector.fetchPlanetaryMetrics({
    lat: latitude,
    lng: longitude,
    level: 'KEBELE',
  });

  const ndvi = planetary.sentinel2Ndvi || 0.5;
  const soilMoisture = planetary.soilMoisturePct || 40;
  const month = new Date().getMonth() + 1;
  const season = month >= 6 && month <= 9 ? 'KIREMT' : (month >= 3 && month <= 5 ? 'BELG' : 'DRY');

  // Estimate forage quality from NDVI
  let forageQuality = 'POOR';
  let forageQualityAm = 'ዝቅተኛ የግጦሽ ሁኔታ';
  let carryingCapacity = 'Low — Supplemental feeding required';

  if (ndvi >= 0.65) {
    forageQuality = 'EXCELLENT';
    forageQualityAm = 'እጅግ ጥሩ የግጦሽ ሁኔታ';
    carryingCapacity = 'High — Natural grazing sufficient (4-6 TLU/ha)';
  } else if (ndvi >= 0.50) {
    forageQuality = 'GOOD';
    forageQualityAm = 'ጥሩ የግጦሽ ሁኔታ';
    carryingCapacity = 'Moderate — Light supplementation recommended (2-4 TLU/ha)';
  } else if (ndvi >= 0.35) {
    forageQuality = 'FAIR';
    forageQualityAm = 'መካከለኛ የግጦሽ ሁኔታ';
    carryingCapacity = 'Low-Moderate — Supplemental feeding needed (1-2 TLU/ha)';
  } else {
    carryingCapacity = 'Very Low — Emergency feed distribution needed (<1 TLU/ha)';
  }

  return {
    coordinates: { lat: latitude, lng: longitude },
    woredaName,
    assessedAt: new Date().toISOString(),
    season,
    vegetationIndices: {
      ndvi,
      evi: planetary.enhancedVegetationIndex || 0,
      ndwi: planetary.normalizedDifferenceWaterIndex || 0,
      moistureStressIndex: planetary.moistureStressIndex || 0,
    },
    soilMoisturePct: soilMoisture,
    forageAssessment: {
      quality: forageQuality,
      qualityAm: forageQualityAm,
      carryingCapacity,
      estimatedBiomassDryMatterKgPerHa: Math.round(ndvi * 4500),
    },
    waterAvailability: {
      soilMoisturePct: soilMoisture,
      surfaceWaterIndicator: planetary.normalizedDifferenceWaterIndex > 0.1 ? 'PRESENT' : 'SCARCE',
    },
    recommendations: {
      en: ndvi < 0.35
        ? ['Distribute emergency supplemental feed (hay, crop residues)', 'Move livestock to areas with better forage', 'Reduce stocking density immediately', 'Contact Woreda Livestock Office for feed support']
        : ['Maintain rotational grazing to prevent overgrazing', 'Monitor water point availability', 'Plan dry season feed reserves'],
      am: ndvi < 0.35
        ? ['ድንገተኛ ተጨማሪ መኖ ማከፋፈል (ድርቆሽ፣ ገለባ)', 'ከብቶችን ወደ ተሻለ ግጦሽ ያላቸው ቦታዎች ማዘዋወር', 'የከብቶችን ቁጥር ወዲያውኑ መቀነስ']
        : ['ከመጠን በላይ ግጦሽ ለመከላከል ማሰማሪያ ቦታን በተለዋዋጭ ማስተዳደር', 'የውሃ ቦታዎችን ዝግጁነት መከታተል'],
    },
  };
}

// ─── Combined Risk Assessment ─────────────────────────────────────────────────

async function getAnimalHealthRiskAssessment({ woredaId }) {
  const coords = await getWoredaCoordinates(woredaId);
  const month = new Date().getMonth() + 1;
  const season = month >= 6 && month <= 9 ? 'KIREMT' : (month >= 3 && month <= 5 ? 'BELG' : 'DRY');

  const seasonalDiseases = getSeasonalHighRiskDiseases(season);
  const zoonoticDiseases = getZoonoticDiseases();
  const upcomingVetTasks = getUpcomingVetTasks(month);
  const pasture = await getPastureCondition({ woredaId });

  let outbreakCount = 0;
  try {
    outbreakCount = await prisma.animalDiseaseOutbreak.count({
      where: { woredaId: coords.id || woredaId, status: 'ACTIVE' },
    });
  } catch (_e) { /* model may not exist */ }

  // Compute risk score
  let riskScore = 0.15; // baseline
  if (outbreakCount > 0) riskScore += 0.3;
  if (pasture.forageAssessment.quality === 'POOR') riskScore += 0.2;
  if (seasonalDiseases.length > 5) riskScore += 0.15;
  riskScore = Math.min(1.0, Math.round(riskScore * 100) / 100);

  let riskLevel = 'LOW';
  if (riskScore >= 0.7) riskLevel = 'CRITICAL';
  else if (riskScore >= 0.45) riskLevel = 'HIGH';
  else if (riskScore >= 0.25) riskLevel = 'MODERATE';

  return {
    woredaId: coords.id || woredaId,
    woredaName: coords.nameEn,
    woredaNameAm: coords.nameAm,
    assessedAt: new Date().toISOString(),
    season,
    riskScore,
    riskLevel,
    activeOutbreaks: outbreakCount,
    pastureCondition: pasture.forageAssessment.quality,
    seasonalHighRiskDiseases: seasonalDiseases.map((d) => ({
      id: d.id,
      nameEn: d.nameEn,
      nameAm: d.nameAm,
      animalTypes: d.animalTypes,
      severity: d.severity,
      isZoonotic: d.isZoonotic,
    })),
    zoonoticAlerts: zoonoticDiseases.length,
    upcomingVetTasks: upcomingVetTasks.tasks.slice(0, 10),
    upcomingTaskCount: upcomingVetTasks.upcomingTaskCount,
  };
}

async function getVaccinationCampaigns({ woredaId, status, limit = 50 } = {}) {
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (woredaId) where.woredaId = woredaId;

  const dbCamps = await prisma.vaccinationCampaign.findMany({
    where,
    orderBy: { startDate: 'desc' },
    take: Number(limit) || 50,
    include: {
      woreda: { select: { id: true, nameEn: true, nameAm: true } },
    },
  });

  return (dbCamps || []).map((c) => ({
    ...c,
    woredaName: c.woreda?.nameEn || c.woredaId,
    woredaNameAm: c.woreda?.nameAm || c.woreda?.nameEn || c.woredaId,
  }));
}

async function createVaccinationCampaign({
  woredaId,
  title,
  campaignName,
  diseaseTarget,
  diseaseTargeted,
  animalType,
  targetSpecies,
  targetCount,
  targetAnimals,
  vaccinatedCount,
  startDate,
  endDate,
  status,
  administeredBy,
  veterinarianName,
  notes,
}) {
  const woreda = await resolveValidWoreda(woredaId);
  const resolvedTitle = title || campaignName || 'Vaccination Campaign';
  const resolvedDisease = diseaseTarget || diseaseTargeted || 'General';
  const species = targetSpecies && targetSpecies.length > 0
    ? targetSpecies
    : (animalType ? [animalType] : ['CATTLE']);

  const campaign = await prisma.vaccinationCampaign.create({
    data: {
      woredaId: woreda ? woreda.id : (woredaId || 'woreda_adama_01'),
      title: resolvedTitle,
      diseaseTarget: resolvedDisease,
      animalType: animalType || species[0] || 'CATTLE',
      targetSpecies: species,
      targetCount: Number(targetCount || targetAnimals) || 0,
      vaccinatedCount: Number(vaccinatedCount) || 0,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      status: status || 'IN_PROGRESS',
      administeredBy: administeredBy || veterinarianName || 'Woreda Veterinary Office',
      notes: notes || null,
    },
    include: {
      woreda: { select: { id: true, nameEn: true, nameAm: true } },
    },
  });

  return {
    ...campaign,
    woredaName: campaign.woreda?.nameEn || campaign.woredaId,
    woredaNameAm: campaign.woreda?.nameAm || campaign.woreda?.nameEn || campaign.woredaId,
  };
}

async function getPastureMonitoring({ woredaId } = {}) {
  const where = woredaId ? { id: woredaId } : {};
  const woredas = await prisma.woreda.findMany({
    where,
    take: woredaId ? 1 : 8,
    select: {
      id: true,
      nameEn: true,
      nameAm: true,
      centerLat: true,
      centerLng: true,
      zone: { select: { nameEn: true, region: { select: { nameEn: true } } } },
    },
  });

  const results = await Promise.all(
    woredas.map(async (w) => {
      const lat = w.centerLat || 8.54;
      const lng = w.centerLng || 39.27;
      let planetary;
      try {
        planetary = await earthEngineConnector.fetchPlanetaryMetrics({ lat, lng, level: 'WOREDA' });
      } catch (_e) {
        planetary = { sentinel2Ndvi: 0.55, soilMoisturePct: 45, normalizedDifferenceWaterIndex: 0.12 };
      }

      const ndvi = planetary.sentinel2Ndvi ?? 0.5;
      const ndwi = planetary.normalizedDifferenceWaterIndex ?? 0.1;

      let vegetationCondition = 'Normal vegetative canopy';
      let grazingPressure = 'MODERATE';
      let recommendedMove = 'Standard rotational grazing';
      let droughtStress = false;

      if (ndvi < 0.35) {
        vegetationCondition = 'Severe arid rangeland';
        grazingPressure = 'CRITICAL';
        recommendedMove = 'Supplemental feed distribution or migration recommended';
        droughtStress = true;
      } else if (ndvi < 0.5) {
        vegetationCondition = 'Drier than normal';
        grazingPressure = 'HIGH';
        recommendedMove = 'Monitor forage depletion; rotate herds to lowland reserves';
        droughtStress = true;
      } else if (ndvi >= 0.7) {
        vegetationCondition = 'Lush optimal pasture';
        grazingPressure = 'LOW';
        recommendedMove = 'Ideal grazing carrying capacity (4-6 TLU/ha)';
        droughtStress = false;
      }

      let waterAvailability = 'Moderate / Seasonal streams';
      if (ndwi > 0.15) {
        waterAvailability = 'Abundant / Surface water present';
      } else if (ndwi < 0.0) {
        waterAvailability = 'Scarce / Boreholes only';
      }

      const zoneName = w.zone?.nameEn ? ` (${w.zone.nameEn})` : '';

      return {
        woredaId: w.id,
        woredaName: `${w.nameEn}${zoneName}`,
        woredaNameAm: w.nameAm,
        biomassIndex: Math.round(ndvi * 100) / 100,
        vegetationCondition,
        waterAvailability,
        droughtStress,
        grazingPressure,
        recommendedMove,
        coordinates: { lat, lng },
      };
    })
  );

  return results;
}

async function getHealthStats({ woredaId } = {}) {
  const outbreaks = await getOutbreaks({ woredaId, status: 'ALL' });
  const campaigns = await getVaccinationCampaigns({ woredaId });
  const activeOutbreaksCount = outbreaks.filter((o) => o.status === 'ACTIVE').length;
  const criticalCasesCount = outbreaks.filter((o) => ['HIGH', 'CRITICAL'].includes(o.severity?.toUpperCase())).length;
  const totalAffectedLivestock = outbreaks.reduce((acc, o) => acc + (o.suspectedCases || 0), 0);
  const totalVaccinatedCount = campaigns.reduce((acc, c) => acc + (c.vaccinatedCount || 0), 0);

  const pastureMonitoring = await getPastureMonitoring({ woredaId });
  const avgBiomass = pastureMonitoring.length > 0
    ? Math.round((pastureMonitoring.reduce((sum, p) => sum + (p.biomassIndex || 0.5), 0) / pastureMonitoring.length) * 100) / 100
    : 0.55;

  return {
    activeOutbreaksCount,
    criticalCasesCount,
    totalAffectedLivestock,
    activeVaccinationCampaignsCount: campaigns.filter((c) => c.status === 'IN_PROGRESS').length,
    totalVaccinatedCount,
    pastureConditionIndex: avgBiomass,
    overallRiskLevel: criticalCasesCount > 2 ? 'CRITICAL' : (activeOutbreaksCount > 2 ? 'HIGH' : (activeOutbreaksCount > 0 ? 'MODERATE' : 'LOW')),
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = {
  // Disease Reference
  getAllDiseases,
  getDiseaseDetails,
  // Outbreak Tracking
  reportOutbreak,
  getOutbreaks,
  getOutbreakById,
  // Livestock Registry
  registerLivestock,
  getLivestockByWoreda,
  // Vaccination
  recordVaccination,
  getVaccinationStatus,
  getVaccinationCampaigns,
  createVaccinationCampaign,
  // Pasture & Forage
  getPastureCondition,
  getPastureMonitoring,
  // Risk & Stats
  getAnimalHealthRiskAssessment,
  getHealthStats,
  // Calendar
  getUpcomingVetTasks,
};
