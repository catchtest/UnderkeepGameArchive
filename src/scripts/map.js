'use strict';

const underkeepMaps = new Map();

function underkeepMapId(hash) {
  const id = hash.slice(1).split('@', 1)[0];
  return Object.hasOwn(underkeepMapNames, id) ? id : 'Starting_forest';
}

function registerUnderkeepMap({ objects, markers, ...map }) {
  const sharedObjects = window.UNDERKEEP_ATLAS.objects;
  const points = markers.map(({ key, detail, detailOrder, itemLinks, ...placement }) => {
    const object = objects[key] ?? sharedObjects[key];
    const point = { destination: null, ...object, ...placement, key };
    point.detail = detail ? { ...object.detail, ...detail } : object.detail || {};
    if (detailOrder) point.detail = Object.fromEntries(detailOrder.map(field => [field, point.detail[field]]));
    if (itemLinks) point.itemLinks = { ...object.itemLinks, ...itemLinks };
    return point;
  });
  const markersById = new Map(points.map(point => [point.id, point]));
  for (const point of points) {
    for (const field of ['targets', 'sources']) {
      point[field] = (point[field] || []).map(([id, commands]) => {
        const { xy, title, code } = map.referencePoints?.[id] || markersById.get(id);
        return { id, xy, title, code, commands };
      });
    }
  }
  underkeepMaps.set(map.id, { ...map, markers: points });
}

