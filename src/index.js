require("dotenv").config();
const express = require("express");
const http = require("http");

const eemsRoutes = require("./routes/eemsRoutes");
const { initWebSocket } = require("./websocket");

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
initWebSocket(server);

app.use("/api/energy", eemsRoutes);

const PORT = process.env.PORT || 10000;
server.listen(PORT, process.env.HOST, () => {
  console.log(`Server listening running on http://${process.env.HOST}:${PORT}`);
  console.log(`Websocket running on wws://${process.env.HOST}:${PORT}/ws`);
});
