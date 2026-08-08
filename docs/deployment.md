# Deployment

## Building locally

```bash
mise run run-stormwatch
```

This builds the image from the `Dockerfile` in prod mode (static files baked
in, no bind mounts) and runs it as a non-root user, in the background. Use
`mise run run-stormwatch-dev` instead to stream logs in the foreground.

## Using a published image

Two registries, same image, either works:

- **GHCR** — `ghcr.io/augustinkrb/stormwatch:latest`. Built and pushed by CI
  on every [GitHub release](https://github.com/AugustinKrb/StormWatch/releases),
  always in sync.
- **Docker Hub** — `augustinkrb/stormwatch:latest`. Pushed manually via
  `mise run dockerhub-release <tag>` — can lag behind a release if that
  command hasn't been run yet.

```bash
docker pull ghcr.io/augustinkrb/stormwatch:latest
# or
docker pull augustinkrb/stormwatch:latest
```

Point `docker-compose.yml`'s `build: .` to `image: <one of the above>`
instead if you'd rather not build locally, or run it directly:

```bash
docker run -p 80:8080 -v ./frames:/app/frames \
  -e MF_RADAR_API_KEY=xxx -e MF_VIGILANCE_KEY=xxx \
  ghcr.io/augustinkrb/stormwatch:latest
```

## Environment variables

Real environment variables are the primary way to configure StormWatch —
the same thing you'd set on any deployment platform (systemd, Portainer,
Kubernetes...). A `.env` file also works as a convenience: copy
`.env.example` to `.env` and fill it in; real env vars take precedence over
it if both are set.

### Feature keys

Each one unlocks a specific layer — the app runs fine with none of them
set, those layers just stay disabled. Free account at
[portail-api.meteofrance.fr](https://portail-api.meteofrance.fr).

- `MF_RADAR_API_KEY` — "MF Cumul" radar layer (falls back to OPERA ACRR
  without it). Portal product: "Données radar".
  API: `public-api.meteofrance.fr/public/DPRadar/v1`
- `MF_AROMEPI_API_KEY` — `/api/cape`, the CAPE layer. Portal product:
  "Modèle AROME Prévision Immédiate".
  API: `public-api.meteofrance.fr/public/aromepi/1.0`
- `MF_PACKAGE_OBS_API_KEY` — `/api/wind`, the wind layer. Portal product:
  "Package Observations".
  API: `public-api.meteofrance.fr/public/DPPaquetObs/v2`
- `MF_PIAF_API_KEY` — the "Prévision" (PIAF) layer. Portal product: "Modèle
  AROME Prévision Immédiate Agrégée Fusionnée (PIAF)".
  API: `api.meteofrance.fr/pro/piaf/1.0`
- `MF_VIGILANCE_KEY` — `/api/vigilance` and vigilance alerts. Portal
  product: "Bulletin Vigilance".
  API: `public-api.meteofrance.fr/public/DPVigilance/v1`

### Optional

Sensible defaults, most deployments won't need to touch these.

- `HOST_PORT` (default `80`) — port exposed on the host.
- `NGINX_PORT` (default `8080`) — nginx's internal container port
  (unprivileged, since nginx runs as non-root).
- `HOST` (default `0.0.0.0`) — Flask bind address.
- `PORT` (default `5000`) — Flask's internal port, proxied by nginx.
- `FRAMES_DIR` (default `/app/frames`) — where radar PNGs are stored.
- `FETCH_INTERVAL_SEC` (default `300`) — polling interval for live sources.
- `MAX_FRAMES` (default `24`) — max frames kept per radar product.
- `MAX_FRAME_AGE_MIN` (default `120`) — max frame age before pruning.
- `BLITZORTUNG_MQTT_HOST` / `BLITZORTUNG_MQTT_PORT` (default
  `blitzortung.ha.sed.pl` / `1883`) — switch to another Blitzortung
  community MQTT mirror if the default one is down.

## The `frames/` permission gotcha

The container runs as a non-root user (UID 1000). `frames/` is where radar
PNGs are persisted across restarts via a bind mount, so it must be writable
by that UID on the host:

```bash
sudo chown -R 1000:1000 frames/
```

Skip this and the container starts fine, but every fetch job silently fails
to write new frames — the dashboard just never updates.
