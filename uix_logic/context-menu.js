import { shared } from './main.js';

import {
    closePageTab,
    getPageTabs,
    newPage,
    openFlexPanel,
    openGroupFeaturesPanel,
    renamePageTab,
    showRenameDialog,
    unbindFlex,
    updateStatus,
} from './ui.js';

import { closePrototypePanel, getPrototypePanelAnchor, openPrototypePanel } from './prototype.js';

import {
    getChildren,
    getLayer,
    getLayerDescendants,
    getSelectedLayers,
    isLayerIncluded,
    savePageState,
    setLayerIncluded,
} from './state.js';

import {
    alignSelectedInGroup,
    generateId,
    groupSelected,
    normalizeCanvasBreakpoints,
    ungroupSelected,
} from './layers.js';

import { escapeAttribute } from './fonts.js';
import { saveHistory } from './history.js';
import { fitTextBox, measureTextSize, render } from './render.js';

export function openPageTabContextMenu(pageName, x, y) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    const tabs = getPageTabs();
    const totalTabs = tabs.length;
    const canDelete = totalTabs > 1;
    const safePage = pageName || (tabs[0] && tabs[0].dataset.page) || 'home';
    shared.pageTabContextMenuPage = safePage;
    menu.dataset.mode = 'page-tab';

    menu.innerHTML = `
        <div class="context-item" data-tab-action="newPage"><span class="material-symbols-outlined">add</span>New page</div>
        <div class="context-item" data-tab-action="renamePage" data-page="${safePage}"><span class="material-symbols-outlined">edit</span>Rename page</div>
        <div class="context-divider"></div>
        <div class="context-item ${canDelete ? '' : 'disabled'}" data-tab-action="deletePage" data-page="${safePage}" ${canDelete ? '' : 'aria-disabled="true"'}>
            <span class="material-symbols-outlined">delete</span>Delete page
        </div>
    `;

    menu.querySelectorAll('[data-tab-action]').forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const action = item.dataset.tabAction;
            if (action === 'newPage') {
                newPage();
            } else if (action === 'renamePage') {
                renamePageTab(safePage);
            } else if (action === 'deletePage' && canDelete) {
                closePageTab(safePage);
            }
            closeContextMenu();
        });
    });

    menu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
    menu.style.right = 'auto';
    menu.classList.add('active');
}

export function openContextMenu(x, y) {
    shared.lastContextMenuPos = { x, y };
    closePrototypePanel();
    const selected = getSelectedLayers();
    const isGroupSelected = selected.length === 1 && selected[0].type === 'group';
    const isFlexBound = isGroupSelected && !!(selected[0].flexBind && selected[0].flexBind.enabled);
    const hasSelection = selected.length > 0;

    // Enable/Disable items
    document.querySelectorAll('.context-item').forEach(el => {
        const action = el.getAttribute('onclick').replace("contextAction('", "").replace("')", "");
        let disabled = false;

        if (action === 'group' && selected.length < 2) disabled = true;
        if (action === 'ungroup' && !isGroupSelected) disabled = true;
        if (action === 'editGroupName' && !isGroupSelected) disabled = true;
        if ((action === 'hide' || action === 'rename') && !hasSelection) disabled = true;
        if (action === 'show' && !selected.some(l => !l.visible)) disabled = true;
        if (action === 'duplicate' && !hasSelection) disabled = true;
        if (['textUpper', 'textLower', 'textCamel'].includes(action)) disabled = !(selected.length === 1 && selected[0].type === 'text');
        if (action === 'bindLayout' && !isGroupSelected) disabled = true;
        if (action === 'unbindLayout' && !isFlexBound) disabled = true;
        if (action === 'groupFeatures' && !isGroupSelected) disabled = true;
        if (action === 'prototype' && !isGroupSelected) disabled = true;
        if (['alignLeft', 'alignRight', 'alignTop', 'alignBottom', 'alignCenter'].includes(action)) {
            disabled = true;
            if (selected.length === 1) {
                const parent = getLayer(selected[0].parentId);
                if (parent && parent.type === 'group' && !(parent.flexBind && parent.flexBind.enabled)) disabled = false;
            }
        }

        if (disabled) el.classList.add('disabled');
        else el.classList.remove('disabled');
    });

    const menuTop = 16;
    const menuRight = 16;
    shared.contextMenu.style.left = 'auto';
    shared.contextMenu.style.right = menuRight + 'px';
    shared.contextMenu.style.top = menuTop + 'px';
    shared.contextMenu.classList.add('active');
}

