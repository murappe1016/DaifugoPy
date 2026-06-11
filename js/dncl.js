// DNCL Interpreter for Daifugo Strategy Debugger
'use strict';

class DNCLError extends Error {
  constructor(message, line = 0) {
    super(message);
    this.line = line;
    this.name = 'DNCLError';
  }
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

// ─── Variable naming convention helpers ──────────────────────────────────────
// Lowercase Latin start (a-z) → scalar variable
// Uppercase Latin start (A-Z) → array variable
function isLatinUpper(name) { return /^[A-Z]/.test(name); }
function isLatinLower(name) { return /^[a-z]/.test(name); }
// Built-in card constants that start with uppercase Latin but are scalars
const BUILTIN_SCALARS = new Set(['J','Q','K','A','Ｊ','Ｑ','Ｋ','Ａ']);

const KEYWORDS = new Set([
  'もし', 'ならば', 'を実行する', 'そうでなければ', 'そうでなくもし',
  'を繰り返す', '繰り返し',
  'を', 'から', 'まで', 'ずつ',
  '増やしながら', '減らしながら',
  '中断する', 'パスする', 'かつ', 'または', 'でない',
  'の間', 'になるまで',
  '関数', '返す', 'と定義する',
]);

function isWhitespaceChar(ch) {
  return ch === ' ' || ch === '\t' || ch === '　' || ch === '|' || ch === '｜' || ch === '\r';
}

function isDelimiterChar(ch) {
  // Includes both full-width and half-width operator characters
  return isWhitespaceChar(ch) || '＝≠＞≧＜≦＋－×÷／％()[]，,：#←<>=-+*/%!'.includes(ch);
}

// Tokenize a single expression string into tokens
// Returns array of {type, val}
function tokenizeExpr(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (isWhitespaceChar(ch)) { i++; continue; }
    if (ch === '#') break;

    // Assignment arrow: ← or <- (both accepted)
    if (ch === '←') { tokens.push({ type: 'ASSIGN', val: '←' }); i++; continue; }

    // Multi-char half-width operators (must check before single-char)
    if (ch === '<' && str[i+1] === '-') { tokens.push({ type: 'ASSIGN', val: '←' }); i += 2; continue; }
    if (ch === '<' && str[i+1] === '=') { tokens.push({ type: 'OP', val: '≦' }); i += 2; continue; }
    if (ch === '>' && str[i+1] === '=') { tokens.push({ type: 'OP', val: '≧' }); i += 2; continue; }
    if (ch === '!' && str[i+1] === '=') { tokens.push({ type: 'OP', val: '≠' }); i += 2; continue; }

    // Half-width single-char operators — map to full-width equivalents used internally
    // (DNCL spec: ÷ = integer division, / = real division — so '/' maps to '／', not '÷')
    const halfToFull = { '>': '＞', '<': '＜', '+': '＋', '-': '－', '*': '×', '/': '／', '%': '％', '=': '＝' };
    if (ch in halfToFull) { tokens.push({ type: 'OP', val: halfToFull[ch] }); i++; continue; }

    // Full-width single-char operators & punctuation
    const singleOps = {
      '＝': 'OP', '≠': 'OP', '＞': 'OP', '≧': 'OP', '＜': 'OP', '≦': 'OP',
      '＋': 'OP', '－': 'OP', '×': 'OP', '÷': 'OP', '／': 'OP', '％': 'OP',
      '(': 'LPAREN', ')': 'RPAREN', '[': 'LBRACKET', ']': 'RBRACKET',
      ',': 'COMMA', '，': 'COMMA', '：': 'COLON',
    };
    if (ch in singleOps) { tokens.push({ type: singleOps[ch], val: ch }); i++; continue; }

    // ASCII digits
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < str.length && /[0-9.]/.test(str[i])) num += str[i++];
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }

    // Full-width digits
    if (/[０-９]/.test(ch)) {
      let num = '';
      while (i < str.length && /[０-９]/.test(str[i])) {
        num += String.fromCharCode(str.charCodeAt(i) - 0xFF10 + 0x30);
        i++;
      }
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }

    // Word (keyword or identifier)
    let word = '';
    while (i < str.length && !isDelimiterChar(str[i])) word += str[i++];
    if (word) {
      tokens.push({ type: KEYWORDS.has(word) ? 'KW' : 'ID', val: word });
    }
  }
  return tokens;
}

