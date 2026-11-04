# EthioFarm Multi-Hazard Early Warning Platform - API Specification

**Version:** 1.0.0  
**Base URL:** `http://localhost:5000/api/v1` | **Production:** `https://ethiofarm.onrender.com/api/v1`  
**Format:** JSON (`Content-Type: application/json`)  
**Authentication:** HTTP Bearer Token (`Authorization: Bearer <jwt_token>`)

---

## Table of Contents

1. [Global Principles & Standards](#1-global-principles--standards)
2. [Authentication & User Management (`/auth`)](#2-authentication--user-management-auth)
3. [Administrative Boundaries (`/boundaries`)](#3-administrative-boundaries-boundaries)
4. [Farm Plot Registry (`/farms`)](#4-farm-plot-registry-farms)
5. [IoT Sensor Telemetry (`/sensors`)](#5-iot-sensor-telemetry-sensors)
6. [Satellite & Climate Observations (`/satellite-observations`)](#6-satellite--climate-observations-satellite-observations)
7. [Multi-Hazard Risk Assessments (`/risk-assessments`)](#7-multi-hazard-risk-assessments-risk-assessments)
8. [Early Warning Alerts (`/alerts`)](#8-early-warning-alerts-alerts)
9. [AI Crop Disease Diagnosis (`/disease-diagnosis`)](#9-ai-crop-disease-diagnosis-disease-diagnosis)
10. [Analytics & Agronomic Advisories (`/analytics`)](#10-analytics--agronomic-advisories-analytics)
11. [Location-Based Map & Analytics (`/analytics/location`)](#10a-location-based-map--analytics-analyticslocation)
12. [AI Voice & Multimodal Assistant (`/ai`)](#11-ai-voice--multimodal-assistant-ai)
13. [Data Ingestion Pipeline (`/ingestion`)](#12-data-ingestion-pipeline-ingestion)
14. [USSD Interactive Menu (`/delivery/ussd`)](#13-ussd-interactive-menu-deliveryussd)
15. [Admin & Audit Control (`/admin`)](#14-admin--audit-control-admin)
16. [WebSocket Real-Time Gateway](#15-websocket-real-time-gateway)
17. [Error Handling & Status Codes](#16-error-handling--status-codes)

---

## 1. Global Principles and Standards

### Response Format
All API endpoints return standard JSON envelopes:

#### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional descriptive string"
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Detailed error description",
    "details": []
  }
}
```

### Roles and RBAC Matrix
- `FARMER`: Farm registration, sensor telemetry view, alert subscription, disease diagnosis, USSD access.
- `DEVELOPMENT_AGENT`: Multi-farm advisory, woreda threat reporting, community alert dispatch.
- `WOREDA_OFFICER`: District risk assessment evaluation, emergency alert broadcast.
- `RESEARCHER`: High-resolution satellite download, climate dataset exports.
- `ADMIN`: Full system configuration, manual pipeline triggers, audit logs.

### Rate Limiting Limits
- **Global**: 100 requests per 15-minute window per IP.
- **Auth**: 5 requests per 15-minute window (login/register).
- **USSD**: 30 requests per minute per IP.
- **Telemetry**: 60 requests per minute per sensor ID.

---

## 2. Authentication and User Management

### 2.1 Register User
- **Method:** `POST /api/v1/auth/register`
- **Auth:** Public
- **Description:** Register a new user with email-first authentication. Email is required for login and verification. Phone number is optional for SMS notifications.
- **Request Body:**
  ```json
  {
    "email": "abebe@ethiofarm.et",
    "fullName": "Abebe Bikila",
    "password": "SecurePassword123!",
    "phoneNumber": "+251911223344",
    "role": "FARMER",
    "preferredLang": "am",
    "woredaId": "woreda_adama_01"
  }
  ```
  **Required Fields:**
  - `email` (string) - Valid email address (used for login)
  - `fullName` (string) - User's full name
  - `password` (string) - Minimum 6 characters
  
  **Optional Fields:**
  - `phoneNumber` (string) - E.164 format (e.g., +251911223344)
  - `role` (string) - FARMER (default), DEVELOPMENT_AGENT, WOREDA_OFFICER, ZONE_OFFICER, REGION_OFFICER, ADMIN
  - `preferredLang` (string) - 'en' (default) or 'am' (Amharic)
  - `woredaId` (string) - Woreda ID for location assignment

- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_78912",
        "email": "abebe@ethiofarm.et",
        "fullName": "Abebe Bikila",
        "phoneNumber": "+251911223344",
        "role": "FARMER",
        "isEmailVerified": false,
        "preferredLang": "am"
      },
      "token": "eyJhbGciOiJIUzI1NiIsIn...",
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "ref_9823471928374"
    }
  }
  ```
  **Notes:**
  - Verification email sent automatically to the provided email address
  - User receives JWT token immediately and can login
  - Some features may require email verification (check `isEmailVerified` status)

### 2.2 User Login
- **Method:** `POST /api/v1/auth/login`
- **Auth:** Public
- **Description:** Login with email and password. Returns JWT access token and refresh token.
- **Request Body:**
  ```json
  {
    "email": "abebe@ethiofarm.et",
    "password": "SecurePassword123!"
  }
  ```
  **Required Fields:**
  - `email` (string) - Registered email address
  - `password` (string) - User password
  
  **Alternative Fields (for backward compatibility):**
  - Can use `identifier` instead of `email`

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsIn...",
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "ref_9823471928374",
      "user": {
        "id": "usr_78912",
        "email": "abebe@ethiofarm.et",
        "fullName": "Abebe Bikila",
        "phoneNumber": "+251911223344",
        "role": "FARMER",
        "isEmailVerified": true,
        "preferredLang": "am"
      }
    }
  }
  ```
  **Notes:**
  - Email format is required (must contain '@')
  - JWT token expires in 24 hours (configurable via JWT_EXPIRES_IN)
  - Refresh token expires in 30 days
  - Use access token in `Authorization: Bearer <token>` header for authenticated requests

### 2.3 Refresh Access Token
- **Method:** `POST /api/v1/auth/refresh-token`
- **Auth:** Public
- **Request Body:** `{"refreshToken": "ref_9823471928374"}`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "ref_new_token"
    }
  }
  ```

### 2.4 Forgot Password
- **Method:** `POST /api/v1/auth/forgot-password`
- **Auth:** Public
- **Description:** Request a password reset email. A secure reset link is sent to the user's email.
- **Request Body:** `{"email": "abebe@ethiofarm.et"}`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Password reset email sent successfully"
  }
  ```
  **Notes:**
  - Reset link expires in 1 hour
  - Email contains a secure token and link to reset password page
  - For security, response is same even if email doesn't exist

### 2.5 Reset Password
- **Method:** `POST /api/v1/auth/reset-password`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "token": "reset_token_from_email",
    "newPassword": "NewSecurePass123!"
  }
  ```

### 2.6 Verify Email
- **Method:** `POST /api/v1/auth/verify-email` or `GET /api/v1/auth/verify-email?token=...&email=...`
- **Auth:** Public
- **Description:** Verify user's email address using the token from verification email. Supports both API calls and browser link clicks.
- **Request Body/Query:** `{"token": "verification_token_from_email"}`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "message": "Email verified successfully"
    }
  }
  ```
  **Browser GET Response:** HTML page with success/error message and auto-redirect to frontend
  
  **Notes:**
  - Token expires in 24 hours
  - After verification, user is redirected to FRONTEND_URL
  - Sets `isEmailVerified: true` in user profile

### 2.7 Resend Verification Email
- **Method:** `POST /api/v1/auth/resend-verification`
- **Auth:** Public
- **Description:** Resend email verification link if user didn't receive it or it expired.
- **Request Body:** `{"email": "abebe@ethiofarm.et"}`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "message": "Verification email sent successfully"
    }
  }
  ```
  **Notes:**
  - Generates a new verification token
  - Previous tokens are invalidated
  - Can be called multiple times if needed

### 2.8 Logout
- **Method:** `POST /api/v1/auth/logout`
- **Auth:** Bearer Token required
- **Description:** Blacklists current token to prevent reuse

### 2.9 Get Profile
- **Method:** `GET /api/v1/auth/me`
- **Auth:** Bearer Token required
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "usr_78912",
      "fullName": "Abebe Bikila",
      "phoneNumber": "+251911223344",
      "email": "farmer@ethiofarm.et",
      "role": "FARMER",
      "preferredLang": "am",
      "woreda": {
        "id": "woreda_adama_01",
        "nameEn": "Adama Zuria",
        "zone": {
          "nameEn": "Adama Special",
          "region": {
            "nameEn": "Oromia"
          }
        }
      }
    }
  }
  ```

### 2.10 Update Password
- **Method:** `PATCH /api/v1/auth/update-password`
- **Auth:** Bearer Token required
- **Request Body:**
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewSecurePass123!"
  }
  ```

### 2.11 Submit Role Upgrade Request
- **Method:** `POST /api/v1/auth/role-requests`
- **Auth:** Bearer Token required
- **Description:** Submit an application to upgrade from FARMER to professional field role (DEVELOPMENT_AGENT, WOREDA_OFFICER, or RESEARCHER). Requires staff credentials and organization affiliation.
- **Request Body:**
  ```json
  {
    "requestedRole": "DEVELOPMENT_AGENT",
    "regionId": "reg_oromia",
    "regionName": "Oromia",
    "zoneId": "zone_east_shewa",
    "zoneName": "East Shewa",
    "woredaId": "woreda_adama_01",
    "woredaName": "Adama Zuria",
    "kebeleName": "Wonji Gefersa Kebele 02",
    "staffIdNumber": "DA-ETH-2026-8812",
    "organizationName": "Adama Woreda Office of Agriculture"
  }
  ```
  **Required Fields:**
  - `requestedRole` (string) - Must be one of: DEVELOPMENT_AGENT, WOREDA_OFFICER, RESEARCHER
  - `regionId`, `regionName` (string) - Regional assignment
  - `zoneId`, `zoneName` (string) - Zone assignment
  - `woredaId`, `woredaName` (string) - Woreda assignment
  - `staffIdNumber` (string) - Employee badge or staff ID
  - `organizationName` (string) - Official organization name
  
  **Optional Fields:**
  - `kebeleName` (string) - Kebele/community name

- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Role upgrade request submitted successfully",
    "data": {
      "id": "req_123456",
      "userId": "usr_789",
      "userName": "Tadesse Bekele",
      "currentRole": "FARMER",
      "requestedRole": "DEVELOPMENT_AGENT",
      "status": "PENDING",
      "staffIdNumber": "DA-ETH-2026-8812",
      "organizationName": "Adama Woreda Office of Agriculture",
      "createdAt": "2026-08-21T16:30:00.000Z"
    }
  }
  ```
  **Validation Rules:**
  - User cannot request a role they already have
  - User cannot have multiple PENDING requests for the same role
  - Staff ID and organization name are required for verification

### 2.12 Get My Role Requests
- **Method:** `GET /api/v1/auth/role-requests/my-requests`
- **Auth:** Bearer Token required
- **Description:** Retrieve all role upgrade requests submitted by the current user
- **Query Parameters:**
  - `status` (optional) - Filter by PENDING, APPROVED, or REJECTED
  - `limit` (optional) - Results per page (default: 10)
  - `offset` (optional) - Pagination offset (default: 0)

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "requests": [
        {
          "id": "req_123456",
          "currentRole": "FARMER",
          "requestedRole": "DEVELOPMENT_AGENT",
          "status": "PENDING",
          "woredaName": "Adama Zuria",
          "staffIdNumber": "DA-ETH-2026-8812",
          "organizationName": "Adama Woreda Office of Agriculture",
          "createdAt": "2026-08-21T16:30:00.000Z",
          "reviewedAt": null,
          "reviewedByName": null,
          "rejectionReason": null
        }
      ],
      "total": 1,
      "limit": 10,
      "offset": 0
    }
  }
  ```

### 2.13 Get Pending Role Requests
- **Method:** `GET /api/v1/auth/role-requests/pending`
- **Auth:** Bearer Token required (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Retrieve pending role requests for review. Hierarchical filtering applied based on reviewer role.
- **Query Parameters:**
  - `requestedRole` (optional) - Filter by role type
  - `woredaId` (optional, admin only) - Filter by woreda
  - `limit` (optional) - Default 20
  - `offset` (optional) - Default 0

- **Hierarchical Filtering:**
  - **WOREDA_OFFICER**: Can only see DEVELOPMENT_AGENT requests from their own woreda
  - **ADMIN**: Can see all requests nationwide with optional filtering

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "requests": [
        {
          "id": "req_123456",
          "userId": "usr_789",
          "userName": "Tadesse Bekele",
          "userPhone": "+251911223344",
          "userEmail": "tadesse@example.com",
          "currentRole": "FARMER",
          "requestedRole": "DEVELOPMENT_AGENT",
          "regionName": "Oromia",
          "zoneName": "East Shewa",
          "woredaName": "Adama Zuria",
          "woredaId": "woreda_adama_01",
          "kebeleName": "Wonji Gefersa Kebele 02",
          "staffIdNumber": "DA-ETH-2026-8812",
          "organizationName": "Adama Woreda Office of Agriculture",
          "status": "PENDING",
          "createdAt": "2026-08-21T16:30:00.000Z"
        }
      ],
      "total": 1,
      "limit": 20,
      "offset": 0
    }
  }
  ```

### 2.14 Approve Role Request
- **Method:** `POST /api/v1/auth/role-requests/:id/approve`
- **Auth:** Bearer Token required (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Approve a role upgrade request. User's role is automatically updated upon approval.
- **Authorization Rules:**
  - **WOREDA_OFFICER**: Can only approve DEVELOPMENT_AGENT requests from their own woreda
  - **ADMIN**: Can approve all role requests nationwide

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Role request approved successfully",
    "data": {
      "id": "req_123456",
      "status": "APPROVED",
      "reviewedById": "usr_reviewer",
      "reviewedByName": "admin@ethiofarm.et",
      "reviewedAt": "2026-08-21T17:00:00.000Z"
    }
  }
  ```
  **Side Effects:**
  - User's role automatically updated to requested role
  - Audit log entry created
  - User gains immediate access to new role permissions

- **Error Responses:**
  - `400 Bad Request` - Request already processed
  - `403 Forbidden` - Cross-woreda approval attempt or insufficient permissions
  - `404 Not Found` - Request not found

### 2.15 Reject Role Request
- **Method:** `POST /api/v1/auth/role-requests/:id/reject`
- **Auth:** Bearer Token required (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Reject a role upgrade request with reason
- **Request Body:**
  ```json
  {
    "rejectionReason": "Staff ID verification failed with Woreda HR."
  }
  ```
  **Required Fields:**
  - `rejectionReason` (string) - Explanation for rejection

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Role request rejected",
    "data": {
      "id": "req_123456",
      "status": "REJECTED",
      "rejectionReason": "Staff ID verification failed with Woreda HR.",
      "reviewedById": "usr_reviewer",
      "reviewedByName": "woreda.officer@ethiofarm.et",
      "reviewedAt": "2026-08-21T17:15:00.000Z"
    }
  }
  ```

### 2.16 Get Role Request Statistics
- **Method:** `GET /api/v1/auth/role-requests/stats`
- **Auth:** Bearer Token required (Role: ADMIN)
- **Description:** Retrieve system-wide statistics for role requests
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "total": 150,
      "pending": 25,
      "approved": 110,
      "rejected": 15,
      "byRoleAndStatus": [
        {
          "requestedRole": "DEVELOPMENT_AGENT",
          "status": "APPROVED",
          "_count": 85
        },
        {
          "requestedRole": "DEVELOPMENT_AGENT",
          "status": "PENDING",
          "_count": 20
        }
      ]
    }
  }
  ```

**Role Request Approval Hierarchy:**

| Reviewer Role      | Can Approve                           | Geographic Scope        |
|--------------------|---------------------------------------|-------------------------|
| FARMER             | ❌ None                                | N/A                     |
| DEVELOPMENT_AGENT  | ❌ None                                | N/A                     |
| WOREDA_OFFICER     | ✅ DEVELOPMENT_AGENT only              | Own woreda only         |
| RESEARCHER         | ❌ None                                | N/A                     |
| ADMIN              | ✅ All roles                           | Nationwide              |

---

## 3. Administrative Boundaries

### 3.1 Get All Regions
- **Method:** `GET /api/v1/boundaries/regions`
- **Auth:** Public
- **Response (200 OK):** Returns array of Ethiopian regional states with Amharic names and GeoJSON bounds.

### 3.2 Get Zones by Region
- **Method:** `GET /api/v1/boundaries/zones?regionId={regionId}`
- **Auth:** Public

### 3.3 Get Woredas by Zone
- **Method:** `GET /api/v1/boundaries/woredas?zoneId={zoneId}`
- **Auth:** Public

### 3.4 Get Single Woreda Details
- **Method:** `GET /api/v1/boundaries/woredas/:id`
- **Auth:** Public

---

## 4. Farm Plot Registry

### 4.1 Register Farm Plot
- **Method:** `POST /api/v1/farms`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "farmName": "Adama Wheat Plot 1",
    "woredaId": "woreda_adama_01",
    "areaHectares": 2.5,
    "primaryCrop": "Wheat",
    "latitude": 8.54,
    "longitude": 39.27,
    "polygonGeojson": {
      "type": "Polygon",
      "coordinates": [[[39.27, 8.54], [39.28, 8.54], [39.28, 8.55], [39.27, 8.55], [39.27, 8.54]]]
    }
  }
  ```

### 4.2 List User Farms
- **Method:** `GET /api/v1/farms`
- **Auth:** Bearer Token

### 4.3 Get Farm Details
- **Method:** `GET /api/v1/farms/:id`
- **Auth:** Bearer Token

---

## 5. IoT Sensor Telemetry

### 5.1 Register Sensor Device
- **Method:** `POST /api/v1/sensors`
- **Auth:** Bearer Token
- **Request Body:** `{"farmId": "farm_123", "sensorType": "SOIL_MOISTURE_STATION", "hardwareId": "ESP32_FARM_01"}`

### 5.2 Post Sensor Telemetry Reading
- **Method:** `POST /api/v1/sensors/telemetry`
- **Auth:** Public / Sensor API Key
- **Request Body:**
  ```json
  {
    "sensorId": "sns_019283",
    "soilMoisturePct": 18.5,
    "soilTempC": 24.2,
    "ambientTempC": 28.1,
    "humidityPct": 45.0,
    "batteryVoltage": 3.92
  }
  ```

### 5.3 Get Farm Sensors
- **Method:** `GET /api/v1/sensors` or `GET /api/v1/sensors/farm/:farmId`
- **Auth:** Bearer Token
- **Description:** List all sensors or sensors for a specific farm
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "sns_019283",
        "hardwareId": "ESP32_FARM_01",
        "sensorType": "SOIL_MOISTURE_STATION",
        "farmId": "farm_123",
        "isActive": true,
        "lastReading": "2026-08-21T10:30:00Z"
      }
    ]
  }
  ```

---

## 6. Satellite and Climate Observations

### 6.1 Query Woreda Observation Time-Series
- **Method:** `GET /api/v1/satellite-observations/woreda/:woredaId?source=CHIRPS&startDate=2026-08-01`
- **Auth:** Bearer Token

### 6.2 Ingest Satellite Record
- **Method:** `POST /api/v1/satellite-observations/ingest`
- **Auth:** Bearer Token (`RESEARCHER` / `ADMIN`)

---

## 7. Multi-Hazard Risk Assessments

### 7.1 Trigger Woreda Evaluation
- **Method:** `POST /api/v1/risk-assessments/evaluate`
- **Auth:** Bearer Token
- **Request Body:** `{"woredaId": "woreda_adama_01"}`

### 7.2 Get Latest Woreda Risk Assessment
- **Method:** `GET /api/v1/risk-assessments/woreda/:woredaId`
- **Auth:** Bearer Token

### 7.3 Get Latest Assessments
- **Method:** `GET /api/v1/risk-assessments` or `GET /api/v1/risk-assessments/latest`
- **Auth:** Bearer Token
- **Description:** Get latest risk assessments across all woredas

### 7.4 Get Risk Statistics
- **Method:** `GET /api/v1/risk-assessments/statistics`
- **Auth:** Bearer Token
- **Description:** Aggregate risk statistics and distribution

---

## 8. Early Warning Alerts

### 8.1 Create Early Warning Alert
- **Method:** `POST /api/v1/alerts`
- **Auth:** Bearer Token (`WOREDA_OFFICER` / `ADMIN`)
- **Request Body:**
  ```json
  {
    "woredaId": "woreda_adama_01",
    "hazardType": "DROUGHT",
    "severity": "HIGH",
    "titleEn": "Drought Warning",
    "messageEn": "Water scarcity expected",
    "titleAm": "የድርቅ ማስጠንቀቂያ",
    "messageAm": "የውሃ እጥረት ሊከሰት ይችላል"
  }
  ```

### 8.2 List Alerts
- **Method:** `GET /api/v1/alerts` or `GET /api/v1/alerts/active`
- **Auth:** Bearer Token
- **Query Parameters:** `severity`, `woredaId`, `status`

### 8.3 Get Alert by ID
- **Method:** `GET /api/v1/alerts/:id`
- **Auth:** Bearer Token

### 8.4 Mark Alert as Read
- **Method:** `PATCH /api/v1/alerts/:id/read`
- **Auth:** Bearer Token

---

## 9. Crop Pathology Diagnosis

### 9.1 Diagnose Crop Image
- **Method:** `POST /api/v1/disease-diagnosis/diagnose`
- **Auth:** Bearer Token
- **Payload:** Multipart form-data (`image` file upload) OR JSON with `imageUrl` and `cropType`.

### 9.2 Get All Diagnoses
- **Method:** `GET /api/v1/disease-diagnosis`
- **Auth:** Bearer Token
- **Description:** Get all disease diagnoses for the authenticated user

### 9.3 Get Diagnosis History by Farm
- **Method:** `GET /api/v1/disease-diagnosis/farm/:farmId`
- **Auth:** Bearer Token

---

## 10. Analytics and Agronomic Advisories

### 10.1 Get Executive Dashboard Analytics
- **Method:** `GET /api/v1/analytics/dashboard`
- **Auth:** Bearer Token
- **Description:** National dashboard with farms, sensors, alerts, NDVI, and risk distribution.

### 10.2 Get Regional Risk Breakdown
- **Method:** `GET /api/v1/analytics/regional-breakdown`
- **Auth:** Bearer Token
- **Description:** Regional statistics with rainfall, NDVI, alert status per region.

### 10.3 Get Temporal Trends
- **Method:** `GET /api/v1/analytics/temporal-trends?timeframe=DAILY&woredaId=woreda_adama_01`
- **Auth:** Bearer Token
- **Query Parameters:**
  - `timeframe`: `DAILY`, `MONTHLY`, `YEARLY` (default: `DAILY`)
  - `woredaId`: Specific woreda ID (optional)
  - `includeAi`: `true` to include AI insights (optional)
  - `language`: `am`, `en`, `om` (default: `am`)

### 10.4 Get Agronomic Advisory
- **Method:** `GET /api/v1/analytics/agronomic-advisories?cropType=WHEAT&season=MEHER`
- **Auth:** Bearer Token
- **Query Parameters:**
  - `cropType`: `WHEAT`, `TEFF`, `MAIZE`, `BARLEY`, etc.
  - `season`: `MEHER`, `BELG`
  - `woredaId`: Specific woreda (optional)

### 10.5 Get AI Insights
- **Method:** `POST /api/v1/analytics/ai-insights`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "woredaId": "woreda_adama_01",
    "timeframe": "DAILY",
    "language": "am",
    "metrics": []
  }
  ```

---

## 10A. Location-Based Map and Analytics

### 10A.1 Get User Location Map
- **Method:** `GET /api/v1/analytics/location/map`
- **Auth:** Bearer Token (Required)
- **Description:** Returns map data based on authenticated user's role and location.
  - **REGIONAL_OFFICER**: Region boundaries with all zones and woredas
  - **ZONE_OFFICER**: Zone boundaries with all woredas
  - **WOREDA_OFFICER**: Woreda boundaries with all farm locations
  - **FARMER**: Woreda boundaries with all farm locations
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "woreda",
      "woreda": {
        "id": "woreda_adama_01",
        "nameEn": "Adama Zuria",
        "nameAm": "አዳማ ዙሪያ",
        "pcode": "ET0408001",
        "boundaries": { "type": "Polygon", "coordinates": [[...]] }
      },
      "zone": { "id": "zone_adama_special", "nameEn": "Adama Special" },
      "region": { "id": "ET04", "nameEn": "Oromia" },
      "farms": [
        {
          "id": "farm_123",
          "farmName": "Adama Wheat Plot A",
          "latitude": 8.54,
          "longitude": 39.27,
          "areaHectares": 2.5,
          "primaryCrop": "WHEAT"
        }
      ],
      "farmCount": 42
    }
  }
  ```

### 10A.2 Get User Location Analytics
- **Method:** `GET /api/v1/analytics/location/analytics`
- **Auth:** Bearer Token (Required)
- **Description:** Returns analytics data based on authenticated user's role and location.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "woreda",
      "woreda": { "id": "woreda_adama_01", "nameEn": "Adama Zuria" },
      "zone": { "id": "zone_adama_special", "nameEn": "Adama Special" },
      "region": { "id": "ET04", "nameEn": "Oromia" },
      "statistics": {
        "totalFarms": 42,
        "activeSensors": 15,
        "totalSensors": 18,
        "activeAlerts": 2
      },
      "currentConditions": {
        "avgRainfallLast30Days": 45.8,
        "avgNdvi": 0.62,
        "alertLevel": "NORMAL",
        "lastAssessed": "2026-08-20T10:30:00Z"
      },
      "recentObservations": [
        { "date": "2026-08-20", "rainfall": 12.5, "ndvi": 0.64, "source": "CHIRPS" }
      ]
    }
  }
  ```

### 10A.3 Get Region Map
- **Method:** `GET /api/v1/analytics/region/:regionId/map`
- **Auth:** Bearer Token
- **Description:** Get region boundaries with all zones and woredas.
- **Path Parameters:**
  - `regionId`: Region ID (e.g., `ET04` for Oromia, `ET03` for Amhara)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "region",
      "region": {
        "id": "ET04",
        "nameEn": "Oromia",
        "nameAm": "ኦሮሚያ",
        "code": "ET04",
        "boundaries": { "type": "Polygon", "coordinates": [[...]] }
      },
      "zones": [
        {
          "id": "zone_adama_special",
          "nameEn": "Adama Special",
          "nameAm": "አዳማ ልዩ",
          "pcode": "ET0408",
          "boundaries": { "type": "Polygon", "coordinates": [[...]] },
          "woredaCount": 12,
          "woredas": [...]
        }
      ],
      "zoneCount": 21,
      "woredaCount": 287
    }
  }
  ```

### 10A.4 Get Region Analytics
- **Method:** `GET /api/v1/analytics/region/:regionId/analytics`
- **Auth:** Bearer Token
- **Description:** Get comprehensive analytics for a region.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "region",
      "region": { "id": "ET04", "nameEn": "Oromia", "code": "ET04" },
      "statistics": {
        "totalZones": 21,
        "totalWoredas": 287,
        "totalFarms": 580,
        "activeSensors": 200,
        "totalSensors": 245,
        "activeAlerts": 12
      },
      "riskDistribution": {
        "green": 250,
        "yellow": 28,
        "orange": 7,
        "red": 2
      },
      "zoneBreakdown": [
        {
          "zoneId": "zone_adama_special",
          "zoneName": "Adama Special",
          "woredaCount": 12,
          "farmCount": 85,
          "alertCount": 3
        }
      ]
    }
  }
  ```

### 10A.5 Get Zone Map
- **Method:** `GET /api/v1/analytics/zone/:zoneId/map`
- **Auth:** Bearer Token
- **Description:** Get zone boundaries with all woredas.
- **Path Parameters:**
  - `zoneId`: Zone ID (e.g., `zone_adama_special`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "zone",
      "zone": {
        "id": "zone_adama_special",
        "nameEn": "Adama Special",
        "nameAm": "አዳማ ልዩ",
        "pcode": "ET0408",
        "boundaries": { "type": "Polygon", "coordinates": [[...]] }
      },
      "region": { "id": "ET04", "nameEn": "Oromia", "code": "ET04" },
      "woredas": [
        {
          "id": "woreda_adama_01",
          "nameEn": "Adama Zuria",
          "nameAm": "አዳማ ዙሪያ",
          "pcode": "ET0408001",
          "boundaries": { "type": "Polygon", "coordinates": [[...]] }
        }
      ],
      "woredaCount": 12
    }
  }
  ```

