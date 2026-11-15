import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDirectory, '..');
const localCesiumPath = resolve(webRoot, 'node_modules/cesium');

let packageDirectory = dirname(require.resolve('cesium'));
while (packageDirectory !== dirname(packageDirectory)) {
  const manifestPath = join(packageDirectory, 'package.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.name === 'cesium') break;
  }
  packageDirectory = dirname(packageDirectory);
}

const manifestPath = join(packageDirectory, 'package.json');
if (!existsSync(manifestPath) || JSON.parse(readFileSync(manifestPath, 'utf8')).name !== 'cesium') {
  throw new Error('Unable to resolve the installed Cesium package root.');
}

const requiredPaths = [
  'Build/Cesium/Cesium.js',
  'Build/Cesium/Assets',
  'Build/Cesium/ThirdParty',
  'Build/Cesium/Workers',
  'Build/Cesium/Widgets',
];
for (const relativePath of requiredPaths) {
  if (!existsSync(join(packageDirectory, relativePath))) {
    throw new Error(`Installed Cesium package is incomplete: missing ${relativePath}`);
  }
}

mkdirSync(dirname(localCesiumPath), { recursive: true });
if (existsSync(localCesiumPath)) {
  const localBuild = join(localCesiumPath, 'Build/Cesium');
  if (!requiredPaths.every(relativePath => existsSync(join(localCesiumPath, relativePath)))) {
    throw new Error(
      'The workspace-local node_modules/cesium directory exists but is missing Cesium runtime assets. ' +
      'Remove the stale workspace copy and reinstall dependencies.'
    );
  }
} else {
  symlinkSync(packageDirectory, localCesiumPath, process.platform === 'win32' ? 'junction' : 'dir');
}

const resolvedLocal = realpathSync(localCesiumPath);
if (resolvedLocal !== realpathSync(packageDirectory)) {
  throw new Error('Workspace Cesium path does not resolve to the installed package used by the application.');
}

console.log('ADVERSE Cesium assets resolved:', join(localCesiumPath, 'Build/Cesium'));
