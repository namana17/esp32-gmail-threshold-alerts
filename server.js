require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== DEBUG LOGGER =====
app.use((req, res, next) => {
    console.log(`HIT: ${req.method} ${req.url}`);
    next();
});

// ===== VARIABLES =====
let ledState = "OFF";
let temperature = 0;
let humidity = 0;
let lastSeen = 0;
let emailSent = false;

// ===== EMAIL SETUP: credentials come from .env =====
const emailConfigured = Boolean(
    process.env.GMAIL_USER &&
    process.env.GMAIL_APP_PASSWORD &&
    process.env.ALERT_EMAIL_TO
);

const transporter = emailConfigured
    ? nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    })
    : null;

if (!emailConfigured) {
    console.log("Email is not configured. Add Gmail settings to your local .env file.");
} else {
    transporter.verify((err) => {
        if (err) console.log("SMTP ERROR:", err.message);
        else console.log("EMAIL READY");
    });
}

// ===== SEND EMAIL =====
async function sendEmail(temp) {
    if (!transporter || !emailConfigured) {
        console.log("Email alert skipped: Gmail credentials are not configured.");
        return;
    }

    const time = new Date().toLocaleString();

    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.ALERT_EMAIL_TO,
            subject: "Temperature Alert!",
            text: `Temperature crossed threshold!\n\nTemp: ${temp}°C\nTime: ${time}`
        });
        console.log("EMAIL SENT");
    } catch (err) {
        console.log("EMAIL FAILED:", err.message);
    }
}

// ===== CONNECTION CHECK =====
function isESP32Connected() {
    return (Date.now() - lastSeen) < 7000;
}

// ===== DASHBOARD =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP32 Dashboard</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f2f2f2; text-align: center; color: #222; }
h1 { margin: 20px 0; }
.status { font-size: 18px; margin-bottom: 24px; }
.container { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; }
.card { background: white; padding: 26px; border-radius: 15px; box-shadow: 0 4px 10px rgba(0,0,0,.1); width: min(320px, 100%); }
.value { font-size: 22px; margin: 14px 0; }
button { padding: 12px 22px; margin: 8px; border: 0; border-radius: 8px; font-size: 16px; cursor: pointer; color: white; }
.on { background: #16803c; } .off { background: #c62828; }
.connected { color: #16803c; } .disconnected { color: #c62828; }
</style>
</head>
<body>
<h1>ESP32 Dashboard</h1>
<div id="status" class="status disconnected">Status: Disconnected</div>
<div class="container">
  <section class="card">
    <h2>LED Control</h2>
    <div id="state" class="value">OFF</div>
    <button class="on" onclick="setLED('on')">ON</button>
    <button class="off" onclick="setLED('off')">OFF</button>
    <div id="ledMessage" aria-live="polite"></div>
  </section>
  <section class="card">
    <h2>DHT11 Sensor</h2>
    <div id="temp" class="value">Temp: --</div>
    <div id="hum" class="value">Humidity: --</div>
  </section>
</div>
<script>
const es = new EventSource('/events');
es.onmessage = (event) => {
  const d = JSON.parse(event.data);
  document.getElementById('state').textContent = d.led;
  document.getElementById('temp').textContent = 'Temp: ' + d.temp + (d.temp === '--' ? '' : ' °C');
  document.getElementById('hum').textContent = 'Humidity: ' + d.hum + (d.hum === '--' ? '' : ' %');
  const status = document.getElementById('status');
  status.textContent = d.connected ? 'Status: Connected' : 'Status: Disconnected';
  status.className = 'status ' + (d.connected ? 'connected' : 'disconnected');
};
es.onerror = () => {
  const status = document.getElementById('status');
  status.textContent = 'Dashboard stream reconnecting...';
  status.className = 'status disconnected';
};
async function setLED(value) {
  try {
    const response = await fetch('/set?led=' + encodeURIComponent(value));
    if (!response.ok) throw new Error('Request failed');
    document.getElementById('ledMessage').textContent = 'LED state set to ' + value.toUpperCase();
  } catch (err) {
    document.getElementById('ledMessage').textContent = 'Could not set LED. Check the server.';
  }
}
</script>
</body>
</html>`);
});

// ===== LED CONTROL =====
app.get('/set', (req, res) => {
    const requested = String(req.query.led || '').toLowerCase();
    if (requested !== 'on' && requested !== 'off') {
        return res.status(400).send("Use ?led=on or ?led=off");
    }
    ledState = requested.toUpperCase();
    console.log("LED:", ledState);
    res.send("OK");
});

// ===== ESP32 UPDATE =====
// Expected JSON body: {"temp": 25.4, "hum": 50.2}
app.post('/update', (req, res) => {
    const temp = Number(req.body.temp);
    const hum = Number(req.body.hum);

    if (req.body.temp === undefined || req.body.hum === undefined ||
        !Number.isFinite(temp) || !Number.isFinite(hum)) {
        return res.status(400).json({ error: "Send numeric temp and hum fields." });
    }

    temperature = temp;
    humidity = hum;
    lastSeen = Date.now();

    console.log(`Temperature: ${temperature} °C | Humidity: ${humidity} %`);

    // Send one alert when temperature reaches 33.5°C.
    if (temperature >= 33.5 && !emailSent) {
        console.log("TEMPERATURE ALERT TRIGGERED");
        emailSent = true;
        void sendEmail(temperature);
    }

    // Re-arm the alert after temperature drops below 33°C.
    if (temperature < 33.0) {
        emailSent = false;
    }

    res.json({ led: ledState });
});

// ===== LIVE DASHBOARD EVENTS =====
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendUpdate = () => {
        const connected = isESP32Connected();
        res.write(`data: ${JSON.stringify({
            led: connected ? ledState : "OFF",
            temp: connected ? temperature : "--",
            hum: connected ? humidity : "--",
            connected
        })}\n\n`);
    };

    sendUpdate();
    const interval = setInterval(sendUpdate, 1000);
    req.on('close', () => clearInterval(interval));
});

// ===== BASIC HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ server: "running", emailConfigured });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} on this computer`);
});
