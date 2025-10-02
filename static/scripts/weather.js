// static/js/weather.js
// ---------------------------------
// Weather card rendering + refresh
// ---------------------------------

import { fetchWeatherBelfast } from './api.js';

// ---- Defaults (can be overridden via initWeather options)
const DEFAULT_LAT = 54.58314393020901;
const DEFAULT_LON = -5.898022460442155;
const DEFAULT_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

// ---- Internals
function isoHourLocal(d = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function wxIcon(code) {
    // Open-Meteo weathercode → Material Symbol
    if ([0].includes(code)) return "<span class='material-symbols-outlined'>sunny</span>";
    if ([1, 2].includes(code)) return "<span class='material-symbols-outlined'>partly_cloudy_day</span>";
    if ([3].includes(code)) return "<span class='material-symbols-outlined'>cloud</span>";
    if ([45, 48].includes(code)) return "<span class='material-symbols-outlined'>foggy</span>";
    if ([51, 53, 55, 61, 63, 65].includes(code)) return "<span class='material-symbols-outlined'>rainy</span>";
    if ([80, 81, 82].includes(code)) return "<span class='material-symbols-outlined'>sunny_snowing</span>";
    if ([95, 96, 99].includes(code)) return "<span class='material-symbols-outlined'>thunderstorm</span>";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "<span class='material-symbols-outlined'>ac_unit</span>";
    return "🌡️";
}

export function renderNextDays(data) {
    const d = data.daily;
    if (!d || !d.time) return;

    const container = document.getElementById("wx-next");
    if (!container) return;
    container.innerHTML = "";

    const count = Math.min(3, d.time.length);
    for (let i = 1; i < count; i++) {
        const dateStr = d.time[i]; // ISO date (YYYY-MM-DD)
        const day = new Date(dateStr + "T00:00");
        const label = i === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" });

        const min = Math.round(d.temperature_2m_min[i]);
        const max = Math.round(d.temperature_2m_max[i]);
        const rain = d.precipitation_probability_max?.[i];
        const code = d.weathercode?.[i] ?? null;

        const el = document.createElement("div");
        el.className = "wx-day";
        el.innerHTML = `
      <div class="wx-when">${label}</div>
      <div class="wx-minmax">${min}° / ${max}°</div>
      <div class="wx-ico"><small class="muted">${typeof rain === "number" ? rain + "%" : "—"}</small> ${wxIcon(code)}</div>
    `;
        container.appendChild(el);
    }
}

export function renderWeatherCard(data) {
    const now = data.current_weather || {};
    const tempC = typeof now.temperature === "number" ? Math.round(now.temperature) : null;

    renderNextDays(data);

    // wind speed m/s -> mph
    const windMps = typeof now.windspeed === "number" ? now.windspeed : null;
    const windMph = windMps != null ? Math.round(windMps * 2.23694) : null;

    // rain chance for current local hour
    const times = data.hourly?.time || [];
    const idx = times.indexOf(isoHourLocal());
    let rainPct = null;
    if (idx >= 0 && Array.isArray(data.hourly.precipitation_probability)) {
        const v = data.hourly.precipitation_probability[idx];
        rainPct = (typeof v === "number") ? v : null;
    }

    // today range
    const tMax = data.daily?.temperature_2m_max?.[0];
    const tMin = data.daily?.temperature_2m_min?.[0];

    const get = (id) => document.getElementById(id);
    const set = (id, text) => { const el = get(id); if (el) el.textContent = text; };

    set("wx-temp", tempC != null ? `${tempC}°C` : "—");
    set("wx-rain", rainPct != null ? `${rainPct}%` : "—");
    set("wx-wind", windMph != null ? `${windMph} mph` : "—");
    set("wx-range", (tMin != null && tMax != null) ? `${Math.round(tMin)}° / ${Math.round(tMax)}°` : "—");
    set("wx-updated", `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}

/**
 * Start periodic weather updates.
 * @param {Object} opts
 * @param {number} opts.lat - latitude (default Belfast)
 * @param {number} opts.lon - longitude
 * @param {number} opts.refreshMs - refresh interval
 * @param {Function} opts.fetcher - custom fetcher (defaults to fetchWeatherBelfast)
 */
export function initWeather({
    lat = DEFAULT_LAT,
    lon = DEFAULT_LON,
    refreshMs = DEFAULT_REFRESH_MS,
    fetcher = fetchWeatherBelfast, // uses lat/lon you defined inside api.js; override if needed
} = {}) {
    // If you want per-location fetching, provide a fetcher that accepts (lat, lon)
    async function updateWeatherCard() {
        try {
            // If your fetcher ignores lat/lon, that's fine; otherwise pass them in
            const data = await fetcher(lat, lon);
            renderWeatherCard(data);
        } catch (e) {
            console.error("[Weather] fetch failed:", e);
            const el = document.getElementById("wx-updated");
            if (el) el.textContent = "Weather unavailable";
        }
    }

    // initial + interval
    updateWeatherCard();
    setInterval(updateWeatherCard, refreshMs);
}
