# Smart EV Charging Optimizer

A Home Assistant add-on for planning EV charging when electricity prices are lowest.

The add-on fetches electricity prices, calculates the cheapest charging plan before your departure time, and shows the result in a simple web UI inside Home Assistant.

## Product Principles

- It should just work.
- The default mode should be safe and avoid undercharging.
- Cheaper but less safe modes must be explicit choices.
- Every charging decision should be easy to understand.
- The UI should always show when charging happens and why.
- Emergency charging must always be available with "Charge to 100%".
- Mobile screens are a priority, not an afterthought.

## Current Status

This project is in early development.

Implemented so far:

- Home Assistant add-on skeleton
- TypeScript/Node.js project setup
- charging optimizer
- mock charger support with start, stop, and current-limit methods
- provider interfaces for different electricity suppliers and charger vendors
- PostgreSQL schema for prices, forecasts, travel data, charging plans, decision logs, and outcomes
- Tibber provider for price data and optional home power readings
- read-only Tesla provider for SOC, plugged-in state, charging state, and estimated range
- provider connection UI for Tibber and Tesla OAuth setup
- Open-Meteo weather provider
- optional solar prediction from weather and historical production
- travel event system for calendar tags, manual "Needs car", and AI-inferred trips
- heuristic departure prediction with required SOC and confidence
- three user modes: Safe, Balanced, and Savings
- emergency "Charge to 100%" planning with completion time and cost impact
- approximate completion estimates with min/max range
- mobile-first main screen focused on readiness, next trip, charging window, cost, and reasons
- daily feedback showing whether the car was ready, money saved, failures, and simple suggestions
- startup onboarding for Tibber, database, and planning-only charger setup
- realistic demo mode plan with charging window, completion time, and simple reasons
- tests for charging decisions, completion time, emergency charging, and user modes

Not implemented yet:

- real charger control
- Zaptec integration

## What It Will Do

The add-on will help answer:

- What is the current electricity price?
- When should the car charge before departure?
- Why is the car charging at that time?
- How much will the planned charging cost?
- Can the target state of charge be reached in time?

## Home Assistant Add-On

This project is built as a Home Assistant add-on, not a custom Home Assistant integration.

That means it runs as its own container and exposes a web UI through Home Assistant ingress.

Main add-on files:

- `config.yaml`: Home Assistant add-on metadata and user options
- `Dockerfile`: container build
- `run.sh`: add-on startup script

## Provider-Based Design

The add-on is designed so Tibber and Zaptec are not hard-coded into the core logic.

External systems are added through provider interfaces:

- electricity price providers
- home telemetry providers
- charger providers

This should make it possible to add other electricity suppliers, Home Assistant sensors, MQTT sources, or charger brands later without changing the charging optimizer.

Provider documentation: [docs/providers/provider-specification.md](docs/providers/provider-specification.md)

## Data and Decisions

The database is designed to keep charging decisions explainable.

It stores:

- imported price intervals
- home power readings when telemetry is available
- planned charging and estimated completion time
- actual completion time and outcome
- decision reasons in plain arrays
- weather, solar, and travel prediction inputs
- predicted solar energy per hour
- explicit and AI-inferred travel events
- likely departure time, required SOC, and prediction confidence
- emergency charging decisions and reasons
- estimated and actual completion times for comparison
- daily outcome feedback and suggestions such as starting earlier or increasing the buffer
- snapshots needed for future ML training

All persisted timestamps are UTC instants.

## Setup In Under 2 Minutes

Required:

1. Start the add-on with the default config.
2. Open the web UI.
3. Confirm the banner says `Demo mode - no data is saved`.

Optional:

- Set `DATABASE_URL` to a PostgreSQL connection string to save data.
- Add `TIBBER_ACCESS_TOKEN` to fetch real electricity prices.
- Add `TESLA_ACCESS_TOKEN` to show live car battery level and plugged-in state.
- Or connect Tibber/Tesla from the web UI using OAuth.
- Keep `CHARGER_PROVIDER=planning-only` until real charger control is added.
- Use `mock-charger` only for local development and tests.

Startup messages are intentionally plain:

- missing Tibber token: the app explains how to connect Tibber and continues with mock prices
- missing database URL: the app starts in demo mode and does not save data
- no charger provider: the app shows planning-only mode and does not control hardware

## Configuration

Initial Home Assistant options include:

