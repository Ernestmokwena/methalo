import { shared } from './main.js';
import { renderProperties, updateProp } from './ui.js';
import { getSelectedLayers } from './state.js';

export function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function loadGoogleFontCatalog() {
    if (shared.googleFontsCatalogPromise) return shared.googleFontsCatalogPromise;
    shared.googleFontsCatalogPromise = fetch(shared.GOOGLE_FONTS_METADATA_URL)
        .then(response => {
            if (!response.ok) throw new Error(`Font catalog request failed: ${response.status}`);
            return response.text();
        })
        .then(raw => {
            const metadata = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
            const families = Array.isArray(metadata.familyMetadataList) ? metadata.familyMetadataList : [];
            const options = families
                .map(font => font.family)
                .filter(family => typeof family === 'string' && family.trim())
                .sort((a, b) => a.localeCompare(b))
                .map(family => ({ label: family, value: `'${family.replace(/'/g, "\\'")}', sans-serif` }));
            if (!options.length) throw new Error('Google Fonts catalog contained no families');
            shared.FONT_OPTIONS = [{ label: 'Arial (Default)', value: 'Arial, Helvetica, sans-serif' }, ...options];
            shared.googleFontsCatalogReady = true;
            if (document.getElementById('propertiesPanel')) renderProperties();
            if (document.getElementById('allFontsOverlay')?.classList.contains('active')) populateAllFontsPanel();
        })
        .catch(() => {
            shared.googleFontsCatalogPromise = null;
        });
    return shared.googleFontsCatalogPromise;
}

