import { shared } from './main.js';

import {
    callBusinessApi,
    captureLayerVariant,
    ensureLayerCanvasMaps,
    persistCurrentCanvasLayerState,
    savePageState,
    switchPageState,
} from './state.js';

import {
    activateCanvasLayerState,
    normalizeCanvasBreakpoints,
    syncCanvasHeightsWithBreakpoints,
} from './layers.js';

import { clampCanvasHeight, renderProperties, updateStatus } from './ui.js';
import { render } from './render.js';

export async function serializeProject() {
    persistCurrentCanvasLayerState();
    savePageState(shared.currentPage);
    const allPages = {};
    Object.keys(shared.pages).forEach(pageName => {
        const pageState = shared.pages[pageName];
        allPages[pageName] = {
            layers: pageState.layers.map(layer => JSON.parse(JSON.stringify(layer))),
            canvasBreakpoints: normalizeCanvasBreakpoints(pageState.canvasBreakpoints),
            canvasHeights: pageState.canvasHeights.map((value, idx) => clampCanvasHeight(Math.round(Number(value) || pageState.canvasHeights[0] || 600))),
            activeCanvasIndex: pageState.activeCanvasIndex,
            zoomLevel: pageState.zoomLevel,
            nextId: Math.max(1, Number(pageState.nextId) || 1)
        };
    });

    return callBusinessApi('serialize', {
        layers: shared.layers,
        state: {
            pages: shared.pages,
            currentPage: shared.currentPage,
            showOverflow: shared.showOverflow,
            currentTool: shared.currentTool,
            prototypePreviewMode: shared.prototypePreviewMode
        }
    });
}

export async function downloadProjectFile(filename = shared.currentProjectFileName || 'project.methal') {
    const project = await serializeProject();
    const { payload } = await callBusinessApi('obfuscate', { projectJson: JSON.stringify(project, null, 0) });
    shared.savedProjectPayload = payload;
    const blob = new Blob([payload], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.methal') ? filename : `${filename}.methal`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    updateStatus(`Project saved as ${link.download}`);
}

export async function saveProjectToLocalFolder(filename = shared.currentProjectFileName || 'project.methal', promptForFolder = false) {
    if (!window.showDirectoryPicker) return false;
    filename = filename.toLowerCase().endsWith('.methal') ? filename : `${filename}.methal`;
    if (!shared.projectDirectoryHandle || promptForFolder) {
        shared.projectDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    }

    const imagesDirectory = await shared.projectDirectoryHandle.getDirectoryHandle('assets', { create: true });
    const imageFolder = await imagesDirectory.getDirectoryHandle('images', { create: true });
    for (const [src, file] of shared.localImageFiles) {
        const imageName = src.split('/').pop();
        if (!imageName) continue;
        const imageHandle = await imageFolder.getFileHandle(imageName, { create: true });
        const writable = await imageHandle.createWritable();
        await writable.write(file);
        await writable.close();
    }

    const project = await serializeProject();
    const { payload } = await callBusinessApi('obfuscate', { projectJson: JSON.stringify(project, null, 0) });
    shared.savedProjectPayload = payload;
    const projectHandle = await shared.projectDirectoryHandle.getFileHandle(filename, { create: true });
    const writable = await projectHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    shared.currentProjectFileName = filename;
    updateStatus(`Saved ${filename} with images to the selected folder`);
    return true;
}

export async function ensureProjectSavedForExport() {
    if (shared.projectDirectoryHandle) {
        await saveProjectToLocalFolder(shared.currentProjectFileName, false);
        return;
    }
    await saveProjectToLocalFolder(shared.currentProjectFileName, true);
}

export async function readSavedProjectForExport() {
    let raw;
    if (shared.savedProjectPayload) {
        raw = shared.savedProjectPayload;
    } else if (shared.projectDirectoryHandle) {
        const filename = shared.currentProjectFileName.toLowerCase().endsWith('.methal')
            ? shared.currentProjectFileName
            : `${shared.currentProjectFileName}.methal`;
        let projectHandle;
        try {
            projectHandle = await shared.projectDirectoryHandle.getFileHandle(filename);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('Save the workspace first, then press Export again');
            }
            throw error;
        }
        raw = await (await projectHandle.getFile()).text();
    } else {
        throw new Error('Save the workspace first, then press Export again');
    }
    updateStatus('Reading saved project...');
    const { projectJson } = await callBusinessApi('deobfuscate', { payload: raw });
    let project;
    try {
        project = JSON.parse(projectJson);
    } catch {
        throw new Error('The saved .methal file is invalid or corrupted');
    }

    if (project.pages && typeof project.pages === 'object') {
        const savedPageName = project.currentPage || shared.currentPage;
        const savedPage = project.pages[savedPageName] || Object.values(project.pages)[0];
        if (!savedPage) throw new Error('The saved project has no page to export');
        return {
            layers: Array.isArray(savedPage.layers) ? savedPage.layers : [],
            state: {
                canvasBreakpoints: savedPage.canvasBreakpoints,
                canvasHeights: savedPage.canvasHeights,
                activeCanvasIndex: savedPage.activeCanvasIndex,
                currentPage: savedPageName,
                showOverflow: !!project.metadata?.showOverflow,
                currentTool: project.metadata?.currentTool || 'select',
                prototypePreviewMode: !!project.metadata?.prototypePreviewMode
            }
        };
    }
    if (Array.isArray(project.layers)) {
        return {
            layers: project.layers,
            state: {
                canvasBreakpoints: project.canvasBreakpoints,
                canvasHeights: project.canvasHeights,
                activeCanvasIndex: project.activeCanvasIndex,
                currentPage: shared.currentPage,
                showOverflow: !!project.metadata?.showOverflow,
                currentTool: project.metadata?.currentTool || 'select',
                prototypePreviewMode: !!project.metadata?.prototypePreviewMode
            }
        };
    }
    throw new Error('The saved file is not a valid Methalo project');
}

