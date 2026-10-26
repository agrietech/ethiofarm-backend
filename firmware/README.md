# AgriEtech IoT Hardware Firmware

> Embedded C++ firmware for the AgriEtech ESP32/Arduino Soil Moisture, Temperature, and Telemetry Node.

---

## 📋 Overview

The AgriEtech IoT ground telemetry fleet deploys microcontrollers across Ethiopian farm plots to capture high-frequency agro-meteorological metrics. This firmware reads analog capacitive soil moisture, digital air/soil temperature probes, and battery voltage, packaging them as JSON payloads transmitted over Wi-Fi/GSM directly to Firebase Realtime Database or the AgriEtech backend ingestion gateway.

---

## 🛠️ Hardware Requirements & Pinout

| Component | Interface | ESP32 GPIO | Description |
| :--- | :--- | :--- | :--- |
| **ESP32 NodeMCU** | Controller | — | 3.3V Logic, Dual-Core Tensilica Xtensa 32-bit |
| **Capacitive Soil Moisture v1.2** | Analog ADC | `GPIO 34` | Corrosion-resistant capacitive soil volumetric moisture probe |
| **DHT22 / AM2302** | Digital 1-Wire | `GPIO 5` | Ambient air temperature & relative humidity sensor |
| **DS18B20 (Waterproof Probe)** | Digital 1-Wire | `GPIO 4` | Sub-surface soil temperature sensor |
| **Battery Voltage Divider** | Analog ADC | `GPIO 35` | 2:1 resistor divider (100kΩ / 100kΩ) for 3.7V 18650 Li-ion monitoring |

---

## ⚙️ Calibration

Capacitive soil moisture sensors produce analog ADC voltage corresponding to dielectric permittivity:

1. **Air Value (Dry Cal)**: Take readings with the probe clean and suspended in air. Set `AIR_VALUE = 3000` (12-bit ADC).
2. **Submerged Value (Saturation Cal)**: Submerge the probe up to the stop line in tap water. Set `WATER_VALUE = 1500`.
3. The firmware maps raw ADC values linearly:
   $$\text{Moisture (\%)} = \frac{\text{rawADC} - \text{AIR\_VALUE}}{\text{WATER\_VALUE} - \text{AIR\_VALUE}} \times 100$$

---

## 🚀 Flashing & Compilation

### Using Arduino IDE:
1. Install **ESP32 Board Support** via Board Manager (`esp32 by Espressif Systems`).
2. Install required libraries from Library Manager:
   - `ArduinoJson` (v6.x or v7.x)
   - `WiFi` (Built-in)
   - `HTTPClient` (Built-in)
3. Open `arduino_hardware_moisture_node.ino`.
4. Configure your `WIFI_SSID` and `WIFI_PASSWORD`.
5. Select Board: **ESP32 Dev Module**, Port: **COMx**, Baud: **115200**.
6. Click **Upload**.

---

## 📡 Remote Telemetry Integration

- **Firebase Realtime Database target**: `https://arduinomoisture-default-rtdb.firebaseio.com/sensors/<HARDWARE_ID>.json`
- **AgriEtech Ingestion Endpoint**: `POST /api/v1/sensors/telemetry` (Header: `x-sensor-api-key: <TOKEN>`)
- Detailed payload specifications and LoRaWAN bridging guides are documented in [**docs/ESP32_IOT_INTEGRATION_GUIDE.md**](../docs/ESP32_IOT_INTEGRATION_GUIDE.md).