// ─── Expression Parser ────────────────────────────────────────────────────────

class TokenStream {
  constructor(tokens) {
    this.tokens = tokens;
    this.idx = 0;
  }
  peek() { return this.idx < this.tokens.length ? this.tokens[this.idx] : null; }
  peekVal() { const t = this.peek(); return t ? t.val : null; }
  consume() { return this.tokens[this.idx++]; }
  done() { return this.idx >= this.tokens.length; }
}

function parseExprStr(str, lineNum) {
  const tokens = tokenizeExpr(str);
  const ts = new TokenStream(tokens);
  const expr = parseLogicExpr(ts, lineNum);
  return expr;
}

// left-to-right logical: かつ、または (equal priority) and でない (postfix NOT)
function parseLogicExpr(ts, lineNum) {
  let left = parseCmpExpr(ts, lineNum);
  while (!ts.done()) {
    const v = ts.peekVal();
    if (v === 'でない') {
      ts.consume();
      left = { t: 'not', expr: left };
    } else if (v === 'かつ') {
      ts.consume();
      const right = parseCmpExpr(ts, lineNum);
      left = { t: 'and', left, right };
    } else if (v === 'または') {
      ts.consume();
      const right = parseCmpExpr(ts, lineNum);
      left = { t: 'or', left, right };
    } else break;
  }
  return left;
}

// ＝ is now equality; ← is assignment (handled at statement level)
const CMP_OPS = new Set(['＝', '≠', '＞', '≧', '＜', '≦']);

function parseCmpExpr(ts, lineNum) {
  let left = parseAddExpr(ts, lineNum);
  while (!ts.done() && ts.peek().type === 'OP' && CMP_OPS.has(ts.peekVal())) {
    const op = ts.consume().val;
    const right = parseAddExpr(ts, lineNum);
    left = { t: 'binop', op, left, right };
  }
  return left;
}

function parseAddExpr(ts, lineNum) {
  let left = parseMulExpr(ts, lineNum);
  while (!ts.done() && ts.peek().type === 'OP' && (ts.peekVal() === '＋' || ts.peekVal() === '－')) {
    const op = ts.consume().val;
    const right = parseMulExpr(ts, lineNum);
    left = { t: 'binop', op, left, right };
  }
  return left;
}

function parseMulExpr(ts, lineNum) {
  let left = parseUnaryExpr(ts, lineNum);
  while (!ts.done() && ts.peek().type === 'OP' && ['×', '÷', '／', '％'].includes(ts.peekVal())) {
    const op = ts.consume().val;
    const right = parseUnaryExpr(ts, lineNum);
    left = { t: 'binop', op, left, right };
  }
  return left;
}

function parseUnaryExpr(ts, lineNum) {
  if (!ts.done() && ts.peek().type === 'OP' && ts.peekVal() === '－') {
    ts.consume();
    return { t: 'neg', expr: parsePrimaryExpr(ts, lineNum) };
  }
  return parsePrimaryExpr(ts, lineNum);
}

function parsePrimaryExpr(ts, lineNum) {
  if (ts.done()) throw new DNCLError('式が不完全です', lineNum);
  const tok = ts.peek();

  if (tok.type === 'LPAREN') {
    ts.consume();
    const expr = parseLogicExpr(ts, lineNum);
    if (ts.done() || ts.peek().type !== 'RPAREN')
      throw new DNCLError(') が必要です', lineNum);
    ts.consume();
    return expr;
  }

  if (tok.type === 'NUM') {
    ts.consume();
    return { t: 'num', val: tok.val };
  }

  if (tok.type === 'ID' || tok.type === 'KW') {
    ts.consume();
    const name = tok.val;

    // Array access: name[idx]
    if (!ts.done() && ts.peek().type === 'LBRACKET') {
      ts.consume();
      const idx = parseLogicExpr(ts, lineNum);
      if (ts.done() || ts.peek().type !== 'RBRACKET')
        throw new DNCLError('] が必要です', lineNum);
      ts.consume();
      return { t: 'arr', name, idx };
    }

    // Function call: name(args...)
    if (!ts.done() && ts.peek().type === 'LPAREN') {
      ts.consume();
      const args = [];
      while (!ts.done() && ts.peek().type !== 'RPAREN') {
        args.push(parseLogicExpr(ts, lineNum));
        if (!ts.done() && ts.peek().type === 'COMMA') ts.consume();
      }
      if (!ts.done()) ts.consume(); // consume RPAREN
      return { t: 'call', name, args };
    }

    return { t: 'var', name };
  }

  throw new DNCLError(`予期しないトークン: ${tok.val}`, lineNum);
}

