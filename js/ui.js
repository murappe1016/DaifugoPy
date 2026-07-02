// UI Controller for Daifugo Strategy Debugger
'use strict';

// ─── Shortcut expansions ──────────────────────────────────────────────────────
const SHORTCUTS = {
  'f': '場の強さ',
  'n': '場の枚数',
  'h': '手札[]',
  'e': '要素数[]',
  's': '捨札[]',
  'o': '相手の手札',
  'i': 'もし 手札[1] ＞ 場の強さ ならば\n｜　\nを実行する',
  'I': 'もし 手札[1] ＞ 場の強さ ならば\n｜　\nを実行し，そうでなければ\n｜　\nを実行する',
  'w': '手札[1] ＞ 場の強さ の間，\n｜　\nを繰り返す',
  'r': '繰り返し，\n｜　\nを，手札[1] ＞ 場の強さ になるまで実行する',
  'l': 'i を 1 から 要素数[手札] まで 1 ずつ増やしながら，\n｜　\nを繰り返す',
  'F': '関数 名前() を\n｜　\nと定義する',
  'd': '出す(, )',
  'p': 'パスする',
  'b': '中断する',
  'R': '返す()',
  't': 'を表示する',
  'k': '記録する()',
};

// ─── Basic mode ref data (label + always-visible description) ─────────────────
const BASIC_REF_DATA = {
  'f': { label: '場の強さ',             tip: '場に出ているカードの値。空き場は 0\n3〜10はそのまま\nJ=11、Q=12、K=13、A=14、$=15' },
  'n': { label: '場の枚数',             tip: '場に出ているカードの枚数\n0=空き場  1=1枚出し  2=2枚出し' },
  'h': { label: '手札[番号]',         tip: '手札のN番目のカード値（1始まり）\n弱い順にソート済み\n手札[1]=最弱　手札[要素数[手札]]=最強' },
  'e': { label: '要素数[配列]',     tip: '配列の要素数を取得\n例: 要素数[手札] → 手札の枚数\n例: 要素数[捨札] → 捨て札の枚数' },
  's': { label: '捨札[番号]',         tip: '出された順に並ぶ捨て札のN番目\n（自分・相手の合計）\n捨札[1]=最初に出されたカード' },
  'o': { label: '相手の手札',           tip: '相手の手札（配列）。\n要素数[相手の手札] で相手の残り枚数がわかる' },
  'i': { label: 'もし〜ならば',         tip: '条件が成立するとき処理を実行する\n（if文）\nTabキーで次の枠へ移動できる' },
  'I': { label: 'もし〜ならば\nそうでなければ', tip: '条件に応じて2つの処理を切り替える\n（if-else文）\nTabキーで次の枠へ移動できる' },
  'w': { label: '前判定ループ',         tip: '条件が成立する間、処理を繰り返す\n（while文）\n条件が最初から偽なら実行されない' },
  'r': { label: '後判定ループ',         tip: '処理を行った後に条件を判定して繰り返す\n（do-while文）\n最低1回は必ず実行される' },
  'l': { label: 'forループ',            tip: '変数を初期値から終了値まで\n差分ずつ増やしながら繰り返す\n（for文）' },
  'F': { label: '関数定義',             tip: '関数を名前と引数で定義する\n例: 関数 最強(h) を\n　　　…\nと定義する' },
  'd': { label: '出す(カード, 枚数)', tip: 'カードを出す\n第1引数: カードの値（例: 手札[1]）\n第2引数: 枚数（1=シングル, 2=ペア）' },
  'p': { label: 'パスする',             tip: 'このターンをパスする\n（何も出さない → 場が流れる）' },
  'b': { label: '中断する',             tip: 'ループを途中で抜ける（break）\nループ内でのみ有効' },
  'R': { label: '返す(値)',         tip: '関数から値を返す\n返す(値) で関数を終了し\n呼び出し元に値を渡す' },
  't': { label: '値 を表示する',    tip: '値や文字列を表示画面に表示する\n「文字列」 と 変数 を表示する\n例: 「i=」 と i を表示する' },
  'k': { label: '記録する()',       tip: '手札の途中経過を記録する（ソート問題用）\n問題文の【記録のルール】の場所に書く\n記録の回数と中身が採点される' },
};

// Regex to find placeholder tokens ＜...＞
// 既知のプレースホルダー名のみマッチ（ユーザー定義変数 ＜foo＞ などとの誤検出を防止）
const PH_NAMES = ['式', '処理', '条件', '変数', '初期値', '終了値', '差分'];
const PH_RE = () => new RegExp('＜(?:' + PH_NAMES.join('|') + ')＞', 'g');

// ─── Half-width operator guard (disabled — both half-width and full-width are now accepted) ──
// DNCL公式仕様では +, -, >, <, % は半角が正式。アプリでも半角・全角どちらも受け付けます。
function checkHalfWidthOps(code) {
  return []; // 常に空を返す（半角演算子は有効）
}

// ─── Clear-message tips (#6) ─────────────────────────────────────────────────
const CLEAR_TIPS = {
  'b01': '手札[1] で最弱カードにアクセスする基本をマスター！',
  'b02': '値 を表示する で表示画面に値を出す基本をマスター！',
  'b03': '「文字列」 と 値 を表示する のつなぎ方をマスター！',
  'b04': '手札[要素数[手札]] で最強カードにアクセスする方法をマスター！',
  'b05': '変数に枚数を代入（n ← 要素数[手札]）して添字に使う方法をマスター！',
  'b06': '変数に値を代入して、添字として使う基本をマスター！',
  'b07': '「文字列」 と 式 を表示する で計算結果を出力する方法をマスター！',
  'b08': '÷ による整数の割り算（小数点以下切り捨て）をマスター！',
  'b09': '％ で余りを取り、偶数・奇数を判定する方法をマスター！',
  'b10': 'もし〜ならば で条件分岐する基本をマスター！',
  'b11': 'もし〜そうでなければ で2通りに処理を切り替える方法をマスター！',
  'b12': '手札の2枚が同じ強さかどうかを判定してペアで出す方法をマスター！',
  'b13': 'かつ で2つの条件を組み合わせる方法をマスター！',
  'b14': 'または でどちらか一方の条件でも実行する方法をマスター！',
  'b15': '（条件）でない で条件を否定する方法をマスター！',
  'b16': 'カウンタ変数を初期化してループ内で加算するパターンをマスター！',
  'b17': 'ループで最初に見つかる要素を記録するパターンをマスター！',
  'b18': 'ループ内で中断する を使って早期終了するパターンをマスター！',
  'b19': '前判定ループで かつ を使った複合条件での探索をマスター！',
  'b20': '後判定ループで必ず1回実行してから条件判定する仕組みをマスター！',
  'b21': '要素数[捨札] で手札以外の配列の大きさを調べる方法をマスター！',
  'b22': 'T[添字] ← 値 で自分の配列に値を代入する方法をマスター！',
  'b23': 'C[j] ← 0 で初期化してから C[r] ＋ 1 で集計（ヒストグラム）する方法をマスター！',
  'b24': '関数を定義して呼び出す基本をマスター！',
  'b25': '関数を定義して、返す で値を返す仕組みをマスター！',
  'b26': '関数の中でループを回し、結果を 返す で渡す組み合わせをマスター！',
  'b27': 'ループで特定の値（8）を探して出すパターンをマスター！8切りで場が流れる！',
};

// ─── State ────────────────────────────────────────────────────────────────────
let gs = new GameState();

const slots = {};
for (let r = MIN_RANK; r <= MAX_RANK; r++) slots[r] = ['empty', 'empty'];

let savedPlayerCards   = [];
let savedOpponentCards = [];

// Multi-editor tracking
let activeEditorN = 0;   // index of last-focused case-editor (0, 1, 2)
let savedSel      = null; // { n, start, end } captured on ref-panel mousedown

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50;

// ─── Display pane height constants ────────────────────────────────────────────
const DISP_COLL_H = 20;  // ヘッダーのみ = 折りたたみ高さ
const DISP_DEF_H  = 54;  // デフォルト展開高さ（1行表示）

// ─── Loop type state ──────────────────────────────────────────────────────────
let selectedLoopType = 'for';   // 'for' | 'while' | 'doWhile'
let loopHintCounts   = { for: 0, while: 0, doWhile: 0 };
const LOOP_SEEN_KEY    = 'daifugo_loop_seen';
const LOOP_TYPE_LABELS = { for: '増やしながら', while: '前判定', doWhile: '後判定' };
const LOOP_TYPE_KEYS   = ['for', 'while', 'doWhile'];

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showView(name) {
  document.querySelectorAll('.right-view').forEach(v => v.classList.remove('active'));
  $(name + '-view').classList.add('active');
}

function makeCard(rankNum, classes = []) {
  const el = document.createElement('div');
  el.className = 'card ' + classes.join(' ');
  el.textContent = RANK_NAMES[rankNum] || '?';
  return el;
}

// ─── Get full parseable DNCL code from three case-editors ────────────────────
function getFullCode() {
  const b = [0, 1, 2].map(n => $('ce-' + n).value.trimEnd());
  const parts = ['もし 場の枚数 ＝ 0 ならば'];
  if (b[0]) parts.push(b[0]);
  parts.push('を実行し，そうでなくもし 場の枚数 ＝ 1 ならば');
  if (b[1]) parts.push(b[1]);
  parts.push('を実行し，そうでなくもし 場の枚数 ＝ 2 ならば');
  if (b[2]) parts.push(b[2]);
  parts.push('を実行し，そうでなければ', '｜　パスする', 'を実行する');
  return parts.join('\n');
}

// ─── Auto-resize a textarea to fit its content ───────────────────────────────
function autoResize(editor) {
  editor.style.height = 'auto';
  editor.style.height = Math.max(editor.scrollHeight, 36) + 'px';
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function renderPlayerHand(hand, forecast) {
  const el = $('player-cards');
  el.innerHTML = '';
  const hlMap = {};
  if (forecast && forecast.action === 'play')
    hlMap[forecast.rank] = (hlMap[forecast.rank] || 0) + forecast.count;
  const remaining = { ...hlMap };
  hand.forEach(r => {
    const hl = remaining[r] > 0;
    if (hl) remaining[r]--;
    el.appendChild(makeCard(r, hl ? ['forecast'] : []));
  });
}

function renderFieldCards(fieldStrength, fieldCount) {
  const el = $('field-cards');
  el.innerHTML = '';
  if (fieldCount === 0) {
    el.innerHTML = '<span style="color:var(--muted);font-size:12px">（空）</span>';
    $('field-info').textContent = '';
  } else {
    for (let i = 0; i < fieldCount; i++) el.appendChild(makeCard(fieldStrength, ['field']));
    $('field-info').textContent = `ランク${RANK_NAMES[fieldStrength]}  ${fieldCount}枚`;
  }
}

function renderOppHand(hand) {
  const el = $('opp-cards');
  el.innerHTML = '';
  hand.forEach(r => el.appendChild(makeCard(r, ['opp'])));
}

function addLogEntry(text, type = '') {
  const el = document.createElement('div');
  el.className = 'log-entry ' + type;
  el.textContent = text;
  $('log-list').prepend(el);
}

function clearLog() { $('log-list').innerHTML = ''; }

// ─── Canvas overlay: indent guides + placeholder boxes ───────────────────────
function drawPHBoxes(n) {
  const canvas = $('ic-' + n);
  const editor = $('ce-' + n);
  if (!canvas || !editor) return;

  const dpr = window.devicePixelRatio || 1;
  const w   = editor.offsetWidth  || 1;
  const h   = editor.offsetHeight || 1;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const text = editor.value;
  if (!text) return;

  ctx.font = '13px Consolas, Monaco, "Courier New", monospace';

  const PAD_LEFT   = 12;
  const PAD_TOP    = 4;
  const LINE_H     = 13 * 1.6;
  const scrollLeft = editor.scrollLeft;
  const isLight    = document.documentElement.getAttribute('data-theme') === 'light';
  const accent     = isLight ? '#1a73e8' : '#4f9eff';

  const lines = text.split('\n');

  // ── Indent guide lines ────────────────────────────────────────────────────
  ctx.strokeStyle = isLight ? 'rgba(180,185,205,0.9)' : 'rgba(58,64,79,0.85)';
  ctx.lineWidth   = 1;

  const INDENT_W = ctx.measureText('｜　').width;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let levels = 0, pos = 0;
    while (pos + 1 < line.length && line[pos] === '｜' && line[pos + 1] === '　') {
      levels++;
      pos += 2;
    }
    if (levels === 0) continue;
    const lineTop = PAD_TOP + i * LINE_H;
    const yTop = Math.max(0, lineTop);
    const yBot = Math.min(h, lineTop + LINE_H);
    for (let lvl = 0; lvl < levels; lvl++) {
      const x = PAD_LEFT + lvl * INDENT_W - scrollLeft;
      if (x < 0 || x >= w) continue;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, yTop);
      ctx.lineTo(Math.floor(x) + 0.5, yBot);
      ctx.stroke();
    }

    // 空の本文行（インデントのみ）に、背景のゴースト「← ここに書く」を描画。
    // 実テキストではないので、何か書き込まれた瞬間に自然と消える。
    if (!editor.readOnly && line.length === pos) {
      ctx.fillStyle = isLight ? 'rgba(40,140,80,0.5)' : 'rgba(130,200,150,0.5)';
      ctx.fillText('← ここに書く', PAD_LEFT + levels * INDENT_W - scrollLeft + 2,
                   lineTop + LINE_H * 0.72);
    }
  }

  // ── Placeholder boxes ＜...＞ ─────────────────────────────────────────────
  const selStart = editor.selectionStart;
  const selEnd   = editor.selectionEnd;

  const re = PH_RE();
  let m;
  while ((m = re.exec(text)) !== null) {
    const phFrom   = m.index;
    const isActive = (selStart === phFrom && selEnd === phFrom + m[0].length);

    const before    = text.slice(0, phFrom);
    const prevLines = before.split('\n');
    const lineIdx   = prevLines.length - 1;
    const col       = prevLines[prevLines.length - 1].length;
    const lineText  = lines[lineIdx];
    if (lineText === undefined) continue;

    const bx1 = PAD_LEFT + ctx.measureText(lineText.slice(0, col)).width - scrollLeft;
    const bx2 = PAD_LEFT + ctx.measureText(lineText.slice(0, col + m[0].length)).width - scrollLeft;
    const by  = PAD_TOP + lineIdx * LINE_H;

    if (bx2 < 0 || bx1 > w || by + LINE_H < 0 || by > h) continue;

    ctx.fillStyle   = isActive ? accent + '30' : accent + '18';
    ctx.fillRect(bx1, by + 2, bx2 - bx1, LINE_H - 4);
    ctx.strokeStyle = isActive ? accent : accent + 'aa';
    ctx.lineWidth   = isActive ? 1.5 : 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(bx1 + 0.5, by + 2.5, bx2 - bx1 - 1, LINE_H - 5, 3);
      ctx.stroke();
    } else {
      ctx.strokeRect(bx1 + 0.5, by + 2.5, bx2 - bx1 - 1, LINE_H - 5);
    }
  }
}

