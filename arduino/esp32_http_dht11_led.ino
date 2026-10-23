/*
  ESP32 + DHT11 + HTTP Dashboard + LED Control

  Matches the Node.js server in this project:
  - Sends HTTP POST JSON to /update: {"temp": 25.0, "hum": 50.0}
  - Reads the server response JSON: {"led":"ON"} or {"led":"OFF"}
  - Uses GPIO 4 for DHT11 data and GPIO 2 for the onboard/external LED

  IMPORTANT:
  1. Enter your Wi-Fi name/password below.
  2. Set SERVER_HOST to your computer's LAN IP address (not localhost).
  3. ESP32 and computer must be on the same reachable network.
  4. This is a compatible firmware template; test with your actual wiring/board.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ===== WIFI SETTINGS: fill locally; do not upload real values to GitHub =====
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ===== SERVER SETTINGS =====
// Example: "192.168.29.63" (find your computer's IPv4 address with ipconfig)
const char* SERVER_HOST = "192.168.1.100";
const uint16_t SERVER_PORT = 3000;
const char* UPDATE_PATH = "/update";

// ===== HARDWARE =====
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define LED_PIN 2

DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL_MS = 3000;

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("Wi-Fi connected.");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("Wi-Fi connection failed. Check SSID/password.");
  }
}

void sendSensorData(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi disconnected; reconnecting...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String("http://") + SERVER_HOST + ":" +
               String(SERVER_PORT) + UPDATE_PATH;

  if (!http.begin(client, url)) {
    Serial.println("Could not start HTTP request.");
    return;
  }

  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> requestDoc;
  requestDoc["temp"] = temperature;
  requestDoc["hum"] = humidity;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("Body: ");
  Serial.println(requestBody);

  int statusCode = http.POST(requestBody);

  if (statusCode > 0) {
    Serial.print("HTTP status: ");
    Serial.println(statusCode);

    String responseBody = http.getString();
    Serial.print("Server response: ");
    Serial.println(responseBody);

    if (statusCode == HTTP_CODE_OK) {
      StaticJsonDocument<128> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, responseBody);

      if (!error && responseDoc["led"].is<const char*>()) {
        const char* led = responseDoc["led"];
        bool ledOn = (String(led) == "ON");
        digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
        Serial.print("LED set to: ");
        Serial.println(ledOn ? "ON" : "OFF");
      } else {
        Serial.println("Response JSON did not contain a valid led state.");
      }
    }
  } else {
    Serial.print("HTTP request failed: ");
    Serial.println(http.errorToString(statusCode));
    Serial.println("Check server IP, port, firewall, and that Node.js is running.");
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dht.begin();
  connectWiFi();
}

void loop() {
  if (millis() - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = millis();

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Failed to read from DHT11. Check sensor wiring.");
      return;
    }

    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.print(" °C | Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");

    sendSensorData(temperature, humidity);
  }
}
