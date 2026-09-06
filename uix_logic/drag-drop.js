import { shared } from './main.js';
import { callBusinessApiSync, getChildren, getLayer } from './state.js';
import { getCanvasPoint, updateProp, updateStatus } from './ui.js';
import { syncLayerElement } from './render.js';
import { addLayer, dissolveIfTooSmall, recalcGroupBounds, reparentLayer } from './layers.js';

export function calculateResizeBox(layer, handlePos, localDX, localDY, locked) {
    let rawDW = 0;
    let rawDH = 0;
    switch (handlePos) {
        case 'se': rawDW = localDX; rawDH = localDY; break;
        case 'nw': rawDW = -localDX; rawDH = -localDY; break;
        case 'ne': rawDW = localDX; rawDH = -localDY; break;
        case 'sw': rawDW = -localDX; rawDH = localDY; break;
        case 'n': rawDH = -localDY; break;
        case 's': rawDH = localDY; break;
        case 'e': rawDW = localDX; break;
        case 'w': rawDW = -localDX; break;
    }

    let dW = rawDW;
    let dH = rawDH;
    if (locked) {
        let scale;
        if (rawDW !== 0 && rawDH !== 0) scale = Math.max((layer.width + rawDW) / layer.width, (layer.height + rawDH) / layer.height);
        else if (rawDW !== 0) scale = (layer.width + rawDW) / layer.width;
        else scale = (layer.height + rawDH) / layer.height;
        scale = Math.max(0.1, scale);
        dW = layer.width * scale - layer.width;
        dH = layer.height * scale - layer.height;
    }

    const growsLeft = handlePos === 'nw' || handlePos === 'w' || handlePos === 'sw';
    const growsTop = handlePos === 'nw' || handlePos === 'n' || handlePos === 'ne';
    const centerX = handlePos === 'n' || handlePos === 's';
    const centerY = handlePos === 'e' || handlePos === 'w';
    let x = layer.x;
    let y = layer.y;
    if (centerX) x -= dW / 2;
    else if (growsLeft) x -= dW;
    if (centerY) y -= dH / 2;
    else if (growsTop) y -= dH;
    return { x, y, width: Math.max(20, layer.width + dW), height: Math.max(20, layer.height + dH) };
}

export // ============================================================
// DRAG & DROP (Multi + Group Support)
// ============================================================
// NOTE: Uses Pointer Events (not mouse-only events) so mouse, touch, and
// pen all go through one consistent code path. Positions are always
// computed from the canvas-relative pointer location plus each layer's
// *original* x/y captured at drag start - never from an element's live
// getBoundingClientRect() - so the "lift" scale/shadow transform we apply
// while dragging can never throw off the math and cause a jump/snap.
function startDrag(e, id) {
    const targetLayer = getLayer(id);
    if (!targetLayer) return;

    const point = getCanvasPoint(e);

    // Layers being moved. Note: we deliberately do NOT add a group's
    // descendants here anymore. Children are positioned relative to their
    // parent group and rendered nested inside it, so moving the group
    // itself already carries every child along visually - adding them
    // here too would move them twice.
    let idsToMove = shared.selectedIds.includes(id) ? shared.selectedIds : [id];

    const originalPositions = {};
    idsToMove.forEach(mid => {
        const l = getLayer(mid);
        if (l) originalPositions[mid] = { x: l.x, y: l.y };
    });

    shared.dragData = {
        ids: idsToMove,
        pointerId: e.pointerId,
        startPointerX: point.x,
        startPointerY: point.y,
        originalPositions
    };
    shared.isDragging = true;
    idsToMove.forEach(id => {
        const layer = getLayer(id);
        if (layer) syncLayerElement(layer);
    });
}

export function fitTriggerBox(layer, handlePos) {
    const size = Math.max(6, Number(layer.fontSize) || 20);
    if (!handlePos) {
        layer.width = size;
        layer.height = size;
        return;
    }
    const box = callBusinessApiSync('resize', {
        layer,
        handlePos,
        dW: size - layer.width,
        dH: size - layer.height,
        locked: false
    });
    layer.x = box.x;
    layer.y = box.y;
    layer.width = size;
    layer.height = size;
}

export function startResize(e, id, handlePos) {
    const layer = getLayer(id);
    if (!layer) return;
    const isFlexGroup = layer.type === 'group' && layer.flexBind && layer.flexBind.enabled;
    // Snapshot children's geometry BEFORE any scaling happens. Scaling each
    // child relative to its own current (already-mutated) x/y/w/h on every
    // pointermove frame makes the scale factors compound frame-over-frame
    // (1.05 * 1.05 * 1.05...) instead of applying once relative to the
    // original size - this was the "gets weirdly bigger" bug when resizing a
    // merged/grouped shape+text layer. Text children also get their
    // starting fontSize snapshotted, so a text child scales by growing its
    // font (keeping its box snug) rather than by stretching an empty box.
    const childrenSnapshot = layer.type === 'group' && !isFlexGroup
        ? getChildren(layer.id).map(c => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height, fontSize: c.fontSize }))
        : null;
    shared.resizeData = {
        id: id,
        handlePos: handlePos || 'se',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startXPos: layer.x,
        startYPos: layer.y,
        startW: layer.width,
        startH: layer.height,
        startFontSize: layer.fontSize,
        isGroup: layer.type === 'group',
        isFlexGroup,
        childrenSnapshot
    };
    shared.isResizing = true;
    syncLayerElement(layer);
}