export function loadGoogleFontFamily(fontFamily) {
    const familyName = String(fontFamily || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
    if (!familyName || familyName === 'Arial') return;
    const id = `google-font-${familyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyName).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
}

export function preloadFontChoices(fonts) {
    fonts.forEach(font => {
        if (font && font.value) loadGoogleFontFamily(font.value);
    });
}

export function getSelectedTypographyLayer() {
    const selected = getSelectedLayers();
    return selected.length === 1 && (selected[0].type === 'text' || selected[0].type === 'component') ? selected[0] : null;
}

export function populateFontPanel() {
    const grid = document.getElementById('fontPanelGrid');
    const count = document.getElementById('fontPanelResultCount');
    if (!grid) return;
    const query = (document.getElementById('fontPanelSearch')?.value || '').trim().toLowerCase();
    const matches = shared.CORE_FONT_OPTIONS.filter(font => !query || font.label.toLowerCase().includes(query));
    const visible = matches.slice(0, 240);
    if (count) count.textContent = matches.length > visible.length ? `${matches.length} matches · showing first ${visible.length}` : `${matches.length} fonts`;
    const layer = getSelectedTypographyLayer();
    const groups = ['Core', 'Thin', 'Thick'];
    grid.innerHTML = groups.map(category => {
        const categoryFonts = visible.filter(font => (font.category || 'Core') === category);
        if (!categoryFonts.length) return '';
        const heading = category === 'Core' ? 'Quick picks' : category;
        return `<div class="font-panel-category">${heading}</div>${categoryFonts.map(font => `<button type="button" class="font-panel-option${layer && layer.fontFamily === font.value ? ' active' : ''}" data-font-value="${escapeAttribute(font.value)}" style="font-family:${escapeAttribute(font.value)}" title="${escapeAttribute(font.label)}">${escapeAttribute(font.label)}</button>`).join('')}`;
    }).join('');
    if (!visible.length) grid.innerHTML = '<div class="font-panel-empty">No fonts found</div>';
                preloadFontChoices(visible);
    grid.querySelectorAll('.font-panel-option').forEach(button => {
        button.addEventListener('click', () => {
            const value = button.dataset.fontValue;
            loadGoogleFontFamily(value);
            updateProp('fontFamily', value);
            updateFontPanelUI();
        });
    });
}

export function updateFontPanelUI() {
    const panel = document.getElementById('fontPanel');
    const layer = getSelectedTypographyLayer();
    if (!panel) return;
    panel.classList.toggle('has-selection', !!layer);
    if (!layer) return;
    const preview = document.getElementById('fontPanelPreview');
    if (preview) {
        preview.textContent = 'Methalo';
        preview.style.fontFamily = layer.fontFamily || 'Arial, Helvetica, sans-serif';
        preview.style.fontSize = `${Math.min(48, Math.max(22, Number(layer.fontSize) || 28))}px`;
        preview.style.fontWeight = layer.fontWeight || '400';
        preview.style.fontStyle = layer.fontStyle || 'normal';
        preview.style.textDecoration = layer.textDecoration || 'none';
        preview.style.textAlign = layer.textAlign || 'left';
    }
    const size = document.getElementById('fontPanelSize');
    const weight = document.getElementById('fontPanelWeight');
    const textCase = document.getElementById('fontPanelCase');
    const color = document.getElementById('fontPanelColor');
    if (size) size.value = layer.fontSize || 16;
    if (weight) weight.value = layer.fontWeight || '400';
    if (textCase) textCase.value = layer.textTransform || 'none';
    if (color) color.value = /^#[0-9a-f]{6}$/i.test(layer.color || '') ? layer.color : '#1e293b';
    panel.querySelectorAll('[data-text-style]').forEach(button => button.classList.toggle('active', (layer[button.dataset.textStyle] || 'normal') === button.dataset.value));
    populateFontPanel();
}

export function toggleFontPanel(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('fontPanel');
    if (!panel) return;
    updateFontPanelUI();
    panel.classList.toggle('active');
    document.getElementById('fontPanelToggle')?.classList.toggle('active', panel.classList.contains('active'));
    loadGoogleFontCatalog();
}

export function closeFontPanel() {
    document.getElementById('fontPanel')?.classList.remove('active');
    document.getElementById('fontPanelToggle')?.classList.remove('active');
}

export function populateAllFontsPanel() {
    const grid = document.getElementById('allFontsGrid');
    const count = document.getElementById('allFontsResultCount');
    if (!grid) return;
    const query = (document.getElementById('allFontsSearch')?.value || '').trim().toLowerCase();
    const matches = shared.FONT_OPTIONS.filter(font => !query || font.label.toLowerCase().includes(query));
    const layer = getSelectedTypographyLayer();
    const visible = matches.slice(0, shared.allFontsVisibleCount);
    if (count) count.textContent = `${visible.length} of ${matches.length} fonts loaded`;
    preloadFontChoices(visible);
    grid.innerHTML = visible.map(font => `<button type="button" class="all-font-option${layer && layer.fontFamily === font.value ? ' active' : ''}" data-font-value="${escapeAttribute(font.value)}" style="font-family:${escapeAttribute(font.value)}" title="${escapeAttribute(font.label)}">${escapeAttribute(font.label)}</button>`).join('');
    if (!matches.length) grid.innerHTML = '<div class="font-panel-empty">No fonts found</div>';
    const loadMore = document.getElementById('allFontsLoadMore');
    const retry = document.getElementById('allFontsRetry');
    if (loadMore) {
        const remaining = matches.length - visible.length;
        loadMore.hidden = remaining <= 0;
        loadMore.disabled = false;
        loadMore.querySelector('span:last-child').textContent = remaining > 0 ? `Load ${Math.min(shared.ALL_FONTS_BATCH_SIZE, remaining)} more` : 'All fonts loaded';
    }
    if (retry) retry.classList.remove('active');
    grid.querySelectorAll('.all-font-option').forEach(button => {
        button.addEventListener('click', () => {
            const value = button.dataset.fontValue;
            loadGoogleFontFamily(value);
            updateProp('fontFamily', value);
            populateAllFontsPanel();
        });
    });
}

export function loadMoreAllFonts() {
    const button = document.getElementById('allFontsLoadMore');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.classList.add('loading');
    button.querySelector('span:last-child').textContent = 'Loading...';
    requestAnimationFrame(() => {
        shared.allFontsVisibleCount += shared.ALL_FONTS_BATCH_SIZE;
        populateAllFontsPanel();
        button.classList.remove('loading');
    });
}

export function openAllFontsPanel() {
    const overlay = document.getElementById('allFontsOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    const grid = document.getElementById('allFontsGrid');
    const count = document.getElementById('allFontsResultCount');
    const retry = document.getElementById('allFontsRetry');
    shared.allFontsVisibleCount = shared.ALL_FONTS_BATCH_SIZE;
    if (!shared.googleFontsCatalogReady) {
        if (count) count.textContent = 'Loading all fonts...';
        if (grid) grid.innerHTML = '<div class="font-panel-empty">Loading all fonts...</div>';
        retry?.classList.remove('active');
    } else {
        populateAllFontsPanel();
    }
    loadGoogleFontCatalog().then(() => {
        if (shared.googleFontsCatalogReady) {
            populateAllFontsPanel();
            return;
        }
        if (count) count.textContent = 'The full font catalog could not be loaded';
        if (grid) grid.innerHTML = '<div class="font-panel-empty">Check your connection and try again.</div>';
        retry?.classList.add('active');
    });
    document.getElementById('allFontsSearch')?.focus();
}

export function retryAllFontsPanel() {
    shared.googleFontsCatalogPromise = null;
    shared.googleFontsCatalogReady = false;
    openAllFontsPanel();
}

export function closeAllFontsPanel() {
    const overlay = document.getElementById('allFontsOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

export function updateFontPanelProperty(key, value) {
    const layer = getSelectedTypographyLayer();
    if (!layer) return;
    updateProp(key, value);
    updateFontPanelUI();
}

export function toggleFontStyle(button) {
    const layer = getSelectedTypographyLayer();
    if (!layer) return;
    const key = button.dataset.textStyle;
    const value = button.dataset.value;
    const normalValue = key === 'fontWeight' ? '400' : key === 'fontStyle' ? 'normal' : key === 'textDecoration' ? 'none' : 'left';
    updateFontPanelProperty(key, String(layer[key] || normalValue) === value ? normalValue : value);
}
