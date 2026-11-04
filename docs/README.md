# EthioFarm Backend Developer Documentation

Welcome to the official developer documentation suite for the **EthioFarm Multi-Hazard Agricultural Early Warning Platform (Backend)**.

---

## Technical Architecture References

| Document | Purpose & Scope | Target Audience |
| :--- | :--- | :--- |
| [**Architecture Blueprint**](ARCHITECTURE.md) | High-level system architecture, layered design, Redis caching, PostGIS geodatabase, GEE pipelines, Docker deployment, and automated test execution. | System Architects & Developers |
| [**API Specification**](API_SPECIFICATION.md) | Exhaustive REST OpenAPI endpoints, query schemas, JSON request/response bodies, and error formats. | Backend & Client Developers |
| [**IoT Firmware Repository**](../firmware/README.md) | Embedded C++ sketch and hardware guide for ESP32/Arduino capacitive soil moisture and telemetry node. | Hardware Firmware Developers |

---

## Verification and Quality Gates

```bash
# 1. Verify code standards with ESLint
npm run lint

# 2. Run automated production readiness audit
node scripts/production_audit.js

# 3. Execute Jest unit and integration test suite
npm test
```
