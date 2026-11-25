'use strict';

const underkeepSiteName = document.title;

function underkeepElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createUnderkeepDetailDialog() {
  const dialog = document.getElementById('detail-dialog-template').content.firstElementChild.cloneNode(true);
  document.getElementById('view').append(dialog);
  return dialog;
}

function bindUnderkeepSearch(input, signal, reveal) {
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.defaultPrevented || event.isComposing ||
        event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target.isContentEditable || target.closest?.('textarea,select,input:not([type="checkbox"]):not([type="radio"])') ||
        document.querySelector('dialog[open]')) return;
    reveal?.();
    if (!input.getClientRects().length) return;
    event.preventDefault();
    input.focus();
  }, { signal });
}

function underkeepXp(value, withUnit = true) {
  const span = document.createElement('span');
  const amount = typeof value === 'number' ? value.toLocaleString('zh-TW') : String(value);
  span.className = 'choice-xp';
  if (withUnit) {
    span.lang = 'en';
    span.textContent = amount.replace(/^\+/, '') + ' XP';
  } else {
    span.textContent = amount;
  }
  return span;
}

function underkeepXpText(text, formatText = String) {
  let fragment;
  let start = 0;
  for (const match of text.matchAll(/([+-]?\d+(?:,\d{3})*(?:–\d+(?:,\d{3})*)?(%?))([ \t]*(?:經驗值?|XP\b))/gi)) {
    fragment ??= document.createDocumentFragment();
    const [label, amount, percent, unit] = match;
    const xp = underkeepXp(amount, !percent);
    xp.replaceChildren(formatText(xp.textContent));
    fragment.append(formatText(text.slice(start, match.index)), xp);
    if (percent) fragment.append(formatText(unit));
    start = match.index + label.length;
  }
  if (!fragment) return formatText(text);
  fragment.append(formatText(text.slice(start)));
  return fragment;
}

