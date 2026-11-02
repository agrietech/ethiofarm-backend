/**
 * Test & Verify Role-Based Scope Enforcement
 * Tests:
 * 1. buildUserScope for FARMER, DA (kebele & woreda), WOREDA_OFFICER, ZONAL_OFFICER, REGIONAL_OFFICER, ADMIN
 * 2. buildFarmScope for all roles
 * 3. buildAlertScope for all roles
 * 4. buildSensorScope for all roles
 * 5. buildDiagnosisScope for all roles
 * 6. assertResourceInScope rejecting out-of-scope and allowing in-scope access
 */
const assert = require('assert');
const {
  isNationalScope,
  buildUserScope,
  buildFarmScope,
  buildAlertScope,
  buildSensorScope,
  buildDiagnosisScope,
  assertResourceInScope,
} = require('../src/middleware/scope-filter.utils');

console.log('\n========================================');
console.log('  TESTING JURISDICTIONAL SCOPE FILTERS  ');
console.log('========================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// ── Test Users ──
const nationalAdmin = { id: 'u_admin', role: 'ADMIN' };
const researcher = { id: 'u_researcher', role: 'RESEARCHER' };
const regionalOfficer = { id: 'u_reg_oromia', role: 'REGIONAL_OFFICER', regionId: 'reg_oromia' };
const zonalOfficer = { id: 'u_zone_jimma', role: 'ZONAL_OFFICER', regionId: 'reg_oromia', zoneId: 'zone_jimma' };
const woredaOfficer = { id: 'u_woreda_mana', role: 'WOREDA_OFFICER', regionId: 'reg_oromia', zoneId: 'zone_jimma', woredaId: 'woreda_mana' };
const devAgent = { id: 'u_da_kebele1', role: 'DEVELOPMENT_AGENT', regionId: 'reg_oromia', zoneId: 'zone_jimma', woredaId: 'woreda_mana', kebeleId: 'kebele_01' };
const farmer = { id: 'u_farmer_abebe', role: 'FARMER', regionId: 'reg_oromia', zoneId: 'zone_jimma', woredaId: 'woreda_mana', kebeleId: 'kebele_01' };

// ── 1. National Scope Check ──
test('ADMIN and RESEARCHER have national scope', () => {
  assert.strictEqual(isNationalScope(nationalAdmin), true);
  assert.strictEqual(isNationalScope(researcher), true);
  assert.strictEqual(isNationalScope(regionalOfficer), false);
  assert.strictEqual(isNationalScope(zonalOfficer), false);
  assert.strictEqual(isNationalScope(woredaOfficer), false);
  assert.strictEqual(isNationalScope(devAgent), false);
  assert.strictEqual(isNationalScope(farmer), false);
});

// ── 2. Farm Scope Filter ──
test('Farm scope for Farmer: only own farms (userId)', () => {
  const scope = buildFarmScope(farmer);
  assert.deepStrictEqual(scope, { userId: 'u_farmer_abebe' });
});

test('Farm scope for DA with kebeleId: scoped to kebeleId', () => {
  const scope = buildFarmScope(devAgent);
  assert.deepStrictEqual(scope, { kebeleId: 'kebele_01' });
});

test('Farm scope for Woreda Officer: scoped to woredaId', () => {
  const scope = buildFarmScope(woredaOfficer);
  assert.deepStrictEqual(scope, { woredaId: 'woreda_mana' });
});

test('Farm scope for Zonal Officer: scoped to zoneId via woreda', () => {
  const scope = buildFarmScope(zonalOfficer);
  assert.deepStrictEqual(scope, { woreda: { zoneId: 'zone_jimma' } });
});

test('Farm scope for Regional Officer: scoped to regionId via woreda.zone', () => {
  const scope = buildFarmScope(regionalOfficer);
  assert.deepStrictEqual(scope, { woreda: { zone: { regionId: 'reg_oromia' } } });
});

test('Farm scope for Admin: unrestricted (empty where)', () => {
  const scope = buildFarmScope(nationalAdmin);
  assert.deepStrictEqual(scope, {});
});

// ── 3. Alert Scope Filter ──
test('Alert scope for Farmer / DA / Woreda: scoped to woredaId', () => {
  assert.deepStrictEqual(buildAlertScope(farmer), { woredaId: 'woreda_mana' });
  assert.deepStrictEqual(buildAlertScope(devAgent), { woredaId: 'woreda_mana' });
  assert.deepStrictEqual(buildAlertScope(woredaOfficer), { woredaId: 'woreda_mana' });
});

test('Alert scope for Zonal Officer: scoped to zoneId via woreda', () => {
  assert.deepStrictEqual(buildAlertScope(zonalOfficer), { woreda: { zoneId: 'zone_jimma' } });
});

test('Alert scope for Regional Officer: scoped to regionId via woreda.zone', () => {
  assert.deepStrictEqual(buildAlertScope(regionalOfficer), { woreda: { zone: { regionId: 'reg_oromia' } } });
});

// ── 4. Sensor & Diagnosis Scope Filters ──
test('Sensor scope for DA with kebeleId: scoped to farm.kebeleId', () => {
  assert.deepStrictEqual(buildSensorScope(devAgent), { farm: { kebeleId: 'kebele_01' } });
});

test('Sensor scope for Woreda Officer: scoped to farm.woredaId', () => {
  assert.deepStrictEqual(buildSensorScope(woredaOfficer), { farm: { woredaId: 'woreda_mana' } });
});

test('Diagnosis scope for Farmer: scoped to farm.userId', () => {
  assert.deepStrictEqual(buildDiagnosisScope(farmer), { farm: { userId: 'u_farmer_abebe' } });
});

test('Diagnosis scope for Zonal Officer: scoped to farm.woreda.zoneId', () => {
  assert.deepStrictEqual(buildDiagnosisScope(zonalOfficer), { farm: { woreda: { zoneId: 'zone_jimma' } } });
});

// ── 5. assertResourceInScope Detail Access Check ──
test('assertResourceInScope: Farmer accessing own farm allows, other farm throws', () => {
  const ownFarm = { id: 'f1', userId: 'u_farmer_abebe', woredaId: 'woreda_mana' };
  const otherFarm = { id: 'f2', userId: 'u_other_farmer', woredaId: 'woreda_mana' };

  assert.strictEqual(assertResourceInScope(farmer, ownFarm, 'farm'), true);
  assert.throws(() => assertResourceInScope(farmer, otherFarm, 'farm'), /Access denied/);
});

test('assertResourceInScope: DA accessing farm in kebele allows, other kebele throws', () => {
  const inKebeleFarm = { id: 'f1', kebeleId: 'kebele_01', woredaId: 'woreda_mana' };
  const outKebeleFarm = { id: 'f2', kebeleId: 'kebele_02', woredaId: 'woreda_mana' };

  assert.strictEqual(assertResourceInScope(devAgent, inKebeleFarm, 'farm'), true);
  assert.throws(() => assertResourceInScope(devAgent, outKebeleFarm, 'farm'), /outside your kebele/);
});

test('assertResourceInScope: Woreda Officer accessing farm in woreda allows, other woreda throws', () => {
  const inWoredaFarm = { id: 'f1', woredaId: 'woreda_mana' };
  const outWoredaFarm = { id: 'f2', woredaId: 'woreda_other' };

  assert.strictEqual(assertResourceInScope(woredaOfficer, inWoredaFarm, 'farm'), true);
  assert.throws(() => assertResourceInScope(woredaOfficer, outWoredaFarm, 'farm'), /outside your woreda/);
});

test('assertResourceInScope: Zonal Officer accessing farm in zone allows, other zone throws', () => {
  const inZoneFarm = { id: 'f1', woredaId: 'woreda_mana', woreda: { zoneId: 'zone_jimma' } };
  const outZoneFarm = { id: 'f2', woredaId: 'woreda_other', woreda: { zoneId: 'zone_other' } };

  assert.strictEqual(assertResourceInScope(zonalOfficer, inZoneFarm, 'farm'), true);
  assert.throws(() => assertResourceInScope(zonalOfficer, outZoneFarm, 'farm'), /outside your zone/);
});

test('assertResourceInScope: Regional Officer accessing farm in region allows, other region throws', () => {
  const inRegionFarm = { id: 'f1', woredaId: 'woreda_mana', woreda: { zone: { regionId: 'reg_oromia' } } };
  const outRegionFarm = { id: 'f2', woredaId: 'woreda_other', woreda: { zone: { regionId: 'reg_amhara' } } };

  assert.strictEqual(assertResourceInScope(regionalOfficer, inRegionFarm, 'farm'), true);
  assert.throws(() => assertResourceInScope(regionalOfficer, outRegionFarm, 'farm'), /outside your region/);
});

test('assertResourceInScope: Admin can access any resource', () => {
  const anyFarm = { id: 'f99', woredaId: 'woreda_any', woreda: { zone: { regionId: 'reg_any' } } };
  assert.strictEqual(assertResourceInScope(nationalAdmin, anyFarm, 'farm'), true);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
