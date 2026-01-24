const WebSocket = require("ws");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(utc);
dayjs.extend(timezone);

const { db } = require("./configs/firebase");

let espClient = null;
let wss = null;

// store last ESP32 message
let esp32Data = []; // realtime storage
let lastSubmittedDate = null; // Track last date submitted
let lastApparentPowerSlot = null;
let lastESP32Timestamp = null;
const ESP32_TIMEOUT_MS = 60 * 1000; // 1 minute without data

const ZERO_DATA = {
  Alarm: {
    Type: "OverCurrent",
    Status: false,
  },
  Main: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ApparentPower: 0,
    ActivePower: 0,
    ReactivePower: 0,
    PowerFactor: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  AirCon: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ApparentPower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Lighting: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ApparentPower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Plug: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ApparentPower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Other: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ApparentPower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
};

function initWebSocket(server) {
  wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
      ws.close();
    });

    ws.on("message", async (msg) => {
      const message = msg.toString();
      broadcast(message); // always broadcast

      let data;
      try {
        data = JSON.parse(message); // try parse
      } catch (error) {
        console.warn("Non-JSON message received:", message);
        return; // just skip storing in Firestore
      }

      lastESP32Timestamp = Date.now(); // ESP32 is alive

      // Store in memory
      esp32Data.push({ ...data, time: new Date() });
      if (esp32Data.length > 1000) esp32Data.shift();

      // Save last reading of the day
      const now = dayjs().tz("Asia/Phnom_Penh");

      // const today = dayjs().format("YYYY-MM-DD");
      const today = now.format("YYYY-MM-DD");
      await saveLastReadingPerDay(today, data);
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      if (ws === espClient) espClient = null;
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.headers["upgrade"] !== "websocket") {
      socket.destroy();
      return;
    }

    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  console.log("WebSocket initialized");
  startTenMinuteScheduler();
}

function isWithinSubmitWindow() {
  const now = dayjs().tz("Asia/Phnom_Penh");
  const start = now.clone().hour(23).minute(59).second(50).millisecond(0);
  const end = now.clone().hour(23).minute(59).second(59).millisecond(999);
  return now.isSameOrAfter(start) && now.isSameOrBefore(end);
}

async function saveApparentPowerPerDay(data) {
  try {
    const now = dayjs().tz("Asia/Phnom_Penh");

    // Only save on 10-minute intervals
    if (now.minute() % 10 !== 0) return;

    const date = now.format("YYYY-MM-DD");
    const timeSlot = now.format("HH:mm");
    const slotKey = `${date}_${timeSlot}`;

    // Prevent duplicate submission in the same 10-min slot
    if (lastApparentPowerSlot === slotKey) return;
    lastApparentPowerSlot = slotKey;

    const batch = db.batch();
    const loads = ["Main", "AirCon", "Lighting", "Plug", "Other"];
    const updatedAt = now.toDate();

    // Optional RTU ID
    const rtuId = data.Customer ? data.Customer.split(",")[1] : null;

    loads.forEach((load) => {
      if (!data[load]) return;

      const docRef = db.collection(load).doc(date);
      const update = {};

      if (rtuId) {
       update[`${rtuId}.apparentPower.${timeSlot}`] = Number(
         data[load].ApparentPower ?? 0,
       );
       update[`${rtuId}.updatedAt`] = updatedAt;

      } else {
       update[`apparentPower.${timeSlot}`] = Number(
         data[load].ApparentPower ?? 0,
       );
       update[`updatedAt`] = updatedAt;
      }

      batch.set(docRef, update, { merge: true });
    });

    await batch.commit();
    console.log(`ApparentPower saved → ${date} / ${timeSlot}`);
  } catch (err) {
    console.error("Error saving ApparentPower:", err);
  }
}

function startTenMinuteScheduler() {
  setInterval(async () => {
    const now = dayjs().tz("Asia/Phnom_Penh");

    // Only trigger on exact 10-min interval
    if (now.minute() % 10 !== 0) return;

    let dataToSave;

    if (
      !lastESP32Timestamp ||
      Date.now() - lastESP32Timestamp > ESP32_TIMEOUT_MS
    ) {
      console.warn("ESP32 OFFLINE → submitting ZERO data");
      dataToSave = ZERO_DATA;
    } else {
      dataToSave = esp32Data[esp32Data.length - 1];
    }

    if (!dataToSave) return;

    await saveApparentPowerPerDay(dataToSave);
  }, 10000); // check every 10 seconds
}

async function saveLastReadingPerDay(date, data) {
  if (!isWithinSubmitWindow()) return;
  if (lastSubmittedDate === date) return;

  const finalData =
    !lastESP32Timestamp || Date.now() - lastESP32Timestamp > ESP32_TIMEOUT_MS
      ? ZERO_DATA
      : data;

  const rtuId = data.Customer ? data.Customer.split(",")[1] : null;

  try {
    const loads = ["Main", "AirCon", "Lighting", "Plug", "Other"];
    const timestamp = dayjs().tz("Asia/Phnom_Penh").endOf("day").toDate();

    const batch = db.batch();

    loads.forEach((load) => {
      if (!finalData[load]) return;

      const docRef = db.collection(load).doc(date);
      const update = {};

      if (rtuId) {
       update[`${rtuId}.energy.monthly`] = Number(
         finalData[load].EnergyMonthly ?? 0,
       );
       update[`${rtuId}.energy.yearly`] = Number(
         finalData[load].EnergyYearly ?? 0,
       );
       update[`${rtuId}.timestamp`] = timestamp;

      } else {
        update[`energy.monthly`] = Number(finalData[load].EnergyMonthly ?? 0);
        update[`energy.yearly`] = Number(finalData[load].EnergyYearly ?? 0);
        update[`timestamp`] = timestamp;
      }

      batch.set(docRef, update, { merge: true });
    });

    await batch.commit();
    lastSubmittedDate = date;

    console.log(`Daily energy submitted → ${date}`);
  } catch (err) {
    console.error("Error saving daily energy:", err);
  }
}

// Send message to ESP32 only
function sendToESP32(message) {
  if (espClient && espClient.readyState === WebSocket.OPEN) {
    espClient.send(message);
  } else {
    console.log("ESP32 not connected");
  }
}

// getter function
function getLastESP32Message() {
  return esp32Data;
}

// Broadcast message to all connected clients
function broadcast(message) {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  console.log("Broadcasted:", message.toString());
}

module.exports = { initWebSocket, sendToESP32, broadcast, getLastESP32Message };
