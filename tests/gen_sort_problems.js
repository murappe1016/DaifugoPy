#!/usr/bin/env node
// ソート問題 s01–s06 を problems.json に生成・更新する。
//   期待値(trace/final)は tests/sort_solutions/*.dncl を実際に
//   インタプリタで実行した結果から作る（判定と模範解答のズレを防ぐ）。
//   使い方: node tests/gen_sort_problems.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'js/dncl.js'), 'utf8') +
     '\nglobalThis.DNCLInterpreter = DNCLInterpreter;');

// ── 共通テストデータ（配られた順＝未整列）──────────────────────
const HANDS = [
  { label: 'バラバラの手札',   hand: [10, 3, 13, 7, 15, 5] },
  { label: '完全に逆順の手札', hand: [15, 13, 11, 9, 6, 4] },
  { label: 'ほぼ整列済みの手札', hand: [4, 5, 3, 12, 9, 14] },
];

const RECORD_NOTE = '💡 途中経過の記録：この問題では「記録する()」という命令を使います。' +
  '指定された場所に書くと、そのときの手札の並びが記録され、正しいアルゴリズムで並べ替えたかが採点されます。';

// ── 問題定義 ────────────────────────────────────────────────────
const PROBLEMS = [
  {
    id: 's01', title: 'バブルソート', daifugoTitle: '配られた手札を並べ替える①',
    subtitle: 'つかうもの: 二重ループ / 交換 / 記録する()', difficulty: 2,
    description:
      's01　配られた手札はバラバラの順番です。となり同士（手札[j] と 手札[j＋1]）を比べて、' +
      '左のほうが強ければ交換する——これを繰り返して、手札を左から弱い順に並べ替えてください。\n' +
      '【記録のルール】外側のループ1周（＝1パス）が終わるたびに 記録する() を書くこと（全部で n－1 回記録されます）。\n' +
      RECORD_NOTE,
    hints: [
      'ループは二重です。外側は i を 1 から n－1 まで、内側は j を 1 から n－i まで。1パスごとに一番強いカードが右端に沈みます。',
      '交換は3行セットです： t ← 手札[j] ／ 手札[j] ← 手札[j＋1] ／ 手札[j＋1] ← t',
      '記録する() は「内側ループが終わった直後・外側ループの中」に置きます。位置を間違えると記録回数が合わず不正解になります。',
    ],
  },
  {
    id: 's02', title: '選択ソート', daifugoTitle: '配られた手札を並べ替える②',
    subtitle: 'つかうもの: 最小値の探索 / 交換 / 記録する()', difficulty: 2,
    description:
      's02　まだ並べ替えていない範囲（i 番目から右）の中から最も弱いカードを探し、その位置 m を覚えて、' +
      '範囲の先頭（i 番目）と交換します。i = 1 から n－1 まで繰り返すと弱い順に並びます。\n' +
      '【記録のルール】i 番目の交換が終わるたびに 記録する() を書くこと（最小がすでに先頭でも「自分との交換」をしてから記録）。\n' +
      RECORD_NOTE,
    hints: [
      'まず m ← i とおき、j を i＋1 から n まで動かして「もし 手札[j] ＜ 手札[m] ならば m ← j」で最小の位置を更新します。',
      '内側ループが終わったら 手札[i] と 手札[m] を3行セットで交換します（m ＝ i のままでも同じ手順でOK）。',
      '記録する() は交換の直後・外側ループの中に置きます。',
    ],
  },
  {
    id: 's03', title: '挿入ソート', daifugoTitle: '配られた手札を並べ替える③',
    subtitle: 'つかうもの: 前判定ループ / ずらして挿入 / 記録する()', difficulty: 3,
    description:
      's03　左端の1枚は「整列済み」と考え、i = 2 から n まで、i 枚目のカードを抜き取って（x ← 手札[i]）、' +
      '整列済み部分の正しい位置に挿入します。x より強いカードを右へ1つずつずらしてから、空いた場所に x を置きます。\n' +
      '【記録のルール】1枚の挿入が終わるたびに 記録する() を書くこと（全部で n－1 回）。\n' +
      RECORD_NOTE,
    hints: [
      '抜き取りは x ← 手札[i]、位置調べは j ← i－1 から左へ。',
      'ずらしは前判定ループで：「j ≧ 1 かつ 手札[j] ＞ x の間，」の中で 手札[j＋1] ← 手札[j] と j ← j－1。',
      'ループを抜けたら 手札[j＋1] ← x で挿入し、その直後に 記録する()。',
    ],
  },
  {
    id: 's04', title: 'クイックソート（反復版）', daifugoTitle: '配られた手札を並べ替える④',
    subtitle: 'つかうもの: 分割(パーティション) / スタック配列 / 記録する()', difficulty: 5,
    description:
      's04　区間の右端のカードを基準（ピボット）にして、「基準以下は左へ・基準より強いは右へ」と分割し、' +
      '基準を正しい位置に置きます。残った左右の区間は、配列 左[ ]・右[ ] をスタックとして使って積んでおき、順に取り出して同じ処理を繰り返します（再帰は使いません）。\n' +
      '【記録のルール】1回の分割（基準を正しい位置に置く）が終わるたびに 記録する() を書くこと。\n' +
      '【積む順番】分割後は 左側の区間 → 右側の区間 の順に積みます（あとに積んだ右側が先に処理されます）。\n' +
      RECORD_NOTE,
    hints: [
      'スタックの初期化：左[1] ← 1、右[1] ← 要素数[手札]、s ← 1。「s ≧ 1 の間，」ループの先頭で lo ← 左[s]、hi ← 右[s]、s ← s－1 と取り出します。',
      '分割（lo ＜ hi のときだけ）：基準 p ← 手札[hi]、仕切り k ← lo－1。j を lo から hi－1 まで動かし「もし 手札[j] ≦ p ならば k を1増やして 手札[k] と 手札[j] を交換」。',
      '内側ループ後、手札[k＋1] と 手札[hi] を交換すると基準が正しい位置（k＋1）に入ります。ここで 記録する()。',
      '最後に区間を積みます：s を1増やして 左[s] ← lo・右[s] ← k、もう一度 s を1増やして 左[s] ← k＋2・右[s] ← hi。',
    ],
  },
  {
    id: 's05', title: 'マージソート（反復版）', daifugoTitle: '配られた手札を並べ替える⑤',
    subtitle: 'つかうもの: 併合(マージ) / 作業配列 / 記録する()', difficulty: 5,
    description:
      's05　幅 w ＝ 1 から始めて、となり合う幅 w のブロック同士を小さい順に併合（マージ）し、幅を2倍にしていきます' +
      '（w ＝ 1, 2, 4, …）。マージには作業用の配列 作業[ ] を使い、マージ結果を手札に書き戻します。\n' +
      '【記録のルール】同じ幅 w のマージがすべて終わるたびに 記録する() を書くこと（手札6枚なら w ＝ 1, 2, 4 の3回）。\n' +
      RECORD_NOTE,
    hints: [
      '外側は「w ＜ n の間，」。その中で lo ← 1 から始め、「lo ＋ w ≦ n の間，」ブロックのペア [lo..mid] と [mid＋1..hi] をマージします（mid ← lo＋w－1、hi ← lo＋w＋w－1、ただし hi が n を超えたら hi ← n）。',
      'マージは3本のループ：①「a ≦ mid かつ b ≦ hi の間，」小さい方を 作業[c] に入れて進める ②残った左側を写す ③残った右側を写す。',
      'マージ後、j を lo から hi まで動かして 手札[j] ← 作業[j] と書き戻し、lo ← lo＋w＋w で次のペアへ。',
      '内側の処理がすべて終わったら 記録する() して w ← w＋w（幅2倍）。',
    ],
  },
  {
    id: 's06', title: 'ヒープソート（反復版）', daifugoTitle: '配られた手札を並べ替える⑥',
    subtitle: 'つかうもの: 最大ヒープ / 下方修正 / 記録する()', difficulty: 5,
    description:
      's06　配列をヒープ（親 i の子は i×2 と i×2＋1、親 ≧ 子）とみなして並べ替えます。\n' +
      'フェーズ1：h ＝ n÷2 から 1 まで下方修正して最大ヒープを作る。フェーズ2：先頭（最大）と範囲の末尾を交換して範囲を1縮め、下方修正で直す——を繰り返す。\n' +
      '【記録のルール】ヒープ構築が終わった直後に1回、フェーズ2では交換＋下方修正が終わるたびに 記録する() を書くこと（手札6枚なら合計6回）。\n' +
      RECORD_NOTE,
    hints: [
      '下方修正（サイズ s・開始位置 h）：i ← h、c ← i×2 として「c ≦ s の間，」①右の子が強ければ c ← c＋1 ②「もし 手札[c] ＞ 手札[i] ならば」交換して i ← c・c ← i×2、「そうでなければ」c ← s＋1 にしてループを終わらせる。',
      'フェーズ1は「h を n÷2 から 1 まで 1 ずつ減らしながら，」の中で下方修正（サイズ n）。終わったら 記録する() を1回。',
      'フェーズ2は「k を n から 2 まで 1 ずつ減らしながら，」の中で：手札[1] と 手札[k] を交換 → サイズ k－1 で下方修正（開始位置1）→ 記録する()。',
      '「そうでなければ c ← s＋1」は、親のほうが強くて修正が終わりのとき、ループ条件を偽にして抜けるための書き方です。',
    ],
  },
];