// ─── 表示する[] item parser ────────────────────────────────────────────────────

function parseDisplayItems(str, lineNum) {
  const items = [];
  let depth = 0, cur = '', inStr = false, strEnd = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      cur += ch;
      if (ch === strEnd) inStr = false;
    } else if (ch === '"') {
      inStr = true; strEnd = '"'; cur += ch;
    } else if (ch === '「') {
      inStr = true; strEnd = '」'; cur += ch;
    } else if (ch === '[' || ch === '(') { depth++; cur += ch; }
    else if (ch === ']' || ch === ')') { depth--; cur += ch; }
    else if ((ch === ',' || ch === '，') && depth === 0) {
      const s = cur.trim();
      if (s) items.push(parseDisplayItem(s, lineNum));
      cur = '';
    } else { cur += ch; }
  }
  const s = cur.trim();
  if (s) items.push(parseDisplayItem(s, lineNum));
  return items;
}

function parseDisplayItem(str, lineNum) {
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith('「') && str.endsWith('」'))) {
    return { t: 'str', val: str.slice(1, -1) };
  }
  return { t: 'expr', expr: parseExprStr(str, lineNum) };
}

// DNCL standard: 式 と 式 を表示する  → split by " と "
function parseDisplayItemsByTo(str, lineNum) {
  const items = [];
  let depth = 0, inStr = false, strEnd = '', cur = '', i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (inStr) {
      cur += ch;
      if (ch === strEnd) inStr = false;
      i++; continue;
    }
    if (ch === '"') { inStr = true; strEnd = '"'; cur += ch; i++; continue; }
    if (ch === '「') { inStr = true; strEnd = '」'; cur += ch; i++; continue; }
    if (ch === '[' || ch === '(') { depth++; cur += ch; i++; continue; }
    if (ch === ']' || ch === ')') { depth--; cur += ch; i++; continue; }
    if (depth === 0) {
      const sub = str.slice(i);
      const m = sub.match(/^[ 　]と[ 　]/);
      if (m) {
        const s = cur.trim();
        if (s) items.push(parseDisplayItem(s, lineNum));
        cur = '';
        i += m[0].length;
        continue;
      }
    }
    cur += ch;
    i++;
  }
  const s = cur.trim();
  if (s) items.push(parseDisplayItem(s, lineNum));
  return items;
}

// ─── Statement Parser ─────────────────────────────────────────────────────────

// Compute indentation level of a raw line
// Each ｜　 (full-width pipe + full-width space) counts as 2 units (= 1 indent level)
function getIndent(raw) {
  let count = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === ' ')  { count++; continue; }
    if (ch === '\t') { count += 4; continue; }
    if (ch === '　') { count += 2; continue; }
    if (ch === '|')  { count += 2; continue; }
    if (ch === '｜') { count += 2; continue; }
    break;
  }
  return count;
}

