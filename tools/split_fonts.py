import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
FONT = 'noto-serif-tc.woff2'
FACE_RULE = re.compile(r'@font-face\s*\{[^{}]*noto-serif-tc\.woff2[^{}]*\}')
DETAIL_SUBSETS = 8


def unicode_range(codepoints):
    ranges = []
    for codepoint in sorted(codepoints):
        if ranges and codepoint == ranges[-1][1] + 1:
            ranges[-1][1] = codepoint
        else:
            ranges.append([codepoint, codepoint])
    return ','.join(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}' for start, end in ranges)


def write_subset(filename, codepoints, options):
    with TTFont(ROOT / 'fonts' / FONT, recalcTimestamp=False) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        font.flavor = 'woff2'
        font.save(DIST / 'fonts' / filename)


def main():
    sheets = list(DIST.glob('css/sheet.css')) + sorted(DIST.glob('languages/*/css/sheet.css'))
    if not sheets:
        raise RuntimeError('Build the website before splitting its fonts.')
    styles = []
    for sheet in sheets:
        text = sheet.read_text(encoding='utf-8')
        faces = FACE_RULE.findall(text)
        if len(faces) != 1:
            raise RuntimeError(f'Expected one Noto Serif TC font rule in {sheet}.')
        styles.append((sheet, text, faces[0]))

    with TTFont(ROOT / 'fonts' / FONT) as font:
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
        filename = f'noto-serif-tc-{name}.woff2'
        write_subset(filename, codepoints, options)
        css_ranges[filename] = unicode_range(codepoints)

    for sheet, text, face in styles:
        rules = []
        for filename, chars in css_ranges.items():
            body = face[:-1].rstrip().rstrip(';').replace(FONT, filename)
            rules.append(f'{body};\n  unicode-range: {chars};\n}}')
        sheet.write_text(text.replace(face, '\n'.join(rules)), encoding='utf-8', newline='\n')
    (DIST / 'fonts' / FONT).unlink()


if __name__ == '__main__':
    main()