export function startRotate(e, id) {
    const layer = getLayer(id);
    if (!layer) return;
    const el = document.querySelector(`.shape-layer[data-id="${id}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    shared.rotateData = {
        id: id,
        pointerId: e.pointerId,
        centerX, centerY,
        startAngle,
        startRotation: layer.rotation || 0
    };
    shared.isRotating = true;
    syncLayerElement(layer);
}

export function closeImageSourceModal() {
    document.getElementById('imageSourceModal').classList.remove('active');
    shared.pendingImageBox = null;
}

export function chooseImageUpload() { document.getElementById('imageUploadInput').click(); }

function localImageName(file) {
    const baseName = String(file.name || 'image')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '') || 'image';
    const extension = baseName.includes('.') ? '' : '.png';
    return `${Date.now()}-${baseName}${extension}`;
}

async function saveImageToProjectFolder(file) {
    if (!shared.projectDirectoryHandle) return null;
    const assetsDirectory = await shared.projectDirectoryHandle.getDirectoryHandle('assets', { create: true });
    const imagesDirectory = await assetsDirectory.getDirectoryHandle('images', { create: true });
    const imageName = localImageName(file);
    const imageHandle = await imagesDirectory.getFileHandle(imageName, { create: true });
    const writable = await imageHandle.createWritable();
    await writable.write(file);
    await writable.close();
    return `assets/images/${imageName}`;
}

export async function importImageAsset(file) {
    const localSource = await saveImageToProjectFolder(file);
    if (localSource) {
        shared.localImageFiles.set(localSource, file);
        return localSource;
    }

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(file);
    });

    const response = await fetch('/api/assets/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, dataUrl })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not import image');
    shared.localImageFiles.set(result.src, file);
    return result.src;
}

export async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        updateStatus('Copying image to assets/images...');
        finalizeImageLayer(await importImageAsset(file));
    } catch (error) {
        updateStatus(error.message);
    } finally {
        e.target.value = '';
    }
}

export function chooseImageLink() {
    const url = prompt('Paste image URL:');
    if (url) finalizeImageLayer(url);
}

export function finalizeImageLayer(src) {
    if (!shared.pendingImageBox) return;
    const box = shared.pendingImageBox;
    addLayer('image', { x: box.x, y: box.y, width: box.width, height: box.height, src });
    document.getElementById('imageSourceModal').classList.remove('active');
    shared.pendingImageBox = null;
}

export // Upload/replace the image of an already-placed image layer, from the
// Properties panel (in addition to pasting a link there).
async function handlePropImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        updateStatus('Copying image to assets/images...');
        updateProp('src', await importImageAsset(file));
    } catch (error) {
        updateStatus(error.message);
    } finally {
        e.target.value = '';
    }
}

export // ============================================================
// LAYER LIST DRAG-TO-REORDER (lift-and-drop, like a file drop target)
// ============================================================
function clearDropIndicators() {
    document.querySelectorAll('.layer-item.drop-before, .layer-item.drop-after')
        .forEach(el => el.classList.remove('drop-before', 'drop-after'));
    const list = document.getElementById('layerList');
    if (list) {
        const indicator = list.querySelector('.drop-indicator');
        if (indicator) indicator.remove();
    }
}

export function startLayerItemDrag(e, item, layer) {
    clearDropIndicators();
    shared.layerDragState = {
        pointerId: e.pointerId, layerId: layer.id, item,
        startX: e.clientX, startY: e.clientY,
        moved: false, targetId: null, position: null
    };
    try { item.setPointerCapture(e.pointerId); } catch (err) { /* not all browsers need this */ }
}

export function reorderLayer(draggedId, targetId, position) {
    const dragged = getLayer(draggedId);
    const target = getLayer(targetId);
    if (!dragged || !target || dragged.id === target.id) return false;

    const oldParentId = dragged.parentId;

    if (oldParentId !== target.parentId) {
        // Cross-level drop: re-parent the dragged layer to live alongside the
        // target. Dropping next to an UNGROUPED layer pulls it out of its
        // group; dropping next to a layer that belongs to a group pulls it
        // into that group. Groups themselves are never re-parented this way,
        // to avoid accidentally nesting/cycling groups.
        if (dragged.type === 'group') return false;
        reparentLayer(dragged, target.parentId);
    }

    // The list is displayed front-to-back (top row = highest z-index), but the
    // underlying `layers` array is drawn back-to-front (later index = drawn on
    // top). So dropping "before" a row visually (above it, i.e. more toward the
    // front of the stack) means the dragged layer must land AFTER the target in
    // the array - and "after" a row visually means it lands BEFORE the target.
    const idx = shared.layers.indexOf(dragged);
    shared.layers.splice(idx, 1);
    const targetIdx = shared.layers.indexOf(target);
    const insertAt = position === 'before' ? targetIdx + 1 : targetIdx;
    shared.layers.splice(insertAt, 0, dragged);

    if (oldParentId !== target.parentId) {
        if (oldParentId !== null) dissolveIfTooSmall(oldParentId);
        if (target.parentId !== null) recalcGroupBounds(target.parentId);
    }
    return true;
}
