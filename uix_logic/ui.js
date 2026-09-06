import { setPage, shared } from './main.js';

import {
    callBusinessApiSync,
    getChildren,
    getLayer,
    getSelectedLayers,
    switchPageState,
} from './state.js';

import { saveHistory } from './history.js';
import { fitTextBox, refreshTextFitAfterFontLoad, render, syncLayerElement } from './render.js';

import {
    addLayer,
    ensureRootScreenId,
    getLayerHtmlId,
    getLayerList,
    recalcGroupBounds,
    renderBreakpointControls,
} from './layers.js';

import { openPageTabContextMenu } from './context-menu.js';
import { downloadProjectFile } from './export.js';
import { escapeAttribute, loadGoogleFontFamily } from './fonts.js';
import { fitTriggerBox } from './drag-drop.js';

export function isHoverPropertyEnabled(layer, property) {
    return layer?.hover?.enabled?.[property] === true;
}

export function toggleHoverProperty(property) {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    const layer = selected[0];
    layer.hover = layer.hover || {};
    layer.hover.enabled = layer.hover.enabled || {};
    layer.hover.enabled[property] = !isHoverPropertyEnabled(layer, property);
    saveHistory();
    render();
    updateStatus(`${property} hover ${layer.hover.enabled[property] ? 'enabled' : 'disabled'}`);
}

export function updateStatus(msg) { document.getElementById('statusInfo').textContent = msg; }
export function updateLayerCount() { document.getElementById('layerCount').textContent = shared.layers.length + ' layers'; }

export // ============================================================
// TOOLS
// ============================================================
// ============================================================
// SIDEBAR TABS (Layers / Properties)
// ============================================================
function setSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.getElementById('layersTabPanel').style.display = tab === 'layers' ? '' : 'none';
    document.getElementById('propertiesTabPanel').style.display = tab === 'properties' ? '' : 'none';
}

export function setTool(tool) {
    const isSameTool = shared.currentTool === tool;
    const nextTool = isSameTool && tool !== 'select' ? 'select' : tool;
    shared.currentTool = nextTool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(el => {
        el.classList.toggle('active', el.dataset.tool === nextTool);
    });
    document.getElementById('canvas').style.cursor = nextTool === 'select' ? 'default' : 'crosshair';
    updateStatus('Tool: ' + nextTool);
}

export function setLivePreviewMode(enabled) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.classList.toggle('live-preview', Boolean(enabled));
    updateStatus(enabled ? 'Live preview enabled' : 'Editing mode enabled');
}

export function toggleOverflow() {
    shared.showOverflow = !shared.showOverflow;
    render();
    updateStatus(shared.showOverflow ? 'Overflow visible' : 'Overflow hidden');
}

export function clampZoom(value) {
    return Math.min(shared.MAX_ZOOM, Math.max(shared.MIN_ZOOM, value));
}

export function getCanvasPoint(e) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / shared.zoomLevel,
        y: (e.clientY - rect.top) / shared.zoomLevel
    };
}

export function zoomCanvas(delta, anchor = null) {
    const wrapper = document.querySelector('.canvas-wrapper');
    const beforeZoom = shared.zoomLevel;
    const nextZoom = clampZoom(shared.zoomLevel + delta);
    if (Math.abs(nextZoom - beforeZoom) < 1e-6) return;

    if (wrapper && anchor) {
        const rect = wrapper.getBoundingClientRect();
        const localX = anchor.x - rect.left;
        const localY = anchor.y - rect.top;
        const worldX = (wrapper.scrollLeft + localX) / beforeZoom;
        const worldY = (wrapper.scrollTop + localY) / beforeZoom;
        shared.zoomLevel = nextZoom;
        wrapper.scrollLeft = worldX * nextZoom - localX;
        wrapper.scrollTop = worldY * nextZoom - localY;
    } else {
        shared.zoomLevel = nextZoom;
    }

    render();
    updateStatus(`Zoom: ${shared.zoomLevel.toFixed(2)}x`);
}

export function centerCanvasViewport(force = false) {
    const wrapper = document.querySelector('.canvas-wrapper');
    const canvas = document.getElementById('canvas');
    if (!wrapper || !canvas) return;
    if (!force && shared.hasCenteredCanvasViewport) return;

    // Center the actual canvas box, including its layout margins, in
    // the scroll viewport. This remains correct when the first render
    // changes the canvas size or when the canvas is zoomed.
    const scaledWidth = canvas.offsetWidth * shared.zoomLevel;
    const scaledHeight = canvas.offsetHeight * shared.zoomLevel;
    const targetLeft = canvas.offsetLeft + scaledWidth / 2 - wrapper.clientWidth / 2;
    const targetTop = canvas.offsetTop + scaledHeight / 2 - wrapper.clientHeight / 2;
    wrapper.scrollLeft = Math.max(0, Math.round(targetLeft));
    wrapper.scrollTop = Math.max(0, Math.round(targetTop));
    shared.hasCenteredCanvasViewport = true;
}

export function clampCanvasHeight(value) {
    return Math.max(shared.MIN_CANVAS_HEIGHT, Math.min(shared.MAX_CANVAS_HEIGHT, value));
}

export function startCanvasResize(e) {
    if (e.button !== undefined && e.button !== 0) return;
    shared.canvasResizeData = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: shared.canvasHeight
    };
    shared.isCanvasResizing = true;
    document.getElementById('canvas').classList.add('resizing-canvas');
    e.preventDefault();
    e.stopPropagation();
}

export function syncExperimentControls() {
    const canvasHeightInput = document.getElementById('canvasHeightInput');
    if (!canvasHeightInput) return;
    if (document.activeElement !== canvasHeightInput) {
        canvasHeightInput.value = Math.round(shared.canvasHeight);
    }
    renderBreakpointControls();
}

export function positionExperimentPanel() {
    const panel = document.getElementById('experimentPanel');
    const toggle = document.getElementById('experimentToggle');
    if (!panel || !toggle || !panel.classList.contains('active')) return;

    const rect = toggle.getBoundingClientRect();
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
}

export function positionPrototypePreviewPanel() {
    const panel = document.getElementById('prototypePreviewPanel');
    const toggle = document.getElementById('prototypeToggle');
    if (!panel || !toggle || !panel.classList.contains('active')) return;

    const rect = toggle.getBoundingClientRect();
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
}

export function closeExperimentPanel() {
    const panel = document.getElementById('experimentPanel');
    const toggle = document.getElementById('experimentToggle');
    if (panel) panel.classList.remove('active');
    if (toggle) toggle.classList.remove('active');
}

