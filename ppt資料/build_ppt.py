# -*- coding: utf-8 -*-
"""都知事杯オープンデータ・ハッカソン2026 — 2分プレゼン資料（4枚）を生成する。

参考にしたレイアウト：ppt資料/ の戦略コンサル2本
  - アクションタイトル（結論を1文・上部・アクセント色）
  - 2パネル＋細い縦罫
  - コールアウト箱＋引き出し線
  - 出典行（左下・極小グレー）
密度は真似しない。あれは委員が手元で読む資料、こちらは2分動画で「見る」もの。

フォントは Meiryo UI（欧文 latin ／ 和文 ea ／ 記号 cs のすべて）。
"""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
from pptx.oxml.ns import qn

FONT = 'Meiryo UI'
# src/ui/palette.ts の実配色に合わせる（スライドと実画面の色を一致させる）
ACCENT      = RGBColor(0x1C, 0x5C, 0xAB)   # #1c5cab
ACCENT_DEEP = RGBColor(0x0D, 0x36, 0x6B)   # #0d366b
ACCENT_MID  = RGBColor(0x55, 0x98, 0xE7)   # #5598e7
ACCENT_PALE = RGBColor(0x86, 0xB6, 0xEF)   # #86b6ef
TINT        = RGBColor(0xEC, 0xF2, 0xFB)
INK         = RGBColor(0x1A, 0x1A, 0x1A)
GREY        = RGBColor(0x5A, 0x5A, 0x5A)
GREY_LT     = RGBColor(0x9A, 0x9A, 0x9A)
RULE        = RGBColor(0xD5, 0xD5, 0xD1)
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)

SW, SH = 13.333, 7.5
L, R = 0.62, 0.62
CW = SW - L - R

SOURCE = ('出典：東京都福祉局「東京の学童クラブ事業実施状況」／東京都教育庁「教育人口等推計」／'
          '東京都教育庁「公立学校統計調査報告書（東京都公立学校一覧）」'
          '（いずれも東京都オープンデータカタログ・CC BY 4.0）')

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(SW), Inches(SH)
BLANK = prs.slide_layouts[6]