// ── 期待値を模範解答の実行結果から生成 ──────────────────────────
function makeTestCases(id) {
  const code = fs.readFileSync(path.join(__dirname, 'sort_solutions', id + '.dncl'), 'utf8');
  return HANDS.map(({ label, hand }) => {
    const state = { fieldStrength: 0, fieldCount: 0, playerHand: hand,
                    allDiscard: [], opponentHandSize: 3 };
    const interp = new DNCLInterpreter(state);
    interp.run(code);
    const final = [...interp.vars['手札']];
    const sorted = [...hand].sort((a, b) => a - b);
    if (JSON.stringify(final) !== JSON.stringify(sorted)) {
      throw new Error(`${id} の模範解答が ${JSON.stringify(hand)} を正しく整列できていません: ${JSON.stringify(final)}`);
    }
    if (interp.trace.length === 0) throw new Error(`${id} の模範解答が 記録する() を呼んでいません`);
    return {
      label: `${label} ${JSON.stringify(hand)}`,
      state,
      expected: { action: 'sort', trace: interp.trace, final },
    };
  });
}

// ── problems.json を更新（冪等: 既存の s* を置き換え）────────────
const file = path.join(root, 'problems.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.problems = data.problems.filter(p => p.category !== 'sort');

for (const def of PROBLEMS) {
  data.problems.push({
    id: def.id,
    category: 'sort',
    title: def.title,
    daifugoTitle: def.daifugoTitle,
    subtitle: def.subtitle,
    difficulty: def.difficulty,
    activeSection: 0,
    description: def.description,
    hints: def.hints,
    testCases: makeTestCases(def.id),
  });
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`problems.json 更新: ソート問題 ${PROBLEMS.length} 問（計 ${data.problems.length} 問）`);
