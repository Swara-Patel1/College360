// Uninstalls the College360 API Windows service.
// Must be run from an ELEVATED (Administrator) shell:  node uninstall-service.cjs
const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'College360 API',
  script: path.join(__dirname, 'server.js'),
});

svc.on('uninstall', () => console.log('✓ Service "College360 API" uninstalled.'));
svc.on('error', (e) => console.error('✗ Service error:', e));

svc.uninstall();
