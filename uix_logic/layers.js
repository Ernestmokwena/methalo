import { shared } from './main.js';

import {
    applyLayerVariant,
    callBusinessApi,
    callBusinessApiSync,
    captureLayerVariant,
    ensureLayerCanvasMaps,
    getChildren,
    getLayer,
    getSelectedLayers,
    persistCurrentCanvasLayerState,
    setLayerIncluded,
} from './state.js';

import { fitTextBox, getRenderedLayerBox, render, syncLayerElement } from './render.js';
import { clampCanvasHeight, renderProperties, updateStatus } from './ui.js';
import { saveHistory } from './history.js';
export function generateId() { return shared.nextId++; }

export function normalizeNameToken(name, fallback) {
    const raw = (name || '').trim().replace(/\s+/g, '_');
    const token = raw.replace(/[^A-Za-z0-9_\-]/g, '');
    if (!token) return fallback;
    return /^[0-9]/.test(token) ? `_${token}` : token;
}

export function getLayerClassName(layer) {
    return `${normalizeNameToken(layer.name, 'layer')}_${layer.id}`;
}

export function getLayerHtmlId(layer) {
    return `${normalizeNameToken(layer.name, layer.type || 'layer')}_${layer.id}`;
}

export function nudgeSelectedLayers(dx, dy) {
    if (!shared.selectedIds.length) return false;

    // Move only top-level selected items so a selected group and its
    // selected child do not get moved twice.
    const selectedIdSet = new Set(shared.selectedIds);
    const topSelected = shared.selectedIds
        .map(id => getLayer(id))
        .filter(l => l && !(l.parentId !== null && selectedIdSet.has(l.parentId)));

    const parentsToRecalc = new Set();
    let moved = false;

    topSelected.forEach(layer => {
        const parent = layer.parentId !== null ? getLayer(layer.parentId) : null;
        const isFlexChild = !!(parent && parent.type === 'group' && parent.flexBind && parent.flexBind.enabled);
        if (isFlexChild) return;

        layer.x += dx;
        layer.y += dy;
        moved = true;
        if (layer.parentId !== null) parentsToRecalc.add(layer.parentId);
        syncLayerElement(layer);
    });

    parentsToRecalc.forEach(parentId => recalcGroupBounds(parentId));
    if (moved) renderProperties();
    return moved;
}

export function getGroupBounds(group) {
    const children = getChildren(group.id);
    if (children.length === 0) return { x: 0, y: 0, width: group.width, height: group.height };
    const left = Math.min(...children.map(c => c.x));
    const top = Math.min(...children.map(c => c.y));
    const right = Math.max(...children.map(c => c.x + c.width));
    const bottom = Math.max(...children.map(c => c.y + c.height));
    return { x: left, y: top, width: right - left, height: bottom - top, left, top, right, bottom };
}

export function alignSelectedInGroup(action) {
    const selected = getSelectedLayers();
    if (selected.length !== 1) return;
    const layer = selected[0];
    if (!layer.parentId) return;
    const group = getLayer(layer.parentId);
    if (!group || group.type !== 'group') return;

    const groupBounds = getGroupBounds(group);
    const groupLeft = 0;
    const groupTop = 0;
    const groupRight = group.width;
    const groupBottom = group.height;
    const target = {
        alignLeft: groupLeft,
        alignRight: groupRight - layer.width,
        alignTop: groupTop,
        alignBottom: groupBottom - layer.height,
        alignCenterX: groupLeft + (group.width - layer.width) / 2,
        alignCenterY: groupTop + (group.height - layer.height) / 2
    };

    switch (action) {
        case 'alignLeft': layer.x = target.alignLeft; break;
        case 'alignRight': layer.x = target.alignRight; break;
        case 'alignTop': layer.y = target.alignTop; break;
        case 'alignBottom': layer.y = target.alignBottom; break;
        case 'alignCenter':
            layer.x = target.alignCenterX;
            layer.y = target.alignCenterY;
            break;
    }

    saveHistory();
    render();
    updateStatus('Aligned inside group');
}

