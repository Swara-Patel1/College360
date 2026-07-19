// Installs the College360 API as a Windows service (auto-starts on boot).
// Must be run from an ELEVATED (Administrator) shell:  node install-service.cjs
const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'College360 API',
  description: 'MongoDB-backed data API for College360 (replaces Supabase). Serves http://localhost:4000',
  script: path.join(__dirname, 'server.js'),
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on('install', () => {
  console.log('✓ Service installed. Starting…');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('ℹ Service already installed. Run uninstall-service.cjs first to reinstall.'));
svc.on('start', () => console.log('✓ Service "College360 API" started → http://localhost:4000'));
svc.on('error', (e) => console.error('✗ Service error:', e));

svc.install();
