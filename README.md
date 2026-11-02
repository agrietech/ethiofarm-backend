# EthioFarm Backend Engine

**Sovereign Multi-Hazard Agricultural Early Warning & Planetary Intelligence Engine for Ethiopia**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20LTS-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%20%2B%20PostGIS-4169E1?logo=postgresql)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?logo=prisma)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis-Upstash%20Distributed%20Cache-DC382D?logo=redis)](https://redis.io)
[![ESLint](https://img.shields.io/badge/ESLint-0%20Errors%20%7C%200%20Warnings-4B32C3?logo=eslint)](package.json)
[![Jest](https://img.shields.io/badge/Jest-34%20Suites%20%7C%20220%20Tests%20Passed-C21325?logo=jest)](package.json)
[![Smoke](https://img.shields.io/badge/Smoke%20Tests-19%2F19%20Passed%20(100%25)-22C55E)](scripts/smoke_test_services.js)

---

## 🌍 1. The National Challenge & Systems Rationale: Why Smart Farming in Ethiopia?

In Ethiopia, precision agriculture and digital early warning are not speculative technology luxuries; they represent an **existential economic, environmental, and food security necessity**:

### 1. The Macroeconomic Anchor & Structural Smallholder Vulnerability
* Over **80% of Ethiopia's population** (~120M citizens) directly depends on rainfed subsistence agriculture.
* Agriculture drives **33% of national GDP** and generates over **75% of total foreign exchange earnings** (anchored by Arabica Coffee, Sesame, Oilseeds, and Pulses).
* **18+ Million Smallholder Farming Households** cultivate fragmented parcels averaging less than **0.9 hectares**. At this micro-scale, individual households have zero financial resilience against crop failures, sudden floods, or pest incursions.

### 2. The Ground Observation Deficit & Planetary Remote Sensing
* Physical Automatic Weather Stations (AWS) in Ethiopia are critically sparse, averaging less than **1 operational ground station per $5,000\text{ km}^2$**.
* The **EthioFarm Backend** bridges this physical data void by ingesting planetary satellite constellations (Sentinel-2 MSI, Sentinel-1 SAR, Landsat 8/9, and CHIRPS precipitation grids) via Google Earth Engine (GEE), converting raw spectral rasters into real-time PostGIS spatio-temporal indices.

### 3. Catastrophic Highland Soil Erosion & Soil Acidity ($pH < 5.2$)
* Arable highland soils erode at severe rates of **42 to 130+ metric tons/ha/year**, washing away vital macronutrients ($N, P, K$) and inflicting an estimated **$1.06 Billion annual economic loss**.
* Over **43% of arable soils** (notably Dystric Nitisols in western/northwestern regions) suffer from extreme soil acidity ($pH < 5.2$), mobilizing toxic aluminum ($Al^{3+}$) ions and fixing bioavailable phosphorus. The backend implements programmatic **RUSLE modeling** and calculates precise **Agricultural Lime (ኖራ) dosages** in $\text{Qt/ha}$ to neutralize toxicity and restore yield potential.

### 4. Tectonic Fault Seismology & River Basin Hydrology
* The Main Ethiopian Rift (MER) and Wonji Fault Belt host active seismicity ($M \ge 3.5$), creating ground fissures and threatening critical earth-fill irrigation dams (e.g., Koka, Tendaho, Kesem).
* The backend executes automated **Joyner-Boore Peak Ground Acceleration ($PGA$)** calculations and ingests **Copernicus GloFAS river discharge** models ($m^3/s$) to deliver anticipatory alerts before flood surges and structural dam failures occur.

### 5. The Last-Mile 2G Telecommunication Reality
* Over **70% of smallholders** operate in 2G/EDGE network zones with basic feature phones. The backend pairs high-throughput REST/WebSocket APIs with an asynchronous **USSD `*212#` session engine**, **UCS-2 vs. GSM-7 character-budgeted SMS broadcasting**, and **bilingual voice synthesis**.

---

## 💡 2. Scientific & Engineering Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          API Gateway & Ingestion                       │
│      (Express 4, Helmet, Tiered Rate Limiter, CORS, Compression)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│         Decentralized Geographic RBAC & Boundary Scoping Engine        │
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
│  │ IoT Sensor Ingestion    │  │ Multimodal AI Agronomy (Gemini)     │  │
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

### Core Computational Pipelines:
1. **Planetary Remote Sensing & Google Earth Engine (GEE)**:
   - **Sentinel-2 MSI**: Computes Normalized Difference Vegetation Index ($NDVI$), Red-Edge ($NDRE$), Enhanced Vegetation Index ($EVI$), Soil-Adjusted ($SAVI$), and Normalized Difference Water Index ($NDWI$).
   - **Sentinel-1 SAR C-Band Radar**: Microwave cloud-penetrating radar dielectric permittivity, volumetric soil moisture saturation ($\theta_v$), and Radar Vegetation Index ($RVI$).
   - **Landsat 8/9 Thermal Infrared**: Split-window Land Surface Temperature ($LST$) and Crop Water Stress Index ($CWSI$).
   - **SRTM 30m DEM**: Topographic Wetness Index ($TWI$) and slope percentage equations.
2. **Geotechnical Hazards & Seismology Engine**:
   - Ingests live USGS earthquake catalogues ($M \ge 2.5$).
   - Models the Main Ethiopian Rift (MER) fault segments: *Wonji Fault Belt (WFB), Afar Mega-Rift, Ankober Escarpment, and Ambo Fault*.
   - Calculates Joyner-Boore Peak Ground Acceleration ($PGA$) and Modified Mercalli Intensity ($MMI$) to trigger automated structural dam tension alarms.
3. **RUSLE Soil Degradation & Land Loss Engine**:
   - Computes annual soil loss $A = R \times K \times LS \times C \times P$ ($\text{t/ha/yr}$) calibrated across 16 Ethiopian soil classification profiles.
   - Evaluates Soil Organic Carbon (SOC) depletion rates and macronutrient ($N, P, K$) leaching risks.
   - Issues Agricultural Lime (ኖራ) application prescriptions in $\text{Qt/ha}$ for acidic Dystric Nitisols ($pH < 5.2$).
4. **Hydrological River Discharge (Copernicus GloFAS)**:
   - Evaluates live discharge ($m^3/s$) across major Ethiopian river basins (Awash, Omo-Gibe, Abbay/Blue Nile) with return period flood warnings ($Q_2, Q_5, Q_{20}$).
5. **Multimodal AI Agronomy & Botanical Classification**:
   - 4-key pooled Google Gemini AI Studio engine providing bilingual (Amharic & English) diagnostic synthesis, backed by Pl@ntNet and Plant.id botanical classification APIs.
6. **Last-Mile Telecommunication Gateway**:
   - **Emergency SMS Broadcasting**: Integrated gateway with live character budgeting distinguishing GSM 7-bit (160 chars) from UCS-2 Unicode (70 chars) to optimize telecom transmission costs.
   - **USSD `*212#` Simulator Engine**: 6-tier interactive session handler for offline 2G feature phone access.
   - **Bilingual Voice Calls & Push Notifications**: Text-to-speech audio synthesis and FCM notification dispatch.

---

## 👥 3. Engineering Team Work Breakdown & Ownership

**Abraham Amogne** serves as the **Team Leader & Full-Stack System Architect**. Engineering deliverables and domain ownership across the backend platform are structured as follows:

| Engineer | Student ID | Formal Engineering Role | Assigned System Deliverables | Project Domain Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Abraham Amogne** | `CTC-329-26` | **Team Leader · System Architect** | System Architecture, Express API Gateway, PostgreSQL PostGIS schemas and migrations, 7-tier geographic RBAC middleware, Google Earth Engine satellite connector, USGS Joyner-Boore seismology engine, RUSLE soil loss equations, Master Multi-Hazard Composite Predictor, Socket.IO real-time alert gateway, and notification dispatch engines. | `agriEtech-backend`<br>`agriEtech-frontend`<br>`ethiofarm-web` |
| **Alen Biruk** | `CTC-2176-26` | **Web Platform Engineer** | Farm Operations & IoT Soil Sensor Fleet, OCHA HDX boundary GeoJSON indexing, farm polygon validation, and ground sensor telemetry. | `ethiofarm-web` (Farm Operations) |
| **Zinegnaw** | `CTC-514-26` | **Web Platform Engineer** | Crop AI Vision & Pathology, camera viewfinder capture, multipart botanical photo analysis, and plant disease triage services. | `ethiofarm-web` (Crop Pathology) |
| **Banchamlak Golla** | `CTC-2952-26` | **Web Platform Engineer** | Agro-Meteorology & Alerts, Open-Meteo weather telemetry caching, Copernicus GloFAS river discharge, and multi-hazard alert notifications. | `ethiofarm-web` (Weather & Hazards) |

---

## 🏛️ 4. Decentralized Agro-Institutional Governance Engine: Why Administrative Stratification is Mission-Critical

A critical architecture decision of the EthioFarm backend is the enforcement of **Geographic and Permission-Based Access Control (RBAC / PBAC)**. Rather than exposing flat CRUD endpoints, the backend strictly models the administrative hierarchy of the Ethiopian Ministry of Agriculture (MoA):

### Why Flat API Architectures Fail in National Agriculture:
1. **The Panic & Market Disruption Risk**: If an experimental machine learning model or uncalibrated seismic trigger broadcasts unverified alerts directly to 100,000 farmers, it causes market panic, hoarding, and premature crop liquidation. Hazard broadcasts require explicit administrative verification gates.
2. **Horizontal Data Leakage vs. Regional Autonomy**: A Woreda officer in East Gojjam must not alter boundary geometry or dispatch alerts to farmers in Borena, Oromia. The backend enforces strict database-level geographic scoping using PostGIS spatial bounding boxes (`ST_Contains`, `ST_Intersects`).
3. **Institutional Harmonization with 60,000+ Extension Workers**: Ethiopia's extension system relies on Development Agents stationed at Kebele Farmers Training Centers (FTCs). The backend empowers DAs to act as frontline verifiers of crop disease cases submitted by farmers before high-level alerts are escalated to district agronomists.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND RBAC & GEOGRAPHIC SCOPING PIPELINE                                      │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  [ FARMER ]               GET /api/v1/farms/my-plots · POST /api/v1/diagnosis/scan · USSD *212#
                           (Restricted strictly to owned farm plots, local weather, and Kebele SMS alerts)
       │
       ▼
  [ DEVELOPMENT_AGENT ]    GET /api/v1/kebele/farmers · POST /api/v1/kebele/verify-diagnosis
                           (Scoped to Kebele boundary; verifies field pests; registers farmer parcels)
       │
       ▼
  [ WOREDA_OFFICER ]       POST /api/v1/alerts/broadcast · GET /api/v1/woreda/composite-risk
                           (District command; calculates RUSLE lime quotas; triggers verified SMS broadcasts)
       │
       ▼
  [ ZONAL_OFFICER ]        GET /api/v1/zonal/river-basins · GET /api/v1/zonal/fault-buffers
                           (Multi-woreda spatial oversight; cross-basin flood and Wonji Rift monitoring)
       │
       ▼
  [ REGIONAL_OFFICER ]     GET /api/v1/regional/vci-trends · POST /api/v1/regional/emergency-decree
                           (Macro-regional food balance, satellite vegetation condition, aerial pest response)
       │
       ▼
  [ RESEARCHER & ADMIN ]   GET /api/v1/analytics/geotiff-export · POST /api/v1/admin/revoke-token
                           (Unrestricted spatial research access; cryptographic key management; audit logs)
```

### Backend Service-to-Role Architecture Matrix:

| Administrative Role | API Scope & Boundary Enforcement | Specialized Backend Services Consumed | Operational Impact |
| :--- | :--- | :--- | :--- |
| **`FARMER`** | Scoped strictly to `user_id` and owned plot PostGIS geometries. | In-situ Capacitive IoT Ingestion, Gemini Crop Vision API, USSD `*212#` Session Engine, Character-Budgeted SMS Dispatch. | Prevents data leakage; provides instant localized pest triage and offline moisture advice. |
| **`DEVELOPMENT_AGENT`** | Scoped to Kebele administrative boundary via PostGIS `ST_Contains`. | Parcel Onboarding Service, Diagnosis Verification Workbench, Communal Sensor Fleet Ingestion. | Accelerates farmer registration from days to minutes; filters out false-positive disease reports. |
| **`WOREDA_OFFICER`** | Scoped to Woreda boundary GeoJSON; authorization token required for broadcast. | Master Multi-Hazard Composite Predictor, Programmatic RUSLE Lime Engine, Woreda SMS Broadcast Gateway. | Eliminates blind input distribution; issues exact lime quotas (ኖራ) and dispatches vetted alerts. |
| **`ZONAL_OFFICER`** | Aggregates all constituent Woredas within the Zonal administrative polygon. | Copernicus GloFAS River Basin Hydrology, USGS Joyner-Boore Seismology Engine, Cross-Woreda Resource Allocator. | Enables cross-woreda logistics and early dam failure warning across the Wonji Rift and Awash basin. |
| **`REGIONAL_OFFICER`** | Regional state polygon scope with emergency decree authorization flags. | Planetary Satellite Connector (Sentinel-2 VCI, CHIRPS SPI-3), Macro-Regional Food Security Predictor. | Provides macro-level visibility to mobilize strategic food reserves and coordinate with EDRMC. |
| **`RESEARCHER`** | National read-only spatial coverage across all agro-ecological zones. | Raw Satellite Band Export API ($NDVI, NDRE, CWSI$), Longitudinal Sensor Telemetry Stream, Pest Epidemiological Registry. | Furnishes clean, ground-truth validated datasets for academic modeling and national policy. |
| **`ADMIN`** | Sovereign national administrator clearance with cryptographic audit logging. | Prisma Schema Migrations, Redis Session Revocation, Tiered Rate Limiter Configuration, IAM Audit Trail. | Safeguards national data sovereignty and platform uptime against unauthorized access. |

---

## 🛠️ 5. Quick Start & Installation

### Prerequisites
* Node.js 18+ LTS
* PostgreSQL 15+ with PostGIS extension enabled
* Redis instance (Upstash or local)

### Installation & Launch
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Generate Prisma client & sync schema
npx prisma generate
npx prisma db push

# 4. Seed reference administrative boundaries & crops
npm run seed
npm run load-boundaries

# 5. Launch development server
npm run dev
```

---

## 🛡️ 6. Production Quality Gates & Verification

```bash
# 1. Verify zero lint errors and zero warnings (ESLint)
npm run lint

# 2. Run automated full system service smoke tests
npm run test:smoke

# 3. Run complete Jest unit and integration test suite
npm test

# 4. Verify end-to-end 7-tier role scoping & PBAC permissions
npm run test:roles
```

### Verified Quality Metrics:
* **Static Analysis**: `npm run lint` -> **0 problems (0 errors, 0 warnings)**.
* **Jest Test Suite**: `npm test` -> **34/34 Test Suites Passed · 220/220 Tests Passed**.
* **System Smoke Tests**: `npm run test:smoke` -> **19/19 Checks Passed (100%)**.
* **Security & Auditing**: Strict rate limiting, Helmet HTTP headers, JWT revocation via Redis, parameterized SQL statements via Prisma ORM, and PostGIS geometry bounding validation.

---

## 📚 7. Compulsory Developer References

For technical specifications and API contracts, refer to the [**Backend Documentation Catalog**](docs/README.md):

* [**Architecture Blueprint**](docs/ARCHITECTURE.md) — Layered design, Redis caching, PostGIS geodatabase, GEE pipelines, Docker deployment, and testing quality gates.
* [**API Specification (REST & OpenAPI)**](docs/API_SPECIFICATION.md) — Exhaustive REST OpenAPI endpoints, query schemas, JSON request/response bodies, and error formats.
* [**IoT Firmware Repository**](firmware/README.md) — Embedded C++ sketch for ESP32/Arduino capacitive soil moisture and NPK sensor telemetry node.