export // getChildren() is z-order (the order layers were created/duplicated in),
// which is irrelevant for an absolutely-positioned group - each child
// still lands at its own x/y regardless of array order. But a flex-bound
// group lays children out in DOCUMENT order, so that same z-order
// suddenly becomes visual order too. Without this, a child created after
// its neighbors (e.g. a duplicate) would jump to a different spot the
// instant you bind flex, even though it looked fine beforehand. Sorting
// by actual on-screen position (x for a row, y for a column) keeps the
// pre-bind visual sequence intact.
function getOrderedChildren(group) {
    const children = getChildren(group.id);
    const direction = group.flexBind && group.flexBind.enabled ? group.flexBind.direction : null;
    if (!direction) return children;
    return children.slice().sort((a, b) => direction === 'column' ? a.y - b.y : a.x - b.x);
}

export function normalizeCanvasBreakpoints(values) {
    const normalized = [];
    (values || []).forEach(value => {
        const num = Math.round(Number(value));
        if (Number.isFinite(num) && num >= 120) normalized.push(num);
    });
    return normalized.length ? normalized : [900];
}

export function syncCanvasHeightsWithBreakpoints() {
    const widths = normalizeCanvasBreakpoints(shared.canvasBreakpoints);
    const previous = Array.isArray(shared.canvasHeights) ? shared.canvasHeights.slice() : [];
    const fallback = clampCanvasHeight(Math.round(shared.canvasHeight || 600));
    const nextHeights = widths.map((_, idx) => {
        const candidate = previous[idx] !== undefined ? previous[idx] : fallback;
        return clampCanvasHeight(Math.round(Number(candidate) || fallback));
    });
    shared.canvasHeights = nextHeights;
    shared.activeCanvasIndex = Math.max(0, Math.min(widths.length - 1, shared.activeCanvasIndex));
    shared.canvasHeight = shared.canvasHeights[shared.activeCanvasIndex] || fallback;
}

export function getScreenRanges() {
    const widths = normalizeCanvasBreakpoints(shared.canvasBreakpoints);
    return widths.map((width, index) => ({ index, start: 0, end: width, width, center: width / 2 }));
}

export function inferScreenIndexFromX(x) {
    const ranges = getScreenRanges();
    if (!ranges.length) return 0;
    const pointX = Number(x);
    if (!Number.isFinite(pointX)) return 0;

    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        const isLast = i === ranges.length - 1;
        if (isLast) {
            if (pointX >= range.start && pointX <= range.end) return i;
        } else if (pointX >= range.start && pointX < range.end) {
            return i;
        }
    }

    return pointX < ranges[0].start ? 0 : ranges.length - 1;
}

export function ensureRootScreenId(layer) {
    if (!layer || layer.parentId !== null) return 0;
    const ranges = getScreenRanges();
    const maxIdx = Math.max(0, ranges.length - 1);
    if (Number.isFinite(layer.screenId)) {
        layer.screenId = Math.max(0, Math.min(maxIdx, layer.screenId));
        return layer.screenId;
    }

    const centerX = (layer.x || 0) + ((layer.width || 0) / 2);
    layer.screenId = inferScreenIndexFromX(centerX);
    return layer.screenId;
}

export function getRootScreenStart(layer) {
    return 0;
}

export function activateCanvasLayerState(canvasIndex) {
    const widths = normalizeCanvasBreakpoints(shared.canvasBreakpoints);
    const targetWidth = widths[canvasIndex] || widths[0];
    const targetHeight = shared.canvasHeights[canvasIndex] || shared.canvasHeights[0] || 600;
    shared.layers.forEach(layer => {
        ensureLayerCanvasMaps(layer);
        const key = String(canvasIndex);
        if (!Object.prototype.hasOwnProperty.call(layer.variantByCanvas, key)) {
            captureLayerVariant(layer, canvasIndex);
            if (layer.parentId === null) {
                const variant = layer.variantByCanvas[key];
                variant.x = Math.max(0, Math.min(Number(variant.x) || 0, targetWidth - (Number(variant.width) || 0)));
                variant.y = Math.max(0, Math.min(Number(variant.y) || 0, targetHeight - (Number(variant.height) || 0)));
            }
        }
        applyLayerVariant(layer, canvasIndex);
    });
}