### 10A.6 Get Zone Analytics
- **Method:** `GET /api/v1/analytics/zone/:zoneId/analytics`
- **Auth:** Bearer Token
- **Description:** Get comprehensive analytics for a zone.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "zone",
      "zone": { "id": "zone_adama_special", "nameEn": "Adama Special" },
      "region": { "id": "ET04", "nameEn": "Oromia" },
      "statistics": {
        "totalWoredas": 12,
        "totalFarms": 85,
        "activeSensors": 32,
        "totalSensors": 38,
        "activeAlerts": 3
      },
      "riskDistribution": {
        "green": 68,
        "yellow": 14,
        "orange": 2,
        "red": 1
      },
      "woredaBreakdown": [
        {
          "woredaId": "woreda_adama_01",
          "woredaName": "Adama Zuria",
          "farmCount": 42,
          "alertCount": 1
        }
      ]
    }
  }
  ```

### 10A.7 Get Woreda Map
- **Method:** `GET /api/v1/analytics/woreda/:woredaId/map`
- **Auth:** Bearer Token
- **Description:** Get woreda boundaries with all farm locations.
- **Path Parameters:**
  - `woredaId`: Woreda ID (e.g., `woreda_adama_01`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "woreda",
      "woreda": {
        "id": "woreda_adama_01",
        "nameEn": "Adama Zuria",
        "nameAm": "አዳማ ዙሪያ",
        "pcode": "ET0408001",
        "boundaries": { "type": "Polygon", "coordinates": [[...]] }
      },
      "zone": { "id": "zone_adama_special", "nameEn": "Adama Special" },
      "region": { "id": "ET04", "nameEn": "Oromia" },
      "farms": [
        {
          "id": "farm_123",
          "farmName": "Adama Wheat Plot A",
          "latitude": 8.54,
          "longitude": 39.27,
          "areaHectares": 2.5,
          "primaryCrop": "WHEAT"
        }
      ],
      "farmCount": 42
    }
  }
  ```