# ── 部品 ──────────────────────────────────────────────
def tb(slide, x, y, w, h, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    tf.paragraphs[0].alignment = align
    return box, tf


def put(tf, text, size, color=INK, bold=False, space_after=0, line_sp=None, align=None, first=False):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    if align is not None:
        p.alignment = align
    p.space_after = Pt(space_after)
    if line_sp:
        p.line_spacing = line_sp
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    r.font.name = FONT
    return p


def rect(slide, x, y, w, h, fill=None, outline=None, lw=1.0, dash=False, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.shadow.inherit = False
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if outline is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = outline
        s.line.width = Pt(lw)
        if dash:
            ln = s.line._get_or_add_ln()
            ln.append(ln.makeelement(qn('a:prstDash'), {'val': 'dash'}))
    tf = s.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.14)
    tf.margin_top = tf.margin_bottom = Inches(0.08)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    return s


def line(slide, x1, y1, x2, y2, color=RULE, lw=1.0, arrow=False):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,
                                   Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(lw)
    if arrow:
        ln = c.line._get_or_add_ln()
        ln.append(ln.makeelement(qn('a:tailEnd'),
                                 {'type': 'triangle', 'w': 'med', 'len': 'med'}))
    return c


def title(slide, text, sub=None):
    _, tf = tb(slide, L, 0.40, CW, 1.05)
    put(tf, text, 26, ACCENT, bold=True, line_sp=1.22, first=True)
    if sub:
        _, tf2 = tb(slide, L, 1.44, CW, 0.34)
        put(tf2, sub, 12.5, GREY, first=True)


def footer(slide, n, source=SOURCE):
    _, tf = tb(slide, L, 6.98, CW - 0.9, 0.42)
    put(tf, source, 7.5, GREY_LT, line_sp=1.25, first=True)
    _, tf2 = tb(slide, SW - R - 0.6, 6.98, 0.6, 0.25, align=PP_ALIGN.RIGHT)
    put(tf2, str(n), 9, GREY_LT, align=PP_ALIGN.RIGHT, first=True)


def placeholder(slide, x, y, w, h, label, note):
    """実画面のキャプチャを貼る枠。貼ったらこの図形は削除する。"""
    s = rect(slide, x, y, w, h, fill=TINT, outline=ACCENT_MID, lw=1.25, dash=True)
    tf = s.text_frame
    put(tf, label, 15, ACCENT, bold=True, align=PP_ALIGN.CENTER, space_after=5, first=True)
    put(tf, note, 10.5, GREY, align=PP_ALIGN.CENTER, line_sp=1.4)
    return s


def band(slide, x, y, w, text, fill=ACCENT):
    s = rect(slide, x, y, w, 0.36, fill=fill)
    put(s.text_frame, text, 12, WHITE, bold=True, align=PP_ALIGN.CENTER, first=True)
    return s


def kicker(slide, y, text):
    s = rect(slide, L, y, CW, 0.62, fill=TINT)
    put(s.text_frame, text, 16, ACCENT_DEEP, bold=True, align=PP_ALIGN.CENTER, first=True)
    return s


# ── 1枚目：6年のズレ ─────────────────────────────────
s1 = prs.slides.add_slide(BLANK)
title(s1, '家を買う年と、学童に入れない年が、6年ずれている',
      '意思決定する時点と、痛みが出る時点')

YL = 3.85
line(s1, 1.55, YL, 11.75, YL, color=RULE, lw=2.0)

for cx, col, year, desc, dark in [
    (2.45, GREY_LT, '2026年', '第一子が0歳。\n住宅ローンを組む', False),
    (10.85, ACCENT, '2032年 4月', '子が小1。\n学童に入れない', True),
]:
    d = 0.30
    rect(s1, cx - d / 2, YL - d / 2, d, d, fill=col, shape=MSO_SHAPE.OVAL)
    _, tf = tb(s1, cx - 1.7, YL - 1.05, 3.4, 0.5, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.BOTTOM)
    put(tf, year, 20, ACCENT_DEEP if dark else GREY, bold=True, align=PP_ALIGN.CENTER, first=True)
    _, tf = tb(s1, cx - 1.7, YL + 0.34, 3.4, 0.9, align=PP_ALIGN.CENTER)
    for i, ln_ in enumerate(desc.split('\n')):
        put(tf, ln_, 13.5, INK if dark else GREY, bold=dark,
            align=PP_ALIGN.CENTER, line_sp=1.35, first=(i == 0))

line(s1, 4.35, YL, 10.58, YL, color=ACCENT, lw=2.5, arrow=True)
g = rect(s1, 6.10, YL - 0.27, 1.15, 0.54, fill=WHITE)
put(g.text_frame, '6年', 22, ACCENT, bold=True, align=PP_ALIGN.CENTER, first=True)

_, tf = tb(s1, L, 5.30, CW, 0.5, align=PP_ALIGN.CENTER)
put(tf, 'この6年のあいだに、取り返しのつかない選択が終わっている',
    15, GREY, align=PP_ALIGN.CENTER, first=True)

kicker(s1, 5.95, '保育園の壁は下がった。壁が消えたのではなく、小学校に移っただけ。')
footer(s1, 1, '出典：東京都福祉局「東京の学童クラブ事業実施状況」ほか'
              '（東京都オープンデータカタログ・CC BY 4.0）')


# ── 2枚目：サービス提示 ───────────────────────────────
s2 = prs.slides.add_slide(BLANK)
title(s2, '生まれ年を入れるだけで、その子が小1になる年の東京が出る')

_, tf = tb(s2, L, 2.05, 4.3, 1.0)
put(tf, '小1で選ぶ街', 40, ACCENT, bold=True, line_sp=1.1, first=True)
_, tf = tb(s2, L, 3.02, 4.3, 0.5)
put(tf, '東京49自治体 × 入学年度2027〜2038', 12, GREY, first=True)

for i, (num, txt) in enumerate([('1', '生まれ年を入れる'),
                                ('2', '小1になる年度が決まる'),
                                ('3', '49自治体が並ぶ')]):
    y = 3.80 + i * 0.72
    n = rect(s2, L, y, 0.36, 0.36, fill=ACCENT, shape=MSO_SHAPE.OVAL)
    put(n.text_frame, num, 13, WHITE, bold=True, align=PP_ALIGN.CENTER, first=True)
    _, tf = tb(s2, L + 0.54, y + 0.05, 3.8, 0.4)
    put(tf, txt, 14.5, INK, first=True)

placeholder(s2, 5.25, 2.00, 7.46, 4.45,
            '▶ ここに実画面のキャプチャ（地図）',
            '2031年度・49自治体のコロプレス。\n'
            '推奨：横1680px以上／枠は 7.46 × 4.45 inch（比率 1.68 : 1）')
footer(s2, 2)


# ── 3枚目：デモ ──────────────────────────────────────
s3 = prs.slides.add_slide(BLANK)
_, tf = tb(s3, L, 0.42, 6.0, 0.35)
put(tf, '実際の画面', 13, GREY, bold=True, first=True)

placeholder(s3, L, 0.92, CW, 5.55,
            '▶ ここに実画面のキャプチャ／画面録画（全画面）',
            '中央区を選択 → 2031年度 →「882人分、足りない」→ 隣接区の比較。\n'
            '動画では40秒。枠は 12.09 × 5.55 inch（比率 2.18 : 1）')

co = rect(s3, 8.30, 1.55, 3.55, 1.30, fill=WHITE, outline=ACCENT, lw=1.75)
put(co.text_frame, '2031年度・中央区', 11, GREY, align=PP_ALIGN.CENTER, space_after=3, first=True)
put(co.text_frame, '882人分、足りない', 20, ACCENT, bold=True, align=PP_ALIGN.CENTER, space_after=3)
put(co.text_frame, '多く見れば 1,543人', 11, GREY, align=PP_ALIGN.CENTER)
line(s3, 8.30, 2.20, 7.10, 2.90, color=ACCENT, lw=1.5)

_, tf = tb(s3, L, 6.58, CW, 0.35)
put(tf, '※ 待機児童数では順位が付かない — 49自治体のうち18はゼロ。'
        'このサービスは「あなたの子が小1になる年」で並べ替える', 12, GREY, first=True)
footer(s3, 3)


# ── 4枚目：担保 ──────────────────────────────────────
s4 = prs.slides.add_slide(BLANK)
title(s4, '予測が何%外れるかを、自分で答え合わせした',
      '都の教育人口等推計を3ヴィンテージ突き合わせ、49自治体で実測（src/core/backtest.ts で再現できる）')

PT, PB = 1.98, 5.60
band(s4, L, PT, 5.55, '予測の外れ幅（実測・絶対誤差平均）')

cd = CategoryChartData()
cd.categories = ['1年先', '2年先']
cd.add_series('誤差', (0.93, 1.37))
gf = s4.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,
                         Inches(L), Inches(PT + 0.44), Inches(5.55), Inches(2.90), cd)
