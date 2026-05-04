# Smart EV Charging Optimizer

A Home Assistant add-on for planning EV charging when electricity prices are lowest.

The add-on fetches electricity prices, calculates the cheapest charging plan before your departure time, and shows the result in a simple web UI inside Home Assistant.

## Current Status

This project is in early development.

Implemented so far:

- Home Assistant add-on skeleton
- TypeScript/Node.js project setup
- charging optimizer
- mock charger support
- provider interfaces for different electricity suppliers and charger vendors
- tests for charging plan calculation

Not implemented yet:

- real Tibber API connection
- PostgreSQL storage
- real charger control
- Zaptec integration

## What It Will Do

The add-on will help answer:

- What is the current electricity price?
- When should the car charge before departure?
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

## Configuration

Initial Home Assistant options include:

- electricity price provider
- home telemetry provider
- charger provider
- Tibber access token
- Tibber home ID
- PostgreSQL database URL
- departure time
- minimum SOC
- maximum SOC
- battery capacity
- charger power
- charging efficiency

The current default providers are mock providers for local development.

## Development

The project uses TypeScript and Vitest.

Expected commands once Node.js is installed:

```sh
npm install
npm test
npm run build
```

The current execution environment used during setup did not have `node` or `npm` installed, so tests have not been run here yet.

## Requirements

Requirements are tracked in [docs/requirements.md](docs/requirements.md).

Every meaningful code section should reference one or more requirement IDs. The traceability rules are described in [docs/requirements-traceability.md](docs/requirements-traceability.md).

## README Maintenance Rule

Keep this README easy to read.

When updating the add-on, update this README if the user-facing behavior, setup, configuration, provider model, or project status changes. Prefer short sections, plain language, and practical explanations over implementation detail.