// Parse a trimmed line into a statement AST node
function parseLine(code, lineNum) {
  code = code.trim();
  // Strip inline comment
  const hashIdx = code.indexOf('#');
  if (hashIdx === 0) return { t: 'comment' };
  if (hashIdx > 0) code = code.slice(0, hashIdx).trim();
  if (!code) return { t: 'comment' };

  // ── End markers (skipped by buildTree) ──────────────────────────────────────
  if (code === 'を実行する' ||
      code === 'もし 終わり' || code === 'もし終わり')
    return { t: 'end_if' };

  if (code === 'を繰り返す' ||
      code === '繰り返し 終わり' || code === '繰り返し終わり')
    return { t: 'end_loop' };

  if (code === '中断する') return { t: 'break' };
  if (code === 'パスする') return { t: 'call', name: 'パスする', args: [] };
  if (code === 'と定義する' || code === 'と定義する。') return { t: 'end_funcdef' };

  // ── 関数定義: 関数 名前(引数リスト) を ───────────────────────────────────
  if (code.startsWith('関数 ') && (code.endsWith(' を') || code.endsWith('を'))) {
    const inner = code.slice(3, code.endsWith(' を') ? -2 : -1).trim();
    const m = inner.match(/^(.+)\(([^)]*)\)$/);
    if (!m) throw new DNCLError('関数定義の形式が正しくありません（例: 関数 名前(引数) を）', lineNum);
    const name   = m[1].trim();
    const params = m[2] ? m[2].split(/[,，]/).map(p => p.trim()).filter(p => p) : [];
    return { t: 'funcdef', name, params };
  }

  // ── else ────────────────────────────────────────────────────────────────────
  if (code === 'を実行し，そうでなければ' ||
      code === 'を実行し,そうでなければ' ||
      code === 'そうでなければ：' ||
      code === 'そうでなければ')
    return { t: 'else' };

  // ── elseif: を実行し，そうでなくもし 〜 ならば ────────────────────────────
  if ((code.startsWith('を実行し，そうでなくもし ') ||
       code.startsWith('を実行し,そうでなくもし ') ||
       code.startsWith('そうでなくもし ') ||
       code.startsWith('そうでなければ もし ')) &&
      (code.endsWith('ならば：') || code.endsWith('ならば'))) {
    const prefixes = [
      'を実行し，そうでなくもし ',
      'を実行し,そうでなくもし ',
      'そうでなくもし ',
      'そうでなければ もし ',
    ];
    let prefix = '';
    for (const p of prefixes) if (code.startsWith(p)) { prefix = p; break; }
    const end = code.endsWith('ならば：') ? -4 : -3;
    const condStr = code.slice(prefix.length, end).trim();
    return { t: 'elseif', cond: parseExprStr(condStr, lineNum) };
  }

  // ── if statement: もし 条件 ならば ─────────────────────────────────────────
  if (code.startsWith('もし ') &&
      (code.endsWith('ならば：') || code.endsWith('ならば'))) {
    const end = code.endsWith('ならば：') ? -4 : -3;
    const condStr = code.slice(2, end).trim();
    return { t: 'if', cond: parseExprStr(condStr, lineNum) };
  }

  // ── do-until end: を，条件 になるまで実行する ──────────────────────────────
  const doEndMatch = code.match(/^を[，,](.+)になるまで実行する$/);
  if (doEndMatch) {
    const condStr = doEndMatch[1].trim();
    return { t: 'end_do', cond: parseExprStr(condStr, lineNum) };
  }

  // ── do-until start: 繰り返し， ─────────────────────────────────────────────
  if (code === '繰り返し，' || code === '繰り返し,') return { t: 'do' };

  // ── for loop ────────────────────────────────────────────────────────────────
  if (code.match(/ずつ増やしながら[，,]/))    return parseForLoop(code, 'up',   lineNum);
  if (code.match(/ずつ減らしながら[，,]/))    return parseForLoop(code, 'down', lineNum);
  // backward compat (old syntax without trailing ，)
  if (code.includes('ずつ増やしながら繰り返す')) return parseForLoop(code, 'up',   lineNum);
  if (code.includes('ずつ減らしながら繰り返す')) return parseForLoop(code, 'down', lineNum);

  // ── while loop: 条件 の間， ─────────────────────────────────────────────────
  if (code.match(/の間[，,]?\s*$/)) {
    const condStr = code.replace(/の間[，,]?\s*$/, '').trim();
    return { t: 'while', cond: parseExprStr(condStr, lineNum) };
  }

  // ── DNCL標準: 式 と 式 を表示する ─────────────────────────────────────────
  if (code.endsWith('を表示する')) {
    const inner = code.slice(0, -'を表示する'.length).trim();
    return { t: 'display', items: parseDisplayItemsByTo(inner, lineNum) };
  }

  // ── 旧構文: 表示する[item, ...] （後方互換）────────────────────────────
  if (code.startsWith('表示する[') && code.endsWith(']')) {
    const inner = code.slice('表示する['.length, -1);
    return { t: 'display', items: parseDisplayItems(inner, lineNum) };
  }

  // ── function call without assignment: name(...) ──────────────────────────
  const callMatch = code.match(/^([^＝≠≧≦＜＞＋－×÷\[\]（(<←]+)\((.*)?\)$/);
  if (callMatch) {
    const name = callMatch[1].trim();
    const argsRaw = callMatch[2] ? callMatch[2].trim() : '';
    const args = argsRaw ? splitArgs(argsRaw).map(a => parseExprStr(a.trim(), lineNum)) : [];
    return { t: 'call', name, args };
  }

  // ── Assignment: LHS <- RHS (or ← for compat) ────────────────────────────
  let arrowPos = code.indexOf('<-');
  let arrowLen = 2;
  if (arrowPos === -1) { arrowPos = code.indexOf('←'); arrowLen = 1; }
  if (arrowPos !== -1) {
    const lhs = code.slice(0, arrowPos).trim();
    const rhs = code.slice(arrowPos + arrowLen).trim();
    // Array element assignment: name[ idx ] ← val
    // Use the FIRST '[' as the name/index boundary so that nested subscripts
    // (e.g. 残り[手札[i]] ← …) parse correctly. A greedy /^(.+)\[(.+)\]$/ would
    // wrongly split at the last '[', making name="残り[手札" and corrupting the write.
    const lb = lhs.indexOf('[');
    if (lb > 0 && lhs.endsWith(']')) {
      const name   = lhs.slice(0, lb).trim();
      const idxStr = lhs.slice(lb + 1, -1).trim();
      return {
        t: 'arr_assign',
        name,
        idx: parseExprStr(idxStr, lineNum),
        val: parseExprStr(rhs, lineNum),
      };
    }
    return { t: 'assign', name: lhs, val: parseExprStr(rhs, lineNum) };
  }

  throw new DNCLError(`解析できない行: "${code}"`, lineNum);
}

