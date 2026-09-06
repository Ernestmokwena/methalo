import {
    applyLayerVariant,
    callBusinessApi,
    callBusinessApiSync,
    captureLayerVariant,
    cloneVariantValue,
    ensureLayerCanvasMaps,
    getChildren,
    getLayer,
    getLayerDescendants,
    getPageState,
    getSelectedLayers,
    getState,
    isLayerIncluded,
    persistCurrentCanvasLayerState,
    savePageState,
    setLayerIncluded,
    switchPageState,
} from './state.js';

import {
    fitTextBox,
    fitTextToBox,
    getRenderedLayerBox,
    getTextTransformCss,
    measureTextSize,
    refreshTextFitAfterFontLoad,
    render,
    renderComponentContent,
    startTextEditing,
    syncLayerElement,
    syncSelectionOverlay,
} from './render.js';

import {
    activateCanvasLayerState,
    addCanvasBreakpoint,
    addCanvasBreakpointFromInput,
    addLayer,
    alignSelectedInGroup,
    deleteSelected,
    dissolveIfTooSmall,
    ensureRootScreenId,
    generateId,
    getAncestorRotation,
    getCanvasLabel,
    getGroupBounds,
    getLayerClassName,
    getLayerHtmlId,
    getLayerList,
    getOrderedChildren,
    getRootScreenStart,
    getScreenRanges,
    groupSelected,
    inferScreenIndexFromX,
    normalizeCanvasBreakpoints,
    normalizeNameToken,
    nudgeSelectedLayers,
    recalcGroupBounds,
    recalcGroupBoundsAsync,
    removeCanvasBreakpoint,
    renderBreakpointControls,
    reparentLayer,
    selectLayer,
    selectLayerRangeInList,
    setActiveCanvas,
    syncCanvasHeightsWithBreakpoints,
    toggleSelect,
    ungroupSelected,
} from './layers.js';

import {
    applyProjectToEditor,
    closeExport,
    downloadExportHtml,
    downloadProjectFile,
    ensureProjectSavedForExport,
    generateExport,
    loadProjectFile,
    openExport,
    readSavedProjectForExport,
    saveProjectToLocalFolder,
    serializeProject,
} from './export.js';

import {
    closePrototypePanel,
    closePrototypePreviewPanel,
    ensureGroupPrototype,
    getPrototypeGroups,
    getPrototypePanelAnchor,
    getPrototypeStateDisplay,
    getSelectedPrototypeGroup,
    openPrototypePanel,
    syncPrototypePreviewPanel,
    togglePrototypePreviewPanel,
    togglePrototypeState,
    togglePrototypeTool,
    updatePrototypePanelUI,
} from './prototype.js';

import {
    applyCanvasHeight,
    centerCanvasViewport,
    clampCanvasHeight,
    clampZoom,
    closeExperimentPanel,
    closeFlexPanel,
    closeGroupFeaturesPanel,
    closeItemsSetup,
    closePageTab,
    confirmItemsSetup,
    createPageTab,
    followLayerLink,
    getCanvasPoint,
    getPageTabs,
    hideFileMenu,
    isHoverPropertyEnabled,
    newPage,
    newProject,
    normalizeWebsiteUrl,
    nudgeCanvasHeight,
    openFlexPanel,
    openGroupFeaturesPanel,
    openItemsSetup,
    populateGroupTargetOptions,
    positionExperimentPanel,
    positionItemsPanel,
    positionPrototypePreviewPanel,
    protectPropertyInputs,
    renamePageTab,
    renderItemsPanel,
    renderLayerLinkControls,
    renderProperties,
    saveProjectFile,
    setGroupLinkInputsVisibility,
    setLivePreviewMode,
    setPropertyStateMode,
    setSidebarTab,
    setTool,
    showRenameDialog,
    snapRotationValue,
    startCanvasResize,
    startScreenDrag,
    syncExperimentControls,
    syncPageTabClosers,
    toggleExperimentPanel,
    toggleFileMenu,
    toggleHoverProperty,
    toggleLockAspect,
    toggleOverflow,
    triggerProjectImport,
    unbindFlex,
    updateCurrentOpacity,
    updateCurrentRotation,
    updateFlexPanelUI,
    updateGroupFeaturesPanelUI,
    updateItemDetail,
    updateLayerCount,
    updateProp,
    updateStateProp,
    updateStatus,
    wirePageTab,
    zoomCanvas,
} from './ui.js';

import {
    closeAllFontsPanel,
    closeFontPanel,
    escapeAttribute,
    escapeHtml,
    getSelectedTypographyLayer,
    loadGoogleFontCatalog,
    loadGoogleFontFamily,
    loadMoreAllFonts,
    openAllFontsPanel,
    populateAllFontsPanel,
    populateFontPanel,
    preloadFontChoices,
    retryAllFontsPanel,
    toggleFontPanel,
    toggleFontStyle,
    updateFontPanelProperty,
    updateFontPanelUI,
} from './fonts.js';

import {
    closeTriggerIconPicker,
    createTriggerIconElement,
    getSocialIconUrl,
    isSocialTriggerIcon,
    loadTriggerIconCatalog,
    pickPrototypeTrigger,
    pickTriggerLayerIcon,
    populateTriggerIconPicker,
} from './icons.js';

import {
    applyTextTransform,
    cloneSelectionForCopy,
    closeContextMenu,
    contextAction,
    copySelected,
    duplicateSelected,
    includeSelectionInPage,
    openContextMenu,
    openIncludeInMenu,
    openPageTabContextMenu,
    pasteSelected,
    startRenameLayer,
} from './context-menu.js';

import {
    chooseImageLink,
    chooseImageUpload,
    clearDropIndicators,
    closeImageSourceModal,
    finalizeImageLayer,
    fitTriggerBox,
    handleImageUpload,
    handlePropImageUpload,
    importImageAsset,
    reorderLayer,
    startDrag,
    startLayerItemDrag,
    startResize,
    startRotate,
} from './drag-drop.js';

import { redo, saveHistory, undo } from './history.js';
export const shared = {};

