#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
textbook_app_v2.html.orig から Google スライドの授業用デッキを生成する。

スライド順: 問題 → ヒント1 → ヒント2 → ヒント3 → 解答 （×27問）
配色:       問題=緑 / ヒント=橙 / 解答=青（冊子と同じ）
カード図:   Slides のネイティブ図形で描画（後から自由に編集できる）

使い方:
  python3 make_slides.py --dump     # 解析結果の確認（API 不使用）
  python3 make_slides.py            # Google スライドを新規作成
                                    #   要: credentials.json（OAuth クライアント）
"""
import re, sys, html, json, os

SRC = "textbook_app_v2.html.orig"

# ════════════════════════════════════════════════════════════════
#  1. 教材の解析
# ════════════════════════════════════════════════════════════════
with open(SRC, encoding="utf-8") as f:
    full = f.read()
body = full[full.index("<body>") + len("<body>"): full.index("</body>")]

# ---- トップレベル div をネスト深さで切り出す（split_textbook.py と同方式）----
def top_level_divs(text):
    out = []
    div_open = re.compile(r'<div\b[^>]*>')
    tag = re.compile(r'<(/?)div\b[^>]*>')
    i, n = 0, len(text)
    while i < n:
        m = div_open.search(text, i)
        if not m:
            break
        depth, j = 0, m.start()
        for t in tag.finditer(text, m.start()):
            depth += 1 if t.group(1) == "" else -1
            if depth == 0:
                j = t.end(); break
        out.append(text[m.start():j])
        i = j
    return out

def plain(s):
    """HTML 断片 → プレーンテキスト（<br> は改行に）"""
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = re.sub(r'[ \t]+', ' ', s)
    return '\n'.join(line.strip() for line in s.split('\n')).strip()

def parse_visual(cell):
    """テストケース1行目テキスト → カード図データ"""
    v = {}
    hand = re.search(r'手札\s*=?\s*\[([\d,，\s]+)\]', cell)
    if not hand and '手札' not in cell and '捨て札' not in cell:
        hand = re.search(r'\[([\d,，\s]+)\]', cell)
    if hand:
        v['hand'] = [int(x) for x in hand.group(1).replace('，', ',').split(',')]
    else:
        h1 = re.search(r'手札\[1\]\s*=\s*(\d+)', cell)
        if h1:
            v['hand1'] = int(h1.group(1))
    f = re.search(r'場(?:の強さ)?\s*=\s*(\d+)', cell)
    if f:
        v['field'] = int(f.group(1))
    d = re.search(r'捨て札\s*=?\s*\[([\d,，\s]+)\]', cell)
    if d:
        v['disc'] = [int(x) for x in d.group(1).replace('，', ',').split(',')]
    elif '捨て札なし' in cell:
        v['disc_none'] = True
    return v

problems = {}   # pid -> dict
order = []      # 出題順
cur_ch = ""
for blk in top_level_divs(body):
    chm = re.search(r'class="ch-num">(.*?)<.*?class="ch-title">(.*?)<', blk, re.S)
    if chm and 'ch-header' in blk:
        n2 = re.sub(r'\D', '', chm.group(1))
        cur_ch = f"第{n2}章　{plain(chm.group(2))}"
        continue
    if 'problem-page-hdr' not in blk:
        continue
    pid_m = re.search(r'class="prob-title-jp"[^>]*>\s*(b\d+)[\s　]*(.*?)<', blk)
    if not pid_m:
        continue
    pid, title = pid_m.group(1), plain(pid_m.group(2))
    label = plain((re.search(r'class="prob-id">(.*?)<', blk) or [None, '基礎問題'])[1])

    chips = [plain(c) for c in re.findall(r'class="var-chip">(.*?)</span>', blk, re.S)]
    note_m = re.search(r'class="var-chip">.*?</span>\s*(?:<span class="var-chip">.*?</span>\s*)*<p[^>]*>(.*?)</p>', blk, re.S)
    note = plain(note_m.group(1)) if note_m else ''
    where_m = re.search(r'class="section-indicator">\s*(.*?)</div>', blk, re.S)
    where = plain(where_m.group(1)).replace('⬛ ', '') if where_m else ''

    cases = []
    tbl = re.search(r'<h3>テストケース(?:の確認)?</h3>\s*<table>(.*?)</table>', blk, re.S)
    if tbl:
        for r in re.finditer(r'<tr><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td></tr>', tbl.group(1), re.S):
            cases.append([plain(r.group(1)), plain(r.group(2)), plain(r.group(3))])
    visual = parse_visual(cases[0][1]) if cases else {}
    if '場の枚数 ＝ 0' in blk and 'field' not in visual:
        visual['field_empty'] = True

    problems[pid] = dict(pid=pid, title=title, label=label, chapter=cur_ch,
                         chips=chips, note=note, where=where,
                         cases=cases, visual=visual, hints=[], answer=None)
    order.append(pid)

# ---- ヒント ----
for m in re.finditer(r'<div class="prob-id">(b\d+) ヒント</div>.*?<ul class="step-list">(.*?)</ul>', body, re.S):
    pid, ul = m.group(1), m.group(2)
    for li in re.finditer(r'<div class="step-text">(.*?)</div>\s*</li>', ul, re.S):
        txt = li.group(1)
        think_m = re.search(r'<div class="think-box">(.*?)</div>', txt, re.S)
        think = plain(think_m.group(1)) if think_m else ''
        if think_m:
            txt = txt[:think_m.start()] + txt[think_m.end():]
        ttl_m = re.search(r'<strong>(.*?)</strong>', txt, re.S)
        ttl = plain(ttl_m.group(1)) if ttl_m else ''
        if ttl_m:
            txt = txt[:ttl_m.start()] + txt[ttl_m.end():]
        problems.setdefault(pid, {}).setdefault('hints', []).append(
            dict(title=ttl, body=plain(txt), think=think))

# ---- 模範解答 ----
for m in re.finditer(r'class="answer-card-title">(b\d+)[\s　]*(.*?)</div>\s*'
                     r'<div class="answer-card-body">\s*'
                     r'<div class="code-block"[^>]*>(.*?)</div>\s*<p[^>]*>(.*?)</p>',
                     body, re.S):
    pid = m.group(1)
    code = plain(m.group(3))
    expl = plain(m.group(4)).replace('解説：', '', 1)
    if pid in problems:
        problems[pid]['answer'] = dict(code=code, expl=expl)

data = [problems[p] for p in order]

if "--dump" in sys.argv:
    ok = True
    total = 1  # 表紙
    for p in data:
        nh = len(p['hints'])
        na = 1 if p['answer'] else 0
        total += 1 + nh + na
        flag = '' if (nh and na and p['cases']) else '  ⚠️'
        print(f"{p['pid']}  {p['title']:<22s} {p['chapter'][:14]:<14s} "
              f"ヒント{nh} 解答{'○' if na else '×'} ケース{len(p['cases'])} "
              f"図{'○' if p['visual'] else '−'}{flag}")
        if flag:
            ok = False
    print(f"\n問題数: {len(data)}  総スライド数: {total}")
    print("解析: " + ("OK" if ok else "不足あり"))
    sys.exit(0)

# ════════════════════════════════════════════════════════════════
#  2. スライド仕様 → Slides API リクエスト
# ════════════════════════════════════════════════════════════════
PAGE_W, PAGE_H = 720, 405   # 16:9 (pt)
FONT = "Noto Sans JP"
MONO = "Roboto Mono"

def C(hexstr):
    h = hexstr.lstrip('#')
    return {'red': int(h[0:2], 16)/255, 'green': int(h[2:4], 16)/255, 'blue': int(h[4:6], 16)/255}

GREEN, GREEN_D = C('27ae60'), C('1a6b3a')
GREEN_BG, GREEN_LINE = C('e8f5e9'), C('27ae60')
ORANGE, ORANGE_D = C('f39c12'), C('e67e22')
ORANGE_BG = C('fff8f0')
BLUE, BLUE_D = C('2196f3'), C('1565c0')
GRAY_BG, GRAY_LINE = C('f8f9fa'), C('dee2e6')
DARK = C('1a1a2e')
CODE_FG = C('d7e3f4')
TXT = C('1d2433')
SUB = C('556070')
WHITE = C('ffffff')
CARD_BORDER = C('2c3e50')
GOLD = C('b8860b')
GHOST = C('9aa7bb')
PANEL_BG, PANEL_LINE = C('f8fbff'), C('cfdcf0')

class Deck:
    def __init__(self):
        self.req = []
        self._n = 0

    def _id(self, hint):
        self._n += 1
        return f"el_{hint}_{self._n:04d}"

    def slide(self, key):
        sid = f"sl_{key}_{self._n:04d}"; self._n += 1
        self.req.append({'createSlide': {
            'objectId': sid,
            'slideLayoutReference': {'predefinedLayout': 'BLANK'}}})
        return sid

    def rect(self, sid, x, y, w, h, fill=None, line=None, line_w=1.5,
             dash=None, shape='ROUND_RECTANGLE'):
        oid = self._id('rc')
        self.req.append({'createShape': {
            'objectId': oid, 'shapeType': shape,
            'elementProperties': {
                'pageObjectId': sid,
                'size': {'width': {'magnitude': w, 'unit': 'PT'},
                         'height': {'magnitude': h, 'unit': 'PT'}},
                'transform': {'scaleX': 1, 'scaleY': 1,
                              'translateX': x, 'translateY': y, 'unit': 'PT'}}}})
        props, fields = {}, []
        if fill:
            props['shapeBackgroundFill'] = {'solidFill': {'color': {'rgbColor': fill}}}
            fields.append('shapeBackgroundFill.solidFill.color')
        if line:
            props['outline'] = {'outlineFill': {'solidFill': {'color': {'rgbColor': line}}},
                                'weight': {'magnitude': line_w, 'unit': 'PT'}}
            fields += ['outline.outlineFill.solidFill.color', 'outline.weight']
            if dash:
                props['outline']['dashStyle'] = dash
                fields.append('outline.dashStyle')
        else:
            props['outline'] = {'propertyState': 'NOT_RENDERED'}
            fields.append('outline.propertyState')
        self.req.append({'updateShapeProperties': {
            'objectId': oid, 'shapeProperties': props, 'fields': ','.join(fields)}})
        return oid

    def text(self, sid, x, y, w, h, runs, align='START', valign='TOP',
             line_spacing=None, target=None):
        """runs: [(text, {size, bold, color, font, italic}), ...] 連結して1ボックスに"""
        if target:
            oid = target
        else:
            oid = self._id('tx')
            self.req.append({'createShape': {
                'objectId': oid, 'shapeType': 'TEXT_BOX',
                'elementProperties': {
                    'pageObjectId': sid,
                    'size': {'width': {'magnitude': w, 'unit': 'PT'},
                             'height': {'magnitude': h, 'unit': 'PT'}},
                    'transform': {'scaleX': 1, 'scaleY': 1,
                                  'translateX': x, 'translateY': y, 'unit': 'PT'}}}})
            if valign != 'TOP':
                self.req.append({'updateShapeProperties': {
                    'objectId': oid,
                    'shapeProperties': {'contentAlignment': valign},
                    'fields': 'contentAlignment'}})
        whole = ''.join(r[0] for r in runs)
        if not whole:
            return oid
        self.req.append({'insertText': {'objectId': oid, 'text': whole}})
        # Slides API のテキスト範囲は UTF-16 コード単位（絵文字は2単位）
        u16 = lambda s: len(s.encode('utf-16-le')) // 2
        pos = 0
        for t, st in runs:
            if t:
                self._style(oid, pos, pos + u16(t), st)
            pos += u16(t)
        para = {}
        if align != 'START':
            para['alignment'] = align
        if line_spacing:
            para['lineSpacing'] = line_spacing
        if para:
            self.req.append({'updateParagraphStyle': {
                'objectId': oid,
                'textRange': {'type': 'ALL'},
                'style': para, 'fields': ','.join(para.keys())}})
        return oid

    def _style(self, oid, s, e, st):
        style, fields = {}, []
        style['fontFamily'] = st.get('font', FONT); fields.append('fontFamily')
        style['fontSize'] = {'magnitude': st.get('size', 14), 'unit': 'PT'}; fields.append('fontSize')
        style['bold'] = st.get('bold', False); fields.append('bold')
        style['foregroundColor'] = {'opaqueColor': {'rgbColor': st.get('color', TXT)}}
        fields.append('foregroundColor')
        if st.get('italic'):
            style['italic'] = True; fields.append('italic')
        self.req.append({'updateTextStyle': {
            'objectId': oid, 'textRange': {'type': 'FIXED_RANGE', 'startIndex': s, 'endIndex': e},
            'style': style, 'fields': ','.join(fields)}})

    def table(self, sid, x, y, w, rows_data, col_w, header_fill, font_size=12):
        oid = self._id('tb')
        rows, cols = len(rows_data), len(rows_data[0])
        self.req.append({'createTable': {
            'objectId': oid,
            'elementProperties': {
                'pageObjectId': sid,
                'size': {'width': {'magnitude': w, 'unit': 'PT'},
                         'height': {'magnitude': 24 * rows, 'unit': 'PT'}},
                'transform': {'scaleX': 1, 'scaleY': 1,
                              'translateX': x, 'translateY': y, 'unit': 'PT'}},
            'rows': rows, 'columns': cols}})
        for ci, cw in enumerate(col_w):
            self.req.append({'updateTableColumnProperties': {
                'objectId': oid, 'columnIndices': [ci],
                'tableColumnProperties': {'columnWidth': {'magnitude': cw, 'unit': 'PT'}},
                'fields': 'columnWidth'}})
        self.req.append({'updateTableCellProperties': {
            'objectId': oid,
            'tableRange': {'location': {'rowIndex': 0, 'columnIndex': 0},
                           'rowSpan': 1, 'columnSpan': cols},
            'tableCellProperties': {'tableCellBackgroundFill':
                {'solidFill': {'color': {'rgbColor': header_fill}}}},
            'fields': 'tableCellBackgroundFill.solidFill.color'}})
        for ri, row in enumerate(rows_data):
            for ci, cell in enumerate(row):
                if not cell:
                    continue
                self.req.append({'insertText': {
                    'objectId': oid,
                    'cellLocation': {'rowIndex': ri, 'columnIndex': ci},
                    'text': cell}})
                st = {'fontFamily': FONT,
                      'fontSize': {'magnitude': font_size, 'unit': 'PT'},
                      'bold': ri == 0,
                      'foregroundColor': {'opaqueColor': {'rgbColor': WHITE if ri == 0 else TXT}}}
                self.req.append({'updateTextStyle': {
                    'objectId': oid,
                    'cellLocation': {'rowIndex': ri, 'columnIndex': ci},
                    'textRange': {'type': 'ALL'}, 'style': st,
                    'fields': 'fontFamily,fontSize,bold,foregroundColor'}})
        return oid

    # ---- トランプカード（図形の組合せ）----
    def card(self, sid, x, y, rank, sub='', w=44, h=60, ghost=False):
        label = {11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '$'}.get(rank, str(rank)) \
                if isinstance(rank, int) else rank
        color = GOLD if rank == 15 else (GHOST if ghost else TXT)
        border = GOLD if rank == 15 else (GHOST if ghost else CARD_BORDER)
        self.rect(sid, x, y, w, h, fill=WHITE, line=border, line_w=2,
                  dash='DASH' if ghost else None)
        self.text(sid, x, y + h/2 - 16, w, 30,
                  [(label, {'size': 22 if len(label) <= 2 else 16, 'bold': True, 'color': color})],
                  align='CENTER')
        if sub:
            self.text(sid, x - 8, y + h + 2, w + 16, 14,
                      [(sub, {'size': 9, 'color': SUB})], align='CENTER')

def header(d, sid, fill, small, big):
    d.rect(sid, 20, 16, PAGE_W - 40, 56, fill=fill)
    d.text(sid, 38, 16, PAGE_W - 76, 56,
           [(small + '\n', {'size': 11, 'bold': True, 'color': WHITE}),
            (big, {'size': 23, 'bold': True, 'color': WHITE})],
           valign='MIDDLE')

# ---- カード図ゾーン（問題スライド下部）----
def visual_panel(d, sid, p, x, y, w, h):
    v = p['visual']
    if not v:
        return False
    d.rect(sid, x, y, w, h, fill=PANEL_BG, line=PANEL_LINE)
    d.text(sid, x + 14, y + 6, w - 28, 18,
           [('🃏 ケース1のようす', {'size': 12, 'bold': True, 'color': BLUE_D})])
    cx = x + 18
    zy = y + 30
    CW, CH, GAP = 44, 60, 8
    def zone(title, n_cards):
        nonlocal cx
        d.text(sid, cx, zy, max(n_cards * (CW + GAP), 70), 14,
               [(title, {'size': 10, 'bold': True, 'color': SUB})])
        return zy + 16
    if 'hand' in v:
        cy = zone('あなたの手札（弱い順）', len(v['hand']))
        for i, c in enumerate(v['hand']):
            d.card(sid, cx, cy, c, f'手札[{i+1}]')
            cx += CW + GAP
        cx += 26
    elif 'hand1' in v:
        cy = zone('あなたの手札（弱い順）', 2)
        d.card(sid, cx, cy, v['hand1'], '手札[1]'); cx += CW + GAP
        d.card(sid, cx, cy, '?', '手札[2]…', ghost=True); cx += CW + GAP + 26
    if 'field' in v:
        cy = zone('場のカード', 1)
        d.card(sid, cx, cy, v['field']); cx += CW + GAP + 26
    elif v.get('field_empty'):
        cy = zone('場', 1)
        d.rect(sid, cx, cy, CW, CH, fill=WHITE, line=GHOST, line_w=1.5, dash='DASH')
        d.text(sid, cx, cy + CH/2 - 9, CW, 16,
               [('空き', {'size': 9, 'color': GHOST})], align='CENTER')
        cx += CW + GAP + 26
    if 'disc' in v:
        cy = zone('捨て札', len(v['disc']))
        for c in v['disc']:
            d.card(sid, cx, cy, c, w=34, h=48); cx += 34 + 6
        cx += 26
    elif v.get('disc_none'):
        cy = zone('捨て札', 1)
        d.rect(sid, cx, cy, CW, CH, fill=WHITE, line=GHOST, line_w=1.5, dash='DASH')
        d.text(sid, cx, cy + CH/2 - 9, CW, 16,
               [('なし', {'size': 9, 'color': GHOST})], align='CENTER')
    return True

# ---- ① 問題スライド ----
def slide_problem(d, p):
    sid = d.slide(p['pid'] + '_q')
    header(d, sid, GREEN_D, f"{p['label']}　{p['chapter']}", f"{p['pid']}　{p['title']}")

    # 使うもの（左上）
    d.rect(sid, 20, 84, 340, 96, fill=GRAY_BG, line=GRAY_LINE)
    chips = '　'.join(p['chips'])
    d.text(sid, 34, 92, 312, 80,
           [('この問題で使うもの\n', {'size': 11, 'bold': True, 'color': SUB}),
            (chips + '\n', {'size': 15, 'bold': True, 'color': GREEN_D, 'font': MONO}),
            (p['note'], {'size': 11, 'color': SUB})])
    # 書く場所
    if p['where']:
        d.rect(sid, 20, 188, 340, 36, fill=GREEN_BG, line=GREEN_LINE)
        d.text(sid, 34, 188, 312, 36,
               [(p['where'], {'size': 12.5, 'bold': True, 'color': GREEN_D})], valign='MIDDLE')

    # テストケース表（右上）
    rows = [['ケース', '状態', '期待する動作']] + [c for c in p['cases']]
    fs = 12 if len(rows) <= 4 else 10.5
    d.table(sid, 380, 84, 320, rows, [52, 128, 140], GREEN_D, font_size=fs)

    # カード図（下段）
    if not visual_panel(d, sid, p, 20, 236, 680, 122):
        d.text(sid, 20, 250, 680, 60,
               [('（この問題は表示の問題です。テストケース表を見て考えましょう）',
                 {'size': 13, 'color': SUB})], align='CENTER')
    # 下端の実行プロンプト
    d.rect(sid, 20, 366, 680, 26, fill=GREEN_D)
    d.text(sid, 20, 366, 680, 26,
           [(f"📱 アプリで {p['pid']} を選んで、コードを書いて「▶ 実行」！",
             {'size': 13, 'bold': True, 'color': WHITE})], align='CENTER', valign='MIDDLE')
    return 1

# ---- ② ヒントスライド ----
def slide_hint(d, p, idx, total):
    h = p['hints'][idx]
    sid = d.slide(f"{p['pid']}_h{idx+1}")
    header(d, sid, ORANGE_D, f"{p['pid']} ヒント {idx+1}／{total}", f"{p['pid']}　{p['title']}")

    # ステップ番号サークル + タイトル
    d.rect(sid, 36, 100, 46, 46, fill=ORANGE_D, shape='ELLIPSE')
    d.text(sid, 36, 100, 46, 46,
           [(str(idx + 1), {'size': 24, 'bold': True, 'color': WHITE})],
           align='CENTER', valign='MIDDLE')
    d.text(sid, 100, 96, 590, 54,
           [(h['title'], {'size': 22, 'bold': True, 'color': TXT})], valign='MIDDLE')
    # 本文（長文は少し縮小して think-box との重なりを防ぐ）
    bfs = 17 if len(h['body']) <= 110 else 15
    d.text(sid, 100, 160, 590, 130,
           [(h['body'], {'size': bfs, 'color': TXT})], line_spacing=130)
    # think-box
    if h['think']:
        d.rect(sid, 100, 300, 560, 70, fill=ORANGE_BG, line=ORANGE_D, line_w=2, dash='DASH')
        d.text(sid, 118, 300, 524, 70,
               [('💭 ', {'size': 15}), (h['think'], {'size': 15, 'color': TXT})],
               valign='MIDDLE')
    return 1

# ---- ③ 解答スライド ----
def slide_answer(d, p):
    a = p['answer']
    sid = d.slide(p['pid'] + '_a')
    header(d, sid, BLUE_D, f"{p['pid']} 解答", f"{p['pid']}　{p['title']}")

    lines = a['code'].split('\n')
    n = len(lines)
    fs = 20 if n <= 4 else (16 if n <= 7 else 13)
    lh = fs * 1.55
    ch = max(58, n * lh + 26)
    ch = min(ch, 215)
    d.rect(sid, 50, 92, 620, ch, fill=DARK)
    d.text(sid, 74, 92, 572, ch,
           [(a['code'], {'size': fs, 'bold': True, 'color': CODE_FG, 'font': MONO})],
           valign='MIDDLE', line_spacing=115)
    ey = 92 + ch + 14
    d.text(sid, 50, ey, 620, PAGE_H - ey - 16,
           [('解説：', {'size': 15, 'bold': True, 'color': BLUE_D}),
            (a['expl'], {'size': 15, 'color': TXT})], line_spacing=125)
    return 1

# ---- 表紙 ----
def slide_cover(d):
    sid = d.slide('cover')
    d.rect(sid, 0, 0, PAGE_W, PAGE_H, fill=C('1d2433'), shape='RECTANGLE')
    d.text(sid, 60, 110, 600, 70,
           [('🃏 大富豪プログラミング', {'size': 40, 'bold': True, 'color': WHITE})],
           align='CENTER')
    d.text(sid, 60, 190, 600, 40,
           [('問題・ヒント・解答スライド（b01〜b27）', {'size': 20, 'color': C('aab8cc')})],
           align='CENTER')
    d.text(sid, 60, 250, 600, 30,
           [('高校「情報Ⅰ」 アルゴリズムとプログラミング対応', {'size': 13, 'color': C('7e8ba0')})],
           align='CENTER')
    # カードモチーフ
    for i, (r, col) in enumerate([(3, WHITE), (7, WHITE), ('K', WHITE), ('$', GOLD)]):
        x = 280 + i * 44
        d.rect(sid, x, 300, 38, 52, fill=WHITE, line=CARD_BORDER, line_w=1.5)
        d.text(sid, x, 314, 38, 26,
               [(str(r), {'size': 18, 'bold': True, 'color': GOLD if r == '$' else TXT})],
               align='CENTER')
    return 1

# ---- デッキ全体 ----
def build_deck():
    d = Deck()
    n = slide_cover(d)
    for p in data:
        n += slide_problem(d, p)
        for i in range(len(p['hints'])):
            n += slide_hint(d, p, i, len(p['hints']))
        if p['answer']:
            n += slide_answer(d, p)
    return d, n

if "--requests" in sys.argv:   # オフライン検証用
    d, n = build_deck()
    json.dumps(d.req)          # シリアライズ可能か確認
    kinds = {}
    for r in d.req:
        k = list(r.keys())[0]
        kinds[k] = kinds.get(k, 0) + 1
    print(f"スライド {n} 枚 / リクエスト {len(d.req)} 件")
    for k, v in sorted(kinds.items()):
        print(f"  {k}: {v}")
    sys.exit(0)

# ════════════════════════════════════════════════════════════════
#  3. Google Slides API で作成
# ════════════════════════════════════════════════════════════════
def main():
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build as gbuild

    SCOPES = ['https://www.googleapis.com/auth/presentations']
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                print("❌ credentials.json がありません。")
                print("   Google Cloud Console で OAuth クライアント（デスクトップアプリ）を作成し、")
                print("   JSON をこのフォルダに credentials.json として保存してください。")
                print("   手順の詳細: GOOGLE_SLIDES_SETUP.md")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as t:
            t.write(creds.to_json())

    service = gbuild('slides', 'v1', credentials=creds)
    pres = service.presentations().create(
        body={'title': '大富豪プログラミング 授業スライド（問題・ヒント・解答）'}).execute()
    pid = pres['presentationId']
    default_slide = pres['slides'][0]['objectId']

    d, n = build_deck()
    reqs = d.req + [{'deleteObject': {'objectId': default_slide}}]
    CHUNK = 300
    done = 0
    for i in range(0, len(reqs), CHUNK):
        service.presentations().batchUpdate(
            presentationId=pid,
            body={'requests': reqs[i:i + CHUNK]}).execute()
        done += len(reqs[i:i + CHUNK])
        print(f"  送信 {done}/{len(reqs)}")
    print(f"\n✅ 完成: スライド {n} 枚")
    print(f"   https://docs.google.com/presentation/d/{pid}/edit")

if __name__ == '__main__':
    main()