### 10A.8 Get Woreda Analytics
- **Method:** `GET /api/v1/analytics/woreda/:woredaId/analytics`
- **Auth:** Bearer Token
- **Description:** Get comprehensive analytics for a woreda.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "type": "woreda",
      "woreda": { "id": "woreda_adama_01", "nameEn": "Adama Zuria" },
      "zone": { "id": "zone_adama_special", "nameEn": "Adama Special" },
      "region": { "id": "ET04", "nameEn": "Oromia" },
      "statistics": {
        "totalFarms": 42,
        "activeSensors": 15,
        "totalSensors": 18,
        "activeAlerts": 2
      },
      "currentConditions": {
        "avgRainfallLast30Days": 45.8,
        "avgNdvi": 0.62,
        "alertLevel": "NORMAL",
        "lastAssessed": "2026-08-20T10:30:00Z"
      },
      "recentObservations": [
        { "date": "2026-08-20", "rainfall": 12.5, "ndvi": 0.64, "source": "CHIRPS" },
        { "date": "2026-08-19", "rainfall": 8.2, "ndvi": 0.63, "source": "CHIRPS" }
      ]
    }
  }
  ```

---

## 11. Multimodal Voice and Agronomic Assistant

### 11.1 Voice Inquiry Processing
- **Method:** `POST /api/v1/ai/voice-inquiry`
- **Auth:** Bearer Token
- **Request Body:** `{"userQuestion": "የበቆሎ አባጨጓሬን እንዴት ማጥፋት ይቻላል?", "language": "am"}`

### 11.2 Text-to-Speech Generation
- **Method:** `POST /api/v1/ai/text-to-speech` or `GET /api/v1/ai/text-to-speech`
- **Auth:** Bearer Token
- **Request Body (POST):**
  ```json
  {
    "text": "የአየር ሁኔታው መልካም ነው",
    "language": "am"
  }
  ```
- **Response:** Audio file or audio URL

---

## 12. Data Ingestion Pipeline

### 12.1 List Ingestion Connectors Status
- **Method:** `GET /api/v1/ingestion/connectors`
- **Auth:** Bearer Token
- **Description:** List all available data connectors and their health status

### 12.2 Test Connector Health
- **Method:** `GET /api/v1/ingestion/health`
- **Auth:** Bearer Token
- **Description:** Test health of all ingestion connectors

### 12.3 Manual Pipeline Ingestion Pull
- **Method:** `POST /api/v1/ingestion/pull` or `POST /api/v1/ingestion/trigger`
- **Auth:** Bearer Token (`ADMIN`)
- **Request Body:**
  ```json
  {
    "jobType": "pullChirpsRainfall"
  }
  ```
- **Available job types:** `pullChirpsRainfall`, `pullNasaPower`, `pullFaoLocust`, `calculateRisks`

### 12.4 Ingest Sensor Telemetry
- **Method:** `POST /api/v1/ingestion/telemetry`
- **Auth:** Public / API Key
- **Description:** Bulk telemetry ingestion endpoint

---

## 13. USSD Interactive Telephony Gateway

### 13.1 USSD Callback Handler
- **Method:** `POST /api/v1/delivery/ussd`
- **Auth:** Public (Africa's Talking Callback)
- **Request Body:** `sessionId={id}&serviceCode=*212#&phoneNumber=+251911223344&text=1*1`
- **Response Format:** Plain text string prefixed with `CON` (continue) or `END` (terminate).

