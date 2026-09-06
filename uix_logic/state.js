import { shared } from './main.js';

export // Helper function to get current page state
function getPageState() {
    return shared.pages[shared.currentPage];
}

export // Helper functions for state access (proxies to current page)
function getState() {
    return {
        get layers() { return shared.pages[shared.currentPage].layers; },
        set layers(val) { shared.pages[shared.currentPage].layers = val; },
        get nextId() { return shared.pages[shared.currentPage].nextId; },
        set nextId(val) { shared.pages[shared.currentPage].nextId = val; },
        get selectedIds() { return shared.pages[shared.currentPage].selectedIds; },
        set selectedIds(val) { shared.pages[shared.currentPage].selectedIds = val; },
        get canvasBreakpoints() { return shared.pages[shared.currentPage].canvasBreakpoints; },
        set canvasBreakpoints(val) { shared.pages[shared.currentPage].canvasBreakpoints = val; },
        get canvasHeights() { return shared.pages[shared.currentPage].canvasHeights; },
        set canvasHeights(val) { shared.pages[shared.currentPage].canvasHeights = val; },
        get activeCanvasIndex() { return shared.pages[shared.currentPage].activeCanvasIndex; },
        set activeCanvasIndex(val) { shared.pages[shared.currentPage].activeCanvasIndex = val; },
        get zoomLevel() { return shared.pages[shared.currentPage].zoomLevel; },
        set zoomLevel(val) { shared.pages[shared.currentPage].zoomLevel = val; },
        get history() { return shared.pages[shared.currentPage].history; },
        set history(val) { shared.pages[shared.currentPage].history = val; },
        get historyIndex() { return shared.pages[shared.currentPage].historyIndex; },
        set historyIndex(val) { shared.pages[shared.currentPage].historyIndex = val; }
    };
}

export // Function to switch to a page and load its state
function switchPageState(pageName) {
    shared.currentPage = pageName;
        shared.layers = shared.pages[shared.currentPage].layers || [];
    shared.nextId = shared.pages[shared.currentPage].nextId;
    shared.selectedIds = shared.pages[shared.currentPage].selectedIds;
    shared.canvasBreakpoints = shared.pages[shared.currentPage].canvasBreakpoints;
    shared.canvasHeights = shared.pages[shared.currentPage].canvasHeights;
    shared.activeCanvasIndex = shared.pages[shared.currentPage].activeCanvasIndex;
    shared.zoomLevel = shared.pages[shared.currentPage].zoomLevel;
    shared.history = shared.pages[shared.currentPage].history;
    shared.historyIndex = shared.pages[shared.currentPage].historyIndex;
}

export // Function to save current page state before switching
function savePageState(pageName) {
    shared.pages[pageName] = {
        layers: shared.layers,
        nextId: shared.nextId,
        selectedIds: shared.selectedIds,
        canvasBreakpoints: shared.canvasBreakpoints,
        canvasHeights: shared.canvasHeights,
        activeCanvasIndex: shared.activeCanvasIndex,
        zoomLevel: shared.zoomLevel,
        history: shared.history,
        historyIndex: shared.historyIndex
    };
}

export function getLayer(id) { return shared.layers.find(l => l.id === id); }
export function getSelectedLayers() { return shared.layers.filter(l => shared.selectedIds.includes(l.id)); }
export function getChildren(parentId) { return shared.layers.filter(l => l.parentId === parentId); }

export async function callBusinessApi(endpoint, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
        response = await fetch(`/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Business API request failed: ${response.status}`);
    return result;
}

export function callBusinessApiSync(endpoint, payload) {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/${endpoint}`, false);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(JSON.stringify(payload));
    const result = JSON.parse(request.responseText || '{}');
    if (request.status < 200 || request.status >= 300) throw new Error(result.error || `Business API request failed: ${request.status}`);
    return result;
}

export function cloneVariantValue(value) {
    if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value));
    return value;
}

export function ensureLayerCanvasMaps(layer) {
    if (!layer) return;
    if (!layer.variantByCanvas || typeof layer.variantByCanvas !== 'object') {
        layer.variantByCanvas = {};
    }
    if (!layer.includedInCanvases || typeof layer.includedInCanvases !== 'object') {
        layer.includedInCanvases = {};
    }
}

export function isLayerIncluded(layer, canvasIndex) {
    ensureLayerCanvasMaps(layer);
    if (Object.keys(layer.includedInCanvases).length === 0) {
        return Number(layer.screenId) === canvasIndex;
    }
    const value = layer.includedInCanvases[String(canvasIndex)];
    return value === undefined ? true : value !== false;
}

export function setLayerIncluded(layer, canvasIndex, included) {
    ensureLayerCanvasMaps(layer);
    layer.includedInCanvases[String(canvasIndex)] = included !== false;
}

export function captureLayerVariant(layer, canvasIndex) {
    ensureLayerCanvasMaps(layer);
    const key = String(canvasIndex);
    const variant = layer.variantByCanvas[key] || {};
    shared.LAYER_VARIANT_KEYS.forEach(prop => {
        variant[prop] = cloneVariantValue(layer[prop]);
    });
    layer.variantByCanvas[key] = variant;
}

export function applyLayerVariant(layer, canvasIndex) {
    ensureLayerCanvasMaps(layer);
    const variant = layer.variantByCanvas[String(canvasIndex)];
    if (!variant) return;
    shared.LAYER_VARIANT_KEYS.forEach(prop => {
        if (Object.prototype.hasOwnProperty.call(variant, prop)) {
            layer[prop] = cloneVariantValue(variant[prop]);
        }
    });
}

export function getLayerDescendants(layerId) {
    const out = [];
    const walk = (id) => {
        getChildren(id).forEach(child => {
            out.push(child);
            walk(child.id);
        });
    };
    walk(layerId);
    return out;
}

export function persistCurrentCanvasLayerState() {
    shared.layers.forEach(layer => {
        captureLayerVariant(layer, shared.activeCanvasIndex);
    });
    shared.canvasHeights[shared.activeCanvasIndex] = shared.canvasHeight;
}
