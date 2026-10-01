/**
 * Deploy the web app for an environment while keeping a STABLE /exec URL.
 *
 * - If config/env.json has deploymentId → updates that deployment (URL unchanged)
 * - If missing → creates one deployment once and writes deploymentId back to env.json
 *
 * Usage: node scripts/deploy-env.js <dev|prod> [description]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envName = String(process.argv[2] || '').trim().toLowerCase();
const description = String(process.argv[3] || ('LSC ' + envName + ' web app ' + new Date().toISOString().slice(0, 10))).trim();

if (envName !== 'dev' && envName !== 'prod') {
  console.error('Usage: node scripts/deploy-env.js <dev|prod> [description]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const envPath = path.join(root, 'config', 'env.json');

if (!fs.existsSync(envPath)) {
  console.error('Missing config/env.json. Copy config/env.example.json and fill IDs first.');
  process.exit(1);
}

let allEnv;
try {
  allEnv = JSON.parse(fs.readFileSync(envPath, 'utf8'));
} catch (error) {
  console.error('Could not parse config/env.json:', error.message);
  process.exit(1);
}

if (!allEnv[envName] || typeof allEnv[envName] !== 'object') {
  console.error('config/env.json is missing a "' + envName + '" block.');
  process.exit(1);
}

const block = allEnv[envName];
let deploymentId = String(block.deploymentId || '').trim();
if (deploymentId.indexOf('YOUR_') === 0) deploymentId = '';

function runClasp(args) {
  const result = spawnSync('npx', ['clasp', ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: true
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  return stdout + '\n' + stderr;
}

function parseDeploymentId(output) {
  const match = String(output || '').match(/Deployed\s+(AKfycb[A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function webAppUrl(id) {
  return 'https://script.google.com/macros/s/' + id + '/exec';
}

function saveDeploymentId(id) {
  allEnv[envName].deploymentId = id;
  fs.writeFileSync(envPath, JSON.stringify(allEnv, null, 2) + '\n');
  console.log('Saved ' + envName + '.deploymentId to config/env.json (gitignored).');
}

// Ensure active clasp target matches this env.
const prep = spawnSync('node', [path.join('scripts', 'prepare-env.js'), envName], {
  cwd: root,
  encoding: 'utf8',
  shell: true
});
if (prep.stdout) process.stdout.write(prep.stdout);
if (prep.stderr) process.stderr.write(prep.stderr);
if (prep.status !== 0) process.exit(prep.status || 1);

if (deploymentId) {
  console.log('Updating existing ' + envName + ' deployment (stable URL)...');
  console.log('  deploymentId = ' + deploymentId);
  runClasp(['deploy', '-i', deploymentId, '-d', description]);
  console.log('');
  console.log('Stable web app URL (unchanged):');
  console.log('  ' + webAppUrl(deploymentId));
  console.log('Share this URL once. Future deploy:' + envName + ' updates the same link.');
  process.exit(0);
}

console.log('No deploymentId in config/env.json for ' + envName + '.');
console.log('Creating ONE new web app deployment and saving its ID for stable future deploys...');
const output = runClasp(['deploy', '-d', description]);
const createdId = parseDeploymentId(output);
if (!createdId) {
  console.error('Deploy succeeded but could not parse deployment id from clasp output.');
  console.error('Copy the deployment id into config/env.json → ' + envName + '.deploymentId manually.');
  process.exit(1);
}
saveDeploymentId(createdId);
console.log('');
console.log('Stable web app URL (save/share this once):');
console.log('  ' + webAppUrl(createdId));
console.log('Next npm run deploy:' + envName + ' will update this same URL.');