export function openIncludeInMenu() {
    const selected = getSelectedLayers();
    if (!selected.length) return;

    const canvasItems = normalizeCanvasBreakpoints(shared.canvasBreakpoints).map((width, index) => {
        const allIncluded = selected.every(layer => isLayerIncluded(layer, index));
        return `<div class="context-item" data-include-canvas="${index}"><span class="material-symbols-outlined">${allIncluded ? 'check_box' : 'check_box_outline_blank'}</span>Canvas ${index + 1} (${width}px)</div>`;
    }).join('');
    const pageItems = Object.keys(shared.pages).map(pageName => {
        const label = pageName === shared.currentPage ? `${pageName} (current)` : pageName;
        const disabled = pageName === shared.currentPage ? ' disabled' : '';
        return `<div class="context-item${disabled}" data-include-page="${escapeAttribute(pageName)}"><span class="material-symbols-outlined">content_copy</span>${escapeAttribute(label)}</div>`;
    }).join('');

    shared.contextMenu.dataset.mode = 'include-in';
    shared.contextMenu.innerHTML = `
        <div class="context-item disabled"><span class="material-symbols-outlined">add_box</span>Include selected layer${selected.length > 1 ? 's' : ''} in</div>
        <div class="context-divider"></div>
        ${canvasItems}
        <div class="context-divider"></div>
        <div class="context-item disabled"><span class="material-symbols-outlined">web</span>Existing pages</div>
        ${pageItems}
        <div class="context-divider"></div>
        <div class="context-item" data-include-close><span class="material-symbols-outlined">arrow_back</span>Back</div>
    `;
    shared.contextMenu.querySelectorAll('[data-include-canvas]').forEach(item => {
        item.addEventListener('click', () => {
            const index = Number(item.dataset.includeCanvas);
            const include = !selected.every(layer => isLayerIncluded(layer, index));
            selected.forEach(layer => {
                setLayerIncluded(layer, index, include);
                getLayerDescendants(layer.id).forEach(child => setLayerIncluded(child, index, include));
            });
            saveHistory();
            render();
            closeContextMenu();
            updateStatus(`${include ? 'Included in' : 'Removed from'} canvas ${index + 1}`);
        });
    });
    shared.contextMenu.querySelectorAll('[data-include-page]').forEach(item => {
        item.addEventListener('click', () => {
            includeSelectionInPage(item.dataset.includePage, selected);
            closeContextMenu();
        });
    });
    shared.contextMenu.querySelector('[data-include-close]').addEventListener('click', () => {
        closeContextMenu();
        openContextMenu(shared.lastContextMenuPos.x, shared.lastContextMenuPos.y);
    });
}

export function includeSelectionInPage(pageName, selected) {
    const targetPage = shared.pages[pageName];
    if (!targetPage || pageName === shared.currentPage) return;

    savePageState(shared.currentPage);
    const sourceLayers = JSON.parse(JSON.stringify(shared.layers));
    const selectedIdsSet = new Set(selected.map(layer => layer.id));
    const roots = sourceLayers.filter(layer => selectedIdsSet.has(layer.id) &&
        (layer.parentId === null || !selectedIdsSet.has(layer.parentId)));
    const cloneTree = (source, parentId) => {
        const clone = JSON.parse(JSON.stringify(source));
        clone.id = targetPage.nextId++;
        clone.parentId = parentId;
        clone.includedInCanvases = {};
        normalizeCanvasBreakpoints(targetPage.canvasBreakpoints).forEach((_, index) => setLayerIncluded(clone, index, true));
        targetPage.layers.push(clone);
        sourceLayers.filter(layer => layer.parentId === source.id)
            .forEach(child => cloneTree(child, clone.id));
    };
    roots.forEach(root => cloneTree(root, null));
    targetPage.history = targetPage.history.slice(0, targetPage.historyIndex + 1);
    targetPage.history.push(JSON.stringify(targetPage.layers));
    targetPage.historyIndex = targetPage.history.length - 1;
    updateStatus(`Included layer${roots.length > 1 ? 's' : ''} in ${pageName}`);
}