export function setActiveCanvas(index) {
    persistCurrentCanvasLayerState();
    const ranges = getScreenRanges();
    const maxIdx = Math.max(0, ranges.length - 1);
    const next = Math.max(0, Math.min(maxIdx, Number(index) || 0));
    shared.activeCanvasIndex = next;
    syncCanvasHeightsWithBreakpoints();
    activateCanvasLayerState(shared.activeCanvasIndex);
    render();
    updateStatus(`${getCanvasLabel(next)} selected`);
}

export function getCanvasLabel(index) {
    return ['Desktop', 'Tablet', 'Mobile', 'Mobile Small'][index] || `Responsive ${index + 1}`;
}

export function renderBreakpointControls() {
    const list = document.getElementById('breakpointList');
    if (!list) return;

    const ordered = normalizeCanvasBreakpoints(shared.canvasBreakpoints);
    shared.canvasBreakpoints = ordered;
    syncCanvasHeightsWithBreakpoints();
    list.innerHTML = '';
    ordered.forEach((bp, index) => {
        const chip = document.createElement('span');
        chip.className = 'experiment-breakpoint-chip';
        if (index === shared.activeCanvasIndex) chip.classList.add('active');
        const dimensions = `${bp}px x ${Math.round(shared.canvasHeights[index] || 600)}px`;
        chip.title = `${getCanvasLabel(index)} (${dimensions})`;
        chip.setAttribute('aria-label', `${getCanvasLabel(index)}, ${dimensions}`);
        chip.innerHTML = `<span>${getCanvasLabel(index)}</span><button type="button" class="experiment-breakpoint-remove" title="Remove ${getCanvasLabel(index)}" aria-label="Remove ${getCanvasLabel(index)}"><span class="material-symbols-outlined">cancel</span></button>`;
        chip.addEventListener('click', () => setActiveCanvas(index));
        chip.querySelector('.experiment-breakpoint-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeCanvasBreakpoint(bp);
        });
        list.appendChild(chip);
    });
}

export function addCanvasBreakpoint(value) {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed < 120) {
        updateStatus('Page width must be at least 120px');
        return;
    }
    shared.canvasBreakpoints = normalizeCanvasBreakpoints([...shared.canvasBreakpoints, parsed]);
    shared.canvasHeights = [...shared.canvasHeights, clampCanvasHeight(Math.round(shared.canvasHeight || 600))];
    shared.activeCanvasIndex = shared.canvasBreakpoints.length - 1;
    syncCanvasHeightsWithBreakpoints();
    render();
    updateStatus(`Page width added: ${parsed}px`);
}

export function addCanvasBreakpointFromInput() {
    const input = document.getElementById('breakpointInput');
    if (!input) return;
    addCanvasBreakpoint(input.value);
    input.value = '';
}

export function removeCanvasBreakpoint(value) {
    const parsed = Math.round(Number(value));
    const next = shared.canvasBreakpoints.slice();
    const idx = next.indexOf(parsed);
    if (idx === -1) return;
    next.splice(idx, 1);
    if (shared.canvasHeights[idx] !== undefined) shared.canvasHeights.splice(idx, 1);

    shared.layers.forEach(layer => {
        ensureLayerCanvasMaps(layer);
        const remapped = {};
        Object.entries(layer.variantByCanvas || {}).forEach(([key, variant]) => {
            const numeric = Number(key);
            if (!Number.isFinite(numeric) || numeric === idx) return;
            const target = numeric > idx ? numeric - 1 : numeric;
            remapped[String(target)] = variant;
        });
        layer.variantByCanvas = remapped;

        const includedRemapped = {};
        Object.entries(layer.includedInCanvases || {}).forEach(([key, included]) => {
            const numeric = Number(key);
            if (!Number.isFinite(numeric) || numeric === idx) return;
            const target = numeric > idx ? numeric - 1 : numeric;
            includedRemapped[String(target)] = included;
        });
        layer.includedInCanvases = includedRemapped;
    });

    shared.canvasBreakpoints = normalizeCanvasBreakpoints(next);
    shared.activeCanvasIndex = Math.max(0, Math.min(shared.canvasBreakpoints.length - 1, shared.activeCanvasIndex));
    syncCanvasHeightsWithBreakpoints();
    activateCanvasLayerState(shared.activeCanvasIndex);
    render();
    updateStatus(`Page width removed: ${parsed}px`);
}

