# Processing Layer

Integrated multi-hazard risk processing algorithms, geotechnical modeling, and mathematical analytics.

## Core Processing Engines
- `spiCalculator.js`: Standardized Precipitation Index (SPI-1, SPI-3) for drought monitoring.
- `floodRiskEvaluator.js`: Hydrologic discharge return period thresholds ($Q_2, Q_5, Q_{20}, Q_{50}$) and flash flood risk.
- `vegetationStressAnalyzer.js`: Vegetation Condition Index (VCI) calculation from satellite NDVI.
- `locustZoneMatcher.js`: Geospatial swarm intersection with administrative boundaries.
- `seismologyHazardEngine.js`: Live USGS Horn of Africa earthquake ingestion, Joyner-Boore Peak Ground Acceleration ($PGA$), Wonji Rift fault buffer alerts, and irrigation dam tension warnings.
- `soilDegradationEngine.js`: Revised Universal Soil Loss Equation ($A = R \times K \times LS \times C \times P$), SOC loss, and Agricultural Lime (ኖራ) prescriptions.
- `naturalDisasterPredictor.js`: Multi-Hazard Natural Disaster Master Predictor synthesizing all 6 disaster pillars into $MHNDI$.
- `riskAggregator.js`: Integrated risk composite scoring and alert level mapping.
- `sensorSatelliteCalibrator.js`: In-situ probe and remote sensing calibration.
- `statistics.js`: Statistical helpers (mean, variance, Gamma distribution fitting).
- `periodAggregation.js`: Time-series data aggregation helpers.
