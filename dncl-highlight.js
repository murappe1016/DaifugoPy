/*!
 * dncl-highlight.js — DNCL シンタックスハイライト
 *
 * textarea の背後にオーバーレイ div を重ね、DNCL キーワードを色付けする。
 * 打ち間違い検出の仕組み:
 *   正しいキーワード → 色が付く
 *   打ち間違い       → 色が付かない → 自分で気づける
 */
(function () {
  'use strict';

  /* ── トークンパターン（優先度順・長いものを先に）──────────────────────── */
  var PATS = [
    /* コメント（# から行末） */
    ['#[^\\n]*',                              'cmt'],

    /* ── 制御キーワード ──────────────────────────────────────────── */
    /* 複合（長いものを先に） */
    ['を実行し，そうでなくもし',               'ctrl'],
    ['を実行し,そうでなくもし',                'ctrl'],
    ['を実行し，そうでなければ',               'ctrl'],
    ['を実行し,そうでなければ',                'ctrl'],
    ['ずつ増やしながら繰り返す',               'ctrl'],
    ['ずつ減らしながら繰り返す',               'ctrl'],
    ['ずつ増やしながら[，,]',                  'ctrl'],
    ['ずつ減らしながら[，,]',                  'ctrl'],
    ['になるまで実行する',                      'ctrl'],
    ['の間[，,]',                              'ctrl'],
    ['そうでなくもし',                          'ctrl'],
    ['そうでなければ[：:]?',                   'ctrl'],
    /* 単語キーワード */
    ['もし',                                   'ctrl'],
    ['ならば[：:]?',                           'ctrl'],
    ['を実行する[。]?',                         'ctrl'],
    ['を繰り返す[。]?',                         'ctrl'],
    ['繰り返し',                                'ctrl'],
    ['と定義する[。]?',                         'ctrl'],
    ['関数',                                    'ctrl'],
    ['かつ',                                    'ctrl'],
    ['または',                                  'ctrl'],
    ['でない',                                  'ctrl'],
    ['から',                                    'ctrl'],
    ['まで',                                    'ctrl'],
    ['ずつ',                                    'ctrl'],

    /* ── 組み込み変数（長いものを先に）─────────────────────────── */
    ['相手の手札',                              'var'],
    ['場の強さ',                               'var'],
    ['場の枚数',                               'var'],
    ['手札',                                   'var'],
    ['捨札',                                   'var'],

    /* ── 関数・命令（長いものを先に）───────────────────────────── */
    ['を表示する',                              'func'],
    ['要素数',                                  'func'],
    ['中断する',                                'func'],
    ['パスする',                                'func'],
    ['返す',                                    'func'],
    ['出す',                                    'func'],

    /* ── 数値 ─────────────────────────────────────────────────── */
    ['[0-9]+',                                  'num'],

    /* ── 代入演算子 ──────────────────────────────────────────── */
    ['←',                                      'op'],
  ];

  /* 直前が「単語文字」のときは命令扱いしないキーワード。
     例: 「先頭を出す」のような自作関数名の末尾 "出す" を色付けしないため。 */
  var BOUNDARY_BEFORE = { '出す': 1, '返す': 1, 'パスする': 1, '中断する': 1 };

  function isWordChar(ch) {
    return !!ch && /[0-9A-Za-z぀-ヿ一-鿿]/.test(ch);
  }

  /* コンパイル（先頭マッチ用 ^ 付き RegExp を事前生成） */
  var compiled = PATS.map(function (p) {
    return { re: new RegExp('^(?:' + p[0] + ')'), cls: 'hl-' + p[1], bb: !!BOUNDARY_BEFORE[p[0]] };
  });

  /* ── HTML エスケープ ─────────────────────────────────────────────── */
  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ── 1 行をハイライト ───────────────────────────────────────────── */
  function highlightLine(text) {
    var out = '';
    var i = 0;
    var len = text.length;
    while (i < len) {
      var sub  = text.slice(i);
      var done = false;
      for (var k = 0; k < compiled.length; k++) {
        var m = compiled[k].re.exec(sub);
        if (m) {
          // 直前が単語文字なら、自作関数名の一部とみなして命令色を付けない
          if (compiled[k].bb && i > 0 && isWordChar(text[i - 1])) continue;
          out += '<span class="' + compiled[k].cls + '">' + esc(m[0]) + '</span>';
          i   += m[0].length;
          done = true;
          break;
        }
      }
      if (!done) {
        out += esc(text[i]);
        i++;
      }
    }
    return out;
  }

  /* ── テキスト全体をハイライト ────────────────────────────────────── */
  function highlight(code) {
    return code.split('\n').map(highlightLine).join('\n');
  }

  /* ── オーバーレイ更新 ──────────────────────────────────────────── */
  function update(ta, ovInner) {
    ovInner.innerHTML = highlight(ta.value) + '\n'; // trailing \n でスクロール余白
    // 水平スクロールを同期
    ovInner.style.transform = 'translateX(' + (-ta.scrollLeft) + 'px)';
  }

  /* ── セットアップ ─────────────────────────────────────────────── */
  function setup() {
    [0, 1, 2].forEach(function (n) {
      var ta = document.getElementById('ce-' + n);
      if (!ta) return;

      /* オーバーレイ外枠（overflow: hidden でクリッピング） */
      var ovWrap = document.createElement('div');
      ovWrap.className = 'hl-overlay';
      ovWrap.setAttribute('aria-hidden', 'true');

      /* 内側 span（transform で横スクロール同期） */
      var ovInner = document.createElement('span');
      ovInner.className = 'hl-overlay-inner';
      ovWrap.appendChild(ovInner);

      /* textarea の前に挿入（.case-text-wrap の最初の子として） */
      ta.parentNode.insertBefore(ovWrap, ta);

      /* textarea を透明に（キャレットは見えるように） */
      ta.classList.add('hl-active');

      /* イベント登録 */
      var lastVal = null;
      function refresh() { update(ta, ovInner); lastVal = ta.value; }
      ta.addEventListener('input',  refresh);
      ta.addEventListener('keyup',  refresh);
      ta.addEventListener('scroll', refresh);
      ta.addEventListener('change', refresh);

      /* 値の変更監視:
         アプリが問題ロード・リセット等で textarea.value を
         プログラム的に書き換えても input は発火しないため、
         rAF で値を監視してオーバーレイを同期させる
         （古いプレースホルダー ＜処理＞ がパスする等と被るのを防ぐ）。*/
      (function watch() {
        if (ta.value !== lastVal) refresh();
        requestAnimationFrame(watch);
      })();

      /* 初回描画（既存コードがあれば即ハイライト） */
      refresh();
    });
  }

  /* DOMContentLoaded 後に実行 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

}());
