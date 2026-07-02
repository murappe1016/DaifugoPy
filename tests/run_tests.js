#!/usr/bin/env node
// 回帰テスト: 模範解答を全テストケースに対して実行し、期待結果と照合する。
//   模範解答の出典:
//     b01–b27 … textbook_answers.html の answer-card
//     p01–p13 … answers_strategy_section.html の answer-card
//   使い方: node tests/run_tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'js/dncl.js'), 'utf8') +
     '\nglobalThis.DNCLInterpreter = DNCLInterpreter;');

// ── 模範解答の抽出 ──────────────────────────────────────────────
function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function stripTags(s) { return s.replace(/<[^>]+>/g, ''); }

function extractAnswers(html) {
  const out = {};
  const re = /class="answer-card-title">([bp]\d+)[\s　][\s\S]*?<div class="code-block"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    out[m[1]] = unescapeHtml(stripTags(m[2])).replace(/^\n+|\n+$/g, '');
  }
  return out;
}

const answers = {
  ...extractAnswers(fs.readFileSync(path.join(root, 'textbook_answers.html'), 'utf8')),
  ...extractAnswers(fs.readFileSync(path.join(root, 'answers_strategy_section.html'), 'utf8')),
};
// ソート問題の模範解答は tests/sort_solutions/*.dncl
const solDir = path.join(__dirname, 'sort_solutions');
for (const f of fs.readdirSync(solDir)) {
  if (f.endsWith('.dncl')) answers[f.replace('.dncl', '')] = fs.readFileSync(path.join(solDir, f), 'utf8');
}

// ── 判定（ui.js の checkExpected と同一ロジック）────────────────
function checkExpected(result, expected) {
  if (expected.display !== undefined) {
    const msgs = result.displayMessages || [];
    if (!msgs.some(msg => msg.includes(expected.display))) return false;
  }
  if (expected.action === 'pass') return result.action === 'pass';
  return result.action === 'play' &&
         result.rank === expected.rank &&
         result.count === expected.count;
}

// ── ソート問題の判定（expected.trace / expected.final）──────────
function checkSortExpected(interp, expected) {
  const hand = interp.vars['手札'];
  if (expected.final !== undefined &&
      JSON.stringify(hand) !== JSON.stringify(expected.final)) return 'final不一致: ' + JSON.stringify(hand);
  if (expected.trace !== undefined &&
      JSON.stringify(interp.trace) !== JSON.stringify(expected.trace)) {
    return 'trace不一致: ' + JSON.stringify(interp.trace);
  }
  return null;
}

// ── 実行 ────────────────────────────────────────────────────────
const problems = JSON.parse(fs.readFileSync(path.join(root, 'problems.json'), 'utf8')).problems;
let pass = 0, fail = 0, skip = 0;
const failures = [];

for (const p of problems) {
  const code = answers[p.id];
  if (!code) { skip++; failures.push(`${p.id}: 模範解答が見つからない`); continue; }
  for (const tc of p.testCases || []) {
    let ok = false, detail = '';
    try {
      const interp = new DNCLInterpreter(tc.state);
      const result = interp.run(code);
      if (tc.expected.trace !== undefined || tc.expected.final !== undefined) {
        const err = checkSortExpected(interp, tc.expected);
        ok = err === null;
        detail = err || '';
      } else {
        ok = checkExpected(result, tc.expected);
        detail = ok ? '' : `got=${JSON.stringify(result)}`;
      }
    } catch (e) { detail = 'エラー: ' + e.message; }
    if (ok) pass++;
    else { fail++; failures.push(`${p.id} [${tc.label}] ${detail.slice(0, 120)}`); }
  }
}

console.log(`PASS ${pass} / FAIL ${fail} / 解答なし ${skip}`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(fail || skip ? 1 : 0);