export // ============================================================
// LAYER MANAGEMENT
// ============================================================
function addLayer(type, overrides) {
    const o = overrides || {};
    const layer = {
        id: generateId(),
        name: (type === 'component' ? 'Items' : type.charAt(0).toUpperCase() + type.slice(1)) + ' ' + shared.nextId,
        type: type,
        parentId: null, // For groups
        x: o.x !== undefined ? o.x : 50 + Math.random() * 100,
        y: o.y !== undefined ? o.y : 50 + Math.random() * 100,
        width: o.width !== undefined ? o.width : (type === 'text' ? 200 : type === 'trigger' ? 42 : type === 'component' ? 360 : type === 'button' ? 140 : 120),
        height: o.height !== undefined ? o.height : (type === 'text' ? 40 : type === 'trigger' ? 42 : type === 'component' ? 48 : type === 'button' ? 44 : 80),
        visible: true,
        opacity: o.opacity !== undefined ? o.opacity : 1,
        hover: { opacity: 1, rotation: 0, scale: 1, backgroundColor: null, color: null, borderColor: null, duration: 0.45, easing: 'ease', enabled: {} },
        positionEnabled: o.positionEnabled !== undefined ? o.positionEnabled : true,
        positionMode: o.positionMode || 'absolute',
        // Styling
        content: type === 'text' ? 'Double-click' : type === 'button' ? 'Button' : '',
        itemCount: type === 'component' ? Math.max(1, Math.round(o.itemCount || 3)) : 0,
        itemDirection: type === 'component' ? (o.itemDirection || 'row') : 'row',
        itemPadding: type === 'component' ? Math.max(0, Number(o.itemPadding ?? 8)) : 0,
        itemDivider: type === 'component' ? (o.itemDivider || '#cccccc') : '#cccccc',
        itemDividers: type === 'component' ? (Array.isArray(o.itemDividers) ? o.itemDividers : [true, true, true]) : [],
        itemNames: type === 'component' ? (Array.isArray(o.itemNames) ? o.itemNames : []) : [],
        itemAnchors: type === 'component' ? (Array.isArray(o.itemAnchors) ? o.itemAnchors : []) : [],
        useItemAnchors: type === 'component' ? Boolean(o.useItemAnchors) : false,
        color: '#1e293b',
        fontSize: 20,
        fontFamily: 'Arial, Helvetica, sans-serif',
        backgroundColor: type === 'rect' ? '#737373' : type === 'circle' ? '#737373' : type === 'button' ? '#4CAF50' : 'transparent',
        borderRadius: type === 'circle' ? 50 : type === 'trigger' ? 12 : type === 'button' ? 5 : 0,
        borderStyle: type === 'trigger' ? 'none' : type === 'button' ? 'none' : '',
        borderThickness: 0,
        borderColor: type === 'trigger' ? '#64748b' : type === 'button' ? '#388E3C' : '',
        iconColor: type === 'trigger' ? '#0f172a' : '',
        linkType: 'none',
        linkUrl: '',
        linkTargetId: '',
        src: type === 'image' ? (o.src || '') : '',
        icon: type === 'trigger' ? (o.icon || shared.currentTriggerIcon || 'ads_click') : '',
        preIcon: type === 'trigger' ? (Object.prototype.hasOwnProperty.call(o, 'preIcon') ? o.preIcon : (o.icon || shared.currentTriggerIcon || 'ads_click')) : '',
        postIcon: type === 'trigger' ? (Object.prototype.hasOwnProperty.call(o, 'postIcon') ? o.postIcon : '') : '',
        rotation: 0, // degrees
        lockAspect: type === 'text' || type === 'trigger' // text and icons scale their content with the box; shapes start unlocked. Either can be toggled from the properties panel.
    };

    layer.screenId = o.screenId !== undefined
        ? Number(o.screenId)
        : shared.activeCanvasIndex;
    layer.variantByCanvas = {};
    layer.includedInCanvases = {};
    normalizeCanvasBreakpoints(shared.canvasBreakpoints).forEach((_, index) => {
        setLayerIncluded(layer, index, index === shared.activeCanvasIndex);
    });

    shared.layers.push(layer);
    // Text always hugs its own content - if the user sketched a box (drag
    // to mark an area), use its height as a hint for the starting font
    // size, then snap the box to exactly fit that text.
    if (type === 'text') {
        if (o.width !== undefined || o.height !== undefined) {
            layer.fontSize = Math.max(8, Math.round((o.height || 40) * 0.55));
        }
        fitTextBox(layer, false);
    }
    captureLayerVariant(layer, shared.activeCanvasIndex);
    shared.selectedIds = [layer.id]; // Select only the new one
    saveHistory();
    render();
    updateStatus('Added ' + type);
    return layer;
}

