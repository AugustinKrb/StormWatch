"""Flask app entrypoint: registers routes, bootstraps data, and starts the scheduler."""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask

import config
import jobs
import lightning
import routes
from converter import dbzh_to_png, opera_acrr_to_png, opera_rate_to_png

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

app = Flask(__name__)
routes.register(app)


def _init_dbzh() -> None:
    jobs.bootstrap("dbzh", dbzh_to_png)
    jobs.job_opera_dbzh()


def _init_acrr() -> None:
    jobs.bootstrap("acrr", opera_acrr_to_png)
    jobs.job_opera_acrr()


def _init_rate() -> None:
    jobs.bootstrap("rate", opera_rate_to_png)
    jobs.job_opera_rate()


def _init_mf() -> None:
    if config.MF_RADAR_API_KEY:
        jobs.job_mf_acrr()


def _startup() -> None:
    """Off-thread so app.run() starts immediately; independent sources fetch in parallel."""
    inits = [
        _init_dbzh,
        _init_acrr,
        _init_rate,
        _init_mf,
        jobs.job_wind,
        jobs.job_cape,
        jobs.job_shear,
        jobs.job_rainviewer,
    ]
    if config.MF_VIGILANCE_KEY:
        inits.append(jobs.job_vigilance)
    if config.MF_PIAF_API_KEY:
        inits.append(jobs.job_piaf)
    with ThreadPoolExecutor(max_workers=len(inits)) as ex:
        futures = {ex.submit(fn): fn for fn in inits}
        for future in futures:
            try:
                future.result()
            except Exception:  # pylint: disable=broad-exception-caught
                log.exception("Startup init %s failed", futures[future].__name__)

    scheduler = BackgroundScheduler(timezone="UTC")
    # cron (not interval) keeps polls aligned to OPERA/MF's real 5-min marks, restart or not.
    scheduler.add_job(jobs.job_opera_dbzh, "cron", minute="*/5", second=30)
    scheduler.add_job(jobs.job_opera_acrr, "cron", minute="*/5", second=30)
    # RATE refreshes every 15 min upstream like ACRR — polling every 5 just catches it sooner.
    scheduler.add_job(jobs.job_opera_rate, "cron", minute="*/5", second=30)
    if config.MF_RADAR_API_KEY:
        scheduler.add_job(jobs.job_mf_acrr, "cron", minute="*/5", second=30)
    # MF station obs refresh every 6 min — poll at the same cadence as the other live sources.
    scheduler.add_job(jobs.job_wind, "interval", seconds=config.FETCH_INTERVAL_SEC)
    # AROME-PI runs hourly, published ~17-20 min in (measured live) — :22 catches it with margin.
    scheduler.add_job(jobs.job_cape, "cron", minute=22)
    # Same AROME-PI run, offset a few minutes so both crons don't hit MF at the same second.
    scheduler.add_job(jobs.job_shear, "cron", minute=25)
    # PIAF reruns every 5 min, but 8 downloads/poll (~14MB each) is too heavy for that cadence.
    if config.MF_PIAF_API_KEY:
        scheduler.add_job(jobs.job_piaf, "cron", minute="*/15", second=15)
    scheduler.add_job(jobs.job_rainviewer, "interval", seconds=config.FETCH_INTERVAL_SEC)
    # No push mechanism — poll like the other live sources.
    if config.MF_VIGILANCE_KEY:
        scheduler.add_job(jobs.job_vigilance, "interval", seconds=config.FETCH_INTERVAL_SEC)
    scheduler.start()


lightning.start()
threading.Thread(target=_startup, daemon=True).start()

log.info(
    "Server on %s:%d — sources: OPERA DBZH+ACRR+RATE%s",
    config.HOST,
    config.PORT,
    " + MF accumulation" if config.MF_RADAR_API_KEY else "",
)

if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, threaded=True)