export function toggleExperimentPanel(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const panel = document.getElementById('experimentPanel');
    const toggle = document.getElementById('experimentToggle');
    if (!panel || !toggle) return;

    const shouldOpen = !panel.classList.contains('active');
    closeExperimentPanel();
    if (shouldOpen) {
        panel.classList.add('active');
        toggle.classList.add('active');
        syncExperimentControls();
        positionExperimentPanel();
    }
}

export function applyCanvasHeight(value, statusPrefix) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        syncExperimentControls();
        return;
    }
    shared.canvasHeight = clampCanvasHeight(Math.round(numeric));
    shared.canvasHeights[shared.activeCanvasIndex] = shared.canvasHeight;
    render();
    updateStatus(`${statusPrefix || 'Canvas height'}: ${Math.round(shared.canvasHeight)}px`);
}

export function nudgeCanvasHeight(delta) {
    applyCanvasHeight(shared.canvasHeight + delta, 'Canvas height');
}

export function startScreenDrag(e, range) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!range) return;

    const rootLayers = shared.layers
        .filter(layer => layer.parentId === null)
        .filter(layer => ensureRootScreenId(layer) === range.index)
        .map(layer => ({ id: layer.id, startX: layer.x }));

    shared.screenDragData = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        rootSnapshots: rootLayers
    };
    shared.isScreenDragging = true;
    updateStatus(`Dragging screen ${range.index + 1}`);
    e.preventDefault();
    e.stopPropagation();
}

export function toggleFileMenu() {
    const menu = document.getElementById('fileMenu');
    const button = document.getElementById('fileMenuButton');
    if (!menu || !button) return;

    const isOpen = menu.classList.contains('hidden') === false;
    if (isOpen) {
        hideFileMenu();
        return;
    }

    menu.classList.remove('hidden');
    button.classList.add('active');
    button.setAttribute('aria-expanded', 'true');
    button.dataset.open = 'true';
    menu.dataset.open = 'true';
}

export function hideFileMenu() {
    const menu = document.getElementById('fileMenu');
    const button = document.getElementById('fileMenuButton');
    if (!menu || !button) return;
    menu.classList.add('hidden');
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
    delete button.dataset.open;
    delete menu.dataset.open;
}

export function triggerProjectImport() {
    hideFileMenu();
    const input = document.getElementById('projectLoaderInput');
    if (input) input.click();
}

export function getPageTabs() {
    return Array.from(document.querySelectorAll('.tab-item'));
}

export function wirePageTab(tab) {
    if (!tab || tab.dataset.pageTabWired === 'true') return;
    tab.dataset.pageTabWired = 'true';

    const closeBtn = tab.querySelector('.tab-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePageTab(tab.dataset.page);
        });
    }

    tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPageTabContextMenu(tab.dataset.page, e.clientX, e.clientY);
    });
}

export function syncPageTabClosers() {
    const tabs = getPageTabs();
    const canClose = tabs.length > 1;
    tabs.forEach(tab => {
        const closeBtn = tab.querySelector('.tab-close-btn');
        if (!closeBtn) return;
        closeBtn.hidden = !canClose;
    });
}

export function showRenameDialog({ title, label, currentValue, confirmText, onConfirm }) {
    const modal = document.getElementById('renameDialogModal');
    const titleEl = document.getElementById('renameDialogTitle');
    const labelEl = document.getElementById('renameDialogLabel');
    const input = document.getElementById('renameDialogInput');
    const confirmBtn = document.getElementById('renameDialogConfirm');
    const cancelBtn = document.getElementById('renameDialogCancel');
    if (!modal || !titleEl || !labelEl || !input || !confirmBtn || !cancelBtn) return;

    titleEl.innerHTML = `<span class="material-symbols-outlined">edit</span>${title}`;
    labelEl.textContent = label;
    input.value = currentValue || '';
    const apply = () => {
        const nextValue = input.value.trim();
        if (!nextValue) {
            input.focus();
            return;
        }
        modal.classList.remove('active');
        if (typeof onConfirm === 'function') onConfirm(nextValue);
    };

    confirmBtn.textContent = confirmText || 'Rename';
    confirmBtn.innerHTML = `<span class="material-symbols-outlined">check</span>${confirmText || 'Rename'}`;
    confirmBtn.onclick = apply;
    cancelBtn.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            apply();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            modal.classList.remove('active');
        }
    };

    modal.classList.add('active');
    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

export function renamePageTab(pageName) {
    const tabs = getPageTabs();
    const tab = tabs.find(candidate => candidate.dataset.page === pageName);
    if (!tab) return;
    const labelEl = tab.querySelector('.tab-label');
    const currentName = (labelEl ? labelEl.textContent : tab.dataset.page || '').replace(/\.html$/i, '');

    showRenameDialog({
        title: 'Rename page',
        label: 'Navigation name',
        currentValue: currentName || 'Page',
        confirmText: 'Rename',
        onConfirm: (nextName) => {
            const trimmed = nextName.trim();
            if (!trimmed) return;
            const normalized = trimmed.toLowerCase().endsWith('.html') ? trimmed : `${trimmed}.html`;
            if (labelEl) labelEl.textContent = normalized;
            tab.setAttribute('aria-label', normalized);
            tab.dataset.label = normalized;
            updateStatus(`Renamed page to ${normalized}`);
        }
    });
}

export function closePageTab(pageName) {
    const tabs = getPageTabs();
    if (tabs.length <= 1) return;
    const targetTab = tabs.find(tab => tab.dataset.page === pageName);
    if (!targetTab) return;

    // Delete page state when closing
    delete shared.pages[pageName];

    const currentActive = document.querySelector('.tab-item.active');
    const nextTab = tabs.filter(tab => tab !== targetTab)[0];
    targetTab.remove();
    syncPageTabClosers();

    const remaining = getPageTabs();
    const shouldFocus = !currentActive || currentActive === targetTab || currentActive.dataset.page === pageName;
    if (shouldFocus && remaining.length) {
        setPage((nextTab && nextTab.dataset.page) || remaining[0].dataset.page);
    }
    updateStatus('Page removed');
}

export function createPageTab(pageName, pageLabel) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab-item';
    tab.dataset.page = pageName;
    tab.dataset.generated = 'true';
    tab.setAttribute('aria-label', pageLabel);
    tab.innerHTML = `
        <span class="tab-label">${pageLabel}</span>
        <span class="tab-close-btn" role="button" tabindex="0" aria-label="Close ${pageLabel}" data-close-tab="${pageName}">×</span>
    `;
    tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) return;
        setPage(pageName);
    });
    wirePageTab(tab);
    return tab;
}