export function setPage(page) {
    // Save current page state before switching
    savePageState(shared.currentPage);
    
    // Switch to new page and load its state
    switchPageState(page);
    
    // Update UI
    document.querySelectorAll('.tab-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    syncPageTabClosers();
    document.getElementById('canvas').style.background = page === 'about' ? '#f8fafc' : '#ffffff';
    document.getElementById('canvas').style.color = '#0f172a';
    const activeTab = document.querySelector(`.tab-item[data-page="${page}"] .tab-label`);
    const label = activeTab ? activeTab.textContent : `${page}.html`;
    updateStatus('Page: ' + label);
    
    // Render the new page
    shared.selectedIds = []; // Clear selection when switching pages
    render();
}

export async function finishAppLoading() {
    const status = document.getElementById('appLoaderStatus');
    const setStatus = text => { if (status) status.textContent = text; };
    setStatus('Loading icons...');
    const iconFont = document.fonts?.load('24px "Material Symbols Outlined"') || Promise.resolve();
    const documentFonts = document.fonts?.ready || Promise.resolve();
    const timeout = new Promise(resolve => setTimeout(resolve, 3500));
    await Promise.race([Promise.allSettled([iconFont, documentFonts]), timeout]);
    setStatus('Ready');
    document.body.classList.add('app-ready');
    document.getElementById('appLoader')?.setAttribute('aria-hidden', 'true');
}

shared.currentPage = 'home';

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

shared.layers = shared.pages[shared.currentPage].layers;
shared.nextId = shared.pages[shared.currentPage].nextId;
shared.selectedIds = shared.pages[shared.currentPage].selectedIds;
shared.canvasBreakpoints = shared.pages[shared.currentPage].canvasBreakpoints;
shared.canvasHeights = shared.pages[shared.currentPage].canvasHeights;
shared.activeCanvasIndex = shared.pages[shared.currentPage].activeCanvasIndex;
shared.zoomLevel = shared.pages[shared.currentPage].zoomLevel;
shared.history = shared.pages[shared.currentPage].history;
shared.historyIndex = shared.pages[shared.currentPage].historyIndex;
shared.currentTool = 'select';
shared.currentTriggerIcon = 'ads_click';
shared.triggerIconPropertyMode = null;
shared.propertyStateMode = 'current';
shared.currentProjectFileName = 'project.methal';
shared.projectDirectoryHandle = null;
shared.savedProjectPayload = null;
shared.localImageFiles = new Map();
shared.showOverflow = false;
shared.editingTextLayerId = null;
shared.lastLayerClick = { id: null, time: 0 };
shared.prototypePreviewMode = false;
shared.MIN_ZOOM = 0.1;
shared.MAX_ZOOM = 6;
shared.ZOOM_STEP = 0.05;
shared.canvasWidth = 900;
shared.canvasHeight = 600;
shared.MIN_CANVAS_HEIGHT = 280;
shared.MAX_CANVAS_HEIGHT = 2400;
shared.MAX_HISTORY = 30;
shared.dragData = null;
shared.resizeData = null;
shared.rotateData = null;
shared.canvasResizeData = null;
shared.screenDragData = null;
shared.isDragging = false;
shared.isResizing = false;
shared.isRotating = false;
shared.isCanvasResizing = false;
shared.isScreenDragging = false;
shared.hasCenteredCanvasViewport = false;
shared.layerDragState = null;
shared.layerListDragMoved = false;
shared.layerListAnchorId = null;
shared.contextTargetIds = [];
shared.clipboardLayers = [];

shared.FONT_OPTIONS = [
    { label: 'Arial (Default)', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Inter', value: "'Inter', -apple-system, sans-serif" },
    { label: 'Roboto', value: "'Roboto', sans-serif" },
    { label: 'Poppins', value: "'Poppins', sans-serif" },
    { label: 'Lora', value: "'Lora', serif" },
    { label: 'Merriweather', value: "'Merriweather', serif" },
    { label: 'Montserrat', value: "'Montserrat', sans-serif" },
    { label: 'Playfair Display', value: "'Playfair Display', serif" },
    { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" }
];

shared.THIN_FONT_OPTIONS = [
    'Josefin Sans', 'Lato', 'Libre Franklin', 'Manrope', 'Nunito Sans',
    'Open Sans', 'Raleway', 'Source Sans 3', 'Work Sans', 'DM Sans'
].map(label => ({ label, value: `'${label}', sans-serif`, category: 'Thin' }));

shared.THICK_FONT_OPTIONS = [
    'Archivo Black', 'Bebas Neue', 'Black Han Sans', 'Bowlby One', 'Bungee',
    'Changa One', 'Lilita One', 'Passion One', 'Russo One', 'Titan One'
].map(label => ({ label, value: `'${label}', sans-serif`, category: 'Thick' }));

shared.CORE_FONT_OPTIONS = [...shared.FONT_OPTIONS, ...shared.THIN_FONT_OPTIONS, ...shared.THICK_FONT_OPTIONS];
shared.FONT_OPTIONS = shared.CORE_FONT_OPTIONS.slice();

shared.GOOGLE_FONTS_METADATA_URL = location.protocol === 'http:'
    ? '/api/google-fonts'
    : 'https://fonts.google.com/metadata/fonts';

shared.googleFontsCatalogPromise = null;
shared.googleFontsCatalogReady = false;
shared.ALL_FONTS_BATCH_SIZE = 20;
shared.allFontsVisibleCount = shared.ALL_FONTS_BATCH_SIZE;

document.getElementById('fontPanelSearch')?.addEventListener('input', populateFontPanel);
document.getElementById('allFontsSearch')?.addEventListener('input', () => {
    shared.allFontsVisibleCount = shared.ALL_FONTS_BATCH_SIZE;
    populateAllFontsPanel();
});
document.getElementById('fontPanelSize')?.addEventListener('change', event => updateFontPanelProperty('fontSize', parseFloat(event.target.value)));
document.getElementById('fontPanelWeight')?.addEventListener('change', event => updateFontPanelProperty('fontWeight', event.target.value));
document.getElementById('fontPanelCase')?.addEventListener('change', event => updateFontPanelProperty('textTransform', event.target.value));
document.getElementById('fontPanelColor')?.addEventListener('change', event => updateFontPanelProperty('color', event.target.value));
document.querySelectorAll('#fontPanel [data-text-style]').forEach(button => button.addEventListener('click', () => toggleFontStyle(button)));
document.getElementById('allFontsOverlay')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeAllFontsPanel();
});

loadGoogleFontCatalog();

shared.ROTATE_ZONE_SIZE = 8;

shared.ROTATE_ZONE_STRIPS = [
    { top: `-${shared.ROTATE_ZONE_SIZE}px`, left: `-${shared.ROTATE_ZONE_SIZE}px`, width: `calc(100% + ${shared.ROTATE_ZONE_SIZE * 2}px)`, height: `${shared.ROTATE_ZONE_SIZE}px` },   // top
    { bottom: `-${shared.ROTATE_ZONE_SIZE}px`, left: `-${shared.ROTATE_ZONE_SIZE}px`, width: `calc(100% + ${shared.ROTATE_ZONE_SIZE * 2}px)`, height: `${shared.ROTATE_ZONE_SIZE}px` }, // bottom
    { top: `-${shared.ROTATE_ZONE_SIZE}px`, left: `-${shared.ROTATE_ZONE_SIZE}px`, width: `${shared.ROTATE_ZONE_SIZE}px`, height: `calc(100% + ${shared.ROTATE_ZONE_SIZE * 2}px)` },   // left
    { top: `-${shared.ROTATE_ZONE_SIZE}px`, right: `-${shared.ROTATE_ZONE_SIZE}px`, width: `${shared.ROTATE_ZONE_SIZE}px`, height: `calc(100% + ${shared.ROTATE_ZONE_SIZE * 2}px)` }, // right
];

shared.RESIZE_HANDLES = [
    { pos: 'nw', cursor: 'nwse-resize', top: '-7px', left: '-7px' },
    { pos: 'n', cursor: 'ns-resize', top: '-7px', left: '50%', marginLeft: '-6px' },
    { pos: 'ne', cursor: 'nesw-resize', top: '-7px', right: '-7px' },
    { pos: 'e', cursor: 'ew-resize', top: '50%', right: '-7px', marginTop: '-6px' },
    { pos: 'se', cursor: 'nwse-resize', bottom: '-7px', right: '-7px' },
    { pos: 's', cursor: 'ns-resize', bottom: '-7px', left: '50%', marginLeft: '-6px' },
    { pos: 'sw', cursor: 'nesw-resize', bottom: '-7px', left: '-7px' },
    { pos: 'w', cursor: 'ew-resize', top: '50%', left: '-7px', marginTop: '-6px' }
];

shared.TEXT_PAD_X = 2;
shared.TEXT_PAD_Y = 2;

shared.LAYER_VARIANT_KEYS = [
    'x', 'y', 'width', 'height', 'rotation', 'visible', 'opacity',
    'content', 'color', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
    'textDecoration', 'textAlign', 'backgroundColor',
    'borderRadius', 'src', 'textTransform', 'positionEnabled',
    'positionMode', 'lockAspect', 'borderStyle', 'borderThickness',
    'borderColor', 'backgroundEnabled', 'linkType', 'linkUrl',
    'linkTargetId', 'collapsed', 'groupType', 'flexBind', 'itemCount', 'itemDirection',
    'itemPadding', 'itemDivider', 'itemDividers', 'itemNames', 'itemAnchors', 'useItemAnchors'
];

document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'n' && e.shiftKey) {
        e.preventDefault();
        newProject(false);
        return;
    }
    if (key === 'n') {
        e.preventDefault();
        newPage();
        return;
    }
    if (key === 's') {
        e.preventDefault();
        saveProjectFile(e.shiftKey);
        return;
    }
    if (key === '+' || e.key === '=') {
        e.preventDefault();
        zoomCanvas(shared.ZOOM_STEP);
    } else if (e.key === '-') {
        e.preventDefault();
        zoomCanvas(-shared.ZOOM_STEP);
    } else if (e.key === '0') {
        e.preventDefault();
        shared.zoomLevel = 1;
        render();
        updateStatus('Zoom reset');
    }
});

