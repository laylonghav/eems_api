const { getLastESP32Message, broadcast } = require("../websocket");

exports.getESP32Message = (req, res) => {
  const messages = getLastESP32Message();

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(404).json({
      success: false,
      message: "No message received from ESP32 yet",
    });
  }

  res.json({
    success: true,
    count: messages.length,
    data: messages,
  });
};


/**
 * ESP32 sends data via HTTP POST
 */
exports.receiveESP32Data = async (req, res) => {
  try {
    const data = req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid ESP32 payload",
      });
    }

    // Broadcast to WebSocket clients
    broadcast(JSON.stringify(data));
  } catch (error) {
    console.error("ESP32 HTTP error:", error);
  }
};
