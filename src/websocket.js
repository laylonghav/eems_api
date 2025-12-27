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
}

function isWithinSubmitWindow() {
  const now = dayjs().tz("Asia/Phnom_Penh");
  const start = now.clone().hour(23).minute(59).second(50).millisecond(0);
  const end = now.clone().hour(23).minute(59).second(59).millisecond(999);
  return now.isSameOrAfter(start) && now.isSameOrBefore(end);
}

function calcEnergy(newVal, oldVal) {
  const n = Number(newVal);
  const o = Number(oldVal);
  if (Number.isNaN(n) || Number.isNaN(o)) return "0.000";
  return Math.max(n - o, 0).toFixed(3);
}

function getYesterday(date) {
  return dayjs(date)
    .tz("Asia/Phnom_Penh")
    .subtract(1, "day")
    .format("YYYY-MM-DD");
}

async function saveLastReadingPerDay(date, data) {
  if (!isWithinSubmitWindow()) return;

  // Prevent multiple writes in the same day
  if (lastSubmittedDate === date) return;

  try {
    const batch = db.batch();
    const timestamp = new Date();
    const yesterday = getYesterday(date);

    /* =============== MAIN =============== */
    if (data.Main) {
      const prevSnap = await db.collection("Main").doc(yesterday).get();
      const prev = prevSnap.exists ? prevSnap.data().energy : null;

      batch.set(
        db.collection("Main").doc(date),
        {
          energy: {
            // monthly: data.Main.EnergyMonthly,
            // yearly: data.Main.EnergyYearly,
            monthly: prev
              ? calcEnergy(data.Main.EnergyMonthly, prev.monthly)
              : 0,
            yearly: prev ? calcEnergy(data.Main.EnergyYearly, prev.yearly) : 0,
          },
          timestamp,
        },
        { merge: true }
      );
    }

    /* =============== AIRCON =============== */
    if (data.AirCon) {
      const prevSnap = await db.collection("AirCon").doc(yesterday).get();
      const prev = prevSnap.exists ? prevSnap.data().energy : null;

      batch.set(
        db.collection("AirCon").doc(date),
        {
          energy: {
            // monthly: data.AirCon.EnergyMonthly,
            // yearly: data.AirCon.EnergyYearly,
            monthly: prev
              ? calcEnergy(data.AirCon.EnergyMonthly, prev.monthly)
              : 0,
            yearly: prev
              ? calcEnergy(data.AirCon.EnergyYearly, prev.yearly)
              : 0,
          },
          timestamp,
        },
        { merge: true }
      );
    }

    /* =============== LIGHTING =============== */
    if (data.Lighting) {
      const prevSnap = await db.collection("Lighting").doc(yesterday).get();
      const prev = prevSnap.exists ? prevSnap.data().energy : null;

      batch.set(
        db.collection("Lighting").doc(date),
        {
          energy: {
            // monthly: data.Lighting.EnergyMonthly,
            // yearly: data.Lighting.EnergyYearly,
            monthly: prev
              ? calcEnergy(data.Lighting.EnergyMonthly, prev.monthly)
              : 0,
            yearly: prev
              ? calcEnergy(data.Lighting.EnergyYearly, prev.yearly)
              : 0,
          },
          timestamp,
        },
        { merge: true }
      );
    }

    /* =============== PLUG =============== */
    if (data.Plug) {
      const prevSnap = await db.collection("Plug").doc(yesterday).get();
      const prev = prevSnap.exists ? prevSnap.data().energy : null;

      batch.set(
        db.collection("Plug").doc(date),
        {
          energy: {
            // monthly: data.Plug.EnergyMonthly,
            // yearly: data.Plug.EnergyYearly,
            monthly: prev
              ? calcEnergy(data.Plug.EnergyMonthly, prev.monthly)
              : 0,
            yearly: prev ? calcEnergy(data.Plug.EnergyYearly, prev.yearly) : 0,
          },
          timestamp,
        },
        { merge: true }
      );
    }

    /* =============== OTHER =============== */
    if (data.Other) {
      const prevSnap = await db.collection("Other").doc(yesterday).get();
      const prev = prevSnap.exists ? prevSnap.data().energy : null;

      batch.set(
        db.collection("Other").doc(date),
        {
          energy: {
            // monthly: data.Other.EnergyMonthly,
            // yearly: data.Other.EnergyYearly,
            monthly: prev
              ? calcEnergy(data.Other.EnergyMonthly, prev.monthly)
              : 0,
            yearly: prev ? calcEnergy(data.Other.EnergyYearly, prev.yearly) : 0,
          },
          timestamp,
        },
        { merge: true }
      );
    }

    await batch.commit();
    lastSubmittedDate = date;

    console.log(
      "Energy calculated & saved at",
      dayjs().tz("Asia/Phnom_Penh").format("YYYY-MM-DD HH:mm:ss")
    );
  } catch (err) {
    if (err.code === 8) {
      console.warn("Firestore quota exceeded - skipped");
    } else {
      console.error("Error saving last reading:", err);
    }
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
  // console.log("Broadcasted:", message.toString());
}

module.exports = { initWebSocket, sendToESP32, broadcast, getLastESP32Message };
