const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const business = require('./secrets/main.js');

const root = __dirname;
const imageDir = path.join(root, 'assets', 'images');
const publicFiles = new Set([
  'main.html',
  'main.css',
  'header.html',
  'header.css',
  'uix_logic/main.js',
  'uix_logic/state.js',
  'uix_logic/render.js',
  'uix_logic/layers.js',
  'uix_logic/export.js',
  'uix_logic/prototype.js',
  'uix_logic/ui.js',
  'uix_logic/fonts.js',
  'uix_logic/icons.js',
  'uix_logic/context-menu.js',
  'uix_logic/drag-drop.js',
  'uix_logic/history.js'
]);
const port = Number(process.env.PORT) || 3000;
const maxUploadBytes = 20 * 1024 * 1024;
const mimeToExtension = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp'
};
const googleFontsMetadataUrl = 'https://fonts.google.com/metadata/fonts';

function inferScreenIndexFromX(x, breakpoints) {
  const widths = Array.isArray(breakpoints) && breakpoints.length ? breakpoints : [900];
  const pointX = Number(x);
  if (!Number.isFinite(pointX)) return 0;
  for (let index = 0; index < widths.length; index += 1) {
    const width = Number(widths[index]);
    if (!Number.isFinite(width)) continue;
    const isLast = index === widths.length - 1;
    if ((isLast && pointX >= 0 && pointX <= width) || (!isLast && pointX >= 0 && pointX < width)) return index;
  }
  return pointX < 0 ? 0 : widths.length - 1;
}

