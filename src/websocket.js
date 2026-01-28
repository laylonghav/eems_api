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

// Store data per RTU
let esp32DataByRTU = {}; // { RTU0001: [...], RTU0002: [...] }
let lastSubmittedDateByRTU = {}; // { RTU0001: "2026-01-24", RTU0002: "2026-01-24" }
let lastActivePowerSlotByRTU = {}; // { RTU0001: "2026-01-24 10:00", RTU0002: "2026-01-24 10:10" }
let lastESP32TimestampByRTU = {}; // { RTU0001: 1234567890, RTU0002: 1234567891 }
const ESP32_TIMEOUT_MS = 60 * 1000; // 1 minute without data

const ZERO_DATA_TEMPLATE = {
  Alarm: {
    Type: "OverCurrent",
    Status: false,
  },
  Main: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ActivePower: 0,
    ActivePower: 0,
    ReactivePower: 0,
    PowerFactor: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  AirCon: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ActivePower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Lighting: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ActivePower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Plug: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ActivePower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
  Other: {
    PhaseCurrent: [0, 0, 0],
    PhaseVoltage: [0, 0, 0],
    ActivePower: 0,
    EnergyMonthly: 0,
    EnergyYearly: 0,
  },
};

// Helper function to extract RTU ID - defaults to RTU0001
function extractRTUId(data) {
  if (!data.Customer) return "RTU0001";
  const parts = data.Customer.split(",");
  if (parts.length > 1 && parts[1].trim()) {
    const rtuId = parts[1].trim();
    // If RTU ID is "ID", default to RTU0001
    if (rtuId === "ID") return "RTU0001";
    return rtuId;
  }
  return "RTU0001";
}

// function extractRTUId(data) {
//   if (!data.Customer) return "RTU0001";
//   const parts = data.Customer.split(",");
//   if (parts.length > 1 && parts[1].trim()) {
//     return parts[1].trim();
//   }
//   return "RTU0001";
// }

// Helper function to create ZERO_DATA with Customer info
function createZeroData(rtuId, customerName = "Unknown") {
  return {
    Customer: `${customerName},${rtuId},0,0`,
    ...ZERO_DATA_TEMPLATE,
  };
}

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

      const rtuId = extractRTUId(data);

      // Update timestamp for this specific RTU
      lastESP32TimestampByRTU[rtuId] = Date.now();

      // Initialize array for this RTU if it doesn't exist
      if (!esp32DataByRTU[rtuId]) {
        esp32DataByRTU[rtuId] = [];
      }

      // Store in memory per RTU
      esp32DataByRTU[rtuId].push({ ...data, time: new Date() });
      if (esp32DataByRTU[rtuId].length > 1000) {
        esp32DataByRTU[rtuId].shift();
      }

      // Save last reading of the day
      const now = dayjs().tz("Asia/Phnom_Penh");
      const today = now.format("YYYY-MM-DD");
      await saveLastReadingPerDay(today, data, rtuId);
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

async function saveActivePowerPerDay(data, rtuId) {
  try {
    const now = dayjs().tz("Asia/Phnom_Penh");

    // Only 10-minute slots
    if (now.minute() % 10 !== 0) return;

    const date = now.format("YYYY-MM-DD");
    const timeSlot = now.format("HH:mm");
    const slotKey = `${date} ${timeSlot}`;

    // Prevent duplicate submit in same 10-min slot for this RTU
    if (lastActivePowerSlotByRTU[rtuId] === slotKey) return;
    lastActivePowerSlotByRTU[rtuId] = slotKey;

    const batch = db.batch();
    const loads = ["Main", "AirCon", "Lighting", "Plug", "Other"];

    loads.forEach((load) => {
      if (data[load]) {
        const docRef = db.collection(load).doc(date);
        batch.set(
          docRef,
          {
            [rtuId]: {
              ActivePower: {
                [timeSlot]: data[load].ActivePower ?? 0,
              },
              updatedAt: new Date(),
            },
          },
          { merge: true },
        );
      }
    });

    await batch.commit();
    console.log(`ActivePower saved for ${rtuId} ${date} ${timeSlot}`);
  } catch (err) {
    console.error(`Error saving ActivePower for ${rtuId}:`, err);
  }
}

function startTenMinuteScheduler() {
  setInterval(async () => {
    const now = dayjs().tz("Asia/Phnom_Penh");
    if (now.minute() % 10 !== 0) return;

    // Process each RTU separately
    const allRTUs = Object.keys(esp32DataByRTU);

    // If no RTUs have sent data yet, process RTU0001 with zero data
    if (allRTUs.length === 0) {
      console.warn("No RTU data received → submitting ZERO data for RTU0001");
      await saveActivePowerPerDay(createZeroData("RTU0001"), "RTU0001");
      return;
    }

    for (const rtuId of allRTUs) {
      let dataToSave;

      const lastTimestamp = lastESP32TimestampByRTU[rtuId];
      const isOffline =
        !lastTimestamp || Date.now() - lastTimestamp > ESP32_TIMEOUT_MS;

      if (isOffline) {
        console.warn(`${rtuId} OFFLINE → submitting ZERO data`);
        // Get customer name from last known data if available
        const lastData =
          esp32DataByRTU[rtuId]?.[esp32DataByRTU[rtuId].length - 1];
        const customerName = lastData?.Customer?.split(",")[0] || "Unknown";
        dataToSave = createZeroData(rtuId, customerName);
      } else {
        dataToSave = esp32DataByRTU[rtuId][esp32DataByRTU[rtuId].length - 1];
      }

      await saveActivePowerPerDay(dataToSave, rtuId);
    }
  }, 10000);
}

async function saveLastReadingPerDay(date, data, rtuId) {
  if (!isWithinSubmitWindow()) return;
  if (lastSubmittedDateByRTU[rtuId] === date) return;

  const lastTimestamp = lastESP32TimestampByRTU[rtuId];
  const isOffline =
    !lastTimestamp || Date.now() - lastTimestamp > ESP32_TIMEOUT_MS;

  const finalData = isOffline
    ? createZeroData(rtuId, data.Customer?.split(",")[0] || "Unknown")
    : data;

  try {
    const loads = ["Main", "AirCon", "Lighting", "Plug", "Other"];

    const mainDocRef = db.collection("Main").doc(date);
    const mainSnap = await mainDocRef.get();

    if (mainSnap.exists && mainSnap.data()?.[rtuId]?.energy) {
      console.log(`Daily energy already saved for ${rtuId}:`, date);
      return;
    }

    const batch = db.batch();
    const timestamp = new Date();

    loads.forEach((load) => {
      if (finalData[load]) {
        const docRef = db.collection(load).doc(date);
        batch.set(
          docRef,
          {
            [rtuId]: {
              energy: {
                monthly: finalData[load].EnergyMonthly ?? 0,
                yearly: finalData[load].EnergyYearly ?? 0,
              },
              timestamp,
            },
          },
          { merge: true },
        );
      }
    });

    await batch.commit();
    lastSubmittedDateByRTU[rtuId] = date;

    console.log(`Daily energy submitted for ${rtuId}:`, date);
  } catch (err) {
    console.error(`Error saving daily energy for ${rtuId}:`, err);
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

// getter function - returns all RTU data
function getLastESP32Message() {
  return esp32DataByRTU;
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