export function newPage() {
    hideFileMenu();
    const topTabs = document.getElementById('topTabs');
    if (!topTabs) return;

    const generatedTabs = topTabs.querySelectorAll('.tab-item[data-generated="true"]').length + 1;
    const pageName = `page-${Date.now()}-${generatedTabs}`;
    const pageLabel = `Page ${generatedTabs + 2}.html`;
    
    // Create completely independent page state with blank canvas
    shared.pages[pageName] = {
        layers: [],                           // Empty layers
        nextId: 1,                            // Reset ID counter
        selectedIds: [],                      // No selection
        canvasBreakpoints: [900, 768, 480],   // Default breakpoints
        canvasHeights: [600, 600, 600],       // Default heights
        activeCanvasIndex: 0,                 // First breakpoint
        zoomLevel: 1,                         // No zoom
        history: [],                          // Empty history
        historyIndex: -1                      // No history
    };
    
    const tab = createPageTab(pageName, pageLabel);
    topTabs.appendChild(tab);
    syncPageTabClosers();
    setPage(pageName);
    updateStatus(`Created ${pageLabel} (blank)`);
}

export function newProject(quiet = false) {
    hideFileMenu();
    
    // Reset all pages with blank independent state
    shared.pages = {
        home: {
            layers: [],
            nextId: 1,
            selectedIds: [],
            canvasBreakpoints: [900, 768, 480],
            canvasHeights: [600, 600, 600],
            activeCanvasIndex: 0,
            zoomLevel: 1,
            history: [],
            historyIndex: -1
        },
        about: {
            layers: [],
            nextId: 1,
            selectedIds: [],
            canvasBreakpoints: [900, 768, 480],
            canvasHeights: [600, 600, 600],
            activeCanvasIndex: 0,
            zoomLevel: 1,
            history: [],
            historyIndex: -1
        },
        contact: {
            layers: [],
            nextId: 1,
            selectedIds: [],
            canvasBreakpoints: [900, 768, 480],
            canvasHeights: [600, 600, 600],
            activeCanvasIndex: 0,
            zoomLevel: 1,
            history: [],
            historyIndex: -1
        }
    };
    
    // Reset current page and global state
    shared.currentPage = 'home';
    switchPageState('home');
    shared.currentTool = 'select';
    shared.showOverflow = false;
    shared.prototypePreviewMode = false;
    shared.currentProjectFileName = 'project.methal';
    shared.projectDirectoryHandle = null;
    shared.savedProjectPayload = null;

    const topTabs = document.getElementById('topTabs');
    if (topTabs) {
        // Remove all generated pages (keep only fixed pages)
        topTabs.querySelectorAll('.tab-item[data-generated="true"]').forEach(tab => tab.remove());
        const fixedTabs = topTabs.querySelectorAll('.tab-item[data-fixed="true"]');
        fixedTabs.forEach(tab => {
            const labelEl = tab.querySelector('.tab-label');
            if (labelEl) labelEl.textContent = tab.dataset.page === 'home' ? 'Home.html' : tab.dataset.page === 'about' ? 'About.html' : 'Contact.html';
            tab.setAttribute('aria-label', labelEl ? labelEl.textContent : tab.dataset.page);
            tab.classList.toggle('active', tab.dataset.page === 'home');
        });
        syncPageTabClosers();
        setPage('home');
    }

    render();
    if (!quiet) {
        updateStatus('New project started - all pages blank');
    }
}

export async function saveProjectFile(saveAs = false) {
    hideFileMenu();
    let filename = shared.currentProjectFileName || 'project.methal';
    if (saveAs) {
        const nextName = window.prompt('Save Methalo project as', filename);
        if (!nextName) return;
        filename = nextName.trim() || filename;
        if (!filename.toLowerCase().endsWith('.methal')) {
            filename += '.methal';
        }
    }
    shared.currentProjectFileName = filename;
    await downloadProjectFile(filename);
}

export function positionItemsPanel() {
    const panel = document.getElementById('itemsPanel');
    const experimentToggle = document.getElementById('experimentToggle');
    const button = document.querySelector('.tool-btn[data-tool="component"]');
    if (!panel || !panel.classList.contains('active')) return;
    const anchor = experimentToggle || button;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 24);
    const left = experimentToggle
        ? rect.left - panelWidth - 10
        : rect.right + 10;
    panel.style.left = `${Math.max(12, Math.round(left))}px`;
    const panelTop = rect.bottom + 8;
    panel.style.top = `${Math.max(12, Math.round(Math.min(panelTop, window.innerHeight - panel.offsetHeight - 12)))}px`;
}

