// async function saveLastReadingPerDay(date, data) {
//   if (!isWithinSubmitWindow()) return;

//   // Prevent multiple writes in the same day
//   if (lastSubmittedDate === date) return;

//   try {
//     const batch = db.batch();
//     const timestamp = new Date();

//     if (data.Main) {
//       batch.set(
//         db.collection("Main").doc(date),
//         {
//           energy: {
//             monthly: data.Main.EnergyMonthly,
//             yearly: data.Main.EnergyYearly,
//           },
//           timestamp: timestamp,
//         },
//         { merge: true }
//       );
//     }

//     if (data.AirCon) {
//       batch.set(
//         db.collection("AirCon").doc(date),
//         {
//           energy: {
//             monthly: data.AirCon.EnergyMonthly,
//             yearly: data.AirCon.EnergyYearly,
//           },
//           timestamp: timestamp,
//         },
//         { merge: true }
//       );
//     }

//     if (data.Lighting) {
//       batch.set(
//         db.collection("Lighting").doc(date),
//         {
//           energy: {
//             monthly: data.Lighting.EnergyMonthly,
//             yearly: data.Lighting.EnergyYearly,
//           },
//           timestamp: timestamp,
//         },
//         { merge: true }
//       );
//     }

//     if (data.Plug) {
//       batch.set(
//         db.collection("Plug").doc(date),
//         {
//           energy: {
//             monthly: data.Plug.EnergyMonthly,
//             yearly: data.Plug.EnergyYearly,
//           },
//           timestamp: timestamp,
//         },
//         { merge: true }
//       );
//     }

//     if (data.Other) {
//       batch.set(
//         db.collection("Other").doc(date),
//         {
//           energy: {
//             monthly: data.Other.EnergyMonthly,
//             yearly: data.Other.EnergyYearly,
//           },
//           timestamp: timestamp,
//         },
//         { merge: true }
//       );
//     }

//     await batch.commit();
//     lastSubmittedDate = date;

//     const now = dayjs().tz("Asia/Phnom_Penh");
//     console.log("Data submitted at", now.format("YYYY-MM-DD HH:mm:ss"));
//   } catch (err) {
//     if (err.code === 8) {
//       console.warn("Firestore quota exceeded – skipped");
//     } else {
//       console.error("Error saving last reading:", err);
//     }
//   }
// }