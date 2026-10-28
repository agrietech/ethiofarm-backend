const axios = require('axios');
const logger = require('../../utils/logger');

const openWeatherMapConnector = {
  name: 'OPENWEATHERMAP',
  
  async fetchCurrentWeather({ lat, lng }) {
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('OpenWeatherMap API key not configured');
      }

      const url = `${process.env.OPENWEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5'}/weather`;
      const response = await axios.get(url, {
        params: {
          lat,
          lon: lng,
          appid: apiKey,
          units: 'metric'
        },
        timeout: 5000
      });

      const data = response.data;
      return {
        source: 'OPENWEATHERMAP',
        location: {
          name: data.name,
          country: data.sys?.country,
          lat: data.coord?.lat,
          lng: data.coord?.lon
        },
        weather: {
          main: data.weather?.[0]?.main,
          description: data.weather?.[0]?.description,
          icon: data.weather?.[0]?.icon
        },
        temperature: {
          current: data.main?.temp,
          feelsLike: data.main?.feels_like,
          min: data.main?.temp_min,
          max: data.main?.temp_max,
          unit: 'Celsius'
        },
        humidity: data.main?.humidity,
        pressure: data.main?.pressure,
        wind: {
          speed: data.wind?.speed,
          direction: data.wind?.deg,
          unit: 'm/s'
        },
        clouds: data.clouds?.all,
        visibility: data.visibility,
        timestamp: new Date(data.dt * 1000).toISOString(),
        sunrise: new Date(data.sys?.sunrise * 1000).toISOString(),
        sunset: new Date(data.sys?.sunset * 1000).toISOString()
      };
    } catch (err) {
      logger.error(`[OpenWeatherMap] Current weather failed for lat=${lat}, lng=${lng}: ${err.message}`);
      throw err;
    }
  },
  
  async fetch5DayForecast({ lat, lng }) {
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error('OpenWeatherMap API key not configured');
      }

      const url = `${process.env.OPENWEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5'}/forecast`;
      const response = await axios.get(url, {
        params: {
          lat,
          lon: lng,
          appid: apiKey,
          units: 'metric'
        },
        timeout: 10000
      });

      const data = response.data;
      const forecasts = (data.list || []).map(item => ({
        timestamp: new Date(item.dt * 1000).toISOString(),
        temperature: item.main?.temp,
        feelsLike: item.main?.feels_like,
        humidity: item.main?.humidity,
        pressure: item.main?.pressure,
        weather: item.weather?.[0]?.main,
        description: item.weather?.[0]?.description,
        windSpeed: item.wind?.speed,
        clouds: item.clouds?.all,
        rain3h: item.rain?.['3h'] || 0,
        snow3h: item.snow?.['3h'] || 0
      }));

      return {
        source: 'OPENWEATHERMAP_FORECAST',
        location: {
          name: data.city?.name,
          country: data.city?.country,
          lat: data.city?.coord?.lat,
          lng: data.city?.coord?.lon
        },
        forecastCount: forecasts.length,
        forecasts,
        unit: 'metric'
      };
    } catch (err) {
      logger.error(`[OpenWeatherMap] 5-day forecast failed for lat=${lat}, lng=${lng}: ${err.message}`);
      throw err;
    }
  }
};

module.exports = openWeatherMapConnector;
