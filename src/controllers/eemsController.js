const { getLastESP32Message } = require("../websocket");

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
