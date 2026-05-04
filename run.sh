#!/usr/bin/env bash
# Requirements: HA-004, HA-005
set -euo pipefail

CONFIG_PATH=/data/options.json

export PORT=3000
export TIBBER_ACCESS_TOKEN="$(bashio::config 'tibber_access_token')"
export TIBBER_HOME_ID="$(bashio::config 'tibber_home_id')"
export DATABASE_URL="$(bashio::config 'database_url')"
export ELECTRICITY_PRICE_PROVIDER="$(bashio::config 'electricity_price_provider')"
export HOME_TELEMETRY_PROVIDER="$(bashio::config 'home_telemetry_provider')"
export CHARGER_PROVIDER="$(bashio::config 'charger_provider')"

bashio::log.info "Starting Smart EV Charging Optimizer"
node /app/dist/src/app/server.js
