// DETECTION TEST FIXTURE.
const { exec } = require('child_process');

exec('certutil.exe  -decode  dropped.b64  dropped.exe', (err) => {
  if (err) console.error(err);
});
