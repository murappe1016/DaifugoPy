# Google スライド生成のセットアップ（初回のみ・約5分）

`make_slides.py` が Google Slides API でスライドを自動生成するために、
OAuth クライアント（credentials.json）が1つ必要です。

## 手順

1. **Google Cloud Console を開く**
   https://console.cloud.google.com/
   （hiroki.murakawa@gmail.com でログイン）

2. **プロジェクトを作成**
   画面上部のプロジェクト選択 → 「新しいプロジェクト」
   名前は何でもOK（例: `daifugo-slides`）→ 作成 → 作成したプロジェクトを選択

3. **Google Slides API を有効化**
   https://console.cloud.google.com/apis/library/slides.googleapis.com
   →「有効にする」

4. **OAuth 同意画面の設定**
   https://console.cloud.google.com/auth/branding
   - User Type: **外部** → 作成
   - アプリ名: `daifugo-slides`（任意）、メール欄は自分のアドレス
   - スコープ追加は不要 → 保存して次へ
   - **テストユーザー**に `hiroki.murakawa@gmail.com` を追加 ← 重要

5. **OAuth クライアント ID を作成**
   https://console.cloud.google.com/auth/clients
   - 「+ クライアントを作成」
   - アプリケーションの種類: **デスクトップアプリ**
   - 作成 → **JSON をダウンロード**

6. **ダウンロードした JSON をこのフォルダに置く**
   ```
   mv ~/Downloads/client_secret_*.json /Users/macminicode/Developer/DaifugoPy/credentials.json
   ```

7. **実行**
   ```
   cd /Users/macminicode/Developer/DaifugoPy
   python3 make_slides.py
   ```
   ブラウザが開くので Google アカウントで許可 → 完成した
   スライドの URL がターミナルに表示されます。

## 2回目以降

`token.json` が保存されるので、`python3 make_slides.py` だけでOK
（毎回**新しいプレゼンテーション**が作られます。古いものは Drive に残ります）。

## 内容を修正したいとき

- **一括修正**（全問に効く変更）: `make_slides.py` か教材原本
  `textbook_app_v2.html.orig` を直して再実行 → 新しいデッキが作られる
- **個別修正**（誤字直し・レイアウト微調整）: Google スライド上で直接編集
  （図形・表・テキストはすべてネイティブ要素なので自由に編集可能）

## 確認コマンド

```
python3 make_slides.py --dump       # 解析結果（27問の一覧）
python3 make_slides.py --requests   # 生成されるスライド数・リクエスト数
```
