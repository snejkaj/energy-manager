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
  });
});
