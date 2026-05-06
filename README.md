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

No configuration is required for demo mode.

To use Tibber prices, add a Tibber personal access token in the add-on configuration:

```yaml
tibber_access_token: "paste-your-token-here"
tibber_home_id: ""
```

Most users should leave `tibber_home_id` empty. If your Tibber account has one home, Energy Manager selects it automatically.

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
