import { describe, it, expect } from "vitest";
import { resolveFlag, scopeKeysFor, isWorkforceFlagKey, type FlagRow } from "../flags";

const row = (key: string, scopeKey: string, enabled: boolean): FlagRow => ({ key, scopeKey, enabled });

describe("scopeKeysFor", () => {
  it("lists project, then client, then company", () => {
    expect(scopeKeysFor({ projectId: "p1", clientId: "c1" })).toEqual(["project:p1", "client:c1", "company"]);
  });
  it("is just company with no context", () => {
    expect(scopeKeysFor({})).toEqual(["company"]);
  });
});

describe("resolveFlag", () => {
  it("is off when nothing is configured", () => {
    expect(resolveFlag([], "contractor_workforce_enabled")).toBe(false);
    expect(resolveFlag([], "whatsapp_enabled")).toBe(false);
  });

  it("master switch alone enables the master but not other flags", () => {
    const rows = [row("contractor_workforce_enabled", "company", true)];
    expect(resolveFlag(rows, "contractor_workforce_enabled")).toBe(true);
    expect(resolveFlag(rows, "whatsapp_enabled")).toBe(false);
  });

  it("another flag needs the master on as well", () => {
    expect(resolveFlag([row("whatsapp_enabled", "company", true)], "whatsapp_enabled")).toBe(false);
    const both = [row("contractor_workforce_enabled", "company", true), row("whatsapp_enabled", "company", true)];
    expect(resolveFlag(both, "whatsapp_enabled")).toBe(true);
  });

  it("master off disables everything even if other flags are on", () => {
    const rows = [row("contractor_workforce_enabled", "company", false), row("whatsapp_enabled", "company", true)];
    expect(resolveFlag(rows, "whatsapp_enabled")).toBe(false);
  });

  it("project-level setting overrides client and company", () => {
    const rows = [
      row("contractor_workforce_enabled", "company", true),
      row("whatsapp_enabled", "company", true),
      row("whatsapp_enabled", "project:p1", false),
    ];
    expect(resolveFlag(rows, "whatsapp_enabled", { projectId: "p1", clientId: "c1" })).toBe(false);
    expect(resolveFlag(rows, "whatsapp_enabled", { projectId: "p2", clientId: "c1" })).toBe(true);
  });

  it("allows a pilot: enabled for one project while the company stays off", () => {
    const rows = [
      row("contractor_workforce_enabled", "project:pilot", true),
      row("whatsapp_enabled", "project:pilot", true),
    ];
    expect(resolveFlag(rows, "whatsapp_enabled", { projectId: "pilot", clientId: "c1" })).toBe(true);
    expect(resolveFlag(rows, "whatsapp_enabled", { projectId: "other", clientId: "c1" })).toBe(false);
    expect(resolveFlag(rows, "whatsapp_enabled")).toBe(false);
  });

  it("client-level setting applies to its projects", () => {
    const rows = [
      row("contractor_workforce_enabled", "client:c1", true),
      row("client_digest_enabled", "client:c1", true),
    ];
    expect(resolveFlag(rows, "client_digest_enabled", { projectId: "anything", clientId: "c1" })).toBe(true);
    expect(resolveFlag(rows, "client_digest_enabled", { projectId: "anything", clientId: "c2" })).toBe(false);
  });
});

describe("isWorkforceFlagKey", () => {
  it("accepts known keys only", () => {
    expect(isWorkforceFlagKey("whatsapp_enabled")).toBe(true);
    expect(isWorkforceFlagKey("nope")).toBe(false);
  });
});