export function applyProjectToEditor(project) {
    if (!project) {
        throw new Error('Invalid project data');
    }

    // Handle new multi-page format (v2)
    if (project.pages && typeof project.pages === 'object') {
        shared.pages = {};
        Object.keys(project.pages).forEach(pageName => {
            const pageData = project.pages[pageName];
            const importedLayers = (pageData.layers || []).map(layer => {
                const fresh = JSON.parse(JSON.stringify(layer));
                fresh.variantByCanvas = fresh.variantByCanvas || {};
                return fresh;
            });
            const importBreakpoints = normalizeCanvasBreakpoints(pageData.canvasBreakpoints || [900]);
            const importHeights = Array.isArray(pageData.canvasHeights)
                ? pageData.canvasHeights.map(value => clampCanvasHeight(Math.round(Number(value) || 600)))
                : importBreakpoints.map(() => 600);

            shared.pages[pageName] = {
                layers: importedLayers,
                nextId: Math.max(1, Number(pageData.nextId) || Math.max(1, ...importedLayers.map(layer => Number(layer.id) || 0)) + 1),
                selectedIds: [],
                canvasBreakpoints: importBreakpoints,
                canvasHeights: importHeights.length === importBreakpoints.length ? importHeights : importBreakpoints.map((_, idx) => importHeights[idx] || 600),
                activeCanvasIndex: Math.max(0, Math.min(importBreakpoints.length - 1, Number(pageData.activeCanvasIndex) || 0)),
                zoomLevel: Number(pageData.zoomLevel) || 1,
                history: [],
                historyIndex: -1
            };

            // Ensure layer canvas maps
            importedLayers.forEach(layer => {
                ensureLayerCanvasMaps(layer);
                if (!Object.keys(layer.variantByCanvas).length) {
                    captureLayerVariant(layer, shared.pages[pageName].activeCanvasIndex);
                }
            });
        });

        // Load the saved current page or default to first page
        shared.currentPage = project.currentPage || 'home';
        switchPageState(shared.currentPage);
    } else if (Array.isArray(project.layers)) {
        // Handle old single-page format (v1) - backward compatibility
        const importedLayers = project.layers.map(layer => {
            const fresh = JSON.parse(JSON.stringify(layer));
            fresh.variantByCanvas = fresh.variantByCanvas || {};
            return fresh;
        });
        const importBreakpoints = normalizeCanvasBreakpoints(project.canvasBreakpoints || [900]);
        const importHeights = Array.isArray(project.canvasHeights)
            ? project.canvasHeights.map(value => clampCanvasHeight(Math.round(Number(value) || 600)))
            : importBreakpoints.map(() => 600);

        // Load into current page
        shared.pages[shared.currentPage] = {
            layers: importedLayers,
            nextId: Math.max(1, Number(project.nextId) || Math.max(1, ...importedLayers.map(layer => Number(layer.id) || 0)) + 1),
            selectedIds: [],
            canvasBreakpoints: importBreakpoints,
            canvasHeights: importHeights.length === importBreakpoints.length ? importHeights : importBreakpoints.map((_, idx) => importHeights[idx] || 600),
            activeCanvasIndex: Math.max(0, Math.min(importBreakpoints.length - 1, Number(project.activeCanvasIndex) || 0)),
            zoomLevel: Number(project.metadata?.zoomLevel) || 1,
            history: [],
            historyIndex: -1
        };

        switchPageState(shared.currentPage);

        importedLayers.forEach(layer => {
            ensureLayerCanvasMaps(layer);
            if (!Object.keys(layer.variantByCanvas).length) {
                captureLayerVariant(layer, shared.activeCanvasIndex);
            }
        });
    } else {
        throw new Error('This .methal file is not a valid Methalo project.');
    }

    // Apply metadata
    if (project.metadata) {
        shared.showOverflow = !!project.metadata.showOverflow;
        shared.currentTool = project.metadata.currentTool || shared.currentTool;
        shared.prototypePreviewMode = !!project.metadata.prototypePreviewMode;
    }

    // Activate canvas and render
    syncCanvasHeightsWithBreakpoints();
    activateCanvasLayerState(shared.activeCanvasIndex);
    shared.selectedIds = [];
    renderProperties();
    render();
}