ch = gf.chart
ch.has_legend = False
ch.has_title = False
ch.font.size = Pt(13)
ch.font.name = FONT
ch.font.color.rgb = INK
pl = ch.plots[0]
pl.gap_width = 140
pl.has_data_labels = True
dl = pl.data_labels
dl.number_format = '0.00"%"'
dl.number_format_is_linked = False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size = Pt(18)
dl.font.bold = True
dl.font.name = FONT
dl.font.color.rgb = ACCENT_DEEP
ch.value_axis.has_major_gridlines = False
ch.value_axis.visible = False
ch.category_axis.has_major_gridlines = False
ch.category_axis.format.line.color.rgb = RULE
pts = pl.series[0].points
pts[0].format.fill.solid(); pts[0].format.fill.fore_color.rgb = ACCENT_PALE
pts[1].format.fill.solid(); pts[1].format.fill.fore_color.rgb = ACCENT

_, tf = tb(s4, L, PT + 3.44, 5.55, 0.6)
put(tf, '令和5・6年度版が出した推計を、令和7年度の実数と突き合わせた結果。'
        'いま出回っている推計が実際どれだけ外れたかを測っている', 10.5, GREY, line_sp=1.35, first=True)

line(s4, 6.44, PT, 6.44, PB, color=RULE, lw=1.0)

band(s4, 6.72, PT, 5.99, '需要の予測区間（帯つき）')
placeholder(s4, 6.72, PT + 0.44, 5.99, 3.00,
            '▶ ここに実画面のキャプチャ（折れ線＋帯）',
            '詳細画面の「必要な数／入れる数」と予測区間。\n枠は 5.99 × 3.00 inch（比率 2.00 : 1）')
_, tf = tb(s4, 6.72, PT + 3.56, 5.99, 0.5)
put(tf, '帯には児童数の推計誤差と、登録率トレンドの不確かさの両方が入っている。'
        '測っていないことは、測っていないと書く', 10.5, GREY, line_sp=1.35, first=True)

kicker(s4, 6.14, '学童は1本目の軸。同じ器に、通勤時間も住宅価格も入る。')
footer(s4, 4)


# ── 全ランに Meiryo UI（欧文 latin ／ 和文 ea ／ 記号 cs）を焼き込む ──
def stamp(el):
    for rPr in el.iter():
        if rPr.tag in (qn('a:rPr'), qn('a:defRPr'), qn('a:endParaRPr')):
            for tag in ('a:latin', 'a:ea', 'a:cs'):
                for old in rPr.findall(qn(tag)):
                    rPr.remove(old)
                rPr.append(rPr.makeelement(qn(tag), {'typeface': FONT}))


for sl in prs.slides:
    for sh in sl.shapes:
        stamp(sh._element)
        if sh.has_chart:
            stamp(sh.chart._chartSpace)

out = 'ppt資料/2分プレゼン_v1.pptx'
prs.save(out)
print('saved:', out)
