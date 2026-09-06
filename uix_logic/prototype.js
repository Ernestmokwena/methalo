import { shared } from './main.js';
import { render } from './render.js';
import { saveHistory } from './history.js';
import { callBusinessApiSync, getLayer, getSelectedLayers } from './state.js';
import { positionPrototypePreviewPanel } from './ui.js';

export function getPrototypeGroups() {
    return shared.layers.filter(layer => layer.type === 'group' && layer.prototypeEnabled);
}

export function syncPrototypePreviewPanel() {
    const list = document.getElementById('prototypePreviewList');
    if (!list) return;

    const groups = getPrototypeGroups();
    if (!groups.length) {
        list.innerHTML = '<div class="prototype-empty">No prototype groups yet.</div>';
        return;
    }

    list.innerHTML = '';
    groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'prototype-preview-item';
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            shared.selectedIds = [group.id];
            closePrototypePreviewPanel();
            const toggle = document.getElementById('prototypeToggle');
            const rect = toggle ? toggle.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: 32 };
            openPrototypePanel(group.id, rect.left, rect.bottom + 8);
            if (toggle) toggle.classList.add('active');
            render();
        });

        const title = document.createElement('div');
        title.className = 'prototype-preview-name';
        title.textContent = group.name || `Group ${group.id}`;
        item.appendChild(title);

        const stack = document.createElement('div');
        stack.className = 'prototype-node-stack';

        const node = document.createElement('div');
        node.className = 'prototype-node';

        const pre = document.createElement('button');
        pre.type = 'button';
        pre.className = 'prototype-state-pill' + (group.prototypeState === 'pre' ? ' active' : '');
        pre.textContent = 'Pre';
        pre.addEventListener('click', () => {
            group.prototypeState = 'pre';
            saveHistory();
            render();
            syncPrototypePreviewPanel();
        });

        const wire = document.createElement('div');
        wire.className = 'prototype-node-wire';

        const post = document.createElement('button');
        post.type = 'button';
        post.className = 'prototype-state-pill' + (group.prototypeState === 'post' ? ' active' : '');
        post.textContent = 'Post';
        post.addEventListener('click', () => {
            group.prototypeState = 'post';
            saveHistory();
            render();
            syncPrototypePreviewPanel();
        });

        group.prototypeStates = group.prototypeStates || { pre: { display: 'flex', clipPath: '' }, post: { display: 'none', clipPath: '' } };
        const preLabel = document.createElement('div');
        preLabel.className = 'prototype-node-label' + (group.prototypeState === 'pre' ? ' active' : '');
        preLabel.textContent = 'Default';
        const postLabel = document.createElement('div');
        postLabel.className = 'prototype-node-label' + (group.prototypeState === 'post' ? ' active' : '');
        postLabel.textContent = 'Toggled';

        const firstRow = document.createElement('div');
        firstRow.className = 'prototype-node';
        firstRow.appendChild(preLabel);
        firstRow.appendChild(wire.cloneNode(true));
        firstRow.appendChild(postLabel);

        const secondRow = document.createElement('div');
        secondRow.className = 'prototype-node';
        secondRow.appendChild(pre);
        secondRow.appendChild(wire.cloneNode(true));
        secondRow.appendChild(post);

        stack.appendChild(firstRow);
        stack.appendChild(secondRow);
        item.appendChild(stack);
        list.appendChild(item);
    });
}

export function closePrototypePreviewPanel() {
    const panel = document.getElementById('prototypePreviewPanel');
    const toggle = document.getElementById('prototypeToggle');
    shared.prototypePreviewMode = false;
    if (panel) panel.classList.remove('active');
    if (toggle) toggle.classList.remove('active');
    render();
}

export function getSelectedPrototypeGroup() {
    const selected = getSelectedLayers();
    if (selected.length === 1 && selected[0].type === 'group') {
        return selected[0];
    }
    return null;
}

export function togglePrototypeTool(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const selectedGroup = getSelectedPrototypeGroup();
    const toggle = document.getElementById('prototypeToggle');
    if (selectedGroup) {
        closePrototypePreviewPanel();
        if (shared.prototypePanel.classList.contains('active') && shared.prototypePanelGroupId === selectedGroup.id) {
            closePrototypePanel();
            if (toggle) toggle.classList.remove('active');
            return;
        }

        const anchor = getPrototypePanelAnchor();
        openPrototypePanel(selectedGroup.id, anchor.x, anchor.y);
        if (toggle) toggle.classList.add('active');
        return;
    }

    togglePrototypePreviewPanel(e);
}

export function togglePrototypePreviewPanel(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const panel = document.getElementById('prototypePreviewPanel');
    const toggle = document.getElementById('prototypeToggle');
    if (!panel || !toggle) return;

    const shouldOpen = !panel.classList.contains('active');
    closePrototypePreviewPanel();
    if (shouldOpen) {
        shared.prototypePreviewMode = true;
        panel.classList.add('active');
        toggle.classList.add('active');
        syncPrototypePreviewPanel();
        positionPrototypePreviewPanel();
        render();
    }
}