function parseForLoop(code, dir, lineNum) {
  // Strip the trailing loop keyword (new or old syntax)
  const cleaned = code
    .replace(/ずつ増やしながら[，,].*$/, '')
    .replace(/ずつ減らしながら[，,].*$/, '')
    .replace(/ずつ増やしながら繰り返す：?$/, '')
    .replace(/ずつ減らしながら繰り返す：?$/, '')
    .trim();

  // cleaned: 変数 を 開始 から 終了 まで 差分 ずつ
  const maTab = cleaned.split(/\s+を\s+/);
  if (maTab.length < 2) throw new DNCLError('forループの形式が正しくありません', lineNum);
  const varName = maTab[0].trim();
  const rest = maTab.slice(1).join(' を ');

  const fromTab = rest.split(/\s+から\s+/);
  if (fromTab.length < 2) throw new DNCLError('forループの「から」が必要です', lineNum);
  const fromStr = fromTab[0].trim();
  const rest2 = fromTab.slice(1).join(' から ');

  const toTab = rest2.split(/\s+まで\s+/);
  if (toTab.length < 2) throw new DNCLError('forループの「まで」が必要です', lineNum);
  const toStr = toTab[0].trim();
  const rest3 = toTab.slice(1).join(' まで ');

  const stepStr = rest3.replace(/\s*ずつ\s*$/, '').trim();

  return {
    t: 'for',
    dir,
    varName,
    from: parseExprStr(fromStr, lineNum),
    to:   parseExprStr(toStr,   lineNum),
    step: parseExprStr(stepStr, lineNum),
  };
}

