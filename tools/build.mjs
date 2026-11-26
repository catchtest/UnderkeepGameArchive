import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const locale = Intl.getCanonicalLocales(process.argv[2] ?? 'zh-TW')[0];
const localeDir = join(root, 'locales', locale);
const messages = new Map();

for (const file of (await readdir(localeDir)).filter(name => name.endsWith('.json')).sort()) {
  const catalog = JSON.parse(await readFile(join(localeDir, file), 'utf8'));
  for (const [key, message] of Object.entries(catalog)) {
    if (messages.has(key)) throw new Error(`Duplicate locale key ${key} in ${file}`);
    if (typeof message !== 'string') throw new Error(`Expected text for ${key} in ${file}`);
    messages.set(key, message);
  }
}

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
  attr: value => markupText(value).replaceAll('"', '&quot;')
};

function render(text, file) {
  const result = text.replace(/\{\{t:([\w.-]+)(?:\|(\w+))?\}\}/g, (_, key, format) => {
    if (format && !Object.hasOwn(formats, format)) throw new Error(`Unknown locale format ${format} in ${file}`);
    const encode = format ? formats[format] : defaultFormat[extname(file)];
    if (!encode) throw new Error(`Unsupported template file ${file}`);
    if (!messages.has(key)) throw new Error(`Missing ${locale} text for ${key} in ${file}`);
    return encode(messages.get(key));
  });
  if (/\{\{t:/.test(result)) throw new Error(`Invalid locale reference in ${file}`);
  return result;
}

const renderedFiles = [];
for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  const relativePath = relative(source, file);
  renderedFiles.push([relativePath, render(await readFile(file, 'utf8'), relativePath)]);
}

await mkdir(output, { recursive: true });
for (const asset of ['fonts', 'images', 'google2bb38367b58a7b42.html']) {
  await cp(join(root, asset), join(output, asset), { recursive: true });
}

for (const [file, content] of renderedFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}

console.log(`Built ${locale} in dist/ (${renderedFiles.length} site files).`);
