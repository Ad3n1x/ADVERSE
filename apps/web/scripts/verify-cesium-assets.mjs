import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cesiumOutput = join(webRoot, 'dist/cesium');
const required = [
  'Cesium.js',
  'Assets',
  'ThirdParty',
  'Workers',
  'Widgets',
];

const missing = required.filter(name => {
  const target = join(cesiumOutput, name);
  if (!existsSync(target)) return true;
  return name === 'Cesium.js' ? !statSync(target).isFile() : !statSync(target).isDirectory();
});

if (missing.length) {
  throw new Error(
    'Cesium runtime assets were not copied into the production build: ' +
    missing.join(', ') +
    '. Refusing to produce a deployment with a broken globe.'
  );
}

console.log('Verified Cesium production assets:', required.join(', '));
