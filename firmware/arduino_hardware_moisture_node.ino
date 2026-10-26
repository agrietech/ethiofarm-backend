/*
 * AgriEtech IoT Platform - Arduino / ESP32 Firebase Moisture Node
 * 
 * Hardware:
 *  - ESP32 / ESP8266 / Arduino + WiFi Shield
 *  - Capacitive Soil Moisture Sensor (Analog PIN 34 on ESP32 or A0 on Arduino)
 *  - DHT22 Air Temperature & Humidity Sensor (PIN 5)
 *  - DS18B20 Soil Temperature Probe (PIN 4)
 * 
 * Target Firebase Realtime Database:
 *  - URL: https://arduinomoisture-default-rtdb.firebaseio.com
 *  - API Key: AIzaSyDt0I0HwHRlr1qpBHDh_fLlxmtXx3OqVG0
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// =================== CONFIGURATION ===================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase RTDB Configuration
const char* FIREBASE_HOST = "https://arduinomoisture-default-rtdb.firebaseio.com";
const char* FIREBASE_AUTH = "AIzaSyDt0I0HwHRlr1qpBHDh_fLlxmtXx3OqVG0";

// AgriEtech Direct Ingestion Webhook (Optional Fallback)
const char* AGRIETECH_WEBHOOK_URL = "https://agrietech.onrender.com/api/v1/sensors/firebase/stream";

// Device Identification
const char* HARDWARE_ID = "ARDUINO-MOISTURE-01";
const char* FARM_ID = "farm_demo_01"; // Optional: link to farm

// Sensor Pins
#define SOIL_MOISTURE_PIN 34 // Analog ADC pin
#define BATTERY_PIN 35       // Battery voltage divider

// Calibration values for Capacitive Soil Moisture (12-bit ADC: 0 - 4095)
const int AIR_VALUE = 3000;   // Sensor in dry air
const int WATER_VALUE = 1500; // Sensor submerged in water

// Telemetry transmit interval (in milliseconds)
const unsigned long SEND_INTERVAL_MS = 60000; // 60 seconds
unsigned long lastSendTime = 0;

// =================== SENSOR READINGS ===================
float readSoilMoisture() {
  int rawADC = analogRead(SOIL_MOISTURE_PIN);
  float moisture = map(rawADC, AIR_VALUE, WATER_VALUE, 0, 100);
  if (moisture < 0.0) moisture = 0.0;
  if (moisture > 100.0) moisture = 100.0;
  return round(moisture * 10.0) / 10.0;
}

float readBatteryLevel() {
  int rawBattery = analogRead(BATTERY_PIN);
  float voltage = (rawBattery / 4095.0) * 3.3 * 2.0; // 2:1 divider
  float percentage = map(voltage * 100, 300, 420, 0, 100); // 3.0V - 4.2V
  if (percentage < 0.0) percentage = 0.0;
  if (percentage > 100.0) percentage = 100.0;
  return round(percentage);
}

// =================== FIREBASE REST DISPATCH ===================
void pushTelemetryToFirebase(float moisture, float temp, float humidity, float battery) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Not connected, skipping transmission");
    return;
  }

  HTTPClient http;
  
  // Endpoint: https://arduinomoisture-default-rtdb.firebaseio.com/sensors/ARDUINO-MOISTURE-01.json
  String url = String(FIREBASE_HOST) + "/sensors/" + String(HARDWARE_ID) + ".json";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["hardwareId"] = HARDWARE_ID;
  doc["farmId"] = FARM_ID;
  doc["soilMoisture"] = moisture;
  doc["soilTemp"] = temp;
  doc["ambientTemp"] = temp;
  doc["humidity"] = humidity;
  doc["batteryLevel"] = battery;
  doc["timestamp"] = millis(); // Milliseconds uptime or ISO string

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.print("[Firebase RTDB] Pushing payload: ");
  Serial.println(requestBody);

  // PUT updates latest sensor state, POST appends historical log
  int httpResponseCode = http.PUT(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[Firebase RTDB] Response (%d): %s\n", httpResponseCode, response.c_str());
  } else {
    Serial.printf("[Firebase RTDB] Error on sending PUT: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// =================== SETUP & LOOP ===================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("==========================================");
  Serial.println("AgriEtech Arduino Soil Moisture Sensor Node");
  Serial.println("Target Firebase: arduinomoisture-default-rtdb");
  Serial.println("==========================================");

  analogReadResolution(12); // ESP32 12-bit ADC

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());
}

void loop() {
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = currentMillis;

    float soilMoisture = readSoilMoisture();
    float estimatedSoilTemp = 22.5; // Replace with DS18B20 reading
    float estimatedHumidity = 65.0; // Replace with DHT22 reading
    float battery = readBatteryLevel();

    Serial.printf("[Telemetry] Moisture: %.1f%% | Temp: %.1f C | Battery: %.0f%%\n",
                  soilMoisture, estimatedSoilTemp, battery);

    pushTelemetryToFirebase(soilMoisture, estimatedSoilTemp, estimatedHumidity, battery);
  }

  delay(1000);
}
