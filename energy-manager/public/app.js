document.body.setAttribute("data-appjs", "started");

try {
  console.log("[APPJS] starting execution");

  const uiTimestamp = () => new Date().toISOString();
  const uiLog = (message) => console.log("[" + uiTimestamp() + "] [UI] " + message);
  const uiWarn = (message) => console.warn("[" + uiTimestamp() + "] [WARN] [UI] " + message);
  const uiError = (message, error) => console.error("[" + uiTimestamp() + "] [ERROR] [UI] " + message, error);

  const bootDiagnostics = {
    buttonsFound: 0,
    handlersAttached: 0,
    lastEvent: "None",
    lastError: "None",
    scriptStatus: "UI script loading...",
  };

  document.addEventListener("DOMContentLoaded", () => {
    try {
      uiLog("app.js loaded");
      setScriptStatus("DOMContentLoaded");
      uiLog("DOMContentLoaded");
      updateLocationDiagnostics();
      refreshConfigDiagnostics();
      document.addEventListener("click", (event) => {
        const target = event.target;
        console.log("[UI] document click", target);
        setLastEvent("document click: " + describeClickTarget(target));
      });
      initializeUi();
    } catch (error) {
      showUiError(error);
    }
  });

  function initializeUi() {
    setDiag("diag-buttons-found", String(document.querySelectorAll("button").length));

    window.energyManagerDebug = {
      testToast: () => showToast("Toast test"),
      testEmergency: () => document.getElementById("charge-100")?.click(),
      getButtons: () =>
        Array.from(document.querySelectorAll("button")).map((button) => ({
          id: button.id,
          text: button.textContent,
        })),
    };

    fetchJson("/api/plan")
      .then((response) => response.json())
      .then((data) => renderPlan(data))
      .catch((error) => showFetchError("Initial plan load failed", error));

    bindButton(
      "charge-100",
      "Charge to 100%",
      () => {
        showToast("Updating plan to 100%...");
        return fetchJson("/api/emergency-charge", { method: "POST" })
          .then((response) => response.json())
          .then((data) => {
            renderPlan(data);
            showToast("Plan updated: Charge to 100%");
          })
          .catch((error) => showFetchError("Could not update emergency plan", error));
      },
      { required: true },
    );

    bindButton(
      "charge-now",
      "Charge now",
      () => {
        showToast("Charge now is a planning-only preview for now.");
      },
      { required: false },
    );

    bindButton(
      "change-departure",
      "Change departure",
      () => {
        showToast("Departure changes are coming soon.");
      },
      { required: false },
    );

    bindButton(
      "debug-test-button",
      "Debug test",
      () => {
        showToast("Debug button works");
      },
      { required: false },
    );

    bindButton("connect-tibber", "Connect Tibber", () => startProviderAuth("tibber"), { required: false });
    bindButton("connect-tesla", "Connect Tesla", () => startProviderAuth("tesla"), { required: false });
    bindButton("disconnect-tibber", "Disconnect Tibber", () => disconnectProvider("tibber"), { required: false });
    bindButton("disconnect-tesla", "Disconnect Tesla", () => disconnectProvider("tesla"), { required: false });
    bindButton("refresh-tesla", "Refresh Tesla", () => refreshTesla(true), { required: false });

    const strategyDialog = document.getElementById("strategy-dialog");
    bindButton(
      "change-strategy",
      "Change strategy",
      () => {
        if (strategyDialog && typeof strategyDialog.showModal === "function") {
          strategyDialog.showModal();
          return;
        }
        showToast("Charging strategy options are available soon.");
      },
      { required: false },
    );
    bindButton(
      "close-strategy",
      "Close strategy dialog",
      () => {
        if (strategyDialog && typeof strategyDialog.close === "function") {
          strategyDialog.close();
        }
      },
      { required: false },
    );

    document.querySelectorAll("[data-strategy]").forEach((button) => {
      const label = button.textContent || "strategy";
      attachHandler(label);
      button.addEventListener("click", () => {
        uiLog("clicked: " + label);
        setLastEvent("clicked: " + label);
        showToast(label + " selected. Strategy changes are coming soon.");
        if (strategyDialog && typeof strategyDialog.close === "function") {
          strategyDialog.close();
        }
      });
    });

    setScriptStatus("UI script loaded");
    showToast("UI script loaded");
    refreshConnections();
    refreshTesla(false);
  }

  function renderPlan(data) {
    document.getElementById("ready").textContent = "Ready by " + formatTime(data.completion.estimatedCompletionTimeMax);
    document.getElementById("next-trip").textContent = "Next trip: " + formatTime(data.nextTrip.startsAt);
    document.getElementById("window").textContent =
      formatTime(data.chargingWindow.startsAt) + " - " + formatTime(data.chargingWindow.endsAt);
    document.getElementById("completion").textContent =
      "approx " +
      formatTime(data.completion.estimatedCompletionTime) +
      " (" +
      formatTime(data.completion.estimatedCompletionTimeMin) +
      "-" +
      formatTime(data.completion.estimatedCompletionTimeMax) +
      ")";
    document.getElementById("cost").textContent = data.plan.estimatedCost + " " + (data.plan.currency || "");
    document.getElementById("battery").textContent = formatMainBattery(data.vehicleState, data.tesla);
    document.getElementById("electricity").textContent =
      data.pricingContext.currentPrice !== null
        ? data.pricingContext.currentPrice + " " + data.pricingContext.currency + "/kWh"
        : "Not connected";
    document.getElementById("tibber-status").textContent = data.tibber.status;
    document.getElementById("tibber-summary").textContent = data.tibber.connected
      ? data.pricingContext.description
      : "For now, add TIBBER_ACCESS_TOKEN in configuration.";
    document.getElementById("tibber-last-fetch").textContent =
      "Last successful fetch: " +
      (data.tibber.lastSuccessfulFetch ? formatTime(data.tibber.lastSuccessfulFetch) : "never");
    if (data.tibber.multipleHomesFound && data.tibber.availableHomeNames.length > 0) {
      document.getElementById("tibber-summary").textContent =
        "Multiple Tibber homes found: " +
        data.tibber.availableHomeNames.join(", ") +
        ". Using " +
        (data.tibber.selectedHomeName || data.tibber.availableHomeNames[0]) +
        " for now.";
    }
    document.getElementById("priority").textContent = strategyName(data.userMode.mode);
    document.getElementById("setup-mode").textContent = data.status.chargerStatus;
    document.getElementById("demo-mode").style.display = data.onboarding.demoMode ? "block" : "none";
    document.getElementById("daily-ready").textContent = data.dailyFeedback.wasCarReady
      ? "Car was ready"
      : "Car was not ready";
    document.getElementById("daily-saved").textContent =
      data.dailyFeedback.moneySaved + " " + (data.plan.currency || "");
    document.getElementById("reasons").innerHTML = data.planReasons
      .slice(0, 4)
      .map((reason) => "<li>" + friendlyReason(reason) + "</li>")
      .join("");
    document.getElementById("daily-feedback").innerHTML = [
      ...data.dailyFeedback.reason,
      ...data.dailyFeedback.failures.map((failure) => failure.reason),
      ...data.dailyFeedback.suggestions.map(suggestionText),
    ]
      .slice(0, 4)
      .map((text) => "<li>" + text + "</li>")
      .join("");
    document.getElementById("setup-notes").innerHTML = [
      ...data.onboarding.setupWarnings,
      ...data.onboarding.setupMessages,
      ...data.providerWarnings,
    ]
      .slice(0, 4)
      .map((text) => "<li>" + text + "</li>")
      .join("");

    const warning = document.getElementById("warning");
    if (!data.plan.feasible) {
      warning.style.display = "block";
      warning.textContent = "The car may not reach the target in time.";
    } else {
      warning.style.display = "none";
      warning.textContent = "";
    }
    refreshConnections();
  }

  function bindButton(id, label, handler, options = { required: false }) {
    const button = document.getElementById(id);
    if (!button) {
      const message = "Button not found: " + id;
      if (options.required) {
        const error = new Error(message);
        uiError(message, error);
        showUiError(error);
      } else {
        uiWarn(message);
      }
      return;
    }

    attachHandler(label);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      uiLog("clicked: " + label);
      setLastEvent("clicked: " + label);
      try {
        const result = handler(button, event);
        if (result && typeof result.catch === "function") {
          result.catch((error) => showFetchError(label + " failed", error));
        }
      } catch (error) {
        showFetchError(label + " failed", error);
      }
    });
  }

  function attachHandler(label) {
    incrementHandlers();
    uiLog("attached handler: " + label);
    setLastEvent("attached: " + label);
  }

  function refreshConnections() {
    return fetchJson("/api/connections")
      .then((response) => response.json())
      .then((data) => {
        renderConnection(
          data.connections.find((connection) => connection.provider === "tibber"),
          "tibber",
        );
        renderConnection(
          data.connections.find((connection) => connection.provider === "tesla"),
          "tesla",
        );
      })
      .catch((error) => showFetchError("Could not refresh provider connections", error));
  }

  function refreshTesla(forceRefresh) {
    showToast(forceRefresh ? "Refreshing Tesla..." : "Loading Tesla status...");
    return fetchJson(forceRefresh ? "/api/tesla/refresh" : "/api/tesla/state", {
      method: forceRefresh ? "POST" : "GET",
    })
      .then((response) => response.json())
      .then((data) => {
        renderTeslaStatus(data);
        if (forceRefresh) {
          showToast("Tesla status refreshed");
        }
      })
      .catch((error) => showFetchError("Could not refresh Tesla status", error));
  }

  function renderTeslaStatus(data) {
    const state = data.vehicleState || {};
    const usingDemoData = data.usingDemoData === true || state.isDemo === true;
    setText("tesla-status", data.connected ? "Connected" : "Tesla not connected");
    setText(
      "tesla-summary",
      usingDemoData
        ? "Using demo vehicle data"
        : data.warning || (data.connected ? "Tesla connected in read-only mode." : "Not connected"),
    );
    setText("tesla-vehicle-name", "Vehicle: " + (usingDemoData ? "Demo vehicle" : data.vehicleName || state.vehicleName || "Unknown"));
    const batterySoc = data.batterySocPercent ?? state.batterySocPercent ?? null;
    setText("tesla-battery", "Battery: " + (batterySoc === null ? "Unknown" : usingDemoData ? "Demo " + batterySoc + "%" : batterySoc + "%"));
    setText("tesla-plugged-in", "Plugged in: " + yesNo(data.pluggedIn ?? state.pluggedIn));
    setText("tesla-charging-state", "Charging: " + (data.chargingState || state.chargingState || "Unknown"));
    setText("tesla-charge-limit", "Charge limit: " + formatPercent(data.chargeLimitPercent ?? state.chargeLimitPercent));
    setText("tesla-charger-power", "Charging power: " + formatNumber(data.chargerPowerKw ?? state.chargerPowerKw, " kW"));
    setText("tesla-time-to-full", "Time to full: " + formatNumber(data.timeToFullChargeHours ?? state.timeToFullChargeHours, " h"));
    setText("tesla-online-state", "Vehicle state: " + (usingDemoData ? "Demo mode" : data.vehicleOnlineState || state.vehicleOnlineState || "Unknown"));
    setText("tesla-last-update", "Last update: " + formatTime(data.lastUpdatedAt || state.lastUpdatedAt || state.observedAt));
  }

  function formatMainBattery(vehicleState, teslaStatus) {
    const state = vehicleState || teslaStatus?.vehicleState || {};
    const connected = teslaStatus?.connected === true;
    const usingDemoData = teslaStatus?.usingDemoData === true || state.isDemo === true;
    if (state.batterySocPercent === null || state.batterySocPercent === undefined) {
      return connected ? "Unknown" : "Tesla not connected";
    }

    if (!connected && usingDemoData) {
      return "Demo: " + state.batterySocPercent + "%";
    }

    return connected ? state.batterySocPercent + "%" : "Tesla not connected";
  }

  function renderConnection(connection, provider) {
    if (!connection) return;
    if (provider === "tibber") {
      const summary = document.getElementById("tibber-summary");
      document.getElementById("tibber-status").textContent = connection.connected
        ? "Tibber connected"
        : "Tibber token not configured";
      if (!summary.textContent?.startsWith("Multiple Tibber homes found")) {
        summary.textContent = connection.connected
          ? connection.summary || "Using real Tibber price data."
          : "For now, add TIBBER_ACCESS_TOKEN in configuration.";
      }
      return;
    }

    document.getElementById(provider + "-status").textContent = connection.connected ? "Connected" : "Not connected";
    document.getElementById(provider + "-summary").textContent =
      connection.summary || connection.warning || "Not connected";
  }

  function startProviderAuth(provider) {
    if (provider === "tibber") {
      showToast("For now, add TIBBER_ACCESS_TOKEN in configuration");
      return Promise.resolve();
    }

    const button = document.getElementById("connect-" + provider);
    if (button) {
      button.disabled = true;
      button.textContent = "Connecting...";
    }
    showToast("Opening " + providerName(provider) + " login...");
    return fetchJson("/api/auth/" + provider + "/start", { method: "GET" })
      .then((response) => response.json())
      .then((data) => {
        if (data.authorizationUrl) {
          showToast("Redirecting to " + providerName(provider) + " login...");
          window.location.href = data.authorizationUrl;
          return;
        }
        if (button) {
          button.disabled = false;
          button.textContent = "Connect " + providerName(provider);
        }
        showToast(data.message || providerName(provider) + " login is not configured yet");
      })
      .catch((error) => {
        if (button) {
          button.disabled = false;
          button.textContent = "Connect " + providerName(provider);
        }
        showFetchError(providerName(provider) + " login failed", error);
      });
  }

  function disconnectProvider(provider) {
    showToast("Disconnecting " + providerName(provider) + "...");
    return fetchJson("/api/auth/" + provider + "/disconnect", { method: "POST" })
      .then(() => refreshConnections())
      .then(() => (provider === "tesla" ? refreshTesla(false) : null))
      .then(() => showToast(providerName(provider) + " disconnected"))
      .catch((error) => showFetchError(providerName(provider) + " disconnect failed", error));
  }

  function apiUrl(path) {
    return "./" + String(path).replace(/^\/+/, "");
  }

  function fetchJson(url, options) {
    const resolvedUrl = apiUrl(url);
    uiLog("fetch: " + (options && options.method ? options.method : "GET") + " " + resolvedUrl);
    return fetch(resolvedUrl, options).then((response) => {
      if (!response.ok) {
        throw new Error(resolvedUrl + " failed with HTTP " + response.status);
      }
      return response;
    });
  }

  function updateLocationDiagnostics() {
    setDiag("diag-current-url", window.location.href);
    setDiag("diag-base-uri", document.baseURI);
    setDiag("diag-app-js-url", new URL("./app.js", document.baseURI).href);
  }

  function refreshConfigDiagnostics() {
    return fetchJson("/debug/config")
      .then((response) => response.json())
      .then((data) => {
        setDiag("diag-tesla-redirect-uri", data.teslaRedirectUri || "Not configured");
      })
      .catch((error) => uiWarn("Could not load config diagnostics: " + (error?.message || String(error))));
  }

  function showFetchError(message, error) {
    uiError(message, error);
    showUiError(error instanceof Error ? error : new Error(message));
    showToast(message);
  }

  function showUiError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setLastError(message);
    const errorArea = document.getElementById("ui-error");
    if (errorArea) {
      errorArea.textContent = "UI error: " + message;
      errorArea.style.display = "block";
    }
  }

  function setScriptStatus(text) {
    bootDiagnostics.scriptStatus = text;
    setDiag("ui-script-status", text);
    setDiag("diag-script-status", text);
  }

  function setDiag(id, value) {
    if (id === "diag-buttons-found") {
      bootDiagnostics.buttonsFound = Number(value);
    }
    setText(id, value);
  }

  function incrementHandlers() {
    bootDiagnostics.handlersAttached += 1;
    setDiag("diag-handlers-attached", String(bootDiagnostics.handlersAttached));
  }

  function setLastEvent(text) {
    bootDiagnostics.lastEvent = text;
    setDiag("diag-last-event", text);
  }

  function setLastError(text) {
    bootDiagnostics.lastError = text;
    setDiag("diag-last-error", text);
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  function describeClickTarget(target) {
    if (!target) return "unknown target";
    const text = target.textContent ? target.textContent.trim() : "";
    if (target.id) return "#" + target.id + (text ? " " + text : "");
    return text || target.tagName.toLowerCase();
  }

  function formatTime(value) {
    if (!value) return "Not planned";
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function friendlyReason(reason) {
    const text = {
      "safe mode applied": "Safe mode is on",
      "balanced mode applied": "Balanced mode is on",
      "savings mode applied": "Savings mode is on",
      "cheap electricity": "Cheap electricity",
      "typical weekday trip": "Typical weekday trip",
      "solar expected tomorrow": "Solar expected tomorrow",
      "charge to 100% requested": "Charge to 100% requested",
      "safety override": "Safety override",
      "planning only - no hardware control": "Planning only - no hardware control",
    }[String(reason).toLowerCase()];
    if (text) return text;
    return String(reason).replace(/_/g, " ").replace(/SOC/g, "charge").replace(/soc/g, "charge");
  }

  function suggestionText(suggestion) {
    const suggestions = {
      increase_buffer: "Add a larger safety buffer",
      start_earlier: "Start charging earlier",
    };

    return suggestions[suggestion] || String(suggestion).replace(/_/g, " ");
  }

  function strategyName(mode) {
    return (
      {
        safe: "Always ready",
        balanced: "Balanced",
        savings: "Lowest cost",
      }[mode] || "Always ready"
    );
  }

  function providerName(provider) {
    return provider === "tibber" ? "Tibber" : "Tesla";
  }

  function yesNo(value) {
    if (value === true) return "yes";
    if (value === false) return "no";
    return "Unknown";
  }

  function formatPercent(value) {
    return value === null || value === undefined ? "Unknown" : value + "%";
  }

  function formatNumber(value, unit) {
    return value === null || value === undefined ? "Unknown" : value + unit;
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) {
      uiWarn("Toast element not found: toast");
      return;
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
  }
} catch (error) {
  console.error("[FATAL UI ERROR]", error);

  const fatal = document.getElementById("ui-fatal-error");
  if (fatal) {
    fatal.style.display = "block";
    fatal.textContent = "Fatal UI error: " + (error?.message || String(error));
  }
}
