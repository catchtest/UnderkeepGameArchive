import json
import re
import unicodedata
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
DETAIL_SUBSETS = 8


def locale_characters():
    characters = {}
    for catalog in sorted((ROOT / 'locales').glob('*/*.json')):
        messages = json.loads(catalog.read_text(encoding='utf-8'))
        used = characters.setdefault(catalog.parent.name, set())
        used.update(ord(char) for text in messages.values() for char in text
                    if unicodedata.category(char) != 'Cc')
    return characters


def unicode_range(codepoints):
    ranges = []
    for codepoint in sorted(codepoints):
        if ranges and codepoint == ranges[-1][1] + 1:
            ranges[-1][1] = codepoint
        else:
            ranges.append([codepoint, codepoint])
    return ','.join(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}' for start, end in ranges)


def write_subset(source, destination, codepoints, options):
    with TTFont(source, recalcTimestamp=False) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        font.flavor = 'woff2'
        font.save(destination)


def split_font(stem, sheet):
    source = sheet.parent / f'{stem}.woff2'
    face_rule = re.compile(r'@font-face\s*\{[^{}]*' + re.escape(source.name) + r'[^{}]*\}')
    text = sheet.read_text(encoding='utf-8')
    faces = face_rule.findall(text)
    if len(faces) != 1:
        raise RuntimeError(f'Expected one {source.name} font rule in {sheet}.')
    face = faces[0]

    with TTFont(source) as font:
        supported = set(font.getBestCmap())
    heading_chars = Path(__file__).with_name('guide-font-common.txt').read_text(encoding='utf-8')
    common = supported & (set(map(ord, heading_chars)) | set(range(32, 127)))
    detail = sorted(supported - common)
    groups = [('common', common)]
    for index in range(DETAIL_SUBSETS):
        start = len(detail) * index // DETAIL_SUBSETS
        end = len(detail) * (index + 1) // DETAIL_SUBSETS
        groups.append((str(index + 1), detail[start:end]))

    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    css_ranges = {}
    for name, codepoints in groups:
        filename = f'{stem}-{name}.woff2'
        write_subset(source, sheet.parent / filename, codepoints, options)
        css_ranges[filename] = unicode_range(codepoints)

    rules = []
    for filename, chars in css_ranges.items():
        body = face[:-1].rstrip().rstrip(';').replace(source.name, filename)
        rules.append(f'{body};\n  unicode-range: {chars};\n}}')
    sheet.write_text(text.replace(face, '\n'.join(rules)), encoding='utf-8', newline='\n')
    source.unlink()


if __name__ == '__main__':
    sheet = DIST / 'fonts' / 'headings.css'
    if not sheet.is_file():
        raise RuntimeError('Build the website before splitting its fonts.')
    supported = set()
    for filename in re.findall(r'url\("([^"?]+)(?:\?[^"]*)?"\)', sheet.read_text(encoding='utf-8')):
        with TTFont(sheet.parent / filename) as font:
            supported.update(font.getBestCmap())
    for code, characters in locale_characters().items():
        missing = characters - supported
        if missing:
            raise ValueError(f'{code} needs more heading glyphs: {unicode_range(missing)}')
    print('Verified the published heading font subsets.')
