from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import threading
import time
import os
import json
import requests
from flask import Response, stream_with_context
from queue import Queue, Empty
import time


app = Flask(__name__, static_folder='static', static_url_path='/static')
CONFIG_FILE = os.path.join("data", "config.json")
CONFIG = {}
# CONFIG
def load_config():
    global CONFIG
    try:
        with open(CONFIG_FILE, "r") as f:
            CONFIG = json.load(f)
        print(f"[CONFIG] Loaded {CONFIG_FILE}")
    except Exception as e:
        print(f"[CONFIG] Failed to load {CONFIG_FILE}: {e}")
        CONFIG = {}

load_config()

REMIND_EVERY_MIN = 30
STATE_FILE = os.path.join("data", "state.json")
FEED_TIMES = CONFIG.get("feeding", {}).get("times", ["09:00", "12:00", "17:00"])

# Track whether each slot has been fed
feeding = {t: False for t in FEED_TIMES}

# Track alerts sent (no spam)
alerts_sent = {t: False for t in FEED_TIMES}
last_alert_at = {t: None for t in FEED_TIMES}

# --- Lists persistence (shopping / todos) ---
LISTS_FILE = os.path.join("data", "lists.json")
lists = {}  # in-memory {name: {title, items[], updated_at}}

TODO_LIST_NAME = "shopping"      # name of the list to use
TODO_ITEM_TEXT = "Buy cat food"  # text of the reminder item


# --- SSE hub ---
_sse_subs = set()

def sse_publish(event: str, data: dict):
    """Fan out an event to all subscribers."""
    payload = json.dumps(data)
    dead = []
    for q in list(_sse_subs):
        try:
            q.put_nowait((event, payload))
        except Exception:
            dead.append(q)
    for q in dead:
        _sse_subs.discard(q)

@app.get("/events")
def sse_events():
    """SSE stream endpoint."""
    q = Queue()
    _sse_subs.add(q)

    def gen():
        # suggest client retry after network drop
        yield "retry: 10000\n\n"
        while True:
            try:
                event, payload = q.get(timeout=30)   # heartbeat every 30s if quiet
                yield f"event: {event}\n"
                yield f"data: {payload}\n\n"
            except Empty:
                hb = json.dumps({"t": int(time.time())})
                yield "event: heartbeat\n"
                yield f"data: {hb}\n\n"

    resp = Response(stream_with_context(gen()), mimetype="text/event-stream")
    # keep proxies from buffering
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"  # nginx
    @resp.call_on_close
    def _cleanup():
        _sse_subs.discard(q)
    return resp

def remove_catfood_todo():
    """
    Remove 'Buy cat food' from the list if it exists.
    """
    try:
        r = requests.get(f"http://127.0.0.1:5000/api/lists/{TODO_LIST_NAME}", timeout=3)
        if r.status_code != 200:
            print(f"[TODO] Couldn't fetch list {TODO_LIST_NAME}: {r.text}")
            return
        data = r.json()
        items = data.get("items", [])

        # find matching items
        matches = [it for it in items if TODO_ITEM_TEXT.lower() in it.get("text", "").lower()]
        for it in matches:
            item_id = it.get("id")
            if not item_id:
                continue
            dr = requests.delete(
                f"http://127.0.0.1:5000/api/lists/{TODO_LIST_NAME}/items/{item_id}",
                timeout=3
            )
            if dr.status_code == 200:
                print(f"[TODO] Removed '{TODO_ITEM_TEXT}' from {TODO_LIST_NAME}")
            else:
                print(f"[TODO] Failed to remove todo {item_id}: {dr.text}")
    except Exception as e:
        print(f"[TODO] Exception while removing cat food todo: {e}")


def ensure_catfood_todo():
    """
    If pouch count is low, ensure 'Buy cat food' exists in the todo list.
    If lists API not set up yet, just log and return gracefully.
    """
    try:
        # Fetch the list first
        r = requests.get(f"http://127.0.0.1:5000/api/lists/{TODO_LIST_NAME}", timeout=3)
        if r.status_code != 200:
            print(f"[TODO] Couldn't fetch list {TODO_LIST_NAME}: {r.text}")
            return
        data = r.json()
        items = data.get("items", [])

        # Check if the item already exists
        exists = any(
            TODO_ITEM_TEXT.lower() in it.get("text", "").lower() for it in items
        )
        if exists:
            return

        # Otherwise, add it
        r2 = requests.post(
            f"http://127.0.0.1:5000/api/lists/{TODO_LIST_NAME}/items",
            json={"text": TODO_ITEM_TEXT},
            timeout=3
        )
        if r2.status_code == 200:
            print(f"[TODO] Added '{TODO_ITEM_TEXT}' to {TODO_LIST_NAME}")
        else:
            print(f"[TODO] Failed to add todo: {r2.text}")
    except Exception as e:
        print(f"[TODO] Exception while ensuring cat food todo: {e}")

def now_iso():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

# --- Pouches (cat food) persistence ---
FOOD_FILE = os.path.join("data", "food.json")
_food_lock = threading.RLock()
food = {"pouches_left": 0, "updated_at": None}

def food_now_iso():
    return datetime.now().isoformat(timespec="seconds")

