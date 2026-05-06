#!/usr/bin/env bash
# Requirements: HA-004, HA-005, ONB-001, ONB-002, ONB-003
set -euo pipefail

CONFIG_PATH=/data/options.json

if [ -n "${SUPERVISOR_TOKEN:-}" ] && [ -f /usr/lib/bashio/bashio.sh ]; then
  # shellcheck source=/dev/null
  source /usr/lib/bashio/bashio.sh
fi

config_value() {
  local key="$1"
  local env_key
  env_key="$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]')"

  if [ -n "${SUPERVISOR_TOKEN:-}" ] && declare -F bashio::config >/dev/null; then
    bashio::config "$key"
    return
  fi

  printenv "$env_key" || true
}

json_config_value() {
  local key="$1"

  if [ -f "$CONFIG_PATH" ] && command -v jq >/dev/null 2>&1; then
    jq -r --arg key "$key" '.[$key] // empty' "$CONFIG_PATH"
    return
  fi

  config_value "$key"
}

log_info() {
  if [ -n "${SUPERVISOR_TOKEN:-}" ] && declare -F bashio::log.info >/dev/null; then
    bashio::log.info "$1"
    return
  fi

  echo "$1"
}

log_secret_configured() {
  local label="$1"
  local value="$2"
  local configured="no"

  if [ -n "$value" ]; then
    configured="yes"
  fi

  log_info "[TibberConfig] $label configured: $configured"
}

if [ -f "$CONFIG_PATH" ]; then
  log_secret_configured "Home Assistant option tibber_access_token" "$(json_config_value 'tibber_access_token')"
else
  log_info "[TibberConfig] Checking Home Assistant options: options file missing at $CONFIG_PATH"
fi

export PORT=3000
if [ -f "$CONFIG_PATH" ] && command -v jq >/dev/null 2>&1; then
  TIBBER_ACCESS_TOKEN="$(jq -r '.tibber_access_token // empty' /data/options.json)"
  TIBBER_HOME_ID="$(jq -r '.tibber_home_id // empty' /data/options.json)"
else
  TIBBER_ACCESS_TOKEN="$(config_value 'tibber_access_token')"
  TIBBER_HOME_ID="$(config_value 'tibber_home_id')"
fi
export TIBBER_ACCESS_TOKEN
export TIBBER_HOME_ID
export TESLA_ACCESS_TOKEN="$(config_value 'tesla_access_token')"
export TESLA_VEHICLE_ID="$(config_value 'tesla_vehicle_id')"
export TIBBER_OAUTH_CLIENT_ID="$(config_value 'tibber_oauth_client_id')"
export TIBBER_OAUTH_CLIENT_SECRET="$(config_value 'tibber_oauth_client_secret')"
export TIBBER_OAUTH_REDIRECT_URI="$(config_value 'tibber_oauth_redirect_uri')"
export TESLA_OAUTH_CLIENT_ID="$(config_value 'tesla_oauth_client_id')"
export TESLA_OAUTH_CLIENT_SECRET="$(config_value 'tesla_oauth_client_secret')"
export TESLA_OAUTH_REDIRECT_URI="$(config_value 'tesla_oauth_redirect_uri')"
export TOKEN_ENCRYPTION_KEY="$(config_value 'token_encryption_key')"
export DATABASE_URL="$(config_value 'database_url')"
export ELECTRICITY_PRICE_PROVIDER="$(config_value 'electricity_price_provider')"
export HOME_TELEMETRY_PROVIDER="$(config_value 'home_telemetry_provider')"
export CHARGER_PROVIDER="$(config_value 'charger_provider')"
export VEHICLE_STATE_PROVIDER="$(config_value 'vehicle_state_provider')"
export WEATHER_FORECAST_PROVIDER="$(config_value 'weather_forecast_provider')"
export USER_MODE="$(config_value 'user_mode')"
export SOC_BUFFER_PERCENT="$(config_value 'soc_buffer_percent')"
export START_EARLY_MINUTES="$(config_value 'start_early_minutes')"
export ALLOW_UNDERCHARGE_RISK="$(config_value 'allow_undercharge_risk')"
export WEATHER_LATITUDE="$(config_value 'weather_latitude')"
export WEATHER_LONGITUDE="$(config_value 'weather_longitude')"
export SOLAR_PANEL_TILT_DEGREES="$(config_value 'solar_panel_tilt_degrees')"
export SOLAR_PANEL_AZIMUTH_DEGREES="$(config_value 'solar_panel_azimuth_degrees')"
export DEPARTURE_TIME="$(config_value 'departure_time')"
export MINIMUM_SOC_PERCENT="$(config_value 'minimum_soc_percent')"
export MAXIMUM_SOC_PERCENT="$(config_value 'maximum_soc_percent')"
export BATTERY_CAPACITY_KWH="$(config_value 'battery_capacity_kwh')"
export CHARGER_POWER_KW="$(config_value 'charger_power_kw')"
export CHARGING_EFFICIENCY="$(config_value 'charging_efficiency')"

log_info "[TibberConfig] TIBBER_ACCESS_TOKEN configured: $([ -n "$TIBBER_ACCESS_TOKEN" ] && echo yes || echo no)"
log_info "[TibberConfig] TIBBER_HOME_ID configured: $([ -n "$TIBBER_HOME_ID" ] && echo yes || echo no)"

log_info "Starting Smart EV Charging Optimizer"
log_info "Setup takes about 2 minutes: add tibber_access_token for real prices, set database_url to save data, keep charger_provider=planning-only until hardware support is added."
node /app/dist/src/app/server.js
