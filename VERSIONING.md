# Versioning

Energy Manager uses semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Every change must increase the version number consistently in:

- `energy-manager/package.json`
- `energy-manager/package-lock.json`
- `energy-manager/config.yaml`

## PATCH

Increment the last number for:

- bug fixes
- diagnostics
- logging improvements
- UI fixes
- small config changes
- typo fixes
- non-breaking internal refactors

Example:

```text
0.1.3 -> 0.1.4
```

## MINOR

Increment the middle number for:

- new features
- new integrations
- new API endpoints
- new UI sections
- new provider support
- backward-compatible functionality

Example:

```text
0.1.4 -> 0.2.0
```

## MAJOR

Increment the first number for:

- breaking changes
- incompatible config changes
- architecture rewrites
- migration-required releases
- removal of old APIs or config keys

Example:

```text
0.9.5 -> 1.0.0
```

## Build Enforcement

`npm run build` runs `npm run check:version`.

The check fails when:

- `package.json` is not `MAJOR.MINOR.PATCH`
- `config.yaml` does not match `package.json`
- source files changed without changing version files

If a build fails on version validation, update the version according to these rules.
