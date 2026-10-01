/**
 * Copy the env-specific clasp config to .clasp.json (cross-platform).
 * Usage: node scripts/use-clasp-env.js <dev|prod>
 */
const fs = require('fs');
const path = require('path');

const env = process.argv[2];
if (env !== 'dev' && env !== 'prod') {
  console.error('Usage: node scripts/use-clasp-env.js <dev|prod>');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const src = path.join(root, `.clasp-${env}.json`);
const dest = path.join(root, '.clasp.json');

if (!fs.existsSync(src)) {
  console.error(`Missing config: ${src}`);
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log(`Using .clasp-${env}.json -> .clasp.json`);