function splitArgs(str) {
  const args = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if ((ch === ',' || ch === '，') && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur);
  return args;
}

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function buildTree(lines) {
  const result = [];
  const stack = [{ indent: -1, body: result }];

  for (const { lineNum, indent, code } of lines) {
    const stmt = parseLine(code, lineNum);

    // Pop stack to find parent at correct indent level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (stmt.t === 'comment' || stmt.t === 'end_if' || stmt.t === 'end_loop' || stmt.t === 'end_funcdef') {
      continue;
    }

    if (stmt.t === 'end_do') {
      // Attach condition to the most recent 'do' node in current scope
      const doNode = findLastDo(parent.body);
      if (!doNode) throw new DNCLError('「を，…になるまで実行する」に対応する「繰り返し，」がありません', lineNum);
      doNode.cond = stmt.cond;
      continue;
    }

    if (stmt.t === 'else') {
      const prev = findLastIf(parent.body);
      if (!prev) throw new DNCLError('「そうでなければ」に対応する「もし」がありません', lineNum);
      prev.elseBody = [];
      stack.push({ indent, body: prev.elseBody });
      continue;
    }

    if (stmt.t === 'elseif') {
      const prev = findLastIf(parent.body);
      if (!prev) throw new DNCLError('「そうでなくもし」に対応する「もし」がありません', lineNum);
      if (!prev.elseifs) prev.elseifs = [];
      const ei = { t: 'elseif', cond: stmt.cond, body: [] };
      prev.elseifs.push(ei);
      stack.push({ indent, body: ei.body });
      continue;
    }

    parent.body.push(stmt);

    if (stmt.t === 'if' || stmt.t === 'for' || stmt.t === 'while' || stmt.t === 'do' || stmt.t === 'funcdef') {
      stmt.body = [];
      stack.push({ indent, body: stmt.body });
    }
  }

  return result;
}

function findLastIf(body) {
  for (let i = body.length - 1; i >= 0; i--) {
    const s = body[i];
    if (s.t === 'if' || s.t === 'elseif') return s;
  }
  return null;
}

function findLastDo(body) {
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].t === 'do') return body[i];
  }
  return null;
}

// ─── Main Parse Function ──────────────────────────────────────────────────────

function parseCode(code) {
  const rawLines = code.split('\n');
  const annotated = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    // Strip leading indent characters: spaces, tabs, full-width space, ASCII pipe, full-width pipe
    const trimmed = raw.replace(/^[\s|｜　]+/, '').trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = getIndent(raw);
    annotated.push({ lineNum: i + 1, indent, code: trimmed });
  }

  return buildTree(annotated);
}

// ─── Interpreter ─────────────────────────────────────────────────────────────

class DNCLInterpreter {
  constructor(gameState) {
    this.gs = gameState;
    this.vars = {};
    this.funcs = {};
    this.output = null;
    this._break = false;
    this._return = false;
    this._returnVal = 0;
    this._steps = 0;
    this._stepLimit = 100000;
  }

  run(code) {
    // Built-in card constants
    this.vars = { 'J': 11, 'Q': 12, 'K': 13, 'A': 14,   // half-width
                  'Ｊ': 11, 'Ｑ': 12, 'Ｋ': 13, 'Ａ': 14, // full-width
                  '$': 15 };
    this.funcs = {};
    this.output = null;
    this.displayMessages = [];
    this._break = false;
    this._return = false;
    this._returnVal = 0;
    this._steps = 0;

    let stmts;
    try {
      stmts = parseCode(code);
    } catch (e) {
      throw new DNCLError('構文エラー: ' + e.message, e.line || 0);
    }

    this._execBlock(stmts);

    if (this.output === null) this.output = { action: 'pass' };
    return { ...this.output, displayMessages: this.displayMessages };
  }

  _execBlock(stmts) {
    for (const s of stmts) {
      if (this._break || this._return || this.output !== null) break;
      this._steps++;
      if (this._steps > this._stepLimit)
        throw new DNCLError('実行ステップ数が上限を超えました（無限ループの可能性）', 0);
      this._execStmt(s);
    }
  }

