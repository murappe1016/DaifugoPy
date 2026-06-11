/*!
 * print.js — 大富豪プログラミング 完全攻略テキスト
 *
 * beforeprint 時: 各 .pg に柱（ヘッダー）とノンブル（フッター）を注入
 * afterprint  時: 注入した要素と付与したクラスを全て除去（DOM リセット）
 *
 * ページパリティ（ノンブル基準）:
 *   奇数（1, 3, 5…）= 右ページ → 柱＝節タイトル（右寄せ）、ノンブル右
 *   偶数（2, 4, 6…）= 左ページ → 柱＝章タイトル（左寄せ）、ノンブル左
 *
 * ページ番号の起点:
 *   第0章の最初の .pg = ページ 1（奇数/右）
 *   目次・表紙       = 前付け（番号なし）
 */
(function () {
  'use strict';

  var _injected = [];   // 注入した DOM 要素（afterprint でまとめて削除）
  var _classed  = [];   // 付与したクラス { el, cls }（afterprint で除去）

  /* ─────────────────────────────────────────────
     ユーティリティ
  ───────────────────────────────────────────── */

  // 先頭の絵文字を除去し、節番号（"2-1" など）は残す（Q4-C）
  function stripLeadingEmoji(str) {
    return str
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]️?\s*/gu, '')
      .trim();
  }

  // 指定文字数を超えたら "…" で切り詰める
  function truncate(str, max) {
    max = (max !== undefined) ? max : 32;
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  // "CHAPTER 0" → "第0章"
  function toJpChNum(raw) {
    var m = String(raw).match(/\d+/);
    return m ? '第' + m[0] + '章' : raw;
  }

  /* ─────────────────────────────────────────────
     セクション見出しの取得（右ページ柱用）
     優先順位:
       1. 問題 / ヒント / 解説 → ID + タイトル（Q3-B）
       2. 模範解答集
       3. コラム
       4. 通常節 <h2> → 絵文字除去・番号保持（Q4-C）
       5. 章タイトル（フォールバック）
  ───────────────────────────────────────────── */
  function getSectionText(pg) {
    var probEl = pg.querySelector(
      '.problem-page-hdr .prob-title-jp,' +
      '.hint-page-hdr    .prob-title-jp,' +
      '.explain-page-hdr .prob-title-jp'
    );
    if (probEl) return truncate(probEl.textContent.trim());

    if (pg.querySelector('.answer-hdr') || pg.classList.contains('answer-pg')) return '模範解答集';

    var colEl = pg.querySelector('.column-hdr .prob-title-jp');
    if (colEl) return truncate(colEl.textContent.trim());

    var h2 = pg.querySelector('h2');
    if (h2) {
      var t = h2.textContent.trim();
      if (t.indexOf('目次') >= 0) return '目次';
      return truncate(stripLeadingEmoji(t));
    }

    var chEl = pg.querySelector('.ch-header .ch-title');
    return chEl ? truncate(chEl.textContent.trim()) : '';
  }

  /* ─────────────────────────────────────────────
     DOM 要素の生成
  ───────────────────────────────────────────── */

  function makeHeader(chapterText, sectionText, isOdd) {
    var wrap = document.createElement('div');
    wrap.className = 'print-header';

    var txt = document.createElement('span');
    txt.className = 'print-header-text';
    txt.textContent = isOdd ? sectionText : chapterText;

    var rule = document.createElement('div');
    rule.className = 'print-header-rule';

    wrap.appendChild(txt);
    wrap.appendChild(rule);
    return wrap;
  }

  // ページ種別を判定（充填コンテンツの出し分け用）
  function pageKind(pg) {
    if (pg.querySelector('.explain-page-hdr')) return '解説';
    if (pg.querySelector('.hint-page-hdr'))    return 'ヒント';
    if (pg.querySelector('.problem-page-hdr')) return '問題';
    if (pg.querySelector('.column-hdr'))       return 'コラム';
    if (pg.querySelector('.answer-hdr') || pg.classList.contains('answer-pg')) return '解答';
    // ch-header と h2 が両方あるページ（章扉兼概念ページ）は '概念' として扱う
    if (pg.querySelector('.ch-header') && pg.querySelector('h2')) return '概念';
    if (pg.querySelector('.ch-header')) return '章扉';
    if (pg.querySelector('h2'))         return '概念';
    return '?';
  }

  // ページ種別別のポイント情報（セクション終了時に注入）
  var POINT_TEXTS = {
    '解説': [
      '✔ 正解のコードを理解した',
      '✔ このコードが動く理由を説明できる',
      '✔ 似た問題なら応用できる'
    ],
    'ヒント': [
      '✔ 自分で考えてからヒントを読んだ',
      '✔ どこで詰まっていたか分かった',
      '✔ もう一度自力で挑戦できる'
    ],
    '問題': [
      '✔ 問題文を読んで何を出力すべきか把握した',
      '✔ 使う変数や構文を確認した',
      '✔ アプリでコードを書いて試した'
    ],
    '概念': [
      '✔ このセクションの内容を理解した',
      '✔ 説明と具体例を結びつけて読めた',
      '✔ 次のセクションへ進む準備ができた'
    ],
    '章扉': [
      '✔ この章で何を学ぶかわかった',
      '✔ 学習の目標が明確になった'
    ],
    'コラム': [
      '✔ コラムを読み終えた',
      '✔ プログラミングの活用例が分かった'
    ]
  };

  function makeSectionPoint(kind) {
    var el = document.createElement('div');
    el.className = 'print-section-point';
    var points = POINT_TEXTS[kind] || [];
    var html = '<div class="print-section-point-ttl">📌 このセクションのポイント</div>' +
               '<ul>';
    points.forEach(function (pt) {
      html += '<li>' + pt + '</li>';
    });
    html += '</ul>';
    el.innerHTML = html;
    return el;
  }

  function makeFillElements(kind) {
    var els = [];

    // 解説ページ: セルフチェック + ポイント
    if (kind === '解説') {
      var sc = document.createElement('div');
      sc.className = 'print-selfcheck';
      sc.innerHTML =
        '<div class="print-selfcheck-ttl">✅ 進む前のセルフチェック</div>' +
        '<ul>' +
        '<li>□ 正解のコードを自分で入力して採点が通った</li>' +
        '<li>□ なぜこのコードで正しく動くか、人に説明できる</li>' +
        '<li>□ 次の問題に進む準備ができた</li>' +
        '</ul>';
      els.push(sc);
    }

    // ポイントボックス（全種別）
    els.push(makeSectionPoint(kind));

    return els;
  }

  function makeFooter(pageNum) {
    var wrap = document.createElement('div');
    wrap.className = 'print-footer';

    var span = document.createElement('span');
    span.className = 'print-footer-number';
    span.textContent = String(pageNum);

    wrap.appendChild(span);
    return wrap;
  }

  /* ─────────────────────────────────────────────
     クリーンアップ
  ───────────────────────────────────────────── */

  function cleanup() {
    var i;
    for (i = 0; i < _injected.length; i++) {
      var el = _injected[i];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    _injected.length = 0;

    for (i = 0; i < _classed.length; i++) {
      var c = _classed[i];
      if (c && c.el) c.el.classList.remove(c.cls);
    }
    _classed.length = 0;
  }

  function _addClass(el, cls) {
    el.classList.add(cls);
    _classed.push({ el: el, cls: cls });
  }

  /* ─────────────────────────────────────────────
     メイン: ヘッダー/フッター注入
  ───────────────────────────────────────────── */

  function setup() {
    try {
      cleanup();
      _buildLayout();
    } catch (e) {
      console.error('[print.js] setup error:', e);
    }
  }

  function _buildLayout() {
    var pages = document.querySelectorAll('.pg');
    // 別冊（問題集・ヒント集・解答集）では data-booklet を柱の章名フォールバックに使う
    var booklet = (document.body.getAttribute('data-booklet') || '').trim();
    var currentChapter = booklet || '大富豪プログラミング 完全攻略テキスト';
    var pageNum        = 0;
    var numbering      = booklet ? true : false;  // 別冊は表紙以外すぐ採番
    var prevSection    = '';

    for (var i = 0; i < pages.length; i++) {
      var pg = pages[i];

      // 章区切り（別冊）から「第N章」を柱に反映
      if (booklet) {
        var prev = pg.previousElementSibling;
        while (prev) {
          if (prev.classList && prev.classList.contains('pg-chap-divider')) {
            var dc = prev.getAttribute('data-chapter');
            if (dc) currentChapter = booklet + '　' + dc.replace(/　解説$/, '');
            break;
          }
          if (prev.classList && prev.classList.contains('pg')) break;
          prev = prev.previousElementSibling;
        }
      }

      // 章情報の更新
      var chNumEl   = pg.querySelector('.ch-header .ch-num');
      var chTitleEl = pg.querySelector('.ch-header .ch-title');
      if (chNumEl && chTitleEl) {
        currentChapter =
          toJpChNum(chNumEl.textContent) + '　' + chTitleEl.textContent.trim();
        numbering = true;
      }

      // 目次 or 本文未開始 → 前付け（ノンブルなし）
      var firstH2 = pg.querySelector('h2');
      var isTOC   = firstH2 && firstH2.textContent.indexOf('目次') >= 0;
      if (!numbering || isTOC) {
        _addClass(pg, 'print-page-front');
        continue;
      }

      // ページ番号とパリティ
      pageNum++;
      var isOdd = (pageNum % 2 === 1);
      _addClass(pg, isOdd ? 'print-page-odd' : 'print-page-even');

      // セクション見出し（前ページから継続保持）
      var sec = getSectionText(pg);
      if (sec) { prevSection = sec; } else { sec = prevSection; }

      // ヘッダー挿入（先頭）
      var hdr = makeHeader(currentChapter, sec, isOdd);
      pg.insertBefore(hdr, pg.firstChild);
      _injected.push(hdr);

      // フッター挿入（末尾＝絶対配置なのでフロー順は無関係）
      var ftr = makeFooter(pageNum);
      pg.appendChild(ftr);
      _injected.push(ftr);
    }
  }

  /* ─────────────────────────────────────────────
     イベント登録
  ───────────────────────────────────────────── */

  // ページロード時に初期化（スクリーン表示用）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  // 印刷前に再度実行（念のため）
  window.addEventListener('beforeprint', setup);

  // 印刷後にクリーンアップ
  window.addEventListener('afterprint',  cleanup);

  // デバッグ用（コンソールで確認: window.__printSetup()）
  window.__printSetup   = setup;
  window.__printCleanup = cleanup;

}());
