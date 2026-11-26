'use strict';

const guideNav = [...document.querySelectorAll('#sections a[data-title]')];
const guideSections = Object.fromEntries(guideNav.map(link => [link.hash.slice(1), link.dataset.title]));

function underkeepGuideSection(key) {
  if (key === 'skills') return 'classes';
  if (key === 'equipment') return 'items';
  return Object.hasOwn(guideSections, key) ? key : 'races';
}

function mountUnderkeepGuide(signal, refresh, prepareSearch) {
  const { data: guide, spriteIcon, route, placeLabel, entryLinks, heading, facts, attributeText, attributeElement,
    itemsById, enemiesById, artImage, inventoryIcon, coinPrice, itemFactRow, catalogTypes, renderDetail } = guideDetails;
  const node = underkeepElement;
  const $ = id => document.getElementById(id);
  let allEffects;
  let weaponSubtypes;
  // Inventory categories in game order, with the guide's more detailed item types.
  const itemCategories = {
    {{t:common.weapon|key}}: ['{{t:common.weapon|sq}}'],
    {{t:common.armor|key}}: ['{{t:guide.warrior-skill_shield_bash.facts|sq}}', '{{t:guide.item_tattered_robe.group|sq}}', '{{t:guide.item_bandage_helmet.group|sq}}', '{{t:guide.item_bracers_leather.group|sq}}', '{{t:guide.item_generic_sock_of_lich_king.group|sq}}', '{{t:guide.item_drakkan_monk_robe.group|sq}}'],
    {{t:common.accessory|key}}: ['{{t:common.ring|sq}}', '{{t:guide.item_archmages_seal.group|sq}}', '{{t:guide.item_belt_of_minor_evasion.group|sq}}'],
    {{t:common.potion|key}}: ['{{t:common.potion|sq}}'],
    {{t:common.consumable|key}}: ['{{t:common.consumable|sq}}'],
    {{t:common.food|key}}: ['{{t:common.food|sq}}'],
    {{t:common.key|key}}: ['{{t:common.key|sq}}'],
    {{t:common.miscellaneous|key}}: ['{{t:common.junk|sq}}', '{{t:common.books-scrolls|sq}}', '{{t:guide.item_bones01.group|sq}}', '{{t:guide.item_teleport_stone.group|sq}}', '{{t:guide.item_empty_flask.group|sq}}', '{{t:common.quest-item|sq}}', '{{t:guide.item_coins.group|sq}}'],
    {{t:common.recipe|key}}: ['{{t:common.recipe-scroll|sq}}']
  };
  let itemCategory;
  let itemSubtype = '';
  function subtypeOf(item) {
    return item.group === '{{t:common.weapon|sq}}' ? item.facts.find(([key]) => key === '{{t:common.weapon-type|sq}}')?.[1] : item.group;
  }
  const itemSubtypes = {
    get {{t:common.weapon|key}}() {
      return weaponSubtypes ??= [...new Set(guide.items.filter(item => item.group === '{{t:common.weapon|sq}}').map(subtypeOf))];
    },
    {{t:common.armor|key}}: itemCategories{{t:common.armor|member}},
    {{t:common.accessory|key}}: itemCategories{{t:common.accessory|member}}
  };
  const categoryRoutes = {
    weapon: '{{t:common.weapon|sq}}',
    armor: '{{t:common.armor|sq}}',
    accessory: '{{t:common.accessory|sq}}',
    potion: '{{t:common.potion|sq}}',
    consumable: '{{t:common.consumable|sq}}',
    food: '{{t:common.food|sq}}',
    key: '{{t:common.key|sq}}',
    other: '{{t:common.miscellaneous|sq}}',
    recipe: '{{t:common.recipe|sq}}'
  };
  const subtypeRoutes = {
    staff: '{{t:guide.item_quarterstaff.facts|sq}}',
    bow: '{{t:guide.item_sling.facts|sq}}',
    dagger: '{{t:guide.thief-skill_backstab_the_weak.facts|sq}}',
    sword: '{{t:guide.warrior-skill_flurry_thrust.facts-2|sq}}',
    blunt: '{{t:guide.warrior-skill_skull_rattle.facts|sq}}',
    axe: '{{t:guide.warrior-skill_slice_and_dice.facts|sq}}',
    shield: '{{t:guide.warrior-skill_shield_bash.facts|sq}}',
    body: '{{t:guide.item_tattered_robe.group|sq}}',
    head: '{{t:guide.item_bandage_helmet.group|sq}}',
    hands: '{{t:guide.item_bracers_leather.group|sq}}',
    feet: '{{t:guide.item_generic_sock_of_lich_king.group|sq}}',
    cloak: '{{t:guide.item_drakkan_monk_robe.group|sq}}',
    ring: '{{t:common.ring|sq}}',
    amulet: '{{t:guide.item_archmages_seal.group|sq}}',
    belt: '{{t:guide.item_belt_of_minor_evasion.group|sq}}'
  };
  let catalogUpdate = 0;
  const catalogDialogs = [];
  let dismissingCatalogDialog = false;
  const catalogQuery = $('item-query');
  const itemSort = $('item-sort');
  const itemControls = itemSort.closest('.item-controls');
  bindUnderkeepSearch(catalogQuery, signal);
  const catalogs = {
    items: { placeholder: '{{t:guide.ui.mount-underkeep-guide.placeholder|sq}}', thumbnail: r => itemSlot(r.icon) },
    enemies: { placeholder: '{{t:guide.ui.mount-underkeep-guide.placeholder-2|sq}}', thumbnail: enemyThumbnail },
    quests: { placeholder: '{{t:guide.ui.mount-underkeep-guide.placeholder-3|sq}}' }
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

  function sources(article, r, title = section === 'recipes' && r.group === '{{t:common.mortar-crafting|sq}}' ? '{{t:guide.ui.sources|sq}}' : '{{t:guide.ui.item-sheet-5|sq}}', sourceRoute = route(section, r)) {
    guideDetails.sources(article, r, title, sourceRoute, { staticGroups: section === 'recipes' });
  }

  const searchIndex = new WeakMap();
  function searchable(r) {
    if (!searchIndex.has(r)) {
      const fields = [r.name, r.english, r.group, r.intro, r.notes, ...r.facts.flat(), ...(r.hiddenEffects || []),
        ...(r.steps || []), ...(r.ingredients || []).flat(), ...(r.table || []).flat()];
      if (r.attacks) {
        fields.push(...r.resist.flat(), ...r.abilities,
          ...r.immunities.map(key => '{{t:guide.ui.item-sheet|sq}}' + guide.combatStatuses[key].name));
        for (const attack of r.attacks) {
          fields.push(attack.name, ...attack.facts.flat(), ...attack.effects.map(([key]) => guide.combatStatuses[key].name));
        }
      }
      for (const [how, mid, id] of r.sources || []) fields.push(how, mid && placeLabel(mid, id).join(''));
      for (const [how, mid, id] of r.uses || []) fields.push(how, mid && placeLabel(mid, id).join(''));
      for (const [id, methods] of r.enemyDrops || []) {
        const enemy = enemiesById.get(id);
        fields.push('{{t:common.enemy-drop|sq}}', enemy.name, enemy.english, ...methods);
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
    gallery.append(node('h3', '{{t:guide.ui.face-gallery|sq}}'));
    for (const supporter of [false, true]) {
      const faces = guide.faces.map((face, index) => ({face, index}))
        .filter(({face}) => face.supporter === supporter && face.races.includes(r.id));
      if (!faces.length) continue;
      gallery.append(node('h4', supporter ? '{{t:guide.ui.face-gallery-2|sq}}' : '{{t:guide.ui.face-gallery-3|sq}}'));
      const grid = node('div', undefined, 'face-grid');
      faces.forEach(({index}, i) => {
        const tile = node('span', undefined, 'face-tile');
        tile.setAttribute('role', 'img');
        tile.setAttribute('aria-label', r.name + ' · ' + (supporter ? '{{t:guide.ui.face-gallery-4|sq}}' : '{{t:guide.ui.face-gallery-5|sq}}') + ' ' + (i + 1));
        tile.append(portrait(index));
        grid.append(tile);
      });
      gallery.append(grid);
    }
    return gallery;
  }

  function traitNames(trait, nameTag = 'strong') {
    const names = node('div', undefined, 'trait-names');
    names.append(node(nameTag, trait.name));
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
        ...trait, race, group: '{{t:guide.ui.show-traits.group|sq}}', effects: [trait.effect]
      }))),
      ...guide.mutations,
      ...guide.statusEffects
    ];
    const terms = queryTerms();
    const panels = document.createDocumentFragment();
    const grids = new Map();
    for (const effect of allEffects) {
      const {group, race} = effect;
      const text = [effect.name, effect.english, group, race?.name, effect.rare ? '{{t:guide.ui.show-traits|sq}}' : '', ...effect.effects].join(' ').toLocaleLowerCase();
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
      if (effect.rare) title.append(node('span', '{{t:guide.ui.show-traits|sq}}', 'rarity'));
      card.append(title, ...effect.effects.map(line => attributeElement('p', line)));
      grids.get(group).append(card);
    }
    article.replaceChildren(grids.size ? panels : node('p', '{{t:guide.ui.show-traits-2|sq}}', 'panel empty'));
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
    const primaryFact = jobFacts['{{t:guide.warrior.facts|sq}}'];
    const rangeStart = primaryFact.lastIndexOf(' ');
    const primary = primaryFact.slice(0, rangeStart);
    const primaryRange = primaryFact.slice(rangeStart + 1);
    const wisdomModifier = Number(jobFacts['{{t:guide.paladin.facts|sq}}'] ?? 0);
    const stats = race.table.slice(1).map(([name, range, modifier]) => {
      const isPrimary = name === primary;
      const [min, max] = (isPrimary ? primaryRange : range).split('–').map(Number);
      const offset = isPrimary ? Number(modifier) : 0;
      return { name, min: min + offset, max: max + offset };
    });
    const [raceMin, raceMax] = raceFacts['{{t:guide.human.facts|sq}}'].split('–').map(Number);
    const minSum = stats.reduce((sum, stat) => sum + stat.min, 0);
    const maxSum = stats.reduce((sum, stat) => sum + stat.max, 0);
    const totalMin = Math.max(raceMin, minSum);
    const totalMax = Math.min(raceMax, maxSum);
    const formatRange = (min, max) => min === max ? String(min) : min + '–' + max;
    // The game adjusts the three secondary rolls to meet the race's total before applying the class bonus.
    const ranges = stats.map(({ name, min, max }) => {
      const extra = name === '{{t:common.wisdom|sq}}' ? wisdomModifier : 0;
      return formatRange(Math.max(min, totalMin - (maxSum - max)) + extra,
        Math.min(max, totalMax - (minSum - min)) + extra);
    });
    const hp = Number(raceFacts['{{t:guide.human.facts-2|sq}}']) + Number(jobFacts['{{t:guide.warrior.facts-2|sq}}']);
    return [...ranges, formatRange(totalMin + wisdomModifier, totalMax + wisdomModifier), hp > 0 ? '+' + hp : String(hp)];
  }

  function showCharacterPanels(bio, r, otherPanel) {
    const isJob = section === 'classes';
    const group = isJob ? '{{t:common.race|sq}}' : '{{t:common.class|sq}}';
    const race = isJob ? guide.races[0] : r;
    const labels = race.table.slice(1).map(([name]) => name);
    const rows = isJob
      ? guide.races.map(race => [race.name, ...startingRanges(race, r)])
      : guide.classes.map(job => [job.name, ...startingRanges(r, job)]);
    const panel = node('section', undefined, 'panel starting-ranges');
    panel.append(node('h3', '{{t:guide.ui.show-character-panels|sq}}'.replace('{group}', () => group)), table([[group, ...labels, '{{t:guide.ui.show-character-panels-3|sq}}', '{{t:guide.human.facts-2|sq}}'], ...rows]),
      node('p', '{{t:guide.ui.show-character-panels-4|sq}}', 'range-note'));
    const side = node('div', undefined, 'character-side');
    side.append(panel, otherPanel);
    article.replaceChildren(bio, side);
  }

  function showRace(r) {
    characterChoices(guide.races, r, true);
    const bio = node('section', undefined, 'panel race-bio');
    const title = heading(r.name);
    const levels = node('button', '{{t:guide.ui.show-race|sq}}', 'guide-action levels-trigger');
    levels.type = 'button';
    levels.setAttribute('aria-haspopup', 'dialog');
    levels.setAttribute('aria-controls', 'levels-dialog');
    levels.addEventListener('click', () => {
      const dialog = $('levels-dialog');
      const body = dialog.querySelector('.dialog-body');
      if (!body.querySelector('table')) {
        const rows = guide.xp.map((total, i) => [i + 1,
          underkeepXp(i ? total - guide.xp[i - 1] : 0, false), underkeepXp(total, false)]);
        body.append(table([['{{t:guide.ui.show-race-2|sq}}', '{{t:guide.ui.show-race-3|sq}}', '{{t:guide.ui.show-race-4|sq}}'], ...rows]));
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
    attributes.append(node('h3', '{{t:guide.ui.show-character-panels-2|sq}}'), table(r.table.map(row => row.slice(0, 2))));
    bio.append(attributes);
    showCharacterPanels(bio, r, faceGallery(r));
  }

  function showClass(r, skill) {
    characterChoices(guide.classes, r, false);
    const skills = guide.skills.filter(s => s.group === r.name);
    const selected = skill || skills[0];
    const summary = node('section', undefined, 'panel class-summary');
    const classFacts = r.facts.filter(([label, value]) => label !== '{{t:guide.warrior.facts-3|sq}}' || Number(value) !== 0);
    summary.append(heading(r.name), node('p', r.lore, 'character-lore'),
      attributeElement('p', r.intro, 'intro'), facts(classFacts));

    const board = node('nav', undefined, 'skill-board');
    board.setAttribute('aria-label', '{{t:guide.ui.show-class|sq}}'.replace('{name}', () => r.name));
    for (const kind of ['{{t:common.active|sq}}','{{t:common.aura|sq}}','{{t:common.passive|sq}}']) {
      const members = skills.filter(s => s.kind === kind);
      if (!members.length) continue;
      const group = node('section', undefined, 'skill-group');
      group.append(node('h3', kind));
      const tiles = node('div', undefined, 'skill-grid');
      for (const s of members) {
        const a = linkTo('skills', s, 'skill-tile', s === selected);
        a.append(framedSkill(s), node('span', s.name), node('small', '{{t:common.level|sq}} ' + s.unlock));
        tiles.append(a);
      }
      group.append(tiles);
      board.append(group);
    }
    summary.append(board);
    const detail = node('section', undefined, 'panel skill-detail');
    const title = heading(selected.name, framedSkill(selected), undefined, 'h3');
    title.append(node('span', selected.kind, 'kind'));
    detail.append(title, attributeElement('p', selected.intro, 'intro'),
      facts(selected.facts.filter(([label]) => !['{{t:common.type|sq}}', '{{t:common.skill-level-cap|sq}}', '{{t:common.skill-upgrade-requirement|sq}}'].includes(label))),
      node('h4', '{{t:guide.ui.show-class-2|sq}}'), table(selected.table));
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
    return r.ingredients.flatMap(([name, quantity]) => name === '{{t:common.coins|sq}}'
      ? [{name, label: quantity + ' {{t:common.coins|sq}}'}]
      : Array.from({length: quantity}, () => ({name, label: name})));
  }

  function recipeItemLink(recipe, itemId, className) {
    const link = node('a', undefined, className);
    link.href = route('recipes', recipe) + '/' + itemId;
    link.setAttribute('aria-haspopup', 'dialog');
    return link;
  }

  function showRecipe(r) {
    const forge = r.group === '{{t:guide.item_moonsteel_helmet.group|sq}}';
    const bench = node('section', undefined, 'panel bench' + (forge ? ' smithy' : ''));
    bench.append(node('h2', '{{t:guide.ui.show-recipe|sq}}'));
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
    productLink.append(itemSlot(r.icon), heading(r.name));
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

  function itemRoutePart(routes, label) {
    return Object.keys(routes).find(slug => routes[slug] === label) ?? encodeURIComponent(label);
  }

  function categoryRoute(category, subtype = '') {
    return '#items/category/' + itemRoutePart(categoryRoutes, category) + (subtype ? '/' + itemRoutePart(subtypeRoutes, subtype) : '');
  }

  function queryTerms() {
    return catalogQuery.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  }

  async function updateCatalogGrid() {
    const request = ++catalogUpdate;
    const activeSection = section;
    const isCurrent = () => !signal.aborted && activeSection === section && request === catalogUpdate;
    const data = queryTerms().length && prepareSearch(activeSection);
    if (data) {
      article.setAttribute('aria-busy', 'true');
      try {
        await data;
      } catch (error) {
        if (!isCurrent()) return;
        article.removeAttribute('aria-busy');
        const retry = node('button', '{{t:site.retry|sq}}', 'guide-action');
        retry.type = 'button';
        retry.addEventListener('click', updateCatalogGrid);
        article.replaceChildren(node('p', '{{t:site.load-failed|sq}}', 'panel empty'), retry);
        console.error(error);
        return;
      }
    }
    if (!isCurrent()) return;
    article.removeAttribute('aria-busy');
    renderCatalogGrid();
  }

  function renderCatalogGrid() {
    const items = section === 'items';
    const terms = queryTerms();
    const selection = items ? itemSort.value : '';
    const immunity = selection.startsWith('{{t:guide.ui.item-sheet|sq}}');
    const sort = immunity ? '' : selection;
    const records = items ? guide.items.filter(r => itemCategories[itemCategory].includes(r.group)
      && (!itemSubtype || subtypeOf(r) === itemSubtype)) : guide[section];
    const entries = [];
    for (const record of records) {
      if (immunity && !record.facts.some(([label, value]) => label === selection && value === '1')) continue;
      if (!terms.every(t => searchable(record).includes(t))) continue;
      if (!sort) {
        entries.push({ record, label: record.name });
        continue;
      }
      const fact = record.facts.find(([label]) => label === sort);
      const value = fact && itemFactRow(fact)[1];
      const match = value && value.match(/^([+-]?\d+)(?:\s*[-–]\s*([+-]?\d+))?(%?)$/);
      if (!match) continue;
      const [, first, second, unit] = match;
      const amount = Number(second) > Number(first) ? second : first;
      entries.push({ record, label: sort.endsWith('{{t:common.damage|sq}}') && second !== undefined ? value : amount + unit, amount: Number(amount) });
    }
    if (sort) entries.sort((a, b) => b.amount - a.amount);

    const grid = node('div', undefined, 'item-grid catalog-grid');
    for (const { record, label } of entries) {
      const tile = linkTo(section, record, 'item-tile');
      tile.setAttribute('aria-haspopup', 'dialog');
      if (!items || sort) tile.title = record.name;
      if (sort) tile.setAttribute('aria-label', record.name + '{{t:common.punctuation.comma|sq}}' + sort + ' ' + label);
      if (catalogs[section].thumbnail) tile.append(catalogs[section].thumbnail(record));
      tile.append(node('span', label));
      grid.append(tile);
    }
    article.replaceChildren(grid.childElementCount ? grid : node('p', '{{t:guide.ui.render-catalog-grid|sq}}'.replace('{group}', () => catalogTypes[section].label), 'panel empty'));
  }

  function renderItemPage(id, group, subtype, changed) {
    if (!itemCategory) {
      const immunities = new Set();
      for (const record of guide.items) {
        for (const [label, value] of record.facts) {
          if (label.startsWith('{{t:guide.ui.item-sheet|sq}}') && value === '1') immunities.add(label);
        }
      }
      $('item-immunity-options').replaceChildren(...Array.from(immunities, label => node('option', label)));
    }
    const item = itemsById.get(id);
    const categories = Object.keys(itemCategories);
    if (group === encodeURIComponent('{{t:guide.ui.render-item-page|sq}}')) group = encodeURIComponent('{{t:common.accessory|sq}}');
    const category = categories.find(c => item ? itemCategories[c].includes(item.group) :
      id === 'category' && (categoryRoutes[group] === c || encodeURIComponent(c) === group)) || categories[0];
    const options = itemSubtypes[category] || [];
    const selected = item && !changed && itemCategory === category && subtypeOf(item) === itemSubtype
      ? itemSubtype : options.find(option => subtypeRoutes[subtype] === option || encodeURIComponent(option) === subtype) || '';
    if (id === 'category') {
      const canonical = categoryRoute(category, selected);
      if (canonical !== location.hash) history.replaceState(history.state, '', canonical);
    }
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
        const link = node('a', option || '{{t:common.all|sq}}');
        link.href = categoryRoute(category, option);
        if (option === selected) link.setAttribute('aria-current', 'page');
        return link;
      }));
      updateCatalogGrid();
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

  catalogQuery.addEventListener('input', () => section === 'traits' ? showTraits() : updateCatalogGrid());
  itemSort.addEventListener('change', updateCatalogGrid);
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
    const scene = new URL(underkeepSharedAssets + r.scene, document.baseURI);
    document.body.style.setProperty('--shop-scene', 'url("' + scene.href + '")');
    const sheet = node('section', undefined, 'panel item-detail shop-detail');
    sheet.append(heading(r.name), node('p', r.intro));
    if (r.questId) entryLinks(sheet, '{{t:guide.ui.show-shop|sq}}', 'quests', guide.quests.filter(q => q.id === r.questId));
    sources(sheet, r, '{{t:guide.shop_village_barlo.sources|sq}}');
    const grid = node('div', undefined, 'stock-grid');
    sheet.append(node('h3', '{{t:guide.ui.show-shop-2|sq}}'), grid);
    for (const [id, price, stock] of r.stock) {
      const item = itemsById.get(id);
      const link = node('a', undefined, 'stock-item');
      link.href = route('shops', r) + '/' + id;
      link.setAttribute('aria-haspopup', 'dialog');
      link.append(inventoryIcon(item.icon), node('b', item.name), coinPrice(price),
        node('small', stock < 0 ? '{{t:guide.ui.show-shop-3|sq}}' : '{{t:guide.ui.show-shop-4|sq}} ' + stock));
      grid.append(link);
    }
    article.replaceChildren(sheet);
  }

  function renderRecipeList(selected) {
    recipeChoices(selected.group);
    document.body.classList.toggle('forge', selected.group === '{{t:guide.item_moonsteel_helmet.group|sq}}');
    const results = document.createDocumentFragment();
    for (const recipe of guide.recipes.filter(r => r.group === selected.group)) {
      const link = linkTo('recipes', recipe, 'recipe-tile', recipe === selected);
      link.title = recipe.name + ' · ' + materialSlots(recipe).map(slot => slot.label).join('{{t:common.punctuation.list-separator|sq}}');
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
      article.removeAttribute('aria-busy');
      revealCurrentLink($('sections'));
      if (section === 'traits') {
        catalogQuery.value = '';
        catalogQuery.placeholder = '{{t:guide.ui.render-route|sq}}';
        catalogQuery.setAttribute('aria-label', catalogQuery.placeholder);
      } else if (Object.hasOwn(catalogs, section)) {
        catalogQuery.value = '';
        catalogQuery.placeholder = catalogs[section].placeholder;
        catalogQuery.setAttribute('aria-label', section === 'items' ? '{{t:guide.ui.render-route-2|sq}}' : '{{t:guide.ui.render-route-3|sq}}'.replace('{group}', () => catalogTypes[section].label));
      }
      window.scrollTo(0,0);
    }
    itemControls.hidden = section !== 'items';
    if (section === 'items') record = renderItemPage(id, group, subtype, changed);
    else if (Object.hasOwn(catalogs, section)) {
      if (changed) updateCatalogGrid();
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
