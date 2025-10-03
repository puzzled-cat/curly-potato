// -----------------------------
// UI event bindings for side-by-side Lists panel
// -----------------------------

async function getList(name) {
    const r = await fetch(`/api/lists/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`getList(${name}) failed`);
    return r.json();
}

async function addItem(name, text) {
    const r = await fetch(`/api/lists/${encodeURIComponent(name)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`addItem(${name}) failed`);
    return r.json();
}

async function patchItem(name, id, done) {
    const r = await fetch(`/api/lists/${encodeURIComponent(name)}/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
    });
    if (!r.ok) throw new Error(`patchItem(${name}, ${id}) failed`);
}

async function deleteItem(name, id) {
    const r = await fetch(`/api/lists/${encodeURIComponent(name)}/items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
    if (!r.ok) throw new Error(`deleteItem(${name}, ${id}) failed`);
}

//Render a list into a specific column container.
async function renderListInto(col) {
    const name = col.dataset.list;
    const ul = col.querySelector('.list-items');
    if (!name || !ul) return;

    const data = await getList(name);
    ul.innerHTML = '';

    (data.items || []).forEach(item => {
        const li = document.createElement('li');
        if (item.done) li.classList.add('done');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!item.done;
        cb.addEventListener('change', async () => {
            await patchItem(name, item.id, cb.checked);
            li.classList.toggle('done', cb.checked);
        });

        const text = document.createElement('span');
        text.textContent = item.text;

        const del = document.createElement('button');
        del.innerHTML = '✖';
        del.addEventListener('click', async () => {
            await deleteItem(name, item.id);
            li.remove();
        });

        li.appendChild(cb);
        li.appendChild(text);
        li.appendChild(del);
        ul.appendChild(li);
    });
}

export function initListsUI() {
    const cols = document.querySelectorAll('.list-col[data-list]');
    if (!cols.length) {
        console.warn('[ListsUI] No list columns found.');
        return;
    }

    // Bind add actions per column
    cols.forEach(col => {
        const name = col.dataset.list;
        const input = col.querySelector('.list-input');
        const btn = col.querySelector('.list-add-btn');

        const doAdd = async () => {
            const text = (input.value || '').trim();
            if (!text) return;
            await addItem(name, text);
            input.value = '';
            renderListInto(col);
        };

        if (btn) btn.addEventListener('click', doAdd);
        if (input) input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
        });
    });

    // Initial render for both columns
    cols.forEach(col => renderListInto(col));

    if ('EventSource' in window) {
        try {
            const es = new EventSource('/events');
            es.addEventListener('lists:update', (e) => {
                const { name } = JSON.parse(e.data || '{}');
                // Refresh only the matching column
                const col = document.querySelector(`.list-col[data-list="${name}"]`);
                if (col) {
                    clearTimeout(col.__deb);
                    col.__deb = setTimeout(() => renderListInto(col), 120);
                }
            });
        } catch (_) { }
    }
}
