from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import threading
import time
import os

app = Flask(__name__)

# Feeding times (24h)
FEED_TIMES = ["09:00", "12:00", "17:00"]

# Track whether each slot has been fed
feeding = {t: False for t in FEED_TIMES}

# Track alerts sent (no spam)
alerts_sent = {t: False for t in FEED_TIMES}


# --- Helper to log events for Discord bot ---
def write_alert(line: str):
    """Append a single alert/event line to alerts.log for the Discord bot to pick up."""
    line = line.rstrip()
    with open("alerts.log", "a") as f:
        f.write(line + "\n")
    print(f"[ALERT LOGGED] {line}")


@app.route("/")
def index():
    return render_template("index.html", feed_times=FEED_TIMES)


@app.get("/api/feeding")
def get_feeding():
    return jsonify(feeding)


@app.post("/api/feeding")
def set_feeding():
    """Called when user toggles a feed slider."""
    data = request.get_json() or {}
    time_str = data.get("time")
    fed = bool(data.get("fed"))

    if time_str in feeding:
        feeding[time_str] = fed
        alerts_sent[time_str] = False  # reset missed alert flag if user changes state

        # Log a feed confirmation event when toggled to True
        if fed:
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            write_alert(f"FED {time_str} at {now_str} (via panel)")
        else:
            # Optional: also log when user unsets
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            write_alert(f"UNSET {time_str} at {now_str} (via panel)")

    return jsonify(feeding)


def check_feeding_times():
    """Background thread to check if feeding missed by 30 min."""
    while True:
        now = datetime.now()
        for t_str in FEED_TIMES:
            feed_time = datetime.strptime(t_str, "%H:%M").replace(
                year=now.year, month=now.month, day=now.day
            )
            deadline = feed_time + timedelta(minutes=30)
            if now > deadline and not feeding[t_str] and not alerts_sent[t_str]:
                alert_line = f"Missed feeding for {t_str} at {now.strftime('%Y-%m-%d %H:%M')}"
                write_alert(alert_line)
                alerts_sent[t_str] = True
        time.sleep(60)


# --- Start background scheduler thread only once ---
def start_scheduler_once():
    """Prevents double-threading when Flask debug reloader is active."""
    t = threading.Thread(target=check_feeding_times, daemon=True)
    t.start()
    print("[SCHEDULER] Feeding check thread started.")


if __name__ == "__main__":
    # Only start thread in the main process (avoids duplicate alerts in debug)
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        start_scheduler_once()

    app.run(host="0.0.0.0", port=5000, debug=False)