document.addEventListener('click', (e) => {
    const fileMenu = document.getElementById('fileMenu');
    const fileButton = document.getElementById('fileMenuButton');
    if (!fileMenu || !fileButton) return;
    if (!fileMenu.contains(e.target) && !fileButton.contains(e.target)) {
        hideFileMenu();
    }
});

shared.canvasWrapperEl = document.querySelector('.canvas-wrapper');
if (shared.canvasWrapperEl) {
    // Keep two-finger horizontal swipes inside the editor so they scroll
    // the canvas viewport instead of triggering browser history nav.
    shared.canvasWrapperEl.addEventListener('wheel', (e) => {
        const isPinchGesture = e.ctrlKey || e.metaKey;
        if (isPinchGesture) return;

        const hasHorizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) || Math.abs(e.deltaX) > 0.5;
        if (!hasHorizontalIntent) return;

        shared.canvasWrapperEl.scrollLeft += e.deltaX;
        if (Math.abs(e.deltaY) > 0.5) {
            shared.canvasWrapperEl.scrollTop += e.deltaY;
        }
        e.preventDefault();
    }, { passive: false });

    shared.canvasWrapperEl.addEventListener('wheel', (e) => {
        const isPinchGesture = e.ctrlKey || e.metaKey;
        const isWheelDialZoom = e.shiftKey;
        if (!isPinchGesture && !isWheelDialZoom) return;

        const zoomDelta = e.deltaY < 0 ? shared.ZOOM_STEP * 0.8 : -shared.ZOOM_STEP * 0.8;
        const anchor = { x: e.clientX, y: e.clientY };
        zoomCanvas(zoomDelta, anchor);
        e.preventDefault();
    }, { passive: false });
}

window.addEventListener('resize', () => {
    positionExperimentPanel();
    positionPrototypePreviewPanel();
    positionItemsPanel();
});

// The first paint is the earliest point at which the flex layout,
// scrollbars, and canvas dimensions are all reliable.
window.addEventListener('load', () => {
    requestAnimationFrame(() => centerCanvasViewport(true));
}, { once: true });

document.querySelectorAll('.tab-item').forEach(wirePageTab);

shared.itemsPanelMode = 'new';
shared.contextMenu = document.getElementById('contextMenu');
shared.pageTabContextMenuPage = null;

shared.defaultContextMenuHtml = `
    <div class="context-item" onclick="contextAction('group')"><span class="material-symbols-outlined">select_all</span>Group</div>
    <div class="context-item" onclick="contextAction('ungroup')"><span class="material-symbols-outlined">deselect</span>Ungroup</div>
    <div class="context-divider"></div>
    <div class="context-item" onclick="contextAction('duplicate')"><span class="material-symbols-outlined">content_copy</span>Duplicate</div>
    <div class="context-item" onclick="event.stopPropagation(); contextAction('includeIn')"><span class="material-symbols-outlined">add_box</span>Include in…</div>
    <div class="context-item" id="prototypeAction" onclick="contextAction('prototype')"><span class="material-symbols-outlined">smart_button</span>Prototype…</div>
    <div class="context-divider"></div>
    <div class="context-item" onclick="contextAction('bindLayout')"><span class="material-symbols-outlined">dashboard_customize</span>Bind Layout (Flex)…</div>
    <div class="context-item" onclick="contextAction('unbindLayout')"><span class="material-symbols-outlined">link_off</span>Unbind Layout</div>
    <div class="context-divider"></div>
    <div class="context-item" onclick="contextAction('alignLeft')"><span class="material-symbols-outlined">format_align_left</span>Align Left</div>
    <div class="context-item" onclick="contextAction('alignRight')"><span class="material-symbols-outlined">format_align_right</span>Align Right</div>
    <div class="context-item" onclick="contextAction('alignTop')"><span class="material-symbols-outlined">vertical_align_top</span>Align Top</div>
    <div class="context-item" onclick="contextAction('alignBottom')"><span class="material-symbols-outlined">vertical_align_bottom</span>Align Bottom</div>
    <div class="context-item" onclick="contextAction('alignCenter')"><span class="material-symbols-outlined">center_focus_strong</span>Align Center</div>
    <div class="context-divider"></div>
    <div class="context-item" onclick="contextAction('hide')"><span class="material-symbols-outlined">visibility_off</span>Hide</div>
    <div class="context-item" onclick="contextAction('show')"><span class="material-symbols-outlined">visibility</span>Show</div>
    <div class="context-divider"></div>
    <div class="context-item" onclick="contextAction('rename')"><span class="material-symbols-outlined">edit</span>Rename Layer</div>
    <div class="context-item" onclick="contextAction('textUpper')"><span class="material-symbols-outlined">format_size</span>Uppercase</div>
    <div class="context-item" onclick="contextAction('textLower')"><span class="material-symbols-outlined">text_fields</span>Lowercase</div>
    <div class="context-item" onclick="contextAction('textCamel')"><span class="material-symbols-outlined">title</span>Camel Case</div>
    <div class="context-item" onclick="contextAction('editGroupName')"><span class="material-symbols-outlined">drive_file_rename_outline</span>Edit Group Name</div>
    <div class="context-item" onclick="contextAction('groupFeatures')"><span class="material-symbols-outlined">settings_suggest</span>Group Features…</div>
`;

document.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.tab-item');
    if (tab) {
        e.preventDefault();
        e.stopPropagation();
        openPageTabContextMenu(tab.dataset.page, e.clientX, e.clientY);
        return;
    }

    // If right clicking on canvas background
    if (e.target.id === 'canvas' || e.target.closest('.canvas-wrapper')) {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY);
        return;
    }
});

// Close menu when clicking away
document.addEventListener('click', (e) => {
    const eventPath = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const isInsideContextMenu = e.target.closest('.context-menu');
    const isInsidePrototypePanel = e.target.closest('#prototypePanel');
    const isInsideFlexPanel = e.target.closest('.flex-panel');
    const isInsideGroupFeaturesPanel = e.target.closest('.group-features-panel');
    const isInsidePrototypePreviewPanel = e.target.closest('#prototypePreviewPanel');
    const isInsideItemsPanel = e.target.closest('#itemsPanel') || eventPath.includes(document.getElementById('itemsPanel'));
    const isPrototypeTrigger = e.target.closest('.trigger-layer');

    if (!isInsideContextMenu && !isInsidePrototypePanel && !isInsideFlexPanel && !isInsideGroupFeaturesPanel && !isInsidePrototypePreviewPanel && !isPrototypeTrigger) {
        closeContextMenu();
    }
    if (!e.target.closest('.layer-opacity-popover') && !e.target.closest('.layer-opacity-toggle')) {
        document.querySelectorAll('.layer-opacity-popover').forEach(pop => pop.classList.remove('active'));
    }
    if (!e.target.closest('.layer-eye-panel') && !e.target.closest('.layer-visibility-toggle')) {
        document.querySelectorAll('.layer-eye-panel').forEach(pop => pop.classList.remove('active'));
    }
    if (!e.target.closest('#experimentPanel') && !e.target.closest('#experimentToggle')) {
        closeExperimentPanel();
    }
    if (!e.target.closest('#prototypePreviewPanel') && !e.target.closest('#prototypeToggle')) {
        closePrototypePreviewPanel();
    }
    if (!isInsideItemsPanel && !e.target.closest('.tool-btn[data-tool="component"]')) {
        closeItemsSetup();
    }
});

