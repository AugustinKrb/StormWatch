# StormWatch

Real-time storm-chasing dashboard: radar (reflectivity, accumulation, PIAF
nowcast), lightning, convective indices (CAPE, STP, EHI, hail), Météo-France
vigilance alerts. Installable as a PWA. UI is in French.

## Run it

Real environment variables, no file needed — they're what you'd set on any
deployment platform (systemd, Portainer, Kubernetes...) anyway:

```bash
MF_RADAR_API_KEY=xxx MF_VIGILANCE_KEY=xxx mise run run-stormwatch
```

Or with the published image directly, no clone needed — from GHCR or
Docker Hub, same image:

```bash
docker run -p 80:8080 -v ./frames:/app/frames \
  -e MF_RADAR_API_KEY=xxx -e MF_VIGILANCE_KEY=xxx \
  ghcr.io/augustinkrb/stormwatch:latest
# or: augustinkrb/stormwatch:latest
```

Prefer a file? `cp .env.example .env`, fill it in, then drop the inline
`-e`/`VAR=` bits from either command above.

Then open [http://localhost](http://localhost). Full details in the
[docs](https://augustinkrb.github.io/StormWatch/).

The container runs as non-root: the `frames/` folder (persisted radar frames)
must be owned by UID 1000 on the host.

```bash
sudo chown -R 1000:1000 frames/
```

## Data sources

- Reflectivity, accumulation, RATE (Europe composite) — ©
  [EUMETNET OPERA](https://www.eumetnet.eu/observations/opera-radar-animation/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), data modified
  (reprojected, recolored)
- Reflectivity, nowcast — weather data by
  [RainViewer](https://www.rainviewer.com)
- CAPE, wind shear (STP/EHI/hail), accumulation, nowcast (PIAF), vigilance,
  wind — © [Météo-France](https://meteofrance.com),
  [Licence Ouverte / Étalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
- Lightning — [Blitzortung.org](https://www.blitzortung.org), community
  network, informational use only (not an official warning system)
- Basemap — © [OpenFreeMap](https://openfreemap.org), ©
  [OpenMapTiles](https://www.openmaptiles.org/), data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
  rendered by [MapLibre GL](https://maplibre.org/) via
  [Leaflet](https://leafletjs.com)

## License

AGPL-3.0 — see [LICENSE](LICENSE)
