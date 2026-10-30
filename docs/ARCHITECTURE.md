# EthioFarm Enterprise Backend Architecture Specification & Technical Blueprint

> **Version:** 2.4.0-Production Enterprise  
> **Target Geography:** Federal Democratic Republic of Ethiopia (Regional, Zonal, Woreda, Kebele administrative hierarchy)  
> **Platform Classification:** Sovereign Multi-Hazard Agricultural Early Warning & Planetary Intelligence Engine  
> **Author & System Architect:** Abraham Amogne (`CTC-329-26`)

---

## 1. Executive System Overview & Architectural Topology

EthioFarm Backend is an enterprise-grade, distributed, event-driven computing engine engineered to deliver hyper-local agro-meteorological advisories, multi-satellite remote sensing analytics, geotechnical risk forecasting, multimodal plant pathology diagnostics, and multi-channel disaster alert broadcasting across Ethiopia's agro-ecological zones (*Wurch, Dega, Weina Dega, Kolla, and Bereha*).

### 1.1 High-Level Enterprise Topology & Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT PRESENTATION TIER                        │
│  Flutter Mobile/Web (Riverpod 2.x + GoRouter + Hive + Google Maps)     │
│  Enterprise Web Portal (React 19 + TypeScript + Vite + Responsive Shell)│
│  USSD Gateway (*212# for 2G Feature Phones) | Admin Telemetry Console  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTPS / WSS / REST / Multipart
┌──────────────────────────────────▼─────────────────────────────────────┐
│                       GATEWAY & SECURITY LAYER                         │
│  Nginx Reverse Proxy | Express 4.x Middleware | Helmet | CORS          │
│  Rate Limiting (Tiered: Public 10/m, Telemetry 120/m, IoT 600/m)       │
│  JWT Bearer & TOTP MFA Validation | Redis Blacklist Revocation         │
│  7-Tier Geographic RBAC & Permission-Based (PBAC) Access Controller    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                    CORE DOMAIN SERVICES & PIPELINES                    │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ Auth & PBAC Engine   │ │ Farm & GeoJSON GIS   │ │ Weather Engine   │ │
│ ├──────────────────────┤ ├──────────────────────┤ ├──────────────────┤ │
│ │ Gemini Multimodal AI │ │ Satellite EO Engine  │ │ IoT Sensor Hub   │ │
│ ├──────────────────────┤ ├──────────────────────┤ ├──────────────────┤ │
│ │ Multi-Hazard Engine  │ │ Animal Health System │ │ IPM & Protection │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────┘ │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                 DATA PERSISTENCE & ANALYTIC ENGINES                    │
│  PostgreSQL 15+ with PostGIS Spatial Extensions (Prisma ORM Client)    │
│  Redis In-Memory Key-Value Cache & Pub/Sub (Socket.IO message bus)     │
│  External Ingestion APIs: GEE, NASA POWER, CHIRPS, GloFAS, SoilGrids   │
│  AI Engine: Google Gemini AI Studio 4-Key Pool (gemini-3.5-flash-lite) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication, RBAC & PBAC Security Architecture

### 2.1 7-Tier Administrative Governance Hierarchy
The platform enforces a strict administrative access model mapped directly to the Ethiopian agricultural governance structure:

1. **Smallholder Farmer (`FARMER`)**: Owns personal farm parcels, views hyper-local weather, inspects in-situ IoT soil probe telemetry, runs crop pathology disease scans, interacts with bilingual voice assistant, and receives localized SMS/USSD alerts.
2. **Development Agent (`DEVELOPMENT_AGENT` / DA)**: Agricultural extension specialist operating at the Kebele Farmers Training Center (FTC). Onboards local farmers, conducts field disease verifications, manages field nutrient deficiencies, and monitors livestock disease alerts.
3. **Woreda Officer (`WOREDA_OFFICER`)**: Agricultural desk officer at the Woreda administrative center. Monitors aggregate crop yield forecasts, analyzes composite risk scoring, approves subordinate role registrations, and authorizes emergency early warning bulletins.
4. **Zonal Officer (`ZONAL_OFFICER`)**: Cross-woreda emergency coordinator. Monitors regional tectonic fault lines along the Main Ethiopian Rift, assesses inter-woreda drought corridors, and coordinates relief mobilization.
5. **Regional Officer (`REGIONAL_OFFICER`)**: Macro-regional administrator (e.g., Oromia, Amhara, Tigray, Sidama). Broadcasts regional emergency notifications, coordinates seed distribution logistics, and evaluates multi-basin flood indices.
6. **Agronomy Researcher (`RESEARCHER`)**: Academic and scientific analyst. Accesses anonymized temporal environmental trends, high-resolution GeoTIFF satellite layers, RUSLE soil erosion coefficients, and Joyner-Boore seismological attenuation curves.
7. **National Administrator (`ADMIN`)**: Platform executive controller. Manages user identities, reviews role escalation requests, inspects enterprise audit logs, orchestrates API key pools, and monitors infrastructure telemetry.

### 2.2 Dual RBAC + PBAC Interception Model
Access control evaluates two sequential gates:
- **Role Seniority Gate (`roleCheck` middleware)**: Verifies that the bearer token satisfies minimum hierarchical seniority.
- **Permission & Geographic Scope Gate (`permissionCheck` middleware)**: Evaluates fine-grained resource rules (`resource:action:scope`):
  - `OWN`: Enforces `userId === token.sub`.
  - `WOREDA`: Scoped strictly to entities matching `user.woredaId`.
  - `ZONE`: Scoped to all woredas within the assigned zonal boundary.
  - `REGION`: Macro-regional authority spanning all zones within the region.
  - `NATIONAL`: Unrestricted national territory.

### 2.3 Cryptography, Session & MFA
- **Password Hashing**: `bcryptjs` utilizing salt rounds = 12.
- **JWT Architecture**: HMAC-SHA256 signed access tokens with 1-hour expiration; rotating refresh tokens persisted in HTTP-only secure cookies with cryptographic fingerprinting.
- **MFA / TOTP**: RFC 6238 compliant Time-Based One-Time Passwords compatible with standard authenticator applications.
- **Brute-Force Protection**: IP and identifier tracking in `LoginAttempt`; 5 consecutive failed attempts trigger an automated 15-minute account lockout.

---

## 3. Geographic Information Systems (GIS) & Farm Parcel Management

### 3.1 Spatial Polygon Topology
- Farm plots are represented using standard GeoJSON `Polygon` and `MultiPolygon` geometries stored in PostgreSQL `Json` columns indexed via PostGIS GIST spatial indices.
- **Bounding Box Validation**: Validates all coordinate points strictly within Ethiopian sovereign territory:
  $$\Lambda_{\text{Ethiopia}} = [3.2^\circ\text{N} \le \text{lat} \le 15.2^\circ\text{N},\; 32.8^\circ\text{E} \le \text{lng} \le 48.2^\circ\text{E}]$$
- **Spherical Centroid Computation**: Computes geographic centroid $(\lambda_c, \phi_c)$ from coordinates array for point-in-polygon queries:
  $$\phi_c = \frac{1}{N}\sum_{i=1}^{N} \phi_i, \quad \lambda_c = \frac{1}{N}\sum_{i=1}^{N} \lambda_i$$
- **Geodesic Area Calculation**: Implements Haversine spherical polygon area formulas to compute plot area in Hectares without third-party proprietary GIS services.
- **Topological Integrity**: Validates vertex boundaries to prevent self-intersection and enforces closed rings ($\mathbf{p}_0 = \mathbf{p}_n$).

---

## 4. Scientific Multi-Hazard Early Warning & Processing Engines

EthioFarm integrates specialized analytical algorithms executed on scheduled ingestion batches and real-time triggers:

### 4.1 Meteorological Drought Engine: Standardized Precipitation Index (SPI)
- Computes **SPI-30** (short-term agricultural moisture stress) and **SPI-90** (seasonal hydrological drought).
- Ingests precipitation time-series from CHIRPS (Climate Hazards Group InfraRed Precipitation with Station data) and NASA POWER.
- Fits rainfall data to a two-parameter Gamma distribution $\Gamma(\alpha, \beta)$ and transforms cumulative probability into standard normal distribution quantiles $Z \sim \mathcal{N}(0, 1)$:
  - $\text{SPI} \ge 2.0$: Extremely Wet
  - $-0.99 \le \text{SPI} \le 0.99$: Near Normal
  - $-1.00 \ge \text{SPI} > -1.49$: Moderately Dry
  - $-1.50 \ge \text{SPI} > -1.99$: Severely Dry
  - $\text{SPI} \le -2.00$: Extremely Dry (triggers automated Emergency Drought Alert)

### 4.2 Soil Degradation & Erosion Engine: RUSLE Model
Calculates potential annual soil loss $A$ (metric tons/hectare/year) via the Revised Universal Soil Loss Equation:
$$A = R \times K \times LS \times C \times P$$
- **$R$ (Rainfall Erosivity Factor)**: Derived from monthly and annual precipitation intensity indices ($MJ \cdot mm \cdot ha^{-1} \cdot h^{-1} \cdot yr^{-1}$).
- **$K$ (Soil Erodibility Factor)**: Derived from ISRIC SoilGrids textural fractions (clay, sand, silt, and soil organic carbon percentage).
- **$LS$ (Slope Length & Steepness Factor)**: Derived from SRTM 30m Digital Elevation Models (DEM) via `openElevationConnector`.
- **$C$ (Cover Management Factor)**: Dynamically calibrated against Sentinel-2 NDVI canopy density.
- **$P$ (Support Practice Factor)**: Terracing, contouring, or stone bunding adoption verified through field reports.
- **Agricultural Lime (ኖራ) Prescription Calculator**: Recommends CaCO3 application rates (quintals/hectare) based on measured `soilPh` values below 5.5 to mitigate aluminum toxicity in acidic highlands:
  $$\text{Lime}_{\text{Qt/ha}} = \max\left(0, (5.8 - \text{soilPh}) \times 15.0\right)$$

### 4.3 Seismology & Tectonic Rift Hazard Engine
- Ethiopia spans the Main Ethiopian Rift (MER) and the Afar Triple Junction.
- Ingests USGS real-time seismic feeds filtering Horn of Africa bounding polygons.
- Calculates Joyner-Boore Peak Ground Acceleration (PGA in $g$) and seismic intensity attenuation:
  $$\ln(\text{PGA}) = c_1 + c_2 M - c_3 \ln(r) - c_4 r$$
  where $M$ is moment magnitude, $r = \sqrt{d^2 + h^2}$, $d$ is epicentral distance, and $h$ is focal depth.
- Cross-references dam infrastructure, agricultural irrigation canals, and high-density settlements within critical shaking radius ($PGA > 0.15g$).

### 4.4 Landslide Susceptibility & Geotechnical Stability
- Evaluates geotechnical Factor of Safety ($FS$) on steep highland slopes:
  $$FS = \frac{c' + (\gamma z - \gamma_w h_w) \cos^2 \beta \tan \phi'}{\gamma z \sin \beta \cos \beta}$$
- Ingests Sentinel-1 Synthetic Aperture Radar (SAR) backscatter to measure pore-water pressure and soil saturation in highland escarpments (Wolaita, Gamo, Blue Nile Gorge).

### 4.5 Flash Flood & River Basin Discharge Engine
- Ingests Copernicus GloFAS (Global Flood Awareness System) forecast discharge grids ($m^3/s$).
- Compares predicted discharge against statistical historical return periods ($Q_2, Q_5, Q_{20}$).
- Combines 24-hour antecedent rainfall with runoff curve numbers (NRCS-CN) to flag flash flood risks for riverine agricultural plots.

### 4.6 Desert Locust & Biological Hazard Tracking
- Ingests FAO Locust Hub real-time observation and hopper band tracking.
- Combines ECMWF 10m wind direction vectors and green vegetation flushes (Sentinel-2 NDVI > 0.3) to simulate swarm trajectory and breeding suitability zones across the Somali and Afar lowlands.

---

## 5. Earth Observation & Satellite Remote Sensing Ingestion

The platform features an automated ingestion service interfacing with satellite constellations:
- **Sentinel-2 Multi-Spectral Instrument (MSI)**: 10-meter spatial resolution optical imagery computing:
  - $\text{NDVI} = \frac{\text{B8} - \text{B4}}{\text{B8} + \text{B4}}$ (Normalized Difference Vegetation Index — canopy vigor)
  - $\text{NDWI} = \frac{\text{B8} - \text{B11}}{\text{B8} + \text{B11}}$ (Normalized Difference Water Index — crop moisture content)
  - $\text{EVI} = 2.5 \times \frac{\text{B8} - \text{B4}}{\text{B8} + 6 \times \text{B4} - 7.5 \times \text{B2} + 1}$ (Enhanced Vegetation Index)
- **Sentinel-1 SAR C-Band Radar**: Microwave cloud-penetrating dielectric permittivity, volumetric soil moisture saturation ($\theta_v$), and Radar Vegetation Index ($RVI$).
- **Landsat 8/9 Thermal Infrared**: Split-window Land Surface Temperature ($LST$) and Crop Water Stress Index ($CWSI$).
- **MODIS / VIIRS FIRMS**: Thermal radiative power ($FRP$) tracking for agricultural burning and volcanic centers.
- **ISRIC SoilGrids 250m**: Global gridded soil information system providing soil pH, organic carbon density, cation exchange capacity, and textural composition.
- **OpenWeatherMap & Open-Meteo**: 7-day hourly hyper-local forecasts and agro-meteorological variables (evapotranspiration $ET_0$, solar radiation $MJ/m^2$, vapor pressure deficit $VPD$).

---

## 6. Artificial Intelligence & Multimodal Reasoning Infrastructure

### 6.1 Google Gemini AI Studio 4-Key Pool (`geminiClient.js`)
To ensure high availability, zero latency bottlenecks, and zero API disruption:
1. **Google Gemini AI Studio 4-Key Pool**: Distributed key pool (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, `GEMINI_API_KEY_4`) providing 6,000 free requests/day with automated round-robin rotation, exponential backoff, and temporary 60-second rate-limit quarantine upon HTTP 429.
2. **Model Selection**: Primary engine defaults to `gemini-3.5-flash-lite`, with automatic fallback to `gemini-3.8-flash` and `gemini-flash-lite-latest`.
3. **Fast Server-Sent Events (SSE) Streaming**: Supports real-time text streaming via `streamGenerateContent?alt=sse` for conversational agro-voice queries and immediate UI response.
4. **Groq LPU Fallback**: Ultra-low-latency backup inference for real-time voice and conversational queries.

### 6.2 Multimodal Crop Pathology Diagnosis
- **Pipeline**: Leaf Image Capture $\to$ Client-side resizing (<1MB) $\to$ Multipart/form-data upload $\to$ Google Gemini Multimodal Vision API.
- **Structured Response Generation**: Output schema enforces strict JSON:
  - `cropIdentified`: Botanical and common crop name.
  - `diseaseName`: Accurate phytopathological diagnosis.
  - `pathogen`: Causative agent (*fungus, bacterium, virus, or nutrient deficiency*).
  - `confidenceScore`: Float ($0.0 - 1.0$).
  - `severity`: Classification (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`).
  - `symptoms`: Trilingual description (English, Amharic, Afaan Oromoo).
  - `treatment`: Practical Integrated Pest Management (IPM) instructions, separating organic biological interventions from specific active chemical fungicides/insecticides.
  - `prevention`: Cultural farming practices for future crop cycles.

### 6.3 Bilingual Agro-Climatic Voice Assistant
- Combines speech-to-text, LLM context grounding with local Woreda microclimate & soil parameters, and text-to-speech synthesis.
- Supports conversational agronomic advice in Amharic, Afaan Oromoo, and English with phonetic transliteration handling.

---

## 7. IoT Telemetry & Precision Sensor Hub

### 7.1 Ingestion Protocols
- **Hardware Integration**: Supports ESP32, Arduino, and LoRaWAN gateways transmitting via HTTP POST or MQTT broker.
- **Hardware Authentication**: Every registered hardware node possesses an immutable `hardwareId` and an encrypted `secretToken`.

### 7.2 Telemetry Variables & Anomaly Detection
Sensors transmit continuous time-series records:
- `soilMoisture` (Volumetric Water Content %): Evaluated against soil field capacity ($FC$) and permanent wilting point ($PWP$).
- `soilTemp` and `ambientTemp` ($^\circ C$): Frost warnings ($< 2^\circ C$) or heat stress warnings ($> 35^\circ C$).
- `humidity` (% RH): Combined with leaf wetness to predict fungal spore germination.
- `rainfallMm`: Local tipping bucket precipitation accumulation.
- `batteryLevel` (%): Power supply health monitoring.

---

## 8. Animal Health & Veterinary Disease Surveillance

Recognizing the pastoral and agro-pastoral economies of Ethiopia, the platform incorporates a veterinary subsystem:
- **`LivestockHerd`**: Registry tracking cattle, sheep, goats, poultry, camels, and equines by Woreda, breed, and health status.
- **`AnimalDiseaseOutbreak`**: Real-time epidemiological reporting tracking confirmed/suspected cases, mortality, and containment status for priority diseases:
  - Foot-and-Mouth Disease (FMD)
  - Peste des Petits Ruminants (PPR)
  - Contagious Bovine Pleuropneumonia (CBPP)
  - Anthrax & Blackleg
  - Newcastle Disease
- **`VaccinationCampaign` & `VaccinationRecord`**: Tracks prophylactic immunization coverage percentages across woredas.

---

## 9. Omnichannel Alert Delivery & Communications Engine

Alerts triggered by multi-hazard indices or broadcast by agricultural officers are distributed through 5 delivery channels:
1. **Push Notifications**: Firebase Cloud Messaging (FCM) dispatched to mobile devices with custom sound and high-priority notification channels.
2. **WebSockets (Socket.IO)**: Low-latency state broadcast to active web dashboards, maps, and command centers.
3. **SMS Gateway**: Integration with Twilio, Africa's Talking, and SMSEthiopia for critical bulletins delivered to non-smartphones in remote kebeles.
4. **SMS Character Budgeter**: Real-time detection of GSM 7-bit (160 characters) vs. UCS-2 Unicode (70 characters for Ethiopic Fidel scripts) with optimal segmenting.
5. **Interactive USSD Gateway (`*212#`)**:
   - 6-tier USSD navigation menu: Weather, Soil Moisture, Crop Health, Pest Alerts, Relief Aid, Agent Escalation.
   - Session-managed state machine supporting 2G feature phones without internet connectivity.
6. **SMTP / Email**: Daily summary bulletins and scientific anomaly reports dispatched to researchers and NGO partners.

---

## 10. Deployment, DevOps & Infrastructure Resilience

- **Containerization**: Multi-stage `Dockerfile` creating minimal, secure Linux Alpine containers.
- **Production Host**: Deployed on Render (`render.yaml`) with automated secret injection, health check probes, and build commands.
- **Database Engine**: PostgreSQL 15 with PostGIS enabled on Supabase / Neon with connection pooling via PgBouncer.
- **Health Checks & Telemetry**: `/health/liveness`, `/health/readiness`, `/api/v1/health`, and `/api/v1/admin/health/keys` endpoints monitoring DB latency, memory footprint, key pool health, and external API uptime.

---

## 11. Testing & Quality Verification Gates

The backend maintains strict enterprise testing standards:
- **Jest Unit & Integration Test Suite**: 34 test suites, 220 automated unit and integration tests covering security, controllers, hazard mathematics, and database models (`npm test`).
- **End-to-End Role Verification**: 34 checks spanning all 7 roles verifying RBAC/PBAC scoping and API contracts (`node scripts/audit_roles_e2e.js`).
- **Live Key Verification Probe**: Live validation script ensuring all external keys and pools are functional (`node scripts/verify_all_api_keys.js`).
