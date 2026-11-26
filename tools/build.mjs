import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const { values } = parseArgs({ options: { 'default-locale': { type: 'string', default: 'en' } } });
const defaultLocale = values['default-locale'];
const localeRoot = join(root, 'locales');
const publicRoot = 'https://catchtest.github.io/UnderkeepGameArchive/';

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

async function readLocale(code) {
  if (Intl.getCanonicalLocales(code)[0] !== code) throw new Error('Use the canonical locale code for ' + code);
  const path = join(localeRoot, code);
  const messages = new Map();
  for (const file of (await readdir(path)).filter(name => name.endsWith('.json')).sort()) {
    const catalog = JSON.parse(await readFile(join(path, file), 'utf8'));
    for (const [key, message] of Object.entries(catalog)) {
      if (messages.has(key)) throw new Error(`Duplicate ${code} key ${key} in ${file}`);
      if (typeof message !== 'string') throw new Error(`Expected ${code} text for ${key} in ${file}`);
      const missing = message.match(missingGlyph);
      if (missing) throw new Error(`Missing heading glyph ${missing[0]} in ${code}/${file} (${key})`);
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

const cachedAssets = new Map();
const assetRevisions = new Map();
function addCachedAsset(file, content) {
  cachedAssets.set(file, content);
  assetRevisions.set(file.split(sep).join('/'), createHash('sha256').update(content).digest('hex').slice(0, 16));
}

const sharedTemplates = new Set(['css/site.css', 'css/home.css', 'css/map.css', 'scripts/map-art.js']);
for (const entry of await readdir(join(root, 'images'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  addCachedAsset(relative(root, file), await readFile(file));
}
const mapImageRevisions = Object.fromEntries([...assetRevisions].filter(([file]) => file.startsWith('images/maps/')));

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
    .replace('{{site:map-image-revisions}}', () => JSON.stringify(mapImageRevisions))
    .replace(/\{\{rev:([\w./-]+)\}\}/g, (_, asset) => {
      const revision = assetRevisions.get(asset) ?? assetRevisions.get(locale.code + '/' + asset);
      if (!revision) throw new Error(`Unknown cached asset ${asset} in ${file}`);
      return revision;
    });
  return extname(file) === '.svg' && content.includes('class="paths"') ? layoutFlowchart(content) : content;
}

const templates = [];
let cacheWorker;
for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  const relativePath = relative(source, file);
  const text = await readFile(file, 'utf8');
  if (relativePath === 'shared-cache.js') cacheWorker = text;
  else if (sharedTemplates.has(relativePath.split(sep).join('/'))) {
    if (text.includes('{{t:')) throw new Error('Shared asset contains a translation: ' + relativePath);
    addCachedAsset(relativePath, Buffer.from(render(text, relativePath, rootLocale, '', '')));
  } else if (extname(relativePath) === '.svg') {
    for (const locale of locales) {
      const file = join(locale.code, relativePath);
      addCachedAsset(file, Buffer.from(render(text, relativePath, locale, '')));
    }
  } else templates.push([relativePath, text]);
}

const renderedFiles = locales.flatMap(locale => {
  const menu = languageMenu(locale, locale.code);
  return templates.map(([file, text]) => [join(locale.code, file), render(text, file, locale, menu)]);
});
const [, indexTemplate] = templates.find(([file]) => file === 'index.html');
renderedFiles.push(['index.html', render(indexTemplate, 'index.html', rootLocale, languageMenu(rootLocale, ''), '')]);

const previousOutput = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (previousOutput && !previousOutput.isDirectory()) throw new Error('Expected dist/ to be a directory');
await mkdir(output, { recursive: true });
const files = new Map(renderedFiles.map(([file, text]) => [file, Buffer.from(text)]));
for (const [file, content] of cachedAssets) files.set(file, content);
files.set('shared-cache.js', Buffer.from(cacheWorker.replace('{{site:asset-revisions}}', () =>
  JSON.stringify(Object.fromEntries([...assetRevisions].sort(([a], [b]) => a.localeCompare(b)))))));
const assets = ['google2bb38367b58a7b42.html'];
for (const entry of await readdir(fontDir, { recursive: true, withFileTypes: true })) {
  if (entry.isFile()) assets.push(relative(root, join(entry.parentPath, entry.name)));
}
for (let i = 0; i < assets.length; i += 32) {
  await Promise.all(assets.slice(i, i + 32).map(async file => files.set(file, await readFile(join(root, file)))));
}
const directories = new Set();
for (const file of files.keys()) {
  for (let dir = dirname(file); dir !== '.' && !directories.has(dir); dir = dirname(dir)) directories.add(dir);
}
const existing = new Set();
async function cleanDirectory(dir) {
  for (const entry of await readdir(join(output, dir), { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory() && directories.has(file)) await cleanDirectory(file);
    else if (entry.isFile() && files.has(file)) existing.add(file);
    else {
      const target = resolve(output, file);
      if (!target.startsWith(output + sep)) throw new Error('Unexpected output path: ' + target);
      await rm(target, { recursive: entry.isDirectory(), force: true });
    }
  }
}
await cleanDirectory('.');
await Promise.all([...directories].map(dir => mkdir(join(output, dir), { recursive: true })));
const entries = [...files];
for (let i = 0; i < entries.length; i += 32) {
  await Promise.all(entries.slice(i, i + 32).map(async ([file, content]) => {
    const destination = join(output, file);
    if (existing.has(file) && (await readFile(destination)).equals(content)) return;
    await writeFile(destination, content);
  }));
}

console.log(`Built ${locales.map(locale => locale.code).join(', ')} in dist/ (${files.size} files).`);