export function renderItemsPanel(layer) {
    const content = document.getElementById('itemsPanelContent');
    if (!content) return;
    const isNew = !layer;
    const count = Math.max(1, Math.min(100, Number(layer?.itemCount) || 3));
    const names = Array.isArray(layer?.itemNames) ? layer.itemNames : [];
    const anchors = Array.isArray(layer?.itemAnchors) ? layer.itemAnchors : [];
    const dividers = Array.isArray(layer?.itemDividers) ? layer.itemDividers : [];
    let html = `<div class="items-panel-header"><div class="items-panel-title"><span class="material-symbols-outlined">view_list</span>${isNew ? 'New Items' : 'Edit Items'}</div><button type="button" class="panel-close-btn" aria-label="Close Items panel" onclick="closeItemsSetup()"><span class="material-symbols-outlined">close</span></button></div>`;
    html += `<div class="items-settings-grid"><div class="prop-group"><label>Items (n)</label><input id="itemsPanelCount" type="number" min="1" max="100" step="1" value="${count}" ${isNew ? '' : `onchange="updateProp('itemCount', Math.max(1, Math.min(100, Math.round(parseFloat(this.value) || 1))))"`}></div><div class="prop-group"><label>Layout</label><select id="itemsPanelDirection" ${isNew ? '' : `onchange="updateProp('itemDirection', this.value)"`}><option value="row"${layer?.itemDirection !== 'column' ? ' selected' : ''}>Row</option><option value="column"${layer?.itemDirection === 'column' ? ' selected' : ''}>Column</option></select></div></div>`;
    html += `<div class="prop-group"><label>Divider color</label><input id="itemsPanelDivider" type="color" value="${layer?.itemDivider || '#cccccc'}" ${isNew ? '' : `onchange="updateProp('itemDivider', this.value)"`}></div>`;
    html += `<label class="prop-checkbox items-anchor-toggle"><input id="itemsPanelAnchors" type="checkbox" ${layer?.useItemAnchors ? 'checked' : ''} ${isNew ? '' : `onchange="updateProp('useItemAnchors', this.checked)"`}><span><strong>Use anchor tags</strong><small>Make each item linkable</small></span></label>`;
    if (!isNew) {
        html += '<div class="items-panel-detail-title">Item details</div>';
        for (let index = 0; index < count; index += 1) {
            const itemNumber = index + 1;
            const dividerEnabled = dividers[index] !== false;
            html += `<div class="items-detail-row"><strong>Item ${itemNumber}</strong><input type="text" value="${escapeAttribute(names[index] || `Item${itemNumber}`)}" placeholder="Item name" onchange="updateItemDetail(${index}, 'name', this.value)"><button type="button" class="items-divider-toggle${dividerEnabled ? ' active' : ''}" aria-pressed="${dividerEnabled}" onclick="event.stopPropagation(); updateItemDetail(${index}, 'divider', this.getAttribute('aria-pressed') !== 'true')"><span class="material-symbols-outlined">${dividerEnabled ? 'toggle_on' : 'toggle_off'}</span><span>Divider</span></button>${layer.useItemAnchors ? `<input type="url" value="${escapeAttribute(anchors[index] || '')}" placeholder="https://example.com" onchange="updateItemDetail(${index}, 'anchor', this.value)">` : ''}</div>`;
        }
    } else {
        html += '<p class="items-panel-hint">Confirm the setup, then edit each item name and link.</p><button type="button" class="items-confirm-btn" onclick="confirmItemsSetup()"><span class="material-symbols-outlined">check</span>Add Items</button>';
    }
    content.innerHTML = html;
    protectPropertyInputs(content);
    requestAnimationFrame(positionItemsPanel);
}

export function openItemsSetup() {
    const panel = document.getElementById('itemsPanel');
    if (!panel) return;
    if (panel.dataset.clickGuard !== 'true') {
        panel.addEventListener('click', (event) => event.stopPropagation());
        panel.dataset.clickGuard = 'true';
    }
    setTool('select');
    const selected = getSelectedLayers();
    const selectedItems = selected.length === 1 && selected[0].type === 'component' ? selected[0] : null;
    shared.itemsPanelMode = selectedItems ? 'edit' : 'new';
    renderItemsPanel(selectedItems);
    panel.classList.add('active');
    requestAnimationFrame(positionItemsPanel);
}

export function closeItemsSetup() {
    document.getElementById('itemsPanel')?.classList.remove('active');
}

export function confirmItemsSetup() {
    const count = Math.max(1, Math.min(100, Math.round(parseFloat(document.getElementById('itemsPanelCount').value) || 3)));
    const direction = document.getElementById('itemsPanelDirection').value === 'column' ? 'column' : 'row';
    const divider = document.getElementById('itemsPanelDivider').value;
    const width = 360;
    const height = direction === 'column' ? Math.max(48, count * (16 + padding * 2)) : 48;
    addLayer('component', {
        x: Math.max(20, (shared.canvasWidth - width) / 2),
        y: Math.max(20, (shared.canvasHeight - height) / 2),
        width,
        height,
        itemCount: count,
        itemDirection: direction,
        itemPadding: 8,
        itemDivider: divider
    });
    closeItemsSetup();
    setTool('select');
}

export function openFlexPanel(groupId, x, y) {
    const group = getLayer(groupId);
    if (!group) return;
    shared.flexPanelGroupId = groupId;

    // Binding is enabled the moment the panel opens (with sensible
    // defaults the user can immediately see/adjust), rather than
    // requiring a separate "confirm" step. Reopening the panel on an
    // already-bound group is a no-op here (no redundant history entry).
    let justBound = false;
    if (!group.flexBind) {
        group.flexBind = { enabled: true, direction: 'row', justify: 'center', align: 'center' };
        justBound = true;
    } else if (!group.flexBind.enabled) {
        group.flexBind.enabled = true;
        justBound = true;
    }
    group.flexBind = callBusinessApiSync('validate-flex', { flexBind: group.flexBind }).flexBind;
    if (justBound) { saveHistory(); render(); }
    updateFlexPanelUI();

    // Open to the left of the trigger point, clamped to the viewport.
    const panelW = 320, panelH = 260;
    const preferredLeft = x - panelW - 10;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - panelW - 8));
    const top = Math.min(y, window.innerHeight - panelH - 8);
    shared.flexPanel.style.left = left + 'px';
    shared.flexPanel.style.top = Math.max(8, top) + 'px';
    shared.flexPanel.classList.add('active');
}

export function closeFlexPanel() {
    shared.flexPanel.classList.remove('active');
    shared.flexPanelGroupId = null;
}

export function updateFlexPanelUI() {
    const group = getLayer(shared.flexPanelGroupId);
    if (!group || !group.flexBind) return;
    shared.flexPanel.querySelectorAll('[data-key]').forEach(btn => {
        const key = btn.getAttribute('data-key');
        const val = btn.getAttribute('data-value');
        btn.classList.toggle('active', group.flexBind[key] === val);
    });
}

export function openGroupFeaturesPanel(groupId, x, y) {
    const group = getLayer(groupId);
    if (!group || group.type !== 'group') return;
    shared.groupFeaturesPanelGroupId = groupId;
    updateGroupFeaturesPanelUI();

    const panelW = 300, panelH = 400;
    const left = Math.min(x, window.innerWidth - panelW - 8);
    const top = Math.min(y, window.innerHeight - panelH - 8);
    shared.groupFeaturesPanel.style.left = Math.max(8, left) + 'px';
    shared.groupFeaturesPanel.style.top = Math.max(8, top) + 'px';
    shared.groupFeaturesPanel.classList.add('active');
}

export function closeGroupFeaturesPanel() {
    shared.groupFeaturesPanel.classList.remove('active');
    shared.groupFeaturesPanelGroupId = null;
}

