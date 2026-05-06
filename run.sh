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

log_info() {
  if [ -n "${SUPERVISOR_TOKEN:-}" ] && declare -F bashio::log.info >/dev/null; then
    bashio::log.info "$1"
    return
  fi

  echo "$1"
}

export PORT=3000
export TIBBER_ACCESS_TOKEN="$(config_value 'tibber_access_token')"
export TIBBER_HOME_ID="$(config_value 'tibber_home_id')"
export DATABASE_URL="$(config_value 'database_url')"
export ELECTRICITY_PRICE_PROVIDER="$(config_value 'electricity_price_provider')"
export HOME_TELEMETRY_PROVIDER="$(config_value 'home_telemetry_provider')"
export CHARGER_PROVIDER="$(config_value 'charger_provider')"
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

log_info "Starting Smart EV Charging Optimizer"
log_info "Setup takes about 2 minutes: add tibber_access_token for real prices, set database_url to save data, keep charger_provider=planning-only until hardware support is added."
node /app/dist/src/app/server.js
