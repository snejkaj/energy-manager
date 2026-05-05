#!/usr/bin/env bash
# Requirements: HA-004, HA-005, ONB-001, ONB-002, ONB-003
set -euo pipefail

CONFIG_PATH=/data/options.json

export PORT=3000
export TIBBER_ACCESS_TOKEN="$(bashio::config 'tibber_access_token')"
export TIBBER_HOME_ID="$(bashio::config 'tibber_home_id')"
export DATABASE_URL="$(bashio::config 'database_url')"
export ELECTRICITY_PRICE_PROVIDER="$(bashio::config 'electricity_price_provider')"
export HOME_TELEMETRY_PROVIDER="$(bashio::config 'home_telemetry_provider')"
export CHARGER_PROVIDER="$(bashio::config 'charger_provider')"
export WEATHER_FORECAST_PROVIDER="$(bashio::config 'weather_forecast_provider')"
export USER_MODE="$(bashio::config 'user_mode')"
export SOC_BUFFER_PERCENT="$(bashio::config 'soc_buffer_percent')"
export START_EARLY_MINUTES="$(bashio::config 'start_early_minutes')"
export ALLOW_UNDERCHARGE_RISK="$(bashio::config 'allow_undercharge_risk')"
export WEATHER_LATITUDE="$(bashio::config 'weather_latitude')"
export WEATHER_LONGITUDE="$(bashio::config 'weather_longitude')"
export SOLAR_PANEL_TILT_DEGREES="$(bashio::config 'solar_panel_tilt_degrees')"
export SOLAR_PANEL_AZIMUTH_DEGREES="$(bashio::config 'solar_panel_azimuth_degrees')"

bashio::log.info "Starting Smart EV Charging Optimizer"
bashio::log.info "Setup takes about 2 minutes: set database_url first, add tibber_access_token for real prices, keep charger_provider=planning-only until hardware support is added."
node /app/dist/src/app/server.js