export function updateGroupFeaturesPanelUI() {
    const group = getLayer(shared.groupFeaturesPanelGroupId);
    if (!group) return;
    const defaults = { borderStyle: 'none', borderThickness: 0, borderColor: '#000000', backgroundEnabled: false, backgroundColor: 'transparent', linkType: 'none', linkUrl: '', linkTargetId: '' };
    group.borderStyle = group.borderStyle !== undefined ? group.borderStyle : defaults.borderStyle;
    group.borderThickness = group.borderThickness !== undefined ? group.borderThickness : defaults.borderThickness;
    group.borderColor = group.borderColor !== undefined ? group.borderColor : defaults.borderColor;
    group.backgroundEnabled = group.backgroundEnabled !== undefined ? group.backgroundEnabled : defaults.backgroundEnabled;
    group.backgroundColor = group.backgroundColor !== undefined ? group.backgroundColor : defaults.backgroundColor;
    group.linkType = group.linkType !== undefined ? group.linkType : defaults.linkType;
    group.linkUrl = group.linkUrl !== undefined ? group.linkUrl : defaults.linkUrl;
    group.linkTargetId = group.linkTargetId !== undefined ? group.linkTargetId : defaults.linkTargetId;

    shared.groupFeaturesPanel.querySelectorAll('[data-key]').forEach(btn => {
        const key = btn.getAttribute('data-key');
        const value = btn.getAttribute('data-value');
        if (key === 'backgroundEnabled') {
            btn.classList.toggle('active', String(group.backgroundEnabled) === value);
        } else {
            btn.classList.toggle('active', group[key] === value);
        }
    });

    shared.groupFeaturesPanel.querySelectorAll('[data-prop]').forEach(input => {
        const prop = input.getAttribute('data-prop');
        if (prop === 'borderThickness') input.value = group.borderThickness;
        else if (prop === 'borderColor') input.value = group.borderColor;
        else if (prop === 'backgroundColor') input.value = group.backgroundColor;
        else if (prop === 'linkUrl') input.value = group.linkUrl || '';
        else if (prop === 'linkTargetId') input.value = group.linkTargetId || '';
    });

    const select = shared.groupFeaturesPanel.querySelector('select[data-prop="linkTargetId"]');
    populateGroupTargetOptions(select, group.linkTargetId);
    setGroupLinkInputsVisibility(group.linkType);
}

export function setGroupLinkInputsVisibility(linkType) {
    shared.groupFeaturesPanel.querySelectorAll('.link-input').forEach(el => el.classList.remove('active'));
    if (linkType === 'website') shared.groupFeaturesPanel.querySelector('.link-website')?.classList.add('active');
    if (linkType === 'page') shared.groupFeaturesPanel.querySelector('.link-page')?.classList.add('active');
    if (linkType === 'scrollto') shared.groupFeaturesPanel.querySelector('.link-scrollto')?.classList.add('active');
}

export function populateGroupTargetOptions(selectEl, selectedValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const groups = getLayerList().filter(l => l.type === 'group');
    if (groups.length === 0) {
        const fallback = document.createElement('option');
        fallback.value = '';
        fallback.textContent = 'No groups available';
        fallback.disabled = true;
        fallback.selected = true;
        selectEl.appendChild(fallback);
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a target section';
    placeholder.disabled = true;
    placeholder.selected = !selectedValue;
    selectEl.appendChild(placeholder);

    groups.forEach(group => {
        const idValue = getLayerHtmlId(group) || `group-${group.id}`;
        const label = group.name || idValue;
        const option = document.createElement('option');
        option.value = idValue;
        option.textContent = label;
        if (idValue === selectedValue) option.selected = true;
        selectEl.appendChild(option);
    });
}

export function normalizeWebsiteUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    return `https://www.${trimmed}`;
}

