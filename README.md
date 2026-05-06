# Energy Manager Add-ons

Home Assistant add-on repository for Energy Manager.

Energy Manager plans EV charging from electricity prices and starts in safe, planning-only mode. It can run without Tibber, Tesla, PostgreSQL, or a real charger by using demo data.

## Install In Home Assistant

1. Open Home Assistant.
2. Go to **Settings** -> **Add-ons** -> **Add-on Store**.
3. Open the menu in the top right and choose **Repositories**.
4. Add this repository URL:

```text
https://github.com/snejkaj/energy-manager
```

5. Find **Energy Manager** in the Add-on Store.
6. Install it.
7. Start the add-on.
8. Open the web UI.

The add-on should start with demo data if no providers are configured.

## Minimum Configuration

All configuration is optional. No secrets, provider settings, weather location, solar details, or database URL are required for demo mode.

Minimal working config:

```yaml
tibber_access_token: ""
tibber_home_id: ""
database_url: ""
charger_provider: "planning-only"
```

To use Tibber prices, add a Tibber personal access token in the add-on configuration:

```yaml
tibber_access_token: "paste-your-token-here"
tibber_home_id: ""
```

Most users should leave `tibber_home_id` empty. If your Tibber account has one home, Energy Manager selects it automatically.

Full example config:

```yaml
electricity_price_provider: "mock-electricity-price"
home_telemetry_provider: "mock-home-telemetry"
charger_provider: "planning-only"
vehicle_state_provider: "mock-vehicle-state"
weather_forecast_provider: "mock-weather-forecast"
user_mode: "safe"
soc_buffer_percent: "15"
start_early_minutes: "90"
allow_undercharge_risk: false
weather_latitude: ""
weather_longitude: ""
solar_panel_tilt_degrees: ""
solar_panel_azimuth_degrees: ""
tibber_access_token: ""
tibber_home_id: ""
tesla_access_token: ""
tesla_vehicle_id: ""
tibber_oauth_client_id: ""
tibber_oauth_client_secret: ""
tibber_oauth_redirect_uri: ""
tesla_oauth_client_id: ""
tesla_oauth_client_secret: ""
tesla_oauth_redirect_uri: ""
token_encryption_key: ""
database_url: ""
departure_time: "07:00"
minimum_soc_percent: "60"
maximum_soc_percent: "80"
battery_capacity_kwh: "75"
charger_power_kw: "11"
charging_efficiency: "0.9"
```

## Never Commit Your Tibber Token

Do not put your Tibber token in git.

Use the Home Assistant add-on configuration screen for real tokens:

```yaml
tibber_access_token: "paste-your-token-here"
tibber_home_id: ""
```

Local files such as `.env` and `options.json` are ignored by git. The add-on startup logs only whether a token is configured, never the token itself.

If a real token has ever been committed by mistake, revoke it in Tibber and create a new one before making the repository public.

## Repository Layout

```text
repository.yaml
energy-manager/
  config.yaml
  Dockerfile
  run.sh
  package.json
  src/
```

The add-on source and detailed development documentation live in [`energy-manager/`](energy-manager/).

## Development

Run commands from the add-on directory:

```sh
cd energy-manager
npm install
npm test
npm run build
docker build -t energy-manager-addon .
```

## README Maintenance Rule

Keep this README easy to read. When updating the add-on, update the README if the user-facing behavior, setup, configuration, provider model, or project status changes.
