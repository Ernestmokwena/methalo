import { shared } from './main.js';

import {
    ensureRootScreenId,
    getLayerClassName,
    getLayerHtmlId,
    getOrderedChildren,
    getRootScreenStart,
    getScreenRanges,
    normalizeCanvasBreakpoints,
    recalcGroupBounds,
    selectLayer,
    selectLayerRangeInList,
    syncCanvasHeightsWithBreakpoints,
    toggleSelect,
} from './layers.js';

import { saveHistory } from './history.js';
import { getChildren, getLayer, getSelectedLayers, isLayerIncluded } from './state.js';
import { startDrag, startLayerItemDrag, startResize, startRotate } from './drag-drop.js';
import { createTriggerIconElement } from './icons.js';
import { ensureGroupPrototype, getPrototypeStateDisplay } from './prototype.js';

import {
    centerCanvasViewport,
    clampCanvasHeight,
    closeItemsSetup,
    followLayerLink,
    renderItemsPanel,
    renderProperties,
    startCanvasResize,
    syncExperimentControls,
    updateLayerCount,
    updateStatus,
} from './ui.js';

import { loadGoogleFontFamily, updateFontPanelUI } from './fonts.js';
import { openContextMenu, startRenameLayer } from './context-menu.js';

export function getTextTransformCss(mode) {
    if (mode === 'upper') return 'uppercase';
    if (mode === 'lower') return 'lowercase';
    if (mode === 'camel') return 'capitalize';
    return 'none';
}

export function measureTextSize(content, fontSize, fontFamily, transformMode = 'none', width = null) {
    const measurer = document.createElement('div');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.left = '-100000px';
    measurer.style.top = '0';
    measurer.style.boxSizing = 'border-box';
    measurer.style.fontSize = fontSize + 'px';
    measurer.style.fontFamily = fontFamily;
    measurer.style.textTransform = getTextTransformCss(transformMode);
    measurer.style.whiteSpace = 'pre-wrap';
    measurer.style.overflowWrap = 'anywhere';
    measurer.style.wordBreak = 'normal';
    measurer.style.lineHeight = 'normal';
    measurer.style.width = width === null ? 'max-content' : `${Math.max(20, width)}px`;
    measurer.textContent = (content && content.length) ? content : ' ';
    document.body.appendChild(measurer);
    const rect = measurer.getBoundingClientRect();
    document.body.removeChild(measurer);
    return { width: rect.width, height: rect.height };
}

export // Recomputes a text layer's width/height to exactly hug its own content at
// its current font size - called after any edit that could change the
// text's natural size (content, font size, or font family), and whenever a
// resize/scale operation changes font size. This is what keeps the
// selection box from ever showing more empty space than the text itself.
function fitTextBox(layer, preserveWidth = true) {
    if (!layer || layer.type !== 'text') return;
    const transformMode = layer.textTransform || 'none';
    const { width, height } = measureTextSize(
        layer.content,
        layer.fontSize,
        layer.fontFamily,
        transformMode,
        preserveWidth ? layer.width : null
    );
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    if (!preserveWidth) layer.width = Math.max(20, Math.ceil(width + shared.TEXT_PAD_X));
    layer.height = Math.max(20, Math.ceil(height + shared.TEXT_PAD_Y));
}

export function refreshTextFitAfterFontLoad(layer) {
    if (!layer || layer.type !== 'text') return;
    const applyFit = () => {
        fitTextBox(layer);
        if (layer.parentId !== null) recalcGroupBounds(layer.parentId);
        render();
    };
    applyFit();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            fitTextBox(layer);
            if (layer.parentId !== null) recalcGroupBounds(layer.parentId);
            render();
        });
    }
}

