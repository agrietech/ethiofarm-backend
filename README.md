# EthioFarm Backend

**Multi-Hazard Agricultural Early Warning & Planetary Intelligence Engine for Ethiopia**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20LTS-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%20PostGIS-4169E1?logo=postgresql)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis-Upstash%20Cache-DC382D?logo=redis)](https://redis.io)
[![Alerts](https://img.shields.io/badge/Delivery-SMS%20%7C%20Voice%20%7C%20Push-008080)](docs/README.md)

---

## 🌟 Executive Overview

**EthioFarm Backend** is an enterprise-grade agricultural early warning and geospatial analytics engine built for the sovereign agricultural territory of Ethiopia. It unifies Google Earth Engine multi-satellite compute, real-time USGS seismology fault modeling, RUSLE soil degradation equations, IoT sensor fleet telemetry, and automated multi-channel delivery via SMS notifications, character budgeting, and FCM push notifications.

---

## 🚀 Key Engineering Pillars

1. **Planetary Remote Sensing & Google Earth Engine (GEE)**:
   - **Sentinel-2 MSI**: $NDVI$, $NDRE$, $EVI$, $SAVI$, $NDWI$, $MSI$ multispectral canopy vigor and moisture.
   - **Sentinel-1 SAR C-Band Radar**: Microwave cloud-penetrating dielectric permittivity, volumetric soil moisture saturation ($\theta_v$), and Radar Vegetation Index ($RVI$).
   - **Landsat 8/9 Thermal Infrared**: Split-window Land Surface Temperature ($LST$) and Crop Water Stress Index ($CWSI$).
   - **MODIS / VIIRS FIRMS**: Thermal radiative power ($FRP$) tracking for agricultural burning and volcanic centers.
   - **SRTM 30m DEM**: Elevation profiling, slope percentage, and Topographic Wetness Index ($TWI$).

2. **Geotechnical Hazards & Seismology Engine**:
   - Live USGS Earthquake catalogue ingestion ($M \ge 2.5$).
   - Main Ethiopian Rift (MER) fault modeling: *Wonji Fault Belt (WFB), Afar Mega-Rift, Ankober Escarpment, and Ambo Fault*.
   - Joyner-Boore Peak Ground Acceleration ($PGA$) and Modified Mercalli Intensity ($MMI$) calculation for earthen irrigation dam tension alerts.

3. **RUSLE Soil Degradation & Land Loss Engine**:
   - Annual soil loss $A = R \times K \times LS \times C \times P$ ($\text{t/ha/yr}$) calibrated across 16 Ethiopian soil classification profiles.
   - Soil Organic Carbon (SOC) depletion rates and macronutrient ($N, P, K$) leaching diagnostics.
   - Agricultural Lime (ኖራ) application prescriptions in $\text{Qt/ha}$ for acidic Dystric Nitisols ($pH < 5.2$).

4. **Last-Mile Delivery & Multilingual Communications**:
   - **Emergency SMS Broadcast**: High-delivery telecom-integrated engine dispatching weather forecasts, market prices, and pest emergency alerts.
   - **SMS Character Budgeter**: Live detection of GSM 7-bit (160 chars) vs. UCS-2 Unicode (70 chars) with Amharic and Afaan Oromoo templates.
   - **Multimodal AI Agronomy**: Gemini 2.5 Flash on OpenRouter for botanical disease triage (Teff rust, Coffee leaf rust) with offline fallback.

5. **7-Tier Agricultural Role-Based Access Control (RBAC)**:
   - Aligned with the Ethiopian Ministry of Agriculture governance structure:
     `FARMER` $\rightarrow$ `DEVELOPMENT_AGENT` $\rightarrow$ `WOREDA_OFFICER` $\rightarrow$ `ZONAL_OFFICER` $\rightarrow$ `REGIONAL_OFFICER` $\rightarrow$ `RESEARCHER` $\rightarrow$ `ADMIN`.
   - Geographic scoping middleware (`authorizeWoredaScope`, `authorizeRegionScope`).

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          API Gateway & Ingestion                       │
│      (Express 4, Helmet, Tiered Rate Limiter, CORS, Compression)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Authentication & Geographic RBAC                    │
│   (JWT Bearer, Redis Revocation, Woreda/Regional Boundary Scoping)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                     Core Business & Hazard Engines                     │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ GEE Planetary Connector │  │ USGS Real-Time Seismology Engine    │  │
│  ├─────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ RUSLE Soil Loss Engine  │  │ Multi-Hazard Predictor (6 Pillars)  │  │
│  ├─────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ IoT Sensor Ingestion    │  │ Multimodal AI Agronomy (OpenRouter) │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                 Multi-Channel Alert Dispatch Pipeline                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ USSD *212# State Engine │  │ SMS Character Budgeting (UCS2/GSM7) │  │
│  ├─────────────────────────┤  ├─────────────────────────────────────┤  │
│  │ FCM Push Notification   │  │ SMTP / Nodemailer Email Dispatcher  │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Data & Persistence Layer                         │
│   (PostgreSQL 15 + PostGIS, Prisma ORM, Upstash / Redis Cache)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Quick Start & Installation

### Prerequisites
- Node.js 18+ LTS
- PostgreSQL 15+ with PostGIS extension
- Upstash / Redis instance

### Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Initialize Prisma ORM
npx prisma generate
npx prisma db push

# 4. Start development server
npm run dev
```

### Running Test Verification Suites
```bash
# Multi-Satellite, Seismology & RUSLE Engine Suite
node scripts/test_earth_engine_disasters_seismology.js

# Expert Limitations, USSD *212# & Pathology Suite
node scripts/test_expert_limitations_fixes.js

# Jest Unit Test Suite
npm test
```

---

## 👥 Engineering Team Work Breakdown & Ownership

**Abraham Amogne** serves as the **Team Leader & Full-Stack System Architect**. Engineering deliverables and domain ownership across the platform are structured as follows:

| Engineer | Student ID | Formal Engineering Role | Assigned System Deliverables | Project Domain Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Abraham Amogne** | `CTC-329-26` | **Team Leader · System Architect** | System Architecture, Express API Gateway, PostgreSQL PostGIS schemas and migrations, 7-tier geographic RBAC middleware, Google Earth Engine satellite connector, USGS Joyner-Boore seismology engine, RUSLE soil loss equations, Master Multi-Hazard Composite Predictor, Socket.IO real-time alert gateway, and notification dispatch engines. | `agriEtech-backend`<br>`agriEtech-frontend`<br>`ethiofarm-web` |
| **Alen Biruk** | `CTC-2176-26` | **Web Platform Engineer** | Farm Operations & IoT Soil Sensor Fleet, OCHA HDX boundary GeoJSON indexing, farm polygon validation, and ground sensor telemetry. | `ethiofarm-web` (Farm Operations) |
| **Zinegnaw** | `CTC-514-26` | **Web Platform Engineer** | Crop AI Vision & Pathology, camera viewfinder capture, multipart botanical photo analysis, and plant disease triage services. | `ethiofarm-web` (Crop Pathology) |
| **Banchamlak Golla** | `CTC-2952-26` | **Web Platform Engineer** | Agro-Meteorology & Alerts, Open-Meteo weather telemetry caching, Copernicus GloFAS river discharge, and multi-hazard alert notifications. | `ethiofarm-web` (Weather & Hazards) |

---

## 📚 Compulsory Developer Documentation

For technical implementation blueprints and API contracts, refer to the [**Backend Documentation Catalog**](docs/README.md):

- [**Architecture Blueprint**](docs/ARCHITECTURE.md) — Layered design, Redis caching, PostGIS geodatabase, GEE pipelines, Docker deployment, and testing quality gates.
- [**API Specification (REST & OpenAPI)**](docs/API_SPECIFICATION.md) — Exhaustive REST OpenAPI endpoints, query schemas, JSON request/response bodies, and error formats.
- [**IoT Firmware Repository**](firmware/README.md) — Embedded C++ sketch for ESP32/Arduino capacitive soil moisture and NPK sensor telemetry node.

