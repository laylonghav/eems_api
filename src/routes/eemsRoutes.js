const express = require("express");
const router = express.Router();
const eemsController = require("../controllers/eemsController");

router.get("/message", eemsController.getESP32Message);

module.exports = router;
