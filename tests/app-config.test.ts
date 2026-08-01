import { describe, expect, it } from "vitest";

import { appConfig } from "../src/lib/app-config";

describe("application foundation", () => {
  it("identifies the product and keeps AI disabled in Phase 0", () => {
    expect(appConfig.name).toBe("InsightAI");
    expect(appConfig.currentPhase).toBe(0);
    expect(appConfig.aiEnabled).toBe(false);
  });

  it("exposes immutable application metadata", () => {
    expect(Object.isFrozen(appConfig)).toBe(true);
  });
});
