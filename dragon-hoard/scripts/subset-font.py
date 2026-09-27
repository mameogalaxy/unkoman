"""Zen Antique（OFL）を、ゲームで使う文字だけに絞った woff2 にする。

  python3 scripts/subset-font.py    (要: pip install fonttools brotli)

src/ 以下の .ts/.html に出てくる非ASCII文字 + ひらがな・カタカナ・全角記号を含める。
画面の文言を増やしたら再実行すること。元の TTF は無ければ google/fonts から取得する。
"""
import pathlib, re, urllib.request
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src_ttf = root / 'scripts/fonts/ZenAntique-Regular.ttf'
if not src_ttf.exists():
    src_ttf.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve('https://raw.githubusercontent.com/google/fonts/main/ofl/zenantique/ZenAntique-Regular.ttf', src_ttf)

chars = set()
for p in list(root.glob('src/**/*.ts')) + [root / 'index.html']:
    chars.update(c for c in p.read_text(encoding='utf-8') if ord(c) > 0x7f)
chars.update(chr(c) for c in range(0x20, 0x7f))
chars.update(chr(c) for c in range(0x3000, 0x3100))  # 記号・ひらがな・カタカナ
chars.update(chr(c) for c in range(0xff01, 0xff5f))  # 全角英数
chars.update('０１２３４５６７８９一二三四五六七八九十百千万')

out = root / 'src/assets/fonts/zen-antique-subset.woff2'
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
font = subset.load_font(str(src_ttf), opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(out), opts)
print(f'{len(chars)} chars -> {out.relative_to(root)} ({out.stat().st_size // 1024} KB)')
