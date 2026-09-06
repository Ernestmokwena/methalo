import { shared } from './main.js';
import { getSelectedLayers } from './state.js';
import { saveHistory } from './history.js';
import { render } from './render.js';
import { updateStatus } from './ui.js';

export function closeTriggerIconPicker() {
    document.getElementById('triggerIconPicker')?.classList.remove('active');
    document.getElementById('prototypeTriggerPicker')?.classList.remove('active');
}

export function isSocialTriggerIcon(iconName) {
    return String(iconName || '').startsWith('social:');
}

export function getSocialIconUrl(iconName, color) {
    const name = String(iconName || '').slice('social:'.length);
    return `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${encodeURIComponent(name)}.svg`;
}

export function createTriggerIconElement(iconName, color, fontSize) {
    const element = document.createElement(isSocialTriggerIcon(iconName) ? 'img' : 'span');
    element.className = 'trigger-content';
    if (isSocialTriggerIcon(iconName)) {
        element.src = getSocialIconUrl(iconName, color);
        element.alt = '';
        element.onerror = () => {
            const fallback = document.createElement('span');
            fallback.className = 'trigger-content material-symbols-outlined';
            fallback.textContent = 'link';
            fallback.style.fontSize = `${fontSize || 20}px`;
            fallback.style.color = color || '#0f172a';
            element.replaceWith(fallback);
        };
        element.setAttribute('aria-hidden', 'true');
    } else {
        element.classList.add('material-symbols-outlined');
        element.textContent = iconName;
    }
    element.style.fontSize = `${fontSize || 20}px`;
    element.style.color = color || '#0f172a';
    return element;
}

export function loadTriggerIconCatalog() {
    if (shared.triggerIconCatalogPromise) return shared.triggerIconCatalogPromise;
    shared.triggerIconCatalogPromise = fetch(shared.MATERIAL_SYMBOLS_CODEPOINTS_URL)
        .then(response => {
            if (!response.ok) throw new Error(`Icon catalog request failed: ${response.status}`);
            return response.text();
        })
        .then(codepoints => {
            const names = codepoints
                .split(/\r?\n/)
                .map(line => line.trim().split(/\s+/)[0])
                .filter(name => /^[a-z0-9_]+$/.test(name));
            if (names.length) shared.triggerIconCatalog = [...new Set([...shared.SOCIAL_TRIGGER_ICONS, ...names])];
            if (document.getElementById('triggerIconPicker')?.classList.contains('active')) populateTriggerIconPicker();
        })
        .catch(() => {
            shared.triggerIconCatalogPromise = null;
        });
    return shared.triggerIconCatalogPromise;
}

export function populateTriggerIconPicker() {
    const grid = document.getElementById('triggerIconGrid');
    if (!grid) return;
    const active = shared.currentTriggerIcon;
    const search = (document.getElementById('triggerIconSearch')?.value || '').trim().toLowerCase();
    const matches = shared.triggerIconCatalog.filter(iconName => !search || iconName.includes(search));
    const visibleIcons = matches.slice(0, 240);
    const resultCount = document.getElementById('triggerIconResultCount');
    if (resultCount) {
        resultCount.textContent = matches.length > visibleIcons.length
            ? `${matches.length} matches · showing first ${visibleIcons.length}`
            : `${matches.length} ${matches.length === 1 ? 'icon' : 'icons'}`;
    }

    grid.innerHTML = `<button type="button" class="trigger-icon-option ${active === '' ? 'active' : ''}" data-trigger-icon="" title="None" aria-label="Select no icon"><span>None</span></button>` + visibleIcons.map(iconName => `
        <button type="button" class="trigger-icon-option ${iconName === active ? 'active' : ''}" data-trigger-icon="${iconName}" title="${iconName}" aria-label="Select ${iconName} icon">
            ${isSocialTriggerIcon(iconName) ? `<img src="${getSocialIconUrl(iconName)}" alt="" aria-hidden="true">` : `<span class="material-symbols-outlined">${iconName}</span>`}
        </button>
    `).join('');

    if (!visibleIcons.length) {
        grid.innerHTML = '<div class="trigger-icon-empty">No icons found</div>';
    }

    grid.querySelectorAll('.trigger-icon-option').forEach(button => {
        button.addEventListener('click', () => {
            const selectedIcon = button.dataset.triggerIcon;
            const selectedTrigger = getSelectedLayers().find(layer => layer.type === 'trigger');
            if (selectedTrigger && shared.triggerIconPropertyMode) {
                selectedTrigger[shared.triggerIconPropertyMode === 'post' ? 'postIcon' : 'preIcon'] = selectedIcon;
                if (shared.triggerIconPropertyMode === 'pre') selectedTrigger.icon = selectedIcon;
                saveHistory();
                render();
                shared.triggerIconPropertyMode = null;
                document.getElementById('triggerIconPicker').classList.remove('active');
                document.getElementById('prototypeTriggerPicker').classList.remove('active');
                updateStatus('Trigger icon updated');
                return;
            }
            shared.currentTriggerIcon = selectedIcon;
            document.getElementById('triggerIconPicker').classList.remove('active');
            shared.currentTool = 'trigger';
            document.querySelectorAll('.tool-btn[data-tool]').forEach(el => {
                el.classList.toggle('active', el.dataset.tool === 'trigger');
            });
            document.getElementById('canvas').style.cursor = 'crosshair';
            updateStatus(`Trigger icon ready: ${selectedIcon}. Click canvas to place it.`);
        });
    });
}

export function pickTriggerLayerIcon(mode) {
    shared.triggerIconPropertyMode = mode;
    pickPrototypeTrigger();
}

export function pickPrototypeTrigger(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('triggerIconPicker');
    if (!menu) return;
    loadTriggerIconCatalog();
    populateTriggerIconPicker();
    menu.classList.toggle('active');
    document.getElementById('prototypeTriggerPicker').classList.toggle('active', menu.classList.contains('active'));
    if (!menu.classList.contains('active')) {
        const btn = document.getElementById('prototypeTriggerPicker');
        btn.classList.add('active');
    }
}
