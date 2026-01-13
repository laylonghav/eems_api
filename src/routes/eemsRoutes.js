const express = require("express");
const router = express.Router();
const eemsController = require("../controllers/eemsController");

router.get("/message", eemsController.getESP32Message);
// ESP32 HTTP POST
router.post("/foursg", eemsController.receiveESP32Data);

module.exports = router;
