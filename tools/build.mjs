import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const { values } = parseArgs({ options: {
  'default-locale': { type: 'string', default: 'en' },
  minify: { type: 'boolean' }
} });
const defaultLocale = values['default-locale'];
const localeRoot = join(root, 'locales');
const publicRoot = 'https://catchtest.github.io/UnderkeepGameArchive/';
const esbuild = values.minify ? await import('esbuild') : null;

async function mapBatches(entries, transform) {
  const results = [];
  for (let i = 0; i < entries.length; i += 32) {
    results.push(...await Promise.all(entries.slice(i, i + 32).map(transform)));
  }
  return results;
}

async function readTree(directory, encoding) {
  const entries = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile());
  return mapBatches(entries, async entry => {
    const path = join(entry.parentPath, entry.name);
    const content = await readFile(path, encoding);
    return [relative(directory, path), encoding === 'utf8' ? content.replaceAll('\r\n', '\n') : content];
  });
}

async function compile(file, text) {
  const loader = extname(file).slice(1);
  if (!esbuild || (loader !== 'css' && loader !== 'js')) return Buffer.from(text);
  const { code } = await esbuild.transform(text, {
    loader, sourcefile: file, minify: true, charset: 'utf8', legalComments: 'inline'
  });
  return Buffer.from(code);
}

function revisionTable(entries) {
  const table = Object.fromEntries(entries);
  return JSON.stringify(Object.fromEntries(Object.keys(table).sort().map(key => [key, table[key]])));
}

// Check new translations against the ranges the browser can actually load.
const fontDir = join(root, 'fonts');
const headingCSS = await readFile(join(fontDir, 'headings.css'), 'utf8');
const fontFiles = new Set(await readdir(fontDir));
const headingRanges = [];
for (const [face] of headingCSS.matchAll(/@font-face\s*\{[^}]+\}/g)) {
  const filename = face.match(/url\("([^"?]+)(?:\?[^"]*)?"\)/)?.[1];
  if (!fontFiles.has(filename)) throw new Error('Missing heading font: ' + filename);
  const ranges = face.match(/unicode-range:\s*([^;]+);/)?.[1];
  if (!ranges) throw new Error('Missing character ranges for ' + filename);
  for (const range of ranges.split(',')) {
    const [, first, last] = /^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/.exec(range.trim());
    headingRanges.push('\\u{' + first + '}' + (last ? '-\\u{' + last + '}' : ''));
  }
}
const missingGlyph = new RegExp('[^\\p{Cc}' + headingRanges.join('') + ']', 'u');
const checkedGlyphs = new Set();

async function readLocale(code) {
  if (Intl.getCanonicalLocales(code)[0] !== code) throw new Error('Use the canonical locale code for ' + code);
  const path = join(localeRoot, code);
  const messages = new Map();
  const filenames = (await readdir(path)).filter(name => name.endsWith('.json')).sort();
  const catalogs = await mapBatches(filenames, async file => [file, await readFile(join(path, file), 'utf8')]);
  for (const [file, catalog] of catalogs) {
    for (const [key, message] of Object.entries(JSON.parse(catalog))) {
      if (messages.has(key)) throw new Error(`Duplicate ${code} key ${key} in ${file}`);
      if (typeof message !== 'string') throw new Error(`Expected ${code} text for ${key} in ${file}`);
      if (!checkedGlyphs.has(message)) {
        const missing = message.match(missingGlyph);
        if (missing) throw new Error(`Missing heading glyph ${missing[0]} in ${code}/${file} (${key})`);
        checkedGlyphs.add(message);
      }
      messages.set(key, message);
    }
  }
  return { code, messages };
}

const localeDirs = (await readdir(localeRoot, { withFileTypes: true })).filter(entry => entry.isDirectory());
const locales = await Promise.all(localeDirs.map(entry => entry.name).sort().map(readLocale));
const rootLocale = locales.find(locale => locale.code === defaultLocale);
if (!rootLocale) throw new Error('Unknown default locale: ' + defaultLocale);
const languageOrder = code => code === 'zh-TW' ? 1 : code === 'zh-CN' ? 2 : 0;
locales.sort((a, b) => languageOrder(a.code) - languageOrder(b.code));
const alternateLinks = [...locales.map(({ code }) =>
  `<link rel="alternate" hreflang="${code}" href="${publicRoot}${code}/">`),
  `<link rel="alternate" hreflang="x-default" href="${publicRoot}">`].join('\n');

const files = new Map();
const assetRevisions = new Map();
const webPath = path => path.split(sep).join('/');
function addCachedAsset(file, content) {
  files.set(file, content);
  assetRevisions.set(webPath(file), createHash('sha256').update(content).digest('hex').slice(0, 16));
}