function mountUnderkeepAtlas(signal, loadDetails) {
  const byId = id => document.getElementById(id);
  const atlas = window.UNDERKEEP_ATLAS;
  const svg = byId('map-svg');
  const nspace = 'http://www.w3.org/2000/svg';
  const layerTypes = { ...atlas.types, puzzle: ['{{t:maps.ui.puzzle-area|sq}}', '', '', true] };
  const typeKeys = Object.keys(layerTypes);
  const layerStorageKey = 'underkeep.atlas.layers';
  const zoomStorageKey = 'underkeep.atlas.zoom';
  const secretWallSprite = 'secret_wall_tile';
  const buildingSignPrefix = 'mtile_sign_';
  const buildingSignSize = Math.max(...Object.entries(atlas.art)
    .filter(([key]) => key.startsWith(buildingSignPrefix))
    .map(([, [, width, height]]) => Math.max(width, height)));
  const dungeonEntrance = new Map();
  for (const [entrance, children] of Object.entries(atlas.dungeons)) {
    for (const child of children) dungeonEntrance.set(child, entrance);
  }

  let current;
  let markersById;
  let active = loadLayers();
  let scalableSprites = [];
  let laidOutZoom;
  let puzzleLayer;
  let markerLayer;
  let selectedLayer;
  let selected = null;
  const defaultZoom = window.matchMedia('(max-width: 600px), (pointer: coarse)').matches ? 6 : 3;
  const maxZoom = 9;
  let magnification = loadZoom();
  let camera;
  let view;
  let paperFill;
  let hoverFrame;
  let plotted = new Map();
  let hoveredCell = '';
  let wheelTime = -Infinity;
  const stage = byId('stage');
  const tooltip = byId('map-tip');
  const drawers = {
    maps: { panel: byId('maps-drawer'), toggle: byId('maps-toggle'), focus: byId('map-query') },
    layers: { panel: byId('layers-drawer'), toggle: byId('layers-toggle'), focus: byId('reset-types') },
    details: { panel: byId('details-drawer') }
  };
  let openDrawer = null;
  const rubbleLayers = new Set(['rubble', 'hard-rubble']);
  const miningLayers = new Set([...rubbleLayers, 'gold-vein']);
  const drawOrder = [...rubbleLayers, 'passage', 'travel', 'event', 'acquire', 'treasure', 'boss', 'secret',
    'trap', 'service', 'mechanism', 'gather', 'item', 'enemy', 'trigger', 'note', 'location', 'junk', 'gold-vein'];
  let drag = null;
  let pending = null;

  function defaultLayers() {
    return new Set(typeKeys.filter(key => layerTypes[key][3]));
  }

  function loadLayers() {
    let saved;
    try {
      saved = JSON.parse(window.localStorage.getItem(layerStorageKey));
    } catch {
      return defaultLayers();
    }
    return new Set(typeKeys.filter(key => typeof saved?.[key] === 'boolean' ? saved[key] : layerTypes[key][3]));
  }

  function saveLayer(key) {
    try {
      const settings = loadLayers();
      if (active.has(key)) settings.add(key);
      else settings.delete(key);
      const overrides = typeKeys.filter(type => settings.has(type) !== layerTypes[type][3]);
      if (overrides.length) {
        const values = Object.fromEntries(overrides.map(type => [type, settings.has(type)]));
        window.localStorage.setItem(layerStorageKey, JSON.stringify(values));
      } else window.localStorage.removeItem(layerStorageKey);
    } catch {
      // Layer controls still work when browser storage is unavailable.
    }
  }

  function loadZoom() {
    try {
      const saved = Number(window.localStorage.getItem(zoomStorageKey));
      if (Number.isInteger(saved) && saved >= 1 && saved <= maxZoom) return saved;
    } catch {
      // The default zoom still works when browser storage is unavailable.
    }
    return defaultZoom;
  }

  function saveZoom() {
    try {
      window.localStorage.setItem(zoomStorageKey, String(magnification));
    } catch {
      // Zoom controls still work when browser storage is unavailable.
    }
  }

  function draw(tag, props, parent, text) {
    const node = document.createElementNS(nspace, tag);
    for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }

  function drawCellFrame(props, parent) {
    return draw('rect', { class: 'cell-frame', width: .9, height: .9, ...props }, parent);
  }

  function placeCellFrame(frame, x, y) {
    // The first of the ten terrain pixels is the grid line on each axis.
    frame.setAttribute('x', x + .1);
    frame.setAttribute('y', y + .1);
  }

  function isInitiallyAbsent(point) {
    return point.detail?.['{{t:common.initial-state|sq}}'] === '{{t:common.hidden|sq}}' || Boolean(point.detail?.['{{t:common.spawn-condition|sq}}']);
  }

  function symbol(type, sprite = atlas.legendIcons[type], initiallyAbsent = false) {
    const [label] = layerTypes[type];
    const tag = underkeepElement('span', undefined, 'symbol');
    tag.setAttribute('aria-hidden', 'true');
    if (type === 'puzzle') {
      tag.classList.add('puzzle-symbol');
      return tag;
    }
    if (type === 'location') {
      tag.textContent = '{{t:maps.ui.symbol|sq}}';
      return tag;
    }
    const art = underkeepElement('img');
    if (type === 'boss') art.className = 'boss-icon';
    if (sprite === secretWallSprite) art.className = 'secret-wall';
    if (initiallyAbsent) art.style.opacity = '.5';
    art.loading = 'lazy';
    art.src = atlas.art[sprite][0];
    art.alt = '';
    tag.append(art);
    tag.title = label;
    return tag;
  }

  function nativeSprite(point) {
    const sprite = point.sprite;
    if (point.native) return point.native;
    return sprite === 'mtile_enemy' || sprite === 'mtile_enemy_friend' || sprite === 'mtile_enemy_neutral' ? sprite : null;
  }

  function addSvgSprites() {
    const definitions = draw('defs', {}, svg);
    const extras = new Set([atlas.legendIcons.event]);
    const native = new Set(['mtile_symbol_default']);
    scalableSprites = [];
    laidOutZoom = null;
    for (const point of current.markers) {
      const key = nativeSprite(point);
      if (key) native.add(key);
      else if (point.type !== 'location') extras.add(point.sprite);
    }
    for (const key of native) {
      const [href, width, height] = atlas.nativeArt[key];
      const symbol = draw('symbol', { id: 'game-icon-' + key, viewBox: '0 0 ' + width + ' ' + height }, definitions);
      draw('image', { href, width, height, style: 'image-rendering:pixelated' }, symbol);
    }
    for (const key of extras) {
      const [href, width, height] = atlas.art[key];
      const group = draw('g', { id: 'atlas-icon-' + key }, definitions);
      const picture = draw('image', { href, style: 'image-rendering:pixelated' }, group);
      scalableSprites.push({ key, picture, width, height });
    }
  }

  function extraSpriteFit(key) {
    const [, width, height] = atlas.art[key];
    const tileLimit = magnification * 10 - 2;
    // Use the widest building sign to choose one scale for all signs.
    if (key.startsWith(buildingSignPrefix)) return tileLimit / buildingSignSize;
    return Math.min(tileLimit, magnification * 9) / Math.max(width, height);
  }

  function questSprite(key) {
    return extraSpriteFit(key) < 1 ? atlas.legendIcons.event : key;
  }

  function layoutExtraSprites() {
    if (laidOutZoom === magnification) return;
    laidOutZoom = magnification;
    const pitch = magnification * 10;
    const minimumLabelSize = 12 * (window.devicePixelRatio || 1) / pitch;
    svg.style.setProperty('--place-size', Math.max(.78, minimumLabelSize) + 'px');
    for (const { key, picture, width, height } of scalableSprites) {
      const ratio = extraSpriteFit(key);
      const multiplier = ratio < 1 ? ratio : Math.floor(ratio);
      const pixelsWide = width * multiplier;
      const pixelsHigh = height * multiplier;
      picture.setAttribute('width', pixelsWide / pitch);
      picture.setAttribute('height', pixelsHigh / pitch);
      // The terrain's top and left grid lines occupy the first native pixel of each tile.
      const left = Math.min(Math.round((pitch + magnification - pixelsWide) / 2), pitch - pixelsWide);
      const top = Math.min(Math.round((pitch + magnification - pixelsHigh) / 2), pitch - pixelsHigh);
      picture.setAttribute('x', left / pitch);
      picture.setAttribute('y', top / pitch);
    }
    for (const element of svg.querySelectorAll('use[data-quest-sprite]')) {
      element.setAttribute('href', '#atlas-icon-' + questSprite(element.dataset.questSprite));
    }
  }

  function plot(point) {
    return point.displayXY || point.xy;
  }

  function drawPlaceName(point, parent) {
    const [x, y] = plot(point);
    const anchor = point.align === 0 ? 'middle' : point.align < 0 ? 'start' : 'end';
    return draw('text', { x: x + .5, y: y + .72, 'text-anchor': anchor, class: 'place-name' }, parent, point.title);
  }

  function drawPointSprite(point, parent) {
    const [x, y] = plot(point);
    const native = nativeSprite(point);
    const angle = point.native ? point.nativeRotation : point.rotation;
    const attrs = { x, y, 'pointer-events': 'none' };
    if (point.type === 'boss') attrs.class = 'boss-icon';
    if (point.sprite === secretWallSprite) attrs.class = 'secret-wall';
    if (isInitiallyAbsent(point)) attrs.opacity = .5;
    if (native) {
      const [, width, height, pivotX, pivotY] = atlas.nativeArt[native];
      Object.assign(attrs, { href: '#game-icon-' + native, x: x - pivotX / 10, y: y - pivotY / 10,
        width: width / 10, height: height / 10 });
    } else {
      const key = point.type === 'event' ? questSprite(point.sprite) : point.sprite;
      attrs.href = '#atlas-icon-' + key;
      if (point.type === 'event') attrs['data-quest-sprite'] = point.sprite;
    }
    // These rotations reverse the passage sprite across the corridor's one-pixel grid edge.
    if ((native || point.sprite) === 'mtile_passage' && (angle === 180 || angle === 270)) attrs.x -= .1;
    if (angle) attrs.transform = 'rotate(' + angle + ' ' + (x + .5) + ' ' + (y + .5) + ')';
    return draw('use', attrs, parent);
  }

  function locationName() {
    const fragment = window.location.hash.slice(1);
    const [, entry] = fragment.split('@');
    const xy = /^-?\d+,-?\d+$/.test(entry || '') ? entry.split(',').map(Number) : null;
    return { id: underkeepMapId(window.location.hash), entry: entry === undefined ? null : Number(entry), xy };
  }

  function renderCatalog() {
    const catalog = byId('catalog');
    const needle = byId('map-query').value.trim().toLocaleLowerCase();
    const children = [];
    const openDungeon = dungeonEntrance.get(current.id) || current.id;
    for (const group of atlas.groups) {
      const section = underkeepElement('section', undefined, 'group');
      const maps = group.maps.filter(id => !dungeonEntrance.has(id)).flatMap(id =>
        id === openDungeon ? [id, ...(atlas.dungeons[id] || [])] : [id]);
      const matched = maps.filter(id => {
        return [id, ...underkeepMapNames[id], group.name].join(' ').toLocaleLowerCase().includes(needle);
      });
      if (!matched.length) continue;
      section.append(underkeepElement('h3', group.name));
      for (const id of matched) {
        const [name] = underkeepMapNames[id];
        const link = underkeepElement('a', name, 'map-link');
        if (dungeonEntrance.has(id)) link.classList.add('submap');
        link.href = '#' + id;
        if (id === current.id) link.setAttribute('aria-current', 'page');
        section.append(link);
      }
      children.push(section);
    }
    catalog.replaceChildren(...children);
    if (!children.length) catalog.append(underkeepElement('p', '{{t:maps.ui.render-catalog|sq}}', 'empty'));
  }

  function renderFilters() {
    for (const key of typeKeys) {
      byId('filter-' + key).setAttribute('aria-pressed', active.has(key));
    }
    puzzleLayer?.toggleAttribute('hidden', !active.has('puzzle'));
  }

  function connect(label, callback, className = 'jump') {
    const button = underkeepElement('button', label, className);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  function setDrawer(name, focus = false) {
    const previous = openDrawer;
    openDrawer = name;
    for (const [key, { panel, toggle }] of Object.entries(drawers)) {
      const open = key === name;
      panel.hidden = !open;
      toggle?.setAttribute('aria-expanded', String(open));
    }
    clearHover();
    updatePuzzleSelection();
    if (focus) {
      const target = name ? drawers[name] : drawers[previous];
      let next = name ? target.focus : target?.toggle || stage;
      if (name && (!next || window.matchMedia('(pointer: coarse)').matches)) next = target.panel.querySelector('.close-button');
      next?.focus({ preventScroll: true });
    }
  }

  function openMap(id, target) {
    if (id === current.id) {
      if (target) select(target.xy, target.id, true);
    } else {
      pending = target ? { ...target, map: id } : null;
      window.location.hash = id + (target?.id == null ? '' : '@' + target.id);
    }
  }

  function drawPuzzles() {
    puzzleLayer = draw('g', { class: 'puzzle-layer' }, svg);
    const puzzles = underkeepMapPuzzles[current.id] || [];
    puzzles.forEach((puzzle, index) => {
      const d = puzzle.areas.map(([x, y, width, height]) =>
        `M ${x} ${y} h ${width} v ${height} h ${-width} Z`).join(' ');
      const shape = draw('path', { d, class: 'puzzle-area', 'data-puzzle': index, tabindex: 0, role: 'button',
        'aria-label': puzzle.title, 'aria-controls': 'details-drawer', 'aria-expanded': 'false' }, puzzleLayer);
      shape.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectPuzzle(puzzle, true);
      });
      if (!puzzle.braziers) return;

      const braziers = draw('g', { class: 'puzzle-braziers', 'pointer-events': 'none', 'aria-hidden': 'true' }, puzzleLayer);
      const [href, width, height] = atlas.art.etile_brazier01;
      const coinCells = new Set(current.markers.filter(point => point.coinAmount).map(point => plot(point).join(',')));
      for (const [x, y] of puzzle.braziers) {
        // Give the brazier and the coin pile their own space in a shared cell.
        const sharesCell = coinCells.has(`${x},${y}`);
        const scale = sharesCell ? .06 : .1;
        const centerX = sharesCell ? .75 : .55;
        const centerY = sharesCell ? .21 : .55;
        draw('image', { href, x: x + centerX - width * scale / 2, y: y + centerY - height * scale / 2,
          width: width * scale, height: height * scale }, braziers);
      }
    });
  }

  function puzzleAt({ x, y }) {
    if (!active.has('puzzle')) return null;
    return underkeepMapPuzzles[current.id]?.findLast(puzzle => puzzle.areas.some(([left, top, width, height]) =>
      x >= left && x < left + width && y >= top && y < top + height));
  }

  function selectPuzzle(puzzle, focus = false) {
    const [x, y, width, height] = puzzle.areas[0];
    selected = { xy: [x + (width - 1) / 2, y + (height - 1) / 2], puzzle };
    setDrawer('details', focus);
    selectGraphic();
    renderSelection();
  }

  function updatePuzzleSelection() {
    if (!puzzleLayer) return;
    const puzzles = underkeepMapPuzzles[current.id] || [];
    for (const shape of puzzleLayer.querySelectorAll('.puzzle-area')) {
      shape.setAttribute('aria-expanded', String(openDrawer === 'details' &&
        selected?.puzzle === puzzles[shape.dataset.puzzle]));
    }
  }

  function renderMarkers() {
    markerLayer.replaceChildren();
    plotted = new Map();
    for (const point of current.markers) {
      if (!active.has(point.type)) continue;
      const key = plot(point).join(',');
      if (!plotted.has(key)) plotted.set(key, []);
      plotted.get(key).push(point);
    }
    for (const candidates of plotted.values()) {
      candidates.sort((a, b) => {
        return Number(!!b.directExit) - Number(!!a.directExit)
          || drawOrder.indexOf(a.type) - drawOrder.indexOf(b.type)
          || Number(Boolean(a.detail['{{t:common.spawn-condition|sq}}'])) - Number(Boolean(b.detail['{{t:common.spawn-condition|sq}}'])) || a.id - b.id;
      });
      const first = candidates[0];
      const [x, y] = plot(first);
      const group = draw('g', { class: 'marker', 'data-point': first.id }, markerLayer);
      draw('rect', { class: 'marker-hit', x, y, width: 1, height: 1, fill: 'none', stroke: 'none',
        'pointer-events': 'all' }, group);
      const wall = candidates.find(point => point.sprite === secretWallSprite);
      if (wall) drawPointSprite(wall, group);
      const icon = first === wall ? candidates[1] : first;
      if (icon && icon.type !== 'location') drawPointSprite(icon, group);
      let badgeIndex = rubbleLayers.has(first.type) ? 1 : candidates.findIndex(point => miningLayers.has(point.type));
      if (badgeIndex < 0) badgeIndex = candidates.findIndex(point => point.key === 'wall_sign' && point !== icon);
      if (badgeIndex > 0 && badgeIndex < candidates.length) {
        const [point] = candidates.splice(badgeIndex, 1);
        candidates.splice(1, 0, point);
        const badge = draw('svg', { x: x + .5, y, width: .5, height: .5,
          viewBox: `${x} ${y} 1 1`, 'pointer-events': 'none', 'data-point': point.id }, group);
        draw('rect', { x: x + .04, y: y + .04, width: .92, height: .92, rx: .16,
          fill: '#302923', stroke: '#e5c27e', 'stroke-width': .08 }, badge);
        drawPointSprite(point, badge);
      }
    }
    if (active.has('location')) {
      const labels = draw('g', { 'pointer-events': 'none' }, markerLayer);
      for (const point of current.markers) {
        if (point.type === 'location') drawPlaceName(point, labels);
      }
    }
    clearHover();
    selectGraphic();
  }

  function clearHover() {
    hoveredCell = '';
    hoverFrame?.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  }

  const hoverFields = ['{{t:common.dialogue|sq}}', '{{t:common.event-content|sq}}', '{{t:common.displayed-text|sq}}', '{{t:common.enter-hint|sq}}', '{{t:common.original-text|sq}}', '{{t:common.trigger-condition|sq}}', '{{t:common.trigger-count|sq}}', '{{t:common.purpose|sq}}',
    '{{t:common.spawn-condition|sq}}', '{{t:common.opening-condition|sq}}', '{{t:common.gathering-condition|sq}}', '{{t:common.acquire-method|sq}}', '{{t:common.required-items|sq}}', '{{t:common.interaction-effect|sq}}', '{{t:common.available-items|sq}}', '{{t:common.nothing-found|sq}}', '{{t:common.loot|sq}}', '{{t:common.drop-rules|sq}}', '{{t:common.random-contents|sq}}',
    '{{t:common.other-available-items|sq}}', '{{t:common.event-acquisition|sq}}', '{{t:common.entrance-direction|sq}}', '{{t:common.landing|sq}}', '{{t:common.source-pit|sq}}', '{{t:common.area-size|sq}}', '{{t:common.activity-range|sq}}', '{{t:common.safe-zone|sq}}', '{{t:common.story-branch|sq}}', '{{t:common.conditional-options|sq}}'];

  function createMapDetailDialog() {
    const dialog = createUnderkeepDetailDialog();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('click', event => {
      const link = event.target.closest('.locations a[href^="#"]');
      if (!link || link.hash !== window.location.hash || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const location = locationName();
      const point = markersById.get(location.entry);
      closeMapDetails();
      if (location.xy) select(location.xy, null, true);
      else if (point) select(plot(point), point.id, true);
    });
    return dialog;
  }

  function closeMapDetails() {
    for (const dialog of [...document.querySelectorAll('#view .detail-dialog[open]')].reverse()) dialog.close();
  }

  function renderMapDetail(dialog, group, record) {
    guideDetails.renderDetail(dialog, group, record, guideDetails.route(group, record), {
      guideUrl: '?view=guide&map=' + encodeURIComponent(current.id),
      mapHref: (id, entry) => '#' + id + '@' + entry,
      detailButton: mapDetailButton
    });
  }

  function mapDetailButton(record, label = record.name) {
    return detailControl(label, () => {
      const dialog = createMapDetailDialog();
      const { itemsById, enemiesById } = guideDetails;
      const group = itemsById.get(record.id) === record ? 'items' : enemiesById.get(record.id) === record ? 'enemies' : 'quests';
      renderMapDetail(dialog, group, record);
      dialog.showModal();
    });
  }

  function detailControl(label, open) {
    const button = connect(label, event => {
      event.currentTarget.focus({ preventScroll: true });
      open();
    }, 'item-link');
    button.setAttribute('aria-haspopup', 'dialog');
    return button;
  }

  function mapReferenceButton(group, key, label) {
    return detailControl(label, async () => {
      const dialog = createMapDetailDialog();
      dialog.setAttribute('aria-label', label);
      dialog.querySelector('.entry-heading').append(underkeepElement('h2', label));
      const info = dialog.querySelector('.dialog-body');
      const status = underkeepElement('p', '{{t:site.loading|sq}}');
      status.setAttribute('role', 'status');
      info.replaceChildren(status);
      dialog.showModal();

      try {
        await loadDetails(group);
        if (signal.aborted || !dialog.open) return;
        const record = group === 'items' ? guideDetails.itemsById.get(key)
          : group === 'enemies' ? guideDetails.enemiesById.get(key)
          : guideDetails.data.quests.find(quest => quest.name === key);
        if (record) renderMapDetail(dialog, group, record);
        else status.textContent = '{{t:maps.ui.map-reference-button|sq}}';
      } catch {
        status.textContent = '{{t:maps.ui.map-reference-button-2|sq}}';
      }
    });
  }

  function linkedText(text, links = [], from = 0, until = text.length) {
    const fragment = document.createDocumentFragment();
    let end = Math.min(text.length, until);
    let cursor = from;
    for (const [start, stop, id] of links) {
      if (stop <= from) continue;
      if (start >= end) break;
      fragment.append(underkeepXpText(text.slice(cursor, start)));
      const label = text.slice(start, stop);
      fragment.append(mapReferenceButton('items', id, label));
      cursor = stop;
      end = Math.max(end, stop);
    }
    fragment.append(underkeepXpText(text.slice(cursor, end)));
    return fragment;
  }

  function pointDetails(point) {
    if (point.questGuide) return { {{t:common.trigger-condition|key}}: point.detail['{{t:common.trigger-condition|sq}}'] };
    const groundPickup = point.type === 'item' && point.detail['{{t:common.available-items|sq}}'] === point.title;
    const repeatedHint = point.detail['{{t:common.interaction-hint|sq}}'] && point.detail['{{t:common.interaction-hint|sq}}'] === point.detail['{{t:common.post-interaction-hint|sq}}'];
    const landing = /^(-?\d+),\s*(-?\d+)$/.exec(point.detail['{{t:common.landing|sq}}'] ?? '');
    if (!groundPickup && !repeatedHint && !landing) return point.detail;
    const details = groundPickup ? { {{t:common.acquire-method|key}}: '{{t:common.ground-pickup|sq}}', ...point.detail } : { ...point.detail };
    if (groundPickup) delete details['{{t:common.available-items|sq}}'];
    if (repeatedHint) delete details['{{t:common.post-interaction-hint|sq}}'];
    if (landing) details['{{t:common.landing|sq}}'] = underkeepCoordinates(landing.slice(1));
    return details;
  }

  function appendChoiceXp(target, reward) {
    if (reward == null) return;
    const [amount, condition] = Array.isArray(reward) ? reward : [reward];
    target.append(' ', underkeepXp(amount));
    if (condition) {
      const note = underkeepElement('span', undefined, 'choice-xp-condition');
      note.append('{{t:common.punctuation.open-parenthesis|sq}}', underkeepXpText(condition), '{{t:common.punctuation.close-parenthesis|sq}}');
      target.append(note);
    }
  }

  function detailContent(point, field, text) {
    if (field === '{{t:common.xp-value|sq}}') return underkeepXp(Number(text));
    if (field === '{{t:common.related-quest|sq}}') {
      if (!Array.isArray(text)) return document.createTextNode(text);
      const fragment = document.createDocumentFragment();
      text.forEach((name, index) => {
        if (index) fragment.append('{{t:common.punctuation.list-separator|sq}}');
        fragment.append(mapReferenceButton('quests', name, name));
      });
      return fragment;
    }
    const links = point.itemLinks?.[field];
    if (field === '{{t:common.conditional-options|sq}}') {
      const list = underkeepElement('ul', undefined, 'condition-options');
      for (const [index, line] of Array.from(text.matchAll(/[^\r\n]+/g)).entries()) {
        const item = underkeepElement('li');
        item.append(linkedText(text, links, line.index, line.index + line[0].length));
        appendChoiceXp(item, point.conditionalXp?.[index]);
        list.append(item);
      }
      return list;
    }
    return linkedText(text, links);
  }

  function eventDialogue(sections) {
    const dialogue = underkeepElement('details', undefined, 'event-dialogue');
    dialogue.append(underkeepElement('summary', '{{t:maps.ui.event-dialogue|sq}}'));
    for (const [label, lines, choices] of sections) {
      const section = underkeepElement('section');
      section.append(underkeepElement('h4', label));
      for (const line of lines) {
        const paragraph = underkeepElement('p');
        paragraph.append(underkeepXpText(line));
        section.append(paragraph);
      }
      if (choices.length) {
        const list = underkeepElement('ul', undefined, 'condition-options');
        for (const entry of choices) {
          const [choice, reward] = Array.isArray(entry) ? entry : [entry];
          const item = underkeepElement('li');
          item.append(underkeepXpText(choice));
          appendChoiceXp(item, reward);
          list.append(item);
        }
        section.append(list);
      }
      dialogue.append(section);
    }
    return dialogue;
  }

  function questGuide(quests) {
    const guide = underkeepElement('div', undefined, 'npc-quests');
    for (const [name, steps] of quests) {
      const section = underkeepElement('section');
      const heading = underkeepElement('h4');
      heading.append(mapReferenceButton('quests', name, name));
      const list = underkeepElement('ul', undefined, 'condition-options');
      for (const [label, text] of steps) {
        const item = underkeepElement('li');
        item.append(underkeepElement('strong', label), ' ', underkeepXpText(text));
        list.append(item);
      }
      section.append(heading, list);
      guide.append(section);
    }
    return guide;
  }

  function groupCoinPiles(points) {
    const coins = points.filter(point => point.coinAmount);
    if (coins.length < 2) return points;
    const amount = coins.reduce((sum, point) => sum + point.coinAmount, 0);
    return points.filter(point => !point.coinAmount || point === coins[0])
      .map(point => point === coins[0] ? { ...point, title: '{{t:maps.ui.group-coin-piles.title|sq}}' + amount } : point);
  }

  function appendPointTitle(title, point) {
    const label = underkeepElement('span');
    label.append(point.enemyGuide ? mapReferenceButton('enemies', point.key, point.title) : linkedText(point.title, point.titleLinks));
    title.append(symbol(point.type, point.sprite, isInitiallyAbsent(point)), label);
  }

  function paintTooltip(points) {
    tooltip.replaceChildren();
    const limit = points[0]?.isChest ? 1 : 2;
    let overflow = points.length > limit;
    for (const point of points.slice(0, limit)) {
      const card = underkeepElement('div', undefined, 'tip-card');
      const title = underkeepElement('div', undefined, 'tip-title');
      title.append(symbol(point.type, point.sprite, isInitiallyAbsent(point)), point.title);
      card.append(title);
      const details = pointDetails(point);
      for (const key of hoverFields) {
        let value = details[key];
        if (!value) continue;
        if (Array.isArray(value)) value = value.join('{{t:common.punctuation.list-separator|sq}}');
        const max = key === '{{t:common.random-contents|sq}}' ? 550 : key === '{{t:common.loot|sq}}' ? 420 : 230;
        if (value.length > max) {
          value = value.slice(0, max) + '…';
          overflow = true;
        }
        const row = underkeepElement('div', undefined, 'tip-line');
        row.append(underkeepElement('strong', key + ' ', 'tip-label'), underkeepXpText(value));
        card.append(row);
      }
      if (point.directExit) card.append(underkeepElement('p', '{{t:maps.ui.paint-tooltip|sq}} ' + point.destination.name, 'tip-more'));
      tooltip.append(card);
    }
    if (overflow) tooltip.append(underkeepElement('p', '{{t:maps.ui.paint-tooltip-2|sq}}', 'tip-more'));
  }

  function updateHover(event, location) {
    const x = Math.floor(location.x);
    const y = Math.floor(location.y);
    byId('coords').textContent = underkeepCoordinates([x, y]);
    if (drag?.moved || event.pointerType === 'touch') {
      clearHover();
      return;
    }
    const points = plotted.get(x + ',' + y) || [];
    const puzzle = points.length ? null : puzzleAt(location);
    const key = x + ',' + y + (puzzle ? '/' + puzzle.title : '');
    if (hoveredCell !== key) {
      hoveredCell = key;
      placeCellFrame(hoverFrame, x, y);
      hoverFrame.setAttribute('visibility', 'visible');
      tooltip.hidden = !points.length && !puzzle;
      if (points.length) paintTooltip(groupCoinPiles(points));
      else if (puzzle) {
        const card = underkeepElement('div', undefined, 'tip-card');
        card.append(underkeepElement('div', puzzle.title, 'tip-title'),
          underkeepElement('p', '{{t:maps.ui.update-hover|sq}}', 'tip-more'));
        tooltip.replaceChildren(card);
      }
    }
    if (tooltip.hidden) return;
    const bounds = stage.getBoundingClientRect();
    const xInStage = event.clientX - bounds.left;
    const yInStage = event.clientY - bounds.top;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = xInStage + width + 23 < bounds.width ? xInStage + 16 : xInStage - width - 16;
    const top = yInStage + height + 22 < bounds.height ? yInStage + 17 : yInStage - height - 18;
    tooltip.style.left = Math.max(7, Math.min(left, bounds.width - width - 7)) + 'px';
    tooltip.style.top = Math.max(7, Math.min(top, bounds.height - height - 7)) + 'px';
  }

  function selectGraphic() {
    selectedLayer.replaceChildren();
    updatePuzzleSelection();
    if (!selected) return;
    if (selected.puzzle) {
      if (active.has('puzzle') && selected.puzzle.route) {
        const points = selected.puzzle.route.map(([x, y]) => `${x + .5},${y + .5}`).join(' ');
        draw('polyline', { class: 'puzzle-route', points }, selectedLayer);
        const [x, y] = selected.puzzle.route[0];
        draw('circle', { class: 'puzzle-route-start', cx: x + .5, cy: y + .5, r: .15 }, selectedLayer);
      }
      return;
    }
    const [x, y] = selected.xy;
    const point = markersById.get(selected.id);
    const sameMapExit = point?.destination?.map === current.id ? [point.destination] : [];
    const endpoints = [...(point?.targets || []), ...sameMapExit].map(target => target.xy);
    const cellMarkers = plotted.get(selected.xy.join(',')) || [];
    for (const marker of new Set([point, ...cellMarkers])) {
      if (!['mtile_door', 'etile_secret_wall', secretWallSprite].includes(marker?.sprite)) continue;
      for (const source of marker.sources) {
        const controller = markersById.get(source.id);
        if (controller?.key === 'lever1') endpoints.push(plot(controller));
      }
    }
    const drawn = new Set([selected.xy.join(',')]);
    for (const xy of endpoints) {
      if (!xy || drawn.has(xy.join(','))) continue;
      drawn.add(xy.join(','));
      draw('line', { x1: x + .5, y1: y + .5, x2: xy[0] + .5, y2: xy[1] + .5,
        stroke: '#f3e4bc', 'stroke-width': .065, 'stroke-dasharray': '.25 .18', opacity: .7 }, selectedLayer);
    }
    const showHiddenMarker = point && !active.has(point.type) && point.sprite !== secretWallSprite
      && !miningLayers.has(point.type) && !['gather', 'location', 'junk'].includes(point.type);
    if (!point || showHiddenMarker) {
      drawPointSprite(point || { xy: selected.xy, native: 'mtile_symbol_default', nativeRotation: 0 }, selectedLayer);
    }
    if (selected.highlight) {
      const frame = drawCellFrame({ id: 'jump-target', stroke: '#ff625b' }, selectedLayer);
      placeCellFrame(frame, x, y);
    }
  }

  function relationshipTable(title, rows) {
    const group = underkeepElement('details');
    group.append(underkeepElement('summary', title));
    for (const target of rows) {
      group.append(connect(target.title, () => select(target.xy, target.id, true), 'target'));
    }
    return group;
  }

  function renderSelection() {
    const container = byId('selection');
    const heading = byId('details-title');
    container.replaceChildren();
    if (!selected) {
      heading.textContent = '';
      return;
    }
    if (selected.puzzle) {
      const { title, goal, goalLinks, steps } = selected.puzzle;
      heading.textContent = title;
      const card = underkeepElement('article', undefined, 'puzzle-card');
      const goalRow = underkeepElement('section', undefined, 'puzzle-row');
      const goalText = underkeepElement('p');
      goalText.append(goalLinks ? linkedText(goal, goalLinks) : underkeepCoordinateText(goal));
      goalRow.append(underkeepElement('h3', '{{t:common.target|sq}}'), goalText);
      const solutionRow = underkeepElement('section', undefined, 'puzzle-row');
      const solution = underkeepElement(steps.length === 1 ? 'p' : 'ol');
      for (const step of steps) {
        const content = typeof step === 'string' ? underkeepXpText(step) : linkedText(step.text, step.links);
        if (steps.length === 1) solution.append(content);
        else {
          const item = underkeepElement('li');
          item.append(content);
          solution.append(item);
        }
      }
      solutionRow.append(underkeepElement('h3', '{{t:maps.ui.render-selection|sq}}'), solution);
      card.append(goalRow, solutionRow);
      container.append(card);
      container.scrollTop = 0;
      return;
    }
    const cell = groupCoinPiles(current.markers.filter(p =>
      ((!miningLayers.has(p.type) && p.type !== 'junk') || active.has(p.type)) &&
      plot(p)[0] === selected.xy[0] && plot(p)[1] === selected.xy[1]));
    cell.sort((a, b) => Number(b.id === selected.id) - Number(a.id === selected.id));
    heading.textContent = '{{t:maps.ui.render-selection-3|sq}} ' + underkeepCoordinates(selected.xy) + (cell.length ? '' : ' {{t:maps.ui.render-selection-4|sq}}');
    for (const point of cell) {
      const card = underkeepElement('article', undefined, 'selection-card');
      const title = underkeepElement('h3');
      appendPointTitle(title, point);
      card.append(title);
      const facts = underkeepElement('dl');
      for (const [key, value] of Object.entries(pointDetails(point))) {
        if (!value) continue;
        const description = underkeepElement('dd');
        description.append(detailContent(point, key, value));
        facts.append(underkeepElement('dt', key), description);
      }
      if (facts.childNodes.length) card.append(facts);
      if (point.shopId) {
        const shop = underkeepElement('a', '{{t:maps.ui.render-selection-5|sq}}', 'jump');
        shop.href = '?view=guide&map=' + encodeURIComponent(current.id) + '#shops/' + encodeURIComponent(point.shopId);
        card.append(shop);
      }
      if (point.questGuide) card.append(questGuide(point.questGuide));
      else if (point.dialogue?.length) card.append(eventDialogue(point.dialogue));
      if (point.destination) {
        const dest = point.destination;
        const action = () => openMap(dest.map, dest);
        card.append(connect((dest.map === current.id ? '{{t:maps.ui.render-selection-6|sq}}' : '{{t:maps.ui.render-selection-7|sq}} ' + dest.name) + ' ↗', action));
      }
      if (point.key === 'fast_travel_portal') {
        const links = underkeepElement('section', undefined, 'travel-stops');
        links.append(underkeepElement('h4', '{{t:maps.ui.render-selection-8|sq}}'));
        for (const dest of atlas.travelStops) {
          if (dest.map === current.id && dest.id === point.id) continue;
          links.append(connect(dest.name + ' ↗', () => openMap(dest.map, dest)));
        }
        card.append(links);
      }
      if (point.sources.length) card.append(relationshipTable('{{t:maps.ui.render-selection-9|sq}}', point.sources));
      if (point.targets.length) card.append(relationshipTable('{{t:maps.ui.render-selection-10|sq}}', point.targets));
      container.append(card);
    }
    container.scrollTop = 0;
  }

  function select(xy, id, center) {
    if (!xy && id == null) return;
    const point = markersById.get(id);
    selected = { xy: point ? plot(point) : xy, id, highlight: center };
    if (point && !active.has(point.type)) {
      active.add(point.type);
      renderFilters();
    }
    const [x, y] = selected.xy;
    byId('coords').textContent = underkeepCoordinates([x, y]);
    if (center) centerView(x, y);
    renderMarkers();
    renderSelection();
  }

  function metrics() {
    const bounds = svg.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pitch = magnification * 10;
    const cssPitch = pitch / dpr;
    return { bounds, dpr, pitch, cssPitch, w: bounds.width / cssPitch, h: bounds.height / cssPitch };
  }

  function setView() {
    const { bounds, dpr, pitch, w, h } = metrics();
    if (!w || !h) return;
    const alignedX = (bounds.left * dpr - Math.round(bounds.left * dpr - (camera.x - w/2) * pitch)) / pitch;
    const alignedY = (bounds.top * dpr - Math.round(bounds.top * dpr - (camera.y - h/2) * pitch)) / pitch;
    view = [alignedX, alignedY, w, h];
    svg.setAttribute('viewBox', view.join(' '));
    for (const [index, key] of ['x','y','width','height'].entries()) paperFill.setAttribute(key, view[index]);
    layoutExtraSprites();
    byId('scale').textContent = magnification + 'x';
    byId('zoom-in').disabled = magnification >= maxZoom;
    byId('zoom-out').disabled = magnification <= 1;
  }

  function visibleMapArea() {
    const { bounds } = metrics();
    const panel = drawers[openDrawer]?.panel.getBoundingClientRect();
    if (!panel) return { width: bounds.width, height: bounds.height, dx: 0, dy: 0 };
    if (panel.width >= bounds.width - 1) {
      const height = Math.max(1, panel.top - bounds.top);
      return { width: bounds.width, height, dx: 0, dy: (height - bounds.height) / 2 };
    }
    const width = Math.max(1, bounds.width - panel.width);
    const dx = openDrawer === 'maps' ? panel.width / 2 : -panel.width / 2;
    return { width, height: bounds.height, dx, dy: 0 };
  }

  function centerView(x, y) {
    const { dx, dy } = visibleMapArea();
    const { cssPitch } = metrics();
    camera = {
      x: x + .5 - dx / cssPitch,
      y: y + .5 - dy / cssPitch
    };
    setView();
  }

  function frameMap(fit = false) {
    const [left, top, width, height] = current.focusBounds || current.bounds;
    const area = visibleMapArea();
    if (fit) {
      const { dpr } = metrics();
      const fitted = Math.floor(Math.min(area.width / width, area.height / height) * dpr / 10);
      magnification = Math.max(1, Math.min(maxZoom, fitted));
      saveZoom();
    }
    const { cssPitch } = metrics();
    camera = { x: left + width / 2 - area.dx / cssPitch, y: top + height / 2 - area.dy / cssPitch };
    clearHover();
    setView();
  }

  function zoomAt(step, point) {
    const next = Math.max(1, Math.min(maxZoom, magnification + step));
    if (next === magnification) return;
    if (point) {
      const existing = metrics();
      const offsetX = point.x - (view[0] + existing.w/2);
      const offsetY = point.y - (view[1] + existing.h/2);
      camera = { x: point.x - offsetX * magnification / next, y: point.y - offsetY * magnification / next };
    }
    magnification = next;
    saveZoom();
    clearHover();
    setView();
  }

  function mapPoint(event) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function displayMap() {
    closeMapDetails();
    const location = locationName();
    const guideEntry = new URLSearchParams(window.location.search).get('guide');
    current = underkeepMaps.get(location.id);
    updateOverview(current.id);
    markersById = new Map(current.markers.map(point => [point.id, point]));
    const catalogHadFocus = document.activeElement.matches('#catalog .map-link');
    if (openDrawer !== 'maps') {
      setDrawer(null);
      byId('map-query').value = '';
    }
    selected = null;
    const [name] = underkeepMapNames[current.id];
    byId('map-title').textContent = name;
    byId('map-title').title = name;
    byId('coords').textContent = '—';
    document.title = name + ' | ' + underkeepSiteName;
    svg.replaceChildren();
    addSvgSprites();
    const definition = svg.querySelector('defs');
    const [paper, paperWidth, paperHeight] = atlas.paperTexture;
    const paperSize = { width: paperWidth / 10, height: paperHeight / 10 };
    const mat = draw('pattern', { id: 'atlas-paper', patternUnits: 'userSpaceOnUse', ...paperSize }, definition);
    draw('image', { href: paper, ...paperSize, style: 'image-rendering:pixelated' }, mat);
    paperFill = draw('rect', { fill: 'url(#atlas-paper)', 'pointer-events': 'all' }, svg);
    const [x, y, width, height] = current.bounds;
    const mapImage = 'images/maps/' + current.id + '.webp';
    draw('image', { href: underkeepSharedAssets + mapImage + '?v=' + underkeepMapImageRevisions[mapImage], x, y, width, height }, svg);
    drawPuzzles();
    markerLayer = draw('g', {}, svg);
    hoverFrame = drawCellFrame({ id: 'hover-cell', stroke: '#ffe4a7', visibility: 'hidden' }, svg);
    selectedLayer = draw('g', { 'pointer-events': 'none' }, svg);
    frameMap();
    renderCatalog();
    if (catalogHadFocus) byId('catalog').querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    renderFilters();
    renderMarkers();
    renderSelection();
    const target = pending;
    pending = null;
    if (target?.map === current.id) {
      if (target.xy) select(target.xy, target.id, true);
    } else if (location.xy) {
      if (guideEntry) setDrawer('details');
      const pickup = guideEntry?.startsWith('items/') && current.markers.find(point =>
        point.key === guideEntry.slice(6) && point.xy[0] === location.xy[0] && point.xy[1] === location.xy[1]);
      select(location.xy, pickup?.id ?? null, true);
    } else if (Number.isFinite(location.entry)) {
      const marker = markersById.get(location.entry);
      if (marker) {
        if (guideEntry) setDrawer('details');
        select(plot(marker), marker.id, true);
      }
    }
  }

  for (const key of typeKeys) {
    const button = connect('', () => {
      if (active.has(key)) active.delete(key);
      else active.add(key);
      saveLayer(key);
      renderFilters();
      renderMarkers();
      renderSelection();
    }, 'layer-button');
    button.id = 'filter-' + key;
    button.append(symbol(key), underkeepElement('span', layerTypes[key][0]));
    byId('filters').append(button);
  }
  byId('reset-types').addEventListener('click', () => {
    active = defaultLayers();
    try {
      window.localStorage.removeItem(layerStorageKey);
    } catch {
      // The in-page reset still works when browser storage is unavailable.
    }
    renderFilters();
    renderMarkers();
    renderSelection();
  });
  byId('map-query').addEventListener('input', renderCatalog);
  bindUnderkeepSearch(byId('map-query'), signal, () => setDrawer('maps'));
  byId('locate-selection').addEventListener('click', () => {
    setDrawer(null, true);
    if (!selected.puzzle) selected.highlight = true;
    centerView(...selected.xy);
    selectGraphic();
  });
  for (const [name, { panel, toggle }] of Object.entries(drawers)) {
    toggle?.addEventListener('click', () => setDrawer(openDrawer === name ? null : name, true));
    panel.querySelector('.close-button').addEventListener('click', () => setDrawer(null, true));
  }
  stage.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openDrawer && !document.querySelector('#view dialog[open]')) {
      event.preventDefault();
      setDrawer(null, true);
    }
  }, { signal });
  byId('zoom-in').addEventListener('click', () => zoomAt(1));
  byId('zoom-out').addEventListener('click', () => zoomAt(-1));
  byId('zoom-fit').addEventListener('click', () => frameMap(true));
  const resizeObserver = new ResizeObserver(() => {
    if (camera) setView();
  });
  resizeObserver.observe(svg);
  signal.addEventListener('abort', () => resizeObserver.disconnect(), { once: true });
  window.addEventListener('resize', () => {
    if (camera) setView();
  }, { signal });
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.timeStamp - wheelTime < 90 || !event.deltaY) return;
    wheelTime = event.timeStamp;
    zoomAt(event.deltaY < 0 ? 1 : -1, mapPoint(event));
  }, { passive: false });
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const location = mapPoint(event);
    if (!location) return;
    const candidates = plotted.get(Math.floor(location.x) + ',' + Math.floor(location.y));
    const marker = candidates?.[0];
    drag = { id: event.pointerId, center: { ...camera }, pageX: event.clientX, pageY: event.clientY,
      moved: false, marker, puzzle: marker ? null : puzzleAt(location) };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) {
      const dx = event.clientX - drag.pageX;
      const dy = event.clientY - drag.pageY;
      drag.moved ||= Math.hypot(dx, dy) > 4;
      if (drag.moved) {
        const { cssPitch } = metrics();
        camera = { x: drag.center.x - dx / cssPitch, y: drag.center.y - dy / cssPitch };
        svg.classList.add('dragging');
        setView();
      }
    }
    const location = mapPoint(event);
    if (location) updateHover(event, location);
  });
  svg.addEventListener('pointerleave', clearHover);
  svg.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const { moved, marker, puzzle } = drag;
    drag = null;
    svg.classList.remove('dragging');
    if (!moved && marker) {
      if (marker.directExit) openMap(marker.destination.map, marker.destination);
      else {
        select(plot(marker), marker.id, false);
        setDrawer('details');
      }
    } else if (!moved && puzzle) {
      selectPuzzle(puzzle);
    } else if (!moved) {
      setDrawer(null);
      selected = null;
      renderMarkers();
      renderSelection();
    }
  });
  svg.addEventListener('lostpointercapture', () => {
    drag = null;
    svg.classList.remove('dragging');
  });
  const updateOverview = mountUnderkeepOverview({ byId, atlas, dungeonEntrance, draw, setDrawer });
  displayMap();
  return displayMap;
}

