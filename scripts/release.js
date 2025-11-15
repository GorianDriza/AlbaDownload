#!/usr/bin/env node
/**
 * Small helper script to cut a new app release.
 *
 * Usage:
 *   npm run release -- 1.2.7
 *
 * What it does:
 *   - Validates the version string (MAJOR.MINOR.PATCH).
 *   - Updates "version" in package.json and package-lock.json.
 *   - Creates a Git commit and pushes it.
 *   - Creates a Git tag (v<version>) and pushes the tag.
 *
 * In the GitHub repo, pushing the tag is expected to trigger CI
 * (GitHub Actions) which builds the Windows installer and attaches
 * it to a GitHub Release for that tag.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function updateJsonFile(filePath, updater) {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const data = JSON.parse(raw);
  updater(data);
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  const nextVersion = process.argv[2];

  if (!nextVersion) {
    console.error('Usage: npm run release -- <next-version>');
    console.error('Example: npm run release -- 1.2.0');
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
    console.error(`Invalid version "${nextVersion}". Use format MAJOR.MINOR.PATCH (e.g. 1.2.0).`);
    process.exit(1);
  }

  console.log(`Releasing version v${nextVersion}...`);

  updateJsonFile('package.json', pkg => {
    pkg.version = nextVersion;
  });

  if (fs.existsSync('package-lock.json')) {
    updateJsonFile('package-lock.json', lock => {
      lock.version = nextVersion;
      if (lock.packages && lock.packages['']) {
        lock.packages[''].version = nextVersion;
      }
    });
  }

  run('git add package.json package-lock.json');
  run(`git commit -m "chore: release v${nextVersion}"`);
  run('git push');

  run(`git tag v${nextVersion}`);
  run(`git push origin v${nextVersion}`);

  console.log(`Release v${nextVersion} tagged and pushed. GitHub Actions will build the installer and create a release.`);
}

main();