### 13.2 USSD Health Check
- **Method:** `GET /api/v1/delivery/ussd`
- **Auth:** Public
- **Response:** `{"status": "OK", "service": "USSD Gateway"}`

---

## 14. Enterprise Administration and Audit Control

### 14.1 Web Dashboard UI
- **Method:** `GET /api/v1/admin` or `GET /api/v1/admin/dashboard`
- **Auth:** Admin Web Session / Admin Bearer Token
- **Description:** Interactive admin dashboard with map visualization and CRUD operations

### 14.2 Get Overview Statistics
- **Method:** `GET /api/v1/admin/overview`
- **Auth:** Admin Bearer Token
- **Description:** Get overview statistics for admin dashboard

### 14.3 User Management CRUD
- **List Users:** `GET /api/v1/admin/users?page=1&limit=20&search=abebe`
- **Create User:** `POST /api/v1/admin/users` (Body: `{fullName, phoneNumber, email, role, woredaId}`)
- **Update User:** `PUT /api/v1/admin/users/:id` (Body: `{fullName, phoneNumber, email, role, woredaId}`)
- **Update Role:** `PATCH /api/v1/admin/users/:id/role` (Body: `{role: "DEVELOPMENT_AGENT"}`)
- **Toggle Verification:** `PATCH /api/v1/admin/users/:id/status` (Body: `{isEmailVerified: true}`)
- **Delete User:** `DELETE /api/v1/admin/users/:id`

