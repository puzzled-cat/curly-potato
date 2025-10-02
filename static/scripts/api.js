// -----------------------------
// API helpers
// -----------------------------

const CATFACT_URL = "https://catfact.ninja/facts";

const DEFAULT_LAT = 54.58314393020901;
const DEFAULT_LON = -5.898022460442155;

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
export async function fetchWeatherBelfast() {
    const params = new URLSearchParams({
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LON,
        timezone: "auto",
        current_weather: "true",
        hourly: "precipitation_probability",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
        temperature_unit: "celsius",
        wind_speed_unit: "ms"
    });
    const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString());
    if (!res.ok) throw new Error("Weather fetch failed");
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