def _food_atomic_write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, path)

def save_food():
    with _food_lock:
        _food_atomic_write(FOOD_FILE, food.copy())

def load_food():
    """Load food count from disk; if missing, start from 0."""
    if os.path.exists(FOOD_FILE):
        try:
            with open(FOOD_FILE, "r") as f:
                data = json.load(f)
            # tolerate legacy/partial data
            food["pouches_left"] = int(data.get("pouches_left", 0))
            food["updated_at"] = data.get("updated_at") or food_now_iso()
            print(f"[FOOD] Loaded {FOOD_FILE}: {food['pouches_left']}")
        except Exception as e:
            print(f"[FOOD] Failed to load: {e}; defaulting to 0")
            food["pouches_left"] = 0
            food["updated_at"] = food_now_iso()
    else:
        food["pouches_left"] = 0
        food["updated_at"] = food_now_iso()
        save_food()

def add_pouches(amount: int) -> int:
    """
    Add (or subtract) pouches. Negative allowed for 'undo'.
    Floor at 0. Returns new total.
    """
    with _food_lock:
        try:
            amt = int(amount)
        except Exception:
            amt = 0
        # clamp a single operation to |99| to match UI intent
        if amt > 99:
            amt = 99
        if amt < -99:
            amt = -99

        new_total = max(0, int(food["pouches_left"]) + amt)
        food["pouches_left"] = int(new_total)
        food["updated_at"] = food_now_iso()
        save_food()
        # inside add_pouches(...) after save_food()
        sse_publish("pouches:update", {"pouches_left": food["pouches_left"], "updated_at": food["updated_at"]})


    # --- List integration ---
    if new_total <= 3:
        ensure_catfood_todo()
    else:
        remove_catfood_todo()

    # optional: log to your alerts file for Discord if you want a trail
    try:
        delta = f"+{amt}" if amt >= 0 else str(amt)
        write_alert(f"FOOD {delta} => {new_total} at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception:
        pass

    return new_total


def set_pouches(total: int) -> int:
    """Directly set the total (server-side safeguard)."""
    with _food_lock:
        try:
            n = int(total)
        except Exception:
            n = 0
        n = max(0, min(n, 9999))  # hard upper bound to protect layout
        food["pouches_left"] = n
        food["updated_at"] = food_now_iso()
        save_food()
        # inside set_pouches(...) after save_food()
        sse_publish("pouches:update", {"pouches_left": food["pouches_left"], "updated_at": food["updated_at"]})

    # --- List integration ---
    if n <= 3:
        ensure_catfood_todo()
    else:
        remove_catfood_todo()

    return n

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
    with open("data/alerts.log", "a") as f:
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
# ---------- Pouches API ----------
@app.get("/api/food")
def api_food_get():
    with _food_lock:
        return jsonify({
            "pouches_left": int(food.get("pouches_left", 0)),
            "updated_at": food.get("updated_at")
        })

@app.post("/api/food/add")
def api_food_add():
    data = request.get_json() or {}
    amount = data.get("amount")
    try:
        amount = int(amount)
    except Exception:
        return jsonify({"error": "amount must be an integer"}), 400
    if amount == 0:
        return jsonify({"error": "amount cannot be 0"}), 400

    new_total = add_pouches(amount)
    return jsonify({"pouches_left": new_total})

# (Optional) direct setter used for admin/reset or if you prefer undo via /set
@app.post("/api/food/set")
def api_food_set():
    data = request.get_json() or {}
    total = data.get("total")
    try:
        total = int(total)
    except Exception:
        return jsonify({"error": "total must be an integer"}), 400
    new_total = set_pouches(total)
    return jsonify({"pouches_left": new_total})
# ---------- end Pouches API ----------


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
            
            try:
                add_pouches(-2)
            except Exception as e:
                print(f"[POUCHES] Auto-subtract failed: {e}")
        else:
            # Re-open the slot; allow future prompts
            alerts_sent[time_str] = False
            last_alert_at[time_str] = None
            write_alert(f"UNSET {time_str} at {now_str} (via panel)")

        save_state()
        # in set_feeding() after save_state()
        sse_publish("feeding:update", {"feeding": feeding})

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
    sse_publish("lists:update", {"name": name, "ts": time.time()})
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
            sse_publish("lists:update", {"name": name, "ts": time.time()})
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
    sse_publish("lists:update", {"name": name, "ts": time.time()})

    return jsonify({"ok": True})

@app.post("/api/lists/<name>")
def api_list_create(name):
    if name not in lists:
        ensure_list(name)
        save_lists()
        sse_publish("lists:index", {"lists": list(lists.keys())})
    return jsonify({"ok": True, "name": name})

@app.post("/api/lists/<name>/clear_done")
def api_clear_done(name):
    ensure_list(name)
    items = lists[name]["items"]
    lists[name]["items"] = [it for it in items if not it["done"]]
    lists[name]["updated_at"] = now_iso()
    save_lists()
    sse_publish("lists:update", {"name": name, "ts": time.time()})
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
    load_food()
    # Only start thread in the main process (avoids duplicate alerts in debug)
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        start_scheduler_once()

    app.run(host="0.0.0.0", port=5000, debug=False)
