// static/js/sse.js
// --------------------------------------
// Server-Sent Events (SSE) live updates
// --------------------------------------

import { renderFeeding, updateStatusLabels } from './feeding.js';
import { renderList } from './api.js';

/**
 * Initialize the SSE connection and bind event listeners.
 */
export function initSSE() {
    const es = new EventSource("/events");

    // --- Pouches updates ---
    es.addEventListener("pouches:update", (e) => {
        const data = JSON.parse(e.data);
        const el = document.getElementById("pouchesValue");
        if (el && typeof data.pouches_left === "number") {
            el.textContent = data.pouches_left;
        }
    });

    // --- Feeding updates ---
    es.addEventListener("feeding:update", (e) => {
        const data = JSON.parse(e.data); // { feeding: {...} }
        if (data && data.feeding) {
            renderFeeding(data.feeding);
            updateStatusLabels(data.feeding);
        }
    });

    // --- Lists updates ---
    function currentListName() {
        const sel = document.getElementById("listSelect");
        return sel ? (sel.value || sel.dataset.default || "todo") : "todo";
    }

    es.addEventListener("lists:update", (e) => {
        if (typeof loadLists === 'function') loadLists();

        const { name } = JSON.parse(e.data);
        if (name === currentListName()) {
            clearTimeout(window.__listDeb);
            window.__listDeb = setTimeout(() => renderList(name), 120);
        }
    });

    // --- Heartbeat & error handling ---
    es.addEventListener("heartbeat", () => {
        // Optional: set a "connected" indicator here
        // console.log("[SSE] heartbeat");
    });

    es.onerror = () => {
        console.warn("[SSE] Connection error — retrying automatically...");
        // Optional: show disconnected badge in UI
    };
}
