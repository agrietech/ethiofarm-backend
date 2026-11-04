const { prisma, connectDB } = require('../src/config/db');

async function checkSensors() {
  console.log('==============================================');
  console.log('   CHECKING HARDWARE SENSOR FLEET & TELEMETRY ');
  console.log('==============================================\n');

  // 1. Check PostgreSQL Database Sensor Records
  console.log('1. Querying PostgreSQL Database for Hardware Sensors & Readings...');
  await connectDB();
  const sensorCount = await prisma.sensor.count();
  const readingCount = await prisma.sensorReading.count();
  const sensors = await prisma.sensor.findMany({
    take: 10,
    include: {
      farm: { select: { farmName: true, latitude: true, longitude: true, woredaId: true } },
      readings: { take: 3, orderBy: { recordedAt: 'desc' } }
    }
  });

  console.log(`Total Registered Hardware Sensors: ${sensorCount}`);
  console.log(`Total Direct Sensor Readings: ${readingCount}`);
  console.log('\nRegistered Hardware Sensors:');
  sensors.forEach(s => {
    console.log(`- Sensor [${s.hardwareId}] (${s.sensorType}) on farm "${s.farm?.farmName || 'N/A'}": Active=${s.isActive}, ReadingsCount=${s.readings.length}`);
    if (s.readings.length > 0) {
      const r = s.readings[0];
      console.log(`  Latest Reading: SoilMoisture=${r.soilMoisture}%, AmbientTemp=${r.ambientTemp}°C, SoilTemp=${r.soilTemp}°C, Humidity=${r.humidity}%, RecordedAt=${r.recordedAt}`);
    }
  });
}

checkSensors().catch(console.error).finally(() => process.exit(0));
