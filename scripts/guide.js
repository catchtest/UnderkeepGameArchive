'use strict';

const guideNav = [...document.querySelectorAll('#sections a[data-title]')];
const guideSections = Object.fromEntries(guideNav.map(link => [link.hash.slice(1), link.dataset.title]));

function underkeepGuideSection(key) {
  if (key === 'skills') return 'classes';
  if (key === 'equipment') return 'items';
  return Object.hasOwn(guideSections, key) ? key : 'races';
}

function mountUnderkeepGuide(signal, refresh) {
  const { data: guide, spriteIcon, route, placeLabel, entryLinks, heading, facts, attributeText, attributeElement,
    itemsById, enemiesById, artImage, inventoryIcon, coinPrice, catalogTypes, renderDetail } = guideDetails;
  const node = underkeepElement;
  const $ = id => document.getElementById(id);
  let allEffects;
  let weaponSubtypes;
  // Inventory categories in game order, with the guide's more detailed item types.
  const itemCategories = {
    武器: ['武器'],
    護甲: ['盾牌', '身體護甲', '頭部', '手部', '足部', '披風'],
    飾品: ['戒指', '護身符', '腰帶'],
    藥水: ['藥水'],
    消耗品: ['消耗品'],
    食物: ['食物'],
    鑰匙: ['鑰匙'],
    其他: ['雜物', '書籍與卷軸', '骸骨', '工具', '合成材料', '任務物品', '貨幣'],
    配方: ['配方卷軸']
  };
  let itemCategory;
  let itemSubtype = '';
  function subtypeOf(item) {
    return item.group === '武器' ? item.facts.find(([key]) => key === '武器類型')?.[1] : item.group;
  }
  const itemSubtypes = {
    get 武器() {
      return weaponSubtypes ??= [...new Set(guide.items.filter(item => item.group === '武器').map(subtypeOf))];
    },
    護甲: itemCategories.護甲,
    飾品: itemCategories.飾品
  };
  const catalogDialogs = [];
  let dismissingCatalogDialog = false;
  const catalogQuery = $('item-query');
  bindUnderkeepSearch(catalogQuery, signal);
  const catalogs = {
    items: { placeholder: '搜尋物品、地點或取得方式', thumbnail: r => itemSlot(r.icon) },
    enemies: { placeholder: '搜尋敵人、技能、抗性或地點', thumbnail: enemyThumbnail },
    quests: { placeholder: '搜尋任務、解法、結局或地點' }
  };
  const mapId = new URLSearchParams(location.search).get('map');
  if (Object.hasOwn(underkeepMapNames, mapId)) $('to-map').hash = mapId;
  let section;
  const article = $('detail');

  function table(rows) {
    const wrap = node('div', undefined, 'table-scroll');
    const grid = node('table');
    const head = grid.createTHead().insertRow();
    rows[0].forEach(value => {
      const th = node('th');
      th.append(attributeText(value));
      th.scope = 'col';
      head.append(th);
    });
    const body = grid.createTBody();
    for (const values of rows.slice(1)) {
      const row = body.insertRow();
      const th = node('th');
      th.scope = 'row';
      th.append(attributeText(values[0] ?? ''));
      row.append(th);
      values.slice(1).forEach(value => row.insertCell().append(attributeText(value)));
    }
    wrap.append(grid);
    return wrap;
  }

  function sources(article, r, title = section === 'recipes' && r.group === '研缽合成' ? '配方卷軸取得地點' : '取得方式與地點', sourceRoute = route(section, r)) {
    guideDetails.sources(article, r, title, sourceRoute, { acquisition: section === 'recipes' });
  }

  const searchIndex = new WeakMap();
  function searchable(r) {
    if (!searchIndex.has(r)) {
      const fields = [r.name, r.english, r.group, r.intro, r.notes, ...r.facts.flat(), ...(r.hiddenEffects || []),
        ...(r.steps || []), ...(r.ingredients || []).flat(), ...(r.table || []).flat()];
      if (r.endingIds?.length) {
        fields.push('遊戲結局', ...(r.endingNotes || []));
        for (const id of r.endingIds) {
          const { name, condition } = guide.endings[id];
          fields.push(name, condition);
        }
      }
      if (r.attacks) {
        fields.push(...r.resist.flat(), ...r.abilities,
          ...r.immunities.map(key => '免疫' + guide.combatStatuses[key].name));
        for (const attack of r.attacks) {
          fields.push(attack.name, ...attack.facts.flat(), ...attack.effects.map(([key]) => guide.combatStatuses[key].name));
        }
      }
      for (const [how, mid, id] of r.sources || []) fields.push(how, mid && placeLabel(mid, id).join(''));
      for (const [how, mid, id] of r.uses || []) fields.push(how, mid && placeLabel(mid, id).join(''));
      for (const [id, methods] of r.enemyDrops || []) {
        const enemy = enemiesById.get(id);
        fields.push('敵人掉落', enemy.name, enemy.english, ...methods);
      }
      searchIndex.set(r, fields.join(' ').toLocaleLowerCase());
    }
    return searchIndex.get(r);
  }

  function framedSkill(skill) {
    const image = node('span', '', 'skill-art');
    image.setAttribute('aria-hidden', 'true');
    image.style.setProperty('--col', skill.frame % 10);
    image.style.setProperty('--row', Math.floor(skill.frame / 10));
    return image;
  }

  function portrait(index) {
    const image = node('span', '', 'portrait');
    image.style.backgroundPosition = -(index % 12 * 60) + 'px ' + -(Math.floor(index / 12) * 70) + 'px';
    image.setAttribute('aria-hidden', 'true');
    return image;
  }

  function faceGallery(r) {
    const gallery = node('section', undefined, 'panel face-gallery');
    gallery.append(node('h3', '可用頭像'));
    for (const supporter of [false, true]) {
      const faces = guide.faces.map((face, index) => ({face, index}))
        .filter(({face}) => face.supporter === supporter && face.races.includes(r.id));
      if (!faces.length) continue;
      gallery.append(node('h4', supporter ? '支持者 DLC' : '基本頭像'));
      const grid = node('div', undefined, 'face-grid');
      faces.forEach(({index}, i) => {
        const tile = node('span', undefined, 'face-tile');
        tile.setAttribute('role', 'img');
        tile.setAttribute('aria-label', r.name + (supporter ? '支持者' : '') + '頭像 ' + (i + 1));
        tile.append(portrait(index));
        grid.append(tile);
      });
      gallery.append(grid);
    }
    return gallery;
  }

  function traitNames(trait, nameTag = 'strong') {
    const names = node('div', undefined, 'trait-names');
    names.append(node(nameTag, trait.name), node('small', trait.english));
    return names;
  }

  function linkTo(group, record, className, selected) {
    const a = node('a', undefined, className);
    a.href = route(group, record);
    if (selected) a.setAttribute('aria-current', 'true');
    return a;
  }

  function showTraits() {
    allEffects ??= [
      ...guide.races.flatMap(race => race.traits.map(trait => ({
        ...trait, race, group: '種族特性', effects: [trait.effect]
      }))),
      ...guide.mutations,
      ...guide.statusEffects
    ];
    const terms = queryTerms();
    const panels = document.createDocumentFragment();
    const grids = new Map();
    for (const effect of allEffects) {
      const {group, race} = effect;
      const text = [effect.name, effect.english, group, race?.name, effect.rare ? '稀有' : '', ...effect.effects].join(' ').toLocaleLowerCase();
      if (!terms.every(term => text.includes(term))) continue;
      if (!grids.has(group)) {
        const panel = node('section', undefined, 'panel');
        const grid = node('div', undefined, 'mutation-grid');
        panel.append(node('h2', group), grid);
        panels.append(panel);
        grids.set(group, grid);
      }
      const card = node('div', undefined, 'mutation-card');
      const title = node('div', undefined, 'mutation-title');
      title.append(spriteIcon(guide.effectRects[effect.icon], 'icon effect-icon'), traitNames(effect));
      if (race) {
        const link = node('a', race.name);
        link.href = route('races', race);
        title.append(link);
      }
      if (effect.rare) title.append(node('span', '稀有', 'rarity'));
      card.append(title, ...effect.effects.map(line => attributeElement('p', line)));
      grids.get(group).append(card);
    }
    article.replaceChildren(grids.size ? panels : node('p', '查無符合的效果。', 'panel empty'));
  }

  function characterChoices(records, selected, isRace) {
    const group = isRace ? 'races' : 'classes';
    const items = records.map(r => {
      const a = linkTo(group, r, 'character', r === selected);
      const image = isRace ? portrait(guide.faces.findIndex(face => face.id === r.icon)) : framedSkill(guide.skills.find(s => s.group === r.name && s.icon === r.icon));
      a.append(image, node('b', r.name, 'character-name'));
      return a;
    });
    $('choices').replaceChildren(...items);
  }

  function startingRanges(race, job) {
    const raceFacts = Object.fromEntries(race.facts);
    const jobFacts = Object.fromEntries(job.facts);
    const [primary, primaryRange] = jobFacts['主屬性起始範圍'].split(' ');
    const [bonusStat, bonusValue] = (jobFacts['額外加成'] || '').split(' ');
    const bonus = Number(bonusValue || 0);
    const stats = race.table.slice(1).map(([name, range, modifier]) => {
      const isPrimary = name === primary;
      const [min, max] = (isPrimary ? primaryRange : range).split('–').map(Number);
      const offset = isPrimary ? Number(modifier) : 0;
      return { name, min: min + offset, max: max + offset };
    });
    const [raceMin, raceMax] = raceFacts['屬性總值範圍'].split('–').map(Number);
    const minSum = stats.reduce((sum, stat) => sum + stat.min, 0);
    const maxSum = stats.reduce((sum, stat) => sum + stat.max, 0);
    const totalMin = Math.max(raceMin, minSum);
    const totalMax = Math.min(raceMax, maxSum);
    const formatRange = (min, max) => min === max ? String(min) : min + '–' + max;
    // The other three rolls must still fit the race's total before the fixed class bonus.
    const ranges = stats.map(({ name, min, max }) => {
      const extra = name === bonusStat ? bonus : 0;
      return formatRange(Math.max(min, totalMin - (maxSum - max)) + extra,
        Math.min(max, totalMax - (minSum - min)) + extra);
    });
    const hp = Number(raceFacts['生命加成']) + Number(jobFacts['生命修正']);
    return [...ranges, formatRange(totalMin + bonus, totalMax + bonus), hp > 0 ? '+' + hp : String(hp)];
  }

  function showCharacterPanels(bio, r, otherPanel) {
    const isJob = section === 'classes';
    const group = isJob ? '種族' : '職業';
    const race = isJob ? guide.races[0] : r;
    const labels = race.table.slice(1).map(([name]) => name);
    const rows = isJob
      ? guide.races.map(race => [race.name, ...startingRanges(race, r)])
      : guide.classes.map(job => [job.name, ...startingRanges(r, job)]);
    const panel = node('section', undefined, 'panel starting-ranges');
    panel.append(node('h3', '各' + group + '起始屬性'), table([[group, ...labels, '屬性總值', '生命加成'], ...rows]),
      node('p', '四項屬性合計須落在該列的總值範圍內。生命加成為種族與職業的生命修正合計。', 'range-note'),
      node('p', '表中範圍依種族與職業定義推算，尚未在遊戲中驗證。', 'range-note'));
    const side = node('div', undefined, 'character-side');
    side.append(panel, otherPanel);
    article.replaceChildren(bio, side);
  }

  function showRace(r) {
    characterChoices(guide.races, r, true);
    const bio = node('section', undefined, 'panel race-bio');
    const title = heading(r.name, r.english);
    const levels = node('button', '升級經驗', 'guide-action levels-trigger');
    levels.type = 'button';
    levels.setAttribute('aria-haspopup', 'dialog');
    levels.setAttribute('aria-controls', 'levels-dialog');
    levels.addEventListener('click', () => {
      const dialog = $('levels-dialog');
      const body = dialog.querySelector('.dialog-body');
      if (!body.querySelector('table')) {
        const rows = guide.xp.map((total, i) => [i + 1,
          underkeepXp(i ? total - guide.xp[i - 1] : 0, false), underkeepXp(total, false)]);
        body.append(table([['角色等級', '升至此級所需經驗', '累積經驗值'], ...rows]));
      }
      dialog.showModal();
    });
    title.append(levels);
    bio.append(title, node('p', r.lore, 'character-lore'), attributeElement('p', r.intro, 'intro'));
    for (const trait of r.traits) {
      const card = node('section', undefined, 'race-trait');
      const effect = node('p');
      effect.append(underkeepXpText(trait.effect, attributeText));
      card.append(traitNames(trait, 'h3'), effect);
      bio.append(card);
    }
    bio.append(facts(r.facts));
    const attributes = node('section', undefined, 'race-stats');
    attributes.append(node('h3', '起始屬性'), table(r.table.map(row => row.slice(0, 2))));
    bio.append(attributes);
    showCharacterPanels(bio, r, faceGallery(r));
  }

  function showClass(r, skill) {
    characterChoices(guide.classes, r, false);
    const skills = guide.skills.filter(s => s.group === r.name);
    const selected = skill || skills[0];
    const summary = node('section', undefined, 'panel class-summary');
    const classFacts = r.facts.filter(([label, value]) => label !== '體力修正' || Number(value) !== 0);
    summary.append(heading(r.name, r.english), node('p', r.lore, 'character-lore'),
      attributeElement('p', r.intro, 'intro'), facts(classFacts));

    const board = node('nav', undefined, 'skill-board');
    board.setAttribute('aria-label', r.name + '技能');
    for (const kind of ['主動','光環','被動']) {
      const members = skills.filter(s => s.kind === kind);
      if (!members.length) continue;
      const group = node('section', undefined, 'skill-group');
      group.append(node('h3', kind));
      const tiles = node('div', undefined, 'skill-grid');
      for (const s of members) {
        const a = linkTo('skills', s, 'skill-tile', s === selected);
        a.append(framedSkill(s), node('span', s.name), node('small', 'Lv. ' + s.unlock));
        tiles.append(a);
      }
      group.append(tiles);
      board.append(group);
    }
    summary.append(board);
    const detail = node('section', undefined, 'panel skill-detail');
    const title = heading(selected.name, selected.english, framedSkill(selected), undefined, 'h3');
    title.append(node('span', selected.kind, 'kind'));
    detail.append(title, attributeElement('p', selected.intro, 'intro'),
      facts(selected.facts.filter(([label]) => !['類型', '技能上限', '升級條件'].includes(label))),
      node('h4', '各級效果'), table(selected.table));
    if (selected.notes) detail.append(attributeElement('p', selected.notes, 'notes'));
    showCharacterPanels(summary, r, detail);
  }

  function recipeChoices(selected) {

    const groups = [...new Set(guide.recipes.map(r => r.group))];
    $('choices').replaceChildren(...groups.map(group => {
      const a = linkTo('recipes', guide.recipes.find(r => r.group === group), 'chapter', selected === group);
      a.textContent = group;
      return a;
    }));
  }

  function itemSlot(key) {
    const slot = node('span', undefined, 'item-slot');
    if (key) slot.append(inventoryIcon(key));
    return slot;
  }

  function enemyThumbnail(record) {
    const frame = node('span', undefined, 'enemy-thumb');
    frame.append(artImage(record.art, undefined, 'lazy'));
    return frame;
  }

  function materialSlots(r) {
    return r.ingredients.flatMap(([name, quantity]) => name === '金幣'
      ? [{name, label: quantity + ' 金幣'}]
      : Array.from({length: quantity}, () => ({name, label: name})));
  }

  function recipeItemLink(recipe, itemId, className) {
    const link = node('a', undefined, className);
    link.href = route('recipes', recipe) + '/' + itemId;
    link.setAttribute('aria-haspopup', 'dialog');
    return link;
  }

  function showRecipe(r) {
    const forge = r.group === '布倫娜鍛造';
    const bench = node('section', undefined, 'panel bench' + (forge ? ' smithy' : ''));
    bench.append(node('h2', '材料'));
    const materials = node('div', undefined, 'materials');
    for (const {name, label} of materialSlots(r)) {
      const item = itemsById.get(guide.ingredientIds[name]);
      const part = recipeItemLink(r, item.id, 'material');
      part.dataset.slot = materials.childElementCount;
      part.append(itemSlot(item.icon), node('span', label));
      materials.append(part);
    }
    while (materials.children.length < 4) {
      const empty = node('div', undefined, 'material vacant');
      empty.setAttribute('aria-hidden', 'true');
      empty.append(itemSlot());
      materials.append(empty);
    }
    const product = node('div', undefined, 'product');
    const productLink = recipeItemLink(r, r.productId, 'recipe-product-link');
    productLink.append(itemSlot(r.icon), heading(r.name, r.english));
    product.append(productLink);
    bench.append(materials, product);
    if (r.effect) bench.append(node('p', r.effect, 'effect'));
    if (r.intro) bench.append(node('p', r.intro, 'product-note'));
    const more = node('section', undefined, 'panel recipe-info');
    if (r.facts.length) more.append(facts(r.facts));
    sources(more, r);
    article.replaceChildren(bench, more);
  }

  function showCatalogDialog(r, group, detailRoute) {
    const dialog = createUnderkeepDetailDialog();
    dialog.classList.add('guide-dialog');
    renderDetail(dialog, group, r, detailRoute);
    dialog.dataset.route = detailRoute;
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      dismissCatalogDialog();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dismissCatalogDialog();
    });
    dialog.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const [group] = link.hash.slice(1).split('/');
      if (!Object.hasOwn(catalogs, group)) return;
      event.preventDefault();
      if (dismissingCatalogDialog || location.hash !== dialog.dataset.route) return;
      link.focus({ preventScroll: true });
      history.pushState({ catalogParents: catalogDialogs.map(parent => parent.dataset.route) }, '', link.hash);
      refresh();
    });
    dialog.showModal();
    catalogDialogs.push(dialog);
  }

  function categoryRoute(category, subtype = '') {
    return '#items/category/' + encodeURIComponent(category) + (subtype ? '/' + encodeURIComponent(subtype) : '');
  }

  function queryTerms() {
    return catalogQuery.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  }

  function renderCatalogGrid() {
    const items = section === 'items';
    const terms = queryTerms();
    const records = items ? guide.items.filter(r => itemCategories[itemCategory].includes(r.group)
      && (!itemSubtype || subtypeOf(r) === itemSubtype)) : guide[section];
    const grid = node('div', undefined, 'item-grid catalog-grid');
    for (const record of records) {
      if (!terms.every(t => searchable(record).includes(t))) continue;
      const tile = linkTo(section, record, 'item-tile');
      tile.setAttribute('aria-haspopup', 'dialog');
      if (!items) tile.title = [record.name, record.english].filter(Boolean).join('\n');
      if (catalogs[section].thumbnail) tile.append(catalogs[section].thumbnail(record));
      tile.append(node('span', record.name));
      grid.append(tile);
    }
    article.replaceChildren(grid.childElementCount ? grid : node('p', '查無符合的' + catalogTypes[section].label + '。', 'panel empty'));
  }

  function renderItemPage(id, group, subtype, changed) {
    const item = itemsById.get(id);
    const categories = Object.keys(itemCategories);
    if (group === encodeURIComponent('服飾')) group = encodeURIComponent('飾品');
    const category = categories.find(c => item ? itemCategories[c].includes(item.group) : id === 'category' && encodeURIComponent(c) === group) || categories[0];
    const options = itemSubtypes[category] || [];
    const selected = item && !changed && itemCategory === category && subtypeOf(item) === itemSubtype
      ? itemSubtype : options.find(option => encodeURIComponent(option) === subtype) || '';
    const categoryChanged = changed || itemCategory !== category;
    if (categoryChanged) {
      itemCategory = category;
      catalogQuery.value = '';
      $('choices').replaceChildren(...categories.map(c => {
        const tab = node('a', c, 'chapter');
        tab.href = categoryRoute(c);
        if (c === category) tab.setAttribute('aria-current', 'page');
        return tab;
      }));
    }
    if (categoryChanged || selected !== itemSubtype) {
      itemSubtype = selected;
      const menu = $('item-subtypes');
      menu.hidden = !options.length;
      menu.replaceChildren(...(options.length ? ['', ...options] : []).map(option => {
        const link = node('a', option || '全部');
        link.href = categoryRoute(category, option);
        if (option === selected) link.setAttribute('aria-current', 'page');
        return link;
      }));
      renderCatalogGrid();
    }
    return item;
  }

  function dismissCatalogDialog() {
    if (dismissingCatalogDialog) return;
    dismissingCatalogDialog = true;
    if (history.state?.catalogParents || history.state?.fromCatalogGrid || history.state?.fromItemGrid || history.state?.fromStock) history.back();
    else {
      const [parent, entry, item] = catalogDialogs.at(-1).dataset.route.split('/');
      const target = item ? parent + '/' + entry : route(section);
      history.replaceState(null, '', section === 'items' ? categoryRoute(itemCategory, itemSubtype) : target);
      refresh();
    }
  }

  catalogQuery.addEventListener('input', () => section === 'traits' ? showTraits() : renderCatalogGrid());
  article.addEventListener('click', event => {
    const tile = event.target.closest('a[aria-haspopup="dialog"]');
    if (!tile || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (tile.dataset.slot !== undefined) history.replaceState({ ...history.state, recipeSlot: tile.dataset.slot }, '');
    history.pushState({fromCatalogGrid: true}, '', tile.hash);
    refresh();
  });

  function showShop(r) {
    $('choices').replaceChildren(...guide.shops.map(shop => {
      const link = linkTo('shops', shop, 'chapter', shop === r);
      link.textContent = shop.name;
      return link;
    }));
    const scene = new URL(r.scene, document.baseURI);
    document.body.style.setProperty('--shop-scene', 'url("' + scene.href + '")');
    const sheet = node('section', undefined, 'panel item-detail shop-detail');
    sheet.append(heading(r.name, r.english), node('p', r.intro));
    if (r.questId) entryLinks(sheet, '開店條件', 'quests', guide.quests.filter(q => q.id === r.questId));
    sources(sheet, r, '商店位置');
    const grid = node('div', undefined, 'stock-grid');
    sheet.append(node('h3', '販售物品'), grid);
    for (const [id, price, stock] of r.stock) {
      const item = itemsById.get(id);
      const link = node('a', undefined, 'stock-item');
      link.href = route('shops', r) + '/' + id;
      link.setAttribute('aria-haspopup', 'dialog');
      link.append(inventoryIcon(item.icon), node('b', item.name), coinPrice(price),
        node('small', stock < 0 ? '庫存不限' : '初始庫存 ' + stock));
      grid.append(link);
    }
    article.replaceChildren(sheet);
  }

  function renderRecipeList(selected) {
    recipeChoices(selected.group);
    document.body.classList.toggle('forge', selected.group === '布倫娜鍛造');
    const results = document.createDocumentFragment();
    for (const recipe of guide.recipes.filter(r => r.group === selected.group)) {
      const link = linkTo('recipes', recipe, 'recipe-tile', recipe === selected);
      link.title = recipe.name + ' · ' + materialSlots(recipe).map(slot => slot.label).join('、');
      link.setAttribute('aria-label', link.title);
      link.append(itemSlot(recipe.icon));
      results.append(link);
    }
    $('results').replaceChildren(results);
    showRecipe(selected);
  }

  function setTitle(record, group = section) {
    document.title = [record?.name, guideSections[group], underkeepSiteName].filter(Boolean).join(' | ');
  }

  function revealCurrentLink(menu) {
    const link = menu.querySelector('[aria-current]');
    if (!link || menu.scrollWidth <= menu.clientWidth) return;
    const bounds = menu.getBoundingClientRect();
    const tile = link.getBoundingClientRect();
    if (tile.right > bounds.right) menu.scrollLeft += tile.right - bounds.right;
    else if (tile.left < bounds.left) menu.scrollLeft += tile.left - bounds.left;
  }

  function renderRoute() {
    dismissingCatalogDialog = false;
    const routes = [...(history.state?.catalogParents || []), location.hash];
    const [baseRoute] = routes;
    const [key, id, group, subtype] = baseRoute.slice(1).split('/');
    const next = underkeepGuideSection(key);
    const previousDialogRoute = catalogDialogs[0]?.dataset.route;
    const records = guide[next] || [];
    const requested = records.find(r => r.id === id);
    const recipeItem = next === 'recipes' && group && requested &&
      (group === requested.productId || requested.ingredients.some(([name]) => guide.ingredientIds[name] === group))
      ? itemsById.get(group) : null;
    const stockItem = next === 'shops' && group && requested?.stock.some(([itemId]) => itemId === group)
      ? itemsById.get(group) : null;
    const rootDetail = recipeItem || stockItem || (Object.hasOwn(catalogs, next) ? requested : null);
    const details = rootDetail ? [{ record: rootDetail, group: recipeItem || stockItem ? 'items' : next, hash: baseRoute }] : [];
    for (const hash of routes.slice(1)) {
      const [group, id] = hash.slice(1).split('/');
      details.push({ record: guide[group].find(entry => entry.id === id), group, hash });
    }
    let depth = 0;
    while (depth < catalogDialogs.length && catalogDialogs[depth].dataset.route === details[depth]?.hash) depth++;
    while (catalogDialogs.length > depth) {
      const dialog = catalogDialogs.pop();
      dialog.close();
      dialog.remove();
    }
    $('levels-dialog').close();
    const changed = section !== next;
    const focused = document.activeElement?.closest('#choices a, #item-subtypes a, #results a, .skill-grid a')?.hash;
    const choices = $('choices');
    const previousScroll = choices.scrollLeft;
    section = next;
    document.body.dataset.section = section;
    let record = requested || records[0];
    $('page-title').textContent = guideSections[section];
    $('choices').hidden = !['races','classes','items','recipes','shops'].includes(section);
    $('library').hidden = section !== 'recipes';
    guideNav.forEach(a => {
      if (a.hash === route(section)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (changed) {
      revealCurrentLink($('sections'));
      if (section === 'traits') {
        catalogQuery.value = '';
        catalogQuery.placeholder = '搜尋特性、狀態或效果';
        catalogQuery.setAttribute('aria-label', catalogQuery.placeholder);
      } else if (Object.hasOwn(catalogs, section)) {
        catalogQuery.value = '';
        catalogQuery.placeholder = catalogs[section].placeholder;
        catalogQuery.setAttribute('aria-label', section === 'items' ? '搜尋此分類物品' : '搜尋' + catalogTypes[section].label);
      }
      window.scrollTo(0,0);
    }
    if (section !== 'items') $('item-subtypes').hidden = true;
    if (section === 'items') record = renderItemPage(id, group, subtype, changed);
    else if (Object.hasOwn(catalogs, section)) {
      if (changed) renderCatalogGrid();
      record = requested;
    }
    else if (section === 'shops') {
      if (changed || choices.querySelector('[aria-current]')?.hash !== route(section, record)) showShop(record);
      if (stockItem) record = stockItem;
    }
    else if (section === 'traits') showTraits();
    else if (section === 'races') {
      showRace(record);
      if (key === 'levels') {
        history.replaceState(null, '', route('races', record));
        const trigger = article.querySelector('.levels-trigger');
        trigger.focus({preventScroll: true});
        trigger.click();
      }
    }
    else if (section === 'classes') {
      const skill = key === 'skills' && guide.skills.find(s => s.id === id);
      if (skill) record = guide.classes.find(c => c.name === skill.group);
      showClass(record, skill);
      if (skill) record = skill;
    } else if (section === 'recipes') {
      if (changed || $('results').querySelector('[aria-current]')?.hash !== route(section, record)) renderRecipeList(record);
    }
    for (const detail of details.slice(depth)) {
      showCatalogDialog(detail.record, detail.group, detail.hash);
    }
    if (details.length > 1) {
      const top = details.at(-1);
      setTitle(top.record, top.group);
    } else {
      setTitle(record);
    }
    if (!choices.hidden && choices.scrollWidth > choices.clientWidth) {
      choices.scrollLeft = changed ? 0 : previousScroll;
      revealCurrentLink(choices);
    }
    if (previousDialogRoute && !catalogDialogs.length) {
      const href = 'a[href="' + CSS.escape(previousDialogRoute) + '"]';
      const slot = history.state?.recipeSlot;
      const trigger = slot != null && article.querySelector(href + '[data-slot="' + CSS.escape(slot) + '"]');
      (trigger || article.querySelector(href))?.focus({preventScroll: true});
    } else if (focused && !catalogDialogs.length) {
      const restored = [...document.querySelectorAll('#choices a, #item-subtypes a, #results a, .skill-grid a')].find(a => a.hash === focused);
      restored?.focus({preventScroll: true});
    }
  }

  // In the stacked layout, bring the selected result into view after routing.
  $('workspace').addEventListener('click', event => {
    const tile = event.target.closest('.skill-tile, .recipe-tile, .item-tile');
    if (!tile || tile.closest('.catalog-grid') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const breakpoint = tile.matches('.recipe-tile') ? 820 : 740;
    if (!matchMedia(`(max-width: ${breakpoint}px)`).matches) return;
    const reveal = () => article.querySelector('.skill-detail, .bench, .item-detail')?.scrollIntoView({ block: 'start' });
    if (tile.hash === location.hash) reveal();
    else window.addEventListener('hashchange', reveal, { once: true, signal });
  });

  renderRoute();
  return renderRoute;
}
