// -----------------------------
// UI bindings for cat food pouches
// -----------------------------

import { apiGetFood, apiAddFood } from './api.js';

export function initPouchesChips() {
    const valEl = document.getElementById("pouchesValue");
    if (!valEl) {
        console.warn("[PouchesUI] Missing #pouchesValue element.");
        return;
    }

    async function refresh() {
        try {
            const data = await apiGetFood();
            valEl.textContent = data.pouches_left;
        } catch (e) {
            console.error("[PouchesUI] Refresh failed:", e);
            valEl.textContent = "—";
        }
    }

    async function add(amount) {
        try {
            const data = await apiAddFood(amount);
            valEl.textContent = data.pouches_left;
        } catch (e) {
            console.error("[PouchesUI] Add pouches failed:", e);
        }
    }

    document.querySelectorAll(".pouches-chips .chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const amount = parseInt(chip.dataset.add, 10);
            if (!isNaN(amount)) add(amount);
        });
    });

    refresh();
}
