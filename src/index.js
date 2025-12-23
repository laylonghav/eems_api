require("dotenv").config();
const express = require("express");
const http = require("http");

const eemsRoutes = require("./routes/eemsRoutes");
const { initWebSocket } = require("./websocket");

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
initWebSocket(server);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to EEMS API",
    status: "Server is running",
  });
});

app.use("/api/energy", eemsRoutes);

const PORT = process.env.PORT || 10000;
server.listen(PORT, process.env.HOST, () => {
  console.log(`Server listening running on http://${process.env.HOST}:${PORT}`);
  console.log(`Websocket running on wws://${process.env.HOST}:${PORT}/ws`);
});