export // Lets a text layer be typed into directly on the canvas (double-click to
// enter). render() rebuilds the whole canvas DOM on every call, so while
// editing we must not call render() - it would blow away the live
// contenteditable node and drop focus/keystrokes.
function startTextEditing(layer, el) {
    const textContentEl = el.querySelector('.text-content');
    if (!textContentEl) return;
    if (shared.editingTextLayerId && shared.editingTextLayerId !== layer.id) return;
    shared.editingTextLayerId = layer.id;
    el.classList.add('editing-text');
    textContentEl.setAttribute('contenteditable', 'true');
    textContentEl.spellcheck = false;

    const selectAllText = () => {
        const range = document.createRange();
        range.selectNodeContents(textContentEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };
    textContentEl.focus();
    selectAllText();

    const finishEditing = (commit) => {
        if (shared.editingTextLayerId !== layer.id) return;
        shared.editingTextLayerId = null;
        textContentEl.removeEventListener('blur', onBlur);
        textContentEl.removeEventListener('keydown', onKeydown);
        textContentEl.removeEventListener('input', onInput);
        textContentEl.removeAttribute('contenteditable');
        el.classList.remove('editing-text');
        if (commit) {
            const newText = textContentEl.textContent;
            if (newText !== layer.content) {
                layer.content = newText;
                if (layer.lockAspect) fitTextBox(layer);
                saveHistory();
            }
        }
        render();
    };

    const onKeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            finishEditing(true);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const lineBreak = document.createTextNode('\n');
            range.insertNode(lineBreak);
            range.setStartAfter(lineBreak);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            textContentEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const onInput = () => {
        if (shared.editingTextLayerId !== layer.id) return;
        layer.content = textContentEl.textContent;
        if (layer.lockAspect) {
            fitTextBox(layer);
            el.style.width = layer.width + 'px';
            el.style.height = layer.height + 'px';
        }
        textContentEl.style.width = '100%';
        textContentEl.style.height = '100%';
    };

    const onBlur = () => finishEditing(true);

    textContentEl.addEventListener('keydown', onKeydown);
    textContentEl.addEventListener('input', onInput);
    textContentEl.addEventListener('blur', onBlur);
}

export // ============================================================
// GROUPING LOGIC
// ============================================================
function getRenderedLayerBox(layer) {
    const element = document.querySelector(`.shape-layer[data-id="${layer.id}"]`);
    const canvasElement = document.getElementById('canvas');
    if (!element || !canvasElement) {
        return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    }

    const elementRect = element.getBoundingClientRect();
    const canvasRect = canvasElement.getBoundingClientRect();
    const scale = shared.zoomLevel || 1;
    return {
        x: (elementRect.left - canvasRect.left) / scale,
        y: (elementRect.top - canvasRect.top) / scale,
        width: elementRect.width / scale,
        height: elementRect.height / scale
    };
}

export function syncSelectionOverlay(layer) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const layerEl = document.querySelector(`.shape-layer[data-id="${layer.id}"]`);
    const parentLayer = layer.parentId !== null ? getLayer(layer.parentId) : null;
    const isFlexChild = !!(parentLayer && parentLayer.type === 'group' && parentLayer.flexBind && parentLayer.flexBind.enabled);
    const existing = canvas.querySelector(`.selection-overlay[data-id="${layer.id}"]`);

    if (!shared.selectedIds.includes(layer.id)) {
        if (existing) existing.remove();
        return;
    }

    const overlay = existing || document.createElement('div');
    overlay.className = 'selection-overlay';
    overlay.dataset.id = layer.id;
    overlay.style.position = 'absolute';
    const rootScreenOffset = layer.parentId === null ? getRootScreenStart(layer) : 0;
    overlay.style.left = isFlexChild ? '' : ((layer.x + rootScreenOffset) + 'px');
    overlay.style.top = isFlexChild ? '' : (layer.y + 'px');
    overlay.style.width = layer.width + 'px';
    overlay.style.height = layer.height + 'px';
    overlay.style.transform = `rotate(${layer.rotation || 0}deg)`;
    overlay.style.transformOrigin = 'center center';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '20';

    if (!overlay.parentElement) {
        const container = layerEl && layerEl.parentElement ? layerEl.parentElement : canvas;
        container.appendChild(overlay);
    }

    overlay.innerHTML = '';
    shared.ROTATE_ZONE_STRIPS.forEach(cfg => {
        const strip = document.createElement('div');
        strip.className = 'rotate-zone';
        strip.style.top = cfg.top; strip.style.bottom = cfg.bottom;
        strip.style.left = cfg.left; strip.style.right = cfg.right;
        strip.style.width = cfg.width; strip.style.height = cfg.height;
        strip.style.opacity = '1';
        strip.addEventListener('pointerdown', (e) => { e.stopPropagation(); startRotate(e, layer.id); });
        overlay.appendChild(strip);
    });

    shared.RESIZE_HANDLES.forEach(cfg => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.style.cursor = cfg.cursor;
        handle.style.top = cfg.top; handle.style.bottom = cfg.bottom;
        handle.style.left = cfg.left; handle.style.right = cfg.right;
        handle.style.opacity = '1';
        if (cfg.marginTop) handle.style.marginTop = cfg.marginTop;
        if (cfg.marginLeft) handle.style.marginLeft = cfg.marginLeft;
        handle.addEventListener('pointerdown', (e) => { e.stopPropagation(); startResize(e, layer.id, cfg.pos); });
        overlay.appendChild(handle);
    });
}

export function renderComponentContent(element, layer) {
    element.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'component-list';
    list.style.fontFamily = layer.fontFamily || 'Arial, Helvetica, sans-serif';
    list.style.fontSize = `${layer.fontSize || 16}px`;
    list.style.fontWeight = layer.fontWeight || '400';
    list.style.color = layer.color || '#1e293b';
    list.style.flexDirection = layer.itemDirection === 'column' ? 'column' : 'row';
    const count = Math.max(1, Math.min(100, Number(layer.itemCount) || 3));
    for (let index = 1; index <= count; index += 1) {
        const item = document.createElement('li');
        const name = layer.itemNames && layer.itemNames[index - 1] || `Item${index}`;
        if (layer.useItemAnchors) {
            const anchor = document.createElement('a');
            anchor.href = layer.itemAnchors && layer.itemAnchors[index - 1] || '#';
            anchor.textContent = name;
            item.appendChild(anchor);
        } else {
            item.textContent = name;
        }
        item.style.padding = `${Math.max(0, Number(layer.itemPadding) || 0)}px`;
        const dividerValue = layer.itemDividers && layer.itemDividers[index - 1];
        item.style.borderBottom = dividerValue !== false && dividerValue !== 'false' && dividerValue !== 0 && dividerValue !== '0'
            ? `1px solid ${layer.itemDivider || '#cccccc'}` : 'none';
        list.appendChild(item);
    }
    element.appendChild(list);
}

