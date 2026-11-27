'use strict';

const underkeepSiteName = document.title;
const underkeepSharedAssets = new URL('../{{site:assets}}', document.currentScript.src).href;

function underkeepCoordinates([x, y]) {
  return '(' + x + ', ' + y + ')';
}

function underkeepCoordinateText(text) {
  return text.replace(/([\p{L}\p{M}\p{N}])?[（(][ \t]*(-?\d+)[ \t]*[,，][ \t]*(-?\d+)[ \t]*[）)](?=([\p{L}\p{M}\p{N}])?)/gu,
    (_, previous, x, y, next) =>
      (previous ? previous + ' ' : '') + underkeepCoordinates([x, y]) + (next ? ' ' : ''));
}

function underkeepElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = typeof text === 'string' ? underkeepCoordinateText(text) : text;
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
  const amount = typeof value === 'number' ? value.toLocaleString('{{t:site.number-locale|sq}}') : String(value);
  span.className = 'choice-xp';
  if (withUnit) {
    span.lang = 'en';
    span.textContent = amount.replace(/^\+/, '') + ' XP';
  } else {
    span.textContent = amount;
  }
  return span;
}

function underkeepXpText(text, formatText = underkeepCoordinateText) {
  let fragment;
  let start = 0;
  for (const match of text.matchAll(/([+-]?\d+(?:,\d{3})*(?:–\d+(?:,\d{3})*)?(%?))([ \t]*(?:{{t:site.xp-pattern|pattern}}|XP\b))/gi)) {
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
  const bundle = new URL('../', scriptUrl);
  const bundleRevisions = {{site:bundle-revisions}};
  const styleRevisions = {
    'map.css': '{{rev:css/map.css}}',
    'guide.css': '{{rev:css/guide.css}}',
    'sheet.css': '{{rev:css/sheet.css}}'
  };
  const base = new URL('.', location.href);
  const entry = new URL('index.html', base);
  const view = document.getElementById('view');
  const status = document.getElementById('view-status');
  const mapLink = document.getElementById('to-map');
  const homeLink = document.querySelector('.brand a');
  const language = document.getElementById('site-language');
  const guideLinks = document.querySelectorAll('#sections a[data-title]');
  const homeContent = [...view.children];
  const mapNames = 'data/map-names.js';
  const sheetStyle = 'sheet.css';
  const styleOrder = Object.keys(styleRevisions);
  const guideDataKeys = { characters: 'races', catalog: 'recipes', 'map-points': 'mapPoints', items: 'items', enemies: 'enemies', quests: 'quests' };
  const scripts = new Map();
  const styles = new Map();
  const templates = new Map();
  const spoilerStorageKey = 'underkeep.walkthrough.showSpoilers';
  let spoilersAccepted = false;
  let activePage;
  let activeUrl;
  let lifecycle;
  let refreshView;
  let navigation = 0;
  let pendingUrl;

  if (language) {
    const url = new URL(location.href);
    const requested = url.searchParams.get('lang');
    const option = Array.from(language.options).find(item => item.lang.toLowerCase() === requested?.toLowerCase());
    if (option) {
      url.searchParams.delete('lang');
      const target = new URL(option.value, base);
      if (!option.defaultSelected) {
        target.search = url.search;
        target.hash = url.hash;
        location.replace(target);
        return;
      }
      history.replaceState(history.state, '', url);
    }
    language.addEventListener('change', () => {
      const target = new URL(language.value, base);
      target.search = location.search;
      target.searchParams.delete('lang');
      target.hash = location.hash;
      location.assign(target);
    });
    window.addEventListener('pageshow', () => {
      language.querySelector('[selected]').selected = true;
    });
  }

  navigator.serviceWorker?.register(new URL('shared-cache.js', underkeepSharedAssets), {
    updateViaCache: 'none'
  }).catch(() => {
    // The site can load normally if the browser disallows service workers.
  });

  const pages = {
    home: {
      title: underkeepSiteName,
      styles: []
    },
    walkthrough: {
      title: '{{t:walkthrough.title|sq}} | ' + underkeepSiteName,
      styles: ['guide.css'],
      mount(signal) {
        const content = document.getElementById('walkthrough-content');
        try {
          spoilersAccepted ||= localStorage.getItem(spoilerStorageKey) === 'true';
        } catch {
          // Keep the choice for this visit when browser storage is unavailable.
        }
        if (spoilersAccepted) {
          content.hidden = false;
          return;
        }
        const notice = document.getElementById('spoiler-notice');
        notice.hidden = false;
        document.getElementById('reveal-walkthrough').addEventListener('click', () => {
          spoilersAccepted = true;
          try {
            localStorage.setItem(spoilerStorageKey, 'true');
          } catch {
            // The walkthrough can still be opened without persistent storage.
          }
          notice.hidden = true;
          content.hidden = false;
          document.getElementById('flow-title').focus({ preventScroll: true });
        }, { signal });
      }
    },
    map: {
      title: '{{t:maps.ui.title|sq}} | ' + underkeepSiteName,
      styles: ['map.css'],
      load: async url => {
        const mapReady = Promise.all([loadScript(mapNames), loadScript('map.js')]);
        await Promise.all([
          mapReady.then(() => loadMapRoute(url)),
          loadScript('data/map-puzzles.js'),
          loadScript('map-art.js', underkeepSharedAssets + 'scripts/map-art.js?v={{rev:scripts/map-art.js}}')
        ]);
        Object.assign(window.UNDERKEEP_ATLAS, underkeepMapArt);
      },
      loadRoute: loadMapRoute,
      mount: signal => mountUnderkeepAtlas(signal, group => loadMapDetails(signal, group))
    },
    guide: {
      title: underkeepSiteName,
      styles: ['guide.css', sheetStyle],
      load: url => {
        const guideReady = Promise.all([loadScript('guide-details.js'), loadScript('guide.js')]);
        return Promise.all([loadScript(mapNames), guideReady.then(() => loadGuideSection(url))]);
      },
      loadRoute: loadGuideSection,
      mount: signal => mountUnderkeepGuide(signal, () => navigate(new URL(location.href), 'guide'), loadGuideSearch)
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

  function assetUrl(file) {
    return new URL(file + '?v=' + bundleRevisions[file], bundle);
  }

  function loadScript(file, url = assetUrl('scripts/' + file)) {
    if (!scripts.has(file)) {
      const script = document.createElement('script');
      script.src = url;
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
      link.href = underkeepSharedAssets + 'css/' + file + '?v=' + styleRevisions[file];
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

  function loadTemplate(page) {
    if (!templates.has(page)) {
      const url = assetUrl('views/' + page + '.html');
      const loading = fetch(url).then(async response => {
        if (!response.ok) throw new Error('Unable to load ' + url);
        const template = document.createElement('template');
        template.innerHTML = await response.text();
        for (const image of template.content.querySelectorAll('img[src]')) {
          image.src = new URL(image.getAttribute('src'), bundle);
        }
        return template.content;
      }).catch(error => {
        templates.delete(page);
        throw error;
      });
      templates.set(page, loading);
    }
    return templates.get(page);
  }

  function loadMapRoute(url) {
    const id = underkeepMapId(url.hash);
    if (!underkeepMaps.has(id)) return loadScript('data/maps/' + id + '.js');
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
    const [key, entry, related] = hash.slice(1).split('/');
    const section = underkeepGuideSection(key);
    switch (section) {
      case 'items':
        return entry && entry !== 'category' ? loadGuideParts('items', 'map-points', 'catalog', 'enemies') : loadGuideParts('items');
      case 'recipes':
      case 'shops':
        return loadGuideParts('catalog', 'map-points', 'items', related && 'enemies', section === 'shops' && 'quests');
      case 'enemies':
      case 'quests':
        return loadGuideParts(section, entry && 'map-points', entry && 'items');
      default:
        return loadGuideParts('characters');
    }
  }

  function loadGuideSearch(section) {
    return loadGuideParts('map-points', section === 'items' && 'enemies');
  }

  async function loadMapDetails(signal, group) {
    await Promise.all([
      loadScript('guide-details.js').then(() => loadGuideParts('catalog', 'map-points', 'items', 'enemies', group === 'quests' && 'quests')),
      loadStyle(sheetStyle)
    ]);
    if (!signal.aborted) styles.get(sheetStyle).link.media = 'all';
  }

  function mount(page, signal) {
    mapLink.href = '?view=map';
    for (const [name, link] of [['home', homeLink], ['map', mapLink], ['walkthrough', document.getElementById('to-walkthrough')]]) {
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
          setStatus('{{t:site.loading|sq}}');
          await data;
        }
        if (ticket !== navigation || location.href !== url.href) return;
        refreshView?.();
        setStatus();
        return;
      }

      let template;
      if (page !== 'home') {
        setStatus('{{t:site.loading|sq}}');
        [template] = await Promise.all([loadTemplate(page), next.load?.(url), ...next.styles.map(loadStyle)]);
      }
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
      if (page === 'home') {
        if (hasPreviousView) view.replaceChildren(...homeContent);
      } else view.replaceChildren(template.cloneNode(true));
      view.dataset.ready = '';
      window.scrollTo(0, 0);
      refreshView = mount(page, lifecycle.signal);
      if (hasPreviousView && !view.querySelector('dialog[open]')) {
        view.querySelector('main').focus({ preventScroll: true });
      }
      setStatus();
    } catch (error) {
      if (ticket !== navigation) return;
      setStatus('{{t:site.load-failed|sq}}');
      view.removeAttribute('aria-busy');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '{{t:site.retry|sq}}';
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