### 14.3 Farm Plot Management CRUD
- **List Farms:** `GET /api/v1/admin/farms?page=1&limit=20`
- **Create Farm Plot:** `POST /api/v1/admin/farms` (Body: `{farmName, primaryCrop, areaHectares, latitude, longitude}`)
- **Update Farm Plot:** `PUT /api/v1/admin/farms/:id`
- **Delete Farm Plot:** `DELETE /api/v1/admin/farms/:id`

### 14.4 IoT Sensor Network CRUD
- **List Sensors:** `GET /api/v1/admin/sensors?page=1&limit=20`
- **Register Sensor:** `POST /api/v1/admin/sensors` (Body: `{hardwareId, sensorType, farmId}`)
- **Delete Sensor:** `DELETE /api/v1/admin/sensors/:id`

### 14.5 Alert Management and Emergency Broadcast
- **List Alerts:** `GET /api/v1/admin/alerts?page=1&limit=20`
- **Broadcast Alert:** `POST /api/v1/admin/broadcast-alert` (Body: `{woredaId, hazardType, severity, titleEn, messageEn}`)
- **Delete Alert:** `DELETE /api/v1/admin/alerts/:id`

### 14.6 Crop Disease Diagnoses
- **List Diagnoses:** `GET /api/v1/admin/diagnoses?page=1&limit=20`
- **Delete Diagnosis:** `DELETE /api/v1/admin/diagnoses/:id`

