const { sendSms } = require('../src/delivery/sms/smsEthiopiaClient');
const env = require('../src/config/env');

console.log('Testing SMS Ethiopia Gateway...');
console.log('Sender ID:', env.SMS_ETHIOPIA_SENDER_ID);
console.log('API Key configured:', env.SMS_ETHIOPIA_API_KEY ? 'YES (' + env.SMS_ETHIOPIA_API_KEY.substring(0, 10) + '...)' : 'NO');

async function run() {
  try {
    const result = await sendSms(
      '+251977100607',
      '[EthioFarm Test] Early Warning SMS System verified successfully via SMS Ethiopia gateway.'
    );
    console.log('\n--- SUCCESS RESPONSE FROM SMS ETHIOPIA ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log('\n--- ERROR / NOTICE FROM SMS ETHIOPIA ---');
    console.error(err.message || err);
  }
}

run();

