function calcEnergy(newVal, oldVal) {
  const n = Number(newVal);
  const o = Number(oldVal);
  if (Number.isNaN(n) || Number.isNaN(o)) return "0.000";
  const diff = Math.max(n - o, 0);
  // return NUMBER with 3 decimal places
  return Math.round(diff * 1000) / 1000;
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
            dailyMonthly: data.Main.EnergyMonthly,
            dailyYearly: data.Main.EnergyYearly,
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
            dailyMonthly: data.AirCon.EnergyMonthly,
            dailyYearly: data.AirCon.EnergyYearly,
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
            dailyMonthly: data.Lighting.EnergyMonthly,
            dailyYearly: data.Lighting.EnergyYearly,
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
            dailyMonthly: data.Plug.EnergyMonthly,
            dailyYearly: data.Plug.EnergyYearly,
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
            dailyMonthly: data.Other.EnergyMonthly,
            dailyYearly: data.Other.EnergyYearly,
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