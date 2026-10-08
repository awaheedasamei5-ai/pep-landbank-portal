// Adapted verbatim from plane's packages/i18n/scripts/generate-types.ts --
// rewritten as a .mjs so it runs directly with plain `node`, since this
// copy isn't its own pnpm package with a `tsx` devDependency wired up.
// Usage: node src/openplane/i18n/scripts/generate-types.mjs
// Reads: src/openplane/i18n/locales/en/*.json
// Writes: src/openplane/i18n/types/keys.generated.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COPYRIGHT_HEADER = `/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */`;

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(fullKey);
    } else if (typeof value === "object" && value !== null) {
      keys.push(...flattenKeys(value, fullKey));
    }
  }
  return keys;
}

function detectPathConflicts(keys) {
  const prefixes = new Set();
  for (const key of keys) {
    const parts = key.split(".");
    for (let i = 1; i < parts.length; i++) {
      prefixes.add(parts.slice(0, i).join("."));
    }
  }
  const conflicts = [];
  for (const key of keys) {
    if (prefixes.has(key)) {
      const extending = keys.find((k) => k.startsWith(key + "."));
      if (extending) {
        conflicts.push(`Path conflict: "${key}" is both a leaf key and a prefix of "${extending}"`);
      }
    }
  }
  return conflicts;
}

function main() {
  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const localesDir = path.resolve(rootDir, "..", "locales", "en");
  const outputDir = path.resolve(rootDir, "..", "types");
  const outputFile = path.join(outputDir, "keys.generated.ts");

  if (!fs.existsSync(localesDir)) {
    console.error(`Error: Locales directory not found: ${localesDir}`);
    process.exit(1);
  }

  const jsonFiles = fs
    .readdirSync(localesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (jsonFiles.length === 0) {
    console.error(`Error: No JSON files found in ${localesDir}`);
    process.exit(1);
  }

  const keysByFile = new Map();
  const allKeys = new Set();
  const collisions = [];

  for (const file of jsonFiles) {
    const filePath = path.join(localesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(`Error: Failed to parse JSON in ${file}`);
      process.exit(1);
    }

    const fileKeys = flattenKeys(parsed);
    keysByFile.set(file, fileKeys);

    for (const key of fileKeys) {
      if (allKeys.has(key)) {
        for (const [otherFile, otherKeys] of keysByFile.entries()) {
          if (otherFile !== file && otherKeys.includes(key)) {
            collisions.push(`Cross-namespace collision: key "${key}" exists in both "${otherFile}" and "${file}"`);
          }
        }
      }
      allKeys.add(key);
    }
  }

  if (collisions.length > 0) {
    console.error("Error: Cross-namespace key collisions detected:");
    for (const c of collisions) console.error(`  ${c}`);
    process.exit(1);
  }

  const sortedKeys = [...allKeys].sort();
  const pathConflicts = detectPathConflicts(sortedKeys);
  if (pathConflicts.length > 0) {
    console.error("Error: Path conflicts detected:");
    for (const c of pathConflicts) console.error(`  ${c}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const keyLines = sortedKeys.map((key) => `  | "${key}"`).join("\n");
  const output = `${COPYRIGHT_HEADER}

// AUTO-GENERATED -- DO NOT EDIT
// Generated from ${jsonFiles.length} English namespace files (${sortedKeys.length} keys)
// Run: node src/openplane/i18n/scripts/generate-types.mjs

export type TTranslationKeys =
${keyLines}
  ;
`;

  fs.writeFileSync(outputFile, output, "utf-8");
  console.log(`Generated ${sortedKeys.length} keys from ${jsonFiles.length} namespace files`);
}

main();
