import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, it, expect } from "vitest";

/**
 * WOR-155 AC3: No Node built-in module imports anywhere under convex/.
 *
 * Convex functions run in a V8 isolate without Node.js APIs.
 * This test statically scans all .ts files under convex/ and fails
 * if any file imports or requires a Node built-in module.
 */

const NODE_BUILTINS = [
  "crypto",
  "fs",
  "path",
  "os",
  "buffer",
  "child_process",
  "net",
  "http",
  "https",
  "stream",
  "util",
  "events",
  "url",
  "querystring",
  "assert",
  "zlib",
];

const IMPORT_PATTERN = new RegExp(
  `import\\s+.*\\s+from\\s+['"](?:${NODE_BUILTINS.join("|")})['"]`,
);
const REQUIRE_PATTERN = new RegExp(
  `require\\s*\\(\\s*['"](?:${NODE_BUILTINS.join("|")})['"]\\s*\\)`,
);

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "_generated") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

const convexDir = join(__dirname, "../../convex");
const tsFiles = collectTsFiles(convexDir);

describe("AC3: no Node built-in imports in convex/ directory", () => {
  it.each(tsFiles)("%s has no Node built-in imports", (filePath) => {
    const source = readFileSync(filePath, "utf-8");
    const rel = relative(join(__dirname, "../.."), filePath);

    expect(source, `${rel} contains a Node built-in import`).not.toMatch(
      IMPORT_PATTERN,
    );
    expect(source, `${rel} contains a Node built-in require`).not.toMatch(
      REQUIRE_PATTERN,
    );
  });
});
