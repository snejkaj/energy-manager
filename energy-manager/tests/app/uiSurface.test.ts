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

  it("keeps one atomic development Tesla login attempt visible on the debug page", () => {
    expect(serverSource).toContain("Development OAuth attempt");
    expect(serverSource).toContain("the URL, state, verifier, and challenge below belong to the same Tesla login attempt");
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

  it("shows an explicit PKCE self-check for the atomic development attempt", () => {
    expect(serverSource).toContain("PKCE self-check");
    expect(serverSource).toContain("Recomputed challenge");
    expect(serverSource).toContain("URL challenge");
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
    expect(serverSource).toContain('npm run tesla:exchange-code -- --code "..." --code-verifier "..." --expected-code-challenge "..."');
  });

  it("shows development verifier values only for manual exchange", () => {
    expect(serverSource).toContain("Development exchange values");
    expect(serverSource).toContain("Development only. Do not share code_verifier.");
    expect(serverSource).toContain("Hidden unless DEV_MODE=true");
    expect(serverSource).toContain("Copy code_verifier");
  });
});