  _execStmt(s) {
    switch (s.t) {
      case 'assign':
        if (isLatinUpper(s.name) && !BUILTIN_SCALARS.has(s.name)) {
          throw new DNCLError(
            `「${s.name}」は大文字始まりなので配列として使います。スカラー変数は小文字始まりにしてください（例: ${s.name.toLowerCase()} ← 値）`, 0);
        }
        this.vars[s.name] = this._eval(s.val);
        break;

      case 'arr_assign': {
        if (isLatinLower(s.name)) {
          throw new DNCLError(
            `「${s.name}」は小文字始まりなので通常の変数として使います。配列は大文字始まりにしてください（例: ${s.name[0].toUpperCase() + s.name.slice(1)}[添字] ← 値）`, 0);
        }
        if (s.name === '捨て札') {
          throw new DNCLError('変数名は「捨札」です（送りがなの「て」は入りません）。', 0);
        }
        const idx = Math.floor(this._eval(s.idx));
        if (!Array.isArray(this.vars[s.name])) this.vars[s.name] = [];
        this.vars[s.name][idx - 1] = this._eval(s.val);
        break;
      }

      case 'if': {
        if (this._eval(s.cond)) {
          this._execBlock(s.body);
        } else {
          let handled = false;
          if (s.elseifs) {
            for (const ei of s.elseifs) {
              if (this._eval(ei.cond)) { this._execBlock(ei.body); handled = true; break; }
            }
          }
          if (!handled && s.elseBody) this._execBlock(s.elseBody);
        }
        break;
      }

      case 'for': {
        let cur = this._eval(s.from);
        const toVal  = this._eval(s.to);
        const stepVal = Math.abs(this._eval(s.step));
        if (s.dir === 'up') {
          while (cur <= toVal) {
            this.vars[s.varName] = cur;
            this._execBlock(s.body);
            if (this._break) { this._break = false; break; }
            if (this.output !== null || this._return) break;
            cur += stepVal;
          }
        } else {
          while (cur >= toVal) {
            this.vars[s.varName] = cur;
            this._execBlock(s.body);
            if (this._break) { this._break = false; break; }
            if (this.output !== null || this._return) break;
            cur -= stepVal;
          }
        }
        break;
      }

      case 'while': {
        let safety = 0;
        while (this._eval(s.cond)) {
          this._execBlock(s.body);
          if (this._break) { this._break = false; break; }
          if (this.output !== null) break;
          if (++safety > 100000) throw new DNCLError('無限ループの可能性', 0);
        }
        break;
      }

      case 'do': {
        // 後判定ループ: 条件が真になるまで繰り返す（最低1回実行）
        if (!s.cond) throw new DNCLError('後判定ループに条件がありません', 0);
        let safety = 0;
        do {
          this._execBlock(s.body);
          if (this._break) { this._break = false; break; }
          if (this.output !== null) break;
          if (++safety > 100000) throw new DNCLError('無限ループの可能性', 0);
        } while (!this._eval(s.cond));
        break;
      }

      case 'break':
        this._break = true;
        break;

      case 'funcdef':
        this.funcs[s.name] = { params: s.params, body: s.body };
        break;

      case 'display': {
        const parts = s.items.map(item => {
          if (item.t === 'str') return item.val;
          const v = this._eval(item.expr);
          if (Array.isArray(v)) return '[' + v.map(x => x ?? 0).join(', ') + ']';
          return String(v ?? 0);
        });
        this.displayMessages.push(parts.join(''));
        break;
      }

      case 'call':
        if (s.name === 'パスする') {
          this.output = { action: 'pass' };
        } else if (s.name === '出す') {
          const rank  = Math.floor(this._eval(s.args[0]));
          const count = s.args[1] !== undefined ? Math.floor(this._eval(s.args[1])) : 1;
          this.output = { action: 'play', rank, count };
        } else if (s.name === '返す') {
          this._returnVal = s.args[0] !== undefined ? this._eval(s.args[0]) : 0;
          this._return = true;
        } else if (s.name in this.funcs) {
          this._callUserFunc(s.name, s.args);
        }
        break;
    }
  }

