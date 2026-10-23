import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(apiRoot, "src");

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = (await collectJavaScriptFiles(sourceRoot)).sort();

if (files.length === 0) {
  console.error(`No JavaScript source files found under ${path.relative(apiRoot, sourceRoot)}.`);
  process.exit(1);
}

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: apiRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`\nSyntax check failed: ${path.relative(apiRoot, file)}`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (failed) {
  console.error(`\nAPI syntax check failed for one or more of ${files.length} source files.`);
  process.exit(1);
}

console.log(`API syntax check passed for all ${files.length} JavaScript source files.`);
