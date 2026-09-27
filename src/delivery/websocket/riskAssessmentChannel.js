const { getIO } = require('../../config/socket');
const logger = require('../../utils/logger');

// Broadcast risk assessment update to woreda and national channel subscribers
function broadcastRiskUpdate(woredaId, assessmentData) {
  try {
    const io = getIO();
    const payload = {
      woredaId,
      timestamp: new Date().toISOString(),
      data: assessmentData,
    };
    if (woredaId) {
      io.to(`woreda:${woredaId}`).to('national:telemetry').emit('risk:update', payload);
      io.to(`woreda:${woredaId}`).to('national:telemetry').emit('risk:updated', payload);
    } else {
      io.emit('risk:update', payload);
    }
  } catch (err) {
    logger.warn(`WebSocket risk broadcast notice: ${err.message}`);
  }
}

// Broadcast critical emergency alert to targeted scope and national command center
function broadcastEmergencyAlert(alertPayload) {
  try {
    const io = getIO();
    const eventData = {
      timestamp: new Date().toISOString(),
      alert: alertPayload,
    };

    if (alertPayload?.woredaId) {
      io.to(`woreda:${alertPayload.woredaId}`).to('national:telemetry').emit('emergency:alert', eventData);
      io.to(`woreda:${alertPayload.woredaId}`).to('national:telemetry').emit('alert:new', eventData);
    } else if (alertPayload?.zoneId) {
      io.to(`zone:${alertPayload.zoneId}`).to('national:telemetry').emit('emergency:alert', eventData);
      io.to(`zone:${alertPayload.zoneId}`).to('national:telemetry').emit('alert:new', eventData);
    } else if (alertPayload?.regionId) {
      io.to(`region:${alertPayload.regionId}`).to('national:telemetry').emit('emergency:alert', eventData);
      io.to(`region:${alertPayload.regionId}`).to('national:telemetry').emit('alert:new', eventData);
    } else {
      // National or unscoped emergency
      io.emit('emergency:alert', eventData);
      io.emit('alert:new', eventData);
    }
  } catch (err) {
    logger.warn(`WebSocket alert skipped: ${err.message}`);
  }
}

// Broadcast real-time IoT sensor telemetry reading
function broadcastTelemetry({ farmId, woredaId, reading }) {
  try {
    const io = getIO();
    const payload = {
      timestamp: new Date().toISOString(),
      farmId,
      woredaId,
      reading,
    };

    let target = io;
    if (farmId) {
      target = target.to(`farm:${farmId}`);
    }
    if (woredaId) {
      target = target.to(`woreda:${woredaId}`);
    }
    target = target.to('national:telemetry');

    // Emit both sensor_reading (for Flutter app compatibility) and telemetry:new (API standard)
    target.emit('sensor_reading', reading || payload);
    target.emit('telemetry:new', payload);
  } catch (err) {
    logger.warn(`WebSocket telemetry broadcast notice: ${err.message}`);
  }
}

// Broadcast crop disease diagnosis update to farmer and local extension agent
function broadcastDiagnosisUpdate({ farmerId, farmId, woredaId, diagnosis }) {
  try {
    const io = getIO();
    const payload = {
      timestamp: new Date().toISOString(),
      farmerId,
      farmId,
      woredaId,
      diagnosis,
    };

    let target = io;
    if (farmerId) target = target.to(`user:${farmerId}`);
    if (farmId) target = target.to(`farm:${farmId}`);
    if (woredaId) target = target.to(`woreda:${woredaId}`);
    target = target.to('national:telemetry');

    target.emit('diagnosis:new', payload);
    target.emit('diagnosis:update', payload);
  } catch (err) {
    logger.warn(`WebSocket diagnosis broadcast notice: ${err.message}`);
  }
}

module.exports = {
  broadcastRiskUpdate,
  broadcastEmergencyAlert,
  broadcastTelemetry,
  broadcastDiagnosisUpdate,
};