export function followLayerLink(layer) {
    if (!layer.linkType || layer.linkType === 'none') return;
    if (layer.linkType === 'website' || layer.linkType === 'page') {
        if (!layer.linkUrl) return;
        let targetUrl = layer.linkUrl;
        if (layer.linkType === 'website') {
            targetUrl = normalizeWebsiteUrl(targetUrl);
            layer.linkUrl = targetUrl;
        }
        if (layer.linkType === 'website') {
            window.open(targetUrl, '_blank');
        } else {
            window.location.href = targetUrl;
        }
        saveHistory();
        render();
        updateStatus('Following link');
        return;
    }
    if (layer.linkType === 'scrollto') {
        if (!layer.linkTargetId) return;
        const target = document.getElementById(layer.linkTargetId) || document.querySelector(`.shape-layer[data-id="${layer.linkTargetId}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            updateStatus('Scrolled to section');
        }
    }
}

export function unbindFlex() {
    const group = getLayer(shared.flexPanelGroupId);
    if (!group || !group.flexBind || !group.flexBind.enabled) { closeFlexPanel(); return; }

    // Freeze each child's CURRENT on-screen (flex-computed) position
    // back into its stored x/y before turning flex off, so nothing
    // visually jumps the moment the bind is removed.
    const groupEl = document.querySelector(`.shape-layer[data-id="${group.id}"]`);
    if (groupEl) {
        getChildren(group.id).forEach(child => {
            const childEl = groupEl.querySelector(`:scope > .shape-layer[data-id="${child.id}"]`);
            if (childEl) {
                child.x = childEl.offsetLeft;
                child.y = childEl.offsetTop;
            }
        });
    }

    group.flexBind.enabled = false;
    saveHistory();
    render();
    closeFlexPanel();
    updateStatus('Layout unbound');
}

export // ============================================================
// PROPERTIES
// ============================================================
function protectPropertyInputs(panel) {
    if (!panel) return;
    panel.querySelectorAll('input, textarea, select').forEach((el) => {
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('focusin', (e) => e.stopPropagation());
    });
}

export function renderProperties() {
    const panel = document.getElementById('propertiesPanel');
    const selected = getSelectedLayers();

    const renderColorControl = (label, prop, value, fallback) => {
        const isTransparent = value === 'transparent';
        const swatchValue = isTransparent ? fallback : (value || fallback);
        return `<div class="prop-group"><label>${label}</label><div class="prop-color-control"><input type="color" value="${swatchValue}" onchange="updateProp('${prop}', this.value)"><label class="prop-transparent-option"><input type="checkbox"${isTransparent ? ' checked' : ''} onchange="updateProp('${prop}', this.checked ? 'transparent' : '${fallback}')">Transparent</label></div></div>`;
    };
    const renderHoverColorControl = (label, prop, value, fallback) => {
        const isTransparent = value === 'transparent';
        const swatchValue = isTransparent ? fallback : (value || fallback);
        return `<div class="hover-property-row">${renderHoverToggle(label, prop)}<div class="prop-group"><div class="prop-color-control"><input type="color" value="${swatchValue}" onchange="updateStateProp('hover','${prop}',this.value)"><label class="prop-transparent-option"><input type="checkbox"${isTransparent ? ' checked' : ''} onchange="updateStateProp('hover','${prop}',this.checked ? 'transparent' : '${fallback}')">Transparent</label></div></div></div>`;
    };
    const renderHoverToggle = (label, property) => `<button type="button" class="hover-property-toggle${isHoverPropertyEnabled(layer, property) ? ' active' : ''}" aria-pressed="${isHoverPropertyEnabled(layer, property)}" onclick="toggleHoverProperty('${property}')"><span>${label}</span><span class="material-symbols-outlined">${isHoverPropertyEnabled(layer, property) ? 'toggle_on' : 'toggle_off'}</span></button>`;

    if (selected.length === 0) {
        panel.innerHTML = `<div class="no-selection">No layers selected</div>`;
        return;
    }

    if (selected.length > 1) {
        panel.innerHTML = `<div class="no-selection">${selected.length} layers selected</div>`;
        return;
    }

    const layer = selected[0];
    layer.hover = layer.hover || { opacity: 1, rotation: 0, scale: 1, backgroundColor: null, color: null, borderColor: null, duration: 0.45, easing: 'ease' };
    let html = '';
    html += `<div class="prop-state-tabs"><button type="button" class="${shared.propertyStateMode === 'current' ? 'active' : ''}" onclick="setPropertyStateMode('current')">Current</button><button type="button" class="${shared.propertyStateMode === 'hover' ? 'active' : ''}" onclick="setPropertyStateMode('hover')">Hover</button></div>`;
    if (shared.propertyStateMode === 'hover') {
        html += `<div class="prop-section"><div class="prop-section-title">Hover state</div>`;
        html += `<div class="hover-property-row">${renderHoverToggle('Opacity', 'opacity')}<div class="prop-group"><input type="range" min="0" max="1" step="0.01" value="${layer.hover.opacity ?? 1}" oninput="updateStateProp('hover','opacity',parseFloat(this.value),false,this)"><span class="prop-range-value">${Math.round((layer.hover.opacity ?? 1) * 100)}%</span></div></div>`;
        html += `<div class="hover-property-row">${renderHoverToggle('Transform scale', 'scale')}<div class="prop-group"><input type="range" min="0" max="2" step="0.01" value="${layer.hover.scale ?? 1}" oninput="updateStateProp('hover','scale',parseFloat(this.value),false,this)"><span class="prop-range-value">${Math.round((layer.hover.scale ?? 1) * 100)}%</span></div></div>`;
        html += `<div class="hover-property-row">${renderHoverToggle('Rotation', 'rotation')}<div class="prop-group"><input type="range" min="-360" max="360" step="1" value="${layer.hover.rotation || 0}" oninput="updateStateProp('hover','rotation',snapRotationValue(parseFloat(this.value), this),false,this)" onchange="updateStateProp('hover','rotation',snapRotationValue(parseFloat(this.value), this),true,this)"><span class="prop-range-value">${Math.round(layer.hover.rotation || 0)}°</span></div></div>`;
        if (layer.type === 'rect' || layer.type === 'circle' || layer.type === 'trigger') html += renderHoverColorControl('Hover fill', 'backgroundColor', layer.hover.backgroundColor, '#737373');
        if (layer.type === 'text') html += renderHoverColorControl('Hover text', 'color', layer.hover.color, '#1e293b');
        html += `<div class="hover-property-row">${renderHoverToggle('Timing function', 'easing')}<div class="prop-group"><select onchange="updateStateProp('hover','easing',this.value)"><option value="ease"${layer.hover.easing === 'ease' ? ' selected' : ''}>Ease</option><option value="ease-in"${layer.hover.easing === 'ease-in' ? ' selected' : ''}>Ease in</option><option value="ease-out"${layer.hover.easing === 'ease-out' ? ' selected' : ''}>Ease out</option><option value="linear"${layer.hover.easing === 'linear' ? ' selected' : ''}>Linear</option></select></div></div>`;
        html += `<div class="hover-property-row">${renderHoverToggle('Transition time', 'duration')}<div class="prop-group"><input type="range" min="0" max="2" step="0.05" value="${layer.hover.duration ?? 0.45}" oninput="updateStateProp('hover','duration',parseFloat(this.value),false,this)" onchange="updateStateProp('hover','duration',parseFloat(this.value),true,this)"><span class="prop-range-value">${Number(layer.hover.duration ?? 0.45).toFixed(2)}s</span></div></div>`;
        html += `</div>`;
    } else {
        html += `<div class="prop-group"><label>Opacity</label><input type="range" min="0" max="1" step="0.01" value="${layer.opacity ?? 1}" oninput="updateCurrentOpacity(parseFloat(this.value), this)"><span class="prop-range-value">${Math.round((layer.opacity ?? 1) * 100)}%</span></div>`;
    }

    if (shared.propertyStateMode === 'current') {
    // ---- Transform section: Position, Size (+ proportional-scale lock
    // for text boxes), and Rotation, all grouped together. ----
    html += `<div class="prop-section">`;
    html += `<div class="prop-section-title">Transform</div>`;
    html += `<div class="prop-group"><label>Position</label><div class="row"><div class="prop-input-with-prefix"><span class="prop-input-prefix">X</span><input type="number" value="${Math.round(layer.x)}" onchange="updateProp('x', parseFloat(this.value))"></div><div class="prop-input-with-prefix"><span class="prop-input-prefix">Y</span><input type="number" value="${Math.round(layer.y)}" onchange="updateProp('y', parseFloat(this.value))"></div></div></div>`;
    html += `<div class="prop-group">
        <label>Size</label>
        <div class="row">
            <div class="prop-input-with-prefix"><span class="prop-input-prefix size-prefix">W</span><input type="number" value="${Math.round(layer.width)}" onchange="updateProp('width', parseFloat(this.value))"></div>
            <div class="prop-input-with-prefix"><span class="prop-input-prefix size-prefix">H</span><input type="number" value="${Math.round(layer.height)}" onchange="updateProp('height', parseFloat(this.value))"></div>
            <button type="button" class="lock-toggle-btn${layer.lockAspect ? ' active' : ''}" title="${layer.lockAspect ? (layer.type === 'text' ? 'Locked: resize scales the font and hugs the text (click to unlock)' : 'Locked: resize grows/shrinks proportionally (click to unlock)') : (layer.type === 'text' ? 'Unlocked: resize is freeform, box is sized by hand and text wraps inside it (click to lock)' : 'Unlocked: resize is freeform, sides adjust independently (click to lock)')}" onclick="toggleLockAspect()"><span class="material-symbols-outlined">${layer.lockAspect ? 'lock' : 'lock_open'}</span></button>
        </div>
    </div>`;
    html += `<div class="prop-group"><label>Rotation (&deg;)</label><input type="range" min="-360" max="360" step="1" value="${Math.round(layer.rotation || 0)}" oninput="updateCurrentRotation(snapRotationValue(parseFloat(this.value), this), this)" onchange="updateCurrentRotation(snapRotationValue(parseFloat(this.value), this), this, true)"><span class="prop-range-value">${Math.round(layer.rotation || 0)}°</span></div>`;
    html += `</div>`;

    if (layer.type === 'group') {
        const groupType = ['normal', 'header', 'footer', 'section', 'article', 'nav'].includes(layer.groupType)
            ? layer.groupType
            : 'normal';
        html += `<div class="prop-group"><label>Group Type</label><select onchange="updateProp('groupType', this.value)">
            <option value="normal"${groupType === 'normal' ? ' selected' : ''}>Normal</option>
            <option value="header"${groupType === 'header' ? ' selected' : ''}>Header</option>
            <option value="footer"${groupType === 'footer' ? ' selected' : ''}>Footer</option>
            <option value="section"${groupType === 'section' ? ' selected' : ''}>Section</option>
            <option value="article"${groupType === 'article' ? ' selected' : ''}>Article</option>
            <option value="nav"${groupType === 'nav' ? ' selected' : ''}>Nav</option>
        </select></div>`;
    }

    if (layer.type !== 'group') {
        if (layer.type === 'trigger') {
            const preIcon = layer.preIcon !== undefined ? layer.preIcon : (layer.icon !== undefined ? layer.icon : 'ads_click');
            const postIcon = layer.postIcon !== undefined ? layer.postIcon : '';
            html += `<div class="prop-group"><label>Pre-state icon</label><button type="button" class="panel-btn" onclick="pickTriggerLayerIcon('pre')"><span class="material-symbols-outlined">${preIcon || 'block'}</span>${preIcon || 'None'}</button></div>`;
            html += `<div class="prop-group"><label>Post-state icon (optional)</label><button type="button" class="panel-btn" onclick="pickTriggerLayerIcon('post')"><span class="material-symbols-outlined">${postIcon || (preIcon || 'block')}</span>${postIcon || (preIcon ? 'Uses pre-state icon' : 'None')}</button></div>`;
            html += `<div class="prop-group"><label>Icon Size</label><input type="number" min="8" max="200" value="${layer.fontSize || 20}" onchange="updateProp('fontSize', parseFloat(this.value))"></div>`;
            html += renderColorControl('Fill Color', 'backgroundColor', layer.backgroundColor, '#000000');
            html += renderColorControl('Icon Color', 'iconColor', layer.iconColor, '#0f172a');
            html += renderColorControl('Border Color', 'borderColor', layer.borderColor, '#64748b');
            html += `<div class="prop-group"><label>Border Style</label><select onchange="updateProp('borderStyle', this.value)"><option value="none"${layer.borderStyle === 'none' ? ' selected' : ''}>None</option><option value="solid"${layer.borderStyle === 'solid' ? ' selected' : ''}>Solid</option><option value="dashed"${layer.borderStyle === 'dashed' ? ' selected' : ''}>Dashed</option><option value="double"${layer.borderStyle === 'double' ? ' selected' : ''}>Double</option></select></div>`;
            html += `<div class="prop-group"><label>Border Thickness</label><input type="number" min="0" value="${layer.borderThickness || 0}" onchange="updateProp('borderThickness', parseFloat(this.value))"></div>`;
            html += `<div class="prop-group"><label>Border Radius</label><input type="number" min="0" value="${layer.borderRadius || 0}" onchange="updateProp('borderRadius', parseFloat(this.value))"></div>`;
        }
        if (layer.type === 'rect' || layer.type === 'circle') {
            html += renderColorControl('Fill Color', 'backgroundColor', layer.backgroundColor, '#737373');
            html += `<div class="prop-group"><label>Border Radius</label><input type="number" value="${layer.borderRadius || 0}" onchange="updateProp('borderRadius', parseFloat(this.value))"></div>`;
        }
        if (layer.type === 'text') {
            html += `<div class="prop-group"><label>Content</label><textarea rows="2" onchange="updateProp('content', this.value)">${layer.content || ''}</textarea></div>`;
            html += renderColorControl('Text Color', 'color', layer.color, '#1e293b');
        }
        if (layer.type === 'image') {
            html += `<div class="prop-group">
                <label>Image URL or local path</label>
                <input type="text" value="${escapeAttribute(layer.src || '')}" placeholder="C:\\Users\\you\\Pictures\\image.png or https://..." onchange="updateProp('src', this.value)">
             </div>`;
            html += `<div class="prop-group"><label>Border Radius</label><input type="number" min="0" value="${layer.borderRadius || 0}" onchange="updateProp('borderRadius', parseFloat(this.value))"></div>`;
        }
         html += renderLayerLinkControls(layer);
    }
    }

    panel.innerHTML = html;
    protectPropertyInputs(panel);
}

export function updateItemDetail(index, key, value) {
    const selected = getSelectedLayers();
    if (selected.length !== 1 || selected[0].type !== 'component') return;
    const layer = selected[0];
    layer.itemNames = Array.isArray(layer.itemNames) ? layer.itemNames : [];
    layer.itemAnchors = Array.isArray(layer.itemAnchors) ? layer.itemAnchors : [];
    layer.itemDividers = Array.isArray(layer.itemDividers) ? layer.itemDividers : [];
    if (key === 'name') layer.itemNames[index] = String(value || `Item${index + 1}`);
    if (key === 'anchor') layer.itemAnchors[index] = String(value || '');
    if (key === 'divider') layer.itemDividers[index] = Boolean(value);
    saveHistory();
    render();
    updateStatus('Item updated');
}

export function setPropertyStateMode(mode) {
    shared.propertyStateMode = mode;
    renderProperties();
}

export function updateCurrentOpacity(value, input) {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    selected[0].opacity = value;
    const selectedElement = document.querySelector(`.shape-layer[data-id="${selected[0].id}"]`);
    if (selectedElement) selectedElement.style.opacity = value;
    const valueLabel = input && input.nextElementSibling;
    if (valueLabel) valueLabel.textContent = `${Math.round(value * 100)}%`;
    if (input && input.dataset.committed !== 'true') {
        input.onchange = () => {
            saveHistory();
            render();
        };
        input.dataset.committed = 'true';
    }
}

export function snapRotationValue(value, input) {
    if (!Number.isFinite(value)) return 0;
    const previous = Number(input?.dataset.previousRotation);
    const crossedZero = Number.isFinite(previous) && previous !== 0 && value !== 0 && Math.sign(previous) !== Math.sign(value);
    const snapped = crossedZero || Math.abs(value) <= 2 ? 0 : value;
    if (input) {
        input.dataset.previousRotation = String(snapped);
        input.value = String(snapped);
    }
    return snapped;
}

export function updateCurrentRotation(value, input, commit = false) {
    const selected = getSelectedLayers();
    if (selected.length !== 1 || !Number.isFinite(value)) return;
    const layer = selected[0];
    layer.rotation = value;
    syncLayerElement(layer);
    const valueLabel = input && input.nextElementSibling;
    if (valueLabel) valueLabel.textContent = `${Math.round(value)}°`;
    if (commit) {
        saveHistory();
        render();
        updateStatus('Rotation updated');
    }
}

export function updateStateProp(stateName, key, value, commit = true, input) {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    const layer = selected[0];
    layer[stateName] = layer[stateName] || {};
    if (key.includes('.')) {
        const [objectKey, property] = key.split('.');
        layer[objectKey] = layer[objectKey] || {};
        layer[objectKey][property] = value;
    } else {
        layer[stateName][key] = value;
    }
    if (commit) {
        saveHistory();
        render();
        updateStatus('Hover state updated');
    } else {
        const selectedElement = document.querySelector(`.shape-layer[data-id="${layer.id}"]`);
        if (selectedElement) {
            selectedElement.style.setProperty('--layer-hover-opacity', layer.hover.opacity ?? 1);
            selectedElement.style.setProperty('--layer-hover-duration', `${layer.hover.duration ?? 0.45}s`);
            selectedElement.style.setProperty('--layer-hover-scale', layer.hover.scale ?? 1);
            selectedElement.style.setProperty('--layer-hover-rotation', `${(layer.rotation || 0) + (layer.hover.rotation || 0)}deg`);
        }
        const valueLabel = input && input.nextElementSibling;
        if (valueLabel) valueLabel.textContent = key === 'duration'
            ? `${Number(value).toFixed(2)}s`
            : key === 'rotation' ? `${Math.round(Number(value))}°`
                : `${Math.round(Number(value) * 100)}%`;
    }
}

export function renderLayerLinkControls(layer) {
    const linkType = layer.linkType || 'none';
    const targetOptions = shared.layers
        .filter(target => target.id !== layer.id)
        .map(target => `<option value="${target.id}"${String(layer.linkTargetId) === String(target.id) ? ' selected' : ''}>${escapeAttribute(target.name || `${target.type} ${target.id}`)}</option>`)
        .join('');
    let html = `<div class="prop-section layer-link-section"><div class="prop-section-title"><span class="material-symbols-outlined">link</span>Link</div>`;
    html += `<div class="prop-group"><label>Action</label><select onchange="updateProp('linkType', this.value)"><option value="none"${linkType === 'none' ? ' selected' : ''}>None</option><option value="website"${linkType === 'website' ? ' selected' : ''}>Website URL</option><option value="page"${linkType === 'page' ? ' selected' : ''}>Page URL</option><option value="scrollto"${linkType === 'scrollto' ? ' selected' : ''}>Scroll to layer</option></select></div>`;
    if (linkType === 'website' || linkType === 'page') {
        html += `<div class="prop-group"><label>${linkType === 'website' ? 'Website URL' : 'Page URL'}</label><input type="text" value="${escapeAttribute(layer.linkUrl || '')}" placeholder="${linkType === 'website' ? 'https://example.com' : '/page.html'}" onchange="updateProp('linkUrl', this.value)"></div>`;
    } else if (linkType === 'scrollto') {
        html += `<div class="prop-group"><label>Target layer</label><select onchange="updateProp('linkTargetId', this.value)"><option value=""${!layer.linkTargetId ? ' selected' : ''}>Select a layer</option>${targetOptions}</select></div>`;
    }
    return html + `</div>`;
}

export function toggleLockAspect() {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    const layer = selected[0];
    layer.lockAspect = !layer.lockAspect;
    saveHistory();
    render();
    updateStatus(layer.lockAspect ? 'Locked: resize is now proportional' : 'Unlocked: resize is now freeform');
}

export function updateProp(key, value) {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    const layer = selected[0];
    const isFontChange = layer.type === 'text' && key === 'fontFamily';
    if (isFontChange) loadGoogleFontFamily(value);
    if (key === 'linkType' && value === 'website' && layer.linkUrl) {
        layer.linkUrl = normalizeWebsiteUrl(layer.linkUrl);
    }
    if (key === 'linkUrl' && layer.linkType === 'website') {
        value = normalizeWebsiteUrl(value);
    }
    // Typing a width/height for a LOCKED text layer is a resize, same
    // as dragging a handle - scale the font to match instead of just
    // stretching the box, then re-fit tightly. An UNLOCKED text layer
    // takes the typed size as-is (freeform), same as any shape.
    if ((layer.type === 'text' || layer.type === 'trigger') && layer.lockAspect && (key === 'width' || key === 'height')) {
        const startSize = key === 'width' ? layer.width : layer.height;
        const scale = startSize > 0 ? Math.max(0.1, value / startSize) : 1;
        layer[key] = value;
        layer.fontSize = Math.max(6, Math.round((layer.fontSize || 20) * scale));
        if (layer.type === 'text') {
            fitTextBox(layer);
        } else {
            layer[key] = value;
            fitTriggerBox(layer);
        }
    } else {
        layer[key] = value;
    }
    // Text layers should always reflow immediately when the font family is
    // changed so the box hugs the new glyph metrics on the same click.
    if (layer.type === 'text' && ['content', 'fontSize', 'fontFamily'].includes(key)) {
        if (isFontChange) {
            refreshTextFitAfterFontLoad(layer);
        } else if (layer.lockAspect) {
            fitTextBox(layer);
        }
    } else if (layer.type === 'trigger' && key === 'fontSize' && layer.lockAspect) {
        fitTriggerBox(layer);
    }
    // Manual edits to a grouped child's geometry can also push it past
    // its group's box - keep the group shrink-wrapped here too.
    if (layer.parentId !== null && ['x', 'y', 'width', 'height', 'rotation', 'fontSize', 'content', 'fontFamily'].includes(key)) {
        recalcGroupBounds(layer.parentId);
    }
    saveHistory();
    render();
    updateStatus('Property updated');
}