### 14.7 System Health, Pipeline Trigger, and Audit Trail
- **System Health Check:** `GET /api/v1/admin/system/health`
- **Trigger Ingestion Job:** `POST /api/v1/admin/ingestion/trigger` (Body: `{jobType: "pullChirpsRainfall"}`)
- **Get Audit Logs:** `GET /api/v1/admin/audit-logs?limit=50`

### 14.8 Hierarchical Role Approval Governance

#### 14.8.1 Get Pending Role Requests
- **Method:** `GET /api/v1/admin/role-requests`
- **Auth:** Admin Bearer Token (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Retrieve pending role upgrade requests for approval. Hierarchical filtering applied automatically.
- **Query Parameters:**
  - `status` (optional) - PENDING (default), APPROVED, REJECTED
  - `requestedRole` (optional) - DEVELOPMENT_AGENT, WOREDA_OFFICER, RESEARCHER
  - `woredaId` (optional, admin only) - Filter by specific woreda
  - `limit` (optional) - Default 20
  - `offset` (optional) - Default 0

- **Hierarchical Filtering:**
  - **WOREDA_OFFICER**: Automatically filtered to only show DEVELOPMENT_AGENT requests from their own woreda
  - **ADMIN**: Can view all requests nationwide with optional filters

#### 14.8.2 Approve Role Request
- **Method:** `POST /api/v1/admin/role-requests/:id/approve`
- **Auth:** Admin Bearer Token (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Approve role upgrade request and automatically update user's role
- **Response:** `{ "success": true, "message": "Role request approved successfully", "data": {...} }`
- **Side Effects:**
  - User role updated to requested role
  - Request status changed to APPROVED
  - Audit log entry created
  - User immediately gains new permissions

#### 14.8.3 Reject Role Request
- **Method:** `POST /api/v1/admin/role-requests/:id/reject`
- **Auth:** Admin Bearer Token (Role: WOREDA_OFFICER or ADMIN)
- **Description:** Reject role upgrade request with documented reason
- **Request Body:**
  ```json
  {
    "rejectionReason": "Staff ID verification failed with Woreda HR."
  }
  ```
- **Response:** `{ "success": true, "message": "Role request rejected", "data": {...} }`

#### 14.8.4 Get Role Request Statistics
- **Method:** `GET /api/v1/admin/role-requests/stats`
- **Auth:** Admin Bearer Token (Role: ADMIN only)
- **Description:** System-wide role request statistics and analytics
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "total": 150,
      "pending": 25,
      "approved": 110,
      "rejected": 15,
      "byRoleAndStatus": [...]
    }
  }
  ```

**Role Request Workflow:**
1. Field worker submits application via `POST /api/v1/auth/role-requests`
2. Supervisor reviews via `GET /api/v1/admin/role-requests`
3. Supervisor approves/rejects via `POST /api/v1/admin/role-requests/:id/approve` or `/reject`
4. System automatically updates user role and permissions on approval
5. Applicant receives immediate access to new role features

---

## 15. WebSocket Real-Time Gateway

- **Connection URL:** `ws://localhost:5000` (Socket.IO client)
- **Rooms:** `woreda:{woredaId}`, `farm:{farmId}`
- **Emitted Events:**
  - `risk:updated`: Broadcast when multi-hazard risk assessment finishes.
  - `alert:new`: Broadcast when emergency early warning is dispatched.
  - `telemetry:new`: Broadcast when IoT sensor posts new readings.

---

## 16. Error Handling and Status Codes

| Code | Name | Description |
|---|---|---|
| `200` | OK | Request processed successfully. |
| `201` | Created | Resource successfully registered/created. |
| `400` | Bad Request | Missing or invalid parameter validation. |
| `401` | Unauthorized | Missing or expired JWT bearer token. |
| `403` | Forbidden | Insufficient RBAC role permissions. |
| `404` | Not Found | Resource or endpoint route does not exist. |
| `409` | Conflict | Duplicate entity (e.g. phone number exists). |
| `429` | Too Many Requests | Rate limit threshold exceeded. |
| `500` | Internal Error | Server error handled by global error logger. |