export function deleteSelected() {
    if (shared.selectedIds.length === 0) return;

    // Recursive delete function for groups
    const toDelete = [];
    const collectChildren = (id) => {
        toDelete.push(id);
        getChildren(id).forEach(child => collectChildren(child.id));
    };

    // Ensure we don't delete a child if its parent is also selected (parent handles it)
    const topLevelSelected = shared.selectedIds.filter(id => {
        const layer = getLayer(id);
        return !layer || !shared.selectedIds.includes(layer.parentId);
    });

    topLevelSelected.forEach(id => collectChildren(id));

    toDelete.forEach(id => {
        const layer = getLayer(id);
        if (layer) setLayerIncluded(layer, shared.activeCanvasIndex, false);
    });
    shared.selectedIds = [];
    saveHistory();
    render();
    updateStatus('Removed layers from this canvas');
}

export function toggleSelect(id, isMulti) {
    if (isMulti) {
        if (shared.selectedIds.includes(id)) {
            shared.selectedIds = shared.selectedIds.filter(sid => sid !== id);
        } else {
            shared.selectedIds.push(id);
        }
    } else {
        shared.selectedIds = [id];
    }
    render();
}

export function selectLayer(id) {
    shared.selectedIds = [id];
    render();
}

export function selectLayerRangeInList(targetId, additive) {
    const listItems = Array.from(document.querySelectorAll('#layerList .layer-item'));
    const orderedIds = listItems
        .map(el => Number(el.dataset.id))
        .filter(id => Number.isFinite(id));

    if (!orderedIds.length) {
        shared.selectedIds = [targetId];
        shared.layerListAnchorId = targetId;
        render();
        return;
    }

    if (!Number.isFinite(shared.layerListAnchorId) || !orderedIds.includes(shared.layerListAnchorId)) {
        shared.layerListAnchorId = targetId;
    }

    const startIdx = orderedIds.indexOf(shared.layerListAnchorId);
    const endIdx = orderedIds.indexOf(targetId);
    if (startIdx === -1 || endIdx === -1) {
        shared.selectedIds = [targetId];
        shared.layerListAnchorId = targetId;
        render();
        return;
    }

    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    const rangeIds = orderedIds.slice(from, to + 1);

    if (additive) {
        const merged = new Set(shared.selectedIds);
        rangeIds.forEach(id => merged.add(id));
        shared.selectedIds = Array.from(merged);
    } else {
        shared.selectedIds = rangeIds;
    }
    render();
}

