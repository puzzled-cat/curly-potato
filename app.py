from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import threading
import time

app = Flask(__name__)

# Feeding times (24h)
FEED_TIMES = ["09:00", "12:00", "17:00"]

# Track whether each slot has been fed
feeding = {t: False for t in FEED_TIMES}

# Track alerts sent (no spam)
alerts_sent = {t: False for t in FEED_TIMES}


@app.route("/")
def index():
    return render_template("index.html", feed_times=FEED_TIMES)


@app.get("/api/feeding")
def get_feeding():
    return jsonify(feeding)


@app.post("/api/feeding")
def set_feeding():
    data = request.get_json() or {}
    time_str = data.get("time")
    fed = bool(data.get("fed"))
    if time_str in feeding:
        feeding[time_str] = fed
        alerts_sent[time_str] = False  # reset alerts if status changes
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
                print(f"[ALERT] Missed feeding for {t_str}")
                # Instead of print - push to Discord bot via file or queue
                with open("alerts.log", "a") as f:
                    f.write(f"Missed feeding for {t_str} at {now}\n")
                alerts_sent[t_str] = True
        time.sleep(60)


# Start scheduler in background thread
threading.Thread(target=check_feeding_times, daemon=True).start()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
