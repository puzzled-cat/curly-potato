// -----------------------------
// API helpers
// -----------------------------

const CATFACT_URL = "https://catfact.ninja/facts";

// --- Feeding ---
export async function fetchFeeding() {
    const res = await fetch("/api/feeding");
    return res.json();
}

export async function setFeeding(time, fed) {
    const res = await fetch("/api/feeding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, fed })
    });
    return res.json();
}

// --- Weather ---
/**
 * Fetch Open-Meteo forecast for an arbitrary location.
 * @param {number} lat
 * @param {number} lon
 * @param {Object} [opts]
 * @param {string} [opts.timezone="auto"]
 * @param {string} [opts.temperature_unit="celsius"]  // "celsius" | "fahrenheit"
 * @param {string} [opts.wind_speed_unit="ms"]        // "ms" | "kmh" | "mph" | "kn"
 * @param {string[]} [opts.hourly=["precipitation_probability"]]
 * @param {string[]} [opts.daily=["temperature_2m_max","temperature_2m_min","precipitation_probability_max","weathercode"]]
 * @param {boolean} [opts.current_weather=true]
 */
export async function fetchWeather(lat, lon, opts = {}) {
    const {
        timezone = "auto",
        temperature_unit = "celsius",
        wind_speed_unit = "ms",
        hourly = ["precipitation_probability"],
        daily = [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "weathercode"
        ],
        current_weather = true,
    } = opts;

    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        timezone,
        temperature_unit,
        wind_speed_unit,
        current_weather: String(current_weather),
        hourly: hourly.join(","),
        daily: daily.join(","),
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Weather fetch failed (${res.status}): ${text || url}`);
    }
    return res.json();
}

// --- Lists ---
export async function loadLists() {
    const res = await fetch('/api/lists');
    const data = await res.json();
    console.log("[Lists] Available lists:", data.lists);
    const select = document.getElementById('listSelect');
    select.innerHTML = '';
    data.lists.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        select.appendChild(opt);
    });
    if (data.lists.length > 0) {
        renderList(select.value);
    }
}

export async function renderList(name) {
    const res = await fetch(`/api/lists/${name}`);
    const data = await res.json();
    const listEl = document.getElementById('listItems');
    listEl.innerHTML = '';

    data.items.forEach(item => {
        const li = document.createElement('li');
        if (item.done) li.classList.add('done');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.done;
        checkbox.addEventListener('change', async () => {
            await fetch(`/api/lists/${name}/items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: checkbox.checked })
            });
            renderList(name);
        });

        const text = document.createElement('span');
        text.textContent = item.text;

        const del = document.createElement('button');
        del.innerHTML = '✖';
        del.addEventListener('click', async () => {
            await fetch(`/api/lists/${name}/items/${item.id}`, { method: 'DELETE' });
            renderList(name);
        });

        li.appendChild(checkbox);
        li.appendChild(text);
        li.appendChild(del);
        listEl.appendChild(li);
    });
}

// --- Pouches (food) ---
export async function apiGetFood() {
    const r = await fetch("/api/food");
    if (!r.ok) throw new Error("food get failed");
    return r.json();
}

export async function apiAddFood(amount) {
    const r = await fetch("/api/food/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount })
    });
    if (!r.ok) throw new Error("food add failed");
    return r.json();
}

// --- Cat facts ---
export async function fetchFactsBatch(limit = PREFETCH_SIZE) {
    try {
        const res = await fetch(`${CATFACT_URL}?limit=${limit}`);
        if (!res.ok) throw new Error("cat facts fetch failed");
        const data = await res.json();
        console.log("[CatFacts] Fetched", (data.data || []).length, "facts");
        const facts = (data.data || [])
            .map(x => (x.fact || "").trim())
            .filter(Boolean);
        return facts;
    } catch (e) {
        console.error("[CatFacts] Fetch error:", e);
        return [];
    }
}