export function syncLayerElement(layer) {
    const el = document.querySelector(`.shape-layer[data-id="${layer.id}"]`);
    if (!el) return;

    const layerClass = getLayerClassName(layer);
    el.className = `shape-layer ${layer.type}-layer${layerClass ? ' ' + layerClass : ''}`;
    if (layer.type === 'group') {
        const htmlId = getLayerHtmlId(layer);
        if (htmlId) el.id = htmlId;
        else el.removeAttribute('id');
    }

    const parentLayer = layer.parentId !== null ? getLayer(layer.parentId) : null;
    const isFlexChild = !!(parentLayer && parentLayer.type === 'group' && parentLayer.flexBind && parentLayer.flexBind.enabled);

    if (isFlexChild) {
        el.style.position = 'relative';
        el.style.left = '';
        el.style.top = '';
    } else {
        // The editor's canvas should keep layers in their original x/y layout
        // regardless of any export-only fixed/sticky mode. Only the export
        // engine uses the position mode to emit final CSS.
        el.style.position = 'absolute';
        const rootScreenOffset = layer.parentId === null ? getRootScreenStart(layer) : 0;
        el.style.left = (layer.x + rootScreenOffset) + 'px';
        el.style.top = layer.y + 'px';
    }
    el.dataset.positionEnabled = layer.positionEnabled ? '1' : '0';
    el.dataset.positionMode = layer.positionMode || 'absolute';
    el.style.width = layer.width + 'px';
    el.style.height = layer.height + 'px';

    if (layer.visible === false) el.classList.add('hidden'); else el.classList.remove('hidden');
    if (shared.selectedIds.includes(layer.id)) el.classList.add('selected'); else el.classList.remove('selected');

    const hasLink = layer.linkType && layer.linkType !== 'none';
    if (hasLink) {
        el.style.cursor = 'pointer';
        el.title = layer.linkType === 'scrollto' ? 'Ctrl-click to scroll to section' : 'Ctrl-click to follow link';
    }

    const isLive = (shared.isDragging && shared.dragData && shared.dragData.ids.includes(layer.id)) ||
        (shared.isResizing && shared.resizeData && shared.resizeData.id === layer.id);
    if (shared.isDragging && shared.dragData && shared.dragData.ids.includes(layer.id)) el.classList.add('dragging'); else el.classList.remove('dragging');
    if (shared.isResizing && shared.resizeData && shared.resizeData.id === layer.id) el.classList.add('resizing'); else el.classList.remove('resizing');
    if (shared.isRotating && shared.rotateData && shared.rotateData.id === layer.id) el.classList.add('rotating'); else el.classList.remove('rotating');

    if (layer.type === 'trigger') {
        const preIcon = layer.preIcon !== undefined ? layer.preIcon : (layer.icon !== undefined ? layer.icon : shared.currentTriggerIcon || 'ads_click');
        el.style.setProperty('--prototype-transition', `${shared.DEFAULT_PROTOTYPE_TRANSITION}s`);
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.backgroundColor = layer.backgroundColor || 'transparent';
        el.style.border = layer.borderStyle && layer.borderThickness > 0
            ? `${layer.borderThickness}px ${layer.borderStyle} ${layer.borderColor || '#64748b'}`
            : 'none';
        el.style.borderRadius = (layer.borderRadius || 12) + 'px';
        el.querySelector('.trigger-content')?.remove();
        if (preIcon) el.appendChild(createTriggerIconElement(preIcon, layer.iconColor || '#0f172a', layer.fontSize || 20));
    } else if (layer.type === 'image') {
        if (!el.querySelector('.image-content')) {
            el.innerHTML = `<div class="image-content"><img src="${layer.src}" alt="${layer.name || 'Image'}" loading="lazy" decoding="async" fetchpriority="low"></div>`;
        }
    } else if (layer.type === 'component') {
        renderComponentContent(el, layer);
    } else if (layer.type === 'button') {
        el.textContent = layer.content || 'Button';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.padding = '8px 16px';
        el.style.color = layer.color || '#ffffff';
        el.style.backgroundColor = layer.backgroundColor || '#4CAF50';
        el.style.fontFamily = layer.fontFamily || 'Arial, Helvetica, sans-serif';
        el.style.fontSize = `${layer.fontSize || 16}px`;
        el.style.fontWeight = layer.fontWeight || '600';
        el.style.borderRadius = `${layer.borderRadius || 5}px`;
        el.style.border = layer.borderStyle && layer.borderThickness > 0
            ? `${layer.borderThickness}px ${layer.borderStyle} ${layer.borderColor || '#388E3C'}`
            : 'none';
        el.style.cursor = 'pointer';
    } else {
        el.style.backgroundColor = layer.backgroundColor || '#737373';
        if (layer.borderRadius) el.style.borderRadius = layer.borderRadius + 'px';
        else el.style.borderRadius = '';
    }

    if (layer.type === 'group') {
        el.style.border = '2px dashed #f59e0b';
        el.style.backgroundColor = 'rgba(245, 158, 11, 0.05)';
        if (layer.flexBind && layer.flexBind.enabled) {
            el.classList.add('flex-bound');
            el.style.display = 'flex';
            el.style.flexDirection = layer.flexBind.direction === 'column' ? 'column' : 'row';
            el.style.justifyContent = layer.flexBind.justify || 'center';
            el.style.alignItems = layer.flexBind.align || 'center';
            el.title = 'Flex layout bound - right-click to edit or unbind';
        } else {
            el.classList.remove('flex-bound');
            el.style.display = ''; 
            el.style.flexDirection = '';
            el.style.justifyContent = '';
            el.style.alignItems = '';
            el.title = '';
        }

        ensureGroupPrototype(layer);
        if (layer.prototypeEnabled) {
            el.classList.add('prototype-group');
            el.style.setProperty('--prototype-transition', `${layer.prototypeTransition ?? shared.DEFAULT_PROTOTYPE_TRANSITION}s`);
            el.style.setProperty('--prototype-hover-opacity', layer.prototypeHover.opacity ?? 1);
            el.style.setProperty('--prototype-hover-clip', layer.prototypeHover.clipPath || 'none');
            const state = layer.prototypeStates[layer.prototypeState] || layer.prototypeStates.pre || { display: 'flex', clipPath: '' };
            const resolvedDisplay = getPrototypeStateDisplay(layer, 'flex');
            const shouldHide = resolvedDisplay === 'none';
            if (shouldHide) {
                el.style.display = 'none';
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
                el.style.left = '-9999px';
                el.style.top = '-9999px';
                el.style.clipPath = 'inset(0 0 0 0)';
            } else {
                el.style.display = resolvedDisplay;
                el.style.clipPath = state.clipPath || '';
                el.style.opacity = (layer.opacity ?? 1).toString();
                el.style.pointerEvents = '';
            }
        } else {
            el.classList.remove('prototype-group');
            el.style.clipPath = '';
            el.style.opacity = (layer.opacity ?? 1).toString();
            el.style.pointerEvents = '';
        }
    }

    syncSelectionOverlay(layer);
}

