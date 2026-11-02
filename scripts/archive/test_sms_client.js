const { sendSms } = require('../src/delivery/sms/smsEthiopiaClient');

async function test() {
  console.log('--- TEST 1: English SMS ---');
  try {
    const res1 = await sendSms(['+251924276862'], '[AgriEtech Alert] Drought Warning for Adama Zuria: Severity is HIGH.');
    console.log('Result 1:', JSON.stringify(res1, null, 2));
  } catch (err) {
    console.error('Error 1:', err.message);
  }

  console.log('\n--- TEST 2: Amharic Alert SMS ---');
  try {
    const res2 = await sendSms(['+251924276862'], '[AgriEtech Alert] Bahir Dar Zuria Woreda Drought Warning: Please conserve water.');
    console.log('Result 2:', JSON.stringify(res2, null, 2));
  } catch (err) {
    console.error('Error 2:', err.message);
  }
}

test();
