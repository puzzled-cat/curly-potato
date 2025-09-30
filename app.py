from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import threading
import time
import os
import json

app = Flask(__name__)

REMIND_EVERY_MIN = 30

STATE_FILE = "state.json"
# Feeding times (24h)
FEED_TIMES = ["09:00", "12:00", "17:00"]

# Track whether each slot has been fed
feeding = {t: False for t in FEED_TIMES}

# Track alerts sent (no spam)
alerts_sent = {t: False for t in FEED_TIMES}
last_alert_at = {t: None for t in FEED_TIMES}

# --- Lists persistence (shopping / todos) ---
LISTS_FILE = "lists.json"
lists = {}  # in-memory {name: {title, items[], updated_at}}

def now_iso():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def save_lists():
    data = {"lists": lists}
    tmp = LISTS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, LISTS_FILE)

def load_lists():
    global lists
    if os.path.exists(LISTS_FILE):
        try:
            with open(LISTS_FILE, "r") as f:
                data = json.load(f)
            lists = data.get("lists", {})
            print(f"[LISTS] Loaded {LISTS_FILE}")
        except Exception as e:
            print(f"[LISTS] Failed to load: {e}")
            lists = {}
    # ensure two defaults exist
    for name, title in (("shopping", "Shopping"), ("todo", "To-Dos")):
        lists.setdefault(name, {"title": title, "items": [], "updated_at": now_iso()})

def ensure_list(name: str):
    if name not in lists:
        lists[name] = {"title": name.title(), "items": [], "updated_at": now_iso()}

# --- Helper to log events for Discord bot ---
def write_alert(line: str):
    """Append a single alert/event line to alerts.log for the Discord bot to pick up."""
    line = line.rstrip()
    with open("alerts.log", "a") as f:
        f.write(line + "\n")
    print(f"[ALERT LOGGED] {line}")
   
def save_state():
    data = {"feeding": feeding, "alerts_sent": alerts_sent, "last_alert_at": last_alert_at}
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f: json.dump(data, f)
    os.replace(tmp, STATE_FILE)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                data = json.load(f)
            feeding.update(data.get("feeding", {}))
            alerts_sent.update(data.get("alerts_sent", {}))
            # normalize last_alert_at to known keys
            la = data.get("last_alert_at", {})
            for k in last_alert_at:
                last_alert_at[k] = la.get(k)
            print(f"[STATE] Loaded {STATE_FILE}")
        except Exception as e:
            print(f"[STATE] Failed to load: {e}")


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
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if fed:
            # Mark done and prevent future prompts for today
            alerts_sent[time_str] = True
            last_alert_at[time_str] = None
            write_alert(f"FED {time_str} at {now_str} (via panel)")
        else:
            # Re-open the slot; allow future prompts
            alerts_sent[time_str] = False
            last_alert_at[time_str] = None
            write_alert(f"UNSET {time_str} at {now_str} (via panel)")

        save_state()

    return jsonify(feeding)


def parse_iso(s):
    return datetime.fromisoformat(s) if s else None

def iso_now():
    return datetime.now().isoformat(timespec="seconds")

def check_feeding_times():
    """Send first alert at T+30min, then reminders every REMIND_EVERY_MIN while still not fed."""
    while True:
        now = datetime.now()
        for t_str in FEED_TIMES:
            feed_time = datetime.strptime(t_str, "%H:%M").replace(year=now.year, month=now.month, day=now.day)
            deadline = feed_time + timedelta(minutes=30)

            # Skip future times entirely
            if now <= deadline:
                continue

            if not feeding[t_str]:
                if not alerts_sent[t_str]:
                    # First alert
                    write_alert(f"Missed feeding for {t_str} at {now.strftime('%Y-%m-%d %H:%M:%S')}")
                    alerts_sent[t_str] = True
                    last_alert_at[t_str] = iso_now()
                    save_state()
                else:
                    # Already alerted — send reminder every REMIND_EVERY_MIN
                    last = parse_iso(last_alert_at[t_str])
                    if last is None or (now - last) >= timedelta(minutes=REMIND_EVERY_MIN):
                        write_alert(f"Reminder: {t_str} still not fed at {now.strftime('%Y-%m-%d %H:%M:%S')}")
                        last_alert_at[t_str] = iso_now()
                        save_state()
            else:
                # Fed — nothing to do
                pass

        time.sleep(60)
        
        # ---------- Lists API ----------
@app.get("/api/lists")
def api_lists():
    return jsonify({"lists": list(lists.keys())})

@app.get("/api/lists/<name>")
def api_list_get(name):
    ensure_list(name)
    return jsonify(lists[name])

@app.post("/api/lists/<name>/items")
def api_item_add(name):
    payload = request.get_json() or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    ensure_list(name)
    item_id = f"it_{int(time.time()*1000)}"
    lists[name]["items"].append({
        "id": item_id, "text": text, "done": False, "ts": now_iso()
    })
    lists[name]["updated_at"] = now_iso()
    save_lists()
    return jsonify({"ok": True, "id": item_id})

@app.patch("/api/lists/<name>/items/<item_id>")
def api_item_patch(name, item_id):
    ensure_list(name)
    items = lists[name]["items"]
    for it in items:
        if it["id"] == item_id:
            payload = request.get_json() or {}
            if "text" in payload:
                it["text"] = (payload["text"] or "").strip()
            if "done" in payload:
                it["done"] = bool(payload["done"])
            it["ts"] = now_iso()
            lists[name]["updated_at"] = now_iso()
            save_lists()
            return jsonify({"ok": True})
    return jsonify({"error": "not found"}), 404

@app.delete("/api/lists/<name>/items/<item_id>")
def api_item_delete(name, item_id):
    ensure_list(name)
    items = lists[name]["items"]
    new_items = [it for it in items if it["id"] != item_id]
    if len(new_items) == len(items):
        return jsonify({"error": "not found"}), 404
    lists[name]["items"] = new_items
    lists[name]["updated_at"] = now_iso()
    save_lists()
    return jsonify({"ok": True})

@app.post("/api/lists/<name>/clear_done")
def api_clear_done(name):
    ensure_list(name)
    items = lists[name]["items"]
    lists[name]["items"] = [it for it in items if not it["done"]]
    lists[name]["updated_at"] = now_iso()
    save_lists()
    return jsonify({"ok": True})
# ---------- end Lists API ----------


# --- Start background scheduler thread only once ---
def start_scheduler_once():
    """Prevents double-threading when Flask debug reloader is active."""
    t = threading.Thread(target=check_feeding_times, daemon=True)
    t.start()
    print("[SCHEDULER] Feeding check thread started.")


if __name__ == "__main__":
    load_state()
    load_lists()
    # Only start thread in the main process (avoids duplicate alerts in debug)
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        start_scheduler_once()

    app.run(host="0.0.0.0", port=5000, debug=False)