export function render() {
    const canvas = document.getElementById('canvas');
    const layerList = document.getElementById('layerList');
    const overflowToggle = document.getElementById('overflowToggle');
    const overflowToggleIcon = document.getElementById('overflowToggleIcon');
    shared.canvasBreakpoints = normalizeCanvasBreakpoints(shared.canvasBreakpoints);
    syncCanvasHeightsWithBreakpoints();
    const screenRanges = getScreenRanges();
    shared.activeCanvasIndex = Math.max(0, Math.min(screenRanges.length - 1, shared.activeCanvasIndex));
    shared.canvasWidth = screenRanges[shared.activeCanvasIndex] ? screenRanges[shared.activeCanvasIndex].width : 900;
    shared.canvasHeight = clampCanvasHeight(Math.round(shared.canvasHeights[shared.activeCanvasIndex] || shared.canvasHeight || 600));
    shared.canvasHeights[shared.activeCanvasIndex] = shared.canvasHeight;
    canvas.style.width = shared.canvasWidth + 'px';
    canvas.style.height = shared.canvasHeight + 'px';
    canvas.style.overflow = shared.showOverflow ? 'visible' : 'hidden';
    canvas.style.transform = shared.zoomLevel === 1 ? 'none' : `scale(${shared.zoomLevel})`;
    canvas.style.transformOrigin = '0 0';
    canvas.classList.toggle('resizing-canvas', shared.isCanvasResizing);
    if (overflowToggle) {
        overflowToggle.classList.toggle('active', shared.showOverflow);
    }
    if (overflowToggleIcon) {
        overflowToggleIcon.textContent = shared.showOverflow ? 'toggle_on' : 'toggle_off';
    }
    syncExperimentControls();
    centerCanvasViewport();

    // 1. Clear & Redraw Canvas
    // Drop the previous render tree completely so detached text nodes,
    // selection overlays, and stale measurement state cannot survive a
    // redraw and interfere with the next fit pass.
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);

    // Draw Groups first (background), then children
    const drawLayer = (layer, container) => {
        if (!isLayerIncluded(layer, shared.activeCanvasIndex)) return;
        if (layer.type === 'text' || layer.type === 'component') loadGoogleFontFamily(layer.fontFamily);
        const el = document.createElement('div');
        const baseClass = `shape-layer ${layer.type}-layer`;
        const layerClass = getLayerClassName(layer);
        el.className = layerClass ? `${baseClass} ${layerClass}` : baseClass;
        if (layer.type === 'group') {
            const htmlId = getLayerHtmlId(layer);
            if (htmlId) el.id = htmlId;
            else el.removeAttribute('id');
        }
        el.dataset.id = layer.id;

        // A layer whose direct parent is a group with an active flex bind
        // is laid out by the browser's flexbox engine, not by its own
        // stored x/y - the group becomes the "dynamic parent" and this
        // child just flows into place.
        const parentLayer = layer.parentId !== null ? getLayer(layer.parentId) : null;
        const isFlexChild = !!(parentLayer && parentLayer.type === 'group' && parentLayer.flexBind && parentLayer.flexBind.enabled);

        // Position & Size
        if (isFlexChild) {
            // Still a valid containing block for this child's own resize
            // handles (position:relative, unlike static, keeps that), but
            // left/top are intentionally left unset so flex controls
            // placement instead.
            el.style.position = 'relative';
        } else {
            // The editor canvas should preserve original layer x/y layout
            // regardless of whether the export will use fixed/sticky.
            el.style.position = 'absolute';
            const rootScreenOffset = layer.parentId === null ? getRootScreenStart(layer) : 0;
            el.style.left = (layer.x + rootScreenOffset) + 'px';
            el.style.top = layer.y + 'px';
        }
        el.style.width = layer.width + 'px';
        el.style.height = layer.height + 'px';

        // Styles
        if (layer.visible === false) el.classList.add('hidden');
        if (shared.selectedIds.includes(layer.id)) el.classList.add('selected');
        el.style.opacity = (layer.opacity ?? 1).toString();
        const hoverState = layer.hover || {};
        const hoverEnabled = hoverState.enabled || {};
        const hasHover = layer.type !== 'group' && Object.values(hoverEnabled).some(Boolean);
        el.classList.toggle('has-layer-hover', hasHover);
        el.classList.toggle('hover-opacity', hoverEnabled.opacity === true);
        el.classList.toggle('hover-transform', hoverEnabled.scale === true || hoverEnabled.rotation === true);
        el.classList.toggle('hover-background', hoverEnabled.backgroundColor === true);
        el.classList.toggle('hover-color', hoverEnabled.color === true);
        el.style.setProperty('--layer-hover-opacity', hoverState.opacity ?? 1);
        el.style.setProperty('--layer-hover-scale', hoverState.scale ?? 1);
        el.style.setProperty('--layer-hover-rotation', `${(layer.rotation || 0) + (hoverState.rotation || 0)}deg`);
        el.style.setProperty('--layer-hover-bg', hoverState.backgroundColor || 'inherit');
        el.style.setProperty('--layer-hover-color', hoverState.color || 'inherit');
        el.style.setProperty('--layer-hover-duration', `${hoverState.duration ?? 0.45}s`);
        el.style.setProperty('--layer-hover-easing', hoverState.easing || 'ease');
        // Re-apply live gesture state (render() rebuilds the DOM node every frame)
        const isLive = (shared.isDragging && shared.dragData && shared.dragData.ids.includes(layer.id)) ||
            (shared.isResizing && shared.resizeData && shared.resizeData.id === layer.id);
        if (shared.isDragging && shared.dragData && shared.dragData.ids.includes(layer.id)) el.classList.add('dragging');
        if (shared.isResizing && shared.resizeData && shared.resizeData.id === layer.id) el.classList.add('resizing');
        if (shared.isRotating && shared.rotateData && shared.rotateData.id === layer.id) el.classList.add('rotating');

        // Rotation (combined with the drag/resize "lift" scale, since inline
        // transform would otherwise override the CSS class's transform)
        const transformParts = [];
        if (layer.rotation) transformParts.push(`rotate(${layer.rotation}deg)`);
        if (isLive) transformParts.push('scale(1.02)');
        el.style.transform = transformParts.join(' ');
        el.style.setProperty('--layer-rotation', `${layer.rotation || 0}deg`);

        if (layer.type === 'text') {
            el.style.color = layer.color;
            el.style.fontFamily = layer.fontFamily;
            el.style.backgroundColor = 'transparent';
            el.style.display = 'flex'; el.style.alignItems = 'center';

            const textContentEl = document.createElement('div');
            textContentEl.className = 'text-content';
            textContentEl.textContent = layer.content || 'Text';
            textContentEl.style.fontSize = layer.fontSize + 'px';
            textContentEl.style.fontWeight = layer.fontWeight || '400';
            textContentEl.style.fontStyle = layer.fontStyle || 'normal';
            textContentEl.style.textDecoration = layer.textDecoration || 'none';
            textContentEl.style.textAlign = layer.textAlign || 'left';
            if (layer.textTransform === 'upper') textContentEl.style.textTransform = 'uppercase';
            else if (layer.textTransform === 'lower') textContentEl.style.textTransform = 'lowercase';
            else if (layer.textTransform === 'camel') textContentEl.style.textTransform = 'capitalize';
            else textContentEl.style.textTransform = 'none';
            el.appendChild(textContentEl);
        } else if (layer.type === 'image') {
            el.innerHTML = `<div class="image-content"><img src="${layer.src}" alt="${layer.name || 'Image'}" loading="lazy" decoding="async" fetchpriority="low"></div>`;
            el.style.borderRadius = layer.borderRadius ? `${layer.borderRadius}px` : '';
        } else if (layer.type === 'component') {
            renderComponentContent(el, layer);
        } else if (layer.type === 'button') {
            el.textContent = layer.content || 'Button';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.padding = '8px 16px';
            el.style.color = layer.color || '#ffffff';
            el.style.backgroundColor = layer.backgroundColor || '#4CAF50';
            el.style.fontFamily = layer.fontFamily || 'Arial, Helvetica, sans-serif';
            el.style.fontSize = `${layer.fontSize || 16}px`;
            el.style.fontWeight = layer.fontWeight || '600';
            el.style.fontStyle = layer.fontStyle || 'normal';
            el.style.textDecoration = layer.textDecoration || 'none';
            el.style.textAlign = layer.textAlign || 'center';
            el.style.textTransform = layer.textTransform === 'upper' ? 'uppercase' : layer.textTransform === 'lower' ? 'lowercase' : layer.textTransform === 'camel' ? 'capitalize' : 'none';
            el.style.fontStyle = layer.fontStyle || 'normal';
            el.style.textDecoration = layer.textDecoration || 'none';
            el.style.textAlign = layer.textAlign || 'center';
            el.style.textTransform = layer.textTransform === 'upper' ? 'uppercase' : layer.textTransform === 'lower' ? 'lowercase' : layer.textTransform === 'camel' ? 'capitalize' : 'none';
            el.style.borderRadius = `${layer.borderRadius || 5}px`;
            el.style.border = layer.borderStyle && layer.borderThickness > 0
                ? `${layer.borderThickness}px ${layer.borderStyle} ${layer.borderColor || '#388E3C'}`
                : 'none';
            el.style.cursor = 'pointer';
        } else if (layer.type === 'trigger') {
            const preIcon = layer.preIcon !== undefined ? layer.preIcon : (layer.icon !== undefined ? layer.icon : shared.currentTriggerIcon || 'ads_click');
            el.style.setProperty('--prototype-transition', `${shared.DEFAULT_PROTOTYPE_TRANSITION}s`);
            el.style.backgroundColor = layer.backgroundColor || 'transparent';
            el.style.border = layer.borderStyle && layer.borderThickness > 0
                ? `${layer.borderThickness}px ${layer.borderStyle} ${layer.borderColor || '#64748b'}`
                : 'none';
            el.style.borderRadius = (layer.borderRadius || 12) + 'px';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            if (preIcon) el.appendChild(createTriggerIconElement(preIcon, layer.iconColor || '#0f172a', layer.fontSize || 20));
        } else {
            el.style.backgroundColor = layer.backgroundColor || '#737373';
            if (layer.borderRadius) el.style.borderRadius = layer.borderRadius + 'px';
        }

        // Handle children of groups visually (inherit bounds)
        if (layer.type === 'group') {
            const hasBorder = layer.borderStyle && layer.borderStyle !== 'none' && layer.borderThickness > 0;
            if (hasBorder) {
                el.style.border = `${layer.borderThickness}px ${layer.borderStyle} ${layer.borderColor || '#f59e0b'}`;
            } else {
                el.style.border = 'none';
            }
            if (layer.backgroundEnabled) {
                el.style.backgroundColor = layer.backgroundColor || 'rgba(245, 158, 11, 0.05)';
            } else {
                el.style.backgroundColor = 'transparent';
            }
            if (layer.flexBind && layer.flexBind.enabled) {
                el.classList.add('flex-bound');
                el.style.display = 'flex';
                el.style.flexDirection = layer.flexBind.direction === 'column' ? 'column' : 'row';
                el.style.justifyContent = layer.flexBind.justify || 'center';
                el.style.alignItems = layer.flexBind.align || 'center';
                el.title = 'Flex layout bound - right-click to edit or unbind';
            }

            ensureGroupPrototype(layer);
            if (layer.prototypeEnabled) {
                el.classList.add('prototype-group');
                el.style.setProperty('--prototype-transition', `${layer.prototypeTransition ?? shared.DEFAULT_PROTOTYPE_TRANSITION}s`);
                el.style.setProperty('--prototype-hover-opacity', layer.prototypeHover.opacity ?? 1);
                el.style.setProperty('--prototype-hover-clip', layer.prototypeHover.clipPath || 'none');
                const state = layer.prototypeStates[layer.prototypeState] || layer.prototypeStates.pre || { display: 'flex', clipPath: '' };
                const resolvedDisplay = getPrototypeStateDisplay(layer, 'flex');
                const shouldHide = resolvedDisplay === 'none';
                if (shouldHide) {
                    el.style.display = 'none';
                    el.style.opacity = '0';
                    el.style.pointerEvents = 'none';
                    el.style.left = '-9999px';
                    el.style.top = '-9999px';
                    el.style.clipPath = 'inset(0 0 0 0)';
                } else {
                    el.style.display = resolvedDisplay;
                    el.style.clipPath = state.clipPath || '';
                    el.style.opacity = (layer.opacity ?? 1).toString();
                    el.style.pointerEvents = '';
                }
            } else {
                el.classList.remove('prototype-group');
                el.style.clipPath = '';
                el.style.opacity = (layer.opacity ?? 1).toString();
                el.style.pointerEvents = '';
            }

        }

        // Interaction - Pointer Events unify mouse + touch + pen so drag behaves
        // identically everywhere and doesn't "snap" on the first touch move.
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (shared.editingTextLayerId === layer.id) return;
            if (e.target.closest('.rotate-zone') || e.target.closest('.resize-handle')) return;

            // Calling preventDefault() below suppresses the browser's
            // compatibility dblclick event, so double-clicks are detected
            // manually here instead of via a 'dblclick' listener.
            const now = Date.now();
            const isDoubleClick = layer.type === 'text' && shared.lastLayerClick.id === layer.id && (now - shared.lastLayerClick.time) < 400;
            shared.lastLayerClick = { id: layer.id, time: now };
            if (isDoubleClick) {
                if (!shared.selectedIds.includes(layer.id)) selectLayer(layer.id);
                const editableLayer = document.querySelector(`.shape-layer.text-layer[data-id="${layer.id}"]`);
                startTextEditing(layer, editableLayer || el);
                shared.lastLayerClick = { id: null, time: 0 };
                return;
            }

            if ((e.ctrlKey || e.metaKey) && layer.linkType && layer.linkType !== 'none') {
                followLayerLink(layer);
                e.preventDefault();
                return;
            }

            const isMulti = e.shiftKey || e.ctrlKey;
            if (shared.currentTool === 'select') {
                toggleSelect(layer.id, isMulti);
                // Flex-bound children can be selected/inspected but not
                // dragged - the group's flex layout owns their position
                // until it's unbound.
                if (!isMulti && !isFlexChild) startDrag(e, layer.id);
            } else if (shared.currentTool === 'move') {
                if (!shared.selectedIds.includes(layer.id)) selectLayer(layer.id);
                if (!isFlexChild) startDrag(e, layer.id);
            }
            if (layer.type !== 'text') e.preventDefault();
        });

        el.addEventListener('dblclick', (e) => {
            if (layer.type !== 'text' || shared.editingTextLayerId) return;
            e.preventDefault();
            e.stopPropagation();
            if (!shared.selectedIds.includes(layer.id)) selectLayer(layer.id);
            const editableLayer = document.querySelector(`.shape-layer.text-layer[data-id="${layer.id}"]`);
            startTextEditing(layer, editableLayer || el);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!shared.selectedIds.includes(layer.id)) selectLayer(layer.id);
            openContextMenu(e.clientX, e.clientY);
        });

        container.appendChild(el);

        if (shared.selectedIds.includes(layer.id)) {
            const existingOverlay = container.querySelector(`.selection-overlay[data-id="${layer.id}"]`);
            if (!existingOverlay) {
                const selectionOverlay = document.createElement('div');
                selectionOverlay.className = 'selection-overlay';
                selectionOverlay.dataset.id = layer.id;
                selectionOverlay.style.position = 'absolute';
                const rootScreenOffset = layer.parentId === null ? getRootScreenStart(layer) : 0;
                selectionOverlay.style.left = isFlexChild ? '' : ((layer.x + rootScreenOffset) + 'px');
                selectionOverlay.style.top = isFlexChild ? '' : (layer.y + 'px');
                selectionOverlay.style.width = layer.width + 'px';
                selectionOverlay.style.height = layer.height + 'px';
                selectionOverlay.style.transform = `rotate(${layer.rotation || 0}deg)`;
                selectionOverlay.style.transformOrigin = 'center center';
                selectionOverlay.style.pointerEvents = 'none';
                selectionOverlay.style.zIndex = '20';

                shared.ROTATE_ZONE_STRIPS.forEach(cfg => {
                    const strip = document.createElement('div');
                    strip.className = 'rotate-zone';
                    strip.style.top = cfg.top; strip.style.bottom = cfg.bottom;
                    strip.style.left = cfg.left; strip.style.right = cfg.right;
                    strip.style.width = cfg.width; strip.style.height = cfg.height;
                    strip.style.opacity = '1';
                    strip.addEventListener('pointerdown', (e) => { e.stopPropagation(); startRotate(e, layer.id); });
                    selectionOverlay.appendChild(strip);
                });

                shared.RESIZE_HANDLES.forEach(cfg => {
                    const handle = document.createElement('div');
                    handle.className = 'resize-handle';
                    handle.style.cursor = cfg.cursor;
                    handle.style.top = cfg.top; handle.style.bottom = cfg.bottom;
                    handle.style.left = cfg.left; handle.style.right = cfg.right;
                    handle.style.opacity = '1';
                    if (cfg.marginTop) handle.style.marginTop = cfg.marginTop;
                    if (cfg.marginLeft) handle.style.marginLeft = cfg.marginLeft;
                    handle.addEventListener('pointerdown', (e) => { e.stopPropagation(); startResize(e, layer.id, cfg.pos); });
                    selectionOverlay.appendChild(handle);
                });

                container.appendChild(selectionOverlay);
            }
        }

        // Guarantee text never visually overflows its box, regardless of
        // whether proportional (locked) or free resizing was used.
        if (layer.type === 'text') {
            const textContentEl = el.querySelector('.text-content');
            if (textContentEl) fitTextToBox(el, textContentEl);
        }

        // Recursively draw children NESTED inside the group's own element.
        // Children are positioned (x/y) relative to the group's box, and
        // because `el` is itself position:absolute, it's a valid containing
        // block for them. Nesting (rather than drawing children flat on the
        // canvas) is what makes a rotate/resize/move applied to the group
        // visually carry every child along with it - the browser composes
        // the group's transform with each child's own transform for free.
        if (layer.type === 'group') {
            getOrderedChildren(layer)
                .forEach(child => drawLayer(child, el));
        }
    };

    // Draw root-level layers (top of the tree); their descendants are
    // drawn recursively, nested inside them, by drawLayer itself.
    const roots = shared.layers.filter(l => l.parentId === null || !getLayer(l.parentId));
    roots.forEach(root => {
        ensureRootScreenId(root);
        const ranges = getScreenRanges();
        const maxIdx = Math.max(0, ranges.length - 1);
        if (root.screenId > maxIdx) root.screenId = maxIdx;
    });
    roots.forEach(root => drawLayer(root, canvas));
    // Safety net: any layer whose parentId points at a group that no
    // longer exists (shouldn't normally happen) still gets drawn.
    shared.layers
        .filter(l => l.parentId !== null && !getLayer(l.parentId))
        .forEach(child => drawLayer(child, canvas));

    // Breakpoint guides are vertical separators drawn over the canvas.
    // No dotted separators: pages are visually separated by gap and each
    // page background acts as an independent canvas slab.

    const resizeTip = document.createElement('div');
    resizeTip.className = 'canvas-resize-tip';
    resizeTip.title = 'Drag up or down to resize canvas';
    resizeTip.addEventListener('pointerdown', startCanvasResize);
    canvas.appendChild(resizeTip);


    // 2. Render Layer List
    layerList.innerHTML = '';
    shared.selectedIds = shared.selectedIds.filter(id => {
        const layer = getLayer(id);
        return layer && isLayerIncluded(layer, shared.activeCanvasIndex);
    });
    const LAYER_ICONS = { group: 'folder', rect: 'rectangle', circle: 'circle', text: 'text_fields', image: 'image', component: 'view_list' };
    const renderLayerItem = (layer, depth = 0) => {
        if (!isLayerIncluded(layer, shared.activeCanvasIndex)) return;
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.dataset.id = layer.id;
        if (shared.selectedIds.includes(layer.id)) item.classList.add('active');
        if (!layer.visible) item.classList.add('dimmed');
        if (depth > 0) item.style.marginLeft = (depth * 16) + 'px';

        const iconName = LAYER_ICONS[layer.type] || 'crop_square';
        const name = layer.name || `${layer.type} ${layer.id}`;

        item.innerHTML = `
            <span class="layer-main">
                ${layer.type === 'group' ? `<span class="group-toggle material-symbols-outlined" title="${layer.collapsed ? 'Expand group' : 'Collapse group'}">${layer.collapsed ? 'chevron_right' : 'expand_more'}</span>` : `<span class="drag-handle material-symbols-outlined" title="Drag to reorder">drag_indicator</span>`}
                <span class="layer-icon material-symbols-outlined">${iconName}</span>
                <span class="layer-name">${name}</span>
            </span>
            <span class="layer-actions">
                ${layer.type === 'group' ? `<select class="layer-group-type-select" title="Semantic HTML tag" aria-label="Semantic HTML tag">
                    <option value="normal"${(layer.groupType || 'normal') === 'normal' ? ' selected' : ''}>Normal</option>
                    <option value="header"${layer.groupType === 'header' ? ' selected' : ''}>Header</option>
                    <option value="footer"${layer.groupType === 'footer' ? ' selected' : ''}>Footer</option>
                    <option value="section"${layer.groupType === 'section' ? ' selected' : ''}>Section</option>
                    <option value="article"${layer.groupType === 'article' ? ' selected' : ''}>Article</option>
                    <option value="nav"${layer.groupType === 'nav' ? ' selected' : ''}>Nav</option>
                </select>` : ''}
                <button class="layer-visibility-toggle" type="button" title="Visibility" aria-label="Visibility"><span class="material-symbols-outlined">${layer.visible === false ? 'visibility_off' : 'visibility'}</span></button>
                <span class="layer-eye-panel" data-layer-id="${layer.id}">
                    <div class="layer-panel-row">
                        <span>Position</span>
                        <button type="button" class="layer-panel-toggle ${layer.positionEnabled ? 'active' : ''}" data-position-enabled="${layer.positionEnabled ? 'on' : 'off'}">
                            <span class="material-symbols-outlined">${layer.positionEnabled ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                    </div>
                    <div class="context-divider"></div>
                    <div class="layer-panel-row ${!layer.positionEnabled ? 'disabled' : ''}">
                        <span>Fixed</span>
                        <button type="button" class="layer-panel-toggle ${layer.positionMode === 'fixed' ? 'active' : ''}" data-position-mode="fixed">
                            <span class="material-symbols-outlined">${layer.positionMode === 'fixed' ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                    </div>
                    <div class="layer-panel-row ${!layer.positionEnabled ? 'disabled' : ''}">
                        <span>Sticky</span>
                        <button type="button" class="layer-panel-toggle ${layer.positionMode === 'sticky' ? 'active' : ''}" data-position-mode="sticky">
                            <span class="material-symbols-outlined">${layer.positionMode === 'sticky' ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                    </div>
                </span>
            </span>
        `;

        const groupTypeSelect = item.querySelector('.layer-group-type-select');
        if (groupTypeSelect) {
            groupTypeSelect.addEventListener('pointerdown', event => event.stopPropagation());
            groupTypeSelect.addEventListener('click', event => event.stopPropagation());
            groupTypeSelect.addEventListener('change', event => {
                layer.groupType = event.target.value;
                saveHistory();
                render();
                updateStatus(`Group type: ${event.target.options[event.target.selectedIndex].text}`);
            });
        }

        const visibilityToggle = item.querySelector('.layer-visibility-toggle');
        const eyePopover = item.querySelector('.layer-eye-panel');
        if (visibilityToggle && eyePopover) {
            visibilityToggle.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            visibilityToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                layer.visible = !layer.visible;
                saveHistory();
                render();
            });
            visibilityToggle.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isOpen = eyePopover.classList.contains('active');
                document.querySelectorAll('.layer-eye-panel').forEach(pop => {
                    pop.classList.remove('active');
                    pop.style.left = '';
                    pop.style.top = '';
                    pop.style.right = '';
                    pop.style.transform = '';
                });
                document.querySelectorAll('.layer-opacity-popover').forEach(pop => pop.classList.remove('active'));
                if (!isOpen) {
                    const panelWidth = 220;
                    const x = Math.min(Math.max(e.clientX, 8), window.innerWidth - panelWidth - 8);
                    const y = Math.min(Math.max(e.clientY, 8), window.innerHeight - 8);
                    eyePopover.style.position = 'fixed';
                    eyePopover.style.left = `${x}px`;
                    eyePopover.style.top = `${y}px`;
                    eyePopover.style.right = '';
                    eyePopover.style.transform = 'none';
                    eyePopover.classList.add('active');
                }
            });
            const updateEyePanelButtons = () => {
                const enabledBtn = eyePopover.querySelector('[data-position-enabled]');
                const fixedBtn = eyePopover.querySelector('[data-position-mode="fixed"]');
                const stickyBtn = eyePopover.querySelector('[data-position-mode="sticky"]');
                const enabled = !!layer.positionEnabled;
                enabledBtn.classList.toggle('active', enabled);
                enabledBtn.dataset.positionEnabled = enabled ? 'on' : 'off';
                enabledBtn.querySelector('.material-symbols-outlined').textContent = enabled ? 'toggle_on' : 'toggle_off';

                fixedBtn.classList.toggle('active', enabled && layer.positionMode === 'fixed');
                fixedBtn.querySelector('.material-symbols-outlined').textContent = enabled && layer.positionMode === 'fixed' ? 'toggle_on' : 'toggle_off';
                stickyBtn.classList.toggle('active', enabled && layer.positionMode === 'sticky');
                stickyBtn.querySelector('.material-symbols-outlined').textContent = enabled && layer.positionMode === 'sticky' ? 'toggle_on' : 'toggle_off';

                fixedBtn.closest('.layer-panel-row').classList.toggle('disabled', !enabled);
                stickyBtn.closest('.layer-panel-row').classList.toggle('disabled', !enabled);
            };
            eyePopover.addEventListener('pointerdown', (e) => e.stopPropagation());
            eyePopover.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const enabledValue = btn.dataset.positionEnabled;
                    const positionMode = btn.dataset.positionMode;
                    if (enabledValue !== undefined) {
                        const enabled = !layer.positionEnabled;
                        layer.positionEnabled = enabled;
                        if (!enabled) layer.positionMode = 'absolute';
                        saveHistory();
                        updateEyePanelButtons();
                        return;
                    }
                    if (positionMode) {
                        if (!layer.positionEnabled) return;
                        if (layer.positionMode === positionMode) {
                            layer.positionMode = 'absolute';
                        } else {
                            layer.positionMode = positionMode;
                        }
                        layer.positionEnabled = true;
                        saveHistory();
                        updateEyePanelButtons();
                    }
                });
            });
            updateEyePanelButtons();
        }

        item.addEventListener('click', (e) => {
            if (shared.layerListDragMoved) { shared.layerListDragMoved = false; return; }
            const isToggle = e.ctrlKey || e.metaKey;
            if (e.shiftKey) {
                selectLayerRangeInList(layer.id, isToggle);
                return;
            }
            if (isToggle) {
                toggleSelect(layer.id, true);
                shared.layerListAnchorId = layer.id;
                return;
            }
            selectLayer(layer.id);
            shared.layerListAnchorId = layer.id;
        });

        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!shared.selectedIds.includes(layer.id)) toggleSelect(layer.id, e.shiftKey || e.ctrlKey);
            openContextMenu(e.clientX, e.clientY);
        });

        // Grab anywhere on the row to reorder - same "pick it up" feel as
        // dragging a shape on the canvas. A short movement threshold (in
        // startLayerItemDrag/pointermove below) keeps a plain tap working
        // as a normal select.
        item.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('.layer-name-input')) return;
            if (e.target.closest('.group-toggle')) return;
            if (e.target.closest('.layer-opacity-toggle')) return;
            if (e.target.closest('.layer-opacity-popover')) return;
            if (e.target.closest('.layer-opacity-slider')) return;
            if (e.target.closest('.layer-visibility-toggle')) return;
            if (e.target.closest('.layer-eye-panel')) return;
            startLayerItemDrag(e, item, layer);
        });

        // Double-click / double-tap the layer's name to rename it inline
        const nameSpan = item.querySelector('.layer-name');
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startRenameLayer(layer, nameSpan);
        });

        // Collapse/expand grouped layers in the sidebar tree.
        const groupToggle = item.querySelector('.group-toggle');
        if (groupToggle) {
            groupToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                layer.collapsed = !layer.collapsed;
                render();
            });
        }

        layerList.appendChild(item);

        // Render children recursively
        // Children render below their group, but still frontmost-first within it
        if (layer.type !== 'group' || !layer.collapsed) {
            getChildren(layer.id)
                .slice()
                .reverse()
                .forEach(child => renderLayerItem(child, depth + 1));
        }
    };

    // Top of the panel = front of the stack (highest z-index on canvas), so
    // list newest/frontmost-first - i.e. reverse of the array's back-to-front order.
    shared.layers
        .filter(l => l.parentId === null)
        .slice()
        .reverse()
        .forEach(root => renderLayerItem(root));


    renderProperties();
    const selectedItems = getSelectedLayers().length === 1 && getSelectedLayers()[0].type === 'component' ? getSelectedLayers()[0] : null;
    if (document.getElementById('itemsPanel')?.classList.contains('active') && shared.itemsPanelMode === 'edit') {
        if (selectedItems) renderItemsPanel(selectedItems);
        else closeItemsSetup();
    }
    updateFontPanelUI();
    updateLayerCount();
}

export // Shrinks the text content (visually, via transform) just enough that it
// never spills outside its box. Doesn't touch the stored fontSize, so the
// Font Size field in the properties panel keeps showing the true value.
function fitTextToBox(el, contentEl) {
    contentEl.style.transform = 'none';
    const currentTransform = getComputedStyle(contentEl).textTransform || 'none';
    if (currentTransform === 'uppercase') return;

    const cs = getComputedStyle(el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(0, el.clientWidth - padX);
    const availH = Math.max(0, el.clientHeight - padY);
    const naturalW = contentEl.scrollWidth;
    const naturalH = contentEl.scrollHeight;
    if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) return;
    const scale = Math.min(1, availW / naturalW, availH / naturalH);
    contentEl.style.transform = scale < 1 ? `scale(${scale})` : 'none';
}