function mountUnderkeepOverview({ byId, atlas, dungeonEntrance, draw, setDrawer }) {
  const dialog = byId('map-overview');
  const chart = byId('overview-svg');
  const scroller = dialog.querySelector('.overview-scroll');
  const links = new Map();
  let currentRegion;
  let currentLink;

  // Coordinates follow the sides of the regional exits. Dungeon floors share their entrance.
  const positions = {
    Village_of_Underkeep: [570, 326],
    Underkeep_Surroundings: [286, 326], Tower_Level1: [266, 419], Surroundings_Cave: [104, 284],
    West_woods: [215, 151], West_Dungeon_1: [101, 218], Dragon_den: [116, 70],
    Caerlin_Woods: [570, 151], Caerlin_West_Dungeon: [397, 85], Forgotten_Vein: [441, 225],
    Wolf_den: [523, 42], Basilisk_Den: [653, 54],
    Swamp: [861, 151], Swamp_Spider_Nest: [848, 48], Swamp_Dungeon1: [1045, 112],
    Swamp_Lost_City: [1002, 221],
    Starting_forest: [854, 326], Small_spider_cave: [808, 247], Rat_nest: [1043, 306],
    Mines_under_forest: [1018, 417], Underkeep_Cemetery: [570, 452], Mausoleum: [664, 530]
  };
  const region = id => dungeonEntrance.get(id) || id;

  function drawRoutes() {
    const neighbors = new Map(Object.keys(positions).map(id => [id, new Set()]));
    const routes = [];
    for (const [source, destination] of atlas.connections) {
      const from = region(source);
      const to = region(destination);
      if (from === to || neighbors.get(from).has(to)) continue;
      neighbors.get(from).add(to);
      neighbors.get(to).add(from);
      routes.push([from, to]);
    }

    const placed = [];
    let widthNeeded = chart.viewBox.baseVal.width;
    const routeLayer = draw('g', {}, chart);
    for (const [id, [originalX, y]] of Object.entries(positions).sort((a, b) => a[1][0] - b[1][0])) {
      const [name] = underkeepMapNames[id];
      const hub = neighbors.get(id).size >= 3;
      const link = draw('a', { href: '#' + id,
        class: 'overview-node' + (hub ? ' hub' : ''),
        'aria-label': name }, chart);
      links.set(id, link);
      draw('title', {}, link, name);
      const box = draw('rect', { rx: 6 }, link);
      const label = draw('text', { y: 5 }, link, name);
      const width = Math.ceil(label.getComputedTextLength()) + 28;
      const height = hub ? 54 : 38;
      let x = Math.max(originalX, width / 2 + 8);
      for (const node of placed) {
        if (Math.abs(y - node.y) < (height + node.height) / 2 + 4) {
          x = Math.max(x, node.right + width / 2 + 8);
        }
      }
      const right = x + width / 2;
      placed.push({ y, height, right });
      widthNeeded = Math.max(widthNeeded, Math.ceil(right + 8));
      positions[id][0] = x;
      link.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      Object.entries({ x: -width / 2, y: -height / 2, width, height })
        .forEach(([key, value]) => box.setAttribute(key, value));
    }
    chart.viewBox.baseVal.width = widthNeeded;
    for (const [from, to] of routes) {
      const [x1, y1] = positions[from];
      const [x2, y2] = positions[to];
      draw('line', { x1, y1, x2, y2, class: 'overview-route' }, routeLayer);
    }
  }

  function showCurrentRegion() {
    currentLink?.removeAttribute('aria-current');
    currentLink = links.get(currentRegion);
    currentLink?.setAttribute('aria-current', 'location');
    const bounds = chart.viewBox.baseVal;
    const [x, y] = positions[currentRegion] || [bounds.width / 2, bounds.height / 2];
    scroller.scrollLeft = chart.clientWidth * x / bounds.width - scroller.clientWidth / 2;
    scroller.scrollTop = chart.clientHeight * y / bounds.height - scroller.clientHeight / 2;
  }

  byId('overview-toggle').addEventListener('click', () => {
    dialog.showModal();
    if (!links.size) drawRoutes();
    showCurrentRegion();
  });
  chart.addEventListener('click', event => {
    if (!event.target.closest('a') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    dialog.close();
    setDrawer(null, true);
  });

  return id => {
    const nextRegion = region(id);
    if (currentRegion === nextRegion) return;
    currentRegion = nextRegion;
    if (dialog.open) showCurrentRegion();
  };
}

// Shared map data. Individual maps register their markers on demand.
const underkeepLockedChestLootRule = "{{t:maps.locked-chest-loot-rule}}";

const underkeepUrnLoot = {
  materials: {
    detail: {"{{t:common.loot}}":"{{t:maps.ui.detail}}"},
    detailOrder: ["{{t:common.loot}}","{{t:common.acquire-method}}"],
    itemLinks: {"{{t:common.loot}}":{{t:maps.ui.detail.item-links|json}}}
  },
  ashes: {
    detail: {"{{t:common.loot}}":"{{t:maps.ui.detail-2}}"},
    detailOrder: ["{{t:common.loot}}","{{t:common.acquire-method}}"],
    itemLinks: {"{{t:common.loot}}":{{t:maps.ui.detail-2.item-links|json}}}
  }
};

window.UNDERKEEP_ATLAS = {
"groups": [{"name":"{{t:maps.ui.name}}","maps":["Starting_forest","Mines_under_forest","Rat_nest","Small_spider_cave","Abandoned_Mines_Cave","Under_Abandoned_Cave"]},{"name":"{{t:maps.ui.name-2}}","maps":["Village_of_Underkeep","Forgotten_Vein","Underkeep_Cemetery","Mausoleum","Mausoleum_2","Mausoleum_3","Mausoleum_3_2"]},{"name":"{{t:maps.ui.name-3}}","maps":["Caerlin_Woods","Caerlin_West_Dungeon","Basilisk_Den","Wolf_den","Swamp","Swamp_Dungeon1","Swamp_Dungeon2","Swamp_Lost_City","Swamp_Spider_Nest"]},{"name":"{{t:maps.ui.name-4}}","maps":["West_woods","Dragon_den","East_Garden","West_Garden","West_Dungeon_1","West_Dungeon_2","West_Dungeon_3"]},{"name":"{{t:maps.ui.name-5}}","maps":["Underkeep_Surroundings","Surroundings_Cave","Tower_Level1","Tower_Level2","Tower_Level2_Corrupted","Tower_Level3","Tower_Level4","Tower_Level5","Undertower"]}],
"types": {"passage":["{{t:maps.ui.passage}}","A","#7bd8ff",true],"travel":["{{t:maps.ui.travel}}","W","#73e1c0",true],"enemy":["{{t:common.enemy}}","F","#ffa9ab",true],"boss":["{{t:maps.ui.boss}}","B","#ff8fa0",true],"event":["{{t:maps.ui.event}}","E","#fbd487",true],"secret":["{{t:maps.ui.secret}}","S","#d7baff",true],"trap":["{{t:maps.ui.trap}}","T","#ffaa76",true],"mechanism":["{{t:maps.ui.mechanism}}","M","#a6bdf5",true],"treasure":["{{t:maps.ui.treasure}}","L","#f2c078",true],"service":["{{t:maps.ui.service}}","H","#a9e2a2",true],"item":["{{t:common.ground-item}}","I","#b6e6a4",true],"junk":["{{t:maps.ui.junk}}","I","#b6e6a4",false],"trigger":["{{t:maps.ui.trigger}}","X","#b7b7c9",false],"note":["{{t:maps.ui.note}}","N","#d2dbe4",true],"gather":["{{t:maps.ui.gather}}","G","#b6e6a4",false],"acquire":["{{t:common.event-acquisition}}","R","#f2d391",true],"location":["{{t:maps.ui.location}}","{{t:maps.ui.symbol}}","#e6d3ac",true],"rubble":["{{t:common.normal-rubble}}","K","#bec9cd",true],"hard-rubble":["{{t:maps.objects.collapsed_rocks_cave_tough}}","Q","#c8b0ed",true],"gold-vein":["{{t:maps.objects.cave_gold_wall}}","V","#f2c078",true]},
"terrain": {"floor":["{{t:maps.ui.floor}}","#5f4e37","#314750"],"wall":["{{t:maps.ui.wall}}","#736246","#7b8994"],"tree":["{{t:maps.ui.tree}}","#5f4e37","#315340"],"solid":["{{t:maps.ui.solid}}","#5f4e37","#5b625f"]},
"legendIcons": {"passage":"mtile_exit","travel":"mtile_fast_travel_portal","event":"hud_icon_quest_active","boss":"mtile_enemy","secret":"secret_wall_tile","trap":"mtile_pit","mechanism":"mtile_button","treasure":"mtile_chest","service":"mtile_enemy_friend","item":"etile_item","enemy":"mtile_enemy","trigger":"mtile_pressure_plate","note":"etile_text","gather":"item_flower_amberrose","acquire":"etile_item","junk":"item_boulder","rubble":"mtile_collapsed_rocks","hard-rubble":"collapsed_rocks_cave_tough","gold-vein":"etile_golden_vein"},
"terrainArt": {"floor":"mtile_ground_1","wall":"mtile_wall_1","tree":"mtile_tree","solid":"mtile_obstacle"},
"dungeons": {"Mines_under_forest":["Abandoned_Mines_Cave","Under_Abandoned_Cave"],"Mausoleum":["Mausoleum_2","Mausoleum_3","Mausoleum_3_2"],"Swamp_Dungeon1":["Swamp_Dungeon2"],"West_Dungeon_1":["East_Garden","West_Garden","West_Dungeon_2","West_Dungeon_3"],"Tower_Level1":["Tower_Level2","Tower_Level2_Corrupted","Tower_Level3","Tower_Level4","Tower_Level5","Undertower"]},
"connections": [["Abandoned_Mines_Cave","Mines_under_forest"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Mines_under_forest"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Basilisk_Den","Caerlin_Woods"],["Caerlin_West_Dungeon","Caerlin_Woods"],["Caerlin_Woods","West_woods"],["Caerlin_Woods","Swamp"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Basilisk_Den"],["Caerlin_Woods","Swamp"],["Caerlin_Woods","Caerlin_West_Dungeon"],["Caerlin_Woods","Forgotten_Vein"],["Caerlin_Woods","Village_of_Underkeep"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Dragon_den","West_woods"],["Dragon_den","West_woods"],["East_Garden","West_Dungeon_1"],["East_Garden","West_Dungeon_1"],["Forgotten_Vein","Caerlin_Woods"],["Mausoleum","Underkeep_Cemetery"],["Mausoleum","Mausoleum_2"],["Mausoleum","Underkeep_Cemetery"],["Mausoleum","Mausoleum_3_2"],["Mausoleum","Mausoleum_2"],["Mausoleum_2","Mausoleum_3"],["Mausoleum_2","Mausoleum"],["Mausoleum_2","Mausoleum_3_2"],["Mausoleum_2","Mausoleum"],["Mausoleum_3","Mausoleum_2"],["Mausoleum_3_2","Mausoleum_2"],["Mausoleum_3_2","Mausoleum"],["Mines_under_forest","Starting_forest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Rat_nest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Starting_forest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Rat_nest","Starting_forest"],["Rat_nest","Mines_under_forest"],["Small_spider_cave","Starting_forest"],["Starting_forest","Rat_nest"],["Starting_forest","Small_spider_cave"],["Starting_forest","Village_of_Underkeep"],["Starting_forest","Mines_under_forest"],["Starting_forest","Underkeep_Cemetery"],["Starting_forest","Mines_under_forest"],["Starting_forest","Mines_under_forest"],["Starting_forest","Mines_under_forest"],["Surroundings_Cave","Underkeep_Surroundings"],["Swamp","Swamp_Spider_Nest"],["Swamp","Swamp_Dungeon1"],["Swamp","Caerlin_Woods"],["Swamp","Caerlin_Woods"],["Swamp","Swamp_Lost_City"],["Swamp","Swamp_Dungeon1"],["Swamp_Dungeon1","Swamp"],["Swamp_Dungeon1","Swamp"],["Swamp_Dungeon1","Swamp_Dungeon2"],["Swamp_Dungeon2","Swamp_Dungeon1"],["Swamp_Lost_City","Swamp"],["Swamp_Spider_Nest","Swamp"],["Tower_Level1","Tower_Level2"],["Tower_Level1","Undertower"],["Tower_Level1","Underkeep_Surroundings"],["Tower_Level2","Tower_Level1"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2","Tower_Level3"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level3","Tower_Level4"],["Tower_Level3","Tower_Level2"],["Tower_Level4","Tower_Level5"],["Tower_Level4","Tower_Level3"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level5","Tower_Level4"],["Tower_Level5","Tower_Level5"],["Tower_Level5","Tower_Level5"],["Under_Abandoned_Cave","Abandoned_Mines_Cave"],["Underkeep_Cemetery","Village_of_Underkeep"],["Underkeep_Cemetery","Starting_forest"],["Underkeep_Cemetery","Mausoleum"],["Underkeep_Cemetery","Mausoleum"],["Underkeep_Surroundings","Surroundings_Cave"],["Underkeep_Surroundings","Village_of_Underkeep"],["Underkeep_Surroundings","Tower_Level1"],["Underkeep_Surroundings","West_woods"],["Village_of_Underkeep","Caerlin_Woods"],["Village_of_Underkeep","Underkeep_Surroundings"],["Village_of_Underkeep","Starting_forest"],["Village_of_Underkeep","Underkeep_Cemetery"],["West_Dungeon_1","West_woods"],["West_Dungeon_1","West_Dungeon_2"],["West_Dungeon_1","East_Garden"],["West_Dungeon_1","West_Garden"],["West_Dungeon_1","East_Garden"],["West_Dungeon_1","West_Garden"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_1"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_3","West_Dungeon_2"],["West_Dungeon_3","West_Dungeon_2"],["West_Dungeon_3","West_Dungeon_3"],["West_Dungeon_3","West_Dungeon_3"],["West_Dungeon_3","West_woods"],["West_Dungeon_3","West_Dungeon_2"],["West_Garden","West_Dungeon_1"],["West_Garden","West_Dungeon_1"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_woods","Caerlin_Woods"],["West_woods","Dragon_den"],["West_woods","Dragon_den"],["West_woods","Underkeep_Surroundings"],["West_woods","West_Dungeon_1"],["Wolf_den","Caerlin_Woods"]],
"travelStops": [{"map":"Caerlin_Woods","id":1241,"xy":[20,-35],"name":"{{t:maps.names.caerlin_woods}}"},{"map":"East_Garden","id":925,"xy":[8,0],"name":"{{t:maps.names.east_garden}}"},{"map":"Starting_forest","id":2767,"xy":[7,-34],"name":"{{t:maps.names.starting_forest}}"},{"map":"Swamp","id":518,"xy":[42,36],"name":"{{t:maps.names.swamp}}"},{"map":"Underkeep_Surroundings","id":1073,"xy":[4,-19],"name":"{{t:maps.ui.name-6}}"},{"map":"Village_of_Underkeep","id":1072,"xy":[7,-9],"name":"{{t:maps.names.village_of_underkeep}}"},{"map":"West_woods","id":1403,"xy":[-13,-29],"name":"{{t:maps.ui.name-7}}"},{"map":"West_woods","id":1402,"xy":[-1,15],"name":"{{t:maps.ui.name-8}}"}],
"objects": {
"acquisition_pedestal": {"type":"acquire","title":"{{t:maps.objects.acquisition_pedestal}}","detail":{"{{t:common.acquire-method}}":"{{t:maps.objects.acquisition_pedestal.detail}}"},"sprite":"etile_item","rotation":0,"native":null,"nativeRotation":0},
"acquisition_scriptor": {"type":"acquire","title":"{{t:maps.objects.acquisition_pedestal}}","detail":{"{{t:common.acquire-method}}":"{{t:maps.objects.acquisition_pedestal.detail}}"},"sprite":"etile_item","rotation":0,"native":null,"nativeRotation":0},
"altar1_ivy_green": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"mtile_altar","rotation":0,"native":"mtile_altar","nativeRotation":0,"isChest":false},
"barrel1": {"type":"treasure","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"barrel1_moss": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"blocker": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"etile_secret_wall","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"brazier3": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"etile_brazier02","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"button1": {"type":"mechanism","title":"{{t:maps.objects.button1}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"button_skull": {"type":"mechanism","title":"{{t:maps.objects.button_skull}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"campfire2": {"type":"item","title":"{{t:guide.item_recipe_item_food_toast.ingredients}}","detail":{"{{t:common.acquire-method}}":"{{t:maps.objects.campfire2.detail}}"},"sprite":"item_food_ham","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_recipe_item_food_toast.ingredients|length}},"item_food_ham"]]},
"cave2_exit1": {"type":"passage","title":"{{t:maps.objects.cave2_exit1}}","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave2_pressure_plate": {"type":"mechanism","title":"{{t:maps.objects.cave2_pressure_plate}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"cave_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"cave_exit1": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave_exit2_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave_gold_wall": {"type":"gold-vein","title":"{{t:maps.objects.cave_gold_wall}}","detail":{"{{t:common.required-items}}":"{{t:guide.item_gold_chisel}}","{{t:common.available-items}}":"{{t:maps.objects.cave_gold_wall.detail}}"},"sprite":"etile_golden_vein","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.required-items}}":[[0,{{t:guide.item_gold_chisel|length}},"item_gold_chisel"]],"{{t:common.available-items}}":{{t:maps.objects.cave_gold_wall.detail.item-links|json}}}},
"cave_pressure_plate_crown": {"type":"mechanism","title":"{{t:maps.objects.cave_pressure_plate_crown}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_fire": {"type":"mechanism","title":"{{t:maps.objects.cave_pressure_plate_fire}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_serpent": {"type":"mechanism","title":"{{t:maps.objects.cave_pressure_plate_serpent}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_tree": {"type":"mechanism","title":"{{t:maps.objects.cave_pressure_plate_tree}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_secret_button": {"type":"mechanism","title":"{{t:maps.objects.cave_secret_button}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"cave_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"cemetery_gate": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"chest1": {"type":"treasure","title":"{{t:maps.objects.chest1}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_locked": {"type":"treasure","title":"{{t:maps.objects.chest1_locked}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_moss": {"type":"treasure","title":"{{t:maps.objects.chest1_moss}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_moss_locked": {"type":"treasure","title":"{{t:maps.objects.chest1_moss_locked}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest_mausoleum1": {"type":"treasure","title":"{{t:maps.objects.chest_mausoleum1}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chopping_block_axe": {"type":"treasure","title":"{{t:common.searchable-container}}","detail":{"{{t:common.loot}}":"{{t:guide.item_hatchet}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_hatchet|length}},"item_hatchet"]]}},
"coffin": {"type":"treasure","title":"{{t:common.searchable-container}}","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"coffin_on_altar": {"rotation":0,"nativeRotation":0,"isChest":false},
"collapsed_rocks_cave": {"type":"rubble","title":"{{t:common.normal-rubble}}","detail":{"{{t:common.required-items}}":"{{t:maps.objects.collapsed_rocks_cave.detail}}","{{t:common.interaction-effect}}":"{{t:maps.objects.collapsed_rocks_cave.detail-2}}"},"sprite":"mtile_collapsed_rocks","rotation":0,"native":"mtile_collapsed_rocks","nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.required-items}}":{{t:maps.objects.collapsed_rocks_cave.detail.item-links|json}}}},
"collapsed_rocks_cave_tough": {"type":"hard-rubble","title":"{{t:maps.objects.collapsed_rocks_cave_tough}}","detail":{"{{t:common.required-items}}":"{{t:guide.item_pickaxe_hard}}","{{t:common.interaction-effect}}":"{{t:maps.objects.collapsed_rocks_cave.detail-2}}"},"sprite":"collapsed_rocks_cave_tough","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.required-items}}":[[0,{{t:guide.item_pickaxe_hard|length}},"item_pickaxe_hard"]]}},
"collapsed_rocks_mine": {"type":"rubble","title":"{{t:common.normal-rubble}}","detail":{"{{t:common.required-items}}":"{{t:maps.objects.collapsed_rocks_cave.detail}}","{{t:common.interaction-effect}}":"{{t:maps.objects.collapsed_rocks_cave.detail-2}}"},"sprite":"mtile_collapsed_rocks","rotation":0,"native":"mtile_collapsed_rocks","nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.required-items}}":{{t:maps.objects.collapsed_rocks_cave.detail.item-links|json}}}},
"crate1_moss": {"type":"treasure","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate2": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate2_moss": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate3": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate4": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate5": {"type":"treasure","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"display_text": {"type":"note","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dragon_territory": {"type":"note","title":"{{t:maps.objects.dragon_territory}}","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_metal_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"isChest":false},
"dung_metal_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"dung_metal_grate_door": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"dung_metal_pressure_plate": {"type":"mechanism","title":"{{t:maps.objects.cave2_pressure_plate}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"dung_metal_secret_button": {"type":"mechanism","title":"{{t:maps.objects.cave_secret_button}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_metal_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_metal_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false},
"dung_metal_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false},
"dung_moss_secret_button": {"type":"mechanism","title":"{{t:maps.objects.cave_secret_button}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_moss_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_outdoor_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"dung_outdoor_wall_secret": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_outdoor_wooden_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"isChest":false},
"dung_outdoor_wooden_door_1": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"dung_swamp_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","nativeRotation":270,"isChest":false},
"dung_swamp_grate_door": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","isChest":false},
"dung_swamp_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_swamp_stairs_up": {"type":"passage","detail":{"{{t:common.entrance-direction}}":"{{t:common.north}}"},"sprite":"mtile_passage","rotation":0,"native":"mtile_passage","nativeRotation":0,"isChest":false,"directExit":true},
"dung_swamp_wooden_door_1": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"dwarf_npc": {"type":"service","title":"{{t:guide.dwarf}}","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"encounter_wizard_first_contact": {"type":"event","title":"{{t:maps.objects.encounter_wizard_first_contact}}","detail":{"{{t:common.related-quest}}":["{{t:guide.underkeep_main_quest}}"],"{{t:common.event-content}}":"{{t:maps.objects.encounter_wizard_first_contact.detail}}","{{t:common.conditional-options}}":"{{t:maps.objects.encounter_wizard_first_contact.detail-2}}"},"sprite":"hud_icon_quest_active","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.conditional-options}}":{{t:maps.objects.encounter_wizard_first_contact.detail-2.item-links|json}}},"dialogue":[["{{t:common.event-opening}}",["{{t:maps.objects.encounter_wizard_first_contact.detail}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-2}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-3}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-4}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-5}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-6}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-7}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-8}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-9}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-10}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-11}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-12}}"],[]],["{{t:common.dialogue-options}}",[],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-13}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-14}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-15}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-16}}"]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-17}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-18}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-19}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-20}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-21}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-22}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-23}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-24}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-25}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-26}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-27}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-28}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-29}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-17}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-30}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-31}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-3}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-4}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-32}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-33}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-34}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-35}}"],[]],["{{t:common.dialogue-options}}",[],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-36}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-37}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-38}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-39}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-40}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-41}}"]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-42}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-7}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-43}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-44}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-45}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-46}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-47}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-48}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-49}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-50}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-51}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-52}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-53}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-54}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-55}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-56}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-57}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-58}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-59}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-60}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-61}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-62}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-63}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-64}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-65}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-66}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-67}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-29}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-68}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-30}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-63}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-69}}"],[]],["{{t:maps.objects.encounter_wizard_first_contact.dialogue-56}}",["{{t:maps.objects.encounter_wizard_first_contact.dialogue-70}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-71}}","{{t:maps.objects.encounter_wizard_first_contact.dialogue-72}}"],[]]]},
"enemy_bee": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_bee}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.enemy_bee.detail}}","{{t:common.xp-value}}":"120","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.enemy_bee.detail.item-links|json}}}},
"enemy_blood_acolyte": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_blood_acolyte}}","detail":{"{{t:common.xp-value}}":"140"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_blood_golem": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_blood_golem}}","detail":{"{{t:common.xp-value}}":"300"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_brown_spider": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_brown_spider}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.enemy_brown_spider.detail}}","{{t:common.xp-value}}":"60","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.enemy_brown_spider.detail.item-links|json}}}},
"enemy_caerlin_wolf": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_caerlin_wolf}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.enemy_caerlin_wolf.detail}}","{{t:common.xp-value}}":"110","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.enemy_caerlin_wolf.detail.item-links|json}}}},
"enemy_dryad": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_dryad}}","sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_dungeon_skeleton": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_dungeon_skeleton}}","detail":{"{{t:common.xp-value}}":"140","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_ghost": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_ghost}}","detail":{"{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_minor_mana_potion_dvojka.ingredients|length}},"item_ingredient_ectoplasm"]]}},
"enemy_mushroom": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_mushroom}}","detail":{"{{t:common.xp-value}}":"130"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_orc_bandit": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_orc_bandit}}","detail":{"{{t:common.xp-value}}":"175","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_skeleton": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_skeleton}}","detail":{"{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_skeleton_archer": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_skeleton_archer}}","detail":{"{{t:common.xp-value}}":"70","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_spider": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_spider}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.enemy_brown_spider.detail}}","{{t:common.xp-value}}":"40","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.enemy_brown_spider.detail.item-links|json}}}},
"enemy_statue_guardian": {"enemyGuide":true,"type":"boss","title":"{{t:guide.enemy_statue_guardian}}","detail":{"{{t:common.xp-value}}":"800"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_stoneclaw": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_stoneclaw}}","detail":{"{{t:common.xp-value}}":"150"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_swamp_boss": {"enemyGuide":true,"type":"boss","title":"{{t:guide.enemy_swamp_boss}}","detail":{"{{t:common.xp-value}}":"300"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_swamp_tentacle1": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_swamp_tentacle1}}","detail":{"{{t:common.xp-value}}":"100"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_vampire_beetle": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_vampire_beetle}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.enemy_vampire_beetle.detail}}","{{t:common.xp-value}}":"130","{{t:common.acquire-method}}":"{{t:common.enemy-or-interaction-drop}}"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.enemy_vampire_beetle.detail.item-links|json}}}},
"enemy_wyvern": {"enemyGuide":true,"type":"boss","title":"{{t:guide.enemy_wyvern}}","detail":{"{{t:common.xp-value}}":"1500"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_corrupt_sword": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_zombie_corrupt_sword}}","detail":{"{{t:common.xp-value}}":"120"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_pickaxe": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_zombie_pickaxe}}","detail":{"{{t:common.xp-value}}":"70"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_sword": {"enemyGuide":true,"type":"enemy","title":"{{t:guide.enemy_zombie_sword}}","detail":{"{{t:common.xp-value}}":"75"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"fast_travel_portal": {"type":"travel","detail":{"{{t:maps.objects.fast_travel_portal.detail}}":"{{t:maps.objects.fast_travel_portal.detail-2}}"},"sprite":"mtile_fast_travel_portal","rotation":0,"native":"mtile_fast_travel_portal","nativeRotation":0,"isChest":false,"itemLinks":{"{{t:maps.objects.fast_travel_portal.detail}}":{{t:maps.objects.fast_travel_portal.detail-2.item-links|json}}}},
"female_npc": {"type":"service","title":"{{t:maps.ui.title-2}}","rotation":0,"nativeRotation":0,"isChest":false},
"flower1": {"type":"gather","title":"{{t:common.gather-crimsonspire-berries}}","detail":{"{{t:common.loot}}":"{{t:guide.item_heal_potion.ingredients}}"},"sprite":"item_flower_crimson_berries","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_heal_potion.ingredients|length}},"item_flower_crimsonspire_berries"]]},"titleLinks":{{t:common.gather-crimsonspire-berries.item-links|json}}},
"flower4": {"type":"gather","title":"{{t:common.gather-solarbloom}}","detail":{"{{t:common.loot}}":"{{t:guide.item_minor_endurance_potion.ingredients}}"},"sprite":"item_flower_solarbloom","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_minor_endurance_potion.ingredients|length}},"item_flower_solarbloom"]]},"titleLinks":{{t:common.gather-solarbloom.item-links|json}}},
"flower5": {"type":"gather","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"flower6": {"type":"gather","title":"{{t:common.gather-moonpetal}}","detail":{"{{t:common.loot}}":"{{t:guide.item_minor_mana_potion.ingredients}}"},"sprite":"item_flower_moonpetal","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_minor_mana_potion.ingredients|length}},"item_flower_moonpetal"]]},"titleLinks":{{t:common.gather-moonpetal.item-links|json}}},
"flower9": {"type":"gather","title":"{{t:maps.objects.flower9}}","detail":{"{{t:common.loot}}":"{{t:guide.item_recipe_perma_mana.ingredients}}"},"sprite":"item_caerlin_blue_flowers","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_recipe_perma_mana.ingredients|length}},"item_caerlin_blue_flowers"]]},"titleLinks":{{t:maps.objects.flower9.item-links|json}}},
"forest_bush2_berry": {"type":"gather","title":"{{t:common.gather-wild-berries}}","detail":{"{{t:common.loot}}":"{{t:guide.item_wild_berries}}"},"sprite":"item_wild_berries","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:guide.item_wild_berries|length}},"item_wild_berries"]]},"titleLinks":{{t:common.gather-wild-berries.item-links|json}}},
"forest_cave_entrance": {"type":"passage","detail":{"{{t:common.entrance-direction}}":"{{t:common.west}}"},"sprite":"mtile_passage","rotation":270,"native":"mtile_passage","nativeRotation":270,"isChest":false,"directExit":true},
"forest_grate_door": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","isChest":false},
"forest_rock_wall_cave": {"type":"passage","sprite":"mtile_passage","isChest":false,"directExit":true},
"forest_rock_wall_cave_passage": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"forest_stone_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"forest_stone_wall_button": {"type":"mechanism","title":"{{t:maps.objects.button1}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"garbage1": {"type":"treasure","title":"{{t:common.searchable-junk}}","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"grave1_with_txt": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave2_crumble": {"type":"mechanism","title":"{{t:common.mechanism}}","detail":{"{{t:common.interaction-hint}}":"{{t:maps.objects.grave2_crumble.detail}}"},"sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave2_with_txt": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave5_with_txt": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"guard2_npc": {"type":"service","title":"{{t:maps.objects.guard2_npc}}","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"invisible_passage": {"sprite":"mtile_passage","rotation":0,"nativeRotation":0,"isChest":false},
"invisible_pressure_plate": {"type":"trigger","title":"{{t:maps.objects.invisible_pressure_plate}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"item_bones01": {"type":"junk","title":"{{t:guide.item_bones01}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_bones01|length}},"item_bones01"]]},
"item_bones02": {"type":"junk","title":"{{t:guide.item_bones02}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones2","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_bones02|length}},"item_bones02"]]},
"item_bones03": {"type":"junk","title":"{{t:guide.item_recipe_armor_potion.ingredients}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones3","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_recipe_armor_potion.ingredients|length}},"item_bones03"]]},
"item_bones04": {"type":"junk","title":"{{t:guide.item_bones02}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones4","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_bones02|length}},"item_bones04"]]},
"item_bones05": {"type":"junk","title":"{{t:guide.item_bones05}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones5","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_bones05|length}},"item_bones05"]]},
"item_bones06": {"type":"junk","title":"{{t:guide.item_bones02}}","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"item_bones6","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:guide.item_bones02|length}},"item_bones06"]]},
"item_boulder": {"type":"junk","title":"{{t:guide.item_boulder}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_boulder}}"},"sprite":"item_boulder","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_boulder|length}},"item_boulder"]]},"titleLinks":[[0,{{t:guide.item_boulder|length}},"item_boulder"]]},
"item_coins": {"type":"item","detail":{"{{t:common.acquire-method}}":"{{t:common.ground-pickup}}"},"sprite":"etile_coin","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,{{t:common.coins|length}},"item_coins"]]},
"item_crimson_ring": {"type":"item","title":"{{t:guide.item_crimson_ring}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_crimson_ring}}"},"sprite":"item_crimson_ring","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_crimson_ring|length}},"item_crimson_ring"]]},"titleLinks":[[0,{{t:guide.item_crimson_ring|length}},"item_crimson_ring"]]},
"item_dagger": {"type":"item","title":"{{t:guide.thief-skill_backstab_the_weak.facts}}","detail":{"{{t:common.available-items}}":"{{t:guide.thief-skill_backstab_the_weak.facts}}"},"sprite":"item_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.thief-skill_backstab_the_weak.facts|length}},"item_dagger"]]},"titleLinks":[[0,{{t:guide.thief-skill_backstab_the_weak.facts|length}},"item_dagger"]]},
"item_diamond_green": {"type":"item","title":"{{t:guide.item_diamond_green}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_diamond_green}}"},"sprite":"item_diamond_green","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_diamond_green|length}},"item_diamond_green"]]},"titleLinks":[[0,{{t:guide.item_diamond_green|length}},"item_diamond_green"]]},
"item_diamond_orange": {"type":"item","title":"{{t:guide.item_diamond_orange}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_diamond_orange}}"},"sprite":"item_diamond_orange","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_diamond_orange|length}},"item_diamond_orange"]]},"titleLinks":[[0,{{t:guide.item_diamond_orange|length}},"item_diamond_orange"]]},
"item_empty_flask": {"type":"item","title":"{{t:guide.recipe_minor_healing.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.recipe_minor_healing.ingredients}}"},"sprite":"item_empty_flask","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.recipe_minor_healing.ingredients|length}},"item_empty_flask"]]},"titleLinks":[[0,{{t:guide.recipe_minor_healing.ingredients|length}},"item_empty_flask"]]},
"item_flower_solarbloom": {"type":"gather","title":"{{t:guide.item_minor_endurance_potion.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_minor_endurance_potion.ingredients}}"},"sprite":"item_flower_solarbloom","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_minor_endurance_potion.ingredients|length}},"item_flower_solarbloom"]]},"titleLinks":[[0,{{t:guide.item_minor_endurance_potion.ingredients|length}},"item_flower_solarbloom"]]},
"item_food_apple": {"type":"gather","title":"{{t:guide.item_food_apple}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_food_apple}}"},"sprite":"item_apple","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_food_apple|length}},"item_food_apple"]]},"titleLinks":[[0,{{t:guide.item_food_apple|length}},"item_food_apple"]]},
"item_food_bread": {"type":"item","title":"{{t:guide.item_recipe_item_food_toast.ingredients-2}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_recipe_item_food_toast.ingredients-2}}"},"sprite":"item_food_bread","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_recipe_item_food_toast.ingredients-2|length}},"item_food_bread"]]},"titleLinks":[[0,{{t:guide.item_recipe_item_food_toast.ingredients-2|length}},"item_food_bread"]]},
"item_food_bread_mold": {"type":"item","title":"{{t:guide.item_food_bread_mold}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_food_bread_mold}}"},"sprite":"item_food_bread_moldy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_food_bread_mold|length}},"item_food_bread_mold"]]},"titleLinks":[[0,{{t:guide.item_food_bread_mold|length}},"item_food_bread_mold"]]},
"item_food_chees": {"type":"item","title":"{{t:guide.item_recipe_item_food_toast.ingredients-3}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_recipe_item_food_toast.ingredients-3}}"},"sprite":"item_food_cheese","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_recipe_item_food_toast.ingredients-3|length}},"item_food_chees"]]},"titleLinks":[[0,{{t:guide.item_recipe_item_food_toast.ingredients-3|length}},"item_food_chees"]]},
"item_food_ham": {"type":"item","title":"{{t:guide.item_recipe_item_food_toast.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_recipe_item_food_toast.ingredients}}"},"sprite":"item_food_ham","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_recipe_item_food_toast.ingredients|length}},"item_food_ham"]]},"titleLinks":[[0,{{t:guide.item_recipe_item_food_toast.ingredients|length}},"item_food_ham"]]},
"item_food_ration": {"type":"item","title":"{{t:guide.item_food_ration}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_food_ration}}"},"sprite":"item_food_ration","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_food_ration|length}},"item_food_ration"]]},"titleLinks":[[0,{{t:guide.item_food_ration|length}},"item_food_ration"]]},
"item_generic_ash": {"type":"junk","title":"{{t:guide.item_generic_ash}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_generic_ash}}"},"sprite":"item_generic_ash","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_generic_ash|length}},"item_generic_ash"]]},"titleLinks":[[0,{{t:guide.item_generic_ash|length}},"item_generic_ash"]]},
"item_generic_broken_dagger": {"type":"junk","title":"{{t:guide.item_generic_broken_dagger}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_generic_broken_dagger}}"},"sprite":"item_generic_broken_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_generic_broken_dagger|length}},"item_generic_broken_dagger"]]},"titleLinks":[[0,{{t:guide.item_generic_broken_dagger|length}},"item_generic_broken_dagger"]]},
"item_hand_axe": {"type":"item","title":"{{t:guide.item_hand_axe}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_hand_axe}}"},"sprite":"item_axe_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_hand_axe|length}},"item_hand_axe"]]},"titleLinks":[[0,{{t:guide.item_hand_axe|length}},"item_hand_axe"]]},
"item_hardened_armor": {"type":"item","title":"{{t:guide.item_hardened_armor}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_hardened_armor}}"},"sprite":"item_armor_hardened","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_hardened_armor|length}},"item_hardened_armor"]]},"titleLinks":[[0,{{t:guide.item_hardened_armor|length}},"item_hardened_armor"]]},
"item_heal_potion": {"type":"item","title":"{{t:guide.item_heal_potion}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_heal_potion}}"},"sprite":"item_potion_heal_medium","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_heal_potion|length}},"item_heal_potion"]]},"titleLinks":[[0,{{t:guide.item_heal_potion|length}},"item_heal_potion"]]},
"item_ingredient_mandibles": {"type":"item","title":"{{t:guide.item_cure_stun_or_paralyze.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_cure_stun_or_paralyze.ingredients}}"},"sprite":"item_ingredient_mandibles","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_cure_stun_or_paralyze.ingredients|length}},"item_ingredient_mandibles"]]},"titleLinks":[[0,{{t:guide.item_cure_stun_or_paralyze.ingredients|length}},"item_ingredient_mandibles"]]},
"item_key_lockpick": {"type":"item","title":"{{t:guide.item_key_lockpick}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_key_lockpick}}"},"sprite":"item_lockpicks","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_key_lockpick|length}},"item_key_lockpick"]]},"titleLinks":[[0,{{t:guide.item_key_lockpick|length}},"item_key_lockpick"]]},
"item_leather_boots": {"type":"item","title":"{{t:guide.item_leather_boots}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_leather_boots}}"},"sprite":"item_boots_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_leather_boots|length}},"item_leather_boots"]]},"titleLinks":[[0,{{t:guide.item_leather_boots|length}},"item_leather_boots"]]},
"item_leather_gloves": {"type":"item","title":"{{t:guide.item_leather_gloves}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_leather_gloves}}"},"sprite":"item_gloves_leather","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_leather_gloves|length}},"item_leather_gloves"]]},"titleLinks":[[0,{{t:guide.item_leather_gloves|length}},"item_leather_gloves"]]},
"item_leather_helmet": {"type":"item","title":"{{t:guide.item_leather_helmet}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_leather_helmet}}"},"sprite":"item_helmet_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_leather_helmet|length}},"item_leather_helmet"]]},"titleLinks":[[0,{{t:guide.item_leather_helmet|length}},"item_leather_helmet"]]},
"item_minor_endurance_potion": {"type":"item","title":"{{t:guide.item_minor_endurance_potion}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_minor_endurance_potion}}"},"sprite":"item_potion_stamina_small","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_minor_endurance_potion|length}},"item_minor_endurance_potion"]]},"titleLinks":[[0,{{t:guide.item_minor_endurance_potion|length}},"item_minor_endurance_potion"]]},
"item_mushroom1": {"type":"gather","title":"{{t:guide.item_food_minor_mushroom_stew.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_food_minor_mushroom_stew.ingredients}}"},"sprite":"item_mushroom_yellow","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_food_minor_mushroom_stew.ingredients|length}},"item_mushroom1"]]},"titleLinks":[[0,{{t:guide.item_food_minor_mushroom_stew.ingredients|length}},"item_mushroom1"]]},
"item_mushroom_blue": {"type":"gather","title":"{{t:guide.item_mushroom_blue}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_mushroom_blue}}"},"sprite":"item_mushroom_blue","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_mushroom_blue|length}},"item_mushroom_blue"]]},"titleLinks":[[0,{{t:guide.item_mushroom_blue|length}},"item_mushroom_blue"]]},
"item_mushroom_red": {"type":"gather","title":"{{t:guide.item_recipe_poison.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_recipe_poison.ingredients}}"},"sprite":"item_mushroom_red","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_recipe_poison.ingredients|length}},"item_mushroom_red"]]},"titleLinks":[[0,{{t:guide.item_recipe_poison.ingredients|length}},"item_mushroom_red"]]},
"item_pickaxe": {"type":"item","title":"{{t:guide.item_pickaxe}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_pickaxe}}"},"sprite":"item_pickaxe","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_pickaxe|length}},"item_pickaxe"]]},"titleLinks":[[0,{{t:guide.item_pickaxe|length}},"item_pickaxe"]]},
"item_potion_cure_poison": {"type":"item","title":"{{t:guide.item_cure_poison}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_cure_poison}}"},"sprite":"item_potion_cure_poison","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_cure_poison|length}},"item_potion_cure_poison"]]},"titleLinks":[[0,{{t:guide.item_cure_poison|length}},"item_potion_cure_poison"]]},
"item_potion_poison": {"type":"item","title":"{{t:guide.recipe_potion_heal_and_mana.ingredients}}","detail":{"{{t:common.available-items}}":"{{t:guide.recipe_potion_heal_and_mana.ingredients}}"},"sprite":"item_potion_poison","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.recipe_potion_heal_and_mana.ingredients|length}},"item_potion_poison"]]},"titleLinks":[[0,{{t:guide.recipe_potion_heal_and_mana.ingredients|length}},"item_potion_poison"]]},
"item_recipe_endurance_dvojka": {"type":"item","title":"{{t:maps.objects.item_recipe_endurance_dvojka}}","detail":{"{{t:common.available-items}}":"{{t:maps.objects.item_recipe_endurance_dvojka}}"},"sprite":"item_recipe","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:maps.objects.item_recipe_endurance_dvojka|length}},"item_recipe_endurance_dvojka"]]},"titleLinks":[[0,{{t:maps.objects.item_recipe_endurance_dvojka|length}},"item_recipe_endurance_dvojka"]]},
"item_respec_potion": {"type":"item","title":"{{t:guide.item_respec_potion}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_respec_potion}}"},"sprite":"item_potion_respec","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_respec_potion|length}},"item_respec_potion"]]},"titleLinks":[[0,{{t:guide.item_respec_potion|length}},"item_respec_potion"]]},
"item_rusty_dagger": {"type":"item","title":"{{t:guide.item_rusty_dagger}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_rusty_dagger}}"},"sprite":"item_rusty_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_rusty_dagger|length}},"item_rusty_dagger"]]},"titleLinks":[[0,{{t:guide.item_rusty_dagger|length}},"item_rusty_dagger"]]},
"item_rusty_great_axe": {"type":"item","title":"{{t:guide.item_rusty_great_axe}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_rusty_great_axe}}"},"sprite":"item_axe_06","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_rusty_great_axe|length}},"item_rusty_great_axe"]]},"titleLinks":[[0,{{t:guide.item_rusty_great_axe|length}},"item_rusty_great_axe"]]},
"item_rusty_hand_axe": {"type":"item","title":"{{t:guide.item_rusty_hand_axe}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_rusty_hand_axe}}"},"sprite":"item_axe_04","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_rusty_hand_axe|length}},"item_rusty_hand_axe"]]},"titleLinks":[[0,{{t:guide.item_rusty_hand_axe|length}},"item_rusty_hand_axe"]]},
"item_rusty_scale_helmet": {"type":"item","title":"{{t:guide.item_rusty_scale_helmet}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_rusty_scale_helmet}}"},"sprite":"item_helmet_scale_rusty","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_rusty_scale_helmet|length}},"item_rusty_scale_helmet"]]},"titleLinks":[[0,{{t:guide.item_rusty_scale_helmet|length}},"item_rusty_scale_helmet"]]},
"item_rusty_sword": {"type":"item","title":"{{t:guide.item_rusty_sword}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_rusty_sword}}"},"sprite":"item_rusty_sword","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_rusty_sword|length}},"item_rusty_sword"]]},"titleLinks":[[0,{{t:guide.item_rusty_sword|length}},"item_rusty_sword"]]},
"item_scroll_underkeep_letter_blood": {"type":"item","title":"{{t:guide.item_scroll_underkeep_letter_blood}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_scroll_underkeep_letter_blood}}"},"sprite":"item_scroll_blood","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_scroll_underkeep_letter_blood|length}},"item_scroll_underkeep_letter_blood"]]},"titleLinks":[[0,{{t:guide.item_scroll_underkeep_letter_blood|length}},"item_scroll_underkeep_letter_blood"]]},
"item_tattered_robe": {"type":"item","title":"{{t:guide.item_tattered_robe}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_tattered_robe}}"},"sprite":"item_robe_tattered","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_tattered_robe|length}},"item_tattered_robe"]]},"titleLinks":[[0,{{t:guide.item_tattered_robe|length}},"item_tattered_robe"]]},
"item_wooden_shield": {"type":"item","title":"{{t:guide.item_wooden_shield}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_wooden_shield}}"},"sprite":"item_wooden_shield","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,{{t:guide.item_wooden_shield|length}},"item_wooden_shield"]]},"titleLinks":[[0,{{t:guide.item_wooden_shield|length}},"item_wooden_shield"]]},
"level_portal1_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"level_portal2_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"level_portal3_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"lever1": {"type":"mechanism","title":"{{t:maps.objects.lever1}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"map_location": {"type":"location","sprite":"etile_map_location","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mausoleum_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"mausoleum_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"mausoleum_grate_door": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","isChest":false},
"mausoleum_secret_button": {"type":"mechanism","title":"{{t:maps.objects.cave_secret_button}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mausoleum_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"mausoleum_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mausoleum_stairs_up": {"type":"passage","detail":{"{{t:common.entrance-direction}}":"{{t:common.east}}"},"sprite":"mtile_passage","rotation":90,"native":"mtile_passage","nativeRotation":90,"isChest":false,"directExit":true},
"mausoleum_wooden_door_2": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"mine_alcove": {"type":"treasure","title":"{{t:common.wall-niche}}","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"mine_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"mine_forest_entrance": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mine_pressure_plate": {"type":"mechanism","title":"{{t:maps.objects.cave2_pressure_plate}}","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"mine_secret_button": {"type":"mechanism","title":"{{t:maps.objects.cave_secret_button}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mine_secret_wall": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"mine_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mud_tile": {"type":"trap","title":"{{t:maps.objects.mud_tile}}","sprite":"mtile_mud","rotation":0,"native":"mtile_mud","nativeRotation":0,"isChest":false},
"no_automap_area": {"type":"note","title":"{{t:maps.objects.no_automap_area}}","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"obelisk": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"mtile_statue","rotation":0,"native":"mtile_statue","nativeRotation":0,"isChest":false},
"pedestal": {"type":"treasure","title":"{{t:maps.objects.pedestal}}","sprite":"etile_pedestal","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_caerlin": {"type":"trap","sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_cave2_outfall": {"type":"note","title":"{{t:maps.objects.pit_cave2_outfall}}","detail":{"{{t:common.purpose}}":"{{t:maps.objects.pit_cave2_outfall.detail}}"},"sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_cave_outfall": {"type":"note","sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_cave_outfall_large_sun": {"type":"note","title":"{{t:maps.objects.pit_cave2_outfall}}","detail":{"{{t:common.purpose}}":"{{t:maps.objects.pit_cave2_outfall.detail}}"},"sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_dung_metal": {"sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_grass": {"detail":{"{{t:common.initial-state}}":"{{t:common.close}}"},"sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_mine_outfall": {"type":"note","sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"rake_in_grass": {"type":"trap","title":"{{t:maps.objects.rake_in_grass}}","detail":{"{{t:common.available-items}}":"{{t:maps.objects.rake_in_grass.detail}}"},"sprite":"item_rake","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":{{t:maps.objects.rake_in_grass.detail.item-links|json}}}},
"red_mausoleum_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"red_mausoleum_grate_door": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","isChest":false},
"red_mausoleum_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"red_sarcophagus1": {"rotation":0,"nativeRotation":0,"isChest":false},
"resurrect_shrine": {"type":"service","title":"{{t:maps.objects.resurrect_shrine}}","sprite":"mtile_shrine","rotation":0,"native":"mtile_shrine","nativeRotation":0,"isChest":false},
"resurrect_shrine_no_grass": {"type":"service","title":"{{t:maps.objects.resurrect_shrine}}","sprite":"mtile_shrine","rotation":0,"native":"mtile_shrine","nativeRotation":0,"isChest":false},
"road_sign1": {"type":"mechanism","title":"{{t:maps.objects.road_sign1}}","sprite":"etile_road_sign","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"sarcophagus1": {"type":"treasure","title":"{{t:common.searchable-container}}","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"sarcophagus2": {"rotation":0,"nativeRotation":0,"isChest":false},
"scriptor": {"type":"trigger","sprite":"etile_pressure_plate","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"shallow_grave_dirt": {"type":"treasure","title":"{{t:common.searchable-container}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.shallow_grave_dirt.detail}}","{{t:common.acquire-method}}":"{{t:maps.objects.shallow_grave_dirt.detail-2}}","{{t:common.drop-rules}}":"{{t:maps.objects.shallow_grave_dirt.detail-3}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.acquire-method}}":{{t:maps.objects.shallow_grave_dirt.detail-2.item-links|json}},"{{t:common.loot}}":{{t:maps.objects.shallow_grave_dirt.detail.item-links|json}}}},
"simple_trigger": {"type":"trigger","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_egg": {"type":"treasure","title":"{{t:common.searchable-container}}","detail":{"{{t:common.loot}}":"{{t:maps.objects.slime_egg.detail}}","{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":{{t:maps.objects.slime_egg.detail.item-links|json}}}},
"slime_small_egg1": {"type":"trigger","title":"{{t:common.trigger-point}}","detail":{"{{t:common.trigger-target}}":"{{t:common.party}}"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg2": {"type":"trigger","title":"{{t:common.trigger-point}}","detail":{"{{t:common.trigger-target}}":"{{t:common.party}}"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg3": {"type":"trigger","title":"{{t:common.trigger-point}}","detail":{"{{t:common.trigger-target}}":"{{t:common.party}}"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg4": {"type":"trigger","title":"{{t:common.trigger-point}}","detail":{"{{t:common.trigger-target}}":"{{t:common.party}}"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"spawner": {"type":"trigger","title":"{{t:common.spawn-point}}","sprite":"etile_pressure_plate","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"statue_gargoyle_hint": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"mtile_statue","rotation":0,"native":"mtile_statue","nativeRotation":0,"isChest":false},
"table1_props": {"type":"treasure","title":"{{t:common.breakable-container}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"torch1": {"type":"mechanism","title":"{{t:common.mechanism}}","sprite":"torch1_side","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"torren_npc_friendly": {"type":"service","title":"{{t:guide.torren_npc_unfriendly}}","rotation":0,"nativeRotation":0,"isChest":false},
"tower_button": {"type":"mechanism","title":"{{t:maps.objects.button1}}","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tower_door_silver": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","rotation":0,"nativeRotation":0,"isChest":false},
"tower_door_stone": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","isChest":false},
"tower_grate_door_silver": {"type":"mechanism","title":"{{t:maps.objects.dung_metal_grate_door}}","sprite":"mtile_door","native":"mtile_door","isChest":false},
"tower_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"tower_stairs_up": {"type":"passage","detail":{"{{t:common.entrance-direction}}":"{{t:common.south}}"},"sprite":"mtile_passage","rotation":180,"native":"mtile_passage","nativeRotation":180,"isChest":false,"directExit":true},
"tower_surroundings_gate_door": {"type":"mechanism","title":"{{t:maps.objects.cave_door}}","detail":{"{{t:common.initial-state}}":"{{t:common.close}}"},"sprite":"mtile_door","native":"mtile_door","isChest":false},
"tower_teleport": {"type":"travel","title":"{{t:maps.objects.tower_teleport}}","sprite":"mtile_teleport","rotation":0,"native":"mtile_teleport","nativeRotation":0,"isChest":false},
"tower_wall_rich3_secret": {"type":"secret","title":"{{t:maps.objects.cave_secret_wall}}","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"tree_oak1_with_hide": {"type":"treasure","title":"{{t:common.searchable-container}}","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tree_stump_large1_hide": {"type":"treasure","title":"{{t:common.searchable-container}}","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.loot}}":[[0,{{t:common.coins|length}},"item_coins"]]}},
"trigger_play_sound": {"type":"trigger","title":"{{t:maps.objects.trigger_play_sound}}","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"trigger_play_sound_secret": {"type":"secret","title":"{{t:maps.objects.trigger_play_sound_secret}}","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tutorial_hint": {"type":"note","title":"{{t:maps.objects.tutorial_hint}}","detail":{"{{t:common.trigger-count}}":"{{t:maps.objects.tutorial_hint.detail}}"},"sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn1": {"type":"treasure","title":"{{t:common.clay-jar}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn2": {"type":"treasure","title":"{{t:common.clay-jar}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn3": {"type":"treasure","title":"{{t:common.clay-jar}}","detail":{"{{t:common.acquire-method}}":"{{t:common.break-to-acquire}}"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"wall_sign": {"type":"note","title":"{{t:maps.objects.wall-sign}}","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"wizard_npc_friendly": {"type":"service","title":"{{t:maps.objects.wizard_npc_friendly}}","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"wizard_npc_illu": {"type":"service","title":"{{t:maps.objects.wizard_npc_illu}}","detail":{"{{t:common.initial-state}}":"{{t:common.hidden}}"},"sprite":"mtile_enemy_friend","rotation":0,"native":null,"nativeRotation":0,"isChest":false}
}
};