(() => {
  const scriptUrl = new URL(document.currentScript.src);
  const assetVersion = scriptUrl.searchParams.get('t');
  const scriptsBase = new URL('.', scriptUrl);
  const base = new URL('../', scriptsBase);
  const entry = new URL('index.html', base);
  const view = document.getElementById('view');
  const status = document.getElementById('view-status');
  const mapLink = document.getElementById('to-map');
  const homeLink = document.querySelector('.brand a');
  const guideLinks = document.querySelectorAll('#sections a[data-title]');
  const homeContent = [...view.children];
  const mapNames = 'data/map-names.js';
  const sheetStyle = 'sheet.css';
  const styleOrder = ['home.css', 'map.css', 'guide.css', sheetStyle];
  const guideDataKeys = { characters: 'races', catalog: 'mapPoints', items: 'items', enemies: 'enemies', quests: 'quests' };
  const scripts = new Map();
  const styles = new Map();
  let activePage;
  let activeUrl;
  let lifecycle;
  let refreshView;
  let navigation = 0;
  let pendingUrl;

  const pages = {
    home: {
      title: underkeepSiteName,
      styles: ['home.css']
    },
    map: {
      title: '互動地圖 | ' + underkeepSiteName,
      styles: ['map.css'],
      load: () => Promise.all([loadScript(mapNames), loadScript('map.js')]),
      loadRoute: url => {
        const id = underkeepMapId(url.hash);
        if (!underkeepMaps.has(id)) return loadScript('data/maps/' + id + '.js');
      },
      mount: signal => mountUnderkeepAtlas(signal, group => loadMapDetails(signal, group))
    },
    guide: {
      title: underkeepSiteName,
      styles: ['guide.css', sheetStyle],
      load: () => Promise.all([loadScript(mapNames), loadScript('guide-details.js'), loadScript('guide.js')]),
      loadRoute: loadGuideSection,
      mount: signal => mountUnderkeepGuide(signal, () => navigate(new URL(location.href), 'guide'))
    }
  };

  function appendResource(element, before = null) {
    return new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => {
        element.remove();
        reject(new Error('Unable to load ' + (element.src || element.href)));
      };
      document.head.insertBefore(element, before);
    });
  }

  function assetUrl(file, directory) {
    const url = new URL(file, directory);
    if (assetVersion) url.searchParams.set('t', assetVersion);
    return url;
  }

  function loadScript(file) {
    if (!scripts.has(file)) {
      const script = document.createElement('script');
      script.src = assetUrl(file, scriptsBase);
      scripts.set(file, appendResource(script).catch(error => {
        scripts.delete(file);
        throw error;
      }));
    }
    return scripts.get(file);
  }

  function loadStyle(file) {
    if (!styles.has(file)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetUrl('css/' + file, base);
      link.media = 'not all';
      const next = styleOrder.slice(styleOrder.indexOf(file) + 1).find(name => styles.has(name));
      const ready = appendResource(link, styles.get(next)?.link).catch(error => {
        styles.delete(file);
        throw error;
      });
      styles.set(file, { link, ready });
    }
    return styles.get(file).ready;
  }

  function loadGuideParts(...parts) {
    const missing = parts.filter(part => part && !Object.hasOwn(guideDetails.data, guideDataKeys[part]));
    if (missing.length) return Promise.all(missing.map(part => loadScript('data/guide/' + part + '.js')));
  }

  function loadGuideSection(url) {
    const parents = url.href === location.href ? history.state?.catalogParents || [] : [];
    const loading = [...parents, url.hash].map(loadGuideRoute).filter(Boolean);
    if (loading.length) return Promise.all(loading);
  }

  function loadGuideRoute(hash) {
    const [key, entry] = hash.slice(1).split('/');
    const section = underkeepGuideSection(key);
    switch (section) {
      case 'items':
      case 'recipes':
      case 'shops':
        return loadGuideParts('catalog', 'items', 'enemies', section === 'shops' && 'quests');
      case 'enemies':
        return loadGuideParts('catalog', 'enemies', entry && 'items');
      case 'quests':
        return loadGuideParts('catalog', 'quests', entry && 'items');
      default:
        return loadGuideParts('characters');
    }
  }

  async function loadMapDetails(signal, group) {
    await Promise.all([
      loadScript('guide-details.js').then(() => loadGuideParts('catalog', 'items', 'enemies', group === 'quests' && 'quests')),
      loadStyle(sheetStyle)
    ]);
    if (!signal.aborted) styles.get(sheetStyle).link.media = 'all';
  }

  function mount(page, signal) {
    mapLink.href = '?view=map';
    for (const [name, link] of [['home', homeLink], ['map', mapLink]]) {
      if (page === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const link of guideLinks) {
      link.href = (page === 'guide' ? '' : '?view=guide') + link.hash;
      link.removeAttribute('aria-current');
    }
    delete document.body.dataset.section;
    return pages[page].mount?.(signal);
  }

  function routePage(url) {
    if (url.protocol !== base.protocol || url.origin !== base.origin ||
      (url.pathname !== entry.pathname && url.pathname !== base.pathname)) return;
    const page = url.searchParams.get('view');
    if (Object.hasOwn(pages, page)) return page;
    return url.hash || url.searchParams.has('guide') ? 'map' : 'home';
  }

  function sameView(url, page) {
    return page === activePage && url.pathname === activeUrl.pathname && url.search === activeUrl.search;
  }

  function setStatus(message = '') {
    status.textContent = message;
    status.hidden = !message;
    if (message) view.setAttribute('aria-busy', 'true');
    else view.removeAttribute('aria-busy');
  }

  async function navigate(url, page, push = false) {
    const ticket = ++navigation;
    pendingUrl = url.href;
    const next = pages[page];

    try {
      if (sameView(url, page)) {
        const data = next.loadRoute?.(url);
        if (data) {
          setStatus('載入中…');
          await data;
        }
        if (ticket !== navigation || location.href !== url.href) return;
        refreshView?.();
        setStatus();
        return;
      }

      setStatus('載入中…');
      const assets = next.load?.().then(() => next.loadRoute?.(url));
      await Promise.all([assets, ...next.styles.map(loadStyle)]);
      if (ticket !== navigation || (!push && location.href !== url.href)) return;
      if (push && location.href !== url.href) history.pushState(null, '', url);

      const hasPreviousView = Boolean(activePage);
      lifecycle?.abort();
      lifecycle = new AbortController();
      for (const [file, style] of styles) {
        style.link.media = next.styles.includes(file) ? 'all' : 'not all';
      }
      activePage = page;
      activeUrl = url;
      document.body.dataset.page = page;
      document.title = next.title;
      if (page === 'home') view.replaceChildren(...homeContent);
      else view.replaceChildren(document.getElementById(page + '-view').content.cloneNode(true));
      view.dataset.ready = '';
      window.scrollTo(0, 0);
      refreshView = mount(page, lifecycle.signal);
      if (hasPreviousView && !view.querySelector('dialog[open]')) {
        view.querySelector('main').focus({ preventScroll: true });
      }
      setStatus();
    } catch (error) {
      if (ticket !== navigation) return;
      setStatus('載入失敗。');
      view.removeAttribute('aria-busy');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '重試';
      retry.addEventListener('click', () => navigate(url, page, push));
      status.append(' ', retry);
      console.error(error);
    } finally {
      if (ticket === navigation) pendingUrl = undefined;
    }
  }

  function cancelNavigation() {
    if (!pendingUrl) return;
    ++navigation;
    pendingUrl = undefined;
    setStatus();
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const url = new URL(anchor.href);
    const page = routePage(url);
    if (!page) return;
    if (sameView(url, page)) {
      if (pendingUrl !== url.href) cancelNavigation();
      return;
    }
    event.preventDefault();
    if (pendingUrl !== url.href) navigate(url, page, true);
  });

  function syncRoute(event) {
    const url = new URL(location.href);
    const page = routePage(url);
    if (pendingUrl === url.href) return;
    if (page && (!sameView(url, page) || event?.type === 'hashchange')) navigate(url, page);
    else cancelNavigation();
  }

  window.addEventListener('popstate', syncRoute);
  window.addEventListener('hashchange', syncRoute);
  syncRoute();
})();