function send(response, status, body, contentType) {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

function safeFileName(fileName, extension) {
  const base = path.basename(fileName || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'image';
  const withoutExtension = base.replace(/\.[^.]+$/, '') || 'image';
  return `${withoutExtension}-${crypto.randomBytes(4).toString('hex')}${extension}`;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxUploadBytes) throw new Error('Image is larger than 20 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function uploadImage(request, response) {
  try {
    const payload = JSON.parse(await readRequestBody(request));
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(payload.dataUrl || '');
    const extension = mimeToExtension[(match && match[1].toLowerCase()) || ''];
    if (!match || !extension) return send(response, 400, JSON.stringify({ error: 'Unsupported image format' }), 'application/json');

    await fs.mkdir(imageDir, { recursive: true });
    const fileName = safeFileName(payload.name, extension);
    await fs.writeFile(path.join(imageDir, fileName), Buffer.from(match[2], 'base64'));
    send(response, 201, JSON.stringify({ src: `assets/images/${fileName}` }), 'application/json');
  } catch (error) {
    send(response, error.message === 'Image is larger than 20 MB' ? 413 : 400, JSON.stringify({ error: error.message }), 'application/json');
  }
}

async function proxyGoogleFontsMetadata(response) {
  try {
    const upstream = await fetch(googleFontsMetadataUrl, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) return send(response, upstream.status, 'Font catalog unavailable', 'text/plain');
    const body = await upstream.text();
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
    response.end(body);
  } catch (error) {
    send(response, 502, 'Font catalog unavailable', 'text/plain');
  }
}

// ============================================================
// BUSINESS LOGIC API ENDPOINTS (hidden from browser)
// ============================================================

async function handleBusinessLogicRequest(request, response, method, url) {
  try {
    const payload = method === 'POST' ? JSON.parse(await readRequestBody(request)) : {};
    
    // POST /api/resize - Server-side resize math
    if (method === 'POST' && url === '/api/resize') {
      const { layer, handlePos, localDX, localDY, locked } = payload;
      if (!layer) return send(response, 400, JSON.stringify({ error: 'Missing layer' }), 'application/json');
      
      const { dW, dH } = Number.isFinite(payload.dW) && Number.isFinite(payload.dH)
        ? { dW: payload.dW, dH: payload.dH }
        : business.computeResizeDeltas(handlePos, localDX, localDY, layer.width, layer.height, locked);
      const resized = business.anchoredBox(handlePos, layer.x, layer.y, layer.width, layer.height, dW, dH);
      
      return send(response, 200, JSON.stringify({ x: resized.x, y: resized.y, width: resized.width, height: resized.height }), 'application/json');
    }

    // POST /api/group - Server-side group logic
    if (method === 'POST' && url === '/api/group') {
      const { selectedLayers, nextId, canvasBreakpoints } = payload;
      if (!selectedLayers || !Array.isArray(selectedLayers)) return send(response, 400, JSON.stringify({ error: 'Missing selectedLayers' }), 'application/json');
      
      let id = nextId || 1;
      const generateId = () => id++;
      const result = business.group(selectedLayers, generateId, x => inferScreenIndexFromX(x, canvasBreakpoints));
      
      if (result.error) return send(response, 400, JSON.stringify(result), 'application/json');
      return send(response, 200, JSON.stringify(result), 'application/json');
    }

    // POST /api/ungroup - Server-side ungroup logic
    if (method === 'POST' && url === '/api/ungroup') {
      const { group, breakpoints } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      
      const getLayer = (id) => payload.layers.find(l => l.id === id);
      const getChildren = (id) => payload.layers.filter(l => l.parentId === id);
      const result = business.ungroup(group, getLayer, getChildren, x => inferScreenIndexFromX(x, breakpoints));
      
      if (result.error) return send(response, 400, JSON.stringify(result), 'application/json');
      return send(response, 200, JSON.stringify(result), 'application/json');
    }

    // POST /api/recalc-bounds - Server-side group bounds calculation
    if (method === 'POST' && url === '/api/recalc-bounds') {
      const { group, layers } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      
      const getLayer = (id) => layers.find(l => l.id === id);
      const getChildren = (id) => layers.filter(l => l.parentId === id);
      const result = business.recalcGroupBounds(group, getLayer, getChildren);
      
      return send(response, 200, JSON.stringify(result), 'application/json');
    }

    // POST /api/reparent - Preserve a layer's absolute position while changing parent.
    if (method === 'POST' && url === '/api/reparent') {
      const { layer, newParentId, layers } = payload;
      if (!layer || !Array.isArray(layers)) return send(response, 400, JSON.stringify({ error: 'Missing layer data' }), 'application/json');

      const getLayer = (id) => layers.find(item => item.id === id);
      const updated = business.reparentLayer({ ...layer }, newParentId ?? null, getLayer);
      return send(response, 200, JSON.stringify({ layer: updated }), 'application/json');
    }

    // POST /api/serialize - Server-side project serialization
    if (method === 'POST' && url === '/api/serialize') {
      const { layers, state } = payload;
      if (!layers) return send(response, 400, JSON.stringify({ error: 'Missing layers' }), 'application/json');
      
      const project = business.serializeProject(layers, state);
      return send(response, 200, JSON.stringify(project), 'application/json');
    }

    // POST /api/obfuscate - Encode a project file on the server.
    if (method === 'POST' && url === '/api/obfuscate') {
      const { projectJson } = payload;
      if (typeof projectJson !== 'string') return send(response, 400, JSON.stringify({ error: 'Missing projectJson' }), 'application/json');

      return send(response, 200, JSON.stringify({ payload: business.obfuscateProject(projectJson) }), 'application/json');
    }

    // POST /api/export-html - Generate export HTML from the saved project snapshot.
    if (method === 'POST' && url === '/api/export-html') {
      const { layers, state } = payload;
      if (!Array.isArray(layers)) return send(response, 400, JSON.stringify({ error: 'Missing layers' }), 'application/json');

      return send(response, 200, JSON.stringify({ html: business.exportHTML(layers, state || {}) }), 'application/json');
    }

    // POST /api/deobfuscate - Decode an imported project file on the server.
    if (method === 'POST' && url === '/api/deobfuscate') {
      const { payload: encodedProject } = payload;
      if (typeof encodedProject !== 'string') return send(response, 400, JSON.stringify({ error: 'Missing payload' }), 'application/json');

      return send(response, 200, JSON.stringify({ projectJson: business.deobfuscateProject(encodedProject) }), 'application/json');
    }

    // POST /api/validate-flex - Server-side flex layout validation
    if (method === 'POST' && url === '/api/validate-flex') {
      const { flexBind } = payload;
      const validated = business.validateFlexLayout(flexBind);
      return send(response, 200, JSON.stringify({ flexBind: validated }), 'application/json');
    }

    // POST /api/compute-flex-styles - Server-side flex styles computation
    if (method === 'POST' && url === '/api/compute-flex-styles') {
      const { group } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      const styles = business.computeFlexStyles(group);
      return send(response, 200, JSON.stringify({ styles }), 'application/json');
    }

    // POST /api/ensure-prototype - Server-side prototype state initialization
    if (method === 'POST' && url === '/api/ensure-prototype') {
      const { group } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      const ensured = business.ensureGroupPrototype(group);
      return send(response, 200, JSON.stringify(ensured), 'application/json');
    }

    // POST /api/validate-prototype - Server-side prototype configuration validation
    if (method === 'POST' && url === '/api/validate-prototype') {
      const { config } = payload;
      const validated = business.validatePrototypeConfig(config);
      return send(response, 200, JSON.stringify({ config: validated }), 'application/json');
    }

    // POST /api/toggle-prototype-state - Toggle prototype state (pre <-> post)
    if (method === 'POST' && url === '/api/toggle-prototype-state') {
      const { group } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      const toggled = business.togglePrototypeState(group);
      return send(response, 200, JSON.stringify(toggled), 'application/json');
    }

    // POST /api/get-prototype-display - Get display property for prototype state
    if (method === 'POST' && url === '/api/get-prototype-display') {
      const { group, fallback } = payload;
      if (!group) return send(response, 400, JSON.stringify({ error: 'Missing group' }), 'application/json');
      const display = business.getPrototypeStateDisplay(group, fallback);
      return send(response, 200, JSON.stringify({ display }), 'application/json');
    }

    // Not a business logic endpoint - fall through to file serving
    return null;
  } catch (error) {
    send(response, 500, JSON.stringify({ error: error.message }), 'application/json');
  }
}

async function serveFile(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relativePath = requestPath === '/' ? 'main.html' : requestPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return send(response, 403, 'Forbidden', 'text/plain');

  const isPublicFile = publicFiles.has(relativePath);
  const isPublicImage = filePath.startsWith(`${imageDir}${path.sep}`);
  if (!isPublicFile && !isPublicImage) return send(response, 404, 'Not found', 'text/plain');

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif'
    }[extension] || 'application/octet-stream';
    send(response, 200, file, contentType);
  } catch (error) {
    send(response, error.code === 'ENOENT' ? 404 : 500, 'Not found', 'text/plain');
  }
}

const server = http.createServer(async (request, response) => {
  const { method, url } = request;

  // Handle uploads before the business API dispatcher consumes the request body.
  if (method === 'POST' && url === '/api/assets/images') return uploadImage(request, response);
  
  // Business logic endpoints (hidden from browser)
  if (method === 'POST' && url.startsWith('/api/')) {
    const handled = await handleBusinessLogicRequest(request, response, method, url);
    if (handled !== null) return;
  }
  
  // Public endpoints
  if (method === 'GET' && url === '/api/google-fonts') return proxyGoogleFontsMetadata(response);
  if (method === 'GET' || method === 'HEAD') return serveFile(request, response);
  send(response, 405, 'Method not allowed', 'text/plain');
});

function listenOnAvailablePort(candidatePort) {
  server.once('error', error => {
    if (error.code !== 'EADDRINUSE') throw error;
    listenOnAvailablePort(candidatePort + 1);
  });
  server.listen(candidatePort, () => {
    console.log(`Methalo running at http://localhost:${candidatePort}`);
  });
}

listenOnAvailablePort(port);
