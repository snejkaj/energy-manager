# Home Assistant App Decision

## Decision

The project will target a Home Assistant app, formerly known as an add-on, as the deployment format.

## Rationale

The core application requirement is TypeScript/Node.js. Home Assistant custom integrations are Python modules running inside Home Assistant Core, while Home Assistant apps/add-ons are containerized applications managed by Supervisor. A containerized app is therefore the correct fit for this project.

## Packaging Requirements

- The Home Assistant app metadata lives in `config.yaml`.
- The container build lives in `Dockerfile`.
- The startup script lives in `run.sh`.
- User configuration is read from `/data/options.json` through `bashio`.
- The Node.js application receives configuration through environment variables.
- Ingress is enabled so the web UI can be opened from Home Assistant.

## Integration Boundary

The initial app exposes planning and visualization. It does not create Home Assistant entities yet and does not control a real charger.

Future Home Assistant integration points may include:

- publishing sensors through the Home Assistant REST API
- reading Home Assistant state for current household consumption
- registering services for planning refresh
- adding MQTT discovery if MQTT becomes part of the architecture