function drawAllPHBoxes() { [0, 1, 2].forEach(drawPHBoxes); }

// ─── Line-number gutter ───────────────────────────────────────────────────────
function updateGutter(n) {
  const gutter = $('cg-' + n);
  const editor = $('ce-' + n);
  if (!gutter || !editor) return;
  const lineCount = editor.value.split('\n').length;
  let nums = '';
  for (let i = 1; i <= lineCount; i++) nums += i + '\n';
  gutter.textContent = nums;
}

function updateAllGutters() { [0, 1, 2].forEach(updateGutter); }

// ─── Undo / Redo ─────────────────────────────────────────────────────────────
function _snapshot() {
  const ed = $('ce-' + activeEditorN);
  return {
    values:   [0, 1, 2].map(n => $('ce-' + n).value),
    activeN:  activeEditorN,
    selStart: ed ? ed.selectionStart : 0,
    selEnd:   ed ? ed.selectionEnd   : 0,
    problemIdx: (typeof currentProblem !== 'undefined' && currentProblem)
                  ? problemList.indexOf(currentProblem) : null,
    hintCount:  (typeof hintCount !== 'undefined') ? hintCount : 0,
    mode:       (typeof currentMode !== 'undefined') ? currentMode : 'free',
  };
}

function pushHistory() {
  undoStack.push(_snapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
  const u = $('undo-btn'), r = $('redo-btn');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

function _applySnapshot(snap) {
  [0, 1, 2].forEach(n => {
    const editor = $('ce-' + n);
    editor.value = snap.values[n];
    autoResize(editor);
  });
  activeEditorN = snap.activeN;
  const editor = $('ce-' + snap.activeN);
  if (editor) {
    editor.focus();
    editor.selectionStart = snap.selStart;
    editor.selectionEnd   = snap.selEnd;
  }
  // Restore problem context if it was captured
  if (snap.problemIdx !== undefined) {
    if (snap.problemIdx === null) {
      currentProblem = null;
      $('problem-info')?.classList.add('hidden');
      $('problem-select') && ($('problem-select').value = '');
      unlockAllSections();
    } else if (problemList[snap.problemIdx]) {
      currentProblem = problemList[snap.problemIdx];
      hintCount = snap.hintCount || 0;
      $('problem-select') && ($('problem-select').value = snap.problemIdx);
      $('problem-info')?.classList.remove('hidden');
      $('problem-desc-wrap')?.classList.remove('collapsed');
      if (currentProblem.descriptionHtml) {
        $('problem-desc').classList.add('html-desc');
        $('problem-desc').innerHTML = currentProblem.descriptionHtml;
      } else {
        $('problem-desc').classList.remove('html-desc');
        $('problem-desc').textContent = currentProblem.description;
      }
      updateHintBtn();
      lockSections(currentProblem.activeSection);
    }
  }
  drawAllPHBoxes();
  updateAllGutters();
  updateUndoRedoBtns();
  scheduleForecast(100);
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(_snapshot());
  _applySnapshot(undoStack.pop());
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(_snapshot());
  _applySnapshot(redoStack.pop());
}

// ─── Indent helper ───────────────────────────────────────────────────────────
function getInsertIndent(val, pos) {
  const nlAfter   = val.indexOf('\n', pos);
  const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd   = nlAfter >= 0 ? nlAfter : val.length;
  const curLine   = val.slice(lineStart, lineEnd);

  const indentMatch = curLine.match(/^((?:｜　)*)/);
  const curIndent   = indentMatch ? indentMatch[1] : '';

  if (curLine.slice(curIndent.length).trim()) return curIndent;

  const prevLines = val.slice(0, lineStart).split('\n');
  for (let i = prevLines.length - 1; i >= 0; i--) {
    const ln = prevLines[i];
    if (ln.trim()) {
      const base    = ln.match(/^((?:｜　)*)/)[1];
      const trimmed = ln.trimEnd();
      if (/ならば$/.test(trimmed) || /[，,]$/.test(trimmed)) return base + '｜　';
      return base;
    }
  }
  return '';
}

// ─── Smart operator insertion (かつ / または / でない) ──────────────────────
// 半角・全角スペースと全角スペース（　）だけをトリムするヘルパー
function trimWSEnd(s)   { return s.replace(/[ 　\t]+$/, ''); }
function trimWSStart(s) { return s.replace(/^[ 　\t]+/, ''); }

// isPostfix=true: 後置演算子（でない）  false: 中置演算子（かつ / または）
function insertSmartOp(op, isPostfix) {
  pushHistory();
  const { n, start, end } = savedSel ?? {
    n:     activeEditorN,
    start: $('ce-' + activeEditorN).selectionStart,
    end:   $('ce-' + activeEditorN).selectionEnd,
  };
  savedSel = null;

  const editor = $('ce-' + n);
  editor.focus();
  const val = editor.value;

  // 現在行の範囲
  const lineStart  = val.lastIndexOf('\n', start - 1) + 1;
  const lineEndRaw = val.indexOf('\n', start);
  const lineEndIdx = lineEndRaw >= 0 ? lineEndRaw : val.length;

  const leftRaw  = val.slice(lineStart, start);
  const rightRaw = val.slice(end, lineEndIdx);

  // 先頭インデント（｜　 の連続）を取り出す
  const indentMatch = leftRaw.match(/^((?:｜　)*)/);
  const indent    = indentMatch ? indentMatch[1] : '';
  const leftFull  = leftRaw.slice(indent.length);  // インデント除去後の左テキスト

  // ── 構文キーワードを分離 ──────────────────────────────────────────────────
  // 左端のキーワード（もし / 繰り返し，）を取り出す
  const lkwMatch = leftFull.match(/^((?:もし|繰り返し[，,]?)\s+)/);
  const lkw   = lkwMatch ? lkwMatch[1] : '';
  const lexpr = trimWSEnd(leftFull.slice(lkw.length));   // 実際の式部分

  // 右端のキーワード（ならば / の間，/ を繰り返す 等）を取り出す
  const rkwMatch = rightRaw.match(/(\s*(?:ならば|の間[，,]|を繰り返す|になるまで実行する)\s*)$/);
  const rkw      = rkwMatch ? rkwMatch[1] : '';
  const rexpr    = trimWSStart(rightRaw.slice(0, rightRaw.length - rkw.length));

  // ── 式部分で組み立て（キーワードは前後に保持）─────────────────────────
  let exprPart;
  if (isPostfix) {
    exprPart = (lexpr || '手札[1]') + '　' + op;
  } else {
    if (lexpr && rexpr)       exprPart = lexpr + '　' + op + '　' + rexpr;
    else if (lexpr)           exprPart = lexpr + '　' + op + '　手札[1]';
    else if (rexpr)           exprPart = '手札[1]　' + op + '　' + rexpr;
    else                      exprPart = '手札[1]　' + op + '　手札[1]';
  }

  const newLine = indent + lkw + exprPart + rkw;
  const newVal  = val.slice(0, lineStart) + newLine + val.slice(lineEndIdx);
  editor.value  = newVal;

  // 挿入した行内の最初の ＜...＞ を選択
  const re = PH_RE();
  re.lastIndex = lineStart;
  const phMatch = re.exec(newVal);
  if (phMatch && phMatch.index < lineStart + newLine.length) {
    editor.setSelectionRange(phMatch.index, phMatch.index + phMatch[0].length);
  } else {
    editor.selectionStart = editor.selectionEnd = lineStart + newLine.length;
  }

  autoResize(editor);
  updateGutter(n);
  drawAllPHBoxes();
  scheduleForecast(400);
}

// ─── Insert text at cursor (ref-panel click-to-insert) ───────────────────────
function insertAtCursor(text) {
  pushHistory();
  let { n, start, end } = savedSel ?? {
    n:     activeEditorN,
    start: $('ce-' + activeEditorN).selectionStart,
    end:   $('ce-' + activeEditorN).selectionEnd,
  };
  savedSel = null;

  const editor = $('ce-' + n);
  if (editor.readOnly) return;   // ロック中のセクションには挿入しない
  editor.focus();
  const val = editor.value;

  // 緑コメントのプレースホルダーだけの行なら、本文部分（｜　の後ろ〜行末）を選択範囲にして置換する
  if (val === '｜　') {
    start = 2;
    end   = val.length;
  }

  // カーソルがプレースホルダー内に位置していて選択がない場合、そのプレースホルダーを選択範囲とみなす
  if (start === end) {
    const re = PH_RE();
    let m;
    while ((m = re.exec(val)) !== null) {
      if (start >= m.index && start <= m.index + m[0].length) {
        start = m.index;
        end   = m.index + m[0].length;
        break;
      }
    }
  }

  // ＜変数＞が選択中に「配列名[＜式＞]」をクリックした場合のみ
  // → 配列名だけ（[ より前）を挿入して 要素数[手札] のような形にする
  // ※ ＜式＞など他のプレースホルダーが選択中のときは全体を挿入する
  const selectedText = val.slice(start, end);
  if (selectedText === '＜変数＞' && /^[^[\n]+\[＜式＞\]$/.test(text)) {
    text = text.slice(0, text.indexOf('['));
  }

  const isMultiLine = text.includes('\n');
  let insertStart, sliceFrom;

  // 選択中のテキストがプレースホルダー ＜...＞ だけの行かどうかを判定
  const phExec0    = PH_RE().exec(selectedText);
  const phFullHit  = phExec0 !== null && phExec0[0] === selectedText;
  const lsIdx      = val.lastIndexOf('\n', start - 1) + 1;
  const leIdx      = val.indexOf('\n', start);
  const lineText   = val.slice(lsIdx, leIdx >= 0 ? leIdx : val.length);
  const isLonelyPH = phFullHit && start !== end && lineText.trim() === selectedText;

  if (isMultiLine && (isLonelyPH || val === '｜　')) {
    // 空の本文行（または孤立プレースホルダー）を、その場で複数行に展開する
    // （行頭インデントを引き継ぎ、余計な改行＝空白行を作らない）
    insertStart = start;
    sliceFrom   = end;
    const linePrefix = (lineText.match(/^((?:｜　)*)/) || ['', ''])[1];
    if (linePrefix) {
      const expLines = text.split('\n');
      text = [
        expLines[0],
        ...expLines.slice(1).map(l => l ? linePrefix + l : l),
      ].join('\n');
    }
  } else if (isMultiLine) {
    const nlIdx = val.indexOf('\n', start);
    insertStart = sliceFrom = nlIdx >= 0 ? nlIdx + 1 : val.length;
    const indent = getInsertIndent(val, start);
    if (indent) {
      text = text.split('\n').map(l => l ? indent + l : l).join('\n');
    }
    if (insertStart === val.length && val.length > 0 && val[val.length - 1] !== '\n') {
      text = '\n' + text;
    } else if (insertStart < val.length && val[insertStart] !== '\n') {
      text = text + '\n';
    }
  } else {
    insertStart = start;
    sliceFrom   = end;
  }

  const newVal = val.slice(0, insertStart) + text + val.slice(sliceFrom);
  editor.value = newVal;
  autoResize(editor);
  updateGutter(n);

  // Select first ＜...＞ placeholder in the inserted text
  const re = PH_RE();
  re.lastIndex = insertStart;
  const phMatch = re.exec(newVal);
  if (phMatch && phMatch.index < insertStart + text.length) {
    editor.selectionStart = phMatch.index;
    editor.selectionEnd   = phMatch.index + phMatch[0].length;
  } else {
    // 空の括弧/角括弧があれば、その中（最初の引数位置）にカーソルを置く
    //   例: 出す(, ) → "(" の直後、手札[] → "[" の直後
    const region  = newVal.slice(insertStart, insertStart + text.length);
    const mEmpty  = region.match(/[([](?=[\s,)\]）])/);
    if (mEmpty) {
      editor.selectionStart = editor.selectionEnd = insertStart + mEmpty.index + 1;
    } else if (/^を/.test(region)) {
      // 「を表示する」など、値が前に来る命令はカーソルを先頭に置く
      editor.selectionStart = editor.selectionEnd = insertStart;
    } else {
      // Step past ']' if cursor lands immediately before a closing bracket (#2/#7)
      let curPos = insertStart + text.length;
      if (newVal[curPos] === ']') curPos++;
      editor.selectionStart = editor.selectionEnd = curPos;
    }
  }

  drawAllPHBoxes();
  scheduleForecast(400);
}

// ─── Editor: @shortcut expansion ─────────────────────────────────────────────
function handleEditorInput(e, n) {
  const editor = $('ce-' + n);
  autoResize(editor);
  drawPHBoxes(n);
  updateGutter(n);
  $('error-msg').textContent = '';

  const val    = editor.value;
  const pos    = editor.selectionStart;
  const before = val.slice(0, pos);

  // <- を ← に自動変換（IME入力中は変換しない）
  if (!e.isComposing && e.inputType !== 'insertCompositionText' && before.endsWith('<-')) {
    pushHistory();
    const newVal = val.slice(0, pos - 2) + '←' + val.slice(pos);
    editor.value = newVal;
    editor.selectionStart = editor.selectionEnd = pos - 1;
    autoResize(editor);
    updateGutter(n);
    drawPHBoxes(n);
    scheduleForecast(400);
    return;
  }

  const match  = before.match(/@([a-zA-Z])$/);

  if (match) {
    let expansion = SHORTCUTS[match[1]];
    if (expansion) {
      pushHistory();
      const start = pos - 2;  // '@' + 1文字 = 2文字分を削除

      if (expansion.includes('\n')) {
        const indent = getInsertIndent(val, start);
        if (indent) {
          const expLines = expansion.split('\n');
          expansion = [
            expLines[0],
            ...expLines.slice(1).map(l => l ? indent + l : l),
          ].join('\n');
        }
      }

      const newVal = val.slice(0, start) + expansion + val.slice(pos);
      editor.value = newVal;
      autoResize(editor);
      updateGutter(n);

      const re = PH_RE();
      re.lastIndex = start;
      const phMatch = re.exec(newVal);
      if (phMatch && phMatch.index < start + expansion.length) {
        editor.selectionStart = phMatch.index;
        editor.selectionEnd   = phMatch.index + phMatch[0].length;
      } else {
        const expLines = expansion.split('\n');
        const newPos   = start + (expLines.length > 1
          ? expLines[0].length + 1 + expLines[1].length
          : expansion.length);
        editor.selectionStart = editor.selectionEnd = Math.min(newPos, newVal.length);
      }

      drawPHBoxes(n);
    }
  }

  scheduleForecast(400);
}

// ─── Editor: keyboard handling ────────────────────────────────────────────────
function handleEditorKeydown(e, n) {
  // Undo / Redo
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }

  const editor = $('ce-' + n);

  // ── 印字可能キー入力時、カーソルがPH内にあればPH全体を先に選択 ───────────
  // これにより "1" などを押すだけでプレースホルダーが置き換わる
  if (!e.metaKey && !e.ctrlKey && !e.altKey &&
      !e.isComposing && e.key.length === 1) {
    // 緑コメントの初期プレースホルダーなら、印字キー（スペース含む）で本文を選択 → 置換
    if (editor.value === '｜　') {
      editor.setSelectionRange(2, editor.value.length);
    } else {
      const pos = editor.selectionStart;
      if (pos === editor.selectionEnd) {        // 選択なし（カーソルのみ）
        const val = editor.value;
        const re  = PH_RE();
        let m;
        while ((m = re.exec(val)) !== null) {
          if (pos >= m.index && pos <= m.index + m[0].length) {
            editor.setSelectionRange(m.index, m.index + m[0].length);
            break;
          }
        }
      }
    }
  }

  // ── Enter: auto-indent (carry ｜　 prefix to next line) ──────────────────
  if (e.key === 'Enter') {
    if (e.isComposing || e.keyCode === 229) return; // IME確定のEnterは無視
    e.preventDefault();
    pushHistory();
    const val       = editor.value;
    const pos       = editor.selectionStart;
    const selEnd    = editor.selectionEnd;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    const curLine   = val.slice(lineStart, pos);

    // Measure current indent (number of ｜　 pairs)
    const indentMatch = curLine.match(/^((?:｜　)*)/);
    let indent = indentMatch ? indentMatch[1] : '';

    // Add one extra level when the line header triggers a block
    const trimmed = curLine.trimEnd();
    if (/ならば$/.test(trimmed) || /[，,]$/.test(trimmed)) {
      indent += '｜　';
    }

    const newVal = val.slice(0, pos) + '\n' + indent + val.slice(selEnd);
    editor.value = newVal;
    editor.selectionStart = editor.selectionEnd = pos + 1 + indent.length;
    autoResize(editor);
    updateGutter(n);
    drawPHBoxes(n);
    return;
  }

  if (e.key !== 'Tab') return;
  e.preventDefault();

  pushHistory();
  const curPos = editor.selectionEnd;

  // Find next ＜...＞ starting from current editor, wrapping through all editors
  let found = false;
  for (let offset = 0; offset < 3; offset++) {
    const ni = (n + offset) % 3;
    const ed = $('ce-' + ni);
    const searchFrom = (offset === 0) ? curPos : 0;
    const re = PH_RE();
    re.lastIndex = searchFrom;
    const m = re.exec(ed.value);
    if (m) {
      activeEditorN = ni;
      ed.focus();
      ed.setSelectionRange(m.index, m.index + m[0].length);
      drawAllPHBoxes();
      found = true;
      break;
    }
  }

  if (!found) {
    // No placeholders: insert one indent level
    const val   = editor.value;
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    editor.value = val.slice(0, start) + '｜　' + val.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    autoResize(editor);
    updateGutter(n);
    drawPHBoxes(n);
  }
}

// ─── Forecast scheduling ─────────────────────────────────────────────────────
function scheduleForecast(delay = 100) {
  // Use editor 0 as the timer carrier for simplicity
  clearTimeout(scheduleForecast._timer);
  scheduleForecast._timer = setTimeout(() => {
    if (gs.phase === 'playing' && gs.currentTurn === 'player') computeAndShowForecast();
  }, delay);
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function buildCardGrid() {
  const grid = $('card-grid');
  grid.innerHTML = '';
  for (let r = MIN_RANK; r <= MAX_RANK; r++) {
    const group = document.createElement('div');
    group.className = 'card-rank-group';
    const label = document.createElement('div');
    label.className = 'rank-label';
    label.textContent = RANK_NAMES[r];
    group.appendChild(label);
    const row = document.createElement('div');
    row.className = 'slot-row';
    for (let slot = 0; slot < 2; slot++) {
      const btn = document.createElement('button');
      btn.className    = 'slot-btn';
      btn.dataset.rank = r;
      btn.dataset.slot = slot;
      btn.title = `ランク${RANK_NAMES[r]} スロット${slot + 1}`;
      btn.addEventListener('click', () => cycleSlot(r, slot));
      row.appendChild(btn);
    }
    group.appendChild(row);
    grid.appendChild(group);
  }
  refreshSlotButtons();
}

function cycleSlot(rank, slot) {
  const cur = slots[rank][slot];
  slots[rank][slot] = cur === 'empty' ? 'player' : cur === 'player' ? 'opponent' : 'empty';
  refreshSlotButtons();
  updateStartBtn();
}

function refreshSlotButtons() {
  for (let r = MIN_RANK; r <= MAX_RANK; r++) {
    for (let s = 0; s < 2; s++) {
      const btn = document.querySelector(`.slot-btn[data-rank="${r}"][data-slot="${s}"]`);
      if (!btn) continue;
      const state = slots[r][s];
      btn.className   = 'slot-btn' + (state === 'player' ? ' p' : state === 'opponent' ? ' o' : '');
      btn.textContent = state === 'player' ? '自' : state === 'opponent' ? '相' : '';
    }
  }
}

function updateStartBtn() {
  const pc = countCards('player'), oc = countCards('opponent');
  $('setup-summary').textContent = `自分: ${pc}枚 / 相手: ${oc}枚`;
  $('start-btn').disabled = pc === 0 || oc === 0;
}

function countCards(who) {
  let n = 0;
  for (let r = MIN_RANK; r <= MAX_RANK; r++) slots[r].forEach(s => { if (s === who) n++; });
  return n;
}

function getHandFromSlots(who) {
  const hand = [];
  for (let r = MIN_RANK; r <= MAX_RANK; r++) slots[r].forEach(s => { if (s === who) hand.push(r); });
  return hand;
}

// ─── Game Start / Retry ───────────────────────────────────────────────────────
function startGame() {
  // 編集可能なセクションが全て初期プレースホルダーのままなら警告
  const editable = [0, 1, 2].filter(n => !$('ce-' + n).readOnly);
  const allEmpty = editable.every(n => {
    const v = $('ce-' + n).value.trim();
    return v === '' || v === '｜';
  });
  if (allEmpty) {
    if (!confirm('⚠️ 戦略コードがまだ書かれていません（プレースホルダーのまま）。\nこのまま開始すると毎ターンパスになりますが、続行しますか？')) {
      return;
    }
  }
  savedPlayerCards   = getHandFromSlots('player');
  savedOpponentCards = getHandFromSlots('opponent');
  beginMatch(savedPlayerCards, savedOpponentCards);
}

function retryGame() {
  beginMatch(savedPlayerCards, savedOpponentCards);
  $('gameover-overlay').classList.add('hidden');
}

function beginMatch(playerCards, opponentCards) {
  gs = new GameState();
  // 問題モード時は問題の initialState を反映
  const initState = (isProblemMode() && currentProblem && currentProblem.initialState)
                      ? currentProblem.initialState : null;
  gs.startMatch(playerCards, opponentCards, initState);
  clearLog();
  $('error-msg').textContent = '';
  $('next-btn').disabled = false;

  // 問題モードでは「この問題は n=X 専用」をログに表示
  if (isProblemMode() && currentProblem) {
    const n = currentProblem.activeSection;
    addLogEntry(`📘 この問題は「場の枚数 = ${n}」専用です。それ以外の場面では自動でパスします。`);
    if (initState && (initState.fieldStrength || initState.fieldCount)) {
      addLogEntry(`🎯 開始状態: 場 ${RANK_NAMES[initState.fieldStrength] || '空'} × ${initState.fieldCount}枚`);
    }
  }

  showView('game');
  clearDisplayPane();
  updateGameView();
  computeAndShowForecast();
}

// ─── Core Game View ───────────────────────────────────────────────────────────
function updateGameView() {
  renderOppHand(gs.opponentHand);
  renderFieldCards(gs.fieldStrength, gs.fieldCount);
  renderPlayerHand(gs.playerHand, gs.forecast);
  updateTurnIndicator();
}

function updateTurnIndicator() {
  const el = $('turn-indicator');
  if (gs.phase === 'gameover') { el.textContent = 'ゲーム終了'; return; }
  el.textContent = gs.currentTurn === 'player' ? '自分のターン' : '相手のターン';
}

// ─── Forecast Computation ─────────────────────────────────────────────────────

// セクション n のコードを単体で実行してエラーを検出（null = エラーなし）
function checkSectionError(n) {
  const code = $('ce-' + n).value.trim();
  if (!code || code === '｜　パスする' || code === '｜') return null;
  if (PH_RE().test(code)) return null; // PH は別途チェック
  try {
    new DNCLInterpreter(gs.getDNCLState()).run(code);
    return null;
  } catch(e) {
    return e; // .message / .line を持つ DNCLError
  }
}

function computeAndShowForecast() {
  if (gs.phase === 'gameover') return;
  gs.forecast = null; gs.forecastError = null;
  $('error-msg').textContent = '';
  $('next-btn').disabled = false; // エラー解消時に再度有効化
  if (gs.currentTurn === 'player') computePlayerForecast();
  else computeOpponentForecastUI();
  renderPlayerHand(gs.playerHand, gs.forecast);
  updateForecastBox();
}

function computePlayerForecast() {
  const activeN = Math.min(gs.fieldCount, 2);
  const code = getFullCode();

  // 1. プレースホルダー未入力チェック
  if (PH_RE().test(code)) {
    gs.forecast = { action: 'pass' };
    gs.forecastError = '⚠️ プレースホルダー（＜　＞）が残っています';
    $('error-msg').textContent = gs.forecastError;
    return;
  }
  const trimmed = code.trim();
  if (!trimmed) { gs.forecast = { action: 'pass' }; return; }

  // 2. 現在のターンに対応するセクションのエラー → 停止
  const activeErr = checkSectionError(activeN);
  if (activeErr) {
    gs.forecast = null;
    const loc = activeErr.line ? ` (行${activeErr.line})` : '';
    gs.forecastError = `❌ 場の枚数=${activeN} のコードにエラー${loc}: ${activeErr.message}`;
    $('error-msg').textContent = gs.forecastError;
    $('next-btn').disabled = true;
    return;
  }

  // 3. 全体コードを実行して予報を取得
  try {
    const interp = new DNCLInterpreter(gs.getDNCLState());
    const result = interp.run(trimmed);
    if (result.action === 'play') {
      const err = gs.validatePlayerPlay(result.rank, result.count);
      if (err) {
        gs.forecast = { action: 'pass' };
        gs.forecastError = `⚠️ 無効な手: ${err} → パスに変更`;
        $('error-msg').textContent = gs.forecastError;
        return;
      }
    }
    gs.forecast = result;
    gs.displayMessages = result.displayMessages || [];

    // 4. 他セクションのエラーを警告（進行は妨げない）
    const warnSections = [0, 1, 2]
      .filter(n => n !== activeN && checkSectionError(n))
      .map(n => `場の枚数=${n}`);
    $('error-msg').textContent = warnSections.length
      ? `⚠️ 「${warnSections.join('」「')}」のコードにエラーあり（現在のターンは正常）`
      : '';

  } catch(e) {
    gs.forecast = { action: 'pass' };
    gs.forecastError = `❌ ${e.message}${e.line ? ' (行' + e.line + ')' : ''}`;
    $('error-msg').textContent = gs.forecastError;
  }
}

function computeOpponentForecastUI() { gs.forecast = gs.computeOpponentForecast(); }

function updateForecastBox() {
  const el = $('forecast-box');
  if (!gs.forecast) { el.textContent = ''; return; }
  const who = gs.currentTurn === 'player' ? '自分' : '相手';
  el.textContent = gs.forecast.action === 'pass'
    ? `${who}: パス`
    : `${who}: ${RANK_NAMES[gs.forecast.rank]} を ${gs.forecast.count}枚出す予定`;

  // 表示する[] の吹き出し + 表示画面ペイン
  const bubble = $('display-bubble');
  const msgs = gs.displayMessages || [];
  if (msgs.length > 0) {
    $('display-bubble-content').innerHTML =
      msgs.map(m => `<div class="bubble-line">${escapeHtml(m)}</div>`).join('');
    bubble.classList.remove('hidden');
    appendDisplayPane(msgs);
  } else {
    bubble.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Display Pane ─────────────────────────────────────────────────────────────
function initDisplayPane() {
  const pane   = $('display-pane');
  const header = $('display-pane-header');
  if (!pane) return;

  // 初期は折りたたみ状態
  pane.classList.add('collapsed');
  pane.style.height = DISP_COLL_H + 'px';

  // ヘッダーがドラッグ（リサイズ）＋クリック（折りたたみ）を兼ねる
  const DRAG_THRESHOLD = 3;
  header.addEventListener('mousedown', e => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = pane.offsetHeight;
    const maxH   = Math.floor(window.innerHeight * 0.5);
    let moved = false;

    const onMove = ev => {
      if (!moved && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      const delta = startY - ev.clientY;   // 上方向 = 拡大
      const newH  = Math.max(DISP_COLL_H, Math.min(startH + delta, maxH));
      pane.style.height = newH + 'px';
      if (newH > DISP_COLL_H) pane.classList.remove('collapsed');
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (!moved) {
        // ドラッグなし → クリック判定：折りたたみトグル
        if (pane.classList.contains('collapsed')) {
          pane.classList.remove('collapsed');
          pane.style.height = (parseInt(pane.dataset.openHeight) || DISP_DEF_H) + 'px';
        } else {
          pane.dataset.openHeight = pane.offsetHeight;
          pane.classList.add('collapsed');
          pane.style.height = DISP_COLL_H + 'px';
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // エラーメッセージがある場合だけ editor-footer を表示
  const errMsg = $('error-msg');
  const footer  = $('editor-footer');
  if (errMsg && footer) {
    const syncFooter = () => footer.classList.toggle('has-error', errMsg.textContent.trim() !== '');
    new MutationObserver(syncFooter).observe(errMsg, { childList: true, characterData: true, subtree: true });
    syncFooter();
  }
}

function clearDisplayPane() {
  const pane = $('display-pane');
  const body = $('display-pane-body');
  if (!body) return;
  body.innerHTML = '<span class="dp-empty">（「を表示する」の出力がここに表示されます）</span>';
  // 折りたたみ状態に戻す
  if (pane) {
    pane.classList.add('collapsed');
    pane.style.height = DISP_COLL_H + 'px';
  }
}

function appendDisplayPane(messages, label) {
  const pane = $('display-pane');
  const body = $('display-pane-body');
  if (!pane || !body || !messages || messages.length === 0) return;

  // 初回出力時は空メッセージを消す
  const empty = body.querySelector('.dp-empty');
  if (empty) body.innerHTML = '';

  if (label) {
    const lEl = document.createElement('div');
    lEl.className = 'dp-label';
    lEl.textContent = label;
    body.appendChild(lEl);
  }
  messages.forEach(msg => {
    const line = document.createElement('div');
    line.className = 'dp-line new';                // 'new' で点滅アニメ開始
    line.textContent = msg;
    body.appendChild(line);
    // アニメ終了後に 'new' クラスを除去（再追加時に再発火できるよう）
    line.addEventListener('animationend', () => line.classList.remove('new'), { once: true });
  });

  // 全行が見えるサイズに自動展開（最大40%）
  const maxH    = Math.floor(window.innerHeight * 0.4);
  const targetH = Math.min(DISP_COLL_H + body.scrollHeight, maxH);
  pane.dataset.openHeight = targetH;
  pane.classList.remove('collapsed');
  pane.style.height = targetH + 'px';
  body.scrollTop = body.scrollHeight;
}

// ─── Next Step ────────────────────────────────────────────────────────────────
function nextStep() {
  if (gs.phase === 'gameover' || !gs.forecast) return;
  const prevLogLen = gs.log.length;
  if (gs.currentTurn === 'player') gs.applyPlayerAction(gs.forecast);
  else gs.applyOpponentAction();
  for (let i = prevLogLen; i < gs.log.length; i++) {
    const entry = gs.log[i];
    const type  = entry.includes('自分') ? 'player' : entry.includes('相手') ? 'opponent' : '';
    addLogEntry(entry, entry.includes('勝利') ? 'win' : type);
  }
  gs.forecast = null;
  updateGameView();
  if (gs.phase === 'gameover') { showGameover(); return; }
  $('error-msg').textContent = '';
  computeAndShowForecast();
}

// ─── Gameover ────────────────────────────────────────────────────────────────
function showGameover() {
  $('gameover-msg').textContent = gs.winner === 'player' ? '自分の勝ち！' : '相手の勝ち';
  $('gameover-overlay').classList.remove('hidden');
  $('next-btn').disabled = true;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function init() {
  buildCardGrid();
  updateStartBtn();

  // ── Editor: collapsible case blocks ─────────────────────────────────────
  document.querySelectorAll('.sk-collapsible').forEach(sk => {
    sk.addEventListener('click', () => {
      const block = sk.nextElementSibling;
      if (!block || !block.classList.contains('case-block')) return;
      const collapsed = block.classList.toggle('collapsed');
      sk.classList.toggle('collapsed', collapsed);
    });
  });

  // ── Left panel: collapsible sections ────────────────────────────────────
  document.querySelectorAll('.ref-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.ref-section').classList.toggle('collapsed');
    });
  });

  // ── Left panel: ドラッグでリサイズ / クリックで折りたたみ ──────────────────
  const REF_WIDTH_KEY = 'daifugo_ref_width';
  const REF_MIN_W     = 120;
  const REF_MAX_W     = 400;

  let refCollapsed   = false;
  let customRefWidth = Math.max(REF_MIN_W,
    parseInt(localStorage.getItem(REF_WIDTH_KEY)) || 190);
  $('ref-panel').style.width = customRefWidth + 'px';

  const refResizerTri = $('ref-resizer').querySelector('.ref-resizer-tri');

  function toggleRefPanel() {
    const panel = $('ref-panel');
    panel.style.transition = 'width .25s ease';
    refCollapsed = !refCollapsed;
    if (refCollapsed) {
      panel.style.width = '0px';
      if (refResizerTri) refResizerTri.textContent = '▶';
      document.body.classList.add('left-panel-collapsed');
    } else {
      panel.style.width = customRefWidth + 'px';
      if (refResizerTri) refResizerTri.textContent = '◀';
      document.body.classList.remove('left-panel-collapsed');
      setTimeout(() => [0, 1, 2].forEach(n => drawPHBoxes(n)), 260);
    }
  }

  $('ref-resizer').addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();

    const panel  = $('ref-panel');
    const handle = $('ref-resizer');
    const startX = e.clientX;
    const startW = refCollapsed ? customRefWidth : panel.offsetWidth;
    let dragged  = false;

    function onMove(mv) {
      const dx = mv.clientX - startX;
      if (!dragged && Math.abs(dx) > 4) {
        dragged = true;
        panel.style.transition        = 'none';
        document.body.style.userSelect = 'none';
        handle.classList.add('dragging');
      }
      if (!dragged) return;
      const newW = Math.max(REF_MIN_W, Math.min(REF_MAX_W, startW + dx));
      customRefWidth = newW;
      panel.style.width = newW + 'px';
      // 折りたたみ中に右へ引いたら自動展開
      if (refCollapsed && newW > REF_MIN_W / 2) {
        refCollapsed = false;
        if (refResizerTri) refResizerTri.textContent = '◀';
        document.body.classList.remove('left-panel-collapsed');
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      handle.classList.remove('dragging');
      panel.style.transition        = '';
      document.body.style.userSelect = '';
      if (dragged) {
        localStorage.setItem(REF_WIDTH_KEY, Math.round(customRefWidth));
        [0, 1, 2].forEach(n => { autoResize($('ce-' + n)); drawPHBoxes(n); });
      } else {
        toggleRefPanel();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // ── Right panel: ドラッグでリサイズ / クリックで折りたたみ ────────────────
  const PANEL_WIDTH_KEY = 'daifugo_panel_width';
  const PANEL_MIN_W     = 150;
  const PANEL_MAX_W     = 700;

  let panelCollapsed   = false;
  let customPanelWidth = Math.max(PANEL_MIN_W,
    parseInt(localStorage.getItem(PANEL_WIDTH_KEY)) || 270);

  // 保存済み幅を復元
  $('right-panel').style.width = customPanelWidth + 'px';

  function toggleDebugPanel() {
    const panel = $('right-panel');
    panel.style.transition = 'width .25s ease';
    panelCollapsed = !panelCollapsed;
    if (panelCollapsed) {
      panel.style.width = '20px';
      $('panel-toggle-tab').textContent = '▶';
      document.body.classList.add('right-panel-collapsed');
    } else {
      panel.style.width = customPanelWidth + 'px';
      $('panel-toggle-tab').textContent = '◀';
      document.body.classList.remove('right-panel-collapsed');
      setTimeout(() => [0, 1, 2].forEach(n => drawPHBoxes(n)), 260);
    }
  }

  $('panel-toggle-tab').addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();

    const panel   = $('right-panel');
    const startX  = e.clientX;
    const startW  = panel.offsetWidth;
    let dragged   = false;

    function onMove(mv) {
      const dx = startX - mv.clientX; // 左へ引くと広がる
      if (!dragged && Math.abs(dx) > 4) {
        dragged = true;
        panel.style.transition = 'none';
        document.body.style.userSelect = 'none';
      }
      if (!dragged) return;

      const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW + dx));
      customPanelWidth = newW;
      panel.style.width = newW + 'px';

      // 折りたたみ中に右へ引いたら自動展開
      if (panelCollapsed && newW > 25) {
        panelCollapsed = false;
        $('panel-toggle-tab').textContent = '◀';
        document.body.classList.remove('right-panel-collapsed');
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      panel.style.transition     = '';
      document.body.style.userSelect = '';
      if (dragged) {
        localStorage.setItem(PANEL_WIDTH_KEY, Math.round(customPanelWidth));
        [0, 1, 2].forEach(n => { autoResize($('ce-' + n)); drawPHBoxes(n); });
      } else {
        toggleDebugPanel();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // ── Wire up the three case-editor textareas ───────────────────────────────
  const INITIAL_BODY = '｜　';

  [0, 1, 2].forEach(n => {
    const editor = $('ce-' + n);

    editor.value = INITIAL_BODY;
    autoResize(editor);
    updateGutter(n);

    editor.addEventListener('focus', () => {
      activeEditorN = n;
      // 初期プレースホルダー（緑コメント）にフォーカスしたら本文部分を選択。
      // → 1文字でも入力（タイプ/貼り付け/チップ挿入）すると即置換され、コメントは消える。
      if (!editor.readOnly && editor.value === INITIAL_BODY) {
        setTimeout(() => {
          if (editor.value === INITIAL_BODY) editor.setSelectionRange(2, editor.value.length);
        }, 0);
      }
    });
    editor.addEventListener('click', () => {
      activeEditorN = n;
      // クリック位置がプレースホルダー内なら自動選択（クリック確定後に評価）
      setTimeout(() => {
        const pos = editor.selectionStart;
        if (pos === editor.selectionEnd) {
          const text = editor.value;
          const re = PH_RE();
          let m;
          while ((m = re.exec(text)) !== null) {
            if (pos > m.index && pos < m.index + m[0].length) {
              editor.setSelectionRange(m.index, m.index + m[0].length);
              break;
            }
          }
        }
        drawPHBoxes(n);
      }, 0);
    });
    editor.addEventListener('keyup',   () => { drawPHBoxes(n); });
    editor.addEventListener('scroll',  () => { drawPHBoxes(n); });
    editor.addEventListener('input',   e  => handleEditorInput(e, n));
    editor.addEventListener('keydown', e  => handleEditorKeydown(e, n));
  });

  drawAllPHBoxes();

  window.addEventListener('resize', () => {
    [0, 1, 2].forEach(n => { autoResize($('ce-' + n)); drawPHBoxes(n); });
  });

  // ── Theme toggle（入口・問題モード両方のボタンを同期）──────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const label = theme === 'dark' ? '☀ ライト' : '🌙 ダーク';  // クリックで切り替わる先
    ['theme-btn', 'land-theme-btn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.textContent = label;
    });
    if (typeof drawAllPHBoxes === 'function') drawAllPHBoxes();
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light'); // 初期ラベル統一
  $('theme-btn').addEventListener('click', toggleTheme);
  { const lb = $('land-theme-btn'); if (lb) lb.addEventListener('click', toggleTheme); }

  // ── Custom tooltip for ref-panel ─────────────────────────────────────────
  const tipEl = document.createElement('div');
  tipEl.id = 'ref-tooltip';
  tipEl.style.cssText = [
    'position:fixed', 'display:none', 'z-index:9999',
    'background:#111418', 'color:#dde1ea',
    'border:1px solid #3a404f', 'border-radius:5px',
    'font-size:11px', 'line-height:1.5',
    'padding:5px 8px', 'max-width:220px',
    'pointer-events:none', 'white-space:pre-wrap',
    'box-shadow:0 3px 10px #0008',
  ].join(';');
  document.body.appendChild(tipEl);

  function attachTooltip(container) {
    container.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (!el) { tipEl.style.display = 'none'; return; }
      tipEl.textContent = el.dataset.tip.replace(/\\n/g, '\n');
      tipEl.style.display = 'block';
    });
    container.addEventListener('mousemove', e => {
      if (tipEl.style.display !== 'block') return;
      const x = e.clientX + 14, y = e.clientY + 14;
      tipEl.style.left = Math.min(x, window.innerWidth  - tipEl.offsetWidth  - 8) + 'px';
      tipEl.style.top  = Math.min(y, window.innerHeight - tipEl.offsetHeight - 8) + 'px';
    });
    container.addEventListener('mouseleave', () => {
      tipEl.style.display = 'none';
    });
  }
  attachTooltip($('ref-panel'));
  attachTooltip($('right-panel'));

  // ── Ref-panel: save cursor before focus is stolen ────────────────────────
  $('ref-panel').addEventListener('mousedown', () => {
    const ed = $('ce-' + activeEditorN);
    if (ed) savedSel = { n: activeEditorN, start: ed.selectionStart, end: ed.selectionEnd };
  });

  // ── Ref-panel click-to-insert ─────────────────────────────────────────────
  $('ref-panel').addEventListener('click', e => {
    const span = e.target.closest('[data-insert]');
    if (span) {
      const text = span.dataset.insert;
      if (text === 'かつ' || text === 'または') {
        insertSmartOp(text, false);
      } else if (text === 'でない') {
        insertSmartOp(text, true);
      } else {
        insertAtCursor(text);
      }
      return;
    }
    const row = e.target.closest('[data-shortcut]');
    if (row) { insertAtCursor(SHORTCUTS[row.dataset.shortcut] || ''); }
  });

  // ── Undo / Redo buttons ───────────────────────────────────────────────────
  $('undo-btn')?.addEventListener('click', undo);
  $('redo-btn')?.addEventListener('click', redo);
  updateUndoRedoBtns();

  $('code-reset-btn')?.addEventListener('click', () => {
    if (!currentProblem) return;
    const n = currentProblem.activeSection;
    const ed = $('ce-' + n);
    pushHistory();
    ed.value = '｜　';
    autoResize(ed);
    updateGutter(n);
    drawAllPHBoxes();
    ed.focus();
  });

  // ── Game buttons ──────────────────────────────────────────────────────────
  $('start-btn').addEventListener('click', startGame);
  $('next-btn').addEventListener('click', nextStep);
  $('back-btn').addEventListener('click', () => {
    gs.reset();
    if (isProblemMode()) goBackToProblemList();
    else showView('setup');
  });
  $('retry-btn').addEventListener('click', retryGame);
  $('reset-btn').addEventListener('click', () => {
    if (isProblemMode()) {
      goBackToProblemList(); // already hides gameover overlay and resets gs
    } else {
      $('gameover-overlay').classList.add('hidden');
      gs.reset();
      showView('setup');
    }
  });

  // ── Main back button (replaces panel title) ───────────────────────────────
  $('main-back-btn').addEventListener('click', () => {
    if (isProblemMode()) goBackToProblemList();
    else showLanding();
  });

  // ── Problem view controls ──────────────────────────────────────────────────
  $('hint-btn').addEventListener('click', showHint);
  $('score-btn').addEventListener('click', scoreCode);
  $('problem-desc-toggle').addEventListener('click', () => {
    $('problem-desc-wrap').classList.toggle('collapsed');
  });
  $('prob-back-btn').addEventListener('click', () => goBackToProblemList());

  // ── Free mode save/load/export ─────────────────────────────────────────────
  $('save-btn').addEventListener('click', saveCode);
  $('load-btn').addEventListener('click', loadCode);
  $('export-btn').addEventListener('click', exportCode);

  // ── Landing page buttons ──────────────────────────────────────────────────
  $('land-basic-btn').addEventListener('click', () => showProblemList('basic'));
  $('land-strategy-btn').addEventListener('click', () => showProblemList('strategy'));
  $('land-sort-btn')?.addEventListener('click', () => showProblemList('sort'));
  $('land-free-btn').addEventListener('click', () => {
    hideLanding();
    currentMode = 'free';
    currentProblem = null;
    unlockAllSections();          // 問題モードから来た場合のロックを解除
    $('free-toolbar').style.display = 'flex';
    $('prob-back-btn').classList.add('hidden');
    $('top-mode-title').textContent = 'フリーモード';
    $('hint-area-left')?.classList.add('hidden');
    $('problem-info')?.classList.add('hidden');
    updateMainBackBtn();
    showView('setup');
  });
  $('clear-marks-btn').addEventListener('click', clearAllCompleted);
  $('land-save-btn').addEventListener('click', saveCode);
  $('land-load-btn').addEventListener('click', loadCode);
  $('land-export-btn').addEventListener('click', exportCode);
  $('problist-back-btn').addEventListener('click', showLanding);

  // Load problems async
  loadProblems();

  // Display pane
  initDisplayPane();
}

// ─── Loop selector: localStorage helpers ─────────────────────────────────────
function getLoopSeen(problemId) {
  try {
    const raw = localStorage.getItem(LOOP_SEEN_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj[problemId] || [];
  } catch { return []; }
}

function markLoopSeen(problemId, type) {
  try {
    const raw = localStorage.getItem(LOOP_SEEN_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj[problemId]) obj[problemId] = [];
    if (!obj[problemId].includes(type)) obj[problemId].push(type);
    localStorage.setItem(LOOP_SEEN_KEY, JSON.stringify(obj));
  } catch {}
}

// ─── Loop selector: UI builders ───────────────────────────────────────────────
function buildLoopSelector() {
  const el = document.createElement('div');
  el.id = 'loop-type-selector';
  el.className = 'loop-type-selector';

  const label = document.createElement('div');
  label.className = 'loop-type-label';
  label.textContent = 'ループの書き方:';
  el.appendChild(label);

  const tabsRow = document.createElement('div');
  tabsRow.className = 'loop-tabs';

  LOOP_TYPE_KEYS.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'loop-tab' + (key === selectedLoopType ? ' active' : '');
    btn.dataset.loopType = key;

    btn.appendChild(document.createTextNode(LOOP_TYPE_LABELS[key]));
    const badge = document.createElement('span');
    badge.className = 'loop-seen-badge';
    badge.textContent = ' ✓';
    badge.style.display = 'none';
    btn.appendChild(badge);

    btn.addEventListener('click', () => selectLoopType(key));
    tabsRow.appendChild(btn);
  });

  el.appendChild(tabsRow);

  const encourage = document.createElement('div');
  encourage.className = 'loop-encourage';
  el.appendChild(encourage);

  return el;
}

function updateLoopTabs() {
  if (!currentProblem || !currentProblem.loopHints) return;
  const selector = $('loop-type-selector');
  if (!selector) return;

  const seen = getLoopSeen(currentProblem.id);

  selector.querySelectorAll('.loop-tab').forEach(btn => {
    const key = btn.dataset.loopType;
    btn.classList.toggle('active', key === selectedLoopType);
    const badge = btn.querySelector('.loop-seen-badge');
    if (badge) badge.style.display = seen.includes(key) ? '' : 'none';
  });

  const enc = selector.querySelector('.loop-encourage');
  if (enc) {
    const unseen = LOOP_TYPE_KEYS.filter(t => !seen.includes(t));
    if (seen.length === 0) {
      enc.textContent = '';
    } else if (unseen.length === 0) {
      enc.textContent = '✨ 3種類すべて試しました！';
    } else {
      enc.textContent = `💡 「${unseen.map(t => LOOP_TYPE_LABELS[t]).join('・')}」もぜひ試してみよう！`;
    }
  }
}

function insertLoopSelector() {
  if (!$('loop-type-selector')) {
    const sel = buildLoopSelector();
    const hintBtn = $('hint-btn');
    hintBtn.parentNode.insertBefore(sel, hintBtn);
  }
  updateLoopTabs();
}

function removeLoopSelector() {
  const sel = $('loop-type-selector');
  if (sel) sel.remove();
}

function selectLoopType(type) {
  selectedLoopType = type;
  if (currentProblem) markLoopSeen(currentProblem.id, type);
  updateLoopTabs();

  // Re-render already-revealed hints for this type
  const list = $('hint-list');
  list.innerHTML = '';
  if (currentProblem && currentProblem.loopHints) {
    const hints = currentProblem.loopHints[type] || [];
    const count = loopHintCounts[type];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'hint-item';
      el.textContent = `ヒント${i + 1}: ${hints[i]}`;
      list.appendChild(el);
    }
  }
  updateHintBtn();
}

// ─── Completion tracking ─────────────────────────────────────────────────────
const COMPLETION_KEY = 'daifugo_completed';

function getCompleted() {
  try { return JSON.parse(localStorage.getItem(COMPLETION_KEY) || '{}'); }
  catch { return {}; }
}
function markCompleted(problemId) {
  const d = getCompleted(); d[problemId] = true;
  localStorage.setItem(COMPLETION_KEY, JSON.stringify(d));
}
function isCompleted(problemId) { return !!getCompleted()[problemId]; }
function clearAllCompleted() {
  if (!confirm('クリア記録をすべてリセットしますか？')) return;
  localStorage.removeItem(COMPLETION_KEY);
  if (!$('problist-overlay').classList.contains('hidden')) buildProblemList(currentListCategory);
}

// ─── Landing & Problem list ───────────────────────────────────────────────────
let currentListCategory = 'basic';

const BASIC_GROUPS = [
  { label: '値アクセス・表示', ids: ['b01', 'b02', 'b03'] },
  { label: '式と変数',          ids: ['b04', 'b06', 'b05'] },
  { label: '算術演算',         ids: ['b07', 'b08', 'b09'] },
  { label: '条件分岐',         ids: ['b10', 'b11', 'b12'] },
  { label: '論理演算',         ids: ['b13', 'b14', 'b15'] },
  { label: '繰り返し',         ids: ['b16', 'b17', 'b18', 'b27', 'b19', 'b20'] },
  { label: '配列',             ids: ['b21', 'b22', 'b23'] },
  { label: '関数',             ids: ['b24', 'b25', 'b26'] },
];
const STRATEGY_GROUPS = [
  { label: '基本の判断',    ids: ['p01', 'p02', 'p03'] },
  { label: '場に出す',      ids: ['p04', 'p05', 'p06'] },
  { label: '捨て札を読む',  ids: ['p07', 'p08', 'p09', 'p10'] },
  { label: '数える・推定',  ids: ['p11', 'p12', 'p13'] },
];
const SORT_GROUPS = [
  { label: '基本の3つ（交換で並べ替える）', ids: ['s01', 's02', 's03'] },
  { label: '発展の3つ（分割・併合・ヒープ）', ids: ['s04', 's05', 's06'] },
];
const CATEGORY_LABELS = { basic: '基礎問題', strategy: '戦略問題', sort: 'ソート問題' };

function showLanding() {
  $('landing-overlay').classList.remove('hidden');
  $('problist-overlay').classList.add('hidden');
}
function hideLanding() { $('landing-overlay').classList.add('hidden'); }

function showProblemList(category) {
  currentListCategory = category;
  hideLanding();
  $('problist-overlay').classList.remove('hidden');
  $('problist-title').textContent = CATEGORY_LABELS[category] || category;
  buildProblemList(category);
}

function buildProblemList(category) {
  const grid = $('problist-grid');
  grid.innerHTML = '';
  grid.classList.toggle('basic', category === 'basic');
  const groups   = category === 'basic' ? BASIC_GROUPS
                 : category === 'sort'  ? SORT_GROUPS
                 : STRATEGY_GROUPS;
  const completed = getCompleted();
  const probMap  = {};
  problemList.forEach(p => { probMap[p.id] = p; });

  let globalNum = 1;
  groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'problist-group';

    const hdr = document.createElement('div');
    hdr.className = 'problist-group-header';
    hdr.textContent = group.label;
    groupEl.appendChild(hdr);

    group.ids.forEach(id => {
      const p = probMap[id];
      if (!p) return;
      const item = document.createElement('div');
      item.className = 'problist-item';

      const num = document.createElement('span');
      num.className = 'problist-item-num';
      num.textContent = String(globalNum++).padStart(2, '0');

      const body = document.createElement('div');
      body.className = 'problist-item-body';

      const daifugo = document.createElement('span');
      daifugo.className = 'problist-item-daifugo';
      daifugo.textContent = p.daifugoTitle || p.title;

      const prog = document.createElement('span');
      prog.className = 'problist-item-prog';
      prog.textContent = p.title;

      body.appendChild(daifugo);
      body.appendChild(prog);

      const diff = document.createElement('span');
      diff.className = 'problist-item-diff';
      diff.textContent = '★'.repeat(p.difficulty);

      const check = document.createElement('span');
      check.className = 'problist-item-check';
      check.textContent = completed[id] ? '○' : '';
      num.appendChild(check);

      item.appendChild(num);
      item.appendChild(body);
      item.appendChild(diff);
      item.addEventListener('click', () => openProblemFromList(p));
      groupEl.appendChild(item);
    });

    grid.appendChild(groupEl);
  });
}

function openProblemFromList(problem) {
  $('problist-overlay').classList.add('hidden');
  const cat = problem.category;
  // Set mode without triggering showProblemList
  currentMode = cat;
  $('free-toolbar').style.display = 'none';
  $('prob-back-btn').classList.remove('hidden');
  $('top-mode-title').textContent = (CATEGORY_LABELS[cat] || cat) + 'モード';
  setSortEditorChrome(cat === 'sort');
  updateMainBackBtn();
  populateProblemSelect(cat);
  // Load the problem
  hintCount = 0;
  selectedLoopType = 'for';
  loopHintCounts = { for: 0, while: 0, doWhile: 0 };
  const idx = problemList.indexOf(problem);
  $('problem-select').value = idx;
  onProblemSelect(idx);
  // Show the problem editor view
  showView('problem');
}

function goBackToProblemList() {
  gs.reset();
  $('gameover-overlay').classList.add('hidden');
  unlockAllSections();   // 問題モード離脱時にロックを解除しておく
  restoreRefPanel();
  filterRefPanel(null);
  showProblemList(currentListCategory);
}

// ─── Problem Mode ─────────────────────────────────────────────────────────────
let currentMode    = 'free';   // 'free' | 'basic' | 'strategy'
let problemList    = [];       // all problems from JSON
let currentProblem = null;
let hintCount      = 0;

// ─── Scoring viewer state ─────────────────────────────────────────────────────
let scoringCases        = [];   // [{label, state, expected}]
let scoringCaseIdx      = 0;
let scoringCode         = '';   // fullCode string for re-runs
let pendingModalCb      = null; // callback after display-modal OK

function isProblemMode() { return currentMode === 'basic' || currentMode === 'strategy' || currentMode === 'sort'; }

// ─── ソートモード: エディタの骨格ラベルを付け替え・不要セクションを隠す ────────
function setSortEditorChrome(on) {
  const sk0 = $('sk-line-0');
  if (!sk0) return;   // 旧HTMLキャッシュなど、idが無い場合は何もしない
  sk0.innerHTML = on
    ? '<span class="sk-tri">▼</span>手札を左から弱い順に並べ替える（ソート）'
    : '<span class="sk-tri">▼</span>もし 場の枚数 ＝ 0 ならば';
  ['sk-line-1', 'sk-line-2', 'sk-line-else', 'cb-1', 'cb-2'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = on ? 'none' : '';
  });
}

// ─── Reference panel filtering (strategy mode) ───────────────────────────────
// activeRefs: array of shortcut keys to highlight, or null to reset all
function filterRefPanel(activeRefs) {
  document.querySelectorAll('#ref-panel tr[data-shortcut]').forEach(row => {
    const key = row.dataset.shortcut;
    if (!activeRefs || activeRefs.includes(key)) {
      row.classList.remove('ref-dimmed');
    } else {
      row.classList.add('ref-dimmed');
    }
  });
}

// ─── Basic mode ref panel ────────────────────────────────────────────────────
const ALL_OPS = [
  { key: '<-',    insert: '<-',    sym: '←',     label: '代入（＜ー か ZH と入力すると ← に変換）' },
  { key: '＝',    insert: '＝',    sym: '＝',     label: '等しい' },
  { key: '≠',    insert: '≠',    sym: '≠',     label: '等しくない' },
  { key: '＞',    insert: '＞',    sym: '＞',     label: 'より大きい' },
  { key: '≧',    insert: '≧',    sym: '≧',     label: '以上' },
  { key: '＜',    insert: '＜',    sym: '＜',     label: 'より小さい' },
  { key: '≦',    insert: '≦',    sym: '≦',     label: '以下' },
  { key: '＋',    insert: '＋',    sym: '＋',     label: '足す' },
  { key: '－',    insert: '－',    sym: '－',     label: '引く' },
  { key: '×',    insert: '×',    sym: '×',     label: 'かける' },
  { key: '÷',    insert: '÷',    sym: '÷',     label: '割る' },
  { key: '％',    insert: '％',    sym: '％',     label: '余り' },
  { key: 'かつ',  insert: 'かつ',  sym: 'かつ',   label: 'AND' },
  { key: 'または', insert: 'または', sym: 'または', label: 'OR' },
  { key: 'でない', insert: 'でない', sym: 'でない', label: 'NOT（後置）' },
];

function buildBasicRefPanel(activeRefs, activeOps, tipOverrides) {
  const basic    = $('ref-basic');
  const standard = $('ref-standard');
  if (!basic || !standard) return;
  standard.classList.add('hidden');
  basic.classList.remove('hidden');

  // activeOps が指定されていれば絞り込み、なければ全表示
  const ops = Array.isArray(activeOps)
    ? ALL_OPS.filter(op => activeOps.includes(op.key))
    : ALL_OPS;

  const opsHtml = ops.length === 0 ? '' : `
    <div class="basic-ref-ops">
      <div class="basic-ref-ops-title">演算子</div>
      <div class="basic-ref-ops-grid">
        ${ops.map(op =>
          `<span data-insert="${op.insert}">${op.sym}</span><span class="bro-label">${op.label}</span>`
        ).join('\n        ')}
      </div>
    </div>`;

  // 既出キー管理（初出 = 展開、２度目以降 = 折りたたみ）
  const SEEN_REFS_KEY = 'daifugo_seen_refs';
  const seenRefs = new Set(JSON.parse(localStorage.getItem(SEEN_REFS_KEY) || '[]'));

  const itemsHtml = (activeRefs || []).map(key => {
    const info = BASIC_REF_DATA[key];
    if (!info) return '';
    const isNew     = !seenRefs.has(key);
    const collapsed = isNew ? '' : ' collapsed';
    const label = info.label;
    const tip   = ((tipOverrides && tipOverrides[key]) || info.tip)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<div class="basic-ref-item${collapsed}" data-shortcut="${key}">
      <div class="basic-ref-header"><button class="bri-tri" title="折りたたむ / 展開する">▼</button>${label}</div>
      <div class="basic-ref-desc">${tip}</div>
    </div>`;
  }).join('');

  // 今回表示したキーをすべて既出に登録
  (activeRefs || []).forEach(k => seenRefs.add(k));
  localStorage.setItem(SEEN_REFS_KEY, JSON.stringify([...seenRefs]));

  const varHeader = itemsHtml ? '<div class="basic-ref-section-title">変数一覧</div>' : '';
  basic.innerHTML = varHeader + itemsHtml + opsHtml;

  // トグルボタンのクリックで折りたたみ切替
  basic.querySelectorAll('.bri-tri').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.basic-ref-item').classList.toggle('collapsed');
    });
  });
}

function restoreRefPanel() {
  const basic    = $('ref-basic');
  const standard = $('ref-standard');
  if (basic)    basic.classList.add('hidden');
  if (standard) standard.classList.remove('hidden');
}

function updateMainBackBtn() {
  const btn = $('main-back-btn');
  if (!btn) return;
  btn.textContent = isProblemMode() ? '← 問題一覧に戻る' : '← 入り口に戻る';
}

async function loadProblems() {
  try {
    const resp = await fetch('./problems.json?bust=' + Date.now());
    const data = await resp.json();
    problemList = data.problems;
  } catch(e) {
    console.warn('problems.json 読み込みエラー:', e);
  }
}

function populateProblemSelect(category) {
  const sel = $('problem-select');
  sel.innerHTML = '<option value="">-- 問題を選んでください --</option>';
  problemList.forEach((p, i) => {
    if (p.category !== category) return;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.difficulty} ${p.title}（${p.subtitle}）`;
    sel.appendChild(opt);
  });
}

function switchMode(mode) {
  currentMode = mode;
  $('free-toolbar').style.display = mode === 'free' ? 'flex' : 'none';
  $('prob-back-btn').classList.toggle('hidden', !isProblemMode());
  $('top-mode-title').textContent = mode === 'free' ? 'フリーモード'
                                  : (CATEGORY_LABELS[mode] || mode) + 'モード';
  setSortEditorChrome(mode === 'sort');
  updateMainBackBtn();

  if (isProblemMode()) {
    // Reset problem state
    currentProblem = null;
    hintCount = 0;
    selectedLoopType = 'for';
    loopHintCounts   = { for: 0, while: 0, doWhile: 0 };
    $('problem-info')?.classList.add('hidden');
    $('hint-list') && ($('hint-list').innerHTML = '');
    $('score-results') && ($('score-results').innerHTML = '');
    $('score-btn') && $('score-btn').classList.remove('hidden');
    $('score-label') && $('score-label').classList.add('hidden');
    $('hint-area-left') && $('hint-area-left').classList.add('hidden');
    removeLoopSelector();
    unlockAllSections();
    // Show problem list overlay (not problem view directly)
    showProblemList(mode);
  } else {
    // free mode: unlock all, reset problem selection, go to setup
    currentProblem = null;
    hintCount = 0;
    selectedLoopType = 'for';
    loopHintCounts   = { for: 0, while: 0, doWhile: 0 };
    $('problem-info')?.classList.add('hidden');
    $('hint-list') && ($('hint-list').innerHTML = '');
    $('score-results') && ($('score-results').innerHTML = '');
    $('score-btn') && $('score-btn').classList.remove('hidden');
    $('score-label') && $('score-label').classList.add('hidden');
    $('hint-area-left') && $('hint-area-left').classList.add('hidden');
    removeLoopSelector();
    unlockAllSections();
    // Hide overlays and show setup
    $('landing-overlay').classList.add('hidden');
    $('problist-overlay').classList.add('hidden');
    showView('setup');
  }
}

function onProblemSelect(idx) {
  clearDisplayPane();   // 問題切り替え時に表示画面をリセット
  if (idx === '' || idx === null) {
    currentProblem = null;
    unlockAllSections();
    $('problem-info').classList.add('hidden');
    removeLoopSelector();
    return;
  }
  currentProblem = problemList[parseInt(idx)];
  hintCount = 0;
  selectedLoopType = 'for';
  loopHintCounts   = { for: 0, while: 0, doWhile: 0 };

  // ── Reset all editors ────────────────────────────────────────────────────
  pushHistory();
  [0, 1, 2].forEach(n => {
    const ed = $('ce-' + n);
    // ソート問題はトップレベルから書くため、先頭のインデント記号を入れない
    ed.value = currentProblem.category === 'sort' ? '' : '｜　';
    autoResize(ed);
    updateGutter(n);
  });
  // drawAllPHBoxes は lockSections の後で呼ぶ（先に呼ぶとロック前のゴーストが残る）
  $('error-msg').textContent = '';

  // ── Show info panel ───────────────────────────────────────────────────────
  $('problem-info').classList.remove('hidden');
  $('problem-desc-wrap').classList.remove('collapsed');

  // Show task description (HTML if tags present, otherwise plain text)
  const descSrc = currentProblem.descriptionHtml || currentProblem.description || '';
  if (descSrc.includes('<')) {
    $('problem-desc').classList.add('html-desc');
    $('problem-desc').innerHTML = descSrc;
  } else {
    $('problem-desc').classList.remove('html-desc');
    $('problem-desc').textContent = descSrc;
  }

  // ── Build test case visuals ───────────────────────────────────────────────
  buildProbCases();

  // ── Reset hints & score ───────────────────────────────────────────────────
  $('hint-list').innerHTML = '';
  $('score-results').innerHTML = '';
  $('score-btn').classList.remove('hidden');
  $('score-label').classList.add('hidden');
  $('prob-cases').classList.remove('hidden');
  // Show ヒントを見る in left sidebar only for problem mode
  $('hint-area-left').classList.remove('hidden');
  // Show loop selector for loop problems, remove for others
  if (currentProblem.loopHints) {
    insertLoopSelector();
  } else {
    removeLoopSelector();
  }
  updateHintBtn();

  // ── Lock non-active sections ──────────────────────────────────────────────
  lockSections(currentProblem.activeSection);
  drawAllPHBoxes();   // lockSections 後に描画 → ロック済みセクションにゴーストが出ない

  // ── Filter / rebuild reference panel for this problem ────────────────────
  if (currentMode === 'basic' || currentMode === 'sort') {
    // ソート問題も basic 型パネル: その問題で使うものだけを表示（refTips で説明文を上書き）
    buildBasicRefPanel(currentProblem.activeRefs || [], currentProblem.activeOps ?? null,
                       currentProblem.refTips ?? null);
  } else {
    filterRefPanel(currentProblem.activeRefs || null);
  }
}

function lockSections(activeN) {
  if (activeN == null) activeN = 0;  // fallback: undefined/null → section 0
  [0, 1, 2].forEach(n => {
    const editor  = $('ce-' + n);
    const block   = editor.closest('.case-block');
    const skLine  = block ? block.previousElementSibling : null;
    if (n !== activeN) {
      // Replace placeholder with a valid no-op so PH_RE() doesn't force-pass
      // （＜＞ プレースホルダー、または緑コメントの初期プレースホルダーのとき）
      if (PH_RE().test(editor.value) || editor.value === '｜　') {
        editor.value = '｜　パスする';
        autoResize(editor);
        updateGutter(n);
      }
      editor.classList.add('locked');
      editor.readOnly = true;
      if (block)  block.classList.add('locked-section');
      if (skLine) skLine.classList.add('locked-section');
    } else {
      editor.classList.remove('locked');
      editor.readOnly = false;
      if (block)  block.classList.remove('locked-section');
      if (skLine) skLine.classList.remove('locked-section');
    }
  });
  activeEditorN = activeN;   // アクティブエディターを正しく追跡
}

function unlockAllSections() {
  [0, 1, 2].forEach(n => {
    const editor = $('ce-' + n);
    editor.classList.remove('locked');
    editor.readOnly = false;
    // ロック時に自動挿入された ｜　パスする を初期プレースホルダーに戻す
    if (editor.value === '｜　パスする') {
      editor.value = '｜　';
      autoResize(editor);
      updateGutter(n);
    }
    const block  = editor.closest('.case-block');
    const skLine = block ? block.previousElementSibling : null;
    if (block)  block.classList.remove('locked-section');
    if (skLine) skLine.classList.remove('locked-section');
  });
  drawAllPHBoxes();
  restoreRefPanel();    // ensure standard panel is visible (hides basic panel)
  filterRefPanel(null); // undim all rows in standard panel
}

function updateHintBtn() {
  const btn = $('hint-btn');
  if (!currentProblem) { btn.textContent = '💡 ヒントを見る'; btn.disabled = false; return; }

  let total, count;
  if (currentProblem.loopHints) {
    const hints = currentProblem.loopHints[selectedLoopType] || [];
    total = hints.length;
    count = loopHintCounts[selectedLoopType];
  } else {
    total = currentProblem.hints.length;
    count = hintCount;
  }

  if (count >= total && total > 0) {
    btn.textContent = `💡 ヒントを閉じる (${total}/${total})`;
    btn.disabled = false;
  } else {
    btn.textContent = `💡 ヒントを見る (${count}/${total})`;
    btn.disabled = false;
  }
}

function showHint() {
  if (!currentProblem) return;

  if (currentProblem.loopHints) {
    const type  = selectedLoopType;
    const hints = currentProblem.loopHints[type] || [];
    if (loopHintCounts[type] >= hints.length) {   // 全表示後にもう一度押したら閉じる
      loopHintCounts[type] = 0;
      $('hint-list').innerHTML = '';
      updateHintBtn();
      return;
    }
    const hint = hints[loopHintCounts[type]];
    loopHintCounts[type]++;
    markLoopSeen(currentProblem.id, type);
    updateLoopTabs();
    const el = document.createElement('div');
    el.className = 'hint-item';
    el.textContent = `ヒント${loopHintCounts[type]}: ${hint}`;
    $('hint-list').appendChild(el);
    updateHintBtn();
  } else {
    if (hintCount >= currentProblem.hints.length) {   // 全表示後にもう一度押したら閉じる
      hintCount = 0;
      $('hint-list').innerHTML = '';
      updateHintBtn();
      return;
    }
    const hint = currentProblem.hints[hintCount];
    hintCount++;
    const el = document.createElement('div');
    el.className = 'hint-item';
    el.textContent = `ヒント${hintCount}: ${hint}`;
    $('hint-list').appendChild(el);
    updateHintBtn();
  }
}

// ─── Prerequisite check ───────────────────────────────────────────────────────
function checkPrerequisite(code, problem) {
  // b11 など loopHints 問題はループ種別ごとに前提が変わる
  let prereq = problem.prerequisite;
  if (problem.loopPrerequisite && selectedLoopType) {
    prereq = problem.loopPrerequisite[selectedLoopType] || prereq;
  }
  if (!prereq) return null;

  const { require: required, notRequire, message } = prereq;
  if (required) {
    for (const pat of required) {
      if (!code.includes(pat)) return message;
    }
  }
  if (notRequire) {
    for (const pat of notRequire) {
      if (code.includes(pat)) return message;
    }
  }
  return null; // OK
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
function scoreCode() {
  if (!currentProblem) return;
  const n = currentProblem.activeSection;
  const code = $('ce-' + n).value;

  if (PH_RE().test(code)) {
    $('score-results').innerHTML = '<div class="score-error">⚠️ プレースホルダー（＜　＞）が残っています</div>';
    return;
  }
  if (!code.trim()) {
    $('score-results').innerHTML = '<div class="score-error">⚠️ コードが空です</div>';
    return;
  }

  // ── 前提条件チェック ──────────────────────────────────────────────────────
  const prereqMsg = checkPrerequisite(code, currentProblem);
  if (prereqMsg) {
    $('score-results').innerHTML = `
      <div class="sv-prereq-fail">
        <div class="sv-prereq-title">📋 この問題の書き方で解いてみよう</div>
        <div class="sv-prereq-msg">${prereqMsg}</div>
      </div>`;
    return;
  }

  // すべてのチェックを通過してから問題文を折りたたむ
  $('problem-desc-wrap')?.classList.add('collapsed');

  // Build test case list with normalised state
  //   ソート問題: コードはそのまま実行し、手札は「配られた順」を保つ
  //   （通常問題は手札を昇順に正規化する）
  const isSort = currentProblem.category === 'sort';
  if (isSort) {
    scoringCode = code;
  } else {
    const codes = ['', '', ''];
    codes[n] = code;
    scoringCode = buildFullCodeForScore(codes);
  }
  scoringCases = currentProblem.testCases.map(tc => ({
    label:    tc.label,
    expected: tc.expected,
    state: {
      fieldStrength:    tc.state.fieldStrength,
      fieldCount:       tc.state.fieldCount,
      playerHand:       isSort ? [...tc.state.playerHand]
                               : [...tc.state.playerHand].sort((a, b) => a - b),
      allDiscard:       tc.state.allDiscard || [],
      opponentHandSize: tc.state.opponentHandSize ?? 3,
    },
  }));

  // 採点ボタンを隠してラベルを表示、テストケース表示を隠す
  $('score-btn').classList.add('hidden');
  $('score-label').classList.remove('hidden');
  $('prob-cases').classList.add('hidden');
  clearDisplayPane();

  initScoringShell(scoringCases.length);
  setupScoringCase(0);
}

function buildFullCodeForScore(codes) {
  const parts = ['もし 場の枚数 ＝ 0 ならば'];
  if (codes[0]) parts.push(codes[0]);
  parts.push('を実行し，そうでなくもし 場の枚数 ＝ 1 ならば');
  if (codes[1]) parts.push(codes[1]);
  parts.push('を実行し，そうでなくもし 場の枚数 ＝ 2 ならば');
  if (codes[2]) parts.push(codes[2]);
  parts.push('を実行し，そうでなければ', '｜　パスする', 'を実行する');
  return parts.join('\n');
}

// テストプレイの validatePlayerPlay と同等のチェックを scoring 用に実装
function validateAgainstState(result, state) {
  if (!result || result.action !== 'play') return null;
  const { rank, count } = result;
  if (!Number.isFinite(rank) || rank < MIN_RANK || rank > MAX_RANK) {
    return `ランク${rank}は不正です`;
  }
  if (count !== 1 && count !== 2) {
    return `出す枚数は1か2でなければなりません（${count}）`;
  }
  const have = state.playerHand.filter(r => r === rank).length;
  if (have < count) {
    return `手札にランク${RANK_NAMES[rank]}が${count}枚ありません（${have}枚）`;
  }
  if (state.fieldCount !== 0) {
    if (count !== state.fieldCount) return `場の枚数(${state.fieldCount})と一致しません（${count}）`;
    if (rank <= state.fieldStrength) return `ランク${RANK_NAMES[rank]}は場のランク${RANK_NAMES[state.fieldStrength]}より強くなければなりません`;
  }
  return null;
}

function buildProbCases() {
  const el = $('prob-cases');
  el.innerHTML = '';
  if (!currentProblem || !currentProblem.testCases) return;

  currentProblem.testCases.forEach((tc, i) => {
    const st  = tc.state;
    const row = document.createElement('div');
    row.className = 'prob-case-row';

    // ─ 場 ─
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'prob-case-col';
    const fieldLabel = document.createElement('span');
    fieldLabel.className = 'prob-case-label';
    fieldLabel.textContent = '場';
    fieldDiv.appendChild(fieldLabel);
    if (st.fieldCount === 0) {
      const emp = document.createElement('span');
      emp.className = 'prob-case-empty';
      emp.textContent = '空き';
      fieldDiv.appendChild(emp);
    } else {
      for (let j = 0; j < st.fieldCount; j++) {
        fieldDiv.appendChild(makeCard(st.fieldStrength, ['field', 'mini']));
      }
    }

    // ─ 手札 ─
    const handDiv = document.createElement('div');
    handDiv.className = 'prob-case-col';
    const handLabel = document.createElement('span');
    handLabel.className = 'prob-case-label';
    handLabel.textContent = '手札';
    handDiv.appendChild(handLabel);
    st.playerHand.forEach(rank => handDiv.appendChild(makeCard(rank, ['mini'])));

    // ─ 捨て札（あるときだけ表示）─
    const discCards = st.allDiscard || [];
    let discDiv = null;
    if (discCards.length > 0) {
      discDiv = document.createElement('div');
      discDiv.className = 'prob-case-col';
      const discLabel = document.createElement('span');
      discLabel.className = 'prob-case-label';
      discLabel.textContent = '捨札';
      discDiv.appendChild(discLabel);
      discCards.forEach(rank => discDiv.appendChild(makeCard(rank, ['mini', 'discard'])));
    }

    // ─ 正解 ─
    const expDiv = document.createElement('div');
    expDiv.className = 'prob-case-expected';
    const expStr = tc.expected.action === 'sort'
      ? `弱い順に並べ替える: ${handToStr(tc.expected.final)}`
      : tc.expected.display !== undefined
      ? `表示: "${tc.expected.display}"`
      : actionToStr(tc.expected);
    expDiv.innerHTML = `<span class="prob-case-arrow">→</span><span class="prob-case-ans">${expStr}</span>`;

    row.appendChild(fieldDiv);
    row.appendChild(handDiv);
    if (discDiv) row.appendChild(discDiv);
    row.appendChild(expDiv);
    el.appendChild(row);
  });
}

function checkExpected(result, expected) {
  if (expected.action === 'sort') return sortMismatch(result, expected) === null;
  if (expected.display !== undefined) {
    const msgs = result.displayMessages || [];
    const found = msgs.some(msg => msg.includes(expected.display));
    if (!found) return false;
  }
  if (expected.action === 'pass') return result.action === 'pass';
  return result.action === 'play' &&
         result.rank  === expected.rank &&
         result.count === expected.count;
}

// ソート問題の照合。合格なら null、不合格なら理由の文字列を返す
function sortMismatch(result, expected) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const trace = result.trace || [];
  if (!eq(result.finalHand, expected.final)) {
    return `最終的な並びが違います（あなた: ${handToStr(result.finalHand)}）`;
  }
  if (trace.length === 0) {
    return '記録する() が一度も呼ばれていません。問題文の【記録のルール】の場所に書きましょう';
  }
  if (trace.length !== expected.trace.length) {
    return `記録する() の回数が違います（あなた: ${trace.length}回／正解: ${expected.trace.length}回）。呼ぶ場所を確認しましょう`;
  }
  for (let k = 0; k < trace.length; k++) {
    if (!eq(trace[k], expected.trace[k])) {
      return `${k + 1}回目の記録が違います（あなた: ${handToStr(trace[k])}／正解: ${handToStr(expected.trace[k])}）。このアルゴリズムの手順どおりか確認しましょう`;
    }
  }
  return null;
}

function handToStr(hand) {
  if (!Array.isArray(hand)) return '—';
  return hand.map(r => RANK_NAMES[r] || r).join(' ');
}

function actionToStr(action) {
  if (!action || action.action === 'pass') return 'パス';
  return `${RANK_NAMES[action.rank] || action.rank} を ${action.count}枚出す`;
}

// ─── Scoring viewer: interactive one-case-at-a-time ─────────────────────────

function initScoringShell(total) {
  $('score-results').innerHTML = `
    <div id="sv-wrap">
      <div class="sv-section sv-field-section">
        <div class="sv-section-hdr">場の状態</div>
        <div class="sv-cards" id="sv-field"></div>
        <div class="sv-field-info" id="sv-field-info"></div>
        <hr class="sv-field-divider">
        <div class="sv-section-hdr">手札</div>
        <div class="sv-cards" id="sv-hand"></div>
      </div>
      <div class="sv-actions">
        <div class="sv-action-row">
          <span class="sv-action-label" id="sv-expected-label">正解</span>
          <span class="sv-action-val expected" id="sv-expected-val"></span>
        </div>
        <div class="sv-action-row">
          <span class="sv-action-label" id="sv-got-label">あなたのコード</span>
          <span class="sv-action-val" id="sv-got-val">—</span>
          <span class="sv-badge-large" id="sv-badge"></span>
        </div>
      </div>
      <div class="sv-action-row" id="sv-start-row">
        <button id="sv-start-btn" class="primary-btn sv-start-btn">採点</button>
        <button id="sv-abort-btn" class="sv-abort-btn">□ 中止</button>
      </div>
      <div class="sv-action-row hidden" id="sv-next-row">
        <button id="sv-next-btn" class="primary-btn sv-start-btn">次へ</button>
        <button id="sv-next-abort-btn" class="sv-abort-btn">□ 中止</button>
      </div>
      <div id="sv-fail-msg" class="sv-fail-msg hidden">修正して「採点する」をもう一度押してください</div>
    </div>
    <div class="sv-final hidden" id="sv-final"></div>
  `;
  // モーダル OK ハンドラ（重複登録防止のため clone）
  const okBtn = $('display-modal-ok');
  const newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  $('display-modal-ok').addEventListener('click', () => {
    $('display-modal').classList.add('hidden');
    if (pendingModalCb) { const cb = pendingModalCb; pendingModalCb = null; cb(); }
  });

  const abortHandler = () => {
    $('score-results').innerHTML = '';
    $('score-btn').classList.remove('hidden');
    $('score-label').classList.add('hidden');
    $('prob-cases').classList.remove('hidden');
    $('problem-desc-wrap')?.classList.remove('collapsed');
  };
  $('sv-abort-btn').addEventListener('click', abortHandler);
  $('sv-next-abort-btn').addEventListener('click', abortHandler);
  $('sv-fail-msg').addEventListener('click', abortHandler);
}

function setupScoringCase(idx) {
  scoringCaseIdx = idx;
  const tc    = scoringCases[idx];
  const total = scoringCases.length;
  const st    = tc.state;

  $('sv-badge').textContent = '';

  // 正解・あなたのコード 行を初期化
  const isSort    = tc.expected.action === 'sort';
  const isDisplay = tc.expected.display !== undefined;
  $('sv-expected-label').textContent = isSort ? '正解の並び' : isDisplay ? '正解の表示' : '正解';
  $('sv-got-label').textContent      = isSort ? 'あなたの並び' : isDisplay ? 'あなたの表示' : 'あなたのコード';
  $('sv-expected-val').textContent   = isSort ? handToStr(tc.expected.final)
                                     : isDisplay ? tc.expected.display : actionToStr(tc.expected);
  const gotEl = $('sv-got-val');
  gotEl.textContent = '—';
  gotEl.className   = 'sv-action-val';

  // ── 場 ───────────────────────────────────────────────────────────────────
  const fieldEl = $('sv-field');
  fieldEl.innerHTML = '';
  if (st.fieldCount === 0) {
    const emp = document.createElement('span');
    emp.className = 'sv-empty';
    emp.textContent = '（空き場）';
    fieldEl.appendChild(emp);
    $('sv-field-info').textContent = '';
  } else {
    for (let i = 0; i < st.fieldCount; i++)
      fieldEl.appendChild(makeCard(st.fieldStrength, ['field']));
    $('sv-field-info').textContent =
      `ランク${RANK_NAMES[st.fieldStrength]}  ${st.fieldCount}枚`;
  }

  // ── 手札（まだ出す前 = ハイライトなし）────────────────────────────────
  const handEl = $('sv-hand');
  handEl.innerHTML = '';
  st.playerHand.forEach(rank => handEl.appendChild(makeCard(rank, [])));

  // ── ボタンリセット ────────────────────────────────────────────────────
  $('sv-next-row').classList.add('hidden');
  $('sv-fail-msg').classList.add('hidden');
  $('sv-wrap').classList.remove('hidden');
  $('sv-final').classList.add('hidden');

  $('sv-start-row').classList.remove('hidden');
  $('sv-next-row').classList.add('hidden');
  const startBtn = $('sv-start-btn');
  startBtn.textContent = `採点（${idx + 1}／${total}）`;
  startBtn.onclick = () => runScoringCase(idx);
}

function runScoringCase(idx) {
  $('sv-start-row').classList.add('hidden');

  const tc = scoringCases[idx];
  const st = tc.state;
  let result, displayMessages = [], error = null;

  // Run interpreter (半角・全角どちらの演算子も受け付けます)
  try {
    const interp = new DNCLInterpreter(st);
    result = interp.run(scoringCode);
    displayMessages = result ? (result.displayMessages || []) : [];
    if (result) {
      // ソート問題の判定用: 途中経過の記録と最終的な手札の並び
      result.trace     = interp.trace;
      result.finalHand = [...interp.vars['手札']];
    }
  } catch(e) {
    error = e.message;
    result = null;
  }

  const validateErr = result ? validateAgainstState(result, st) : null;
  const pass = !error && !validateErr && checkExpected(result, tc.expected);
  const r = { pass, got: result, expected: tc.expected, state: st,
               displayMessages, error: error || (validateErr ? `無効な手: ${validateErr}` : null) };

  // ケースが変わるたびにクリアして今回の出力だけ表示
  clearDisplayPane();
  if (displayMessages.length > 0) {
    appendDisplayPane(displayMessages);
  }

  // 表示画面パネルに出力済み → 直接採点結果へ
  showScoringResult(idx, r);
}

function showScoringResult(idx, r) {
  const total = scoringCases.length;
  $('sv-badge').textContent = r.pass ? '✅' : '❌';

  // ── 手札（出したカードをハイライト）──────────────────────────────────
  if (!r.expected.display && r.got && r.got.action === 'play') {
    const handEl = $('sv-hand');
    handEl.innerHTML = '';
    let left = r.got.count;
    r.state.playerHand.forEach(rank => {
      const isPlayed = rank === r.got.rank && left > 0;
      if (isPlayed) left--;
      handEl.appendChild(makeCard(rank, isPlayed ? ['played'] : []));
    });
  }

  // ── ソート問題: 並べ替え後の手札を描画し、結果欄を更新 ────────────────
  if (r.expected.action === 'sort') {
    if (r.got && Array.isArray(r.got.finalHand)) {
      const handEl = $('sv-hand');
      handEl.innerHTML = '';
      r.got.finalHand.forEach(rank => handEl.appendChild(makeCard(rank, [])));
    }
    const gotEl = $('sv-got-val');
    const reason = r.error ? `エラー: ${r.error}` : sortMismatch(r.got, r.expected);
    gotEl.textContent = reason === null
      ? `${handToStr(r.got.finalHand)}（記録 ${r.got.trace.length}回 すべて一致）`
      : reason;
    gotEl.className = `sv-action-val ${reason === null ? 'pass' : 'fail'}`;
  } else {
  // ── あなたのコード 欄を更新 ──────────────────────────────────────────
  const gotEl = $('sv-got-val');
  const hasDisplay = r.expected.display !== undefined;
  if (hasDisplay) {
    const actual      = (r.displayMessages || []).join('\n');
    const displayPass = actual.includes(r.expected.display);
    gotEl.textContent = actual || '（なし）';
    gotEl.className   = `sv-action-val ${displayPass ? 'pass' : 'fail'}`;
  } else {
    const gotStr = r.error ? `エラー: ${r.error}` : actionToStr(r.got);
    const actionPass = !r.error && (
      r.expected.action === 'pass'
        ? (r.got && r.got.action === 'pass')
        : (r.got && r.got.action === 'play' &&
           r.got.rank === r.expected.rank && r.got.count === r.expected.count)
    );
    gotEl.textContent = gotStr;
    gotEl.className   = `sv-action-val ${actionPass ? 'pass' : 'fail'}`;
  }
  }

  // ── 次の操作 ──────────────────────────────────────────────────────────
  if (r.pass) {
    if (idx === total - 1) {
      markCompleted(currentProblem.id);
      setTimeout(() => showScoringFinal(total), 500);
    } else {
      const nextBtn = $('sv-next-btn');
      $('sv-next-row').classList.remove('hidden');
      nextBtn.textContent = `次へ（${idx + 2}／${total}）`;
      nextBtn.onclick = () => setupScoringCase(idx + 1);
    }
  } else {
    $('sv-fail-msg').classList.remove('hidden');
  }
}

function showScoringFinal(total) {
  $('sv-wrap').classList.add('hidden');
  const finalEl = $('sv-final');
  finalEl.classList.remove('hidden');
  const tip = currentProblem ? (CLEAR_TIPS[currentProblem.id] || '') : '';
  finalEl.innerHTML = `
    <div class="score-summary all-pass">${total} / ${total} ケース通過</div>
    <div class="score-clear-banner">🎉 クリア！問題一覧に ○ が付きました</div>
    ${tip ? `<div class="score-clear-tip">💡 ${tip}</div>` : ''}
  `;
}

// ─── Default hand loader ──────────────────────────────────────────────────────
function loadDefaultHand(problem) {
  for (let r = MIN_RANK; r <= MAX_RANK; r++) slots[r] = ['empty', 'empty'];

  const fill = (cards, who) => {
    const counts = {};
    cards.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
    for (const [rStr, cnt] of Object.entries(counts)) {
      const r = parseInt(rStr);
      let filled = 0;
      for (let s = 0; s < 2 && filled < cnt; s++) {
        if (slots[r][s] === 'empty') { slots[r][s] = who; filled++; }
      }
    }
  };
  fill(problem.defaultHand.player,   'player');
  fill(problem.defaultHand.opponent, 'opponent');
  refreshSlotButtons();
  updateStartBtn();
}

// ─── Free mode: save / load / export ─────────────────────────────────────────
const SAVE_STORE_KEY = 'daifugo_saves_v2';
const LEGACY_SAVE_KEY = 'daifugo_save';

function readAllSaves() {
  try {
    const raw = localStorage.getItem(SAVE_STORE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    // 旧バージョン(単一スロット)を自動移行
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacy && !obj['(旧データ)']) {
      try {
        const ld = JSON.parse(legacy);
        obj['(旧データ)'] = { ce0: ld.ce0 || '', ce1: ld.ce1 || '', ce2: ld.ce2 || '', ts: ld.ts || Date.now() };
        writeAllSaves(obj);
      } catch(e) {}
    }
    return obj;
  } catch(e) { return {}; }
}

function writeAllSaves(obj) {
  try { localStorage.setItem(SAVE_STORE_KEY, JSON.stringify(obj)); }
  catch(e) { alert('保存に失敗しました: ' + e.message); }
}

function saveCode() {
  const stores = readAllSaves();
  const existingNames = Object.keys(stores);
  const defaultName = '戦略' + (existingNames.length + 1);
  const name = prompt(
    '保存名を入力してください\n' +
    (existingNames.length ? '（既存: ' + existingNames.join(', ') + '）\n同名で上書き可能。' : ''),
    defaultName
  );
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { alert('名前が空です'); return; }
  if (stores[trimmed]) {
    if (!confirm(`「${trimmed}」は既に存在します。上書きしますか？`)) return;
  }
  stores[trimmed] = {
    ce0: $('ce-0').value,
    ce1: $('ce-1').value,
    ce2: $('ce-2').value,
    ts:  Date.now(),
  };
  writeAllSaves(stores);
  const btn = $('save-btn');
  const orig = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

function loadCode() {
  const stores = readAllSaves();
  const names = Object.keys(stores);
  if (names.length === 0) { alert('保存データがありません'); return; }

  // 簡易リスト UI: prompt で番号選択
  const list = names
    .map((nm, i) => {
      const d = new Date(stores[nm].ts || 0);
      const ds = isNaN(d.getTime()) ? '' : ` (${d.toLocaleString()})`;
      return `${i + 1}. ${nm}${ds}`;
    })
    .join('\n');
  const ans = prompt('読み込むスロット番号を入力:\n\n' + list + '\n\n削除する場合は番号の前に "d" を付けて入力（例: d2）');
  if (ans === null) return;
  const trimmed = ans.trim();

  // 削除モード
  if (/^d\d+$/i.test(trimmed)) {
    const idx = parseInt(trimmed.slice(1)) - 1;
    const nm = names[idx];
    if (!nm) { alert('番号が範囲外です'); return; }
    if (!confirm(`「${nm}」を削除しますか？`)) return;
    delete stores[nm];
    writeAllSaves(stores);
    alert(`「${nm}」を削除しました`);
    return;
  }

  const idx = parseInt(trimmed) - 1;
  const name = names[idx];
  if (!name) { alert('番号が範囲外です'); return; }
  const data = stores[name];
  pushHistory();
  [0, 1, 2].forEach(n => {
    const ed = $('ce-' + n);
    ed.value = data['ce' + n] || '';
    autoResize(ed);
    updateGutter(n);
  });
  drawAllPHBoxes();
  scheduleForecast(200);
}

function exportCode() {
  const labels = ['# 場の枚数=0 のとき', '# 場の枚数=1 のとき', '# 場の枚数=2 のとき'];
  const text = [0, 1, 2].map(n => labels[n] + '\n' + $('ce-' + n).value).join('\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'strategy.txt'; a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', init);