  _eval(node) {
    if (node === null || node === undefined) return 0;
    switch (node.t) {
      case 'num': return node.val;

      case 'var': {
        const n = node.name;
        if (n.endsWith('.要素数')) {
          const arr = n.slice(0, n.length - 4);
          if (arr === '手札')       return this.gs.playerHand.length;
          if (arr === '捨札')       return this.gs.allDiscard?.length ?? 0;
          if (arr === '相手の手札') return this.gs.opponentHandSize  ?? 0;
          const ua = this.vars[arr];
          return Array.isArray(ua) ? ua.length : 0;
        }
        if (n === '場の強さ') return this.gs.fieldStrength;
        if (n === '場の枚数') return this.gs.fieldCount;
        if (n === '捨て札') {
          throw new DNCLError('変数名は「捨札」です（送りがなの「て」は入りません）。例: 捨札[1]、要素数[捨札]', 0);
        }
        return n in this.vars ? this.vars[n] : 0;
      }

      case 'arr': {
        // 要素数[配列名] — returns the length of the named array
        if (node.name === '要素数') {
          const arrName = node.idx.t === 'var' ? node.idx.name : null;
          if (arrName === '手札')       return this.gs.playerHand.length;
          if (arrName === '捨札')       return this.gs.allDiscard?.length ?? 0;
          if (arrName === '相手の手札') return this.gs.opponentHandSize   ?? 0;
          if (arrName === '捨て札') {
            throw new DNCLError('変数名は「捨札」です（送りがなの「て」は入りません）。例: 要素数[捨札]', 0);
          }
          const ua = this.vars[arrName];
          return Array.isArray(ua) ? ua.length : 0;
        }
        const idx = Math.floor(this._eval(node.idx)) - 1;
        if (node.name === '相手の手札') {
          throw new DNCLError('「相手の手札」は要素数のみ参照できます（例: 要素数[相手の手札]）。インデックスアクセスは禁止です。', 0);
        }
        if (node.name === '捨て札') {
          throw new DNCLError('変数名は「捨札」です（送りがなの「て」は入りません）。例: 捨札[1]', 0);
        }
        if (node.name === '手札')  return this.gs.playerHand[idx]    ?? 0;
        if (node.name === '捨札')  return this.gs.allDiscard?.[idx]  ?? 0;
        // ユーザー定義配列：小文字始まりLatinは禁止
        if (isLatinLower(node.name)) {
          throw new DNCLError(
            `「${node.name}」は小文字始まりなので通常の変数として使います。配列は大文字始まりにしてください。`, 0);
        }
        const arr = this.vars[node.name];
        return Array.isArray(arr) ? (arr[idx] ?? 0) : 0;
      }

      case 'call':
        if (node.name in this.funcs) return this._callUserFunc(node.name, node.args);
        return 0;

      case 'binop': {
        const l = this._eval(node.left);
        const r = this._eval(node.right);
        switch (node.op) {
          case '＋': return l + r;
          case '－': return l - r;
          case '×': return l * r;
          case '÷': return r !== 0 ? Math.trunc(l / r) : 0;
          case '／': return r !== 0 ? l / r : 0;
          case '％': return r !== 0 ? l % r : 0;
          case '＝':  return l === r;   // equality (was ＝＝)
          case '≠':  return l !== r;
          case '＞':  return l > r;
          case '≧':  return l >= r;
          case '＜':  return l < r;
          case '≦':  return l <= r;
        }
        break;
      }

      case 'and': return this._eval(node.left) && this._eval(node.right);
      case 'or':  return this._eval(node.left) || this._eval(node.right);
      case 'not': return !this._eval(node.expr);
      case 'neg': return -this._eval(node.expr);
    }
    return 0;
  }

  // ─── User-defined function call ───────────────────────────────────────────
  _callUserFunc(name, argExprs) {
    const func = this.funcs[name];
    if (!func) return 0;

    // 引数を現在のスコープで評価
    const argVals = argExprs.map(a => this._eval(a));

    // 外側の状態を保存
    const savedVars      = this.vars;
    const savedReturn    = this._return;
    const savedReturnVal = this._returnVal;

    // 関数スコープを作成（外側の変数も参照できるが、引数が優先）
    this.vars = { ...savedVars };
    func.params.forEach((p, i) => { this.vars[p] = argVals[i] ?? 0; });
    this._return    = false;
    this._returnVal = 0;

    this._execBlock(func.body);

    const retVal = this._returnVal;

    // 外側の状態を復元（_return はリセット：関数から抜けた）
    this.vars      = savedVars;
    this._return   = savedReturn;
    this._returnVal = savedReturnVal;

    return retVal;
  }
}