export function loadProjectFile(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const raw = String(reader.result || '');
            const { projectJson: decoded } = await callBusinessApi('deobfuscate', { payload: raw });
            const parsed = JSON.parse(decoded);
            applyProjectToEditor(parsed);
            shared.savedProjectPayload = raw;
            shared.projectDirectoryHandle = null;
            shared.currentProjectFileName = file.name || shared.currentProjectFileName;
            updateStatus(`Saved project loaded: ${file.name}`);
        } catch (error) {
            console.error(error);
            updateStatus('Unable to load .methal file');
        } finally {
            event.target.value = '';
        }
    };
    reader.onerror = () => {
        updateStatus('Unable to read .methal file');
        event.target.value = '';
    };
    reader.readAsText(file);
}

export // ============================================================
// EXPORT ENGINE
// ============================================================
async function openExport() {
    try {
        updateStatus('Reading saved project...');
        await generateExport();
        document.getElementById('exportModal').classList.add('active');
        updateStatus('Export ready');
    } catch (error) {
        console.error(error);
        updateStatus(error.name === 'AbortError'
            ? 'Export timed out; check the server connection'
            : `Export failed: ${error.message || 'save the workspace first'}`);
    }
}

export function closeExport() { document.getElementById('exportModal').classList.remove('active'); }

export async function generateExport() {
    const savedProject = await readSavedProjectForExport();
    updateStatus('Generating export...');
    const result = await callBusinessApi('export-html', savedProject);
    document.getElementById('exportCode').textContent = result.html;
}

export function downloadExportHtml() {
    const text = document.getElementById('exportCode').textContent;
    if (!text || text === 'Loading...') {
        updateStatus('Generate the export before downloading');
        return;
    }
    const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const baseName = (shared.currentProjectFileName || 'project.methal').replace(/\.methal$/i, '');
    link.href = url;
    link.download = `${baseName}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    updateStatus(`Downloaded ${link.download}`);
}
