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

## 🌍 1. Agronomic Context & Computational Challenges

Over 80% of Ethiopia's population depends on rainfed subsistence agriculture. Across the nation's 1,000+ administrative Woredas, agricultural yields and rural livelihoods face compound environmental threats:
* **Highland Soil Depletion**: Highlands experience severe soil erosion between **42 and 130+ metric tons/ha/year**, washing away vital topsoil nutrients and costing the economy **$1.06 Billion annually**.
* **Seismic Tectonic Faults**: The Main Ethiopian Rift (MER) and Wonji Fault Belt host active seismicity ($M \ge 3.5$), threatening earthen irrigation dams and vulnerable rural canal infrastructure.
* **Complex Data Ingestion**: Satellite remote sensing rasters, river discharge telemetry, localized weather stations, and in-situ IoT capacitive soil sensors generate heterogeneous data formats requiring real-time spatio-temporal indexing in PostGIS.

The **EthioFarm Backend** addresses these challenges through a sovereign, high-throughput geospatial computation and early-warning delivery engine.

---

## 💡 2. Scientific & Engineering Architecture

```text
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

## 🏛️ 4. 7-Tier Agricultural Governance Model (RBAC / PBAC)

The backend enforces strict Role-Based and Permission-Based Access Control aligned with the Ethiopian Ministry of Agriculture:

1. **Smallholder Farmer (`FARMER`)**: Own plot boundaries, IoT soil moisture telemetry, AI crop disease scanning, hyper-local weather, bilingual voice inquiry (Amharic, Afaan Oromoo, Tigrinya, Somali, English), and Kebele emergency hazard alerts.
2. **Development Agent (`DEVELOPMENT_AGENT`)**: Kebele FTC extension operations hub, farmer registration, field deficiency/pest reference, livestock disease surveillance, and farmer diagnosis escalation reviews.
3. **Woreda Officer (`WOREDA_OFFICER`)**: Woreda agricultural command center, agro-meteorological forecasts, emergency alert creation & push dispatch, woreda composite risk scoring, and subordinate role approvals.
4. **Zonal Officer (`ZONAL_OFFICER`)**: Multi-woreda operations overview, zonal boundary GIS administration, Horn of Africa earthquake seismic assessments, and drought monitoring.
5. **Regional Officer (`REGIONAL_OFFICER`)**: Macro-regional operations center, regional crop yield analytics, regional woredas status overview, and regional broadcast authority.
6. **Agronomy Researcher (`RESEARCHER`)**: Research analytics center, statistical summaries, environmental temporal trends, agronomic advisories meta-analysis, and unrestricted national read coverage.
7. **National Administrator (`ADMIN`)**: National operations command, platform telemetry, user directory & RBAC management, enterprise audit logging, and role upgrade approvals.

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
