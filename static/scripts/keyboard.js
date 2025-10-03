(function () {
    const vk = document.getElementById('vk');
    const addBtn = document.querySelector('.list-add-btn');
    const rows = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'Enter'],
        ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', 'Space']
    ];

    let target = null, shift = false, caps = false;

    function render() {
        vk.innerHTML = '';
        rows.forEach(r => {
            const rowEl = document.createElement('div');
            rowEl.className = 'row';
            r.forEach(key => {
                const btn = document.createElement('button');
                btn.textContent = label(key);
                btn.dataset.key = key;
                if (['Backspace', 'Enter', 'Shift', 'Caps', 'Space'].includes(key)) btn.classList.add('mod');
                if (key === 'Space') btn.classList.add('wide');
                if ((key === 'Shift' && shift) || (key === 'Caps' && caps)) btn.classList.add('active');
                btn.addEventListener('click', () => press(key));
                rowEl.appendChild(btn);
            });
            vk.appendChild(rowEl);
        });
    }

    function label(k) {
        if (k === 'Backspace') return '⌫';
        if (k === 'Enter') return '⏎';
        if (k === 'Shift') return '⇧';
        if (k === 'Caps') return 'Caps';
        if (k === 'Space') return 'Space';
        return applyCase(k);
    }

    function applyCase(ch) {
        const upper = (caps && !shift) || (!caps && shift);
        return upper ? ch.toUpperCase() : ch;
    }

    function insertAtCaret(el, text) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.setRangeText(text, start, end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function press(key) {
        if (!target) return;
        switch (key) {
            case 'Backspace':
                if (target.selectionStart === target.selectionEnd && target.selectionStart > 0) {
                    target.setRangeText('', target.selectionStart - 1, target.selectionEnd, 'end');
                } else {
                    target.setRangeText('', target.selectionStart, target.selectionEnd, 'end');
                }
                target.dispatchEvent(new Event('input', { bubbles: true }));
                break;
            case 'Enter':
                if (addBtn) addBtn.click();
                else target.form?.requestSubmit?.();
                break;
            case 'Space':
                insertAtCaret(target, ' ');
                break;
            case 'Shift':
                shift = !shift; render();
                break;
            case 'Caps':
                caps = !caps; render();
                break;
            default:
                insertAtCaret(target, applyCase(key));
                if (shift) { shift = false; render(); }
        }
        target.focus();
        target.scrollIntoView({ block: 'nearest' });
    }

    function show(el) {
        target = el;
        vk.classList.add('visible');
        document.documentElement.classList.add('vk-open');
        render();
    }

    function hide() {
        vk.classList.remove('visible');
        document.documentElement.classList.remove('vk-open');
        target = null;
        shift = false;
    }


    document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (el.matches('input[data-virtualkeyboard], textarea[data-virtualkeyboard]')) {
            show(el);
            setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 0);
        }
    });

    document.addEventListener('pointerdown', (e) => {
        if (!vk.contains(e.target) &&
            !e.target.matches('input[data-virtualkeyboard], textarea[data-virtualkeyboard]')) {
            hide();
        }
    });

    vk.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
})();
