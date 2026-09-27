const express = require('express');
const router = express.Router();
const controller = require('./weather.controller');
const { optionalAuthenticate } = require('../../middleware/auth.middleware');

// Public / Authenticated weather forecast & location lookup routes
router.get('/forecast', optionalAuthenticate, controller.getForecast);
router.get('/current', optionalAuthenticate, controller.getCurrentWeather);
router.get('/locations', optionalAuthenticate, controller.getLocations);

module.exports = router;
