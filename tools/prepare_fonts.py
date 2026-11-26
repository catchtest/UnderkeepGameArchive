"""Rebuild the WOFF2s from google/fonts ofl/{notoserif,notoseriftc,notoserifsc}."""

import argparse
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from split_fonts import locale_characters, split_font, unicode_range


ROOT = Path(__file__).resolve().parents[1]


def prepare(source, destination, characters):
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    with TTFont(source, recalcTimestamp=False) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=characters)
        subsetter.subset(font)
        if any(axis.axisTag == 'wdth' for axis in font['fvar'].axes):
            instantiateVariableFont(font, {'wdth': 100}, inplace=True)
        font.flavor = 'woff2'
        font.save(destination)
        return set(font.getBestCmap())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, help='Directory containing the original TTFs')
    directory = parser.parse_args().directory
    locales = locale_characters()
    western = set(range(32, 127)).union(*(chars for code, chars in locales.items() if not code.startswith('zh-')))
    with TemporaryDirectory() as temp:
        output = Path(temp)
        sheet = output / 'headings.css'
        latin = prepare(directory / 'NotoSerif[wdth,wght].ttf', output / 'noto-serif.woff2', western)
        template = Path(__file__).with_name('headings.css').read_text(encoding='utf-8')
        sheet.write_text(template.replace('{{western-range}}', unicode_range(latin)), encoding='utf-8', newline='\n')
        supported = latin.copy()
        for code, stem, filename in [('zh-TW', 'noto-serif-tc', 'NotoSerifTC[wght].ttf'),
                                     ('zh-CN', 'noto-serif-sc', 'NotoSerifSC[wght].ttf')]:
            supported.update(prepare(directory / filename, output / f'{stem}.woff2', western | locales[code]))
            split_font(stem, sheet)
        for code, chars in locales.items():
            if chars - supported:
                raise ValueError(f'{code} needs more heading glyphs: {unicode_range(chars - supported)}')
        for file in output.iterdir():
            shutil.copyfile(file, ROOT / 'fonts' / file.name)
