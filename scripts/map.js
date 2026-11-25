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
  const typeKeys = Object.keys(atlas.types);
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
    return new Set(typeKeys.filter(key => atlas.types[key][3]));
  }

  function loadLayers() {
    let saved;
    try {
      saved = JSON.parse(window.localStorage.getItem(layerStorageKey));
    } catch {
      return defaultLayers();
    }
    return new Set(typeKeys.filter(key => typeof saved?.[key] === 'boolean' ? saved[key] : atlas.types[key][3]));
  }

  function saveLayer(key) {
    try {
      const settings = loadLayers();
      if (active.has(key)) settings.add(key);
      else settings.delete(key);
      const overrides = typeKeys.filter(type => settings.has(type) !== atlas.types[type][3]);
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

  function symbol(type, sprite = atlas.legendIcons[type], hasSpawnCondition = false) {
    const [label] = atlas.types[type];
    const tag = underkeepElement('span', undefined, 'symbol');
    if (type === 'location') {
      tag.textContent = '文';
      tag.setAttribute('aria-hidden', 'true');
      return tag;
    }
    const art = underkeepElement('img');
    if (type === 'boss') art.className = 'boss-icon';
    if (sprite === secretWallSprite) art.className = 'secret-wall';
    if (hasSpawnCondition) art.style.opacity = '.5';
    art.loading = 'lazy';
    art.src = atlas.art[sprite][0];
    art.alt = '';
    tag.append(art);
    tag.title = label;
    tag.setAttribute('aria-hidden', 'true');
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
    if (point.detail?.['現身條件']) attrs.opacity = .5;
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
        const [name, english] = underkeepMapNames[id];
        const link = underkeepElement('a', name, 'map-link');
        if (dungeonEntrance.has(id)) link.classList.add('submap');
        link.href = '#' + id;
        if (id === current.id) link.setAttribute('aria-current', 'page');
        link.append(underkeepElement('small', english));
        section.append(link);
      }
      children.push(section);
    }
    catalog.replaceChildren(...children);
    if (!children.length) catalog.append(underkeepElement('p', '查無符合的地圖', 'empty'));
  }

  function renderFilters() {
    for (const key of typeKeys) {
      byId('filter-' + key).setAttribute('aria-pressed', active.has(key));
    }
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
          || Number(Boolean(a.detail['現身條件'])) - Number(Boolean(b.detail['現身條件'])) || a.id - b.id;
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
      const badgeIndex = rubbleLayers.has(first.type) ? 1 : candidates.findIndex(point => miningLayers.has(point.type));
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

  const hoverFields = ['對話', '事件內容', '顯示文字', '進入提示', '原始文字', '觸發條件', '觸發次數', '用途',
    '現身條件', '開啟條件', '採集條件', '取得方式', '所需物品', '互動效果', '可取得', '翻不到東西', '戰利品', '掉落規則', '隨機內容',
    '其他可取得', '事件取得', '洞口方向', '落點', '來源地坑', '區域尺寸', '活動範圍', '安全區', '劇情分支', '條件選項'];

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
      const status = underkeepElement('p', '載入中…');
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
        else status.textContent = '找不到這筆圖鑑資料。';
      } catch {
        status.textContent = '圖鑑資料載入失敗，請關閉後重試。';
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
    if (point.questGuide) return { 觸發條件: point.detail['觸發條件'] };
    const groundPickup = point.type === 'item' && point.detail['可取得'] === point.title;
    const repeatedHint = point.detail['互動提示'] && point.detail['互動提示'] === point.detail['互動後提示'];
    if (!groundPickup && !repeatedHint) return point.detail;
    const details = groundPickup ? { 取得方式: '地面拾取', ...point.detail } : { ...point.detail };
    if (groundPickup) delete details['可取得'];
    if (repeatedHint) delete details['互動後提示'];
    return details;
  }

  function appendChoiceXp(target, choice, rewards) {
    if (!rewards) return;
    const key = choice.toLowerCase().replace(/\([^)]*\)|（[^）]*）|[^\p{L}\p{N}]/gu, '');
    if (!Object.hasOwn(rewards, key)) return;
    const reward = rewards[key];
    const [amount, condition] = Array.isArray(reward) ? reward : [reward];
    target.append(' ', underkeepXp(amount));
    if (condition) {
      const note = underkeepElement('span', undefined, 'choice-xp-condition');
      note.append('（', underkeepXpText(condition), '）');
      target.append(note);
    }
  }

  function detailContent(point, field, text) {
    if (field === '經驗值') return underkeepXp(Number(text));
    if (field === '關聯任務') {
      const fragment = document.createDocumentFragment();
      text.split('、').forEach((name, index) => {
        if (index) fragment.append('、');
        fragment.append(mapReferenceButton('quests', name, name));
      });
      return fragment;
    }
    const links = point.itemLinks?.[field];
    if (field === '條件選項') {
      const list = underkeepElement('ul', undefined, 'condition-options');
      for (const line of text.matchAll(/[^\r\n]+/g)) {
        const item = underkeepElement('li');
        item.append(linkedText(text, links, line.index, line.index + line[0].length));
        appendChoiceXp(item, line[0], point.choiceXp);
        list.append(item);
      }
      return list;
    }
    return linkedText(text, links);
  }

  function eventDialogue(sections, rewards) {
    const dialogue = underkeepElement('details', undefined, 'event-dialogue');
    dialogue.append(underkeepElement('summary', '完整對話與選項'));
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
        for (const choice of choices) {
          const item = underkeepElement('li');
          item.append(underkeepXpText(choice));
          appendChoiceXp(item, choice, rewards);
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
      .map(point => point === coins[0] ? { ...point, title: '金幣 ×' + amount } : point);
  }

  function appendPointTitle(title, point) {
    const label = underkeepElement('span');
    label.append(point.enemyGuide ? mapReferenceButton('enemies', point.key, point.title) : linkedText(point.title, point.titleLinks));
    title.append(symbol(point.type, point.sprite, Boolean(point.detail['現身條件'])), label);
  }

  function paintTooltip(points) {
    tooltip.replaceChildren();
    const limit = points[0]?.isChest ? 1 : 2;
    let overflow = points.length > limit;
    for (const point of points.slice(0, limit)) {
      const card = underkeepElement('div', undefined, 'tip-card');
      const title = underkeepElement('div', undefined, 'tip-title');
      title.append(symbol(point.type, point.sprite, Boolean(point.detail['現身條件'])), point.title);
      card.append(title);
      const details = pointDetails(point);
      for (const key of hoverFields) {
        let value = details[key];
        if (!value) continue;
        const max = key === '隨機內容' ? 550 : key === '戰利品' ? 420 : 230;
        if (value.length > max) {
          value = value.slice(0, max) + '…';
          overflow = true;
        }
        const row = underkeepElement('div', undefined, 'tip-line');
        row.append(underkeepElement('strong', key + ' ', 'tip-label'), underkeepXpText(value));
        card.append(row);
      }
      if (point.directExit) card.append(underkeepElement('p', '點選前往 ' + point.destination.name, 'tip-more'));
      tooltip.append(card);
    }
    if (overflow) tooltip.append(underkeepElement('p', '點選格位可查看完整內容', 'tip-more'));
  }

  function updateHover(event, location) {
    const x = Math.floor(location.x);
    const y = Math.floor(location.y);
    byId('coords').textContent = 'X ' + x + ' / Y ' + y;
    if (drag?.moved || event.pointerType === 'touch') {
      clearHover();
      return;
    }
    const key = x + ',' + y;
    if (hoveredCell !== key) {
      hoveredCell = key;
      placeCellFrame(hoverFrame, x, y);
      hoverFrame.setAttribute('visibility', 'visible');
      const points = plotted.get(key) || [];
      tooltip.hidden = !points.length;
      if (points.length) paintTooltip(groupCoinPiles(points));
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
    if (!selected) return;
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
    const cell = groupCoinPiles(current.markers.filter(p =>
      ((!miningLayers.has(p.type) && p.type !== 'junk') || active.has(p.type)) &&
      plot(p)[0] === selected.xy[0] && plot(p)[1] === selected.xy[1]));
    cell.sort((a, b) => Number(b.id === selected.id) - Number(a.id === selected.id));
    heading.textContent = '座標 ' + selected.xy.join(', ') + (cell.length ? '' : ' · 落點');
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
        const shop = underkeepElement('a', '查看可購買物品 ↗', 'jump');
        shop.href = '?view=guide&map=' + encodeURIComponent(current.id) + '#shops/' + encodeURIComponent(point.shopId);
        card.append(shop);
      }
      if (point.questGuide) card.append(questGuide(point.questGuide));
      else if (point.dialogue?.length) card.append(eventDialogue(point.dialogue, point.choiceXp));
      if (point.destination) {
        const dest = point.destination;
        const action = () => openMap(dest.map, dest);
        card.append(connect((dest.map === current.id ? '標出落點' : '跳到 ' + dest.name) + ' ↗', action));
      }
      if (point.key === 'fast_travel_portal') {
        const links = underkeepElement('section', undefined, 'travel-stops');
        links.append(underkeepElement('h4', '快速旅行站點'));
        for (const dest of atlas.travelStops) {
          if (dest.map === current.id && dest.id === point.id) continue;
          links.append(connect(dest.name + ' ↗', () => openMap(dest.map, dest)));
        }
        card.append(links);
      }
      if (point.sources.length) card.append(relationshipTable('相關來源', point.sources));
      if (point.targets.length) card.append(relationshipTable('連動目標', point.targets));
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
    byId('coords').textContent = 'X ' + x + ' / Y ' + y;
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
    const [name, english] = underkeepMapNames[current.id];
    byId('map-title').textContent = name;
    byId('map-title').title = name;
    byId('map-en').textContent = english;
    byId('coords').textContent = 'X / Y';
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
    draw('image', { href: 'images/maps/' + current.id + '.webp', x, y, width, height }, svg);
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
    button.append(symbol(key), underkeepElement('span', atlas.types[key][0]));
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
  byId('locate-selection').addEventListener('click', () => {
    setDrawer(null, true);
    selected.highlight = true;
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
    drag = { id: event.pointerId, center: { ...camera }, pageX: event.clientX, pageY: event.clientY,
      moved: false, marker: candidates?.[0] };
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
    const { moved, marker } = drag;
    drag = null;
    svg.classList.remove('dragging');
    if (!moved && marker) {
      if (marker.directExit) openMap(marker.destination.map, marker.destination);
      else {
        select(plot(marker), marker.id, false);
        setDrawer('details');
      }
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
    for (const [source, destination] of atlas.connections) {
      const from = region(source);
      const to = region(destination);
      if (from === to || neighbors.get(from).has(to)) continue;
      neighbors.get(from).add(to);
      neighbors.get(to).add(from);
      const [x1, y1] = positions[from];
      const [x2, y2] = positions[to];
      draw('line', { x1, y1, x2, y2, class: 'overview-route' }, chart);
    }

    for (const [id, [x, y]] of Object.entries(positions)) {
      const [name, english] = underkeepMapNames[id];
      const hub = neighbors.get(id).size >= 3;
      const link = draw('a', { href: '#' + id, transform: 'translate(' + x + ' ' + y + ')',
        class: 'overview-node' + (hub ? ' hub' : ''),
        'aria-label': name }, chart);
      links.set(id, link);
      draw('title', {}, link, name + ' · ' + english);
      const box = draw('rect', { rx: 6 }, link);
      const label = draw('text', { y: hub ? -1 : 5 }, link, name);
      const subtitle = hub && draw('text', { y: 17, class: 'overview-english' }, link, english);
      const width = Math.ceil(Math.max(label.getComputedTextLength(), subtitle ? subtitle.getComputedTextLength() : 0)) + 28;
      const height = hub ? 54 : 38;
      Object.entries({ x: -width / 2, y: -height / 2, width, height })
        .forEach(([key, value]) => box.setAttribute(key, value));
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
const underkeepLockedChestLootRule = "以下為初始機率。上鎖寶箱共用裝備池，抽出的裝備會從池中移除。";

const underkeepUrnLoot = {
  materials: {
    detail: {"戰利品":"30% · 金幣 ×1–3\n10% · 斷裂的骨頭、琥珀玫瑰、緋峰漿果、月瓣花、日輝花、靈質、蟲顎"},
    detailOrder: ["戰利品","取得方式"],
    itemLinks: {"戰利品":[[6,8,"item_coins"],[20,25,"item_bones01"],[26,30,"item_flower_amberrose"],[31,35,"item_flower_crimsonspire_berries"],[36,39,"item_flower_moonpetal"],[40,43,"item_flower_solarbloom"],[44,46,"item_ingredient_ectoplasm"],[47,49,"item_ingredient_mandibles"]]}
  },
  ashes: {
    detail: {"戰利品":"40% · 灰燼\n30% · 金幣 ×1–3\n20% · 斷裂的骨頭\n10% · 骨頭"},
    detailOrder: ["戰利品","取得方式"],
    itemLinks: {"戰利品":[[6,8,"item_generic_ash"],[15,17,"item_coins"],[29,34,"item_bones01"],[41,43,"item_bones03"]]}
  }
};

window.UNDERKEEP_ATLAS = {
"groups": [{"name":"獠牙根森林與礦洞","maps":["Starting_forest","Mines_under_forest","Rat_nest","Small_spider_cave","Abandoned_Mines_Cave","Under_Abandoned_Cave"]},{"name":"村莊、墓園與陵墓","maps":["Village_of_Underkeep","Forgotten_Vein","Underkeep_Cemetery","Mausoleum","Mausoleum_2","Mausoleum_3","Mausoleum_3_2"]},{"name":"凱爾林森林與陰沼","maps":["Caerlin_Woods","Caerlin_West_Dungeon","Basilisk_Den","Wolf_den","Swamp","Swamp_Dungeon1","Swamp_Dungeon2","Swamp_Lost_City","Swamp_Spider_Nest"]},{"name":"暮谷森林與靈魂鍛造爐","maps":["West_woods","Dragon_den","East_Garden","West_Garden","West_Dungeon_1","West_Dungeon_2","West_Dungeon_3"]},{"name":"高塔、外圍與塔底","maps":["Underkeep_Surroundings","Surroundings_Cave","Tower_Level1","Tower_Level2","Tower_Level2_Corrupted","Tower_Level3","Tower_Level4","Tower_Level5","Undertower"]}],
"types": {"passage":["出入口","A","#7bd8ff",true],"travel":["傳送","W","#73e1c0",true],"event":["劇情／任務","E","#fbd487",true],"boss":["首領／精英","B","#ff8fa0",true],"secret":["祕密","S","#d7baff",true],"trap":["陷阱","T","#ffaa76",true],"mechanism":["門／機關","M","#a6bdf5",true],"treasure":["容器／戰利品","L","#f2c078",true],"service":["設施／人物","H","#a9e2a2",true],"item":["地面物品","I","#b6e6a4",true],"junk":["低價雜物","I","#b6e6a4",false],"enemy":["敵人","F","#ffa9ab",false],"trigger":["觸發／生成","X","#b7b7c9",false],"note":["地標／提示","N","#d2dbe4",false],"gather":["可採集","G","#b6e6a4",false],"acquire":["事件取得","R","#f2d391",true],"location":["地點名稱","文","#e6d3ac",true],"rubble":["普通塌方","K","#bec9cd",true],"hard-rubble":["堅硬塌方","Q","#c8b0ed",true],"gold-vein":["含金岩壁","V","#f2c078",true]},
"terrain": {"floor":["地面／街道","#5f4e37","#314750"],"wall":["牆體","#736246","#7b8994"],"tree":["密林","#5f4e37","#315340"],"solid":["障礙","#5f4e37","#5b625f"]},
"art": {"etile_boulder":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCwAAAAvCwACEApFbRtJaJbh8v/MCSHKfATvIHT9nwDgkRL9pwJeKV7TPawEzCSaAg==",12,9],"etile_brazier01":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCsAAAAvB0ABEA4GbdsIOjJH89E+lAfhvZTpI/8D0v8K4BrobULztJNm97unf0MVAA==",8,6],"etile_brazier02":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCsAAAAvB0ABEA4GbdsIOjJH89E+lAfhvZTpI/8D0v8K4BrobULztJNm97unf0MVAA==",8,6],"etile_broken_barrier":["data:image/webp;base64,UklGRkIAAABXRUJQVlA4TDUAAAAvB4ABEBJEbdsIzVAcjuMP5nYc2rc/AoE0BJPMJgsE0pBKAgvc/wkYJAlOSZSWLi/3V7r6AwA=",8,7],"etile_building_door2":["data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBIAAAAvCEAAAA8wJgMV8x8cxj+i/0E=",9,2],"etile_bush":["data:image/webp;base64,UklGRlIAAABXRUJQVlA4TEUAAAAvC0ACEBbFkCRJNAuzFuuvcSpUGfSvv2LBNAQziaRS07YBi6nk7uz/BAADR/audCxQr93mV7NVjVHtZvzIQ6KWbqoFegUA",12,10],"etile_coin":["data:image/webp;base64,UklGRm4AAABXRUJQVlA4TGEAAAAvDAACEBY3kWxLFSpRgRYcIAN9f7lPxIQT34z1EGhYvL0sqkiihFHURgqc298JGtDF/E8AwARWhrr/VgV8P/uzfLF2H3nFHL1m1+5ospUHJHq8GaQPJ8CjU/sQ0K7K0AoAAA==",13,9],"etile_destroyable_barrier":["data:image/webp;base64,UklGRjwAAABXRUJQVlA4TC8AAAAvBwACABdAJmAZa7HhpyBtAxZK6e4bQOY/3jkDEASQJJHEPEPuuURE/wPqUr9UAAA=",8,9],"etile_dripstone_up":["data:image/webp;base64,UklGRjoAAABXRUJQVlA4TC0AAAAvCgACEApFbRtJaJbh8v/cEKLkI3gHoev/BACDlVXnpYBlllhllZvtNzwIuAcA",11,9],"etile_enemy":["data:image/webp;base64,UklGRkIAAABXRUJQVlA4TDUAAAAvDMACEAoFbdtIB+74k/ohJNEkj0n/JwBgsLLV+aqAncVutdTUL20qscoqAW1VVjOTH7gCAAA=",13,12],"etile_grave":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCsAAAAvCQACEApEbdsIzTE8/p/tDkPlfgTvIHT9n4DksCZxX0WfFGU8KVXj+fcJAA==",10,9],"etile_item":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCwAAAAvBgACEAqFjCRJJ3kY5w/wKnSnB04gkKS71Kz9nwAGO7hWAiZ/VuL07gV3AA==",7,9],"etile_lever":["data:image/webp;base64,UklGRjYAAABXRUJQVlA4TCoAAAAvBQABEAoDadvc3jXcv5OLaIuatg1YGLidAoEUZ7TJ/U8YCLgv8Z+upAo=",6,5],"etile_map_location":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDwAAAAvCkADEAoGbSM5QnMQD3/7axDmE4FAApM/yFQPSP8noAjZUgMctAkHCitUOZEFKvmokBUkC8iSn2yfcQA=",11,14],"etile_pedestal":["data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCIAAAAvC4ABEAaFbCRBNEuz/ki79xBMPrJ0kKX+T4DofSl6SPAD",12,7],"etile_pit_exit":["data:image/webp;base64,UklGRjwAAABXRUJQVlA4TDAAAAAvCUACEAqGjCQJonmS96e6+2eo6XzE9CAt/Z8APFTOIMT7SGwbZdeDjX+6hSBnFQA=",10,10],"etile_pressure_plate":["data:image/webp;base64,UklGRjgAAABXRUJQVlA4TCsAAAAvCUACEAoGbRtJGsLDH8Dey8CRpm/A+j8BGCpnezWg3Tlodz38pavQkbMKAA==",10,10],"etile_red_wall_root":["data:image/webp;base64,UklGRiIAAABXRUJQVlA4TBYAAAAvCEAAEAAIwv+4hfmP+SeYpKm2Y+A/",9,2],"etile_sarcophagus_coffin":["data:image/webp;base64,UklGRjYAAABXRUJQVlA4TCoAAAAvC8ABAFAIMBE0r5jyJ6h7CMSCKR5ePAkEUpzQYPd/AqD3lwB+VfxTQg8=",12,8],"etile_secret_wall":["data:image/webp;base64,UklGRlQAAABXRUJQVlA4TEcAAAAvDUADAFU4hCTJsmiO6jE8f4D7ImR1EEjaJNj2/mHP5/f7PwH/eX58PzwWXTGNTnQabbSLEe1maF8R3dBGF7RtNNEuSXvsLQA=",14,14],"etile_slime_egg":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDsAAAAvB8ABEBbGkCQJolmRIzl/joGoaon6EghQxsYULiCTtk0pabt7/Z8AeKwC+n818iy/oe6apZtGTqOdAQA=",8,8],"etile_slime_small_egg":["data:image/webp;base64,UklGRiwAAABXRUJQVlA4TB8AAAAvCoAAEAaCbBuae92f4znD9hGcg6j0fxVYwfM6ngcCAA==",11,3],"etile_text":["data:image/webp;base64,UklGRjwAAABXRUJQVlA4TC8AAAAvDEACEBcwSFM76PMfgAeEkGxlv8GHKoMyeEF9hIwj+h8Hf5MpmSv5lXl6HisIGgA=",13,10],"etile_tree":["data:image/webp;base64,UklGRl4AAABXRUJQVlA4TFIAAAAvC0ADEBbHkCSJFs2D+RbfX2NmlqHLoG91FQumIZhJJJWatg1YTCV3Z/8nIMmHNdN/Wk0ip+P3gQ6BUgAHLfSlPBQwLoBJ1FbNOnI+2bYudjUB",12,14],"etile_wall_root":["data:image/webp;base64,UklGRiQAAABXRUJQVlA4TBcAAAAvCEAAEBAIJOlPvkKMwvwTTNJU2zHofwA=",9,2],"item_amulet_of_adventurer":["data:image/webp;base64,UklGRjIBAABXRUJQVlA4TCUBAAAvF4AFEN/ANgDAMrFTft7XtHOz3b7BRAAAF7f3Npo3+H9TydKmbckDWMW2lQr3DESgCMHpIM/933UIsm3qNH+EMz0AAAcAbLpN+RFU/azpRnW2i4dK+O2yKrrI71WHz0GSc6TGHoJIzijOffunaHrkp2a6Ogz0v6fuXfyt45RWNHuA2DaSI0n33Vdz3tv+yj/R3b2ZECL6PwGeBfBAUKRYAOZIASTYhnuICQG2jRK46gOJTeJ5eO4vsLJJjJZswFMEezyQPdzHXODS4CcwHLE5KzAwgSjuB2yjaKAUgEol8JRWcQXuzxC0wosANu9s2OBOIiJxP6kq3ekiVett6U1X1PrvdqrdiM1/PV6HvqxNbdoItWrt255dRu37bU/cjyThkQD+FQA=",24,23],"item_amulet_of_health":["data:image/webp;base64,UklGRiYBAABXRUJQVlA4TBkBAAAvFwAGEBa4DehGVP4I9HdoaVmEmklYhimYglEY4rSdf0zwlOo1kbmxYllSFNtKRUP27EnAsDXCDacxLPBXNZFsNeihz7HCQU4yXsmgCmE46L8it20bx0JyWu0vAGAjRAcAoL/CzTi3ER9fmy99fd5VTYAcsoJTaGCRJN/NsZZaAXzXMm0/p1R6BWo6PYC+etERGxgH1SQ4rgvlDkwC/L00RnJ7BsBvPpxx1Rr7DC0+7Rte7OJKx7nDw+/Pq86bjQYMGVViO0LznxENVHkUdbZkPP/fAMo9i/rpldzfQMT/f3qy0xFHGsoj/NTTbACV/OWQJ9P2jPcKFRxDPTBMyv8GUBU0H9xx5jvZ+bVuqnICO9h3BGtXAO4CAAA=",24,25],"item_amulet_of_protection":["data:image/webp;base64,UklGRuYAAABXRUJQVlA4TNkAAAAvFwAGENVAra09bJOdukY2KOsOHacLdE39kjrC97MPPvSdYlMhYxNFbaTA0d3ldAAi+GEoAhlPXvRPJYcO2/V/AjS+gFE1o0o+d9/O/I6agqT7bc/AYWwkcQy0ERw00ogDkmjIQVUQRpWYiYPRhHjBS2JBGFVBxEyEShwkVqYEScRsEA8iG8SoKGfEqPrqJAmz7ornw258KIjRyHPyc73yft8PRXfB4/i+7/xnIEYLSe5cCBK0cJI4FyRBs5PT7aSJQWt20ga0iHOSpI02ca6r22gbj+gPGbUNAA==",24,25],"item_amulet_sellsword_charm":["data:image/webp;base64,UklGRvwAAABXRUJQVlA4TPAAAAAvF8AFEIegKJKk5qKAKOMMUIhHBC74YeBsqIlktcIA5a9m6BCAfTQggyQVAqImAJCGj5MKOwKv0TWGJSywnf8AgPM/RAZaMDwqyfz7mzrRbJAgi6ZtqF71ZjjV3O7gMJLctjkFgAkUgP7LVXAsIKL/E5BPyTcTvMv/RgQJvJZ44NN5LTl8LjN4QxzT4w0wwyOAR0BMD+I4IuCOaqOGBxDuHlwxlsWsBpkJcIMtS7dN6+lMnhnDuq365BK1LrY2bS9ZF9N1a418jI5uW9+0kS+MPjbRXsnn6BiySxPylWYirUG+iFopRciXaUUE8o0A+U4=",24,24],"item_apple":["data:image/webp;base64,UklGRhwBAABXRUJQVlA4TBABAAAvFIAFEI+gJrKdKBIy6VOeHALwgA2U0WIFHSkRgBG1ta00tBw6FqDDNEIe2Ukcw9JjmRo1kSRF9z/RCTgNSEAJNtFCRowD4vkPAAgR4XIS0uMp9fvtmVIGiYKlw8C/ZT/WdjS3fa7zljsYGEaS2uaVCHKm/2oFwi1E9J+B27aNbKm9PX9hW4F4HmCWeN8ww/ueZ0ptAN7z+xIA1FaK+2GXiGhxvi9gicxc2/uVVUSZmWhlGQiKqBJRKeXxOmCdMzK8zwOf53FMJeYxyLk6wOqZwguiLaRzLsXJIlNlTnVocYWwquhKxGczkKiIyn+8ey5PIB3cJD9z/MBhOZnjxCycmf3H8HF6NPnj3YvgzwbsGg==",21,23],"item_archmages_seal":["data:image/webp;base64,UklGRkABAABXRUJQVlA4TDMBAAAvFwAGEK/AJgDAJPOtgeNunzux6UIBWlCDjSTZSr67x54JcD2OTUhGwTS2rUbkjGaQuOhiHygqpAR62WZ25j8AAP/3VzxYb4TONz0Avvk02Vq8UP9LkCoqOUkCobHBRGZ7++e8w0iu63afTm3PfQBi20iOJPWavx//vX9b+ec6LoWI/k+AeobqGWpIac0sIEEopbVAR6G3ACElgBaQKKjHWkogSRiioDGloeGO2EgzUpm1NYGWQmIypxUkQmCrIEkE+gVK7KhuZlaZ0CKSqG7vcRzmDGgRSVS3976u8zBnhDq397yv6zoPq0i0uPI8z3ke2YES0cL1PPf94qGUgEbZLZ/Xdb2iAmhKdrPj+P1FoGXy92vmFW3z+fu6eWYD+Pl8q1ndqpn/bOZol+puVtE+Q+0CAA==",24,25],"item_armor_brigandine":["data:image/webp;base64,UklGRiQBAABXRUJQVlA4TBgBAAAvFYAFEIfAJgCANNjL5e7909BFJzXYBACYZO7uBg346J+DLjxKI0lSrs49KaYIPv/EmMX8BwAAANjfTG7pv5H7Bey3SYukkydXlBLkfPSz0uOZTjE1jLDBYQC0bSPADZGtJP3/XY8bIvo/ARGBwzhF2fA9AzuURZuUdDdggUrTpCSRtwQsrJsUAJB3axIWLBKz7tZaphEBsYRltcbM8f0RAbMAEv+r0ZkfsHKR+Zdg54eVnHrfK5WQHwCIiADTqZFOQlNEBGRxeKRMQkCs6EHKokUgDlI5lDbJTaDLulI2de1g9p9sUr1zA9lUvfW+L3Xws5WiTNvSpszMlFNp61oFOm3ZQ8O6EFv0btqmqxCHQO/vDMQ51rEH",22,23],"item_armor_chain":["data:image/webp;base64,UklGRtAAAABXRUJQVlA4TMQAAAAvFwAGEJVAaiNJkLQAF8OwOFiD8qpbC6EUyvjkS0HbNsz+wh9oMJhp26bnZP5EQ2Dqv8GkbZYlbK/s7u4ndmdPkm8/uZTzCH9zcgaAsXl1NdGHJMN77LFRVAEQ52ZjXlnVtoqtQmKuKlVNRlRaqw+pWhKiqodUNdkEVZxgR3YDag/Dkd2EmqpCgjIHSEKBTOZUFUWEZCep+ko75Tb1VZ3wWxS4htOHvD8c+eHBeagP3RNRrfYeYhBFyGU2SdoQyL9XMrld",24,25],"item_armor_hardened":["data:image/webp;base64,UklGRiABAABXRUJQVlA4TBMBAAAvFYAFEBqpkWzbdqNglITERUUVg5jRNwEH4USc3/04hU127XXAqVpwsYdXAEtYTSS5jUCpFgXxCK4zi+8cgZicmgBAGvLwc073+gxgGGNRrv8TUFVPBDfrLt/kfrNv/kXAtskrYq1nRjh5VZbwkpQ84bLjRJIS2OQBS05EkicQD44THoVlLJtVRCCe2sayAVYRAZnQy1j2PwR59j5oJxvSgr158TkztPdHLq0GDJKsKi70av3+Aw1zHeqQtfsIJ1xknUyyu4FECllXnb0VSQ/liurWjGbyeFxwTb6/0+pOd1auPBP9wZs5aG5oJEWTGY0uoMjWtHoknxURk5gvfY3MuqRZxT0ZmHWTVVXcG2T9P8m6BgA=",22,23],"item_armor_ironveil":["data:image/webp;base64,UklGRiQBAABXRUJQVlA4TBcBAAAvGAAGEBpJjSRZkrUglsKSWCDL45F8xGo+FDKlusXFcYSGQCguCgGgYbKIIYT2cIY1hiESBEA48UCFID2eFPV/AmZmvgAG5gQGmMf8yOF3Yk47+G9rHpB+k47s1oppHGaG/PtVBpKAejgM2f/3PHjoI3agdVQhSUe6iQ21pVr6tj7C67CbmDNO/fl88NoOd1uIsO217es6EQ8T7K5373XbFJSAw7ZdSW7bReSo4baNYrcXCbsPxNaOnVy9ECG0R7ISEfFCTZAapZVQQmLYR5ySiINdSDGyAVvCDnEZSpHquBJxoVmG0CC1KwU/WGYGXElcFOIyT2bYyICFu4efsMix8F5mMPOYLaqgy8zAPKc8LPM2zMzAvAgA",25,25],"item_armor_spiked":["data:image/webp;base64,UklGRhgBAABXRUJQVlA4TAwBAAAvGAAGEPVIiiRJkCMhEQ0hEQehEZwjOD13ByHrmyzi28+0/BY3tW3bsCmPLW2LgrZtmL6NP+Gt/Z8ASR8AAtATkEASiN97vtmf6teRY/q5CwOIP3+QTnzOOsNexE6aMa+TNoskptkFP2HT6SwSacbrc+5mGiTutp7NdXy9dqd7kUjTdrbZ2Wm6TR5Np22Ttp1m2y7cenrocXzbIraepK0fySN7EfVOkvEkySzbbGAb9t677L33LmYbJBLsxHYS248ejJNOpk1ik+nC1iTtZtsmMU6QaEjb29u2MaRFEiF+cxDtXiT8X5AkSKebbacndMR5SwLNi8h0MgcD6M3T8XQSo7+HWe8kRv/Mq94B",25,25],"item_axe_01":["data:image/webp;base64,UklGRtoAAABXRUJQVlA4TM4AAAAvEAAJEBbIiWzbVszG2c3C78gQxKk5mJEJmc65fwxgsVkXFqwMzjpc1AQAwYgjx1bBrYAQLhGUUklRbBvUC+O3fBXkUUACKqlm1/8JAPAAEDbq7//3TnOSAOi+SQmA3pt9olDDz+zvGlKS+kQRQXfjn1myiqynSOlm40rMqg+vGTuxnaWy43aV7WyKHZbn4tnUisxcVTVDx8k1+4gCkbRzSdIYQ4BIlwRAE0UyV0K7AK3oc9CKPgdh0+IeX8v/qe8wjhsn6Dv0E2RTjoMkAA==",17,37],"item_axe_04":["data:image/webp;base64,UklGRu4AAABXRUJQVlA4TOIAAAAvEAAJEBbYiSRZcs6b09uL95dMEPqVD/JIDsmd6bm3AUXT2xS0AQNTy6EmAJCGOOTYVODG8Xp7exnBUlZSFElSc9FJfJ6F04MBFIAlrPHr/wQA2AAQe/L//7/3aJEEwOs1ggTAj9XziYpNfOX+qRNBkvOJSgTvNzT1e26Ee4Q/x5AZTblU4f7pi8yMKqmqZN1MzaxStb1RrfZSlcJrITNTZcqNkZkyFnc3xlBJi7lFg1FaSHJdVwIcmU4C4BOVZDnRdsDRmxY4etMCsVf3EN+3L9M8wHq89QTmAeYJaC8dDyQB",17,37],"item_axe_06":["data:image/webp;base64,UklGRiYBAABXRUJQVlA4TBoBAAAvFwAJEBbYiSRZcs4bveXF+0smHPqVD/JIDsmdmd17GtA0XUNBGXCwtRxqAgBpiEOOTQVuHK+3t5cRLGUlRZEkNRedxOdZQA8GTgFYwhq//k9ARMQGIHZk9PmwgR2SDf//Z4ejx8/VyzMVm7/3ruz9nluMIBc3rB5vp1Zuc4rMrMqXWGS56sqOf+oo06rML9+ZkhuOKgG23NiAsq5sAMBSBwA6l5IBqycD1oQAWa4ULEBTACA5UxAAqEbHgCBkJiDAugyySrJBtDdohK2Jkskg13VlkFaOwWCVGRHBZyqbEcFtTl4Y+xm7LDMGI4KVE0svB6NlinOoZPSZ85Ixzc737R5j14k9npFlf+uxrUe37G85Ou/LxxYkYyY=",24,37],"item_beer":["data:image/webp;base64,UklGRiQBAABXRUJQVlA4TBcBAAAvFsAFENXIiWhJkpyFIwKCIAbicdIQAZEQCdEQm74opJ/O86ojPoPK8isy0kgFbSSpuSMP98z8SiJJcs6/poxPwNH4/yYe9H8C7PwD4NQe88u9fz/if7h78gD2PsTfNNwifO9wjz813wlXxNH33hHhkzNm+Bv+7h3+RvgZe0d8ko7w8h3+GeCdV+HzC//SN2/q8K/q4+VoxvRXyv69UCnlmFSvhRnsQytTOYpsZWNGcFUFAhLDvUCqMQBRGIKIqCooqiSBGQkzppQpDaWGMDMaQ+rO1alMjcKMFmY8gcw6VB2UqSqozIGZkQV1CqIk7LBWZ+YYQ1JRhZ316lzZSo2isLPu1VqZ0gG7RN3qk8LuQulYYA85t5sA",23,24],"item_belt_of_minor_evasion":["data:image/webp;base64,UklGRvgAAABXRUJQVlA4TOsAAAAvF4AFEBZIkSRJcpaJIAjCjUNExEEYRExotrpnIeSrLUpXWT6qH/MyCwBNXJF0phFFIFMYzGaiGAATaBwj2G8dAMmEEVpw/TeYtE3SsrJTJEkXYFAHwlvL9vtOtw8G9h153ktVD3F2m8mDYQW7ndfMOlhlh2ACtu3rGEJzFtEM43QSAEWhnFmnA0YTgapwyM/beaQQRN6Sswsysw8QEefH3E0IH2SC8GYzHaQLSfD1/+peG5AU78Da6+9vtZEEOevf2ovdBtztOiP8rT9Wuvvnp+0KVyAWYtu2M/N6o2zEpAwdk7YPliSQACYLAA==",24,23],"item_belt_of_sun":["data:image/webp;base64,UklGRugAAABXRUJQVlA4TNwAAAAvF0AEEB5YkSTZVq4WZCADGThADYE8vpDwPGdBwpg4597f/tmW0ApWxZi40QI6DAJMk1dWUURwlPtc5FMTAASjjAh7JJDJ51Ja/yegdi+C/RoG8PbwDq4lvaz30xCwB2gpj6ndBNiAxAe37R06QVVBtE0y26TdKIg2icGEdgOyCdQgEFsbqD+CFGAZGAOyDJhrEcPU4ga5lvTBfPL323OXpBT+Cpkkt8P2693RbZMOCr1lHvfbZFp2UFVoJZkHmXmYjIT6DbR0zDnn4W4mEX5VYbh7ZBzo9L9UAagC",24,18],"item_black_feather":["data:image/webp;base64,UklGRkABAABXRUJQVlA4TDMBAAAvF8AFELXAjba9beNxfC7d5xwqL2HvoDC8RIBaAQ4/74Xj/zU8FP9BCtu2QSrR//92oDSSJOX8MyqUn39iB/qh/wzcNlKUDizT3SvKqA4AAGXH3GTcM9TJ1CbBqN9+JOE1pzV3MeY57qPGUVdNK02+IEplhNQLaEH0IldmHE8zErz5euTTtSA6Wc/h77/MfGv6TBL8bXh6O2e2IJbiKmUD8zx/zvO57ExaXRDXI+6fSfibe+9JFbm0IGbdvPRPfZqmDmnHttNLhYnebz9Og0hedEGUmnxgmrb0DoDc3ZtnlWpml5cNM5DGkNWIkKICuFrTAArDIkJWCbXWlCEZZhb1dCohNalRCkhRDSL2e1pE3e+z/8PCQgFUMk+IwEwaMlHr4ONmVmutwK4fMMIMKLsFjHkBAA==",24,24],"item_boots_01":["data:image/webp;base64,UklGRtAAAABXRUJQVlA4TMMAAAAvFQAGEBZIkSQ5ko7IAdAY9P/44+mqoVCWpyK/aTbiSSZgGV0apwICkAWZgGV0MSQQgCCC6L/Ctm2bKGk9PpmWGwCYDYDnOclGBUkoVShpkwB8Psw0p7Cg8pCkhEi5taqxiRZiMwVivJIwBWyThX5iY8lOzBRwjLyI/kl5OlMfSepMH3emjdMa3MTdEik4C2UgSogkKUnMQKKwcY1qzr5TL0hSlaoabLOknZrheskunMTe931VMwNw7V/9774DTAvARgIA",22,25],"item_boots_chain_rusty":["data:image/webp;base64,UklGRoYBAABXRUJQVlA4THoBAAAvF0AGENfANrJtJd/9R4JkFjP0X5O7Qx2MattWcr//BG4R/ohYFGVIE3dYbCPbSnVxj4ihAy2B/qv5rsH8BwByKWES2PbhABQpCfgPTQPeJfoXoELgWmHlh+rNAbp7kYQsBYxT0oybshcywPYX9+DUZqi6CRIj2Q7b5utTFogwwA/4n5P3iP4rNYm0ENH/CZjPtj4XTQR+gbewJ9Nvdyf8FrQnurtf/qgFRCke151i5ezldVIHdUUsTEOUVyiPXRE7V7T310llkjixktE9mIdEoq/oT4dTmYq9l5XkjzzIGGVNKC5lRpS+P5hBSjjzEHvZf5iZHRCTcCqTJQI2DX2Q+ifCwSSRBMyg7/E9BggHL4qZJMxI9dEH8aIkUUyhmiGoPjocus6/QyRUq1l7123bquO6dGn0AdZWbdrn01p16BJ1chTWVm3OabeUeAZV+taqzWd7hxRnoG+t2lxp7yCJvrVqc+n9qdu2bbVVm+tWa/n6arXa/F97nPc=",24,26],"item_boots_of_striking":["data:image/webp;base64,UklGRm4BAABXRUJQVlA4TGEBAAAvGAAGEB45sW3LtoIMcgy0IhDwNRChAg/EaMIKFm7zLewTr9rRodnpjHed7KY7PjZu1XFxI0WR7TRR0u7REAfxweCCY5dTxaAAEWoi2Wq+jF+mLhJaKgRgBg1oQl//J8AO3wAc22mA3///mPfLWON9yLXeuf7nnLRiLU7vGb/ei5e7F7xVfFhjXNc1Fgfyca3nYY3Fdi32QOO6BmOxf2BGSO4MeJ7nOSdFQIzn////zzPGkfGCVkge47quayw/gPpqnoXLI9Za4cIMg/qZ5meh9j1GFoRLkiMMUX22ma3XhHBFAJvqbWavlvNbPhQIMjBCVOvVKvvNzGxU9sRwMacqewY5W7XqrScQrtuVmUH2apWtz16BES7JI8jWM/tsOVsEZtwRcd9ktew9Z/WSY2bGbvSaqpatZwo7JrxPiVaV8jinKTlTMz2wM7dLHsinB3aa2+UhhQf2Su6Q5A72avbtEAA=",25,25],"item_boots_sandals":["data:image/webp;base64,UklGRtwAAABXRUJQVlA4TM8AAAAvGAAFEBo4kSRZdp4rEgIhGMIgSkJ9XwhjdMS63daW0WAIAkii2GWVaSYZcAoyAcvsLg1EEEICbfR/AubuB2zPq/7/199Wv+H1bX9JSf3MBZL8tn7jJ5F4wQdgy8cb7uK4Fa/V+sKFVbRJFknqgy2SFIkUSFLPuF1AslFUJHGwEq0KROIioLIVSLRBSRfHqnY5ZktJYRUV6nE3sJVYJDmpPGPtLdntApLSyjMzPlWiVUGpPNdWIFGhledOOaaq5LntFmgrex5abWV7nvs4NwEA",25,21],"item_boots_scale":["data:image/webp;base64,UklGRlIBAABXRUJQVlA4TEUBAAAvGAAGEIegJpIk5S5j+ujrbbx/YSREcdtIyv4YjqH/OldiEwBgkrm7G5Sgfx8CcHHNfwCAglktb0wJIchWkDrG1K9XzsfIT8/mV7b/7bzf+svkCg4jWa0b9PzQMxIRUf/l+tdCRP8nYD/bx/3SDknHOa8S7ckOtdbm2e5Fe5pHa+3XnvXi1BjHnA/CC7qzIev/m1MCn7b1YPPsKdKpV8v9UkU5hTcVs6EyIiWSbzKciKq+Bt1fVU5vEdmDhPAmdZ5tZVVIjgczyxpkm6tHDtJpe5uZ5grXYPOeGSQdti1q9V6DJIBYKymBZl6ZKzlFaNaK3jWcNJteU8OphoxetQAHbZumO0k2Xysi+hgOwrZBVzT3qr5WcIiwvbfh2uARmb3LKdi+2q08+lp9DBdsvzVo9E53CbY/wHUFbH80AARgtj/b/X4GAA==",25,25],"item_boots_whispering":["data:image/webp;base64,UklGRkIBAABXRUJQVlA4TDUBAAAvGAAGELXIaWRbtp0P4FNwPnMwCkdm8giZwKdkDnN0Bwon+reltaR7f7SPVrCvmki2mp9IVa5RASJ+j2mEYIOvKJKk5o4gI+csgj9vlOLsBPQfYdq2iertl7HhCWBp7IKvITzS/vFUf8s13j1stm0/z3O8W/cEd0tS1gdc55fzwL/+NwBeHXpPVoFwGK7rgq1Z3aLhOs/z2lqX7UJc543dYgwY6OeVldiY68bqF+1mIAbqUrJa9Yv270MDmQZVFBeRlHp9NaB7KkRKjCJ1VQFYd0tSx0UnmmUX0E4kdeKiK5qVPPZhoJ7zODpQoCp1KW9voCSJTeOgdEWrb9V/o0faKFCRbDEGS/3fSI+0V9IlxgrRPaeXGbbW6ZaTpG3GBnrGTnLvNYjmPI57v4GztNfqVu1iaR0A",25,25],"item_boulder":["data:image/webp;base64,UklGRsQAAABXRUJQVlA4TLcAAAAvDMACELU4qm3bTb6xRAiMcJA44Juga0ixQAdbn3i479Pu6L1x6lLYtpHSZ+rd7T/qM8O2kRTlGPrvk/lB8z8BAOBAkmikD28A5Avu21qyNbPF1TsCYOvD+2R1Ib2Z+fjv6AC2Rysr1t5/9Wb1qqyHOvvwXoZ/R7YV21r6kr1q23az6QY5aAVbM1V9Jyt2INsMzD/x1NRU34G8MWWPtq/rfPlvETKd4fv9jjGKiNABtFBESABsBAAA",13,12],"item_bracers_leather":["data:image/webp;base64,UklGRrwAAABXRUJQVlA4TLAAAAAvFoAFEBY3jSQJjoEYg1mYgvmD8d09hFFHrQsn24wg22ZScxjLMU5OkG2bm8QUBnCA959h27ZhYLPt5k+yywvUPIif+v0zDx72u83A7Lto2267Ut3W/uvM6HG1zMAslZ2hYHJGO5jI7Na2VIwFVtAW0f6vLHirXHTURUvHC1VUmRlKe4dLjVUL7NZrEmsPqyZJdFRo79zWLBFV7nV6N2JVxeLGprTmEFvlLNHiA0mOLw==",23,23],"item_buckler":["data:image/webp;base64,UklGRsYAAABXRUJQVlA4TLkAAAAvFMAEELXAaSRJtPPxmIepGIZjkzHKu3sYNpxkktO09KRJFKRtwOz7VzoNZJM2GZv+f24L/Z+A2X/Afh5Lv/P/DfDTSA8Uvr091UGxyYpdbRSTLQmuZkYxIQkkCa5mhJMEaCFZhEkCSSgFV4qzZHH54v/mgbCAzduLhJNggF6X3h5aQ/2Ipffe67bLqE6A2i73vdUscF9oC283o7pvC71ve6tZVbttefGtZq/WvmurOUst0ErzWPvZAwA=",21,20],"item_cinderboots":["data:image/webp;base64,UklGRjoBAABXRUJQVlA4TC0BAAAvGAAGEPXIiW1bthUM/BwM/JxCAApwhDx8dbf5Fo6HnZ4VTCfLy0lodvAbVp1UTSMpEH+JDk4OFQowgXYKM22kNO9/ILhhxQpC6P8EjJvvCIPLMeAKPu19GCSGBPjac4W/3CoBUoIqxjlRAJP6Vl21lm5U4AFMZI4WF1oVG5nzG67vX79XUdB234ukoGpL7vLFAMfBqt+/V5X7wBjgR+P3wcYqlWIYA0OUj/Ldc/IAVhS3GfjRSJ8zz/tgPNOZxuC2n5/3ds8ZZh/nZOBk773bcmhHvojcXZqzRO/TngZSci27Ft6OvN1pM4hqqWphPR+djswYXMr7JGmLcU1pPz/7+Tl6jhl35L2d52dpP2V1p7p3JWbcKqWWXRUz7ln1W7VWzHgizlqlmPFkLsc5AA==",25,25],"item_cloak_of_ironveil":["data:image/webp;base64,UklGRigBAABXRUJQVlA4TBwBAAAvGAAGENXQiW3btlVhAQd4wAYeUIEMpOAIOWsvLEzgfUa0q0djxDOb04Wito2Y3j7+MCeB+6hpG4m58e7L1Dg8f36v/itM24aJnY5X6sIH4En9guKL/Dflz8ofZ7trXY9nv3+1bX/1nIuXdtvSXaRtP/2MuIjC2u7dtq3kFAXWtqI9T6oKFEBrBR5SRaa5ke22w9EAfNQ9AL/dpoimN0c/5f39++cPerubQmP3rgKc+r3E7t1XAQC93QORD7r3fVcKvD1DkfGT7l0pOzNUwfjKMxBFz2M9UnpGJBpFGttrj85QSjQTiOZWUVFWXgGRJGVGosoZSX5PAYioqpDRXpyxbVEFxEnGASLNjBIAznMmgGZmbM95JJKSQM7XIw==",25,25],"item_cloak_spike":["data:image/webp;base64,UklGRigBAABXRUJQVlA4TBsBAAAvGAAGEBJIte1GchpCAIRHOGQ98ci6oWRgVlAyWLKrIVTOf8eSdWqhKJLUCBeoQA06sMATL0FETkvzTRWa2lZCAmY6MLMygrqSwALGeukM0X9Fbts2tpWk41T0FcfQFxFw+/tmAy4ibh/2+P7//ynK7W/Ajnhw3+B9Pj1mMsXM8YhUrxXmqtIcjag8mVJVG3teK+7NMjPfxlldJh0rTF/vKiyoygSqIAzQmVlgQgasJSCqRcCBSsHI0ZS6hX7roErALY3aL6RrGuVO1TxYlqXCTV1iuZJCxsChJqEsPDrP6CkOVXaiZTUb4pBSeIXSJkcg5bXHfoQxfMMgrGzA3xCg7h9EmHzZYKab5NwgpHRlXntG+EMJWlFHhLsDAA==",25,25],"item_club_02":["data:image/webp;base64,UklGRvgAAABXRUJQVlA4TOsAAAAvH4AIEBa4jSTZbhgRA6HFGBSIQlAmSvLebxdMYHG4BcZ9NGfGUNNICnTa7vjkIIIKCXQ4JdOAkMacykghiEri9Z+R2zaOPOaUbad9RcXGA0AlB/7vQOIWRn5n6539WT8pxJ8o9NSrTSGaCUt/H0rBote0bztY7Cty67ou5u6hKdHs1YH0xN2SNMwZSAG2zYHqnevu9FwUJYTQUndLCoa3bSmMG5GJPU81IrF1CHoi8kXzCIFi57CL/J64zeH0+yG7q0EedkUlSEKGdlez+wqHzyIlZIgSKkMZBfLT+FHm9wtUYt1UZbKTa1IBAA==",32,35],"item_crimson_ring":["data:image/webp;base64,UklGRggBAABXRUJQVlA4TPsAAAAvFwAFEIegKJKkZn9XJyLfEfwb4Y8ILGBDUWxbyccyuO+sKkHoQwELwYpRE0mScs8M8VtgMPpmP7yq+Q8AxMiwEC5iZuRjKGuDc+8Xl3+/a5ICm13Karur9XDaA4htG0mSNF91r2uedv7hTk3fhRDR/wlwDWBTepbjOAL62HPs8EW7f6dC0cfexy4q2nNt16lQdEnq4sVxX9u6XQSi/Lq29dXAthHiFde2LttF4BJR6dy2k4a/hE0oBDT8lxGKaIE/kbDZ+wgAT2Qx9o6nSWGbPvA0WdB7nyNT+JV4FqXwPyAJF5lQAZJwTSJKvfGX0CR4EqHMTAk8z7enAQA=",24,21],"item_crossbow_heavy":["data:image/webp;base64,UklGRnwBAABXRUJQVlA4TG8BAAAvH8AHENXAbSRbtmIREDlgEsNfXILA2oPZIRoIgSzuTgbXOpprojG/+6yTARodiWkAgEnmrn1fuAFP8xaRzjaSrTZ4WwT9l0EOmSdD5pWgUST1n4Hbto1c+WaSzlfMfjsDhEVcdyxsDOCaWS/j2n76vH39gcWXc/Qf03OJPzMEzNiCTspJhbvDvl+BKOLY8pwMRdy0d5O0loS1lGiJ7gEJgNwl7SSmoFohmoUkiWV7cGMnwWKparZkUGRZ8DOmU7fWluzBahHXTqJrBWRWwZ2Ee1cRItYq4E/IJ/bvDrEie87u3cE5CTNH9oCqTmCDxoaqo2SJA3erlRzow80aprwPNy8iy44o1+NTXnPsn7kk2k6iqEZdjfX399+EAWQtr8pcrP0PdOSW/BnTTiJtZgUi2riRp+ZmkvAgOyG9k0KYB9sh/bVemWbIwF4aqk4Z4ZxzgEanRPTU7JSFwDlGXYyDmuSqSB4Ey6pq41jy7+CcAA==",32,32],"item_dagger":["data:image/webp;base64,UklGRqgAAABXRUJQVlA4TJwAAAAvFIAFEJU4aiTJkf7La3/nIAyDY7AYjsgQOjpjuiDUbJ63imLboPxL6N9CiFeEnbEyozaSDSp+lPAn13+sL2P6r7Bt28Yx03GKlZkeSA4nSsjNShhLQAhjvBTnjfishKcuobt/tLoneQiBeUHMbPRfjJHQr66mMVM1YmY91iVAeB5zb0L5/2/A+spDbRu26S5uRTScahCYhH4JbCQ=",21,23],"item_diamond_blue":["data:image/webp;base64,UklGRr4AAABXRUJQVlA4TLEAAAAvFAAEEHU4iCRJUs4UZn4BKEDCrQYkIARXG8z07CFh9ulopZGkSOTvUBsD+ge1IVxdRGoaSYHz5wAbOPgdoIBQU17/Fblt2zgmcup4R8JsgjjZmDG+ajjVoTEiKiKrYERSAzkisYCS3nasDksBRyAwPz34LbjNgiw75fR9+dJa5Jwud8rjqWgSuvTk6jWfWUA/Eg+u87VFFhR6vsYSNAopIGhVXnBQ/bY7qsUc1/3RlgQA",21,17],"item_diamond_green":["data:image/webp;base64,UklGRgYBAABXRUJQVlA4TPkAAAAvFAAFEBq5tW27VkN1PielBcqwjdCUq8PDM7RwMfuAdJKT7HFWRiRXgHI1kaQwL4LUJksYZPAIpaJIcqJYiIX88rpknIAfNCKJ6v8EjOkGYDpeWvuQ8yagpivq/8P/h3kcOjXQXbWUmeyx/2uAi+WbuzVTZP5M+NeNzEJmQtqWzJEFNcYoMkHaJOyzPDi14AT89tYdOLupUUzk7gmeszPl61vdEQCayTQoI0JAiKYqLSAJCSLUEyyBUpIiDipmRlkSOKX4/jZNjTHKkm3nr1+/rLe3FbLp7rYXRln6SUdEoKbGwk96JtDCKEN3d0SjGovVLHaNlbVyTAEA",21,21],"item_diamond_orange":["data:image/webp;base64,UklGRqwAAABXRUJQVlA4TKAAAAAvEYAFELU4im23bgqjeIqrtEqmZPJ7kilo+fZPo7c0QQBJKPGsMMoGUxMEkKSV6esMMkv/GbltG0m24Fs7yy8q5AWsVfj5hyu/2y/xcOEB8t3cm6eZD1lp3Rh4VyJ/e68kGNy99bCFQ0dzgjfDoiUH98w0gWBK8IAMMGEkC1UHbAe7n6M4tgfS3fAdRhFcqEKnw0fvNqSDVWRD8r9OSD0p",18,23],"item_diamond_purple":["data:image/webp;base64,UklGRsoAAABXRUJQVlA4TL4AAAAvGAAEEBJXkSRZClLWBxbOBS6whiQU8PXavdmTUDc9E3FPQlEbKRAeRwtCcLYCkAG/S00jKRCSMbFK6P+SHlv0X23bNozt9GTKF0zgxaRy2myQ82gTHdXZq/RHqaOIe56WRQ3TROQgf86IsV29CMsqWi3uhmmQQ7ZahIFYMn863v/SsQCGKbMqj//fAcK6aOAs7h0bQV6gWoEwrJFUAHenZyzCbSPU5KIAYBpxKDObDCA6v7nFzrN7THnzpFsA",25,17],"item_empty_flask":["data:image/webp;base64,UklGRs4AAABXRUJQVlA4TMEAAAAvDMAFEPW4ybbXVRCBAMY29V40dC9YwmRNLkj4Y+B6+J8ooKxk5EHDkXImgkCQREYYYH+w1UaylfxUcIeQFui/HCrwUFEkSY2o03G/BGpAEwbyD1EzAQBQAdxC5X6TcT+5SM71BDTKyjGLE2B58XL/1LQqtH/OH63FjV9b+HONUgHLsiS0kVLv6MvmRVZ6r1HyOH8Yw8ycAiMdjGlmTgCMlJKZmROMZ0pPwcmw59NEQW4LWujrggtm7gQjwkUCoA4AAA==",13,24],"item_flower_moonpetal":["data:image/webp;base64,UklGRpQAAABXRUJQVlA4TIcAAAAvE4ADEBVBhCTJtnXJHsWzeUrP8v4UmqoBqlAbaYSEBGRI9giCbJs5DWRGl7hw/ycgbx9gPlYT/++v+Ym/nKkdqu9GWYsMX8TWlR/VFTWJG322paPGwbje2bvRoeuA022WFYVSdMAoTwVaBeiuNR7tnbQU1CTenb7qmZdqEq/tmS+9O/O1mtcA",20,15],"item_flower_solarbloom":["data:image/webp;base64,UklGRqQAAABXRUJQVlA4TJcAAAAvFMADELXAiiRJsIJSBKAHOyAIG+8BFmY+JqI+ysKLEhCUiAgCSGIeIp9JVhil/xMwv78F819m+HnyD4Qv+ikBf6DtXalD+QMdCm2/QIptVwAzg62Sq0caD259dNLQ7Una63Xcva5amBnq7jiL2yxmhupAi/xmyWAV5GbuKthuwrmaauAjM6SRxgwqMzMUAzAzA8xTmF8BAA==",21,16],"item_food_bread":["data:image/webp;base64,UklGRrQAAABXRUJQVlA4TKcAAAAvFIAEEHU4aCRJUDD1chB0khCDGuYeC7fT6byCtm3YXLuNx6UQw2wknb/I/a4c5zAw/VeYtAHTAaH95IRfmrY9f9xeneqfoarvfwBvUkEW5Oo0k2Xhs+fVqbCdBeZbC9yeTRZ0xjwLCzq5oJJiYcZ5JCw9FUwEdMaeU9kG7+4uGIKkUETBySN0ujBqXpGezMyIGunJ+DzjjPprutVnZuP0Biq9bUC7EQA=",21,19],"item_food_bread_moldy":["data:image/webp;base64,UklGRugAAABXRUJQVlA4TNsAAAAvFIAEELXAiSTJsvNIPSLPfwiERDDEQgIjNLvvMEw7HW20OdHG6LNqAgBpWD1mBfofoEbwJoqSNpKg9W9k0d2Z+OniE9P/CajtDbDWdUmPVd31uyVd0NtPAI/VM2+FXggfTUz7vSIGGrowzpd7urttSTub30LbbdsNqEqwh4mdkJl5MRMmZNpA985Dhn/xNlYpdiZhloSMqhRn5vNZtmS6W6UE55zYIdM9SynAzHFoe85gKYWY5MTOAbwphXNOnASwvSkF88eQydiqvQT8kWPbqotSkhlLdV3bWgEA",21,19],"item_food_cheese":["data:image/webp;base64,UklGRrYAAABXRUJQVlA4TKoAAAAvE0AEEBZIkSRJcsRVMMREOARDnK45lkKPVYZZfvsfDwUByDCiK6SJIirskglY7PaqIoYcGunb/wlY12+g7Xq1ny7Q3ivwFQO9U0W/f0KvatSYnzr0rBNzOsP00EmiJjMzSdfqmNMZTbSrM9HMiKDazswkguad+lAuosJ+lCiHeNxP3CBb2iCYqFv3Ay3ZgIrHp12Nz97BZ2PbrrUKJmrbrvNusG3X3R7Xqw==",20,18],"item_food_ham":["data:image/webp;base64,UklGRkwBAABXRUJQVlA4TEABAAAvGQAFENfAJrKtVg+GkjIbwBsWEYCQnH4uow62sW0l+kMvRNYm9VnssO6+EUwDAEhDdLLDVzwui2vumnT+AwCstUD/k0MR+1r4INAM+Vq6D66SH0DLbKspL+AE/Hqr++VcAehR/vnxIBiAfL/nv139Tgvjnw1rAwPE2nbbNpDhirhDjOFw/0nVMsL7Ef2fgL5oU/0nJPAxtpG4BpKPbSGPHhS6JjaBOfIY08KvLY3O390mpKuAoAa1q9ImdJHHi4uC0EBL0B3+ZJ3T5StGCBfDtSV63OFh/B4vX42H2+5cED55So+F8fDSbfcuYmgp2bSTp20f69Olm842I1lfuPCNcSdZRYW3ZJ2ijIrCr9vkCkqhdl0hfKamoabrmvSLhoCCo7fE+jLpQ8wp27WtEYlLwV7ZMPpq+CT8CIy+mUWtBg==",26,21],"item_food_ration":["data:image/webp;base64,UklGRvIAAABXRUJQVlA4TOYAAAAvF0AEENXAqcC2kjSIdqEsiTkGR+KOzmE5RPOF4HY6la7UqNdLWlVqIklSkxtdzHcCnkFt2zaM/f9tucFz2pasRv8noE4uAIC6DuBnR3cDuICvu/n+credXz3gBPD5P2diZ/5xDgN7QNzSP2lmzsdboKrwHoy7WxrPGIq728bGdut5krWs8aRtkwsARrSH091Jhm1KACVx2HZ3xx6mFICUOBXbbjvDUYgCqUkmse2QUxGq8GokJ8kkTrgRUVUg1zK3MikSXADUFljLpCSF2ixAHYOkREUkUWcBkpRIoC4CG6BuBIA6CQ==",24,18],"item_generic_arrow":["data:image/webp;base64,UklGRvoAAABXRUJQVlA4TO4AAAAvG8AGENXAjW3bdUIvZFRB6n1ECRRApFylUIZthqGSU8K50f+ZNlZeKgL/5t4ZtpFtK/nuoWsoQPYrYOi/BEqBGTWRrDpIQTxO6KCFn+ooIc/0fwKs3gCA9QxNaogw7SYy1tKIaBhRXB1he/yLu57bRSAZxRbeVV00BRGzeW3mH9EpTMz38J61CCy5xHs+i26ElQy2vdNuIoOVDLZ9YbCU60sKq3kurCYKq4nCaqKwmiosxWb+haUc/Qj1jkUP72c+x1p2eunXa6xlfINCn7qfR67jzETCz3ycCVYyfvrm8KFMrOVznGAt/RgsB+sB",28,28],"item_generic_ash":["data:image/webp;base64,UklGRqwAAABXRUJQVlA4TKAAAAAvEsACENU4imTbVdDBEgMoAA2YAB2ssILRHyyc7fvh1dQPd3dFEH6GKoVt26C4MJ7Ctm2Q/v/tmKf+T4DSdwAoL9e2c9ZGDp5N2+NtdTLhmzfNoe8UTQaGS+Xq6xBvkxnwZoixiUNTkMQ2eOPDMea+Gt0LJMHmzeBxn/8vfPB/QITwKmIw+xf/woeiQJhhFiD8McMKQyDMDDAQoERAEkoG",19,12],"item_generic_broken_dagger":["data:image/webp;base64,UklGRtoAAABXRUJQVlA4TM0AAAAvF0AFENU4qrZtOqz1spfA0UADCVSx/ztooM47fRFe88y9/xt8XwSTokhSI24T+PeDEYoXuVOlJpLVipZBwh8s4oQybqIjHTpS9J+B20aKZuuFY/hFFrYBQOlTMJ6Mb92OeYBl0g7f3BCjBlWnUWjHGqyti4x+MGp45pGQvTbJpXnb6GpRGknzx44HRK3gH8SE3mb48XhsraIvFkTE/4S7xH5lvBrxl5hqTpj57SXYYP174LTpavUOX2YCwVfvtcwMrHZTJlns8y6TSaEEAA==",24,22],"item_generic_charcoal":["data:image/webp;base64,UklGRo4AAABXRUJQVlA4TIEAAAAvFMAEEA5GbSNJWiLLoP9LY/nDmaN6IKR61BJBIGhulhUimGKCQNDcLitEsMn9Z+C2bSMH7Lx9vyCpJ1kqFcC3mUp4S8r221IndMqz/r9ntGBAC1a6r+Ual4QdMHAuvdqMEuBcsGqQ4ztqudGg+m7cvYzlfIlEdQB4SjIHXUd/PgEA",21,20],"item_generic_iron_needle":["data:image/webp;base64,UklGRlgAAABXRUJQVlA4TEsAAAAvFAAFEBI1kSRFaEUAJkgxgjRUkN5H/g05kQCEibINkifOuYNAgMJ0D1xwwgW36v8K7ARtCeZZ7BgB9j7slpkuCshWV5KP6UyzJdkA",21,21],"item_generic_metal_button":["data:image/webp;base64,UklGRqgAAABXRUJQVlA4TJwAAAAvEUAEENU4aCRJUPCCDMygAhOYQeTeabhkDYyXTR7oySQK0jZgNv+KP2rbtmHsqf7/asag/wSTNNVgt5ziDSiejdKHeOGT5/mINkcz3LXutqlp3N0AGK0D22uablwF6yiUJYmNUaX7/Uv3ZS94JaSAfV1JroQLyeAkdpIwSBi8zIzOQlKHziYbJjqnZABct+RcM9ZZlADQZuVo8wA=",18,18],"item_generic_sooth_cloth":["data:image/webp;base64,UklGRvQAAABXRUJQVlA4TOcAAAAvFwAFELVAbmRbdkImsPYQAFMIM4mMmThkG/ghXNlPr8/RWdwlK0uK20ZSU/tiOEbFbSQ1lzPQf63Ho/8TUPsXAKplda9maQn5jQBbWgZsaYH3wOfCSbw2k/QbmSR5UDzmufDabFrSL7KLnblGOI7wXHht5u1/tqSqEtnFzhACYBIYKjFnYAz2VySYzBkkg2EAY4xh+F7/ufDazFOl7jaGJISO7at9pqqkbrcxCQnQ57OqqiSp3ZgE6D6rfpa6bfKgOE6jVb+WbPp4Ol32Uv1VNmP8q/7WNO4FSo2tWqTpRUrdqmWlOgwA",24,21],"item_gloves_alligator":["data:image/webp;base64,UklGRo4BAABXRUJQVlA4TIEBAAAvGAAGEK/ANACANHjTqE/B5RBhLtVX9webAACTTE73DehBKUrSwANw++miNJKt5iuSogDKpT80Mitczsx/AABrNcEyKkTLo8LySj/NsDszS75+MZvA/mXvJrsZx/BNuPk196QZz5iIvhCQVEgGiLVtVY2eA1GIAYYH0n+v+ZZwbkT/J2B9aS/1Q7aYAeMrCN3ZYnZ7AyARyEkK3bPbC+Lm0QSegUNs0W0JjhSy2xI58XyE7raIW3JlMLIcKYNeHMGPDN7NURJZ+BZtkfqR8W7/knp2kiB0IzgpO3YL25/+1T3LJVvknsDtFjaQonWXLNrCe8reLTYgBt2tAywJnG5Q5qiNO1iz9RqgzjrrmMXuD6sYL0QZdVbNIewhykC2JJiMIupUEw+rRaOdttjLHHNA1VAzqgbtxNjPUSdlzMFTldpQ243zqpNaJqYhW5TROG2Hq43S6pi2OAtLlLPtxoLzapQpW1wsSeyIJXE1axNbH7GegWtnSaCX6D3X+fRT0A8BAA==",25,25],"item_gloves_chain":["data:image/webp;base64,UklGRgIBAABXRUJQVlA4TPYAAAAvGMAFEBJZkWTLtoIlfGACI3xhB0PoOefGldDdUQy7GA6RAIRPhlikWWGKEy4RCUCYZIcDzuguuab1n2CSZhXsllz5AJD3gG/dl/Qu8CI+Sas36XY/rPp1uUprO5IEa386S6jOepG5VrV8/9dLjjBbP5IeD8+21npKaPUidt26qYR6lbNe9BxLAh4/24fTbl31WEkSOPd+emoLuYLdHqvW8iL67Nme1haue1G3rcBRSQLduq736pFgvduHc6mAiHXd3z7lnJ4NgdLaTSvQnVMEmWBFS8J6Cgn7C38rWJIEkSQITkK9jyQJMEm4lpA7/CVJyBuQdwA=",25,24],"item_gloves_leather":["data:image/webp;base64,UklGRsoAAABXRUJQVlA4TL0AAAAvGcAFEBY4jSQJkh7Rs3gKz5/LzJwOQiuttNNrTyBAyNMiQ7lAgEypESBA/ydg7j/gfFl/NR/6kX91ehH0JXdnRvh/0IvQUY7sAou3gE7ZheAiBZ3CAgR54WYs124FXVgeljPaVYA9ypxTLTvOSuepLuwGlc5b2Y2zPB/C7i5FapWHsvdMrTJnrL0CaafpmAQtH1jmKEKBkWMolyQDx2MM0RktjQ5nZsycmTEVnLGXc1XDmdG5Oh9ax3d1vgkA",26,24],"item_gloves_of_the_sun":["data:image/webp;base64,UklGRlwBAABXRUJQVlA4TE8BAAAvGAAGENXIqW1JkpzBNjy2BiEOEhcJihisFNqWWdVzGkK44T2t34jME3YvcdINU1EkSc2l35HeGGBlUOjAv4xbo7Vt6M6Pjv2zHTTZIL70F+j/BNjugxh2XngixBvgFNLPmE+3mxNIsIN6/dgV0ezQERJmxiPRK2KteE/HzIi1VrTYrIi11lJj+NpGC6pXb1oqWnuxiX7312O1oohQvyndXdULuct7reoQRj++l3cL+Fjp4VKV95/CDEqVKqbHao92accMKKGpFe5RUoHtA6o5JZ+lAjsJH85/Xpf1pWKrYrtHHlNjjCqQgAOYecHM4HJMjctljJEUcAAzLziGNPKYuuS4XMYBhEtmJg6ImWPkOKYuYyRk5gGcQoDXL7/kSHIkxmWIuRFTXDwxXJjhEwcDF+iXMCZmZjjCzBDUdMzQnsC2gBwzA9vFTqPanBXsjAA=",25,25],"item_golden_ore":["data:image/webp;base64,UklGRkgBAABXRUJQVlA4TDsBAAAvGEAFEB45sW3LtvLtfBkNECOAECE4wABqMIEOiry9zbew73awoh2vI4Hu0C0DJzwWbrbym6sJAKShFyddyLKhhiU8DWATTYDSSJKUCwT12VfMID//HD6I/k9A7L4BWI1Hk3yBdzxv/+flVpPcRY4x3p8x54eZVa8v2tzBMT7O7/Pts02JGxxzzqot4A9XON7Ik1BVj+IA8O4PyVUbdcd5Qc8JAJlSrZQWdGEzZVUBup75YbBV3wIgWbfkzj+MlVrJzERmAliR3Xvl9h8AqAUgaWZmVdWrFU4AVb4YbAVAkI7jONqJ6t3ORasqANC347pOS3JmMtgM9wJwNACyMrMuRhCAe7mpWUBm9t5W3AG7GYCVWaXW2ooF+QRKsmTbjRERtE7ytI1mS3ZjrJKM4GmLtOzG2E+SEVxGRAAA",25,22],"item_helmet_01":["data:image/webp;base64,UklGRsoAAABXRUJQVlA4TL0AAAAvFgAGEBY4jSQJko7IU3gWT+H5c5nePQqjtKrc9NojyLYZ0TjGcoyTE2Tb5oYxggEc4P2fgPvyA8n9Pslv/W0meZfgj2rFvAnQ/38ri3kK4K6wgHmxsu4upxnC4sru7puwK+vuLoM5ZF13fBGspQendsC2ZdZ2COzSqj1Vcm8S9sQZjpv3Ak52PADBvmobBGoOhpyghackPVXQyT4GEGwG9UGg9aGZwVaYmjtGBTxukvsAIMn9MijJ/T5J7gkA",23,25],"item_helmet_barbarian":["data:image/webp;base64,UklGRgQBAABXRUJQVlA4TPgAAAAvFEAFEBI4tbUJThCFDEwgAAupqFECauio6XCQdmYhEr7v500m+c7sWTWRpEh4QgiCKLJVgQBEfBoIz8WlpGZq21BKCQWk0MD+N0kEEEQLk9Gx9H8CdMEHIkniL7xFIPGiRkPb+Xx9h2fT90kkOAG2n0RA4ufPhPst4A+vsu0EZrNu65HZ1bX3Nf/nHbJ2V33tNeU1r3MGkb3qOI6m1pwzSOz+jdcK2qijeol7uPqv6XZCI7ziqrpe7YB7q5wuEKe3u75zz/djjKoT4IQNUq2dQLYgCW3sht1NuVOXEOX0RuMgMWzUUgMBEuf7OgHpiUJdRgVtok1ALQ==",21,22],"item_helmet_crown_of_lightning":["data:image/webp;base64,UklGRs4AAABXRUJQVlA4TMEAAAAvFIADENXAjSTJkfN+gOpcgjmwAtbAInjFjtgwFnxUR78+oA0ur6q0kRToJPLHUwIo2qRejJkGSKjBRwtGAxMaxAJW8vTs/wTUyg1Q62HC/TcTmOF25iqPKsYwVeyue6kqvKMA7xUv94FiFyYUY2AHmyKBDMBtSekAnhuOdXe+B24oiuw5D7et//9fJR1L0LFj6/X3mKVM1ZBObGu7PdGaSB2KdMeOpCTqDlVF3K1M1e1QU7B73oZahHjYCdRq5mseAA==",21,15],"item_helmet_hat":["data:image/webp;base64,UklGRsQAAABXRUJQVlA4TLcAAAAvFsADEJU4S609b2pjMuZi0dA5GPk3HVMykyWfEsLzPPAE0ha1AYCkWWZQYrI7lLaNJLn/OhfN0t17WP8Vtm3bRHZH1iGjYAM5o4X2X9/TJMII1DYyWhJhg8QzbDUkEJ4ZFUlw6Yf8OZdU7jBdi7VU+F22dAJrKe2HD+WZF7ojE1ZaIe+/MuEzxw4jXvcvWpFlCzSZJZ13RfY3Vt4oTZJEIoxolRpDVSKz1hEdaEmR9Shluo4sMwAA",23,16],"item_helmet_scale":["data:image/webp;base64,UklGRiYBAABXRUJQVlA4TBoBAAAvFMAFEJegOJKk5By3H0Ua5B+YBaKwbSPl6Jn5f/85X1IiSVJzUZ1MZP7/PDRq/gMARuNUTKqi1qCsWg1EzJzJTqW6MIsWnzHK/26/69xvvWm6ZHAY2VadPCRPIf+E/psND7WEcyP6r8BtGyXDY3xFi2JA+yWGA8YPc3aoPxLz65Z2PnJsNG13YAk6sFzqxvJNzRddW32so4GyrAfIi74E87ImAKlIQ7D6WAYoUT1bs4SEUFQnsDgpe+dlO8VzZ0946vieoMInG6/khGY/a5kS8FCyS0mCIk2e01AAIdiZdtc74r0aOPdJ1QNTqMZgntjXXIOTetawxxXPb2udkHXklUy4c6wRmNGqHDdGG1hrVjRgRPrjK8GXGgA=",21,24],"item_helmet_scale_rusty":["data:image/webp;base64,UklGRoIBAABXRUJQVlA4THUBAAAvFMAFEC/BoJEkRceM/iVd3gYz8+tgHEm2kvmG241oiJxs3N1OUKwjSVYyz9/D0yFzEoEA3O37FVXzHwBSy0IAixzVKZ1oX/xhAEUWlIIExNF2wFxBAxEFSAkzEH7kwVfUjGv0y+v/f9N2er6oWlovSHmnfA95O+OdlbU9oi7DvJuuis8aMfUMDmTbapMX8du7BH+s2Nj/Hkl0C+9F9H8CSj9Iln9BJwn+BmeWWhL8AX673piV5MQA9Lz27NJ8MsXA7nsjs7TTnFNHBd/p+9xkvXeaL9JA3L0eEj0ud/tFcqIQvnqFmlzG1SKppz00o3OQFF9xtUxyQ0FoLhpZoBRfq+jseU8nzXlajZEV3SqNNGk8mDwHqZWSgeMwVRNM8nsbuyDJwGhuFClFsnMLREEOkkyUsrrsNrv0OEVJuufu07KnqySQ2075ZesqG4PAQtxzF91OKFUACyt5K1PlROnFlvaioZAEy8BxYzyj/AkjyPI3WAYBAA==",21,24],"item_hunting_sling":["data:image/webp;base64,UklGRuIAAABXRUJQVlA4TNUAAAAvGUAGEBZIkSRJchaTOAiITLCER8z6glCW9QkA9ai0+pAJWCyhIAJo5NJHHjIBi4WRQAO3CsKI3n+FadswSdz5SVz9gcXxYn7S/3/mb+uXUNXAt133UA0RQc85KxHxEmblQXStXHW8vWgOBNOLgAh67ydR1Vz+OzOADjPMfqv+kpIdmGoWgkyhnZ59CvTbSOzoMEVQlblC0MRu5JQSAJ0JLFupTEk5dSxV9vKTsmeOSrvKtuysYw9kp7cXRyKwZdtp+0IgV60v3RRIdtULESBLTywDcAcA",26,26],"item_ingredient_mandibles":["data:image/webp;base64,UklGRrAAAABXRUJQVlA4TKMAAAAvEQAFELU4iiRJUE4CCrCAAnQgCeG7N2dh+tER7aBj9tOK2kiBo7sLWEDI+UdNAAKMcUugfw+BhOj/BPT2AiR1WfpW88m8w6ooCYKK8LsHMAuC/z+AVhcyBpmCYA+IB5NHY2xUcPAykQh1l+WQoO7Acw5A7FoLbJsFnuPE4xITe8baIaQXj7W0ACKxx2Opu1uSkMT2jNV7CUlsq4uSgKgfSupuAA==",18,21],"item_iron_knuckles":["data:image/webp;base64,UklGRggBAABXRUJQVlA4TPsAAAAvGAAGELVIiiRJkqShNJCWyL4uNEto6fQhDSGkIh9WAOzpLkobSYHujrcI+u8OiUOQbVhYxRH+f1C66f8EzMsvCOaz/Ez7Ywaf+duohU9865dq4QP6b7Nq4Q1gqJv8vx618AwVNEl7jlqYGUxyPUDS7qplMEC7MgNJotclbCAPMjMQtS24SfWsAlSvtgz1nHX3rE97tQlD4lq159j2OiozQ/rrsUmurrbHpBczQ24DxKo1wCUzA/ssT4C4D4NN0qpXW9L1WT1n1wau7J7ji8TdbICYXe2TIe0dA8mmvcM8J/eNTbIhCfMaoLrbAMz7JO1d5oOk9818FGBeAwA=",25,25],"item_key_iron":["data:image/webp;base64,UklGRoIAAABXRUJQVlA4THUAAAAvEcAEEJW4qm1bO3TSwrsIGoggurHPIMHeZyy/+0VhACIM//9LOzVtG7Cw127/FaZtwzhJ5ydWOgCAtbgWczqvNtnjs5UmW9hWmItTbPIgaSF6yXbV5z6tzmsLMMVS5Am56Xsm5+ynTN9pJcVEr6QYaxE8igkA",18,20],"item_key_iron_moss":["data:image/webp;base64,UklGRqAAAABXRUJQVlA4TJMAAAAvEcAEENU4rW1bTtJTLBJFBTQwevpXyX2UkHlwh8k/9b58LShs2wYZ/P8ts5q2kZibyvMn9wSeQJ37r7Bt20aSO17plBUA6LQcpN9n+SJqrxy52jUH7ioenkHX4fVTcfFo8CxK5kyYU3M6576by9T77wmg9i5JJ3xx72K/zUWE8Wf2YN5luNMx6y+edHRaZjpTLAAA",18,20],"item_lockpicks":["data:image/webp;base64,UklGRgIBAABXRUJQVlA4TPUAAAAvGMAFEBXBiWTbtvLkEP3DX4QNEIAoROABZfe8c5GwXFxBo+QJOArwcmvt6KRPwvJyjZhp2yYsyiIqhPEY/3uDYKZtG6tUyp9dz2nq/wSo84S2VsPb5Pfu+NxdLgNWMI5j3LbwpHddJl2MYwASbF+adB0Dtdn2HsaB2ogf9e3AgmewYu7z+30AhGP2HjHLN3kKisytSxTXwsV0UC/xNea/2HDoIIb46hjhcIa4gTESDg1iIGZhJFxIoox0hjRciCNIogwBG4kYKm4hggiSQAsjyguDjZCEzySIIAKFJACJGLWc8qJJnECQhI26QEJLUI+N/hi0GgA=",25,24],"item_longbow_gravecaller":["data:image/webp;base64,UklGRvQAAABXRUJQVlA4TOcAAAAvG8AGEPXAiWTbtoIfRPxtkBGBBDTgAHUUUt5nXxTscGl42STn5jvfVc/Dc7JrCVDbSFKb/fhLsKGD0IPaSFKb778hivAQMWQykQpQ3H+Fbds2sdn5SQZyByBjAeDH6lMfRL54/Ut/aLWsjzv3/ZfPFo3K7pHqbNH3b7G8errspdNlVPbqveHNgfZztb+SNSO4PRC62U8Ov0oXDnO7AnlWZmbyPu6VPJktYAM0W+zyhrPKQYmEL4R+M3Eti5ik7DXEJMurh6By9y5CkqWZDspk1HCLSVoVllQ5LHGZjk7ipfgk2sP+oVEA",28,28],"item_mushroom_blue":["data:image/webp;base64,UklGRgABAABXRUJQVlA4TPQAAAAvFAAFEPVAiiTZtoISHLBliwwwwQoT7K+Qi8fLPQ8JHdH7PhraQF8Bo+YI4HfiCFAbyQal/4L+uQpIZUogY9Q0kgJddQYozwBvhX81OEBB/ycAxzsAvtLPkQZgA7BPnDffGH4qybAexny22cRWXlOybtChrDSoL7mi71JXuSFVKlW67o+fWFk7er5ZVexpWUu3WMnq0jeLiho2mx29R/mmJFXRsKK+2fQu6ZtRkUVb6elJ9C0qiYqGpb6jr81mdfFxwZdFkTQA60hyDn78Tdo42h5z0uO9n7mGceqZa9iDSduVa9jM1QLPAzyH0eo5DcBGu41W",21,21],"item_mushroom_brown":["data:image/webp;base64,UklGRuwAAABXRUJQVlA4TN8AAAAvFAAFELU4im07UtCCgUkCAnrJHh8oQE0rwRP5Pz04YMqv1Fu8VL99qtRGslJrIqcBwu+rAFAjazBVcSRJyQmQ/9sjIQp+HoZT1X+Fbds2cozu3SvemXYEprdpsuYANE1nrOb68/0l4XLmZKa2Do0VgBSWmbZkoLeaW5KAnkDb86/OBpxdwuqAy7Wk3pvB3n2PRqec7vbFsygOeLc7NtE10OekUvSYGJvoBpJkUYQKJbJOXHeJsQJCJCdvOPFULQx4lpu08ELB+p4mDJQZBrwVIOYoKRBKzIQp98zXyP0GAA==",21,21],"item_mushroom_green":["data:image/webp;base64,UklGRv4AAABXRUJQVlA4TPIAAAAvEwAFEPVAikC3jrNwlsS3KAqhp+IonKVRAj0VzUp2KRiEZnR+BKIZgxAQM2g+7+KL2jaSlLv+W7wUY3p+qQkApCE8FwnIQp3l+raX9l+B2zZK4Rj7jKZ4AijYasSnyJxv2oRAzU/H38Mv9g8a/+4oPcZ30Lr2rhpQ9qHmuqzSgqu95/6K7gKwlyO81EvSKZh6bb73NfvibkYFMs0szSLMpBakGs0Io7KSGszn12AlQQiZsUSi1QnGD0bkH1FDsJjkjVr2KZjrGIXgY83Yd1vX3ruX8rRlNxUvobx25wtBJyuekxZ7QFyuJJERaNWDgPraBg==",20,21],"item_mushroom_red":["data:image/webp;base64,UklGRsgAAABXRUJQVlA4TLsAAAAvEQAFELXAaiRJsvOwnEZxozAK41g4g8aE9pIZ1GepRtPS/JdLhiLb4KySPhpo/CJwfKOokSRlef1rJAHzPUj/JwDblyDiJHnvDEnukclvbrOShFtMXtZ/5nyt2coCrvW4YjTGGP/NsiohwGh02ZKlpAjGltfKAnpSZGS7WQuwlO8n15akRJKqsqpoN0mKACtZJUkVAYB1kMQmSdbr/VkkjrKmizg23ecZ92b5VO8L+LvZm+UT4DRxlsQuAA==",18,21],"item_mushroom_yellow":["data:image/webp;base64,UklGRt4AAABXRUJQVlA4TNEAAAAvEwAFELU4igC3VtCCgSeBnxK8IAARGOGOqiZtZ1DQnpJTkxk+u0elkazWovDUgf1LhhbQkLjYKIokNQLLiDlFIIQnJPGR71XVf0Vu2zayDWSdir5iaO0ARKMt942PyN3b1fXHrRkwklWhK1MC6Sowu0wBBcBuzaBLYJepjZAQmSk7H0VikoRUU9jjxyyCaM45oSAwX+FaUi0fo9iqe6kkYiVyFbm33nMd7s5kXVUDPnPdX2YuHz0+0Sc/n0908IySYB/tNxCfiOy3kY20/0GVAQA=",20,21],"item_pickaxe":["data:image/webp;base64,UklGRrAAAABXRUJQVlA4TKQAAAAvGAAGEJU4jiTJUc4bfhjCa23YLz7gEU6ebOR7JqIWserUtI0k7Y9gMayGP6+rc6Witm2gfadBCH86gTEQl9R/hW3bNrGV7nmGLTRYzGSCCHD+XCavr9ylChDAsvtoYSqz6XC6jhJpm5T94F+PO5o9510Jw3NKASSmmmmxT6TMNvW3BwDBRFl/MD+RbRYnZjTMWE3U9f/UsXsQ5duhqhg/FQMVAw==",25,25],"item_potion_cure_poison":["data:image/webp;base64,UklGRuoAAABXRUJQVlA4TN0AAAAvEcAFEIegNpKt5Gcfl+Lo3C3SEghpQ1FsW8n/SAHLQP8evrIlKRwURLKV4G5NGLrQmwqkcBMQFE33XAAAAOD/v24v5rOSqjELb5LLtZkb0YN5t9dednKoIyJIbiwKh23bSFJ8/z/Xf7szm23B8kb0fwJq1mY19TiO4/luocOGaoqBlo1xvuX3PT4NtFld3ZOXqveK6OkVvbIjzC00gD22e8LzECthn+J5iALZzoY9VPL1n1P+a7C4ZifiMl/XxhFXsxniBYYASWwicoVgAANRKbnONiRRgUgTaqlmAQA=",18,24],"item_potion_evasion":["data:image/webp;base64,UklGRvoAAABXRUJQVlA4TO0AAAAvEUAFEBJHtW0tC02owMxlRgTmZKCCduAPw+wPQRTn00WDX873vl8QJQHANPMrMAUFvsN9hcZOceoQjFCoiWSr+ZZooUIFNnLU8Mwwv8MJNqjT//4ZuW0bSbK7zmn6i8y0AxTI3LK86vCIX1+Yx9g7cX7ncf5tX1s90kqcTHwfyrIrJXFj6TlWkrn5//9vgwmetY7g6OP/P2uB2cTi7/e7qJ2UeQYkFo2QMlfNEovaLNOgvz2EXAuIDqc2iqwwjiLR+E5viYlFoqUQjS2oLISpFOuXtiHo6Iaw7rOe281YA2JI+Hwwm1mPYAXfA2UA",18,22],"item_potion_heal_and_mana":["data:image/webp;base64,UklGRlICAABXRUJQVlA4TEYCAAAvFcAGEFfjprZtqdl3oWAscYAFZOKCEiEIyFSlHdt8qi/CVW3bqrLWfkIA+3dNQxDikcGL8OsObmPbVpW9z/cfKhB6Tgv03wYxkcuMo0iypaiqm00HapCFBa7Y5LbN/MAB/GmAVGpAKpRYKyZUIJUmSalUIBWqyBC1mjAhBqVSmYpJUhoqUyoxJpJKCkwSKYbqQkMlQqlJCqRSaSSNyVQ9z7Z7Z5r2bMcty3pNOdWURg4i9Hw+L3/w+d1NZ7UCA39VvYhNikoKTFLqbbHanpMTzejKWJ+Z/3DeS37NgT9wAAW4HP485jd2vszLDevqsr8abwwQI9k2be1znr5t27ZtW1ffDyf/CC5OCmtF9H8CTLTE0hKnAE6OrYjTEwqMJXBORFqc/xVwV0TJpnTBIkqwIWJpi3OSMJY6i9ub23OoRMhUNcrV9eW5ZFWSdE3bsDw+3J9LS6WO01Wto/L0i5fnc+msUjGZ+oF5ef3Fx/ubzHaUR6lcy+S2/CLP/7zsTDeloir6liT/i0/AD2R1sCKqdmJX8p/wSQayN9OoQun2hUPJ+9/kjxvI4VJXxpC6cmhd8v6PSwdfcGVrtMpQZerHdyXv/jhfjDiYaUwZXdY0tS959+vMAwhXjuZbs0aXN09K3nW8M5AAXFlozxmdaxoT33XOPIQdV2ZbsgqZun5xfJeIJGSsIW2oy5rHJPFcZ4U2ZKqyZWR2cWVtfWMbm8szfbVpE1bZ2paOru6e/qHhwd7WmrSJ1chkmauoqq5CVhtLBU3SRAI=",22,28],"item_potion_heal_medium":["data:image/webp;base64,UklGRgwBAABXRUJQVlA4TAABAAAvEcAFELfAJrJtJz/n/D8SEJGjbOiQgQiGCjpssAkAMMnct48OGot6dCAElzdwd0WRJDVHTm9MZANIAO8oQATPLCAomu65AAD+/695rGp3vESOFZH582ya27rP5855qFOh6ZK7Nd7iFU+BexklOuyWLZtGUF1Js8eFwXHbSI5U62fO35rr/GMd87oAVBH9n4Ao1YxO/Ww/nl3o9zBEp9hRtWO/Xf68eXWgZvRqBxR9tv+TcLmLmnB7FwGyBxr2rtB3G+DkgJMDf8R2DEwLeF6YYRPHyAIkYzszi2MBd25ZzHlJ2Hfb6e4izdm+2+lekhTytN7bOSlAbJNzNYmoqjMA",18,24],"item_potion_heal_small":["data:image/webp;base64,UklGRhABAABXRUJQVlA4TAMBAAAvDMAFELXArbZteZIZPOWfzipPcKvdKl+FcZiCzfz7ssKLfg/6SoHzHlaRZDUaI0hAAF/Yyh5QkKOMk3FuYBMAYJK5b7g7FwnoQn4J4HAyaiPJEailktHk5XM6DPc7UFbYtm3D7PYTIqIcwFVQENhRuwn58xj3uoiFcD0CJ+JyBjD3zOf9p3qoiIzm/hZqEb7aJv5nKN1FPu5iRVgieTLsfYsZkbc+WUTMOuPIcGGc6DFe7KYwwR8fYSJ/Zx8fH6f6tFtWIgwCH8fNx8dRXiyvQ/WfaPVjhIFnV1Vn5m8BRF05Sz9TyxnsiqupWUrpG2CpjcZrSinZN4PA8n0VrwwiQhhEAA==",13,24],"item_potion_poison":["data:image/webp;base64,UklGRgABAABXRUJQVlA4TPMAAAAvDMAFEHXAqW1btfNF/I5Lqph/ooH7GErFBlAEdtERIZ/uuRrO3YcURZITjZFIiICo5eaFh/OHKMK0trY22N67ZDo0+2AhbaL4nAzQparYtqlQt8oDacgkgz+hlsK2bRume/cNZuYKwDGYBK7tsNBf5ER0xKCQBvEhly3AqZMXE0ebqgJTI4Tqo64OMH9DwpmJ2meYM/nmnu7Kzl1BuKoif5RmnJFPGxbwjDlhtWGBQ8qCgvT5kEg2S9Ix376Fmf33IiIEDAmz+BxVKSUEiN/SHUfcvcQeabnrX5glkpbqS2sAL8mIujkYXuwYz3OTfB00mAEA",13,24],"item_potion_resurrect":["data:image/webp;base64,UklGRt4AAABXRUJQVlA4TNIAAAAvDUAGEBI3rbbdCY6YEUG6YwUNjDhgZcUDDlhR8iffpa2E/5a3+fL2oqi2lYiqLGFPDiMYwR4eU8xDiac2tm3ofnstsp1QF1rQg76l+q/AbRvFxwzPyDmfBBeyCf2a7XOFpdZLaG+pkqrVR4Kme9qJt23vepHzzdbSBUwyNMswpZjuzv1R4lnV3tq+w/rBpzdoCNP+MxN/J0Bq7NwNQKMrTUwgSGBw+qslJ+BABDE4JhS1jkAo37A4AXTL5mTff2ZkRRME1sP9SKDnjiDJYGDyzzM=",14,26],"item_potion_stamina_medium":["data:image/webp;base64,UklGRuIAAABXRUJQVlA4TNYAAAAvDcAFEA43kWzLyndCSkhGERHiABVYQAkaVgXPxMtwgIlfvI3NwHnn1rtHTW0tGTHYSEAGJpP8NTCHRWziZA7Hz29GUSRJzQEywATfnMFOlIe09L9/Bm7bxqF6by8BMAmsQhH3S05tBr8sKlEP98bObazWuIL2OOep/mPtzUq9vjCBwLtfymOKqEn6C0rFqOecv+rB3SSf3Of8pcgWZp2JBdQv55ePcf+0BdQEj5e04sXMfZBW5n7YrJyMbMtvUsVV1pOAOs1eVOmV8lJRosh2eE5yEWwG",14,24],"item_potion_stamina_small":["data:image/webp;base64,UklGRtwAAABXRUJQVlA4TM8AAAAvCIAFEJU4am3bVb6IL4Iy7nWIA1RgAUPMUIAfTLRXNBxyz30vN+8mT01kq9Hr0YAEqHJ2l4X4l5GOQUlsW9Gz/38Ug0JtKahEEIY4BCAFHUiwS4NsI0mezzk9w0O8wHN0AoABCAGAlzlt7Oux3idqBIwDvOvyBk6pti+SG4xQrPcSzNGzi3j7cH/A+hMAVz9VhMiihARF3oCICCkt8bhZay8ZnqUqPgAszd399gqyuLteVxNTC8xVzYxgUTMlwGJ29i7iWqslLFJdrRIAQwAA",9,23],"item_rake":["data:image/webp;base64,UklGRoIAAABXRUJQVlA4THUAAAAvFgAGEA42sW01coQQKjTQ4gFHK5Kcqd9jk5EASL4B6hAPMILkBNeSBZjodM4rj6YUXv8VOJIhNZ1gz3egLqQRSB36cGxAaSbw76Ga1tZmd/1jWFo9cdJG990CvqwRDKWNJ7KijKwqAVSWqC1ZXdbBWlAPCwAA",23,25],"item_recipe":["data:image/webp;base64,UklGRtgAAABXRUJQVlA4TMsAAAAvFsAFEJXIaiTJkqRl+UJyWI7IcTha1VM7EOojlFEhV0gK2rZhcWHcHUVtGzHlT6+/cRNJ/yfgPH4Aks4b9cObGUlv+Hfs36mZkfS7/pfIzEjaYlkzI2mD9qFtM9pYSx+zU4CShBeaAMmfL9vgHUggNmQvENtgp3jHdsCf+pg+aIKJk+Qaw06JfW/YahNeOqBzjqZtndIS39Y6RwOUrLZ9WTRl7ZL4AoufaGzfC63OkSR7KS+t86jVbqGAzrYk2239i3OOJNk6b5UeAAA=",23,24],"item_ring_marksman_signet":["data:image/webp;base64,UklGRjABAABXRUJQVlA4TCMBAAAvGIAFELVIamzbthVMIAIROEEJLUwggD4qroIrAS/nh4Sds2dy50lWspPVWas3FDWSpOZWBO8TjkFNG0nO1ccfzaHI8b96Ck+g/xMwTn8BsMd/tb//K9m+5h/x1u+WL9w399/NIV8x3Q0Q4XOm/4kHP1uzDZ+x+glQAkn4DB1AfrVfChL5wOoHkj/TIqLI5AQbVWaWgkx5x98cux9UVbMqSM080NMPzDkzk8w6cG2mSmRmqibsLXX3C3dGiMqcqUQew3rWm7tfuA8QAlDNlIfFm5vVvVOpmkx2GhD0A1SmKiA9rF7Ygn6SUlKRqQ1LHjZ056yqSZwa1oLuOSeR8hjDYt32bWn9mkR3BPLYWui+79u21ufzkTz2bUnyGMP746Rtj8sA",25,23],"item_ring_of_firespark":["data:image/webp;base64,UklGRsoAAABXRUJQVlA4TL0AAAAvE4AEEBo4DRhJki78n/QIH7dDcyC6ezAUBEuOHC2CkezUkZkAZCSSQhj9FPI5F2Fm2rYxgN59C2S8hr//EzDrE1ycI/Dj/f5J+ihJBDag9Hff+n9aScTMgOrd6m7VVsQM1FuV79ZqKwzYqrIlyWpFQJXNo6VqMb9VHENpEYM5Itw4mIuIFz4z1x40YD4C7IDsnCTYJowN0AyZ9TXIUMSAZriaDEXMDGibtEnaxKwgbUmyScweALcA5iq2swcA",20,19],"item_ring_of_minor_evasion":["data:image/webp;base64,UklGRt4AAABXRUJQVlA4TNEAAAAvFwAFEJU4imTbTtCCHFaoQExWiIiImMEGCu67iYSTerM4dS8fRW0bSUNhIJz/YTh7AOm7LJbCMlIbAEjC/wNf8QZT2a2r/VfYtm0jy0nHJ5Kki0CIBKAkcK3fdxPb8GwsO5F2VW1Ks1yPtxc23f4Lxna3K3RFfN8VDcR/uxa21/CKyFSEppEkCKCKDJXYlM4V8f9f2M6BjkQXNp3lIic4q7rmEaFrzhkxygKHFRn7FjokrsTeFUU7MWOU4QHswGA3IU1SCToJnTAcbHu3khgjCQA=",24,21],"item_ring_of_minor_health":["data:image/webp;base64,UklGRtAAAABXRUJQVlA4TMQAAAAvEwAFEBJYjSSLVrCBgveJEzwgBinYQN09+yzMJJ09yeTsiUGAadLJJpk4ghnIFY5iJgAZDZwuWfQQSZHlWLP+K2zbtpHspOMTrX4I6L38vD9LePMFL3TO/d38nRYB+3bfP872ErpnnOuZWUNfn7b/7/fMPD/xjO/dO0DGPHp6vAOSiIOY03d2kCTx5cTgudfPFpzj9VzwQtezqz6o30TaBtc7aQcy4wWSxEh4gWeDJMYB6KoSdrpTtoyrSmDbDqgUoDgB",20,21],"item_ring_of_minor_mana":["data:image/webp;base64,UklGRn4EAABXRUJQVlA4THIEAAAvGMAGEAGFbds2tZNO6/+H+0RE/0PAWusC+z2o4Z/YBtTXMaSclqo8MNO2TZRr2lUIhTD+BEdBTRtJjlEcf3BXf5Wjov/LABQ+3EBdtcgf0dzwN2e+BTRypW1bHuV9/yzu7u5ulbS0Ll2GM+AUIj3upVM5B0Dn7u5Qumv+F4mcwgP8i2fnW8MtHztZ/edb3DIZKLZtLW92VkYQx8xR5VrUqALqH0lR10ZWMTNMgVVUmTuGKjmybau2Mte577tLiLu7Qw8gJNYeELm1g25YShG5u32JcLf77vnn7QXFtrVly37f91e0URmPD4AZUN0tUy1RaZ5oZEZgjUVzkvN9zwQQEiIaRgIgHCAEYmUqjMLIAqUQBCNcxZRUVFqbUqJsofEeDIKaRKWIEnGoSEYzZc1S01hc3O8p4doIcSBcKaXCGIepkbSklkUlqZMvXbwkrlkqGoVMnDCO/p6tSVfLo6drayVWFZAqfydRi/Y3c0lB6bx7HDBllhoWNVlfDxvuESO9rGdBtIgKS36R0iL1rkUN0v5lTqrklwIMfiWzWavJRvrI0LYI4gQ/8QIWQJCxSyuWapz9vbLVX4opE1F5BHCYmt8J2dLbEd07gxshoF9QjT5hOnilvU+EzWPDG8tkmDzM0DPoUfU4BHFCwBHk+H1LyjYd+U+W6Bc6YJ3awhQohccLWAeZaq+xYvOY4MlKHl3HHlU3SQhCrRIf4yUEgsRCj/w8215mCXT0D/mLoKNf5NN0Bxmr9MqvYUksVRuJhKBKAIRU8pJk4p/RwS+kgy0T32dYqT6rrXR0gJp1PGcqaeJ/wV9WgpGEMKc0I7+tWg+tq2eRKQG7+X0TNCkgeRwwJOCfrrPX2X76BaYkFISUIoSbclPEl4u718w+lelzx/lO9tuzv8WiVfhNI91Ysjt4r8vsDd7+fVad3jRgRASngiAOCIVRLx/bqIiaxJjNu5MxPfcgLIWfmnd3kbA+kxAoF1SFLxWQJbhZ0r1s1umEnvlveuW/mbwDJnmkGxlEWkRN/Nc9v4jN8vqPhBBfl9v4TwhCCeqXhEaIMemZx5ROaBtZbsUmwOYANgxu2C3ZTcUN2TUNxgyDAdy4jbc/40638U5gSsd2XB3SUmiNaUIhZBeCf8HB4s3Gddn6l1dOPj7Wc5h5og/DhBBIC+XM9yuvih1XBzWUR5h6iaeIsiGA8K+Nv+vy5DWNKqVFTj4+0q4UiNcUoCCcBAqOXW9UQ0b4AJFMMFJa+C9EP1c1j1e0LwY1slfNsyBs5AFwcepvQkjHwdfiluKG/AricAhJuEayMKR83pQdei1u6Rg4AkIFAOr9exFCiirR4pa5e1sMK0EUJhkeMhVbPFSLhi9vew5D3QOjTj++0ypn5c16i2MPPAgjMVRAHGB6Z2q16LXTv6FlLtgCQeRNx9a7vUTrjL3N1sceeALDg1a9iOvHZUuXp6gIBvWi0PrCvyCs1midA2Ldsjbl6CsA5PdpL4WYV2xi7ArqlpbCvWcep7yOySiEN5EA",25,28],"item_robe_tattered":["data:image/webp;base64,UklGRgoBAABXRUJQVlA4TP0AAAAvGAAGELVIiiRJkJzDckCEQhAEQBzERjS7ZyQIZdnWZvHL3Gf+1LRtBOdKoXPn705JG0nQ+re1Hhadg/8OHez/BMz2C2CeYV7CD13YAAk8kJ9O5ZvPzND8ercVNsgOLdBS2wozQ2z/mUKSll7bVphBtnXDmuutFq+6S/+O2jkQW7FugCNHepDd2DqQJV4FdqpNjmyxMVjd9ciLrF1oZOvItkOsLKIQ27LtBJzIEEBN2yhphSEGZobfZydrGxUxiFlpP+dzPufTpswMD1b3srLskfeS7Xe2jR8TXlyb3v+UNteWr9I3cdteO74Jr1h1DUnfDMwMmIHA/DvMwOwBAA==",25,25],"item_rusty_dagger":["data:image/webp;base64,UklGRrYAAABXRUJQVlA4TKkAAAAvFIAFEJU4im27bfZGkoIjuwpBDMJAGEJEKCXbD8LTv+lVUSSpEbcJxCABw4hYI/DNK1VGIknR90TAvae/JgSSJgzTf4Vt2zaOmY5TrMzwQXJ8qYSyoYR1Tw6EEP2lUE4WtRHzJyFZ1Hr6j5EE52DqpJyw6THNvGCe2eq/6D3Br0mjzjNN55iNHpEDZs9T9k0o//8NiFc5jTtim8nFrZobzlMITIJfAhsJAA==",21,23],"item_rusty_flail":["data:image/webp;base64,UklGRvoAAABXRUJQVlA4TO0AAAAvHUAFEBZIkSRJcva9RO5LIPRfAhIFMRCjRSQ2M32UGJSl1bTFoz4zCNQEAMH4lJktaOITwO0SQSWl1AQA0jATUAPUCnIawBIEsRLhPPrPwG0jRd310jG8wm3lg/Irb+wA3F74nUcqrCtERhBpq+h9XWwlhI3K8yWGDv39l3IOkfTdzal4yOAz9s+ulRIZFtsKXvR7tLDYqO4h/6HYG9PW8jNMeXlhHnNpgMgA69YYKSkDTJwxvucsSilpHtFIaHlf6+WVH5Q2DmNIi5VzKBjHVOWUwtY1YCyTwFm7HOYhOHPWSmeJxi2afmy8iAMA",30,22],"item_rusty_sword":["data:image/webp;base64,UklGRtwAAABXRUJQVlA4TNAAAAAvIoAIELU4rm3bSayICpzm3EfswI5oiGbM4SLOiXqMo/fGKIokqbls4gRQ/PHvCH45KmokSdkvnwD0L+NMsJXLpP+M3LZxNGMCvk3Z8ohUng0g0E17no2MLCAEO2WoWvxXPirEU1P/fld21sZDBqf94No4nOlXJyziJSddzFGXo8LcSzRhVqLa7VAlRbMXwBxFVHv9yUgxR+EZJ89OdBRkaQoSZaF2fDEwi4F10pT9h+Hovdx8JEERg38ynsPH74SpUuwfA/eaVBw+ZMDt/34p",35,35],"item_scroll_blood":["data:image/webp;base64,UklGRhwBAABXRUJQVlA4TA8BAAAvFkAFEIfAJgDAJNPL3QIo0L8MFzW0hqLYNigd7GztjAIKCieCEt8AFEWS1FwkeEgGeGMDDfhFDrzi/AcAAAD+/xnxGBZBJ1XZwYG2oX1XKKoUbVHRUndulzfnLQaIkSRJjbZ3YebYAUn+u8t3JlRH9H8C2lsB7R+Vtnknd7uCN8rush28qvPMF3J1l2c+E1Hd5ZnhJ1rP5ZnxSOvPX451Zng4dLcAh00Mh2+EJ7B8WEZY0ACRLveaC59jiHap9IfuOiHatXbb3eWZIRZ0odznsKuTDo1lRVz0GFsN9wyd/2ygqcKV4VEjaKCfbRqa6Q37Bv1MAzS3NIzYb2iX2qdjtz/tgnYrcvK5ea4P0J4CAA==",23,22],"item_scroll_yellow":["data:image/webp;base64,UklGRgYBAABXRUJQVlA4TPoAAAAvFkAFENVAam3bdWMIb24SZmBChhA0odFYhECIRHrtfwhveF2utP807SJwnR9JUSNJanIV0I/37jygokhSI55YQCQ2MIQvyJ159p+B27aN7Kjzpu9eMaa8AgHGDLPDn80cvkDO5w+5W1XmIGm6cBW/yHImOZ8LfYE1mNFj8ymu6IrlfYc+y0NLIRl0ivWyiJCeXkYedTqwfXZ8f0ceNQGD57uetY/4Jhlt6PXorKKAftDNXSGCln0yQOe9ZyUjlqVaxM+WjGcuwbn0wPf3NzCQmUpKqmPifYckxmDv/ni4NxpUlHqUQTKsUaGu/d66mfa+mu+z5/w9AF0G",23,22],"item_shortbow":["data:image/webp;base64,UklGRtoAAABXRUJQVlA4TM4AAAAvGUAGEPU4iiTJcQ6ZPAf7tDAsC5EQAkvtTO9AGAL7O0thQkDUQ+F46K0mkiTlIMIHNeTfEwdqAgBN6J+NAHbBLIFr9Rm4bdvIKTtvfkNxJQCogjvDabsuWZnZ8e8JH8KdwfCydHPm6vB+NBbMpXi5aWrFr2c/48Oia6J7xaVkz/1TkQJrSehfef4b+aVUxkvsdjug7FzMyyDZyMdqkLJEPqsGeMmAwBrCKY3oaaFAsvCbEqRIkgJRpJRG9jLKyH7KR0b5F1PGmJI2k0fFFA==",26,26],"item_staff_01":["data:image/webp;base64,UklGRp4AAABXRUJQVlA4TJIAAAAvNMAMEBYnsW2LCokIQgwCkRp1zlywT1777D5HEGTbjG1E47jFTYUEZMoc0Rn9V+C2aQSYY/vJkecDdo8+9/Pfq/ra3vZV6lrKRRvfeGrkYkEManE9Cuh/PXCAWPYkcpegVwvAoXq2PZ0CQC6QIUoih0X5OzoIBvw29SgjQKv/BRgig2QI4sEIZx2/56zFObtrAA==",53,52],"item_staff_02":["data:image/webp;base64,UklGRvoAAABXRUJQVlA4TO0AAAAvM8AMEJVATiTJsiOLZMGzQKex4V3lg0x4nsjLfy0jXauhGpqiYMxGkiHSADUY/fclXqGZ2jasjghX/yo2MYQw9V9h27aNU3b5E8LnKUJCEklJj5r7bgOX3jJFLdjgLN6vxLrpfpl71AT51IKum06e+wcb23XwyrYJi6iFq8qvjzyoyJ+4cahFsWz7VMP6D63b5jmFOj9p8xwJF9tu+xwRN2q7F9VYc2wvCiuj0w1uk4wO2n03mZHA9w9IaDu9hyRBm2S20JlBywXU+Vf0NoKXP0xforOBpBveJskWZhuzhcwlsgHqgpbUBUhKwgMA",52,52],"item_staff_of_the_thunder":["data:image/webp;base64,UklGRrwBAABXRUJQVlA4TK8BAAAvNUANEC/CJpJsKfuO6OfIQDmqMEB4w06EBzaRZEuZdyhACP5dEGOAmB9xM44jSZKaKm544Q9/7JD7MuGu+U9Bjkh4icRv2R+E8M/EZn9fXn8k1vGEsUEAnu9nvz+OcbDBIEQQIgAb/kCe92dbBUGIYL7/T+T9fmq7de6EAk3TYvRpni8Z6hwkqBxkKECGKhShABkKEKEOKRQAkGzbTSP9pJiZmVSNanCrmUH7X1N1jaSCaUT/GbmRFKfB7NxIHqHmBXA4C+A5C2uN2jz9DkSAqfpigq9UMooyT7BMb/KJrfKRgaHl7AOKX6gibZmXdAr4ixLAt2Gwynxcr4Eo8YPUm2Gyr2cnRSj+gJShOL47G5RLAPDdmcPsVcW5q/Fps1y8vbluz4wURCTOXcxGw1arUu0ajRVSEOH8ajE/H48mU8DsUAFM9/nHy2cAULWL8H99gO0HFqTAzAWYKohsJRSMMVNBOAjUNBtU8NAn4QCocWiDzX82wn3yEFwEISJ7LIE9BHLRJ2Z75KNPR0l/r5DLjYOn76RPe4I22APR3uC9wnuD2Ak5sj/EDhQ+VAE4UAA=",54,54],"item_sword_04":["data:image/webp;base64,UklGRtAAAABXRUJQVlA4TMQAAAAvF8AGELU4jWRbVjx54dFfsXkyIIbdkQIBkArh/O2eIoL76/w6qCtPIVEcSVJyAoTg+edDHu68qFITAARzWhE2/UsIoJGj/4rctm2SEOk+9RWJ5OJTl9DoWeR9cp4FjUgC7o3a0VGRAfMrCW1bMRrD1jqO24j1RrZi3YiM7CU8GndIxWs9Ukbcl5lAx9irpx2kg1KeTp0+R+rCQl7TBGkkaMnvqkkpxWuyS/oqHFZJJrJ0CNuVAI2+fwn7pbD6wQHKFCgB",24,28],"item_sword_rusty_longsword":["data:image/webp;base64,UklGRnoBAABXRUJQVlA4TG4BAAAvIoAIELXAzbZtrcIm7u7utO5urWutnTszULFGxqA6e+DwvzkL/EHfXPlIdVzZyLaVBuLu+ikjnVtnG2D77CI16T4T27aV4O7QYABMne4k6p8A0pzm7qv/DBxJShQo/BR5hIZDCoFogoPJM7yasNEebYi7E3ciLOOUm4FSRL6j8+SrTlHVLOQ+vi2HVHs5r/SOQ2rN/hvvyfAyHyPw9/Yve4KHLXNMTgFSCHRDyxCag8DB5PnYDJQmOE+GVzs+dLLYJ3Xe/9pzxKwzUNusqeFHw6tnq9IlZGwvU8PP7SMQL4scyXiT+WdD5NY2a5XfkxQflXkE/4BQfnXVbOcTrWl49Y4yU9XWkYWtZ6+mxaGisb30CN5asE3rzcQrW+V5kzS+EuBT7z72P9fcnsooiQ92KSyc3DbokNeFH/BPCsq+fS0L733Av8rvTbhbHGfH/Si/LQJbZwDXpf5fIiFQEqcpJqgoWpE4NZrbpPePPw0=",35,35],"item_underkeep_key_3":["data:image/webp;base64,UklGRqwAAABXRUJQVlA4TJ8AAAAvEoAEEBJIjSQJjhiYgJ9GYVLmZD6H6rZ6TaE1KrWq61Ei0LAo82o6iaKKMIZQAzOa5HxNARrpvyK3bRvZ6rzlGd1PraZr3tF3LuHe+CmYeTi1/PvnP5c2X/SWOQaEgAQ3Ak51HfjknDmxr8Y2dXFC13BXxDcWhcyQSzxfNGcy6+BZK5ybilqwm5GHjgRnrJwp1shhfti9ccD74qx/ttoA",19,19],"item_white_feather":["data:image/webp;base64,UklGRkQBAABXRUJQVlA4TDcBAAAvF8AFEBXJaW0706vAjoIgdbqkS5UqdYD84giBV439KFy31pAxgjtXG5wZHAIXxVRG8EEaSW0AIGkSxga7ZhVEspX8/r0+7u4QgQj9V9i2bSPZSccnVvUOAMDqsunHis+9d6l+4G1WNnw+1bu7KmEvca+Gh3xre+nyP0dpVNjWQMOHXEV4rDu3w7v/Q3G5hhfs9+vfirhfly4JM7jtt/eVzyJjDNcYGOd57uf59OPJ9jou90uYcTtba5srcmkU3/ySmW3O2cAMd/cxfCyYtLbPOefEkPuQuhwmc+5ztgaA3N27F5eVma+jJZkg1VCuiJBiAbh6F8ZEkWREKBeh3rsKpCQzY730Tkhd6piBFCsh4jjoEes4MDNDGRkKYFGrEUGmFMcBsda2tWSutRZgpQBEZAL2f4FqAQA=",24,24],"item_wooden_shield":["data:image/webp;base64,UklGRgoBAABXRUJQVlA4TP0AAAAvFAAFEB44tTVpUpCFDSSQ4uA/wgE6MARyuns0VFJRRZV0/onob4R8WVmpRE0AEJKucvzsdqMYJg0ux7VQE0lSdHYuOxF/+gBmyLGEG3SQ9X8CbP4AMLfLwFee/3r77/3uAC7gmdbeT0Z8RKzqDizwvfu3L/ky/HrhLrIbE9xBKTVlNMwMd1YVxyqAHTBDUu4/P89xd5aLDUMktUxRYgeQVaTEsUoSG0hQFwdMUFOSBKqwgSzJnXQ/57iLNVApUfOUmEAkJRXJgWQGDEkOWjJhhthVQHGsqrxhZthBuZ9z3MW4YSO6SaUkMm/YHNFdRTLzhq2B6L0zA7DLmNscAA==",21,21],"mtile_alcove":["data:image/webp;base64,UklGRkQAAABXRUJQVlA4TDgAAAAvBgABEA5UkawEtZBJDEP/T0Pce8CMQIAYEuNAjW+FbCPAofucjmT9D3jdBg67yhY5X44laYxtGw==",7,5],"mtile_altar":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDoAAAAvB4ABELUoiiTFIRhCCSLw74ILFtAxfMSCaYhhBr0pZBsByvnLHcRv0f8JKDpGnE3vcPLxgw9gO8MZ",8,7],"mtile_button":["data:image/webp;base64,UklGRj4AAABXRUJQVlA4TDIAAAAvBMAAEDUgaiMpBxhaB3jhjX8tWyEBGWu6ByoyaRvq31xFdO809D96hro8SZ/5LnkGSQ==",5,4],"mtile_chest":["data:image/webp;base64,UklGRjIAAABXRUJQVlA4TCYAAAAvBkABEDUoCIAEQT3J/yvWBSDItg3RbPsXuf97oLomk61uI917Yg==",7,6],"mtile_door":["data:image/webp;base64,UklGRkAAAABXRUJQVlA4TDMAAAAvCgABEA4FiSBFPoVMYv8+px0cYUEgkIaEgtlgAgHKVOGT/k/ANF5dEULq/gdJXOqHVwEA",11,5],"mtile_door_opened":["data:image/webp;base64,UklGRjwAAABXRUJQVlA4TDAAAAAvCgABEDUoaCOFYRhCCf79TAucWDANMWSwN4FssvvLpZFF/yfAB19D+AgN2QsuDAA=",11,5],"mtile_enemy":["data:image/webp;base64,UklGRkoAAABXRUJQVlA4TD4AAAAvCAACELWwiSRbCocEYhzg3yIW/vkMbNiJQIDoESXEg+gJ6H+0m0Dz6FtV1absN1soQkhFEk0lidZE/DTQGg==",9,9],"mtile_enemy_friend":["data:image/webp;base64,UklGRlAAAABXRUJQVlA4TEMAAAAvCEACEFUwaBvJ0Reqx+WgPNBKYeYsECB6jBvQ4EtMQ0z/XwMplOv/BCQ5gdxdumZ56PjeUMRas+7QFonxreTm3z0BAA==",9,10],"mtile_enemy_neutral":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDsAAAAvCAACELW4aSRJkvYheCiOxeE/ClVOeYMgHIFswpM/X9/69z/yBoiPv2/bYc7Xo4xSumor1rYSVX8CEgA=",9,9],"mtile_exit":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDkAAAAvCUACEHUwiiRJCocsDOFfAz8M1HBkCAQSjRRG31Igm+wO+RMF9er/qD1B5fD3PPO+yjs116qboAAA",10,10],"mtile_fast_travel_portal":["data:image/webp;base64,UklGRlYAAABXRUJQVlA4TEkAAAAvCAACEBpGkSRJWcAQGhCJBJyeDqr/9RkFK2EsEGTb5jjmMIFR/AoCEEDUH5tscbz/AWxG9wPAa6+ywTqoKcEyP3LL2eaMaAOtAA==",9,9],"mtile_god_ray2":["data:image/webp;base64,UklGRjAAAABXRUJQVlA4TCMAAAAvBoABEFWYaduGayGM/z8KifKIiY+T9z9gFtClkap9pAZUAAA=",7,7],"mtile_ground_1":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDsAAAAvCUACAAoGjSRJOcAQNn7/ksDB1I2QgIwdMkaVKGjbhg31MepO/xfh/Xdh2ohIfGBy1BYACADQtgI/GgA=",10,10],"mtile_mud":["data:image/webp;base64,UklGRkIAAABXRUJQVlA4TDUAAAAvB8ABEA6GbdtGau8Wuklu/9HYR4BAIA0JBbPBBAKUqcIn/Q++SKXXsCoALaIV+f9O0aIVBQA=",8,8],"mtile_obstacle":["data:image/webp;base64,UklGRkwAAABXRUJQVlA4TEAAAAAvCMABEHUwimQrDoskhGAm2y3miYd5HCYK2rZhQ317UDYB/R8D6F8V8IUpyXPEsaYckWTrv4gmSfZXxpIlCqAC",9,8],"mtile_party_arrow":["data:image/webp;base64,UklGRlgAAABXRUJQVlA4TEsAAAAvDYADEApGbSNJQjVUlsfyf84JoZISCCRWaY64ikK2EWBsM4l7+z8BWQ4np/wjz/BLlUfYtvIEu5Qk2K0E1UmVeQWQZJfl3XK3TQIA",14,15],"mtile_passage":["data:image/webp;base64,UklGRlAAAABXRUJQVlA4TEQAAAAvCMABELWwCdg2TLcRGpIhGX8CCQj7Mgf5EQumIYYZ9KaQbQQo85c7idei/xPwps8JITxDJv25JKF2maNAl9XyYkmeEg==",9,8],"mtile_pit":["data:image/webp;base64,UklGRiQAAABXRUJQVlA4TBgAAAAvBoABEDUgaNs2286f+BHETcn+Zw/yQSA=",7,7],"mtile_pressure_plate":["data:image/webp;base64,UklGRkoAAABXRUJQVlA4TD0AAAAvBoABEA4FbdtI9xA6JAfi+OM4DGmrSgIRRGiYDYbYvxSyjQCndo/TGVz/A460QN9PNqXJbbYaf5FtAZIAAA==",7,7],"mtile_riddle_grave":["data:image/webp;base64,UklGRjoAAABXRUJQVlA4TC4AAAAvCMABEDUwaBvJ0RVEh+j506gYnEmZgP6TDVAUVn+wr0IX0OsAyiHd/I/qd74G",9,8],"mtile_sarcophagus":["data:image/webp;base64,UklGRkwAAABXRUJQVlA4TEAAAAAvB4ABEA4GbRtJ2ofQIjkQx5/FLog+iiQQQYSG2WCI/Ush2whwavc4ncH1fwL+/zyifi0lUALZlIb0Ig0GfCPe",8,7],"mtile_shrine":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDkAAAAvCEACENUwiiS7Ch+D+D/jJAkahpjqq0AgxXlMsEAghe1x/yeguo9G3qZi703FphF9wwPiH/HPfQQA",9,10],"mtile_sign_alchemist":["data:image/webp;base64,UklGRnoAAABXRUJQVlA4TG4AAAAvDcACEA63kSRJyj0OYQ1OIK2MOavj5H0udBXREYoZSYJ45mBYgH0tSnMtpaK2kZxt8MJnK5X7H8z+T8DrJLe7N3qbxwmfMsXvX/VPSIIFLDnSir2htF4o7zm8wXe/cjXIAlMM8iw4hQ6SXHJMEg==",14,12],"mtile_sign_brenna_smith":["data:image/webp;base64,UklGRnwAAABXRUJQVlA4TG8AAAAvDMACELW4iSTJkU4QOhaH4kA8sSe5AkO3udER654oR00AJEwVXj5Q49g/xVLQNgp0L/6l4QQk9H8CDqx6v538emkuxTkBxO/nP3f1J74REk64bSRpppLZMHdaNqcmocAGhmu3w/BdESPxjeqUkgQA",13,12],"mtile_sign_mayor":["data:image/webp;base64,UklGRoYAAABXRUJQVlA4THkAAAAvDMACELWwaW3tCcUQI7awgAM0sKMFT3+z8P4wdbafcvMnSgMQgmwg6apu/8nuUdNICnR3PP4VoQEJGCD0VP2fgMYt378Of19CxTRnR0jMV3YkqSgT401aWS+DCMM+ZFcmk7GkVramdVltPTaZt0V0nzHGpyBkx5QkAA==",13,12],"mtile_sign_smith":["data:image/webp;base64,UklGRnQAAABXRUJQVlA4TGcAAAAvDcACEBJWkSQ7IZh4MnCADHQgAEuYfFHCXC3x4INoA+Ih01VNc4q7XKkgkg3qfXR5PYSiDF37PwFTQfE3or5iVYMWzeaz/e++boUAmSTNaRdxKjAFgYkLzOTe6k+cKfTb6afIKgYAAA==",14,12],"mtile_sign_tavern":["data:image/webp;base64,UklGRnYAAABXRUJQVlA4TGoAAAAvDcACELWwjWxbCdIDGSE5rdEYTT75LdyXfcuRb4oCkIFo4quOeqruUBxJBrQHnuSflUyEoP8TcGqh/lfzVxdnlCO992kuQAHKGCNPgL/nCijxDsNfX4rsvd84Ck+lTOzhUB4zewrEQkEB",14,12],"mtile_sign_wares":["data:image/webp;base64,UklGRnIAAABXRUJQVlA4TGUAAAAvDcACELUwiiRJCochXOACGWjD314WetrAPBeoj5K2ESAfh44eO//WvpBJ21BjFbJ7Nudhkvo/AQev7n8XfzfDEvf3pOVESML2BKOSyzkhJNEiiQ5jPN2axm5lAJE1kRGRqEkpSQA=",14,12],"mtile_statue":["data:image/webp;base64,UklGRkwAAABXRUJQVlA4TEAAAAAvB8ABELUwiiRJCochlCAC/zIQ0b/2kP0RC6Yhhhn0ppBtBCjnL3cQv0X/I0/E64mP1krsHjPR2c82ahtSIEkA",8,8],"mtile_symbol_default":["data:image/webp;base64,UklGRmoAAABXRUJQVlA4TF0AAAAvCQADEFUwiGyrCmojwhDAGkYz3vtkOHDIAkwYMtg7+UBCiIYg2yYjOcEt7j+Jg/RfYdo2jLp7yiNKDieWBd/8kW/9O808e2t2YknWY27rsXkLGTmc2LBgIlCSkgAA",10,13],"mtile_teleport":["data:image/webp;base64,UklGRlYAAABXRUJQVlA4TEkAAAAvBsABEBJGkSS3USAkJKJkFhmuSLRz+pBJ2wapl54TMBlV0LYN00e5QMegTNb/xMJDx6mvld7Z/axuK9bVTQm9K8EvL3/b7e0HAA==",7,8],"mtile_tree":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDwAAAAvCMABEFUwaNtG0N0/p8NwJMafyOsxJMoFUsQ0xPRv6PRp0f+AN1VAV0P1DTnU8k2qQz/HVx4bpRZABX8=",9,8],"mtile_wall_1":["data:image/webp;base64,UklGRigAAABXRUJQVlA4TBwAAAAvCUACAAVhtpHr3vV3uCNoxMnL+78MmWhW+ikC",10,10],"mtile_well":["data:image/webp;base64,UklGRk4AAABXRUJQVlA4TEIAAAAvB8ABEA4GjSRJOcAQNrCBfxefhulMOiumIWOFhPHKQSHbCHBq9xidw/V/AnLKQcFE7t9iKFD8cbW283iizAwmAiY=",8,8],"item_flower_amberrose":["data:image/webp;base64,UklGRhoBAABXRUJQVlA4TA4BAAAvFUAFEI+gJgDQhALWPxIfVGD2yes1FDSS1OwD/hWhAUQ0Bb2riSRJmbvn6FV99v6lMM1/AIwPAz6z4bxemh++Q7Mw9vje+mbGf0geaqt2FqQQk0CCALZx2yCA0G1iNTj4/29zPiGi/xPQT9EvAhgAn2DGHA/ewziKmMF7ESNGfAUU/0609hI5eAAsyOf8/d2blB/goU1a5/xuJmiLsRSFonUU+okZURFNnT/MoIWkRIlIxefHaGHmUrTXikKdg7aFmTv32muFGqBtMSPyYS+JQp9YvP5z7bW2Qg4eilF4v629SVnoC/O68X7jxciDJ8U4vG5hqAz6asxQYSz0NTCmTdPo28AAg0E/RYuirwE=",22,22],"item_wild_berries":["data:image/webp;base64,UklGRogAAABXRUJQVlA4THsAAAAvFoACEJU4bttIkjaO87X5JzkzuxtCARLKTxNk20xpTsO41/XUtG3AptIBoG/7PwHz5Q2cf+r7v4f6g/rZFuyqX8g+bMuWplFnRhUEWrIpi2O2CluStCmclGRL2UKy1ZkxMS3QbEmJzowqqEmLiYtzqjOj4DG5uNQ56gAA",23,11],"item_caerlin_blue_flowers":["data:image/webp;base64,UklGRrQAAABXRUJQVlA4TKgAAAAvFcAEEBZIqW3LjiIrFjKKiWjoquT/5pWEU5zJhsvhKAiQCViskBJKKSaBXA4yAYudEsiulgRy+Po/ATp9AdAycM9sVrCvSm5u19rfPrFZ86Q1C2knDVpzgo4BIdIEHeMZjEjQmWldIwAJ9txkxzNgIwmax7w3dr2DZ/y8vikSmxZEknGTTZ3/eAZBEncn/cbjIgmSoJ24LdoFdNCCFknSoGWSoD8EtAU=",22,20],"item_flower_crimson_berries":["data:image/webp;base64,UklGRtwAAABXRUJQVlA4TM8AAAAvF0AFEJVAamxbtoIAZowJzhhjERloer+TsFeyknfozjYIAEkGkUQSTQoJBLDAmAoCgEC08eaYk1P0fwJy/xPAPNaXOKoX9AZ5+3+9F56tJhHUC8KW7UHaAZPIlk9li4nQpR0P7c+89xgju+dPGZPE2T13i9J+rPjZxQPt0GIEvs+2hwgKJnG6UIwaTTRHtx2NLB6uSjGJ2w54LWoOtOzWaxeV6dl273C2/WJwtnPPtj9wzjyiP2fhroHZtrt3RGdL27tyGNq5KzqjmgdqrgMA",24,22],"item_bones1":["data:image/webp;base64,UklGRoIAAABXRUJQVlA4THUAAAAvGEACEBJHkSTZCp6wgzL04Oz9kFDTUX2aC0G2zfhmMbArnUlB2zZMqX14QzCw/Z8AeAFFlcd+d59W+/tvVe+h9S2b7KZ6C0SdJrtRRT0BRWeS7KZmIx4TQZ3muInObtKOADrdTdJDRpVzJ0kVVLltU/mvCgAA",25,10],"item_bones2":["data:image/webp;base64,UklGRqIAAABXRUJQVlA4TJYAAAAvEUAEEBJHDdiG0WCMx9E5ZIfnoCXFYFv2q7JEEEASRkxbDLbSTArZSIIWY3W+O7wjONj+K0zagEnnLdh6wNTxfbu/nZRPRAOwAUf//73LJu3o5pWdOC0ppW3FRav0BNP2ahEapqTekSQ04M4rRSMw1VTK/IMkUdh20SpKyrqLO7qsZ9IlGsBgblaGFeUYwEl4DmDbpwA=",18,18],"item_bones3":["data:image/webp;base64,UklGRoYAAABXRUJQVlA4THkAAAAvEsAFEAoGbRtJOk7L5OANnkO2X0c6An3IhCHk88q3SjIZZBvp1O7/+UrwsP1XIEmGg8Hl+Ape9UmWElC8u3C0Anz/2Lmb7MKEUnByFcUQakN3AkeQOkARUzRiYQi11f0Y4e3A2FpiK0OMcBETxoSNax0t4WUQ/xACAA==",19,24],"item_bones4":["data:image/webp;base64,UklGRnwAAABXRUJQVlA4THAAAAAvEAADEBI4kSRJkpbT0llkh+eYzYMhIy1SaoUg22Z8sxjYlc6koG0bptQ+vCEY2P5PQB4/QPPeX9tXmugbMP7t5p0dxu7BjjuTRAsYubP//6HaOwsaaxnGnh3r6TpMbNd1B4ZJhDFgaG52Bc29j3kE",17,13],"item_bones5":["data:image/webp;base64,UklGRpYAAABXRUJQVlA4TIkAAAAvEcAEEBJIkSTbVp4n7KAMPTg7H5Awp6Nq1RuCbJvxzWJgVzqTgrZtmFL78IZgYPs/AbP9gP2c4bvtYYc/u6OyYJLf/5pEZjBJT/mS/Adm3akXW31vaZe28e2giWBfuqwRwDb+IYmPQaCL0ccMNlI1vrcMEWgiwKyIqDJnYmzurBXm6onMNTDMGQA=",18,20],"item_bones6":["data:image/webp;base64,UklGRuIAAABXRUJQVlA4TNYAAAAvFwAFEBJYkSTZVnCAGCxcGVcZejCDj31Y6O6ojnthftQEQMLQgFS4WhDMSrbxVxMACUMAAvHiimcCi9iu/wrbtm0kJR2n6OgHsKqLwM/dfO/OTI4Bmd//5GtsOMa8XpOnx33lHJlJatO5BJBXEZ0gBh0kr4e0dDjYm4eEWBgkBiEQmY0M64QJYp4eSBeYLDCB9MSriO23gRQaGCQaSOgsuIEgiQBTFtx0p7UnTRt/kikiXaKetk7/baQ9wdR1/W+kLYCM7f8CWiW2nRgAncRtbXQXgMsI",24,21],"hud_icon_quest_active":["data:image/webp;base64,UklGRj4AAABXRUJQVlA4TDEAAAAvBIACEFUwattI0PLns+j2fYehVgQkSf83Gwhkk/x3kyT7HzvFvC+/lzLZh3lfXMowAA==",5,11],"torch1_side":["data:image/webp;base64,UklGRpwBAABXRUJQVlA4TI8BAAAvHUANELegKJKkZo6ckxz8W+GPArChJgCQhg3qpxc17B/AJKZYaiPZSv7/uGTQCDH9d2IhsUOQbVOoM83f4GGVHSBC3/9/fJKby1YInEwwlTxeUHKDh9iVXD5O1IeFds+ZlcpdydnFnpkBYmy7jSrEyjI4ASao/1o3oB8KeC+i/xPg4WcS8cJOnqNU6mV28hKjYp2X+UTPQagtX9ivUYY8HswMUYjdMfBojBG74X4auJqvNUGPASRwom8Jku4pBHVtuqGQF8oBkvUG0nwryRvcLIDgRZMbqIfKrqDwBYjhSJGj7/WHxKGkDmBVVnwdQtoCVHCS8uZLfG+9I7B8ErxLjIo10gD4tgYMmvpXWAlb58yLx+hqjh/KiweJtT5H9jC2PvM1SqX1NrMHqVjrIy9BgOQ2R/Yf6CMvP9DmyB4m1oYtXyiQCnbqzTxAXu+kAlg1jZE3QQLwkCIEyRcgQWuSjAEUAoDwmKQQq4CHAFAxQv1rPdKjsHX2wAMmP4PF/y/EIenPbIbgn/B/y8M3PBoA",30,54],"item_potion_respec":["data:image/webp;base64,UklGRvYAAABXRUJQVlA4TOkAAAAvEUAGEBZJrW3LVoUkDCABBNRCKjV00YEP+qg4lYWVlZOTSf3/udnNnaiprQOzW1X6q6KFBqLoIcTXwGhXE8lOFWn/tCkTEyhAAmLonxFU4OHR/xOg+glRQP08AS/mjGCg2sXL7t/f3/fdL5Mzct99pNkjzrgcx4Hq1KCGeLsbiYNtDiQ2bANsRwDsQDgi7FOdGVUkMaiS7ff7l8tEJTvWivK81plUXiPfiV4rfhwxf1yzn4COO9GOOd2ImDObFfH871pPwHImatgRWTbEf0d6zkStzHT0if8ZMRN1OTP7hO1EfXPOEQGoDgA=",18,26],"etile_golden_vein":["data:image/webp;base64,UklGRpIAAABXRUJQVlA4TIUAAAAvCAACELWwqa29iYeoyp41GkJZGbsETPQVBziACS8f8dCLhWxqIklS83UyTsBjxB99RiKY1ESy1Vj7XgO5oqLK2QIuUMAn/ieAwPchVNI54Ua/kqn5S1Q7FSu+bqhe6l7i0rkmUOn2tjurKfoKlwxz29S8hRySqlup2D+TQqfUQ+cfpVRyAA==",9,9],"collapsed_rocks_cave_tough":["data:image/webp;base64,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",198,161],"mtile_boulder":["data:image/webp;base64,UklGRkQAAABXRUJQVlA4TDgAAAAvCEABEDUoaCMp4vGEBkzg38dxIroXSCHStkn9Oxw8u4v+CwkIkuQHuy9y7Qm7PkjsQqFxvEplFw==",9,6],"mtile_collapsed_rocks":["data:image/webp;base64,UklGRloAAABXRUJQVlA4TE0AAAAvCkACEA4HjSQJygOGUIII/Auams0kAhFEaJgNhti/FLKNAKd2j9MZXP8jH0pA/P+v0VaFO19xRK/ocTqd0XHtJLgOca25G+1GN4FAAAA=",11,10],"urn1":["data:image/webp;base64,UklGRnwCAABXRUJQVlA4THACAAAvKgAOENXIbUA3dpgcC2SNzHDOcHmFbHIukxGymgGJovQ9wQcDUIC71z9VBNypdkcoiSTJGRlHD875F/YsB6WRJEUj745HETkZkMHmxesxAoEEasW9c+C2bSRZNpDOTI/FZnb/cA7xhqZw3oj8PN2PNk3m7XIr57t6Lsr3/hX2yhvE/dM0+190V3BRwj0P5+2tOF0wiTwuTgGPKrOKXihBZh6oyIQ0hcjRIkn3xjJilxFntp9XgZzTfeBirhLpiKoI0qucq+eEtDyVcgIRdEXs7T67uO8NdpSejDAT67bPeq0imJ567UiydtK2i+KCegSLIBPuqYvIRERclG1mV1CpTwQywY5QLAogFABRcTry7FgWCYWU1XTmqat6kkQqgBR7Enl2TdnJCmKfJl1DWVldlECe54CDVC54U9UMqkU0IUkIjdsVGCEyKIAqB5QrEYGIZskikTXy5NpAaLfZCHvAuUkgBsbkHpJX9+NDgmh6ABFq5b4xIljv/ZebGcYEs+Z1VrrEDGPaxDJTu8/NFmJjbCkG/uTwaN69bfZ4IHhR1kg2NhnoEOTGzgGFcES0a0XNigGdGbEZVxDq97nLOGKs+ao2SHHbKA6xY7SjH4SBtgUmDvHAqIwsWSGoJm1EL6FnIpexBlZANW0l8tmpSkjx1S8y2r3MFkjmUymeIu3bDjag6VOvfip5/Tl7fwCQnd00Yd6L29wT04eomch7tUwV5uz9VLXnQJGwkHD4/Huu/1OnnsOjRJVwBEvRYToj8i7UM0m6CkmqOVUnB0g1Z+OmyN6VvKuRVh/XUDfR+0S51eHZ0Ou+Yww0//iVcQ49ewI=",43,57],"secret_wall_tile":["data:image/webp;base64,UklGRm4AAABXRUJQVlA4TGEAAAAvCoACENWwiWzbCcEQOhCAAGoq/Hc/aEgqbv8t3HdaNY2kwDkN90JJi4K2bRiVP7lyOLsk+j8BrbXzAVxH42Z+KfvCGEVWoKh4UMp9CHiVvAoLFHMmgpBmKgy6920pMXkDAA==",11,11]},
"legendIcons": {"passage":"mtile_exit","travel":"mtile_fast_travel_portal","event":"hud_icon_quest_active","boss":"mtile_enemy","secret":"secret_wall_tile","trap":"mtile_pit","mechanism":"mtile_button","treasure":"mtile_chest","service":"mtile_enemy_friend","item":"etile_item","enemy":"mtile_enemy","trigger":"mtile_pressure_plate","note":"mtile_symbol_default","gather":"item_flower_amberrose","acquire":"etile_item","junk":"item_boulder","rubble":"mtile_collapsed_rocks","hard-rubble":"collapsed_rocks_cave_tough","gold-vein":"etile_golden_vein"},
"terrainArt": {"floor":"mtile_ground_1","wall":"mtile_wall_1","tree":"mtile_tree","solid":"mtile_obstacle"},
"nativeArt": {"mtile_alcove":["data:image/webp;base64,UklGRkQAAABXRUJQVlA4TDgAAAAvBgABEA5UkawEtZBJDEP/T0Pce8CMQIAYEuNAjW+FbCPAofucjmT9D3jdBg67yhY5X44laYxtGw==",7,5,-2,-9],"mtile_altar":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDoAAAAvB4ABELUoiiTFIRhCCSLw74ILFtAxfMSCaYhhBr0pZBsByvnLHcRv0f8JKDpGnE3vcPLxgw9gO8MZ",8,7,-2,-2],"mtile_chest":["data:image/webp;base64,UklGRjIAAABXRUJQVlA4TCYAAAAvBkABEDUoCIAEQT3J/yvWBSDItg3RbPsXuf97oLomk61uI917Yg==",7,6,-2,-3],"mtile_door":["data:image/webp;base64,UklGRkAAAABXRUJQVlA4TDMAAAAvCgABEA4FiSBFPoVMYv8+px0cYUEgkIaEgtlgAgHKVOGT/k/ANF5dEULq/gdJXOqHVwEA",11,5,0,-3],"mtile_door_opened":["data:image/webp;base64,UklGRjwAAABXRUJQVlA4TDAAAAAvCgABEDUoaCOFYRhCCf79TAucWDANMWSwN4FssvvLpZFF/yfAB19D+AgN2QsuDAA=",11,5,0,-3],"mtile_enemy_friend":["data:image/webp;base64,UklGRlAAAABXRUJQVlA4TEMAAAAvCEACEFUwaBvJ0Reqx+WgPNBKYeYsECB6jBvQ4EtMQ0z/XwMplOv/BCQ5gdxdumZ56PjeUMRas+7QFonxreTm3z0BAA==",9,10,-1,-1],"mtile_enemy_neutral":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDsAAAAvCAACELW4aSRJkvYheCiOxeE/ClVOeYMgHIFswpM/X9/69z/yBoiPv2/bYc7Xo4xSumor1rYSVX8CEgA=",9,9,-1,-1],"mtile_exit":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDkAAAAvCUACEHUwiiRJCocsDOFfAz8M1HBkCAQSjRRG31Igm+wO+RMF9er/qD1B5fD3PPO+yjs116qboAAA",10,10,0,0],"mtile_fast_travel_portal":["data:image/webp;base64,UklGRlYAAABXRUJQVlA4TEkAAAAvCAACEBpGkSRJWcAQGhCJBJyeDqr/9RkFK2EsEGTb5jjmMIFR/AoCEEDUH5tscbz/AWxG9wPAa6+ywTqoKcEyP3LL2eaMaAOtAA==",9,9,-1,-1],"mtile_god_ray2":["data:image/webp;base64,UklGRjAAAABXRUJQVlA4TCMAAAAvBoABEFWYaduGayGM/z8KifKIiY+T9z9gFtClkap9pAZUAAA=",7,7,-2,-2],"mtile_mud":["data:image/webp;base64,UklGRkIAAABXRUJQVlA4TDUAAAAvB8ABEA6GbdtGau8Wuklu/9HYR4BAIA0JBbPBBAKUqcIn/Q++SKXXsCoALaIV+f9O0aIVBQA=",8,8,-1,-2],"mtile_party_arrow":["data:image/webp;base64,UklGRlgAAABXRUJQVlA4TEsAAAAvDYADEApGbSNJQjVUlsfyf84JoZISCCRWaY64ikK2EWBsM4l7+z8BWQ4np/wjz/BLlUfYtvIEu5Qk2K0E1UmVeQWQZJfl3XK3TQIA",14,15,2,2],"mtile_passage":["data:image/webp;base64,UklGRlAAAABXRUJQVlA4TEQAAAAvCMABELWwCdg2TLcRGpIhGX8CCQj7Mgf5EQumIYYZ9KaQbQQo85c7idei/xPwps8JITxDJv25JKF2maNAl9XyYkmeEg==",9,8,-1,0],"mtile_pit":["data:image/webp;base64,UklGRiQAAABXRUJQVlA4TBgAAAAvBoABEDUgaNs2286f+BHETcn+Zw/yQSA=",7,7,-2,-2],"mtile_pressure_plate":["data:image/webp;base64,UklGRkoAAABXRUJQVlA4TD0AAAAvBoABEA4FbdtI9xA6JAfi+OM4DGmrSgIRRGiYDYbYvxSyjQCndo/TGVz/A460QN9PNqXJbbYaf5FtAZIAAA==",7,7,-2,-2],"mtile_riddle_grave":["data:image/webp;base64,UklGRjoAAABXRUJQVlA4TC4AAAAvCMABEDUwaBvJ0RVEh+j506gYnEmZgP6TDVAUVn+wr0IX0OsAyiHd/I/qd74G",9,8,-1,-2],"mtile_sarcophagus":["data:image/webp;base64,UklGRkwAAABXRUJQVlA4TEAAAAAvB4ABEA4GbRtJ2ofQIjkQx5/FLog+iiQQQYSG2WCI/Ush2whwavc4ncH1fwL+/zyifi0lUALZlIb0Ig0GfCPe",8,7,-2,-2],"mtile_shrine":["data:image/webp;base64,UklGRkYAAABXRUJQVlA4TDkAAAAvCEACENUwiiS7Ch+D+D/jJAkahpjqq0AgxXlMsEAghe1x/yeguo9G3qZi703FphF9wwPiH/HPfQQA",9,10,-1,0],"mtile_statue":["data:image/webp;base64,UklGRkwAAABXRUJQVlA4TEAAAAAvB8ABELUwiiRJCochlCAC/zIQ0b/2kP0RC6Yhhhn0ppBtBCjnL3cQv0X/I0/E64mP1krsHjPR2c82ahtSIEkA",8,8,-2,-2],"mtile_symbol_default":["data:image/webp;base64,UklGRmoAAABXRUJQVlA4TF0AAAAvCQADEFUwiGyrCmojwhDAGkYz3vtkOHDIAkwYMtg7+UBCiIYg2yYjOcEt7j+Jg/RfYdo2jLp7yiNKDieWBd/8kW/9O808e2t2YknWY27rsXkLGTmc2LBgIlCSkgAA",10,13,-2,3],"mtile_teleport":["data:image/webp;base64,UklGRlYAAABXRUJQVlA4TEkAAAAvBsABEBJGkSS3USAkJKJkFhmuSLRz+pBJ2wapl54TMBlV0LYN00e5QMegTNb/xMJDx6mvld7Z/axuK9bVTQm9K8EvL3/b7e0HAA==",7,8,-2,-1],"mtile_tree":["data:image/webp;base64,UklGRkgAAABXRUJQVlA4TDwAAAAvCMABEFUwaNtG0N0/p8NwJMafyOsxJMoFUsQ0xPRv6PRp0f+AN1VAV0P1DTnU8k2qQz/HVx4bpRZABX8=",9,8,-1,-2],"mtile_well":["data:image/webp;base64,UklGRk4AAABXRUJQVlA4TEIAAAAvB8ABEA4GjSRJOcAQNrCBfxefhulMOiumIWOFhPHKQSHbCHBq9xidw/V/AnLKQcFE7t9iKFD8cbW283iizAwmAiY=",8,8,-2,-2],"mtile_enemy":["data:image/webp;base64,UklGRkoAAABXRUJQVlA4TD4AAAAvCAACELWwiSRbCocEYhzg3yIW/vkMbNiJQIDoESXEg+gJ6H+0m0Dz6FtV1absN1soQkhFEk0lidZE/DTQGg==",9,9,-1,-1],"mtile_boulder":["data:image/webp;base64,UklGRkQAAABXRUJQVlA4TDgAAAAvCEABEDUoaCMp4vGEBkzg38dxIroXSCHStkn9Oxw8u4v+CwkIkuQHuy9y7Qm7PkjsQqFxvEplFw==",9,6,-1,-3],"mtile_collapsed_rocks":["data:image/webp;base64,UklGRloAAABXRUJQVlA4TE0AAAAvCkACEA4HjSQJygOGUIII/Auams0kAhFEaJgNhti/FLKNAKd2j9MZXP8jH0pA/P+v0VaFO19xRK/ocTqd0XHtJLgOca25G+1GN4FAAAA=",11,10,0,0],"secret_wall_tile":["data:image/webp;base64,UklGRm4AAABXRUJQVlA4TGEAAAAvCoACENWwiWzbCcEQOhCAAGoq/Hc/aEgqbv8t3HdaNY2kwDkN90JJi4K2bRiVP7lyOLsk+j8BrbXzAVxH42Z+KfvCGEVWoKh4UMp9CHiVvAoLFHMmgpBmKgy6920pMXkDAA==",11,11,0,0]},
"paperTexture": ["data:image/webp;base64,UklGRrgAAABXRUJQVlA4TKwAAAAvbsAMADW4kSQpbP7q2JH/n3GIE9yp5GzmERMCgcSfs/fo/wR8FH/t3cTGmMzUuxnvWgZSWmdC2MAqnRDWx9xgrC1mubyLgFYHKgRt4rbEx+3LcnnjTBWoh1yr5uKvsTyS/bNDM0qYRVhMCEkCVs9le23n6TJ20ivQiwK9vMo8LOiE+U5ynpvDQYfCTqzOSAMSzCLZm8nM+DsS9/HOM6axWEQ619yd6VYnA3YI",111,52],
"dungeons": {"Mines_under_forest":["Abandoned_Mines_Cave","Under_Abandoned_Cave"],"Mausoleum":["Mausoleum_2","Mausoleum_3","Mausoleum_3_2"],"Swamp_Dungeon1":["Swamp_Dungeon2"],"West_Dungeon_1":["East_Garden","West_Garden","West_Dungeon_2","West_Dungeon_3"],"Tower_Level1":["Tower_Level2","Tower_Level2_Corrupted","Tower_Level3","Tower_Level4","Tower_Level5","Undertower"]},
"connections": [["Abandoned_Mines_Cave","Mines_under_forest"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Mines_under_forest"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Abandoned_Mines_Cave","Under_Abandoned_Cave"],["Basilisk_Den","Caerlin_Woods"],["Caerlin_West_Dungeon","Caerlin_Woods"],["Caerlin_Woods","West_woods"],["Caerlin_Woods","Swamp"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Basilisk_Den"],["Caerlin_Woods","Swamp"],["Caerlin_Woods","Caerlin_West_Dungeon"],["Caerlin_Woods","Forgotten_Vein"],["Caerlin_Woods","Village_of_Underkeep"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Caerlin_Woods","Wolf_den"],["Dragon_den","West_woods"],["Dragon_den","West_woods"],["East_Garden","West_Dungeon_1"],["East_Garden","West_Dungeon_1"],["Forgotten_Vein","Caerlin_Woods"],["Mausoleum","Underkeep_Cemetery"],["Mausoleum","Mausoleum_2"],["Mausoleum","Underkeep_Cemetery"],["Mausoleum","Mausoleum_3_2"],["Mausoleum","Mausoleum_2"],["Mausoleum_2","Mausoleum_3"],["Mausoleum_2","Mausoleum"],["Mausoleum_2","Mausoleum_3_2"],["Mausoleum_2","Mausoleum"],["Mausoleum_3","Mausoleum_2"],["Mausoleum_3_2","Mausoleum_2"],["Mausoleum_3_2","Mausoleum"],["Mines_under_forest","Starting_forest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Rat_nest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Starting_forest"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Mines_under_forest","Abandoned_Mines_Cave"],["Rat_nest","Starting_forest"],["Rat_nest","Mines_under_forest"],["Small_spider_cave","Starting_forest"],["Starting_forest","Rat_nest"],["Starting_forest","Small_spider_cave"],["Starting_forest","Village_of_Underkeep"],["Starting_forest","Mines_under_forest"],["Starting_forest","Underkeep_Cemetery"],["Starting_forest","Mines_under_forest"],["Starting_forest","Mines_under_forest"],["Starting_forest","Mines_under_forest"],["Surroundings_Cave","Underkeep_Surroundings"],["Swamp","Swamp_Spider_Nest"],["Swamp","Swamp_Dungeon1"],["Swamp","Caerlin_Woods"],["Swamp","Caerlin_Woods"],["Swamp","Swamp_Lost_City"],["Swamp","Swamp_Dungeon1"],["Swamp_Dungeon1","Swamp"],["Swamp_Dungeon1","Swamp"],["Swamp_Dungeon1","Swamp_Dungeon2"],["Swamp_Dungeon2","Swamp_Dungeon1"],["Swamp_Lost_City","Swamp"],["Swamp_Spider_Nest","Swamp"],["Tower_Level1","Tower_Level2"],["Tower_Level1","Undertower"],["Tower_Level1","Underkeep_Surroundings"],["Tower_Level2","Tower_Level1"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2","Tower_Level3"],["Tower_Level2","Tower_Level2_Corrupted"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level2_Corrupted","Tower_Level2"],["Tower_Level3","Tower_Level4"],["Tower_Level3","Tower_Level2"],["Tower_Level4","Tower_Level5"],["Tower_Level4","Tower_Level3"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level4","Tower_Level4"],["Tower_Level5","Tower_Level4"],["Tower_Level5","Tower_Level5"],["Tower_Level5","Tower_Level5"],["Under_Abandoned_Cave","Abandoned_Mines_Cave"],["Underkeep_Cemetery","Village_of_Underkeep"],["Underkeep_Cemetery","Starting_forest"],["Underkeep_Cemetery","Mausoleum"],["Underkeep_Cemetery","Mausoleum"],["Underkeep_Surroundings","Surroundings_Cave"],["Underkeep_Surroundings","Village_of_Underkeep"],["Underkeep_Surroundings","Tower_Level1"],["Underkeep_Surroundings","West_woods"],["Village_of_Underkeep","Caerlin_Woods"],["Village_of_Underkeep","Underkeep_Surroundings"],["Village_of_Underkeep","Starting_forest"],["Village_of_Underkeep","Underkeep_Cemetery"],["West_Dungeon_1","West_woods"],["West_Dungeon_1","West_Dungeon_2"],["West_Dungeon_1","East_Garden"],["West_Dungeon_1","West_Garden"],["West_Dungeon_1","East_Garden"],["West_Dungeon_1","West_Garden"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_1"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_2","West_Dungeon_3"],["West_Dungeon_3","West_Dungeon_2"],["West_Dungeon_3","West_Dungeon_2"],["West_Dungeon_3","West_Dungeon_3"],["West_Dungeon_3","West_Dungeon_3"],["West_Dungeon_3","West_woods"],["West_Dungeon_3","West_Dungeon_2"],["West_Garden","West_Dungeon_1"],["West_Garden","West_Dungeon_1"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_Garden","West_Garden"],["West_woods","Caerlin_Woods"],["West_woods","Dragon_den"],["West_woods","Dragon_den"],["West_woods","Underkeep_Surroundings"],["West_woods","West_Dungeon_1"],["Wolf_den","Caerlin_Woods"]],
"travelStops": [{"map":"Caerlin_Woods","id":1241,"xy":[20,-35],"name":"凱爾林森林"},{"map":"East_Garden","id":925,"xy":[8,0],"name":"靈魂鍛造爐 - 東園"},{"map":"Starting_forest","id":2767,"xy":[7,-34],"name":"獠牙根森林"},{"map":"Swamp","id":518,"xy":[42,36],"name":"陰沼"},{"map":"Underkeep_Surroundings","id":1073,"xy":[4,-19],"name":"Underkeep 高塔外圍"},{"map":"Village_of_Underkeep","id":1072,"xy":[7,-9],"name":"Underkeep 村莊"},{"map":"West_woods","id":1403,"xy":[-13,-29],"name":"暮谷北部"},{"map":"West_woods","id":1402,"xy":[-1,15],"name":"暮谷矮人營地"}],
"objects": {
"acquisition_pedestal": {"type":"acquire","title":"事件物品取得點","detail":{"取得方式":"完成列出的劇情分支後，在此格位取得"},"sprite":"etile_item","rotation":0,"native":null,"nativeRotation":0},
"acquisition_scriptor": {"type":"acquire","title":"事件物品取得點","detail":{"取得方式":"完成列出的劇情分支後，在此格位取得"},"sprite":"etile_item","rotation":0,"native":null,"nativeRotation":0},
"altar1_ivy_green": {"type":"mechanism","title":"機關","sprite":"mtile_altar","rotation":0,"native":"mtile_altar","nativeRotation":0,"isChest":false},
"barrel1": {"type":"treasure","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"barrel1_moss": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"blocker": {"type":"mechanism","title":"機關","sprite":"etile_secret_wall","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"brazier3": {"type":"mechanism","title":"機關","sprite":"etile_brazier02","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"button1": {"type":"mechanism","title":"按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"button_skull": {"type":"mechanism","title":"骷髏按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"campfire2": {"type":"item","title":"火腿","detail":{"取得方式":"與營火互動後，撿起掉到地上的火腿。"},"sprite":"item_food_ham","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,2,"item_food_ham"]]},
"cave2_exit1": {"type":"passage","title":"上樓 → 凱爾林森林","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave2_pressure_plate": {"type":"mechanism","title":"壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"cave_door": {"type":"mechanism","title":"門／門機關","sprite":"mtile_door","native":"mtile_door","isChest":false},
"cave_exit1": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave_exit2_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"cave_gold_wall": {"type":"gold-vein","title":"含金岩壁","detail":{"所需物品":"金鑿子","可取得":"金礦石 ×1"},"sprite":"etile_golden_vein","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"所需物品":[[0,3,"item_gold_chisel"]],"可取得":[[0,3,"item_golden_ore"]]}},
"cave_pressure_plate_crown": {"type":"mechanism","title":"王冠壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_fire": {"type":"mechanism","title":"火焰壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_serpent": {"type":"mechanism","title":"蛇形壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_pressure_plate_tree": {"type":"mechanism","title":"樹形壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"cave_secret_button": {"type":"mechanism","title":"祕密按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"cave_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"cemetery_gate": {"type":"mechanism","title":"門／門機關","sprite":"mtile_door","native":"mtile_door","isChest":false},
"chest1": {"type":"treasure","title":"寶箱","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_locked": {"type":"treasure","title":"上鎖寶箱","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_moss": {"type":"treasure","title":"覆苔寶箱","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest1_moss_locked": {"type":"treasure","title":"上鎖的覆苔寶箱","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chest_mausoleum1": {"type":"treasure","title":"陵墓寶箱","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"chopping_block_axe": {"type":"treasure","title":"可搜尋容器","detail":{"戰利品":"短柄斧"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_hatchet"]]}},
"coffin": {"type":"treasure","title":"可搜尋容器","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"coffin_on_altar": {"rotation":0,"nativeRotation":0,"isChest":false},
"collapsed_rocks_cave": {"type":"rubble","title":"普通塌方","detail":{"所需物品":"鎬或強化鎬","互動效果":"敲開塌方，清出通道。"},"sprite":"mtile_collapsed_rocks","rotation":0,"native":"mtile_collapsed_rocks","nativeRotation":0,"isChest":false,"itemLinks":{"所需物品":[[0,1,"item_pickaxe"],[2,5,"item_pickaxe_hard"]]}},
"collapsed_rocks_cave_tough": {"type":"hard-rubble","title":"堅硬塌方","detail":{"所需物品":"強化鎬","互動效果":"敲開塌方，清出通道。"},"sprite":"collapsed_rocks_cave_tough","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"所需物品":[[0,3,"item_pickaxe_hard"]]}},
"collapsed_rocks_mine": {"type":"rubble","title":"普通塌方","detail":{"所需物品":"鎬或強化鎬","互動效果":"敲開塌方，清出通道。"},"sprite":"mtile_collapsed_rocks","rotation":0,"native":"mtile_collapsed_rocks","nativeRotation":0,"isChest":false,"itemLinks":{"所需物品":[[0,1,"item_pickaxe"],[2,5,"item_pickaxe_hard"]]}},
"crate1_moss": {"type":"treasure","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate2": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate2_moss": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate3": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate4": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"crate5": {"type":"treasure","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"display_text": {"type":"note","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dragon_territory": {"type":"note","title":"巨龍活動區","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_metal_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"isChest":false},
"dung_metal_door": {"type":"mechanism","title":"門／門機關","isChest":false},
"dung_metal_grate_door": {"type":"mechanism","title":"柵門","sprite":"mtile_door","native":"mtile_door","isChest":false},
"dung_metal_pressure_plate": {"type":"mechanism","title":"壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"dung_metal_secret_button": {"type":"mechanism","title":"祕密按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_metal_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_metal_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false},
"dung_metal_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false},
"dung_moss_secret_button": {"type":"mechanism","title":"祕密按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"dung_moss_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_outdoor_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"dung_outdoor_wall_secret": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_outdoor_wooden_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"isChest":false},
"dung_outdoor_wooden_door_1": {"type":"mechanism","title":"門／門機關","isChest":false},
"dung_swamp_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","nativeRotation":270,"isChest":false},
"dung_swamp_grate_door": {"type":"mechanism","title":"柵門","isChest":false},
"dung_swamp_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"dung_swamp_stairs_up": {"type":"passage","detail":{"洞口方向":"北"},"sprite":"mtile_passage","rotation":0,"native":"mtile_passage","nativeRotation":0,"isChest":false,"directExit":true},
"dung_swamp_wooden_door_1": {"type":"mechanism","title":"門／門機關","sprite":"mtile_door","native":"mtile_door","isChest":false},
"dwarf_npc": {"type":"service","title":"矮人","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"encounter_wizard_first_contact": {"type":"event","title":"法師初次現身","detail":{"關聯任務":"Underkeep 的低語","事件內容":"石室巨大。牆上覆滿古老符文。","條件選項":"扔出格爾格拉的魚。（持有 格爾格拉的魚）\n扔出托倫的藥水。（持有 不明酊劑）\n詢問守護者。\n問是誰在幕後。\n問必須做什麼。\n拒絕參與。"},"sprite":"hud_icon_quest_active","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"條件選項":[[2,8,"item_grgla_fish"],[13,19,"item_grgla_fish"],[23,28,"item_torren_tincture"],[33,37,"item_torren_tincture"]]},"dialogue":[["事件開場",["石室巨大。牆上覆滿古老符文。","祭壇立在中央。上方，法師一動不動地懸在空中。","他睜開眼。不是驚訝……而是認出了你。"],[]],["後續對話（依劇情進度）",["一股突如其來的壓力攫住你的心智。你無法抗拒。","法師搜查你的記憶。他看見守護者倒下，也知道是你殺了它。","聲音無聲而至，直接說進你心裡。","這座塔建在一道絕不可開啟的門之上。","四位守護者曾被託付鑰匙。","你殺了一位守護者。","石室牆上的符文閃爍，節奏斷裂。一聲深長的裂響在高塔中迴盪。","法師在祭壇上方升得更高，空氣在他周圍繃緊。","沒有談判。"],[]],["對話選項",[],["等等！（僅可選一次）","站定。（僅可選一次）","扔出格爾格拉的魚。（持有 格爾格拉的魚）","扔出托倫的藥水。（持有 不明酊劑）"]],["選擇「扔出托倫的藥水。」",["你把托倫的藥水擲向法師。","藥瓶在無形屏障上炸開，裡面的東西無害地灑在祭壇上。","法師甚至沒有理會你這可悲的嘗試。"],[]],["選擇「扔出格爾格拉的魚。」",["你扔出格爾格拉的魚。","它撞在無形的屏障上彈開，啪地一聲落在你腳邊。","它死寂的眼睛朝上望著你。某個地方，格爾格拉大概會不高興。"],[]],["選擇「等等！」",["你在法師臉上尋找猶豫。沒有。","在他眼裡，你們不再是旅人……只是一個已被判定的威脅。"],[]],["選擇「站定。」",["牆上的符文向內坍縮，光芒變得銳利而充滿敵意。"],[]],["選擇「扔出托倫的藥水。」",["力量湧過高塔。","法師以力量回應，空氣碎裂。"],[]],["後續對話（依劇情進度）",["一股突如其來的壓力攫住你的心智。你無法抗拒。","法師搜尋四位守護者時，它們的影像一幅幅閃過你的腦海。","四位守護者還活著。","法師緩緩落下，承認了你的存在。","說吧。"],[]],["對話選項",[],["問這裡發生了什麼。（僅可選一次）","詢問守護者。（依劇情進度、僅可選一次）","問是誰在幕後。（依劇情進度、僅可選一次）","問必須做什麼。（依劇情進度、僅可選一次）","拒絕參與。（依劇情進度、僅可選一次）","拔出武器。（僅可選一次）"]],["選擇「問這裡發生了什麼。」",["這座塔建在一道絕不可開啟的門之上。","那路曾以四把鑰匙封印，每一把都託付給一位守護者。","猩紅符文在他周圍的屏障上閃爍。","封印正在失效。"],[]],["選擇「詢問守護者。」",["守護者被塑造成看守那不可甦醒之物。","但封印已被突破。","他的存在更用力地壓向你的思緒。","他找到了傷口。"],[]],["選擇「問是誰在幕後。」",["曾經，他站在我身旁。","他了解這座塔。他知道下面有什麼。","如今他想打開那道門。","他不會回頭。"],[]],["選擇「問必須做什麼。」",["還有時間。","勉強。","他的存在穿過高塔延伸而來。","他在下面等著。","下去。阻止他。","我會跟上。"],[]],["選擇「拒絕參與。」",["符文閃耀，它們的審判已完成。","那麼你就是障礙。","障礙會被清除。"],[]],["選擇「拔出武器。」",["牆上的符文向內坍縮，光芒變得銳利而充滿敵意。","那就這樣吧。","力量湧過高塔。"],[]],["選擇「拒絕參與。」",["祭壇上猛地湧出一股暴烈的魔法波動。"],[]],["選擇「問必須做什麼。」",["說完這些話，法師瓦解，身形消散於虛無。","一陣深沉的震動貫穿高塔。","開始了。是時候了結這一切。"],[]]]},
"enemy_bee": {"enemyGuide":true,"type":"enemy","title":"虛空噬者","detail":{"戰利品":"毒囊（25%）","經驗值":"120","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,2,"item_venom_sac"]]}},
"enemy_blood_acolyte": {"enemyGuide":true,"type":"enemy","title":"猩紅沉眠者","detail":{"經驗值":"140"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_blood_golem": {"enemyGuide":true,"type":"enemy","title":"鮮血魔像","detail":{"經驗值":"300"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_brown_spider": {"enemyGuide":true,"type":"enemy","title":"風暴紡蛛","detail":{"戰利品":"蜘蛛眼（30%）","經驗值":"60","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_spider_eye"]]}},
"enemy_caerlin_wolf": {"enemyGuide":true,"type":"enemy","title":"獵爪","detail":{"戰利品":"狼牙（30%）","經驗值":"110","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,2,"item_wolf_tooth"]]}},
"enemy_dryad": {"enemyGuide":true,"type":"enemy","title":"枯木樹妖","sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_dungeon_skeleton": {"enemyGuide":true,"type":"enemy","title":"虛空之刃","detail":{"經驗值":"140","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_ghost": {"enemyGuide":true,"type":"enemy","title":"褪色者","detail":{"取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,2,"item_ingredient_ectoplasm"]]}},
"enemy_mushroom": {"enemyGuide":true,"type":"enemy","title":"菌裔","detail":{"經驗值":"130"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_orc_bandit": {"enemyGuide":true,"type":"enemy","title":"披甲半獸人戰士","detail":{"經驗值":"175","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_skeleton": {"enemyGuide":true,"type":"enemy","title":"骨刃","detail":{"取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_skeleton_archer": {"enemyGuide":true,"type":"enemy","title":"骨刃弓手","detail":{"經驗值":"70","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_spider": {"enemyGuide":true,"type":"enemy","title":"怒紡蛛","detail":{"戰利品":"蜘蛛眼（30%）","經驗值":"40","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_spider_eye"]]}},
"enemy_statue_guardian": {"enemyGuide":true,"type":"boss","title":"墮落守衛","detail":{"經驗值":"800"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_stoneclaw": {"enemyGuide":true,"type":"enemy","title":"魔爪","detail":{"經驗值":"150"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_swamp_boss": {"enemyGuide":true,"type":"boss","title":"那個東西","detail":{"經驗值":"300"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_swamp_tentacle1": {"enemyGuide":true,"type":"enemy","title":"觸手","detail":{"經驗值":"100"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_vampire_beetle": {"enemyGuide":true,"type":"enemy","title":"噬脈蟲","detail":{"戰利品":"蟲顎（25%）","經驗值":"130","取得方式":"擊敗或互動後掉落"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,2,"item_ingredient_mandibles"]]}},
"enemy_wyvern": {"enemyGuide":true,"type":"boss","title":"獠牙尖塔","detail":{"經驗值":"1500"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_corrupt_sword": {"enemyGuide":true,"type":"enemy","title":"墮落者","detail":{"經驗值":"120"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_pickaxe": {"enemyGuide":true,"type":"enemy","title":"受詛咒的掘墓者","detail":{"經驗值":"70"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"enemy_zombie_sword": {"enemyGuide":true,"type":"enemy","title":"倒下的劍士","detail":{"經驗值":"75"},"sprite":"mtile_enemy","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"fast_travel_portal": {"type":"travel","detail":{"使用方式":"互動後解鎖站點。持有傳送石可選擇已解鎖的站點。"},"sprite":"mtile_fast_travel_portal","rotation":0,"native":"mtile_fast_travel_portal","nativeRotation":0,"isChest":false,"itemLinks":{"使用方式":[[10,13,"item_teleport_stone"]]}},
"female_npc": {"type":"service","title":"村民","rotation":0,"nativeRotation":0,"isChest":false},
"flower1": {"type":"gather","title":"採集 · 緋峰漿果","detail":{"戰利品":"緋峰漿果"},"sprite":"item_flower_crimson_berries","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,4,"item_flower_crimsonspire_berries"]]},"titleLinks":[[5,9,"item_flower_crimsonspire_berries"]]},
"flower4": {"type":"gather","title":"採集 · 日輝花","detail":{"戰利品":"日輝花"},"sprite":"item_flower_solarbloom","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_flower_solarbloom"]]},"titleLinks":[[5,8,"item_flower_solarbloom"]]},
"flower5": {"type":"gather","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"flower6": {"type":"gather","title":"採集 · 月瓣花","detail":{"戰利品":"月瓣花"},"sprite":"item_flower_moonpetal","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_flower_moonpetal"]]},"titleLinks":[[5,8,"item_flower_moonpetal"]]},
"flower9": {"type":"gather","title":"採集 · 凱爾林藍花","detail":{"戰利品":"凱爾林藍花"},"sprite":"item_caerlin_blue_flowers","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,5,"item_caerlin_blue_flowers"]]},"titleLinks":[[5,10,"item_caerlin_blue_flowers"]]},
"forest_bush2_berry": {"type":"gather","title":"採集 · 野漿果","detail":{"戰利品":"野漿果"},"sprite":"item_wild_berries","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,3,"item_wild_berries"]]},"titleLinks":[[5,8,"item_wild_berries"]]},
"forest_cave_entrance": {"type":"passage","detail":{"洞口方向":"西"},"sprite":"mtile_passage","rotation":270,"native":"mtile_passage","nativeRotation":270,"isChest":false,"directExit":true},
"forest_grate_door": {"type":"mechanism","title":"柵門","isChest":false},
"forest_rock_wall_cave": {"type":"passage","sprite":"mtile_passage","isChest":false,"directExit":true},
"forest_rock_wall_cave_passage": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"forest_stone_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"forest_stone_wall_button": {"type":"mechanism","title":"按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"garbage1": {"type":"treasure","title":"可翻找的雜物","sprite":"mtile_chest","rotation":0,"native":"mtile_chest","nativeRotation":0,"isChest":true},
"grave1_with_txt": {"type":"mechanism","title":"機關","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave2_crumble": {"type":"mechanism","title":"機關","detail":{"互動提示":"墓碑在時間的重壓下崩裂了。"},"sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave2_with_txt": {"type":"mechanism","title":"機關","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"grave5_with_txt": {"type":"mechanism","title":"機關","sprite":"etile_grave","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"guard2_npc": {"type":"service","title":"守衛","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"invisible_passage": {"sprite":"mtile_passage","rotation":0,"nativeRotation":0,"isChest":false},
"invisible_pressure_plate": {"type":"trigger","title":"隱形感應板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"item_bones01": {"type":"junk","title":"斷裂的骨頭","detail":{"取得方式":"地面拾取"},"sprite":"item_bones1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,5,"item_bones01"]]},
"item_bones02": {"type":"junk","title":"塵土與碎骨","detail":{"取得方式":"地面拾取"},"sprite":"item_bones2","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,5,"item_bones02"]]},
"item_bones03": {"type":"junk","title":"骨頭","detail":{"取得方式":"地面拾取"},"sprite":"item_bones3","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,2,"item_bones03"]]},
"item_bones04": {"type":"junk","title":"塵土與碎骨","detail":{"取得方式":"地面拾取"},"sprite":"item_bones4","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,5,"item_bones04"]]},
"item_bones05": {"type":"junk","title":"頭骨","detail":{"取得方式":"地面拾取"},"sprite":"item_bones5","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,2,"item_bones05"]]},
"item_bones06": {"type":"junk","title":"塵土與碎骨","detail":{"取得方式":"地面拾取"},"sprite":"item_bones6","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,5,"item_bones06"]]},
"item_boulder": {"type":"junk","title":"岩石","detail":{"可取得":"岩石"},"sprite":"item_boulder","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_boulder"]]},"titleLinks":[[0,2,"item_boulder"]]},
"item_coins": {"type":"item","detail":{"取得方式":"地面拾取"},"sprite":"etile_coin","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"titleLinks":[[0,2,"item_coins"]]},
"item_crimson_ring": {"type":"item","title":"猩紅戒指","detail":{"可取得":"猩紅戒指"},"sprite":"item_crimson_ring","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_crimson_ring"]]},"titleLinks":[[0,4,"item_crimson_ring"]]},
"item_dagger": {"type":"item","title":"匕首","detail":{"可取得":"匕首"},"sprite":"item_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_dagger"]]},"titleLinks":[[0,2,"item_dagger"]]},
"item_diamond_green": {"type":"item","title":"祖母綠","detail":{"可取得":"祖母綠"},"sprite":"item_diamond_green","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_diamond_green"]]},"titleLinks":[[0,3,"item_diamond_green"]]},
"item_diamond_orange": {"type":"item","title":"石榴石","detail":{"可取得":"石榴石"},"sprite":"item_diamond_orange","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_diamond_orange"]]},"titleLinks":[[0,3,"item_diamond_orange"]]},
"item_empty_flask": {"type":"item","title":"空瓶","detail":{"可取得":"空瓶"},"sprite":"item_empty_flask","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_empty_flask"]]},"titleLinks":[[0,2,"item_empty_flask"]]},
"item_flower_solarbloom": {"type":"gather","title":"日輝花","detail":{"可取得":"日輝花"},"sprite":"item_flower_solarbloom","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_flower_solarbloom"]]},"titleLinks":[[0,3,"item_flower_solarbloom"]]},
"item_food_apple": {"type":"gather","title":"蘋果","detail":{"可取得":"蘋果"},"sprite":"item_apple","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_food_apple"]]},"titleLinks":[[0,2,"item_food_apple"]]},
"item_food_bread": {"type":"item","title":"麵包","detail":{"可取得":"麵包"},"sprite":"item_food_bread","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_food_bread"]]},"titleLinks":[[0,2,"item_food_bread"]]},
"item_food_bread_mold": {"type":"item","title":"發霉的麵包","detail":{"可取得":"發霉的麵包"},"sprite":"item_food_bread_moldy","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,5,"item_food_bread_mold"]]},"titleLinks":[[0,5,"item_food_bread_mold"]]},
"item_food_chees": {"type":"item","title":"奶酪","detail":{"可取得":"奶酪"},"sprite":"item_food_cheese","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_food_chees"]]},"titleLinks":[[0,2,"item_food_chees"]]},
"item_food_ham": {"type":"item","title":"火腿","detail":{"可取得":"火腿"},"sprite":"item_food_ham","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_food_ham"]]},"titleLinks":[[0,2,"item_food_ham"]]},
"item_food_ration": {"type":"item","title":"鼠糧","detail":{"可取得":"鼠糧"},"sprite":"item_food_ration","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_food_ration"]]},"titleLinks":[[0,2,"item_food_ration"]]},
"item_generic_ash": {"type":"junk","title":"灰燼","detail":{"可取得":"灰燼"},"sprite":"item_generic_ash","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_generic_ash"]]},"titleLinks":[[0,2,"item_generic_ash"]]},
"item_generic_broken_dagger": {"type":"junk","title":"斷裂的匕首","detail":{"可取得":"斷裂的匕首"},"sprite":"item_generic_broken_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,5,"item_generic_broken_dagger"]]},"titleLinks":[[0,5,"item_generic_broken_dagger"]]},
"item_hand_axe": {"type":"item","title":"手斧","detail":{"可取得":"手斧"},"sprite":"item_axe_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_hand_axe"]]},"titleLinks":[[0,2,"item_hand_axe"]]},
"item_hardened_armor": {"type":"item","title":"硬化護甲","detail":{"可取得":"硬化護甲"},"sprite":"item_armor_hardened","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_hardened_armor"]]},"titleLinks":[[0,4,"item_hardened_armor"]]},
"item_heal_potion": {"type":"item","title":"治療藥水","detail":{"可取得":"治療藥水"},"sprite":"item_potion_heal_medium","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_heal_potion"]]},"titleLinks":[[0,4,"item_heal_potion"]]},
"item_ingredient_mandibles": {"type":"item","title":"蟲顎","detail":{"可取得":"蟲顎"},"sprite":"item_ingredient_mandibles","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_ingredient_mandibles"]]},"titleLinks":[[0,2,"item_ingredient_mandibles"]]},
"item_key_lockpick": {"type":"item","title":"開鎖工具","detail":{"可取得":"開鎖工具"},"sprite":"item_lockpicks","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_key_lockpick"]]},"titleLinks":[[0,4,"item_key_lockpick"]]},
"item_leather_boots": {"type":"item","title":"皮靴","detail":{"可取得":"皮靴"},"sprite":"item_boots_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_leather_boots"]]},"titleLinks":[[0,2,"item_leather_boots"]]},
"item_leather_gloves": {"type":"item","title":"皮手套","detail":{"可取得":"皮手套"},"sprite":"item_gloves_leather","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_leather_gloves"]]},"titleLinks":[[0,3,"item_leather_gloves"]]},
"item_leather_helmet": {"type":"item","title":"皮頭盔","detail":{"可取得":"皮頭盔"},"sprite":"item_helmet_01","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_leather_helmet"]]},"titleLinks":[[0,3,"item_leather_helmet"]]},
"item_minor_endurance_potion": {"type":"item","title":"次級體力藥水","detail":{"可取得":"次級體力藥水"},"sprite":"item_potion_stamina_small","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,6,"item_minor_endurance_potion"]]},"titleLinks":[[0,6,"item_minor_endurance_potion"]]},
"item_mushroom1": {"type":"gather","title":"蘑菇","detail":{"可取得":"蘑菇"},"sprite":"item_mushroom_yellow","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_mushroom1"]]},"titleLinks":[[0,2,"item_mushroom1"]]},
"item_mushroom_blue": {"type":"gather","title":"藍蘑菇","detail":{"可取得":"藍蘑菇"},"sprite":"item_mushroom_blue","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_mushroom_blue"]]},"titleLinks":[[0,3,"item_mushroom_blue"]]},
"item_mushroom_red": {"type":"gather","title":"紅蘑菇","detail":{"可取得":"紅蘑菇"},"sprite":"item_mushroom_red","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_mushroom_red"]]},"titleLinks":[[0,3,"item_mushroom_red"]]},
"item_pickaxe": {"type":"item","title":"鎬","detail":{"可取得":"鎬"},"sprite":"item_pickaxe","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,1,"item_pickaxe"]]},"titleLinks":[[0,1,"item_pickaxe"]]},
"item_potion_cure_poison": {"type":"item","title":"解毒藥水","detail":{"可取得":"解毒藥水"},"sprite":"item_potion_cure_poison","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_potion_cure_poison"]]},"titleLinks":[[0,4,"item_potion_cure_poison"]]},
"item_potion_poison": {"type":"item","title":"毒藥水","detail":{"可取得":"毒藥水"},"sprite":"item_potion_poison","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_potion_poison"]]},"titleLinks":[[0,3,"item_potion_poison"]]},
"item_recipe_endurance_dvojka": {"type":"item","title":"體力藥水（配方）","detail":{"可取得":"體力藥水（配方）"},"sprite":"item_recipe","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,8,"item_recipe_endurance_dvojka"]]},"titleLinks":[[0,8,"item_recipe_endurance_dvojka"]]},
"item_respec_potion": {"type":"item","title":"遺忘藥水","detail":{"可取得":"遺忘藥水"},"sprite":"item_potion_respec","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_respec_potion"]]},"titleLinks":[[0,4,"item_respec_potion"]]},
"item_rusty_dagger": {"type":"item","title":"生鏽的匕首","detail":{"可取得":"生鏽的匕首"},"sprite":"item_rusty_dagger","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,5,"item_rusty_dagger"]]},"titleLinks":[[0,5,"item_rusty_dagger"]]},
"item_rusty_great_axe": {"type":"item","title":"生鏽的巨斧","detail":{"可取得":"生鏽的巨斧"},"sprite":"item_axe_06","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,5,"item_rusty_great_axe"]]},"titleLinks":[[0,5,"item_rusty_great_axe"]]},
"item_rusty_hand_axe": {"type":"item","title":"生鏽的手斧","detail":{"可取得":"生鏽的手斧"},"sprite":"item_axe_04","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,5,"item_rusty_hand_axe"]]},"titleLinks":[[0,5,"item_rusty_hand_axe"]]},
"item_rusty_scale_helmet": {"type":"item","title":"生鏽的鱗片頭盔","detail":{"可取得":"生鏽的鱗片頭盔"},"sprite":"item_helmet_scale_rusty","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,7,"item_rusty_scale_helmet"]]},"titleLinks":[[0,7,"item_rusty_scale_helmet"]]},
"item_rusty_sword": {"type":"item","title":"生鏽的劍","detail":{"可取得":"生鏽的劍"},"sprite":"item_rusty_sword","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_rusty_sword"]]},"titleLinks":[[0,4,"item_rusty_sword"]]},
"item_scroll_underkeep_letter_blood": {"type":"item","title":"染血的信","detail":{"可取得":"染血的信"},"sprite":"item_scroll_blood","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_scroll_underkeep_letter_blood"]]},"titleLinks":[[0,4,"item_scroll_underkeep_letter_blood"]]},
"item_tattered_robe": {"type":"item","title":"破爛長袍","detail":{"可取得":"破爛長袍"},"sprite":"item_robe_tattered","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,4,"item_tattered_robe"]]},"titleLinks":[[0,4,"item_tattered_robe"]]},
"item_wooden_shield": {"type":"item","title":"木盾","detail":{"可取得":"木盾"},"sprite":"item_wooden_shield","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,2,"item_wooden_shield"]]},"titleLinks":[[0,2,"item_wooden_shield"]]},
"level_portal1_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"level_portal2_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"level_portal3_grass": {"type":"passage","sprite":"mtile_exit","rotation":0,"native":"mtile_exit","nativeRotation":0,"isChest":false,"directExit":true},
"lever1": {"type":"mechanism","title":"拉桿","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"map_location": {"type":"location","sprite":"etile_map_location","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mausoleum_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"mausoleum_door": {"type":"mechanism","title":"門／門機關","isChest":false},
"mausoleum_grate_door": {"type":"mechanism","title":"柵門","isChest":false},
"mausoleum_secret_button": {"type":"mechanism","title":"祕密按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mausoleum_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"mausoleum_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mausoleum_stairs_up": {"type":"passage","detail":{"洞口方向":"東"},"sprite":"mtile_passage","rotation":90,"native":"mtile_passage","nativeRotation":90,"isChest":false,"directExit":true},
"mausoleum_wooden_door_2": {"type":"mechanism","title":"門／門機關","sprite":"mtile_door","native":"mtile_door","isChest":false},
"mine_alcove": {"type":"treasure","title":"牆龕","sprite":"mtile_alcove","rotation":0,"native":"mtile_alcove","isChest":false},
"mine_door": {"type":"mechanism","title":"門／門機關","isChest":false},
"mine_forest_entrance": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mine_pressure_plate": {"type":"mechanism","title":"壓力板","sprite":"mtile_pressure_plate","rotation":0,"native":"mtile_pressure_plate","nativeRotation":0,"isChest":false},
"mine_secret_button": {"type":"mechanism","title":"祕密按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"mine_secret_wall": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"mine_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"mud_tile": {"type":"trap","title":"泥濘地塊","sprite":"mtile_mud","rotation":0,"native":"mtile_mud","nativeRotation":0,"isChest":false},
"no_automap_area": {"type":"note","title":"自動地圖停用區","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"obelisk": {"type":"mechanism","title":"機關","sprite":"mtile_statue","rotation":0,"native":"mtile_statue","nativeRotation":0,"isChest":false},
"pedestal": {"type":"treasure","title":"基座","sprite":"etile_pedestal","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_caerlin": {"type":"trap","sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_cave2_outfall": {"type":"note","title":"天花板洞口","detail":{"用途":"關卡中的天花板開口。"},"sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_cave_outfall": {"type":"note","sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_cave_outfall_large_sun": {"type":"note","title":"天花板洞口","detail":{"用途":"關卡中的天花板開口。"},"sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"pit_dung_metal": {"sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_grass": {"detail":{"初始狀態":"關閉"},"sprite":"mtile_pit","rotation":0,"native":"mtile_pit","nativeRotation":0,"isChest":false},
"pit_mine_outfall": {"type":"note","sprite":"etile_pit_exit","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"rake_in_grass": {"type":"trap","title":"草叢裡的耙子","detail":{"可取得":"掉在隊伍附近 耙子"},"sprite":"item_rake","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[7,9,"item_rake"]]}},
"red_mausoleum_door": {"type":"mechanism","title":"門／門機關","isChest":false},
"red_mausoleum_grate_door": {"type":"mechanism","title":"柵門","isChest":false},
"red_mausoleum_stairs_up": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"red_sarcophagus1": {"rotation":0,"nativeRotation":0,"isChest":false},
"resurrect_shrine": {"type":"service","title":"復活祭壇","sprite":"mtile_shrine","rotation":0,"native":"mtile_shrine","nativeRotation":0,"isChest":false},
"resurrect_shrine_no_grass": {"type":"service","title":"復活祭壇","sprite":"mtile_shrine","rotation":0,"native":"mtile_shrine","nativeRotation":0,"isChest":false},
"road_sign1": {"type":"mechanism","title":"機關","sprite":"etile_boulder","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"sarcophagus1": {"type":"treasure","title":"可搜尋容器","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"sarcophagus2": {"rotation":0,"nativeRotation":0,"isChest":false},
"scriptor": {"type":"trigger","sprite":"etile_pressure_plate","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"shallow_grave_dirt": {"type":"treasure","title":"可搜尋容器","detail":{"戰利品":"7.69%（常見表） · 斷裂的骨頭、塵土與碎骨（1）、骨頭、塵土與碎骨（2）、頭骨、塵土與碎骨（3）\n3.39%（常見表／特殊池） · 金幣 ×1（常見表）／×5–6（特殊池）\n2.98%（常見表／特殊池） · 空啤酒瓶\n2.56%（常見表） · 空瓶、琥珀玫瑰、緋峰漿果、月瓣花、日輝花、發霉的麵包、落灰的蘋果核、一罐泥、次級體力藥水、次級治療藥水、次級法力藥水、蘑菇、紅蘑菇、生鏽的劍\n0.5%（稀有池） · 巴爾杜蘭勳章、達魯的梳子、屠夫的鏽鉤、巫妖王的襪子、強效治療藥水、復活藥水\n0.41%（特殊池） · 那隻眼睛、斷裂的匕首、損壞的讀檔魔杖、舊硬幣、銅戒指、死老鼠、黯淡護符、空神燈、空治療瓶、浩克的手指、鼠王的金牙、金屬紐扣、長苔的舊鑰匙、斷釘、無用智慧卷軸（1）、無用智慧卷軸（2）、無用智慧卷軸（3）、無用智慧卷軸（4）、小棺材、食人魔的牙、樹枝十字","取得方式":"持有鏟子並消耗 1 份食物挖掘","掉落規則":"以下為初始機率。特殊池和稀有池的項目抽出後，會從各自的池中移除。稀有池耗盡時改抽特殊池，特殊池耗盡時改抽常見表。"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"取得方式":[[2,4,"item_shovel"]],"戰利品":[[13,18,"item_bones01"],[19,27,"item_bones02"],[28,30,"item_bones03"],[31,39,"item_bones04"],[40,42,"item_bones05"],[43,51,"item_bones06"],[69,71,"item_coins"],[107,111,"item_generic_beer_bottle"],[125,127,"item_empty_flask"],[128,132,"item_flower_amberrose"],[133,137,"item_flower_crimsonspire_berries"],[138,141,"item_flower_moonpetal"],[142,145,"item_flower_solarbloom"],[146,151,"item_food_bread_mold"],[152,158,"item_generic_dusty_apple_core"],[159,162,"item_generic_jar_of_mud"],[163,169,"item_minor_endurance_potion"],[170,176,"item_minor_heal_potion"],[177,183,"item_minor_mana_potion"],[184,186,"item_mushroom1"],[187,190,"item_mushroom_red"],[191,195,"item_rusty_sword"],[208,214,"item_generic_balduran_medail"],[215,220,"item_generic_daroou_hairbrush"],[221,226,"item_generic_rusty_hook_of_butcher"],[227,233,"item_generic_sock_of_lich_king"],[234,240,"item_mega_heal_potion"],[241,245,"item_potion_resurrection"],[259,263,"item_eye"],[264,269,"item_generic_broken_dagger"],[270,277,"item_generic_broken_wand_of_save_scumming"],[278,281,"item_generic_coin"],[282,285,"item_generic_copper_ring"],[286,289,"item_generic_dead_mouse"],[290,294,"item_generic_dull_amulet"],[295,298,"item_generic_empty_djinn"],[299,303,"item_generic_empty_flask_of_healing"],[304,309,"item_generic_giant_finger"],[310,315,"item_generic_golden_tooth_of_rat_king"],[316,320,"item_generic_metal_button"],[321,327,"item_generic_moss_key"],[328,330,"item_generic_nails"],[331,340,"item_generic_scroll_useless_wisdom"],[341,350,"item_generic_scroll_useless_wisdom2"],[351,360,"item_generic_scroll_useless_wisdom3"],[361,370,"item_generic_scroll_useless_wisdom4"],[371,374,"item_generic_tiny_coffin"],[375,380,"item_generic_tooth"],[381,385,"item_generic_twig_cross"]]}},
"simple_trigger": {"type":"trigger","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_egg": {"type":"treasure","title":"可搜尋容器","detail":{"戰利品":"33.33% · 出現怒紡蛛\n25% · 金幣 ×1–5\n9.17% · 斷裂的骨頭 ×1–4、塵土與碎骨（1） ×1–4、骨頭 ×1–4、塵土與碎骨（2） ×1–4、頭骨 ×1–4\n5.56% · 空瓶、發霉的麵包、次級體力藥水、次級治療藥水、次級法力藥水、生鏽的劍","取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[21,23,"item_coins"],[37,42,"item_bones01"],[48,56,"item_bones02"],[62,64,"item_bones03"],[70,78,"item_bones04"],[84,86,"item_bones05"],[100,102,"item_empty_flask"],[103,108,"item_food_bread_mold"],[109,115,"item_minor_endurance_potion"],[116,122,"item_minor_heal_potion"],[123,129,"item_minor_mana_potion"],[130,134,"item_rusty_sword"]]}},
"slime_small_egg1": {"type":"trigger","title":"觸發點","detail":{"感應對象":"隊伍"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg2": {"type":"trigger","title":"觸發點","detail":{"感應對象":"隊伍"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg3": {"type":"trigger","title":"觸發點","detail":{"感應對象":"隊伍"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"slime_small_egg4": {"type":"trigger","title":"觸發點","detail":{"感應對象":"隊伍"},"sprite":"etile_slime_small_egg","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"spawner": {"type":"trigger","title":"生成點","sprite":"etile_pressure_plate","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"statue_gargoyle_hint": {"type":"mechanism","title":"機關","sprite":"mtile_statue","rotation":0,"native":"mtile_statue","nativeRotation":0,"isChest":false},
"table1_props": {"type":"treasure","title":"可打破容器","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"torch1": {"type":"mechanism","title":"機關","sprite":"torch1_side","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"torren_npc_friendly": {"type":"service","title":"托倫·馬利克","rotation":0,"nativeRotation":0,"isChest":false},
"tower_button": {"type":"mechanism","title":"按鈕","sprite":"etile_lever","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tower_door_silver": {"type":"mechanism","title":"門／門機關","rotation":0,"nativeRotation":0,"isChest":false},
"tower_door_stone": {"type":"mechanism","title":"門／門機關","isChest":false},
"tower_grate_door_silver": {"type":"mechanism","title":"柵門","sprite":"mtile_door","native":"mtile_door","isChest":false},
"tower_stairs_down": {"type":"passage","sprite":"mtile_passage","native":"mtile_passage","isChest":false,"directExit":true},
"tower_stairs_up": {"type":"passage","detail":{"洞口方向":"南"},"sprite":"mtile_passage","rotation":180,"native":"mtile_passage","nativeRotation":180,"isChest":false,"directExit":true},
"tower_surroundings_gate_door": {"type":"mechanism","title":"門／門機關","detail":{"初始狀態":"關閉"},"sprite":"mtile_door","native":"mtile_door","isChest":false},
"tower_teleport": {"type":"travel","title":"地圖內傳送點","sprite":"mtile_teleport","rotation":0,"native":"mtile_teleport","nativeRotation":0,"isChest":false},
"tower_wall_rich3_secret": {"type":"secret","title":"暗門／祕密牆","sprite":"secret_wall_tile","rotation":0,"native":"secret_wall_tile","nativeRotation":0,"isChest":false},
"tree_oak1_with_hide": {"type":"treasure","title":"可搜尋容器","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tree_stump_large1_hide": {"type":"treasure","title":"可搜尋容器","sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"戰利品":[[0,2,"item_coins"]]}},
"trigger_play_sound": {"type":"trigger","title":"聲音觸發點","sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"trigger_play_sound_secret": {"type":"secret","title":"祕密發現點","sprite":"mtile_symbol_default","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"tutorial_hint": {"type":"note","title":"教學提示","detail":{"觸發次數":"一次"},"sprite":"etile_text","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn1": {"type":"treasure","title":"陶罐","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn2": {"type":"treasure","title":"陶罐","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"urn3": {"type":"treasure","title":"陶罐","detail":{"取得方式":"打破後取得"},"sprite":"urn1","rotation":0,"native":null,"nativeRotation":0,"isChest":false},
"wizard_npc_friendly": {"type":"service","title":"大法師","sprite":"mtile_enemy_friend","rotation":0,"nativeRotation":0,"isChest":false},
"wizard_npc_illu": {"type":"service","title":"大法師的幻影","detail":{"初始狀態":"尚未現身"},"sprite":"mtile_enemy_friend","rotation":0,"native":null,"nativeRotation":0,"isChest":false}
}
};