export function closeContextMenu() {
    shared.contextMenu.classList.remove('active');
    if (shared.contextMenu.dataset.mode !== '') {
        shared.contextMenu.dataset.mode = '';
        shared.contextMenu.innerHTML = shared.defaultContextMenuHtml;
    }
    shared.pageTabContextMenuPage = null;
}

export // Inline rename: double-click/double-tap a layer's name in the list to
// swap it for a text input with a blinking caret, right there in place.
function startRenameLayer(layer, nameSpan) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'layer-name-input';
    input.value = layer.name || '';

    const commit = () => {
        const newName = input.value.trim();
        if (newName !== '') { layer.name = newName; saveHistory(); }
        render();
    };

    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); input.value = layer.name || ''; input.blur(); }
    });
    input.addEventListener('blur', commit, { once: true });

    nameSpan.replaceWith(input);
    input.focus();
    input.select();
}

export function contextAction(action) {
    const selected = getSelectedLayers();

    closeContextMenu();

    switch (action) {
        case 'group': groupSelected(); break;
        case 'ungroup': ungroupSelected(); break;
        case 'hide':
            selected.forEach(l => { l.visible = false; });
            saveHistory(); render(); updateStatus('Hidden layers');
            break;
        case 'show':
            selected.forEach(l => { l.visible = true; });
            saveHistory(); render(); updateStatus('Shown layers');
            break;
        case 'rename':
            if (selected.length === 0) return;
            showRenameDialog({
                title: 'Rename layer',
                label: 'Layer name',
                currentValue: selected[0].name || 'Layer',
                confirmText: 'Rename',
                onConfirm: (newName) => {
                    selected.forEach(l => { l.name = newName; });
                    saveHistory(); render(); updateStatus('Renamed layer');
                }
            });
            break;
        case 'textUpper':
            applyTextTransform('upper');
            break;
        case 'textLower':
            applyTextTransform('lower');
            break;
        case 'textCamel':
            applyTextTransform('camel');
            break;
        case 'editGroupName':
            if (selected.length === 1 && selected[0].type === 'group') {
                showRenameDialog({
                    title: 'Rename section',
                    label: 'Section name',
                    currentValue: selected[0].name || 'Group',
                    confirmText: 'Rename',
                    onConfirm: (newGroupName) => {
                        selected[0].name = newGroupName;
                        saveHistory(); render(); updateStatus('Group renamed');
                    }
                });
            }
            break;
        case 'duplicate':
            duplicateSelected();
            break;
        case 'includeIn':
            if (selected.length) openIncludeInMenu();
            break;
        case 'bindLayout':
            if (selected.length === 1 && selected[0].type === 'group') {
                const group = selected[0];
                const nestedFlexGroups = getLayerDescendants(group.id)
                    .filter(layer => layer.type === 'group' && layer.flexBind && layer.flexBind.enabled);
                let flexParent = null;
                let ancestor = group.parentId !== null ? getLayer(group.parentId) : null;
                while (ancestor) {
                    if (ancestor.type === 'group' && ancestor.flexBind && ancestor.flexBind.enabled) {
                        flexParent = ancestor;
                        break;
                    }
                    ancestor = ancestor.parentId !== null ? getLayer(ancestor.parentId) : null;
                }

                if (nestedFlexGroups.length || flexParent) {
                    const warning = nestedFlexGroups.length
                        ? 'This group contains a flex-bound group. Binding it creates nested flex layouts, which can change spacing and sizing. Continue?'
                        : 'This group is inside a flex-bound group. Binding it creates nested flex layouts, which can change spacing and sizing. Continue?';
                    if (!window.confirm(warning)) {
                        updateStatus('Flex binding cancelled');
                        break;
                    }
                }
                openFlexPanel(selected[0].id, shared.lastContextMenuPos.x, shared.lastContextMenuPos.y);
            }
            break;
        case 'unbindLayout':
            if (selected.length === 1 && selected[0].type === 'group') {
                shared.flexPanelGroupId = selected[0].id;
                unbindFlex();
            }
            break;
        case 'groupFeatures':
            if (selected.length === 1 && selected[0].type === 'group') {
                openGroupFeaturesPanel(selected[0].id, shared.lastContextMenuPos.x, shared.lastContextMenuPos.y);
            }
            break;
        case 'prototype':
            if (selected.length === 1 && selected[0].type === 'group') {
                const anchor = getPrototypePanelAnchor();
                openPrototypePanel(selected[0].id, anchor.x, anchor.y);
            }
            break;
        case 'alignLeft':
        case 'alignRight':
        case 'alignTop':
        case 'alignBottom':
        case 'alignCenter':
            alignSelectedInGroup(action);
            break;
    }
}

