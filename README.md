# ESP32 DHT11 HTTP Dashboard + Gmail Temperature Alerts

This project keeps the HTTP-based server design: the ESP32 sends temperature and humidity to `POST /update`, the dashboard displays live values, the web UI exposes LED ON/OFF controls, and the server sends a Gmail alert when temperature reaches 33.5°C. The alert re-arms after temperature drops below 33°C.

## Files
- `server.js` — Express dashboard, HTTP endpoint, live Server-Sent Events, Gmail alert
- `package.json` — Node.js dependencies and start command
- `.env.example` — example environment variables (no real credentials)
- `.gitignore` — excludes `.env` and `node_modules`

## Requirements
- Node.js installed
- ESP32 firmware that sends HTTP `POST` requests to `/update` with JSON fields `temp` and `hum`
- Gmail App Password if email alerts are needed

## Setup on Windows
1. Extract the project ZIP.
2. Open the extracted folder in VS Code.
3. Open Terminal → New Terminal.
4. Run `npm install`.
5. Copy `.env.example` to a new file named `.env`.
6. Fill in `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `ALERT_EMAIL_TO` in `.env`.
7. Run `npm start`.
8. Open `http://localhost:3000` on the server computer.

To open the dashboard from another device on the same Wi-Fi, use `http://YOUR_COMPUTER_LAN_IP:3000`. Find the PC IP using `ipconfig`. The ESP32 and PC must be on a network that permits local device communication.

## ESP32 HTTP request expected by this server
Send a POST request to `http://YOUR_COMPUTER_LAN_IP:3000/update` with JSON body:
```json
{"temp": 28.5, "hum": 54}
```
Set the request content type to `application/json`.

The server replies with JSON such as:
```json
{"led":"ON"}
```

## Quick test without ESP32
While the server is running, open a second PowerShell terminal and run:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/update" -Method Post -ContentType "application/json" -Body '{"temp":34,"hum":50}'
```
Open `http://localhost:3000` in a browser to see the dashboard update. If valid Gmail credentials are configured, a temperature alert email should be attempted.

Test LED endpoint:
```powershell
Invoke-WebRequest "http://localhost:3000/set?led=on"
```

## Security
- Never commit `.env` or real credentials to GitHub.
- If a real Gmail App Password was previously exposed, revoke it and generate a new one.
- This server does not automatically change your ESP32 firmware. The firmware must use HTTP `POST /update` with JSON. If your working firmware uses a different endpoint or ThingSpeak, keep that implementation separately or adapt the server intentionally.

## Hardware note
The original firmware source was not bundled into this server package because the uploaded `.ino` variants use different HTTP/ThingSpeak flows and have not been confirmed as a direct match for this dashboard. This package preserves the HTTP server interface and provides a local endpoint test.


## Arduino firmware (ESP32)

The `arduino/esp32_http_dht11_led.ino` sketch is a compatible firmware template for this server. It uses HTTP POST to `/update` and reads the `led` state returned by the server.

### Arduino IDE setup
1. Install the ESP32 board package in Arduino IDE.
2. Install these libraries from Library Manager:
   - DHT sensor library by Adafruit
   - Adafruit Unified Sensor
   - ArduinoJson
3. Open `arduino/esp32_http_dht11_led.ino`.
4. Enter your Wi-Fi SSID/password in the sketch locally.
5. Change `SERVER_HOST` to your computer's LAN IPv4 address (use `ipconfig` on Windows). Do not use `localhost` for the ESP32.
6. Connect DHT11 DATA to GPIO 4, VCC to the appropriate supply for your module, and GND to GND. LED output uses GPIO 2 by default; change `LED_PIN` if your hardware uses another pin.
7. Start the Node.js server, select your ESP32 board/port, upload the sketch, and open Serial Monitor at 115200 baud.

Do not commit real Wi-Fi credentials. Before uploading to GitHub, replace them with placeholders in the sketch.

This firmware was prepared to match the HTTP interface in this repository; it has not been hardware-tested in this environment. If your original working firmware uses a different HTTP endpoint or ThingSpeak, preserve that version separately rather than overwriting it.