document.getElementById('canvasHeightInput').addEventListener('change', (e) => {
    applyCanvasHeight(e.target.value, 'Canvas height');
});

document.getElementById('canvasHeightInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        applyCanvasHeight(e.currentTarget.value, 'Canvas height');
        closeExperimentPanel();
    }
});

document.getElementById('breakpointInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addCanvasBreakpointFromInput();
    }
});

document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isTextEntry = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (isTextEntry) return;

    // Tool/panel shortcuts - these double as browser-shortcut overrides
    // (Ctrl+R reload, Ctrl+O open, Ctrl+P print, Ctrl+L address bar, etc.)
    // so we must preventDefault unconditionally, even outside the canvas.
    if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'r') { e.preventDefault(); setTool('rect'); return; }
        if (key === 'o') { e.preventDefault(); setTool('circle'); return; }
        if (key === 't') { e.preventDefault(); setTool('text'); return; }
        if (key === 'i') { e.preventDefault(); setTool('image'); return; }
        if (key === '0') { e.preventDefault(); toggleOverflow(); return; }
        if (key === 'p') { e.preventDefault(); setSidebarTab('properties'); return; }
        if (key === 'l') { e.preventDefault(); setSidebarTab('layers'); return; }
    }

    // Plain (no-modifier) single-key tool shortcuts, Figma-style. Ctrl+T
    // specifically can't be overridden in any browser - it's a reserved
    // "new tab" shortcut at the OS/browser-chrome level, never delivered
    // to page JS - so this is the reliable way to reach the text tool.
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'v') { setTool('select'); return; }
        if (key === 'r') { setTool('rect'); return; }
        if (key === 'o') { setTool('circle'); return; }
        if (key === 't') { setTool('text'); return; }
        if (key === 'i') { setTool('image'); return; }
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;

        if (e.key === 'ArrowLeft' || e.key === '<' || (e.key === ',' && e.shiftKey)) dx = -step;
        else if (e.key === 'ArrowRight' || e.key === '>' || (e.key === '.' && e.shiftKey)) dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;

        if (dx !== 0 || dy !== 0) {
            e.preventDefault();
            if (nudgeSelectedLayers(dx, dy)) {
                saveHistory();
                updateStatus(`Moved ${shared.selectedIds.length} layer${shared.selectedIds.length === 1 ? '' : 's'}`);
            }
            return;
        }
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
        return;
    }
    if (e.key === 'Escape') {
        setTool('select');
        closeExperimentPanel();
        shared.selectedIds = [];
        render();
        updateStatus('Selection cleared');
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (e.shiftKey) {
            duplicateSelected();
        } else {
            copySelected();
        }
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteSelected();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
    }
});

shared.lastContextMenuPos = { x: 0, y: 0 };
shared.PROTOTYPE_ACTIVE_CLASS = 'proto-active';
shared.DEFAULT_PROTOTYPE_TRANSITION = 0.45;
shared.prototypePanelGroupId = null;
shared.prototypePanel = document.getElementById('prototypePanel');

shared.FALLBACK_TRIGGER_ICONS = [
    'ads_click', 'smart_button', 'menu', 'close', 'add', 'remove',
    'expand_more', 'expand_less', 'arrow_drop_down', 'more_vert',
    'touch_app', 'radio_button_checked', 'toggle_on', 'auto_awesome',
    'gesture', 'swipe_left', 'play_arrow', 'playlist_play', 'notifications'
];

shared.SOCIAL_TRIGGER_ICONS = [
    'facebook', 'instagram', 'youtube', 'linkedin', 'x', 'tiktok',
    'github', 'discord', 'whatsapp', 'pinterest', 'reddit', 'twitch'
].map(name => `social:${name}`);

shared.MATERIAL_SYMBOLS_CODEPOINTS_URL = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';
shared.triggerIconCatalog = [...shared.FALLBACK_TRIGGER_ICONS, ...shared.SOCIAL_TRIGGER_ICONS];
shared.triggerIconCatalogPromise = null;
shared.triggerIconSearch = document.getElementById('triggerIconSearch');
if (shared.triggerIconSearch) {
    shared.triggerIconSearch.addEventListener('input', populateTriggerIconPicker);
}

shared.prototypePanel.querySelectorAll('[data-proto-key]').forEach(btn => {
    btn.addEventListener('click', () => {
        const group = getLayer(shared.prototypePanelGroupId);
        if (!group) return;
        ensureGroupPrototype(group);
        group.prototypeEnabled = btn.getAttribute('data-proto-value') === 'true';
        if (!group.prototypeEnabled) {
            shared.prototypePreviewMode = false;
            closePrototypePreviewPanel();
        }
        saveHistory();
        render();
        updatePrototypePanelUI();
    });
});

shared.prototypePanel.querySelector('[data-proto-trigger="layer"]').addEventListener('change', (e) => {
    const group = getLayer(shared.prototypePanelGroupId);
    if (!group) return;
    ensureGroupPrototype(group);
    const nextValue = e.target.value ? Number(e.target.value) : null;
    group.prototypeTriggerId = nextValue;
    saveHistory();
    render();
});

shared.prototypePanel.querySelectorAll('[data-proto-state]').forEach(input => {
    input.addEventListener('change', () => {
        const group = getLayer(shared.prototypePanelGroupId);
        if (!group) return;
        ensureGroupPrototype(group);
        const stateName = input.getAttribute('data-proto-state');
        const prop = input.getAttribute('data-proto-state-prop');
        group.prototypeStates[stateName][prop] = input.value;
        saveHistory();
        render();
    });
});

shared.transitionSlider = shared.prototypePanel.querySelector('[data-proto-transition]');
if (shared.transitionSlider) {
    shared.transitionSlider.addEventListener('input', () => {
        const group = getLayer(shared.prototypePanelGroupId);
        if (!group) return;
        ensureGroupPrototype(group);
        const nextValue = parseFloat(shared.transitionSlider.value);
        group.prototypeTransition = Number.isFinite(nextValue) ? nextValue : shared.DEFAULT_PROTOTYPE_TRANSITION;
        const valueLabel = shared.transitionSlider.parentElement?.querySelector('.prop-range-value');
        if (valueLabel) valueLabel.textContent = `${Number(group.prototypeTransition).toFixed(2)}s`;
        render();
    });

    shared.transitionSlider.addEventListener('change', () => {
        const group = getLayer(shared.prototypePanelGroupId);
        if (!group) return;
        ensureGroupPrototype(group);
        const nextValue = parseFloat(shared.transitionSlider.value);
        group.prototypeTransition = Number.isFinite(nextValue) ? nextValue : shared.DEFAULT_PROTOTYPE_TRANSITION;
        saveHistory();
        render();
    });
}

document.addEventListener('click', (e) => {
    const clickedInsidePrototypePanel = e.target.closest('#prototypePanel');
    const clickedPrototypeTrigger = e.target.closest('.trigger-layer');
    if (shared.prototypePanel.classList.contains('active') && !clickedInsidePrototypePanel && !clickedPrototypeTrigger && !e.target.closest('.context-menu')) {
        closePrototypePanel();
    }
});

shared.prototypePanel.addEventListener('click', (e) => {
    if (e.target.closest('.panel-close-btn')) {
        e.stopPropagation();
        closePrototypePanel();
    }
});

shared.flexPanelGroupId = null;
shared.flexPanel = document.getElementById('flexPanel');
shared.groupFeaturesPanel = document.getElementById('groupFeaturesPanel');
shared.groupFeaturesPanelGroupId = null;