export function ensureGroupPrototype(group) {
    if (!group || group.type !== 'group') return group;
    Object.assign(group, {
        prototypeEnabled: group.prototypeEnabled !== undefined ? group.prototypeEnabled : false,
        icon: group.icon || '',
        prototypeTriggerId: group.prototypeTriggerId !== undefined ? group.prototypeTriggerId : null,
        prototypeState: group.prototypeState || 'pre',
        prototypeTransition: group.prototypeTransition !== undefined ? group.prototypeTransition : shared.DEFAULT_PROTOTYPE_TRANSITION,
        prototypeStates: {
            pre: group.prototypeStates?.pre || { display: 'flex', clipPath: '' },
            post: group.prototypeStates?.post || { display: 'none', clipPath: '' }
        },
        prototypeHover: group.prototypeHover || { opacity: 1, clipPath: '' }
    });
    return group;
}

export function getPrototypeStateDisplay(group, fallback = 'flex') {
    if (!group) return fallback;
    const stateName = group.prototypeState === 'post' ? 'post' : 'pre';
    const state = group.prototypeStates?.[stateName] || group.prototypeStates?.pre || {};
    const display = state.display ?? fallback;
    return String(display).toLowerCase() === 'none' ? 'none' : display || fallback;
}

export // Live editor preview: flips the persisted pre/post state so the click
// trigger behaves the same in the editor as it will in the export.
function togglePrototypeState(groupId) {
    const group = getLayer(groupId);
    if (!group) return;
    const result = callBusinessApiSync('toggle-prototype-state', { group });
    Object.assign(group, result);
    saveHistory();
    render();
}

export function getPrototypePanelAnchor() {
    const toggle = document.getElementById('prototypeToggle');
    if (toggle) {
        const rect = toggle.getBoundingClientRect();
        return {
            x: rect.left + 12,
            y: rect.bottom + 8
        };
    }
    return {
        x: Math.max(16, window.innerWidth * 0.5 - 130),
        y: 72
    };
}

export function openPrototypePanel(groupId, x, y) {
    const group = getLayer(groupId);
    if (!group || group.type !== 'group') return;
    ensureGroupPrototype(group);
    shared.prototypePanelGroupId = groupId;
    updatePrototypePanelUI();

    const anchor = typeof x === 'number' && typeof y === 'number' ? { x, y } : getPrototypePanelAnchor();
    const panelW = 300, panelH = 420;
    const left = Math.min(anchor.x, window.innerWidth - panelW - 8);
    const top = Math.min(anchor.y, window.innerHeight - panelH - 8);
    shared.prototypePanel.style.left = Math.max(8, left) + 'px';
    shared.prototypePanel.style.top = Math.max(8, top) + 'px';
    shared.prototypePanel.classList.add('active');
}

export function closePrototypePanel() {
    shared.prototypePanel.classList.remove('active');
    shared.prototypePanelGroupId = null;
}

export function updatePrototypePanelUI() {
    const group = getLayer(shared.prototypePanelGroupId);
    if (!group) return;
    ensureGroupPrototype(group);

    shared.prototypePanel.querySelectorAll('[data-proto-key]').forEach(btn => {
        const value = btn.getAttribute('data-proto-value');
        btn.classList.toggle('active', String(group.prototypeEnabled) === value);
    });

    const triggerSelect = shared.prototypePanel.querySelector('[data-proto-trigger="layer"]');
    if (triggerSelect) {
        const options = ['<option value="">None</option>'];
        shared.layers.forEach(layer => {
            if (layer.type !== 'trigger') return;
            const label = layer.name || `${layer.type} ${layer.id}`;
            const selected = String(group.prototypeTriggerId) === String(layer.id) ? 'selected' : '';
            options.push(`<option value="${layer.id}" ${selected}>${label}</option>`);
        });
        triggerSelect.innerHTML = options.join('');
    }

    shared.prototypePanel.querySelectorAll('[data-proto-state]').forEach(input => {
        const stateName = input.getAttribute('data-proto-state');
        const prop = input.getAttribute('data-proto-state-prop');
        const state = group.prototypeStates[stateName];
        if (!state) return;
        input.value = state[prop] !== undefined ? state[prop] : '';
    });

    const transitionInput = shared.prototypePanel.querySelector('[data-proto-transition]');
    if (transitionInput) {
        const value = Number(group.prototypeTransition ?? shared.DEFAULT_PROTOTYPE_TRANSITION);
        transitionInput.value = String(value);
        const valueLabel = transitionInput.parentElement?.querySelector('.prop-range-value');
        if (valueLabel) valueLabel.textContent = `${Number(value).toFixed(2)}s`;
    }
}