- electricity price provider
- home telemetry provider
- charger provider, defaulting to planning-only mode
- vehicle state provider
- weather forecast provider
- weather latitude and longitude
- optional solar panel tilt and azimuth
- Tibber access token
- Tibber home ID
- Tesla access token
- Tesla vehicle ID
- Tibber OAuth client ID, secret, and redirect URI
- Tesla OAuth client ID, secret, and redirect URI
- optional token encryption key
- PostgreSQL database URL
- departure time
- minimum SOC
- maximum SOC
- battery capacity
- charger power
- charging efficiency

The current electricity and telemetry defaults are mock providers for local development. Charger control defaults to planning-only mode.

## User Modes

The default mode is Safe.

- Safe: prioritizes readiness, adds a larger SOC buffer, and plans to be ready early.
- Balanced: keeps a safety margin while still optimizing for price.
- Savings: minimizes cost and may accept undercharge risk when explicitly selected.

The selected mode and policy settings are stored in `user_preferences`.

## Development

The project uses TypeScript and Vitest.

Local verification:

```sh
npm install
npm test
npm run typecheck
npm run build
```

Run locally in demo mode:

```sh
cp .env.example .env
PORT=3000 node dist/src/app/server.js
```

Smoke checks:

```sh
curl http://localhost:3000/health
curl http://localhost:3000/api/status
curl http://localhost:3000/api/plan
curl -X POST http://localhost:3000/api/emergency-charge
```

Expected result:

- `/health` returns `ok: true`
- `/api/status` shows `demoMode: true` and `Planning only`
- the web UI shows a charging plan
- pressing `Charge to 100%` updates the displayed plan but does not control hardware

## Docker

Build the add-on image:

```sh
docker build -t smart-ev-charging-optimizer .
```

Run the image locally:

```sh
docker run --rm -p 3000:3000 smart-ev-charging-optimizer
```

## Home Assistant Local Add-On

To install as a local add-on:

1. Copy this project folder into the Home Assistant `addons` directory.
2. In Home Assistant, go to Settings -> Add-ons -> Add-on Store.
3. Open the menu and select Reload.
4. Install `Smart EV Charging Optimizer`.
5. Keep the default config for demo mode.
6. Start the add-on and open the ingress web UI.

Minimum demo config:

```yaml
charger_provider: planning-only
database_url: ""
tibber_access_token: ""
```

To verify it works, the UI should show:

- `Demo mode - no data is saved`
- current priority, normally `Always ready`
- setup/status, normally `Demo mode`
- battery SOC when Tesla is connected
- current electricity price when Tibber is connected
- next charging window, for example `01:20 - 04:10`
- approximate completion time, for example `approx 06:30`
- reason list, for example cheap electricity, typical weekday trip, and expected solar
- `Charge to 100%`

## Provider Login

The UI has a setup section with:

- Tibber: `Connected` or `Not connected`
- Tesla: `Connected` or `Not connected`
- `Connect Tibber`
- `Connect Tesla`
- `Disconnect Tibber`
- `Disconnect Tesla`

Secrets stay on the server. The frontend only receives a provider status and an authorization URL.

In demo mode, OAuth tokens are stored in memory only and disappear when the add-on restarts. Set `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` before using persistent token storage later.

### Tibber OAuth Client

Create a Tibber OAuth client in Tibber's developer/management UI.

Use these local redirect URLs while developing:

```text
http://localhost:3000/api/auth/tibber/callback
```

Set:

```text
TIBBER_OAUTH_CLIENT_ID=
TIBBER_OAUTH_CLIENT_SECRET=
TIBBER_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/tibber/callback
```

The app requests read scopes for user and home data plus `offline_access` for refresh tokens.

### Tesla Developer App

Create a Tesla developer app in the Tesla developer portal and configure an OAuth redirect URI.

Use this local redirect URL while developing:

```text
http://localhost:3000/api/auth/tesla/callback
```

Set:

```text
TESLA_OAUTH_CLIENT_ID=
TESLA_OAUTH_CLIENT_SECRET=
TESLA_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/tesla/callback
```

The app requests read-only vehicle data scope. It does not request vehicle command or charging command scopes.

### Home Assistant Redirects

For a Home Assistant add-on, the redirect URI must match the externally reachable add-on URL. Localhost only works for local development. When using Home Assistant ingress, configure the OAuth client with the public HTTPS URL that reaches:

```text
/api/auth/tibber/callback
/api/auth/tesla/callback
```

## Requirements

Requirements are tracked in [docs/requirements.md](docs/requirements.md).

Every meaningful code section should reference one or more requirement IDs. The traceability rules are described in [docs/requirements-traceability.md](docs/requirements-traceability.md).

## README Maintenance Rule

Keep this README easy to read.

When updating the add-on, update this README if the user-facing behavior, setup, configuration, provider model, or project status changes. Prefer short sections, plain language, and practical explanations over implementation detail.
