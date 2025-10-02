// static/js/lists-ui.js
// -----------------------------
// UI event bindings for Lists panel
// -----------------------------

import { loadLists, renderList } from './api.js';

/**
 * Initialize all UI event listeners for the Lists panel.
 * Call this once on DOMContentLoaded.
 */
export function initListsUI() {
    const listSelect = document.getElementById('listSelect');
    const addBtn = document.getElementById('addItemBtn');
    const clearDoneBtn = document.getElementById('clearDoneBtn');
    const newItemText = document.getElementById('newItemText');

    if (!listSelect || !addBtn || !clearDoneBtn || !newItemText) {
        console.warn('[ListsUI] Some list elements are missing, skipping init.');
        return;
    }

    // Change list selector → re-render items
    listSelect.addEventListener('change', (e) => {
        renderList(e.target.value);
    });

    // Add new item
    addBtn.addEventListener('click', async () => {
        const name = listSelect.value;
        const text = newItemText.value.trim();
        if (!text) return;

        await fetch(`/api/lists/${name}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        newItemText.value = '';
        renderList(name);
    });

    // Clear completed items
    clearDoneBtn.addEventListener('click', async () => {
        const name = listSelect.value;
        await fetch(`/api/lists/${name}/clear_done`, { method: 'POST' });
        renderList(name);
    });

    // Initial load of available lists
    document.addEventListener('DOMContentLoaded', loadLists());
}
