import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const defaultLocale = 'zh-TW';
const localeRoot = join(root, 'locales');

async function readLocale(code) {
  if (Intl.getCanonicalLocales(code)[0] !== code) throw new Error('Use the canonical locale code for ' + code);
  const path = join(localeRoot, code);
  const messages = new Map();
  for (const file of (await readdir(path)).filter(name => name.endsWith('.json')).sort()) {
    const catalog = JSON.parse(await readFile(join(path, file), 'utf8'));
    for (const [key, message] of Object.entries(catalog)) {
      if (messages.has(key)) throw new Error(`Duplicate ${code} key ${key} in ${file}`);
      if (typeof message !== 'string') throw new Error(`Expected ${code} text for ${key} in ${file}`);
      messages.set(key, message);
    }
  }
  return { code, messages, directory: code === defaultLocale ? '' : 'languages/' + code };
}

const localeDirs = (await readdir(localeRoot, { withFileTypes: true })).filter(entry => entry.isDirectory());
const locales = await Promise.all(localeDirs.map(entry => entry.name).sort().map(readLocale));
if (!locales.some(locale => locale.code === defaultLocale)) throw new Error('Missing ' + defaultLocale);
locales.sort((a, b) => Number(b.code === defaultLocale) - Number(a.code === defaultLocale));

const jsString = value => JSON.stringify(value).slice(1, -1);
const singleQuoted = value => jsString(value).replace(/\\"|'/g, match => match === "'" ? "\\'" : '"');
const identifier = /^[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*$/u;
const markupText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cssString = value => value.replace(/["\\\u0000-\u001f\u007f]/g, char => '\\' + char.codePointAt(0).toString(16) + ' ');
const defaultFormat = { '.js': jsString, '.css': cssString, '.html': markupText, '.svg': markupText };
const formats = {
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

function languageMenu(current) {
  const label = formats.attr(messageFor(current, 'site.language-switcher', 'index.html'));
  const options = locales.map(locale => {
    const name = markupText(messageFor(locale, 'site.language-name', 'index.html'));
    const path = posix.relative(current.directory, locale.directory);
    const url = path ? path + '/' : './';
    return '<option lang="' + locale.code + '" value="' + url + '"' + (locale === current ? ' selected' : '') + '>' + name + '</option>';
  });
  if (locales.length === 1) return '';
  return '  <select id="site-language" aria-label="' + label + '">' + options.join('') + '</select>\n';
}

function render(text, file, locale, menu) {
  const result = text.replace(/\{\{t:([\w.-]+)(?:\|(\w+))?\}\}/g, (_, key, format) => {
    if (format && !Object.hasOwn(formats, format)) throw new Error(`Unknown locale format ${format} in ${file}`);
    const encode = format ? formats[format] : defaultFormat[extname(file)];
    if (!encode) throw new Error(`Unsupported template file ${file}`);
    return encode(messageFor(locale, key, file));
  });
  if (/\{\{t:/.test(result)) throw new Error(`Invalid locale reference in ${file}`);
  return result.replaceAll('{{site:assets}}', locale.directory ? '../../' : '')
    .replace('{{site:language-menu}}', () => menu);
}

const templates = [];
for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  const relativePath = relative(source, file);
  templates.push([relativePath, await readFile(file, 'utf8')]);
}

const renderedFiles = locales.flatMap(locale => {
  const menu = languageMenu(locale);
  return templates.map(([file, text]) => [join(locale.directory, file), render(text, file, locale, menu)]);
});
const previousOutput = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (previousOutput && !previousOutput.isDirectory()) throw new Error('Expected dist/ to be a directory');
if (previousOutput) await rm(output, { recursive: true });
await mkdir(output, { recursive: true });
for (const asset of ['fonts', 'images', 'google2bb38367b58a7b42.html']) {
  await cp(join(root, asset), join(output, asset), { recursive: true });
}

for (const [file, content] of renderedFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}

console.log(`Built ${locales.map(locale => locale.code).join(', ')} in dist/ (${renderedFiles.length} site files).`);
