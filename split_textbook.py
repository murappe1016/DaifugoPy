#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
textbook_app_v2.html を 4 ファイルに再構成する。

  本体 (textbook_app_v2.html) : 概念・章扉・コラム（問題/解説/ヒント/解答を除去）
                                0-4 の分割2ページを結合
  問題集 (textbook_problems.html) : 問題文のみ
  ヒント集 (textbook_hints.html)  : ヒント
  解答集 (textbook_answers.html)  : 解説 + 模範解答集

使い方:  python3 split_textbook.py          # 生成（元ファイルは .bak へ退避）
         python3 split_textbook.py --dry     # 分類一覧のみ
"""
import re, sys, html, shutil, os

SRC = "textbook_app_v2.html"
BAK = SRC + ".orig"   # 原本（最初の完全版）を保持。常にここを入力源にする
DRY = "--dry" in sys.argv

# 原本がまだ無ければ現在の SRC を原本として保存（初回のみ）
if not os.path.exists(BAK):
    shutil.copy(SRC, BAK)

# 入力は常に原本から（再実行で加工済みを読まないため）
with open(BAK, encoding="utf-8") as f:
    full = f.read()

head = full[:full.index("</head>") + len("</head>")]
body = full[full.index("<body>") + len("<body>"): full.index("</body>")]

# ---- トップレベル div ブロックを div 深さで切り出す ----
tokens = []  # (kind, text)  kind: 'div' | 'raw'
i, n = 0, len(body)
div_open_re = re.compile(r'<div\b[^>]*>')
tag_re = re.compile(r'<(/?)div\b[^>]*>')
while i < n:
    m = div_open_re.search(body, i)
    if not m:
        tokens.append(("raw", body[i:])); break
    if m.start() > i:
        tokens.append(("raw", body[i:m.start()]))
    depth = 0; j = m.start()
    for t in tag_re.finditer(body, m.start()):
        depth += 1 if t.group(1) == "" else -1
        if depth == 0:
            j = t.end(); break
    tokens.append(("div", body[m.start():j]))
    i = j

def classify(blk):
    cls = (re.search(r'<div\s+class="([^"]*)"', blk) or [None, ""])[1]
    if "cover" in cls: return "cover"
    if "problem-page-hdr" in blk: return "problem"
    if "hint-page-hdr" in blk or "hint-sec-label" in blk: return "hint"
    if "explain-page-hdr" in blk: return "explain"
    if "answer-hdr" in blk or "answer-pg" in cls: return "answer"
    if "column-hdr" in blk: return "column"
    if "ch-header" in blk: return "chapter"
    h2 = re.search(r'<h2>(.*?)</h2>', blk, re.S)
    if h2 and "目次" in h2.group(1): return "toc"
    return "concept"

blocks = [(classify(t), t) for k, t in tokens if k == "div"]

def title_of(blk):
    for pat in [r'class="prob-title-jp"[^>]*>(.*?)<', r'<h2>(.*?)</h2>',
                r'class="ch-title">(.*?)<', r'class="hint-sec-label">(.*?)<',
                r'font-weight:700;">(.*?)<']:
        m = re.search(pat, blk, re.S)
        if m:
            return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip()[:40]
    return "(無題)"

if DRY:
    print(f"head {len(head)}B / {len(blocks)} blocks\n")
    c = {}
    for i, (k, b) in enumerate(blocks):
        c[k] = c.get(k, 0) + 1
        print(f"[{i:3d}] {k:8s} | {title_of(b)}")
    print("\n=== 集計 ===")
    for k, v in sorted(c.items()): print(f"  {k}: {v}")
    sys.exit(0)

# ---------------------------------------------------------------
#  共通: ファイル組み立て
# ---------------------------------------------------------------
def cover(title, subtitle, badges, accent):
    bd = "".join(f'<span class="badge">{b}</span>' for b in badges)
    return f'''<div class="cover" style="border-color:{accent};">
  <div style="font-size:50px;margin-bottom:10px;">🃏</div>
  <h1>大富豪プログラミング<br>{title}</h1>
  <div class="subtitle">―― {subtitle} ――</div>
  <div>{bd}</div>
  <div class="edition">高校「情報Ⅰ」 アルゴリズムとプログラミング対応</div>
</div>
'''

def strip_codeblock_edges(text):
    # .code-block は white-space:pre-wrap。先頭/末尾の改行を除去して空行を防ぐ
    return re.sub(r'(<div class="code-block"[^>]*>)(.*?)(</div>)',
                  lambda m: m.group(1) + m.group(2).strip('\n') + m.group(3),
                  text, flags=re.S)

def build(title, body_html, booklet=None, extra_css=None):
    h = head
    if title:
        h = re.sub(r'<title>.*?</title>',
                   f'<title>大富豪プログラミング {title}</title>', h, flags=re.S)
    if extra_css:
        h = h.replace('</head>', f'<style>\n{extra_css}\n</style>\n</head>')
    body_tag = f'<body data-booklet="{booklet}">' if booklet else '<body>'
    body_html = strip_codeblock_edges(body_html)
    return f"{h}\n{body_tag}\n{body_html}\n</body>\n</html>\n"

def prob_id(blk):
    m = re.search(r'class="prob-title-jp"[^>]*>\s*([bB]\d+)', blk)
    return m.group(1) if m else ""

# 直前の概念ページに結合するコラム（章2・章4）
#   章7の配列コラムは結合すると A4 を超えるため独立ページとする
COLUMN_MERGE = ["「÷」と「％」はセットで覚える", "ループは「くり返しの自動化」"]

# 問題ID → タイトル（IDなし）の対応表
def _title_only(blk):
    return re.sub(r'^[bB]\d+[\s　]*', '', title_of(blk)).strip()
ID2TITLE = { prob_id(b).lower(): _title_only(b) for k, b in blocks if k == "problem" }

# 概念ページのポインタ try-box を 1 行に統一
#   例: 📱 b05「変数で最強カードを出す」 に挑戦しましょう！
def rewrite_pointers(text):
    def rep(m):
        block = m.group(0)
        pm = re.search(r'(b\d+)', block)
        if not pm:
            return block
        pid = pm.group(1)
        t = ID2TITLE.get(pid.lower(), '')
        return (f'<div class="try-box">📱 {pid}「{t}」 に挑戦しましょう！</div>'
                if t else block)
    return re.sub(r'<div class="try-box">.*?<div class="next-hint">.*?</div>\s*</div>',
                  rep, text, flags=re.S)

# 章ラベル（章扉ブロックから章番号とタイトルを取る）
def chapter_label(blk):
    num = re.search(r'class="ch-num">(.*?)<', blk)
    ttl = re.search(r'class="ch-title">(.*?)<', blk)
    if num and ttl:
        n2 = re.sub(r'\D', '', num.group(1))
        return f"第{n2}章　{html.unescape(re.sub('<[^>]+>','',ttl.group(1))).strip()}"
    return ""

# ---------------------------------------------------------------
#  ワークブック化: ケース1のカード図・書き込み欄・文字拡大
# ---------------------------------------------------------------
RANK_LABEL = {11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '$'}
def _rank(n): return RANK_LABEL.get(n, str(n))

def _card(n, sub=''):
    cls = 'cv-card cv-gold' if n == 15 else 'cv-card'
    sub_html = f'<span class="cv-sub">{sub}</span>' if sub else ''
    return f'<div class="{cls}">{_rank(n)}{sub_html}</div>'

def case_visual_html(blk):
    """テストケース1行目のテキストから手札・場・捨て札のカード図を生成"""
    m = re.search(r'<h3>テストケース(?:の確認)?</h3>\s*<table>(.*?)</table>', blk, re.S)
    if not m:
        return ''
    row = re.search(r'<tr><td>1</td><td>(.*?)</td>', m.group(1), re.S)
    if not row:
        return ''
    cell = html.unescape(re.sub('<[^>]+>', '', row.group(1)))

    hand = re.search(r'手札\s*=?\s*\[([\d,，\s]+)\]', cell)
    if not hand and '手札' not in cell and '捨て札' not in cell:
        hand = re.search(r'\[([\d,，\s]+)\]', cell)           # b04: 接頭辞なしのリスト
    hand1 = re.search(r'手札\[1\]\s*=\s*(\d+)', cell)
    field = re.search(r'場(?:の強さ)?\s*=\s*(\d+)', cell)
    disc = re.search(r'捨て札\s*=?\s*\[([\d,，\s]+)\]', cell)
    disc_none = '捨て札なし' in cell
    field_empty = '場の枚数 ＝ 0' in blk and not field

    zones = []
    if hand:
        cards = [int(x) for x in hand.group(1).replace('，', ',').split(',')]
        ch = ''.join(_card(c, f'手札[{i+1}]') for i, c in enumerate(cards))
        zones.append('<div class="cv-zone"><div class="cv-zttl">あなたの手札（弱い順）</div>'
                     f'<div class="cv-cards cv-has-sub">{ch}</div></div>')
    elif hand1:
        ch = (_card(int(hand1.group(1)), '手札[1]')
              + '<div class="cv-card cv-ghost">?<span class="cv-sub">手札[2]…</span></div>')
        zones.append('<div class="cv-zone"><div class="cv-zttl">あなたの手札（弱い順）</div>'
                     f'<div class="cv-cards cv-has-sub">{ch}</div></div>')
    if field:
        zones.append('<div class="cv-zone"><div class="cv-zttl">場のカード</div>'
                     f'<div class="cv-cards">{_card(int(field.group(1)))}</div></div>')
    elif field_empty and zones:
        zones.append('<div class="cv-zone"><div class="cv-zttl">場</div>'
                     '<div class="cv-empty">空き</div></div>')
    if disc:
        cards = [int(x) for x in disc.group(1).replace('，', ',').split(',')]
        ch = ''.join(_card(c) for c in cards)
        zones.append('<div class="cv-zone"><div class="cv-zttl">捨て札</div>'
                     f'<div class="cv-cards cv-mini">{ch}</div></div>')
    elif disc_none:
        zones.append('<div class="cv-zone"><div class="cv-zttl">捨て札</div>'
                     '<div class="cv-empty">なし</div></div>')

    if not zones:
        return ''
    return ('<div class="case-visual"><div class="cv-cap">🃏 ケース1のようす</div>'
            f'<div class="cv-flex">{"".join(zones)}</div></div>')

def insert_after_testcases(blk, extra):
    """テストケース表の直後にカード図を挿入"""
    if not extra:
        return blk
    m = re.search(r'(<h3>テストケース(?:の確認)?</h3>\s*<table>.*?</table>)', blk, re.S)
    if not m:
        return blk
    return blk[:m.end(1)] + '\n' + extra + blk[m.end(1):]

def append_into_body(blk, extra):
    """ページ本文 div の閉じ直前に要素を追加（末尾の </div> 2つ＝本文・pg の閉じ）"""
    b = blk.rstrip()
    i = b.rfind('</div>')
    j = b.rfind('</div>', 0, i)
    if j < 0:
        return blk
    return b[:j] + extra + '\n' + b[j:] + '\n'

WRITE_AREA = ('<div class="write-area-bk"><div class="wa-ttl">'
              '✍️ コードを書いてみよう（アプリに入力する前の下書き）</div>'
              '<div class="wa-lines"></div></div>')
MEMO_AREA = ('<div class="write-area-bk"><div class="wa-ttl">'
             '📝 気づいたことメモ（どのステップで分かった？）</div>'
             '<div class="wa-lines"></div></div>')

# カード図・記入欄・文字拡大（zoom）の冊子用スタイル
CSS_CARDS = '''
/* ── ケース1の状況図 ── */
.case-visual { margin: 9px 0 4px; padding: 8px 12px 5px; border: 1.5px solid #cfdcf0;
               border-radius: 8px; background: #f8fbff; }
.cv-cap { font-weight: 700; font-size: 11.5px; color: #1d4ed8; margin-bottom: 6px; }
.cv-flex { display: flex; gap: 9mm; flex-wrap: wrap; align-items: flex-start; }
.cv-zttl { font-size: 10.5px; color: #556; font-weight: 700; margin-bottom: 3px; }
.cv-cards { display: flex; gap: 2.2mm; }
.cv-has-sub { padding-bottom: 4.8mm; }
.cv-card { width: 10.5mm; height: 14.5mm; border: 0.5mm solid #2c3e50; border-radius: 1.8mm;
           background: #fff; display: flex; align-items: center; justify-content: center;
           font-size: 19px; font-weight: 800; color: #1d2433;
           box-shadow: 0 1px 2px rgba(0,0,0,.10); position: relative; }
.cv-card .cv-sub { position: absolute; bottom: -4.8mm; left: 50%; transform: translateX(-50%);
                   font-size: 8.5px; font-weight: 500; color: #667; white-space: nowrap; }
.cv-gold { color: #b8860b; border-color: #b8860b; }
.cv-ghost { border-style: dashed; color: #9aa7bb; border-color: #9aa7bb;
            background: #fbfcfe; box-shadow: none; }
.cv-mini .cv-card { width: 7.5mm; height: 10.5mm; font-size: 13px; border-width: 0.4mm; }
.cv-empty { width: 10.5mm; height: 14.5mm; border: 0.5mm dashed #9aa7bb; border-radius: 1.8mm;
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; color: #9aa7bb; text-align: center; line-height: 1.3; }
'''

CSS_WRITE = '''
/* ── 書き込み欄（残り余白いっぱいに伸びる）── */
.write-area-bk { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 20mm;
                 margin-top: 9px; border: 1.5px solid #c9d4e4; border-radius: 8px;
                 padding: 7px 11px 9px; background: #fff; }
.wa-ttl { font-size: 11.5px; font-weight: 700; color: #3b5b8c; margin-bottom: 1.5mm; }
.wa-lines { flex: 1 1 auto; min-height: 12mm;
            background: repeating-linear-gradient(to bottom,
              transparent 0, transparent calc(8mm - 1px),
              #dbe3ee calc(8mm - 1px), #dbe3ee 8mm); }
'''

CSS_PROBLEMS = '''
/* ── ワークブック化: 文字拡大 ── */
.pg > *:not(.print-header):not(.print-footer) { zoom: 1.18; }
.problem-body { display: flex; flex-direction: column; flex: 1 1 auto; }
''' + CSS_CARDS + CSS_WRITE

CSS_HINTS = '''
/* ── ワークブック化: 文字拡大 ── */
.pg > *:not(.print-header):not(.print-footer) { zoom: 1.18; }
.hint-body { display: flex; flex-direction: column; flex: 1 1 auto; }
''' + CSS_WRITE

CSS_ANSWERS = '''
/* ── 解説ページの文字拡大（密度の高い模範解答ページは対象外）── */
.pg.pg-explain > *:not(.print-header):not(.print-footer) { zoom: 1.12; }
'''

# ---------------------------------------------------------------
#  ① 問題集
# ---------------------------------------------------------------
def make_problems():
    out = [cover("問題集", "アプリで挑戦する全27問", ["基礎問題 b01〜b27", "問題文のみ"], "#3b82f6")]
    cur_ch = ""
    for k, b in blocks:
        if k == "chapter":
            cur_ch = chapter_label(b)
        if k == "problem":
            if cur_ch:
                out.append(f'<div class="pg-chap-divider" data-chapter="{cur_ch}" style="page-break-before:always;text-align:center;padding:8px 0;font-weight:700;color:#3b82f6;border-bottom:2px solid #3b82f6;margin-bottom:8px;">{cur_ch}</div>')
                cur_ch = ""  # 章内最初の問題にだけ付ける
            # 「次のページのヒント」→ ヒント集 へ表現変更
            blk = b.replace("次のページのヒントを読む", "ヒント集（別冊）を読む")
            blk = blk.replace("次のページのヒント", "別冊のヒント集")
            # ケース1のカード図 + 解答下書き欄（ワークブック化）
            blk = insert_after_testcases(blk, case_visual_html(blk))
            blk = append_into_body(blk, WRITE_AREA)
            out.append(blk)
    return build("問題集", "\n".join(out), booklet="問題集", extra_css=CSS_PROBLEMS)

# ---------------------------------------------------------------
#  ② ヒント集
# ---------------------------------------------------------------
def make_hints():
    out = [cover("ヒント集", "行き詰まったときだけ読もう", ["全27問のヒント", "答えは書いていません"], "#d97706")]
    cur_ch = ""
    for k, b in blocks:
        if k == "chapter":
            cur_ch = chapter_label(b)
        if k == "hint":
            # スタイル未定義の hint-section-hdr は章区切りバナーに置き換える
            b = re.sub(r'<div class="hint-section-hdr">(?:\s*<div[^>]*>.*?</div>){3}\s*</div>\s*',
                       '', b, flags=re.S)
            if cur_ch:
                out.append(f'<div class="pg-chap-divider" data-chapter="{cur_ch}　ヒント" style="page-break-before:always;text-align:center;padding:8px 0;font-weight:700;color:#d97706;border-bottom:2px solid #d97706;margin-bottom:8px;">{cur_ch}　ヒント</div>')
                cur_ch = ""
            out.append(append_into_body(b, MEMO_AREA))
    return build("ヒント集", "\n".join(out), booklet="ヒント集", extra_css=CSS_HINTS)

# ---------------------------------------------------------------
#  ③ 解答集（解説 + 模範解答集）
# ---------------------------------------------------------------
def make_answers():
    out = [cover("解答集", "解説と模範解答（教師用）", ["全27問の解説", "模範解答集つき"], "#16a34a")]
    cur_ch = ""
    for k, b in blocks:
        if k == "chapter":
            cur_ch = chapter_label(b)
        if k == "explain":
            if cur_ch:
                out.append(f'<div class="pg-chap-divider" data-chapter="{cur_ch}　解説" style="page-break-before:always;text-align:center;padding:8px 0;font-weight:700;color:#16a34a;border-bottom:2px solid #16a34a;margin-bottom:8px;">{cur_ch}　解説</div>')
                cur_ch = ""
            # コードブロック複数行化で伸びる解説ページを圧縮
            # 文字拡大(pg-explain)。元の充填率が高い b26 は拡大すると A4 を超えるため対象外
            pid = (re.search(r'class="prob-id">\s*(b\d+)', b) or [None, ''])[1]
            cls = 'pg pg-tight' if pid == 'b26' else 'pg pg-tight pg-explain'
            out.append(b.replace('<div class="pg">', f'<div class="{cls}">', 1))
    # 模範解答集を末尾に
    for k, b in blocks:
        if k == "answer":
            out.append(b)
    # 戦略問題模範解答（部品ファイルがあれば末尾に追記）
    if os.path.exists("answers_strategy_section.html"):
        with open("answers_strategy_section.html", encoding="utf-8") as f:
            out.append(f.read())
    return build("解答集", "\n".join(out), booklet="解答集", extra_css=CSS_ANSWERS)

# ---------------------------------------------------------------
#  ④ 本体（概念・章扉・コラム）。0-4 結合、問題等は除去しポインタ挿入
# ---------------------------------------------------------------
def merge_0_4(concept_blocks):
    """0-4 と 0-4続き の2ブロックを1つに結合する"""
    pass

def make_main():
    out = []
    seen_toc = False
    skip_next_0_4_cont = False
    for k, b in blocks:
        if k == "cover":
            out.append(b); continue
        if k == "toc":
            if seen_toc:        # 重複目次を1つに
                continue
            seen_toc = True
            # 進め方の説明を別冊構成に更新
            b = b.replace(
                "各問題は「<strong>問題</strong> → <strong>解説</strong>（正解してから）」の2ページで構成されています。ヒントは各章末のヒント集にまとめています。",
                "問題・ヒント・解答は<strong>別冊</strong>（問題集／ヒント集／解答集）に分かれています。先生の指示に従って使いましょう。")
            b = b.replace("<tr><td>巻末</td><td>模範解答集</td><td>全27問の解答とポイント解説</td><td>b01〜b27</td></tr>",
                          '<tr><td>別冊</td><td>問題集 / ヒント集 / 解答集</td><td>問題・ヒント・解説・模範解答</td><td>b01〜b27</td></tr>')
            out.append(b); continue
        if k in ("problem", "hint", "explain", "answer"):
            # 問題・ヒント・解説・解答は本体から除去（別冊へ）。
            # 概念ページ末尾の既存ポインタ（「次のページへ → 問題 bXX」）はそのまま活かす。
            continue
        if k == "concept":
            # 0-3続き を 0-3 に結合: 続きブロックは見出しを外して直前へ繋ぐ
            if "0-3（続き）" in b:
                inner = re.sub(r'^\s*<div class="pg">', '', b)
                inner = re.sub(r'<h2>0-3（続き）.*?</h2>', '', inner, flags=re.S)
                # 直前の出力（0-3本体）の末尾 </div> を外して結合
                if out and out[-1].rstrip().endswith("</div>"):
                    prev = out[-1].rstrip()
                    prev = prev[:prev.rfind("</div>")]
                    out[-1] = prev + "\n" + inner
                    continue
            # 1-4「手札の枚数を調べる」を 1-3 のページに結合
            if "1-4　手札の枚数を調べる" in b and out:
                inner = re.sub(r'^\s*<div class="pg">', '', b)
                prev = re.sub(r'</div>\s*(<!--\s*end pg\s*-->)?\s*$', '',
                              out[-1].rstrip())
                prev = prev.replace('<div class="pg">', '<div class="pg pg-tight">', 1)
                out[-1] = prev + '\n<div style="margin-top:4px;"></div>\n' + inner
                continue
            out.append(b); continue
        if k == "column":
            # 章3・章7のコラムは直前の概念ページ（3-4 / 7-4）に結合する
            if any(s in b for s in COLUMN_MERGE) and out:
                inner = re.sub(r'^\s*<div class="pg">', '', b)  # 先頭の pg 開きを除去
                # 末尾の pg 閉じ </div><!-- end pg --> は残し、コラム本体を compact ラッパで包む
                inner = re.sub(r'\s*</div>\s*(<!--\s*end pg\s*-->)?\s*$', '', inner)
                prev = re.sub(r'</div>\s*(<!--\s*end pg\s*-->)?\s*$', '',
                              out[-1].rstrip())                  # 直前ページの pg 閉じを除去
                out[-1] = (prev + '\n<div style="margin-top:14px;"></div>\n'
                           + '<div class="column-compact">\n' + inner
                           + '\n</div>\n</div><!-- end pg -->')
                continue
            out.append(b); continue
        # chapter はそのまま
        out.append(b)
    body = rewrite_pointers("\n".join(out))
    # 0-4（ルール統合ページ）はコンパクト表示クラスを付与して A4 に収める
    body = body.replace('<div class="pg">\n<h2>0-3　大富豪のルール',
                        '<div class="pg pg-tight">\n<h2>0-3　大富豪のルール')
    body = body.replace('<div class="pg">\n<h2>0-4　DNCLとコードの書き方',
                        '<div class="pg pg-tight">\n<h2>0-4　DNCLとコードの書き方')
    body = body.replace('<div class="pg">\n<h2>0-2　画面の見方',
                        '<div class="pg pg-tight">\n<h2>0-2　画面の見方')
    # コードブロック複数行化で伸びたページを圧縮
    body = body.replace('<div class="pg">\n<h2>📖 2-3　％ は「余り」',
                        '<div class="pg pg-tight">\n<h2>📖 2-3　％ は「余り」')
    body = body.replace('<div class="pg">\n<div class="ch-header ch8">',
                        '<div class="pg pg-tight">\n<div class="ch-header ch8">')
    body = body.replace('<div class="pg">\n<div class="info-box" style="font-size:15px;line-height:2;">',
                        '<div class="pg pg-tight">\n<div class="info-box" style="font-size:15px;line-height:2;">')
    return build(None, body)

# ---- 書き出し ----
with open("textbook_problems.html", "w", encoding="utf-8") as f: f.write(make_problems())
with open("textbook_hints.html",    "w", encoding="utf-8") as f: f.write(make_hints())
with open("textbook_answers.html",  "w", encoding="utf-8") as f: f.write(make_answers())
with open(SRC,                       "w", encoding="utf-8") as f: f.write(make_main())

for fn in ["textbook_app_v2.html", "textbook_problems.html", "textbook_hints.html", "textbook_answers.html"]:
    sz = os.path.getsize(fn)
    pg = open(fn, encoding="utf-8").read().count('<div class="pg"')
    print(f"{fn:30s} {sz//1024:4d}KB  pg≈{pg}")
print(f"原本(入力源): {BAK}")
