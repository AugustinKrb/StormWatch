"""Blitzortung MQTT client: streams lightning strikes to SSE listeners via routes.py."""

import contextlib
import json
import logging
import time
from types import SimpleNamespace

import paho.mqtt.client as mqtt

import events
from config import BLITZORTUNG_MQTT_HOST, BLITZORTUNG_MQTT_PORT
from pubsub import Listeners

log = logging.getLogger(__name__)

_BLITZ_TOPIC = "blitzortung/1.1/#"
# Extended Europe bounding box (filtered backend-side)
_EUR = (30.0, 72.0, -25.0, 45.0)

_listeners = Listeners(maxsize=500)
register_listener = _listeners.register
unregister_listener = _listeners.unregister
_broadcast_strike = _listeners.broadcast
_state = SimpleNamespace(connected=False)


def is_connected() -> bool:
    """Whether the MQTT client is currently connected to the Blitzortung broker."""
    return _state.connected


def _on_connect(client, _userdata, _flags, reason_code, _properties):
    if reason_code == 0:
        _state.connected = True
        log.info("Blitzortung MQTT: connected to %s", BLITZORTUNG_MQTT_HOST)
        client.subscribe(_BLITZ_TOPIC)
        events.publish("lightning")
    else:
        log.warning("Blitzortung MQTT: connection error rc=%s", reason_code)


def _on_disconnect(_client, _userdata, _disconnect_flags, reason_code, _properties):
    _state.connected = False
    log.warning("Blitzortung MQTT: disconnected rc=%s", reason_code)


def _on_message(_client, _userdata, message):
    try:
        d = json.loads(message.payload)
        lat = float(d.get("lat") or d.get("latitude") or 0)
        lon = float(d.get("lon") or d.get("longitude") or 0)
        if not (_EUR[0] <= lat <= _EUR[1] and _EUR[2] <= lon <= _EUR[3]):
            return
        t_ms = (int(d["time"]) // 1_000_000) if d.get("time") else int(time.time() * 1000)
        strike = {"lat": round(lat, 5), "lon": round(lon, 5), "t": t_ms}
        if d.get("pol") is not None:
            with contextlib.suppress(TypeError, ValueError):
                strike["pol"] = 1 if int(d["pol"]) > 0 else -1
        _broadcast_strike(strike)
    except (AttributeError, TypeError, ValueError, KeyError):
        pass  # malformed payload from the public broker — drop the strike


def start() -> None:
    """Connect to the Blitzortung MQTT broker in the background (non-fatal on failure)."""
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_connect = _on_connect
        client.on_disconnect = _on_disconnect
        client.on_message = _on_message
        client.reconnect_delay_set(min_delay=5, max_delay=120)
        client.connect_async(BLITZORTUNG_MQTT_HOST, BLITZORTUNG_MQTT_PORT, keepalive=60)
        client.loop_start()
        log.info(
            "Blitzortung MQTT: starting client toward %s:%d",
            BLITZORTUNG_MQTT_HOST,
            BLITZORTUNG_MQTT_PORT,
        )
    except Exception as e:  # pylint: disable=broad-exception-caught
        # Non-critical feature — degrade gracefully
        log.warning("Blitzortung MQTT: failed to start (%s) — lightning disabled", e)
