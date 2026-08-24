// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = resolve(ROOT, "src");

function files(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.[jt]sx?$/u.test(extname(path)) ? [path] : [];
  });
}

describe("AI server/client secret boundary", () => {
  it("keeps the OpenAI SDK and API-key configuration out of client components", () => {
    const clientFiles = files(SOURCE).filter((file) =>
      readFileSync(file, "utf8").startsWith('"use client"'),
    );
    const violations = clientFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /from ["']openai["']|@\/ai\/(?:provider|service)|OPENAI_API_KEY/u.test(source);
    });
    expect(violations).toEqual([]);
  });

  it("limits OpenAI SDK use and secret configuration to the provider module", () => {
    const sourceFiles = files(SOURCE);
    const sdkUsers = sourceFiles.filter((file) =>
      /from ["']openai["']/u.test(readFileSync(file, "utf8")),
    );
    const apiKeyUsers = sourceFiles.filter((file) =>
      /OPENAI_API_KEY/u.test(readFileSync(file, "utf8")),
    );
    expect(sdkUsers).toEqual([resolve(SOURCE, "ai", "provider.ts")]);
    expect(apiKeyUsers).toEqual([resolve(SOURCE, "ai", "provider.ts")]);
  });
});
