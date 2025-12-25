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
  const start = now.clone().hour(17).minute(18).second(50).millisecond(0);
  const end = now.clone().hour(17).minute(18).second(59).millisecond(999);
  return now.isSameOrAfter(start) && now.isSameOrBefore(end);
}

async function saveLastReadingPerDay(date, data) {
  if (!isWithinSubmitWindow()) return;

  // Prevent multiple writes in the same day
  if (lastSubmittedDate === date) return;

  try {
    const batch = db.batch();
    const timestamp = new Date();

    if (data.Main) {
      batch.set(
        db.collection("Main").doc(date),
        {
          energy: {
            monthly: data.Main.EnergyMonthly,
            yearly: data.Main.EnergyYearly,
          },
          timestamp: timestamp,
        },
        { merge: true }
      );
    }

    if (data.AirCon) {
      batch.set(
        db.collection("AirCon").doc(date),
        {
          energy: {
            monthly: data.AirCon.EnergyMonthly,
            yearly: data.AirCon.EnergyYearly,
          },
          timestamp: timestamp,
        },
        { merge: true }
      );
    }

    if (data.Lighting) {
      batch.set(
        db.collection("Lighting").doc(date),
        {
          energy: {
            monthly: data.Lighting.EnergyMonthly,
            yearly: data.Lighting.EnergyYearly,
          },
          timestamp: timestamp,
        },
        { merge: true }
      );
    }

    if (data.Plug) {
      batch.set(
        db.collection("Plug").doc(date),
        {
          energy: {
            monthly: data.Plug.EnergyMonthly,
            yearly: data.Plug.EnergyYearly,
          },
          timestamp: timestamp,
        },
        { merge: true }
      );
    }

    if (data.Other) {
      batch.set(
        db.collection("Other").doc(date),
        {
          energy: {
            monthly: data.Other.EnergyMonthly,
            yearly: data.Other.EnergyYearly,
          },
          timestamp: timestamp,
        },
        { merge: true }
      );
    }

    await batch.commit();
    lastSubmittedDate = date;

    const now = dayjs().tz("Asia/Phnom_Penh");
    console.log("Data submitted at", now.format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    if (err.code === 8) {
      console.warn("Firestore quota exceeded – skipped");
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

// Save last reading per day (overwrite the same document)
// async function saveLastReadingPerDay(date, data) {
//   try {
//     // Main
//     if (data.Main) {
//       await db
//         .collection("Main")
//         .doc(date)
//         .set({
//           energy: {
//             monthly: data.Main.EnergyMonthly,
//             yearly: data.Main.EnergyYearly,
//           },
//           timestamp: new Date(),
//         });
//     }

//     // AirCon
//     if (data.AirCon) {
//       await db
//         .collection("AirCon")
//         .doc(date)
//         .set({
//           energy: {
//             monthly: data.AirCon.EnergyMonthly,
//             yearly: data.AirCon.EnergyYearly,
//           },
//           timestamp: new Date(),
//         });
//     }

//     // Lighting
//     if (data.Lighting) {
//       await db
//         .collection("Lighting")
//         .doc(date)
//         .set({
//           energy: {
//             monthly: data.Lighting.EnergyMonthly,
//             yearly: data.Lighting.EnergyYearly,
//           },
//           timestamp: new Date(),
//         });
//     }

//     // Plug
//     if (data.Plug) {
//       await db
//         .collection("Plug")
//         .doc(date)
//         .set({
//           energy: {
//             monthly: data.Plug.EnergyMonthly,
//             yearly: data.Plug.EnergyYearly,
//           },
//           timestamp: new Date(),
//         });
//     }

//     // Other
//     if (data.Other) {
//       await db
//         .collection("Other")
//         .doc(date)
//         .set({
//           energy: {
//             monthly: data.Other.EnergyMonthly,
//             yearly: data.Other.EnergyYearly,
//           },
//           timestamp: new Date(),
//         });
//     }
//     const now = dayjs().tz("Asia/Phnom_Penh");

//     console.log("Saved last reading for", now.format("YYYY-MM-DD"));
//     console.log("Current Time:", now.format("YYYY-MM-DD HH:mm:ss"));
//   } catch (err) {
//     console.error("Error saving last reading:", err.message);
//   }
// }

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