shared.flexPanel.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
        const group = getLayer(shared.flexPanelGroupId);
        if (!group || !group.flexBind) return;
        const key = btn.getAttribute('data-key');
        const val = btn.getAttribute('data-value');
        group.flexBind = callBusinessApiSync('validate-flex', {
            flexBind: { ...group.flexBind, [key]: val }
        }).flexBind;
        saveHistory();
        render();
        updateFlexPanelUI();
    });
});

shared.groupFeaturesPanel.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
        const group = getLayer(shared.groupFeaturesPanelGroupId);
        if (!group) return;
        const key = btn.getAttribute('data-key');
        const value = btn.getAttribute('data-value');
        if (key === 'backgroundEnabled') {
            group.backgroundEnabled = value === 'true';
        } else {
            group[key] = value;
        }
        if (key === 'linkType' && value === 'website' && group.linkUrl) {
            group.linkUrl = normalizeWebsiteUrl(group.linkUrl);
        }
        saveHistory();
        render();
        updateGroupFeaturesPanelUI();
    });
});

shared.groupFeaturesPanel.querySelectorAll('[data-prop]').forEach(input => {
    input.addEventListener('change', () => {
        const group = getLayer(shared.groupFeaturesPanelGroupId);
        if (!group) return;
        const prop = input.getAttribute('data-prop');
        if (prop === 'borderThickness') group.borderThickness = parseInt(input.value, 10) || 0;
        else if (prop === 'borderColor') group.borderColor = input.value;
        else if (prop === 'backgroundColor') group.backgroundColor = input.value;
        else if (prop === 'linkUrl') {
            group.linkUrl = input.value;
            if (group.linkType === 'website') {
                group.linkUrl = normalizeWebsiteUrl(group.linkUrl);
            }
        } else if (prop === 'linkTargetId') group.linkTargetId = input.value;
        saveHistory();
        render();
    });
});

// Close the panel on an outside click, same convention as the context menu.
document.addEventListener('click', (e) => {
    if (shared.flexPanel.classList.contains('active') && !e.target.closest('.flex-panel') && !e.target.closest('.context-menu')) {
        closeFlexPanel();
    }
    if (shared.groupFeaturesPanel.classList.contains('active') && !e.target.closest('.group-features-panel') && !e.target.closest('.context-menu')) {
        closeGroupFeaturesPanel();
    }
});

