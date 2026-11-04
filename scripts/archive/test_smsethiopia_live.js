const { sendSms, sendEmergencyAlert, formatMsisdnForSmsEthiopia } = require('../src/delivery/sms/smsEthiopiaClient');

async function verifySmsEthiopia() {
  console.log('=== SMSEthiopia Live Gateway Verification ===');
  console.log('Testing Phone Number Normalization:');
  console.log('+251911234567 ->', formatMsisdnForSmsEthiopia('+251911234567'));
  console.log('0911234567    ->', formatMsisdnForSmsEthiopia('0911234567'));
  console.log('911234567     ->', formatMsisdnForSmsEthiopia('911234567'));
  console.log('251911234567  ->', formatMsisdnForSmsEthiopia('251911234567'));

  console.log('\nTesting Dispatch via SMSEthiopia Client...');
  const res = await sendSms('0911234567', 'EthioFarm SMSEthiopia integration live verification probe.');
  console.log('Dispatch Response:', JSON.stringify(res, null, 2));

  console.log('\nTesting Emergency Alert Formatting & Dispatch...');
  const alertRes = await sendEmergencyAlert({
    to: '0911234567',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    woredaName: 'Adama Zuria',
    lang: 'am',
  });
  console.log('Emergency Alert Response:', JSON.stringify(alertRes, null, 2));

  console.log('\n=== SMSEthiopia Verification Complete ===');
}

verifySmsEthiopia().catch(console.error);