const sharedTemplates = new Set(['css/site.css', 'css/map.css', 'css/guide.css', 'css/sheet.css', 'scripts/map-art.js']);
const [images, sourceFiles, fonts] = await Promise.all([
  readTree(join(root, 'images')),
  readTree(source, 'utf8'),
  readTree(fontDir)
]);
for (const [file, content] of images) addCachedAsset(join('images', file), content);
const mapImageRevisions = revisionTable([...assetRevisions].filter(([file]) => file.startsWith('images/maps/')));
for (const [file, content] of fonts) {
  if (extname(file) === '.woff2') addCachedAsset(join('fonts', file), content);
  else if (file !== 'headings.css') files.set(join('fonts', file), content);
}
const revisionedHeadings = headingCSS.replaceAll('\r\n', '\n')
  .replace(/url\("([\w.-]+\.woff2)(?:\?[^\"]*)?"\)/g, (_, file) => `url("${file}?v=${assetRevisions.get('fonts/' + file)}")`);
const headingPath = join('fonts', 'headings.css');
addCachedAsset(headingPath, await compile(headingPath, revisionedHeadings));

const jsString = value => JSON.stringify(value).slice(1, -1);
const singleQuoted = value => jsString(value).replace(/\\"|'/g, match => match === "'" ? "\\'" : '"');
const identifier = /^[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*$/u;
const markupText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cssString = value => value.replace(/["\\\u0000-\u001f\u007f]/g, char => '\\' + char.codePointAt(0).toString(16) + ' ');
const defaultFormat = { '.js': jsString, '.css': cssString, '.html': markupText, '.svg': markupText };
const formats = {
  length: value => String(value.length),
  sq: singleQuoted,
  key: value => identifier.test(value) ? value : JSON.stringify(value),
  member: value => identifier.test(value) ? '.' + value : '[' + JSON.stringify(value) + ']',
  re: value => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'),
  pattern: value => value,
  json: value => JSON.stringify(JSON.parse(value)),
  attr: value => markupText(value).replaceAll('"', '&quot;')
};

function messageFor({ code, messages }, key, file) {
  if (!messages.has(key)) throw new Error(`Missing ${code} text for ${key} in ${file}`);
  return messages.get(key);
}

function languageMenu(current, directory) {
  const label = formats.attr(messageFor(current, 'site.language-switcher', 'index.html'));
  const options = locales.map(locale => {
    const name = markupText(messageFor(locale, 'site.language-name', 'index.html'));
    const path = posix.relative(directory, locale.code);
    const url = path ? path + '/' : './';
    return '<option lang="' + locale.code + '" value="' + url + '"' + (locale === current ? ' selected' : '') + '>' + name + '</option>';
  });
  if (locales.length === 1) return '';
  return '  <select id="site-language" aria-label="' + label + '">' + options.join('') + '</select>\n';
}

function translationCredit(locale) {
  const key = 'site.home.translator';
  if (!locale.messages.has(key)) return '';
  const translator = markupText(messageFor(locale, key, 'index.html'));
  const after = markupText(messageFor(locale, 'site.home.credit-after-link', 'index.html'));
  return '<a href="https://www.bilibili.com/video/BV1tS4n6CET2/" lang="zh-Hans">' + translator + '</a>' + after;
}

// Widen the diagram's horizontal coordinates for translations, keeping fonts,
// corner radii, arrowheads and vertical spacing in their original pixel units.
function layoutFlowchart(svg) {
  const [header, drawing] = svg.split('</defs>');
  const width = Number(header.match(/<svg\b[^>]*\bwidth="(\d+)"/)[1]);
  const viewBox = /(<svg\b[^>]*\bviewBox="0 0 )(\d+)/;
  const originalWidth = Number(header.match(viewBox)[2]);
  if (width === originalWidth) return svg;
  const scaleX = x => Number((Number(x) * width / originalWidth).toFixed(3));
  const positioned = drawing.replace(/<(?:rect|text|path|g)\b[^>]*>/g, tag => tag
    .replace(/\b(x|width)="(-?[\d.]+)"/g, (_, attr, x) => `${attr}="${scaleX(x)}"`)
    .replace(/translate\((-?[\d.]+) /g, (_, x) => `translate(${scaleX(x)} `)
    // The connectors use absolute M/H/V commands. V has no x coordinate.
    .replace(/\bd="([^"]+)"/g, (_, path) => 'd="' +
      path.replace(/([MH])\s*(-?[\d.]+)/g, (_, command, x) => command + scaleX(x)) + '"'));
  return header.replace(viewBox, (_, start) => start + width) + '</defs>' + positioned;
}

function render(text, file, locale, menu, directory = locale.code) {
  const defaultEncode = defaultFormat[extname(file)];
  const result = text.replace(/\{\{t:([\w.-]+)(?:\|(\w+))?\}\}/g, (_, key, format) => {
    if (format && !Object.hasOwn(formats, format)) throw new Error(`Unknown locale format ${format} in ${file}`);
    const encode = format ? formats[format] : defaultEncode;
    if (!encode) throw new Error(`Unsupported template file ${file}`);
    return encode(messageFor(locale, key, file));
  });
  if (/\{\{t:/.test(result)) throw new Error(`Invalid locale reference in ${file}`);
  const content = result.replaceAll('{{site:assets}}', directory ? '../' : '')
    .replaceAll('{{site:bundle}}', directory ? '' : locale.code + '/')
    .replace('{{site:alternate-links}}', alternateLinks)
    .replace('{{site:language-menu}}', () => menu)
    .replace('{{site:translation-credit}}', () => translationCredit(locale))
    .replace('{{site:map-image-revisions}}', () => mapImageRevisions)
    .replace(/\{\{rev:([\w./-]+)\}\}/g, (_, asset) => {
      const revision = assetRevisions.get(asset) ?? assetRevisions.get(locale.code + '/' + asset);
      if (!revision) throw new Error(`Unknown cached asset ${asset} in ${file}`);
      return revision;
    });
  return extname(file) === '.svg' && content.includes('class="paths"') ? layoutFlowchart(content) : content;
}

const siteScript = join('scripts', 'site.js');
const sourceByPath = new Map(sourceFiles);
const indexTemplate = sourceByPath.get('index.html');
const cacheWorker = sourceByPath.get('shared-cache.js');
const bundleTemplate = sourceByPath.get(siteScript);
sourceByPath.delete('index.html');
sourceByPath.delete('shared-cache.js');
sourceByPath.delete(siteScript);

const localizedTemplates = [];
const sharedAssets = [];
for (const [relativePath, text] of sourceByPath) {
  const path = webPath(relativePath);
  if (sharedTemplates.has(path)) {
    if (text.includes('{{t:')) throw new Error('Shared asset contains a translation: ' + relativePath);
    sharedAssets.push([relativePath, render(text, relativePath, rootLocale, '', '')]);
  } else if (extname(relativePath) === '.svg') {
    for (const locale of locales) {
      const file = join(locale.code, relativePath);
      addCachedAsset(file, Buffer.from(render(text, relativePath, locale, '')));
    }
  } else {
    const template = path.startsWith('scripts/data/guide/')
      ? text.replace(/"(images\/[\w./-]+\.webp)"/g, (_, asset) => `"${asset}?v={{rev:${asset}}}"`)
      : text;
    localizedTemplates.push([relativePath, template]);
  }
}

// Fingerprint the compiled bytes before generating the references to them.
const localizedAssets = locales.flatMap(locale => localizedTemplates.map(([file, text]) =>
  [join(locale.code, file), render(text, file, locale, '')]));
await mapBatches([...sharedAssets, ...localizedAssets], async ([file, text]) => {
  addCachedAsset(file, await compile(file, text));
});

await Promise.all(locales.map(async locale => {
  const bundleRevisions = revisionTable(localizedTemplates.map(([file]) =>
    [webPath(file), assetRevisions.get(locale.code + '/' + webPath(file))]));
  const file = join(locale.code, siteScript);
  const script = render(bundleTemplate, siteScript, locale, '')
    .replace('{{site:bundle-revisions}}', () => bundleRevisions);
  addCachedAsset(file, await compile(file, script));
  files.set(join(locale.code, 'index.html'), Buffer.from(render(indexTemplate, 'index.html', locale, languageMenu(locale, locale.code))));
}));
files.set('index.html', Buffer.from(render(indexTemplate, 'index.html', rootLocale, languageMenu(rootLocale, ''), '')));
files.set('shared-cache.js', await compile('shared-cache.js', cacheWorker.replace('{{site:asset-revisions}}', () => revisionTable(assetRevisions))));
const verificationFile = 'google2bb38367b58a7b42.html';
files.set(verificationFile, await readFile(join(root, verificationFile)));

const previousOutput = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (previousOutput && !previousOutput.isDirectory()) throw new Error('Expected dist/ to be a directory');
await mkdir(output, { recursive: true });
const directories = new Set();
for (const file of files.keys()) {
  for (let dir = dirname(file); dir !== '.' && !directories.has(dir); dir = dirname(dir)) directories.add(dir);
}
const existing = new Set();
async function cleanDirectory(dir) {
  const entries = await readdir(join(output, dir), { withFileTypes: true });
  await Promise.all(entries.map(async entry => {
    const file = join(dir, entry.name);
    if (entry.isDirectory() && directories.has(file)) {
      directories.delete(file);
      await cleanDirectory(file);
    } else if (entry.isFile() && files.has(file)) existing.add(file);
    else {
      const target = resolve(output, file);
      if (!target.startsWith(output + sep)) throw new Error('Unexpected output path: ' + target);
      await rm(target, { recursive: entry.isDirectory(), force: true });
    }
  }));
}
if (previousOutput) await cleanDirectory('.');
await mapBatches([...directories], dir => mkdir(join(output, dir), { recursive: true }));
await mapBatches([...files], async ([file, content]) => {
  const destination = join(output, file);
  if (existing.has(file) && (await readFile(destination)).equals(content)) return;
  await writeFile(destination, content);
});

console.log(`Built ${locales.map(locale => locale.code).join(', ')} in dist/ (${files.size} files).`);
