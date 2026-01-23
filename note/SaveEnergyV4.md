function startTenMinuteScheduler() {
  setInterval(async () => {
    // if (!esp32Data.length) return;

    const now = dayjs().tz("Asia/Phnom_Penh");
    if (now.minute() % 10 !== 0) return;

    // const latestData = esp32Data[esp32Data.length - 1];

    let dataToSave;

    // ESP32 offline → submit ZERO data
    if (
      !lastESP32Timestamp ||
      Date.now() - lastESP32Timestamp > ESP32_TIMEOUT_MS
    ) {
      console.warn("ESP32 OFFLINE → submitting ZERO data");
      dataToSave = ZERO_DATA;
    } else {
      dataToSave = esp32Data[esp32Data.length - 1];
    }
    // await saveApparentPowerPerDay(latestData);
    await saveApparentPowerPerDay(dataToSave);

  }, 10000); // check every 10 seconds
}

=============================================================================

async function saveLastReadingPerDay(date, data) {
  if (!isWithinSubmitWindow()) return;

  // Prevent multiple writes in the same day
  if (lastSubmittedDate === date) return;

  try {
    const loads = ["Main", "AirCon", "Lighting", "Plug", "Other"];

    //  Check ONE collection only (Main is enough)
    const mainDocRef = db.collection("Main").doc(date);
    const mainSnap = await mainDocRef.get();

    // If energy already saved today → STOP
    if (mainSnap.exists && mainSnap.data()?.energy) {
      console.log("Daily energy already saved:", date);
      return;
    }

    const batch = db.batch();
    const timestamp = new Date();

    loads.forEach((load) => {
      if (data[load]) {
        batch.set(
          db.collection(load).doc(date),
          {
            energy: {
              monthly: data[load].EnergyMonthly,
              yearly: data[load].EnergyYearly,
            },
            timestamp,
          },
          { merge: true },
        );
      }
    });

    await batch.commit();

    lastSubmittedDate = date;

    console.log(" Daily energy submitted:", date);
  } catch (err) {
    if (err.code === 8) {
      console.warn("Firestore quota exceeded – skipped");
    } else {
      console.error("Error saving daily energy:", err);
    }
  }
}