export function applyTextTransform(mode) {
    const selected = getSelectedLayers().filter(layer => layer.type === 'text');
    if (selected.length === 0) return;

    selected.forEach(layer => {
        const safeMode = mode === 'upper' || mode === 'lower' || mode === 'camel' ? mode : 'none';
        layer.textTransform = safeMode;

        const transformedSize = measureTextSize(layer.content, layer.fontSize, layer.fontFamily, safeMode);
        const wouldClip = transformedSize.width > layer.width || transformedSize.height > layer.height;
        if (wouldClip) {
            layer.lockAspect = true;
            fitTextBox(layer);
        }
    });

    saveHistory();
    render();
    updateStatus('Text styling updated');
}

export // ============================================================
// DUPLICATE
// ============================================================
function cloneSelectionForCopy(selected) {
    const selectedIdSet = new Set(selected.map(l => l.id));
    const topSelected = selected.filter(l => !(l.parentId !== null && selectedIdSet.has(l.parentId)));

    const clonedEntries = [];
    const cloneLayer = (layer, newParentId) => {
        const clone = JSON.parse(JSON.stringify(layer));
        clone.id = generateId();
        clone.parentId = newParentId;
        clone.name = (layer.name || `${layer.type} ${layer.id}`) + ' copy';
        return clone;
    };

    topSelected.forEach(orig => {
        const topClone = cloneLayer(orig, orig.parentId);
        clonedEntries.push({ orig, clone: topClone });

        const cloneDescendants = (origParentId, newParentId) => {
            getChildren(origParentId).forEach(child => {
                const childClone = cloneLayer(child, newParentId);
                clonedEntries.push({ orig: child, clone: childClone });
                if (child.type === 'group') cloneDescendants(child.id, childClone.id);
            });
        };
        if (orig.type === 'group') cloneDescendants(orig.id, topClone.id);
    });

    return clonedEntries;
}

export function copySelected() {
    const selected = getSelectedLayers();
    if (selected.length === 0) return;

    const clonedEntries = cloneSelectionForCopy(selected);
    shared.clipboardLayers = clonedEntries.map(entry => entry.clone);
    updateStatus(shared.clipboardLayers.length > 1 ? 'Copied layers' : 'Copied layer');
}

export function pasteSelected() {
    if (!shared.clipboardLayers || shared.clipboardLayers.length === 0) return;

    const idMap = new Map();
    const pastedIds = [];
    const offsetX = 24;
    const offsetY = 24;

    shared.clipboardLayers.forEach(layer => {
        const clone = JSON.parse(JSON.stringify(layer));
        const newId = generateId();
        idMap.set(layer.id, newId);
        clone.id = newId;
        clone.parentId = layer.parentId === null ? null : idMap.get(layer.parentId) || null;
        clone.x = (Number(layer.x) || 0) + offsetX;
        clone.y = (Number(layer.y) || 0) + offsetY;
        shared.layers.push(clone);
        pastedIds.push(newId);
    });

    shared.selectedIds = pastedIds;
    saveHistory();
    render();
    updateStatus(pastedIds.length > 1 ? 'Pasted layers' : 'Pasted layer');
}

export // Deep-clones each selected layer (and, for a group, its whole
// descendant tree) with fresh ids, and splices each duplicate directly
// after its original in the array - since the layer list renders
// highest-index-first, that's exactly "directly above the original" in
// the panel, with no visual (x/y) offset on canvas.
function duplicateSelected() {
    const selected = getSelectedLayers();
    if (selected.length === 0) return;

    const clonedEntries = cloneSelectionForCopy(selected);
    const newSelection = [];

    clonedEntries.forEach(({ orig, clone }) => {
        const origIndex = shared.layers.indexOf(orig);
        if (origIndex >= 0) {
            shared.layers.splice(origIndex + 1, 0, clone);
        } else {
            shared.layers.push(clone);
        }
        newSelection.push(clone.id);
    });

    shared.selectedIds = newSelection;
    saveHistory();
    render();
    updateStatus(newSelection.length > 1 ? 'Duplicated layers' : 'Duplicated layer');
}