export async function groupSelected() {
    if (shared.selectedIds.length < 2) {
        updateStatus('Select at least 2 layers to group');
        return;
    }

    const selectedLayers = getSelectedLayers();
    const measuredLayers = selectedLayers.map(layer => ({
        ...layer,
        ...getRenderedLayerBox(layer),
        parentId: null
    }));
    try {
        const result = await callBusinessApi('group', { selectedLayers: measuredLayers, nextId: shared.nextId, canvasBreakpoints: shared.canvasBreakpoints });
        const selectedIdSet = new Set(shared.selectedIds);
        shared.layers = shared.layers.filter(layer => !selectedIdSet.has(layer.id));
        shared.layers.push(...result.rebased, result.group);
        shared.nextId = Math.max(shared.nextId, Number(result.group.id) + 1);
        shared.selectedIds = [result.group.id];
        saveHistory();
        render();
        updateStatus(result.message || `Grouped ${selectedLayers.length} layers`);
    } catch (error) {
        updateStatus(error.message);
    }
}

export async function ungroupSelected() {
    const selected = getSelectedLayers();
    if (selected.length !== 1 || selected[0].type !== 'group') {
        updateStatus('Select a single Group to ungroup');
        return;
    }

    const group = selected[0];
    try {
        const result = await callBusinessApi('ungroup', { group, layers: shared.layers, breakpoints: shared.canvasBreakpoints });
        const childIds = new Set(getChildren(group.id).map(child => child.id));
        shared.layers = shared.layers.filter(layer => layer.id !== group.id && !childIds.has(layer.id));
        shared.layers.push(...result.ungrouped);
        shared.selectedIds = result.ungrouped.map(child => child.id);
        saveHistory();
        render();
        updateStatus(result.message || 'Ungrouped');
    } catch (error) {
        updateStatus(error.message);
    }
}

export // ============================================================
// RENDER ENGINE
// ============================================================
// Sum of rotation (deg) of every ancestor group above this layer - NOT
// including the layer's own rotation. Needed to translate a raw on-screen
// pointer delta into a child's local (parent-relative) coordinate space
// when that child lives inside one or more rotated groups.
function getAncestorRotation(layer) {
    let total = 0;
    let p = layer.parentId !== null ? getLayer(layer.parentId) : null;
    while (p) {
        total += (p.rotation || 0);
        p = p.parentId !== null ? getLayer(p.parentId) : null;
    }
    return total;
}

export function recalcGroupBounds(groupId) {
    const group = getLayer(groupId);
    if (!group || group.type !== 'group') return;
    const result = callBusinessApiSync('recalc-bounds', { group, layers: shared.layers });
    if (!result.updated) return;
    Object.assign(group, result.updated);
    (result.shiftedChildren || []).forEach(updatedChild => {
        const child = getLayer(updatedChild.id);
        if (child) Object.assign(child, updatedChild);
    });
    if (group.parentId !== null) recalcGroupBounds(group.parentId);
}

export async function recalcGroupBoundsAsync(groupId) {
    const group = getLayer(groupId);
    if (!group || group.type !== 'group') return;
    const result = await callBusinessApi('recalc-bounds', { group, layers: shared.layers });
    if (result.updated) {
        Object.assign(group, result.updated);
        (result.shiftedChildren || []).forEach(updatedChild => {
            const child = getLayer(updatedChild.id);
            if (child) Object.assign(child, updatedChild);
        });
    }
    if (group.parentId !== null) await recalcGroupBoundsAsync(group.parentId);
}

export function reparentLayer(layer, newParentId) {
    const result = callBusinessApiSync('reparent', { layer, newParentId, layers: shared.layers });
    Object.assign(layer, result.layer);
}

export // If a group drops to fewer than 2 children (its last child got dragged
// out), it's no longer a meaningful group - dissolve it and release
// whatever's left back to top-level in its place.
function dissolveIfTooSmall(groupId) {
    const group = getLayer(groupId);
    if (!group || group.type !== 'group') return;
    const children = getChildren(groupId);
    if (children.length >= 2) { recalcGroupBounds(groupId); return; }
    children.forEach(c => reparentLayer(c, group.parentId));
    shared.layers = shared.layers.filter(l => l.id !== groupId);
    if (group.parentId !== null) recalcGroupBounds(group.parentId);
}

export function getLayerList() {
    return shared.layers.slice();
}
