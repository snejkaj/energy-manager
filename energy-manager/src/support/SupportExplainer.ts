// Requirements: OPS-001, OPS-005, UX-004

export interface SupportDiagnostics {
  appVersion: string;
  addonVersion: string;
  providerStatus: {
    electricityPriceProvider: string;
    homeTelemetryProvider: string;
    vehicleStateProvider: string;
    weatherForecastProvider: string;
    chargerProvider: string;
  };
  tibberConnected: boolean;
  teslaOAuthConfigured: boolean;
  teslaConnected: boolean;
  lastApiError: string | null;
  lastOAuthError: string | null;
  lastBuildConfigWarning: string | null;
  currentFallbackMode: {
    demoMode: boolean;
    planningOnlyMode: boolean;
    description: string;
  };
  homeAssistant: {
    detectedIngressUrl: string;
    generatedTeslaCallbackUrl: string;
    currentRequestUrl: string;
  };
  setupNotes: string[];
}

export interface SupportAdvice {
  detectedIssue: string;
  likelyCause: string;
  nextAction: string;
  severity: "info" | "warning" | "error";
}

export interface SupportExplainer {
  explain(diagnostics: SupportDiagnostics): SupportAdvice;
}

export class RuleBasedSupportExplainer implements SupportExplainer {
  explain(diagnostics: SupportDiagnostics): SupportAdvice {
    const lastApiError = diagnostics.lastApiError?.toLowerCase() ?? "";
    const lastOAuthError = diagnostics.lastOAuthError?.toLowerCase() ?? "";

    if (lastApiError.includes("app.js") || lastApiError.includes("ui script")) {
      return {
        detectedIssue: "UI script failed to load",
        likelyCause: "app.js was not served correctly or the browser could not execute it.",
        nextAction: "Open the UI diagnostics section and check the app.js URL and the last UI error.",
        severity: "error",
      };
    }

    if (lastOAuthError.includes("redirect") || lastOAuthError.includes("callback")) {
      return {
        detectedIssue: "Tesla callback URL may not match Developer Console",
        likelyCause: "Tesla accepted the login but returned an OAuth redirect or callback error.",
        nextAction: "Open Tesla OAuth debug and copy the exact redirect URI into Tesla Developer Console.",
        severity: "error",
      };
    }

    if (!diagnostics.tibberConnected) {
      return {
        detectedIssue: "Tibber token is missing",
        likelyCause: "The add-on is using demo electricity prices because Tibber is not connected.",
        nextAction: "Add tibber_access_token in the add-on configuration and restart the add-on.",
        severity: "warning",
      };
    }

    if (diagnostics.teslaOAuthConfigured && !diagnostics.teslaConnected) {
      return {
        detectedIssue: "Tesla OAuth is configured, but no refresh token exists yet",
        likelyCause: "The Tesla app credentials are present, but the Tesla sign-in flow has not completed.",
        nextAction: "Click Connect Tesla and complete the Tesla login.",
        severity: "warning",
      };
    }

    if (!diagnostics.teslaOAuthConfigured) {
      return {
        detectedIssue: "Tesla is not connected",
        likelyCause: "Tesla OAuth Client ID and Client Secret are not both configured.",
        nextAction: "Add Tesla OAuth settings or continue with clearly labeled demo vehicle data.",
        severity: "info",
      };
    }

    if (diagnostics.currentFallbackMode.demoMode) {
      return {
        detectedIssue: "Demo mode is active",
        likelyCause: "DATABASE_URL is not configured, so setup data is not saved.",
        nextAction: "Configure PostgreSQL when you want persistent history. Planning still works in demo mode.",
        severity: "info",
      };
    }

    return {
      detectedIssue: "No obvious setup problem detected",
      likelyCause: "Core providers and setup checks look consistent.",
      nextAction: "Use the support report if you still need help with a specific behavior.",
      severity: "info",
    };
  }
}
