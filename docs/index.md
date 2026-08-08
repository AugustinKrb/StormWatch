# StormWatch

Real-time storm-chasing dashboard: radar (reflectivity, accumulation, PIAF
nowcast), lightning, convective indices (CAPE, STP, EHI, hail), Météo-France
vigilance alerts. Installable as a PWA. The app's UI is in French.

## Get an API key

Most layers need a free Météo-France API key:

1. Create an account at
   [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr).
2. Subscribe to the products you want: **Données radar**, **Modèle AROME
   Prévision Immédiate**, **Package Observations**, **Modèle AROME Prévision
   Immédiate Agrégée Fusionnée (PIAF)**, **Bulletin Vigilance**.
3. Grab the key for each product — you don't need all of them, layers
   without a key just stay disabled.

These work out of the box, no key required:

- RainViewer — `api.rainviewer.com/public/weather-maps.json`
- OPERA (EUMETNET) — `s3.waw3-1.cloudferro.com/openradar-24h`
- Blitzortung — MQTT broker `blitzortung.ha.sed.pl`

## Run it

Real environment variables, no file needed — they're what you'd set on any
deployment platform (systemd, Portainer, Kubernetes...) anyway.

### Docker image

No need to clone anything — every release publishes a ready-to-run image,
on GHCR and Docker Hub:

```bash
docker run -p 80:8080 -v ./frames:/app/frames \
  -e MF_RADAR_API_KEY=xxx -e MF_VIGILANCE_KEY=xxx \
  ghcr.io/augustinkrb/stormwatch:latest
# or: augustinkrb/stormwatch:latest
```

### From source

```bash
git clone https://github.com/AugustinKrb/StormWatch.git
cd StormWatch
MF_RADAR_API_KEY=xxx MF_VIGILANCE_KEY=xxx mise run run-stormwatch
```

Prefer a `.env` file? `cp .env.example .env`, fill it in, then drop the
inline `-e`/`VAR=` bits from either command above.

Open [http://localhost](http://localhost) once it's running — see
[Deployment](deployment.md) for the non-root permission gotcha and the full
list of variables.

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
- Basemap — © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, tiles © [CARTO](https://carto.com/attributions/), via
  [Leaflet](https://leafletjs.com)