document.addEventListener('pointermove', (e) => {
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();

    if (shared.isScreenDragging && shared.screenDragData && e.pointerId === shared.screenDragData.pointerId) {
        const deltaX = (e.clientX - shared.screenDragData.startClientX) / shared.zoomLevel;
        shared.screenDragData.rootSnapshots.forEach(snapshot => {
            const layer = getLayer(snapshot.id);
            if (!layer) return;
            layer.x = snapshot.startX + deltaX;
            syncLayerElement(layer);
        });
        e.preventDefault();
    }

    if (shared.isCanvasResizing && shared.canvasResizeData && e.pointerId === shared.canvasResizeData.pointerId) {
        const visualDeltaY = e.clientY - shared.canvasResizeData.startY;
        const normalizedDeltaY = visualDeltaY / shared.zoomLevel;
        shared.canvasHeight = clampCanvasHeight(shared.canvasResizeData.startHeight + normalizedDeltaY);
        shared.canvasHeights[shared.activeCanvasIndex] = shared.canvasHeight;
        render();
        updateStatus(`Canvas height: ${Math.round(shared.canvasHeight)}px`);
        e.preventDefault();
    }

    if (shared.isDragging && shared.dragData && e.pointerId === shared.dragData.pointerId) {
        const curPoint = getCanvasPoint(e);
        const deltaX = curPoint.x - shared.dragData.startPointerX;
        const deltaY = curPoint.y - shared.dragData.startPointerY;

        shared.dragData.ids.forEach(id => {
            const l = getLayer(id);
            const orig = shared.dragData.originalPositions[id];
            if (l && orig) {
                // A layer's x/y live in its immediate parent's local box. If
                // that parent (or an ancestor) is rotated, an on-screen pointer
                // delta doesn't map 1:1 onto local x/y anymore - rotate the
                // delta backwards by the accumulated ancestor rotation first so
                // dragging still tracks the pointer correctly.
                const ancestorRot = getAncestorRotation(l) * Math.PI / 180;
                const cos = Math.cos(-ancestorRot), sin = Math.sin(-ancestorRot);
                const localDX = deltaX * cos - deltaY * sin;
                const localDY = deltaX * sin + deltaY * cos;
                l.x = orig.x + localDX;
                l.y = orig.y + localDY;
                syncLayerElement(l);
            }
        });
        e.preventDefault();
    }

    if (shared.isResizing && shared.resizeData && e.pointerId === shared.resizeData.pointerId) {
        const l = getLayer(shared.resizeData.id);
        if (!l) return;

        // Handles are drawn on a rotated box, so their screen-space drag
        // direction doesn't line up with local x/y/w/h unless we un-rotate
        // it first - same idea as the ancestor-rotation compensation used
        // for dragging, but here it also has to include the layer's OWN
        // rotation (the handles move with it, not just their parent's).
        const totalRot = (getAncestorRotation(l) + (l.rotation || 0)) * Math.PI / 180;
        const rawDX = (e.clientX - shared.resizeData.startX) / shared.zoomLevel;
        const rawDY = (e.clientY - shared.resizeData.startY) / shared.zoomLevel;
        const cos = Math.cos(-totalRot), sin = Math.sin(-totalRot);
        const localDX = rawDX * cos - rawDY * sin;
        const localDY = rawDX * sin + rawDY * cos;

        const handlePos = shared.resizeData.handlePos;
        const locked = !!l.lockAspect;

        // Locked = grows/shrinks proportionally from any handle - for
        // text this scales the font and re-fits the box to hug it
        // exactly. Unlocked = freeform - a corner stretches both
        // dimensions independently, an edge handle adjusts just that
        // one side, and for text the font stays put while the box
        // (and its wrapping) is resized by hand.
        const box = callBusinessApiSync('resize', {
            layer: { ...l, x: shared.resizeData.startXPos, y: shared.resizeData.startYPos, width: shared.resizeData.startW, height: shared.resizeData.startH },
            handlePos,
            localDX,
            localDY,
            locked
        });
        l.x = box.x; l.y = box.y; l.width = box.width; l.height = box.height;

        if ((l.type === 'text' || l.type === 'trigger') && locked) {
            const scale = box.width / shared.resizeData.startW; // uniform when locked, by construction
            l.fontSize = Math.max(6, Math.round(shared.resizeData.startFontSize * scale));
            // Re-measure the box to the new font's exact metrics right
            // after, so the handles land exactly on the text's own
            // edges instead of drifting from the scale-math approximation.
            if (l.type === 'text') {
                fitTextBox(l);
                const fitBox = callBusinessApiSync('resize', {
                    layer: { ...l, x: shared.resizeData.startXPos, y: shared.resizeData.startYPos, width: shared.resizeData.startW, height: shared.resizeData.startH },
                    handlePos,
                    dW: l.width - shared.resizeData.startW,
                    dH: l.height - shared.resizeData.startH,
                    locked: false
                });
                l.x = fitBox.x; l.y = fitBox.y;
            } else {
                fitTriggerBox(l, handlePos);
            }
        }

        // If resizing a non-flex-bound group, scale its children proportionally - always
        // relative to the snapshot taken at resize-start, never relative to
        // their current (mid-drag) values, or the scale would compound.
        if (shared.resizeData.isGroup && shared.resizeData.childrenSnapshot && !shared.resizeData.isFlexGroup) {
            const scaleX = l.width / shared.resizeData.startW;
            const scaleY = l.height / shared.resizeData.startH;
            const uniform = Math.abs(scaleX - scaleY) < 1e-6;
            shared.resizeData.childrenSnapshot.forEach(snap => {
                const child = getLayer(snap.id);
                if (!child) return;
                child.x = snap.x * scaleX;
                child.y = snap.y * scaleY;
                child.width = snap.width * scaleX;
                child.height = snap.height * scaleY;
                // Only scale a LOCKED text child's font (autofit) -
                // uniform group scale uses that factor directly, a
                // non-uniform one uses the average so the font doesn't
                // stretch on one axis only. An unlocked text child is
                // freeform, same as any shape: its box just stretches,
                // font untouched.
                if ((child.type === 'text' || child.type === 'trigger') && child.lockAspect) {
                    const textScale = uniform ? scaleX : Math.sqrt(scaleX * scaleY);
                    child.fontSize = Math.max(6, Math.round((snap.fontSize || 16) * textScale));
                    if (child.type === 'text') fitTextBox(child); // re-measure to the new font's exact metrics
                }
                syncLayerElement(child);
            });
        }

        syncLayerElement(l);
        e.preventDefault();
    }

    if (shared.isRotating && shared.rotateData && e.pointerId === shared.rotateData.pointerId) {
        const l = getLayer(shared.rotateData.id);
        if (!l) return;

        const currentAngle = Math.atan2(e.clientY - shared.rotateData.centerY, e.clientX - shared.rotateData.centerX) * (180 / Math.PI);
        const delta = currentAngle - shared.rotateData.startAngle;
        let newRotation = shared.rotateData.startRotation + delta;
        // Snap to 15° increments when shift is held, for easy straight/45° angles
        if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
        l.rotation = Math.round(newRotation);
        syncLayerElement(l);
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('pointerup', (e) => {
    if (shared.isScreenDragging && shared.screenDragData && e.pointerId === shared.screenDragData.pointerId) {
        shared.isScreenDragging = false;
        shared.screenDragData = null;
        saveHistory();
        render();
        updateStatus('Screen moved');
    }

    if (shared.isCanvasResizing && shared.canvasResizeData && e.pointerId === shared.canvasResizeData.pointerId) {
        shared.isCanvasResizing = false;
        shared.canvasResizeData = null;
        document.getElementById('canvas').classList.remove('resizing-canvas');
        updateStatus(`Canvas resized: ${shared.canvasWidth} x ${Math.round(shared.canvasHeight)}`);
        render();
    }

    if ((shared.isDragging && shared.dragData && e.pointerId === shared.dragData.pointerId) ||
        (shared.isResizing && shared.resizeData && e.pointerId === shared.resizeData.pointerId) ||
        (shared.isRotating && shared.rotateData && e.pointerId === shared.rotateData.pointerId)) {

        // If what just moved/resized/rotated was a child living inside a
        // group (not the group itself), re-fit that group's box so its
        // outline still tightly matches its contents.
        const parentsToRecalc = new Set();
        if (shared.isDragging && shared.dragData) {
            shared.dragData.ids.forEach(id => {
                const l = getLayer(id);
                if (l && l.parentId !== null) parentsToRecalc.add(l.parentId);
            });
        }
        if (shared.isResizing && shared.resizeData && !shared.resizeData.isGroup) {
            const l = getLayer(shared.resizeData.id);
            if (l && l.parentId !== null) parentsToRecalc.add(l.parentId);
        }
        if (shared.isRotating && shared.rotateData) {
            const l = getLayer(shared.rotateData.id);
            if (l && l.parentId !== null) parentsToRecalc.add(l.parentId);
        }
        const pendingBounds = [...parentsToRecalc].map(pid => recalcGroupBoundsAsync(pid));
        shared.isDragging = false; shared.isResizing = false; shared.isRotating = false;
        shared.dragData = null; shared.resizeData = null; shared.rotateData = null;
        render(); // drop the "dragging"/"resizing"/"rotating" lift state

        Promise.all(pendingBounds)
            .then(() => {
                saveHistory();
                render();
                updateStatus('Layout updated');
            })
            .catch(error => updateStatus(error.message));
    }
});
document.addEventListener('pointercancel', (e) => {
    if (shared.isScreenDragging && shared.screenDragData && e.pointerId === shared.screenDragData.pointerId) {
        shared.isScreenDragging = false;
        shared.screenDragData = null;
        render();
    }

    if (shared.isCanvasResizing && shared.canvasResizeData && e.pointerId === shared.canvasResizeData.pointerId) {
        shared.isCanvasResizing = false;
        shared.canvasResizeData = null;
        document.getElementById('canvas').classList.remove('resizing-canvas');
        render();
    }

    if ((shared.isDragging && shared.dragData && e.pointerId === shared.dragData.pointerId) ||
        (shared.isResizing && shared.resizeData && e.pointerId === shared.resizeData.pointerId) ||
        (shared.isRotating && shared.rotateData && e.pointerId === shared.rotateData.pointerId)) {
        shared.isDragging = false; shared.isResizing = false; shared.isRotating = false;
        shared.dragData = null; shared.resizeData = null; shared.rotateData = null;
        render();
    }
});

shared.sketchData = null;
shared.pendingImageBox = null;
shared.PREVIEW_CLASS = { rect: 'rect-preview', circle: 'circle-preview', text: 'text-preview', image: 'image-preview', trigger: 'trigger-preview' };
shared.DEFAULT_SIZE = { rect: [120, 80], circle: [120, 120], text: [200, 50], image: [160, 120], component: [360, 48], trigger: [42, 42] };
shared.MIN_SKETCH = 10;

document.getElementById('canvas').addEventListener('pointerdown', (e) => {
    if (shared.currentTool === 'select' || shared.currentTool === 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.resize-handle') || e.target.closest('.rotate-zone') || e.target.closest('.canvas-resize-tip') || e.target.closest('.canvas-screen-handle')) return;

    const point = getCanvasPoint(e);
    const startX = point.x;
    const startY = point.y;

    const previewEl = document.createElement('div');
    previewEl.className = 'sketch-preview ' + (shared.PREVIEW_CLASS[shared.currentTool] || 'rect-preview');
    previewEl.style.left = startX + 'px';
    previewEl.style.top = startY + 'px';
    previewEl.style.width = '0px';
    previewEl.style.height = '0px';
    document.getElementById('canvas').appendChild(previewEl);

    shared.sketchData = { pointerId: e.pointerId, type: shared.currentTool, startX, startY, curX: startX, curY: startY, previewEl };
    e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
    if (!shared.sketchData || e.pointerId !== shared.sketchData.pointerId) return;
    const point = getCanvasPoint(e);
    shared.sketchData.curX = point.x;
    shared.sketchData.curY = point.y;

    const x = Math.min(shared.sketchData.startX, shared.sketchData.curX);
    const y = Math.min(shared.sketchData.startY, shared.sketchData.curY);
    const w = Math.abs(shared.sketchData.curX - shared.sketchData.startX);
    const h = Math.abs(shared.sketchData.curY - shared.sketchData.startY);
    shared.sketchData.previewEl.style.left = x + 'px';
    shared.sketchData.previewEl.style.top = y + 'px';
    shared.sketchData.previewEl.style.width = w + 'px';
    shared.sketchData.previewEl.style.height = h + 'px';
    e.preventDefault();
}, { passive: false });

document.addEventListener('pointerup', (e) => {
    if (!shared.sketchData || e.pointerId !== shared.sketchData.pointerId) return;
    const { type, startX, startY, curX, curY, previewEl } = shared.sketchData;
    previewEl.remove();
    shared.sketchData = null;

    let x = Math.min(startX, curX), y = Math.min(startY, curY);
    let w = Math.abs(curX - startX), h = Math.abs(curY - startY);

    if (w < shared.MIN_SKETCH || h < shared.MIN_SKETCH) {
        // Too small to have been an intentional drag - treat like a tap and
        // drop a default-sized shape centered on the click point instead.
        const [dw, dh] = shared.DEFAULT_SIZE[type] || [120, 80];
        w = dw; h = dh;
        x = startX - w / 2; y = startY - h / 2;
    }
    x = Math.max(0, x); y = Math.max(0, y);

    if (type === 'image') {
        shared.pendingImageBox = { x, y, width: w, height: h };
        document.getElementById('imageSourceModal').classList.add('active');
    } else if (type === 'trigger') {
        addLayer('trigger', { x, y, width: w, height: h, icon: shared.currentTriggerIcon });
    } else {
        addLayer(type, { x, y, width: w, height: h });
    }
});

document.addEventListener('pointermove', (e) => {
    if (!shared.layerDragState || e.pointerId !== shared.layerDragState.pointerId) return;

    if (!shared.layerDragState.moved) {
        const dx = e.clientX - shared.layerDragState.startX;
        const dy = e.clientY - shared.layerDragState.startY;
        if (Math.hypot(dx, dy) < 4) return; // small jitter - let it resolve as a tap/click
        shared.layerDragState.moved = true;
        shared.layerListDragMoved = true;
        shared.layerDragState.item.classList.add('drag-preview');
        updateStatus('Reordering layer…');
    }

    clearDropIndicators();
    const items = Array.from(document.querySelectorAll('.layer-item'))
        .filter(el => String(el.dataset.id) !== String(shared.layerDragState.layerId));

    let closest = null;
    let closestDist = Infinity;
    let closestPos = 'after';

    items.forEach(el => {
        const r = el.getBoundingClientRect();
        const mid = r.top + (r.height / 2);
        const dist = Math.abs(e.clientY - mid);
        if (dist < closestDist) {
            closestDist = dist;
            closest = el;
            closestPos = e.clientY <= mid ? 'before' : 'after';
        }
    });

    if (closest) {
        const list = document.getElementById('layerList');
        if (list) {
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            const listRect = list.getBoundingClientRect();
            const closestRect = closest.getBoundingClientRect();
            const lineY = closestPos === 'before'
                ? closestRect.top - listRect.top
                : closestRect.bottom - listRect.top;
            indicator.style.top = `${Math.max(0, lineY)}px`;
            list.appendChild(indicator);
        }
        shared.layerDragState.targetId = parseInt(closest.dataset.id, 10);
        shared.layerDragState.position = closestPos;
    } else {
        shared.layerDragState.targetId = null;
        shared.layerDragState.position = null;
    }
    e.preventDefault();
}, { passive: false });

document.addEventListener('pointerup', (e) => {
    if (!shared.layerDragState || e.pointerId !== shared.layerDragState.pointerId) return;
    clearDropIndicators();
    if (shared.layerDragState.item) shared.layerDragState.item.classList.remove('drag-preview');

    if (shared.layerDragState.moved && shared.layerDragState.targetId !== null) {
        const changed = reorderLayer(shared.layerDragState.layerId, shared.layerDragState.targetId, shared.layerDragState.position);
        if (changed) {
            saveHistory();
            render();
            updateStatus('Layer order updated');
        }
    }
    shared.layerDragState = null;
    // Let the following synthetic click (if any) fire first, then re-enable clicks
    setTimeout(() => { shared.layerListDragMoved = false; }, 0);
});

document.addEventListener('pointercancel', (e) => {
    if (!shared.layerDragState || e.pointerId !== shared.layerDragState.pointerId) return;
    clearDropIndicators();
    if (shared.layerDragState.item) shared.layerDragState.item.classList.remove('drag-preview');
    shared.layerDragState = null;
    shared.layerListDragMoved = false;
});

document.getElementById('exportModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeExport(); });

// ============================================================
// INIT DEMO
// ============================================================
addLayer('rect');
shared.l1 = getLayer(1);
if (shared.l1) { shared.l1.x = 50; shared.l1.y = 50; shared.l1.width = 200; shared.l1.height = 150; shared.l1.name = 'Hero Box'; shared.l1.backgroundColor = '#3b82f6'; }

addLayer('text');
shared.l2 = getLayer(2);
if (shared.l2) {
    shared.l2.x = 80; shared.l2.y = 80; shared.l2.content = 'Zero Handoff'; shared.l2.color = '#ffffff'; shared.l2.fontSize = 28; shared.l2.name = 'Main Title';
    fitTextBox(shared.l2); // content/fontSize changed after creation - must re-fit, or the box stays sized for the placeholder text
}

addLayer('circle');
shared.l3 = getLayer(3);
if (shared.l3) { shared.l3.x = 600; shared.l3.y = 50; shared.l3.width = 150; shared.l3.height = 150; shared.l3.backgroundColor = '#10b981'; shared.l3.name = 'Avatar'; }

[shared.l1, shared.l2, shared.l3].filter(Boolean).forEach(layer => {
    captureLayerVariant(layer, shared.activeCanvasIndex);
});

// Setup initial history
persistCurrentCanvasLayerState();
shared.history = [JSON.stringify(shared.layers)];
shared.historyIndex = 0;
render();
updateStatus('Ready - Select layers, Right-click for menu');

finishAppLoading();

Object.assign(window, {
    activateCanvasLayerState: activateCanvasLayerState,
    addCanvasBreakpoint: addCanvasBreakpoint,
    addCanvasBreakpointFromInput: addCanvasBreakpointFromInput,
    addLayer: addLayer,
    alignSelectedInGroup: alignSelectedInGroup,
    applyCanvasHeight: applyCanvasHeight,
    applyLayerVariant: applyLayerVariant,
    applyProjectToEditor: applyProjectToEditor,
    applyTextTransform: applyTextTransform,
    callBusinessApi: callBusinessApi,
    callBusinessApiSync: callBusinessApiSync,
    captureLayerVariant: captureLayerVariant,
    centerCanvasViewport: centerCanvasViewport,
    chooseImageLink: chooseImageLink,
    chooseImageUpload: chooseImageUpload,
    clampCanvasHeight: clampCanvasHeight,
    clampZoom: clampZoom,
    clearDropIndicators: clearDropIndicators,
    cloneSelectionForCopy: cloneSelectionForCopy,
    cloneVariantValue: cloneVariantValue,
    closeAllFontsPanel: closeAllFontsPanel,
    closeContextMenu: closeContextMenu,
    closeExperimentPanel: closeExperimentPanel,
    closeExport: closeExport,
    closeFlexPanel: closeFlexPanel,
    closeFontPanel: closeFontPanel,
    closeGroupFeaturesPanel: closeGroupFeaturesPanel,
    closeImageSourceModal: closeImageSourceModal,
    closeItemsSetup: closeItemsSetup,
    closePageTab: closePageTab,
    closePrototypePanel: closePrototypePanel,
    closePrototypePreviewPanel: closePrototypePreviewPanel,
    closeTriggerIconPicker: closeTriggerIconPicker,
    confirmItemsSetup: confirmItemsSetup,
    contextAction: contextAction,
    copySelected: copySelected,
    createPageTab: createPageTab,
    createTriggerIconElement: createTriggerIconElement,
    deleteSelected: deleteSelected,
    dissolveIfTooSmall: dissolveIfTooSmall,
    downloadExportHtml: downloadExportHtml,
    downloadProjectFile: downloadProjectFile,
    duplicateSelected: duplicateSelected,
    ensureGroupPrototype: ensureGroupPrototype,
    ensureLayerCanvasMaps: ensureLayerCanvasMaps,
    ensureProjectSavedForExport: ensureProjectSavedForExport,
    ensureRootScreenId: ensureRootScreenId,
    escapeAttribute: escapeAttribute,
    escapeHtml: escapeHtml,
    finalizeImageLayer: finalizeImageLayer,
    finishAppLoading: finishAppLoading,
    fitTextBox: fitTextBox,
    fitTextToBox: fitTextToBox,
    fitTriggerBox: fitTriggerBox,
    followLayerLink: followLayerLink,
    generateExport: generateExport,
    generateId: generateId,
    getAncestorRotation: getAncestorRotation,
    getCanvasLabel: getCanvasLabel,
    getCanvasPoint: getCanvasPoint,
    getChildren: getChildren,
    getGroupBounds: getGroupBounds,
    getLayer: getLayer,
    getLayerClassName: getLayerClassName,
    getLayerDescendants: getLayerDescendants,
    getLayerHtmlId: getLayerHtmlId,
    getLayerList: getLayerList,
    getOrderedChildren: getOrderedChildren,
    getPageState: getPageState,
    getPageTabs: getPageTabs,
    getPrototypeGroups: getPrototypeGroups,
    getPrototypePanelAnchor: getPrototypePanelAnchor,
    getPrototypeStateDisplay: getPrototypeStateDisplay,
    getRenderedLayerBox: getRenderedLayerBox,
    getRootScreenStart: getRootScreenStart,
    getScreenRanges: getScreenRanges,
    getSelectedLayers: getSelectedLayers,
    getSelectedPrototypeGroup: getSelectedPrototypeGroup,
    getSelectedTypographyLayer: getSelectedTypographyLayer,
    getSocialIconUrl: getSocialIconUrl,
    getState: getState,
    getTextTransformCss: getTextTransformCss,
    groupSelected: groupSelected,
    handleImageUpload: handleImageUpload,
    handlePropImageUpload: handlePropImageUpload,
    hideFileMenu: hideFileMenu,
    importImageAsset: importImageAsset,
    includeSelectionInPage: includeSelectionInPage,
    inferScreenIndexFromX: inferScreenIndexFromX,
    isHoverPropertyEnabled: isHoverPropertyEnabled,
    isLayerIncluded: isLayerIncluded,
    isSocialTriggerIcon: isSocialTriggerIcon,
    loadGoogleFontCatalog: loadGoogleFontCatalog,
    loadGoogleFontFamily: loadGoogleFontFamily,
    loadMoreAllFonts: loadMoreAllFonts,
    loadProjectFile: loadProjectFile,
    loadTriggerIconCatalog: loadTriggerIconCatalog,
    measureTextSize: measureTextSize,
    newPage: newPage,
    newProject: newProject,
    normalizeCanvasBreakpoints: normalizeCanvasBreakpoints,
    normalizeNameToken: normalizeNameToken,
    normalizeWebsiteUrl: normalizeWebsiteUrl,
    nudgeCanvasHeight: nudgeCanvasHeight,
    nudgeSelectedLayers: nudgeSelectedLayers,
    openAllFontsPanel: openAllFontsPanel,
    openContextMenu: openContextMenu,
    openExport: openExport,
    openFlexPanel: openFlexPanel,
    openGroupFeaturesPanel: openGroupFeaturesPanel,
    openIncludeInMenu: openIncludeInMenu,
    openItemsSetup: openItemsSetup,
    openPageTabContextMenu: openPageTabContextMenu,
    openPrototypePanel: openPrototypePanel,
    pasteSelected: pasteSelected,
    persistCurrentCanvasLayerState: persistCurrentCanvasLayerState,
    pickPrototypeTrigger: pickPrototypeTrigger,
    pickTriggerLayerIcon: pickTriggerLayerIcon,
    populateAllFontsPanel: populateAllFontsPanel,
    populateFontPanel: populateFontPanel,
    populateGroupTargetOptions: populateGroupTargetOptions,
    populateTriggerIconPicker: populateTriggerIconPicker,
    positionExperimentPanel: positionExperimentPanel,
    positionItemsPanel: positionItemsPanel,
    positionPrototypePreviewPanel: positionPrototypePreviewPanel,
    preloadFontChoices: preloadFontChoices,
    protectPropertyInputs: protectPropertyInputs,
    readSavedProjectForExport: readSavedProjectForExport,
    recalcGroupBounds: recalcGroupBounds,
    redo: redo,
    refreshTextFitAfterFontLoad: refreshTextFitAfterFontLoad,
    removeCanvasBreakpoint: removeCanvasBreakpoint,
    renamePageTab: renamePageTab,
    render: render,
    renderBreakpointControls: renderBreakpointControls,
    renderComponentContent: renderComponentContent,
    renderItemsPanel: renderItemsPanel,
    renderLayerLinkControls: renderLayerLinkControls,
    renderProperties: renderProperties,
    reorderLayer: reorderLayer,
    reparentLayer: reparentLayer,
    retryAllFontsPanel: retryAllFontsPanel,
    saveHistory: saveHistory,
    savePageState: savePageState,
    saveProjectFile: saveProjectFile,
    saveProjectToLocalFolder: saveProjectToLocalFolder,
    selectLayer: selectLayer,
    selectLayerRangeInList: selectLayerRangeInList,
    serializeProject: serializeProject,
    setActiveCanvas: setActiveCanvas,
    setGroupLinkInputsVisibility: setGroupLinkInputsVisibility,
    setLayerIncluded: setLayerIncluded,
    setLivePreviewMode: setLivePreviewMode,
    setPage: setPage,
    setPropertyStateMode: setPropertyStateMode,
    setSidebarTab: setSidebarTab,
    setTool: setTool,
    showRenameDialog: showRenameDialog,
    snapRotationValue: snapRotationValue,
    startCanvasResize: startCanvasResize,
    startDrag: startDrag,
    startLayerItemDrag: startLayerItemDrag,
    startRenameLayer: startRenameLayer,
    startResize: startResize,
    startRotate: startRotate,
    startScreenDrag: startScreenDrag,
    startTextEditing: startTextEditing,
    switchPageState: switchPageState,
    syncCanvasHeightsWithBreakpoints: syncCanvasHeightsWithBreakpoints,
    syncExperimentControls: syncExperimentControls,
    syncLayerElement: syncLayerElement,
    syncPageTabClosers: syncPageTabClosers,
    syncPrototypePreviewPanel: syncPrototypePreviewPanel,
    syncSelectionOverlay: syncSelectionOverlay,
    toggleExperimentPanel: toggleExperimentPanel,
    toggleFileMenu: toggleFileMenu,
    toggleFontPanel: toggleFontPanel,
    toggleFontStyle: toggleFontStyle,
    toggleHoverProperty: toggleHoverProperty,
    toggleLockAspect: toggleLockAspect,
    toggleOverflow: toggleOverflow,
    togglePrototypePreviewPanel: togglePrototypePreviewPanel,
    togglePrototypeState: togglePrototypeState,
    togglePrototypeTool: togglePrototypeTool,
    toggleSelect: toggleSelect,
    triggerProjectImport: triggerProjectImport,
    unbindFlex: unbindFlex,
    undo: undo,
    ungroupSelected: ungroupSelected,
    updateCurrentOpacity: updateCurrentOpacity,
    updateCurrentRotation: updateCurrentRotation,
    updateFlexPanelUI: updateFlexPanelUI,
    updateFontPanelProperty: updateFontPanelProperty,
    updateFontPanelUI: updateFontPanelUI,
    updateGroupFeaturesPanelUI: updateGroupFeaturesPanelUI,
    updateItemDetail: updateItemDetail,
    updateLayerCount: updateLayerCount,
    updateProp: updateProp,
    updatePrototypePanelUI: updatePrototypePanelUI,
    updateStateProp: updateStateProp,
    updateStatus: updateStatus,
    wirePageTab: wirePageTab,
    zoomCanvas: zoomCanvas
});
