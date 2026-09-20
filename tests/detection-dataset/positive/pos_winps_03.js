// DETECTION TEST FIXTURE -- inert payload.
const { execSync } = require('child_process');

const blob = 'VwByAGkAdABlAC0ASABvAHMAdAAgACIAaABpACIA';
execSync(`powershell -e ${blob}`);
