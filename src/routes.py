"""Flask API route registration: exposes jobs/frames/lightning state to the frontend."""

import json
import queue

from flask import Response, jsonify, request, send_file, stream_with_context

import config
import events
import frames_store
import jobs
import lightning
import settings_store


def register(app) -> None:
    """Register all /api/* and /frames/* routes on the given Flask app."""

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/lightning/stream")
    def lightning_stream():
        q = lightning.register_listener()

        def generate():
            try:
                while True:
                    try:
                        strike = q.get(timeout=25)
                        yield f"data: {json.dumps(strike)}\n\n"
                    except queue.Empty:
                        yield ": ping\n\n"
            finally:
                lightning.unregister_listener(q)

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @app.get("/api/events/stream")
    def events_stream():
        q = events.register_listener()

        def generate():
            try:
                while True:
                    try:
                        event_type = q.get(timeout=25)
                        yield f'data: {{"type": "{event_type}"}}\n\n'
                    except queue.Empty:
                        yield ": ping\n\n"
            finally:
                events.unregister_listener(q)

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @app.get("/api/wind")
    def wind():
        data = jobs.get_wind()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/obs-points")
    def obs_points():
        data = jobs.get_obs_points()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/cape")
    def cape():
        data = jobs.get_cape()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/stp")
    def stp():
        data = jobs.get_stp()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/ehi")
    def ehi():
        data = jobs.get_ehi()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/hail")
    def hail():
        data = jobs.get_hail()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/rainviewer/frames")
    def rainviewer_frames():
        data = jobs.get_rainviewer()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/vigilance")
    def vigilance():
        data = jobs.get_vigilance()
        if data is None:
            return jsonify({"error": "not ready"}), 503
        return jsonify(data)

    @app.get("/api/status")
    def status():
        return jsonify(
            {
                "wind": jobs.get_wind() is not None,
                "cape": jobs.get_cape() is not None,
                "stp": jobs.get_stp() is not None,
                "ehi": jobs.get_ehi() is not None,
                "hail": jobs.get_hail() is not None,
                "lightning": lightning.is_connected(),
            }
        )

    @app.get("/api/sources")
    def sources():
        return jsonify(
            {
                "mf_radar": bool(config.MF_RADAR_API_KEY),
                "mf_vigilance": bool(config.MF_VIGILANCE_KEY),
                "mf_piaf": bool(config.MF_PIAF_API_KEY),
                "mf_cape": bool(config.MF_AROMEPI_API_KEY),
                "opera": True,
            }
        )

    @app.get("/api/settings")
    def get_settings():
        return jsonify(settings_store.load())

    @app.post("/api/settings")
    def set_settings():
        patch = request.get_json(force=True, silent=True) or {}
        return jsonify(settings_store.save(patch))

    @app.get("/api/frames/<product>")
    def frames(product: str):
        if product not in frames_store.DIRS:
            return jsonify({"error": "unknown product"}), 404
        return jsonify(frames_store.load_meta(product)["frames"])

    @app.get("/api/bounds/<product>")
    def bounds(product: str):
        if product not in frames_store.DIRS:
            return jsonify({"error": "unknown product"}), 404
        return jsonify(frames_store.load_meta(product)["bounds"])

    @app.get("/frames/<product>/<filename>")
    def frame(product: str, filename: str):
        path = frames_store.frame_path(product, filename)
        if path is None:
            return jsonify({"error": "not found"}), 404
        return send_file(path, mimetype="image/png")
