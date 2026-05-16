import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tesla UI surface", () => {
  const serverSource = readFileSync(join(process.cwd(), "src/app/server.ts"), "utf8");
  const appJsSource = readFileSync(join(process.cwd(), "public/app.js"), "utf8");

  it("keeps the Tesla controls and OAuth debug link in the main HTML", () => {
    expect(serverSource).toContain('id="connect-tesla"');
    expect(serverSource).toContain('id="disconnect-tesla"');
    expect(serverSource).toContain('id="refresh-tesla"');
    expect(serverSource).toContain('href="./auth/tesla/start-debug">Open Tesla OAuth debug');
  });

  it("keeps the Connect Tesla handler bound in app.js", () => {
    expect(appJsSource).toContain('bindButton("connect-tesla", "Connect Tesla"');
    expect(appJsSource).toContain('uiLog("Connect Tesla button clicked")');
    expect(appJsSource).toContain("showToast(message)");
  });

  it("keeps required Tesla routes registered", () => {
    expect(serverSource).toContain('path === "/auth/tesla/start-debug"');
    expect(serverSource).toContain('path === "/debug/tesla"');
    expect(serverSource).toContain('path === "/api/connections"');
    expect(serverSource).toContain('path === "/api/auth/tesla/start"');
    expect(serverSource).toContain('path === "/api/auth/tesla/disconnect"');
    expect(serverSource).toContain('path === "/debug/tesla/manual-token-helper"');
    expect(serverSource).toContain('path === "/debug/tesla/manual-token-helper/exchange"');
  });

  it("keeps development Tesla login variants visible on the debug page", () => {
    expect(serverSource).toContain("Development Tesla login links");
    expect(serverSource).toContain("Development only. These links are for obtaining a temporary Tesla authorization code.");
    expect(serverSource).toContain("https://my.home-assistant.io/redirect/oauth");
  });

  it("shows copyable redirect URI diagnostics for Tesla authorization URLs", () => {
    expect(serverSource).toContain("Encoded redirect_uri value");
    expect(serverSource).toContain("Decoded redirect_uri value");
    expect(serverSource).toContain("Copy decoded redirect_uri");
    expect(serverSource).toContain("This exact value must be registered in Tesla Developer Console.");
    expect(serverSource).toContain("Development redirect URI used");
    expect(serverSource).toContain("Development redirect URI equals https://my.home-assistant.io/redirect/oauth");
  });

  it("keeps an explicit ultra minimal Tesla development login URL", () => {
    expect(serverSource).toContain("Ultra minimal development login");
    expect(serverSource).toContain("Open ultra minimal login");
    expect(serverSource).toContain("serializeRfc3986Query");
    expect(serverSource).toContain('parameters.redirect_uri = MY_HOME_ASSISTANT_REDIRECT_URI');
  });

  it("keeps the manual token helper plain and state-based", () => {
    expect(serverSource).toContain("Manual token helper route reachable");
    expect(serverSource).toContain('name="authorization_code"');
    expect(serverSource).toContain('name="state"');
    expect(serverSource).toContain("exchangePendingTeslaCode(code, state)");
  });

  it("shows durable OAuth state diagnostics on the Tesla debug page", () => {
    expect(serverSource).toContain("Active OAuth states count");
    expect(serverSource).toContain("Latest state id");
    expect(serverSource).toContain("Latest state age");
  });

  it("explains that manual Tesla dev exchange does not depend on My Home Assistant state validation", () => {
    expect(serverSource).toContain("does not depend on My Home Assistant completing verification");
    expect(serverSource).toContain('npm run tesla:exchange-code -- --code "..." --state "..."');
  });
});
