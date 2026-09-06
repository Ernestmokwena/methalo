import { shared } from './main.js';
import { persistCurrentCanvasLayerState } from './state.js';
import { activateCanvasLayerState, syncCanvasHeightsWithBreakpoints } from './layers.js';
import { render } from './render.js';
import { updateStatus } from './ui.js';

export function saveHistory() {
    persistCurrentCanvasLayerState();
    shared.history = shared.history.slice(0, shared.historyIndex + 1);
    shared.history.push(JSON.stringify(shared.layers));
    if (shared.history.length > shared.MAX_HISTORY) shared.history.shift();
    shared.historyIndex = shared.history.length - 1;
}

export function undo() {
    if (shared.historyIndex <= 0) return;
    shared.historyIndex--;
    shared.layers = JSON.parse(shared.history[shared.historyIndex]);
    shared.selectedIds = [];
    syncCanvasHeightsWithBreakpoints();
    activateCanvasLayerState(shared.activeCanvasIndex);
    render();
    updateStatus('Undo');
}

export function redo() {
    if (shared.historyIndex >= shared.history.length - 1) return;
    shared.historyIndex++;
    shared.layers = JSON.parse(shared.history[shared.historyIndex]);
    shared.selectedIds = [];
    syncCanvasHeightsWithBreakpoints();
    activateCanvasLayerState(shared.activeCanvasIndex);
    render();
    updateStatus('Redo');
}
