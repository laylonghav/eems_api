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