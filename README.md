# VALORANT デイリーストア DM Bot

毎朝、その日の VALORANT ストアに並ぶスキン 4 つを Discord の DM で自分に送ってくれる Bot です。
ナイトマーケット開催中はその内容も一緒に届きます。

```
GitHub Actions (毎日 09:17 JST)
  ├─ Riot の Cookie で再ログイン → ストア取得 (非公式 API)
  ├─ valorant-api.com からスキン名・画像・レアリティを取得 (日本語)
  ├─ 4 スキンを並べたバナー画像を生成
  └─ Bot が自分に DM (バナー画像 + スキン名・価格・合計・次の更新までの時間)
```

![バナーのイメージ (武器画像はダミー)](docs/banner-sample.png)

DM の内容:

```
10/14 のデイリーストア
プライム ヴァンダル　1,775 VP
リーヴァー オペレーター　1,775 VP
グリッチポップ ファントム　2,175 VP
エゴ ナイフ　875 VP

合計 6,600 VP
次の更新 19時間後
[バナー画像]
```

Cookie が切れるなどで取得に失敗した日は、理由を書いた DM が届きます。

## ⚠️ 先に読んでください

- **Riot 側の注意**: ストア取得は Riot 公式には公開されていない API を使います (多くのストア確認ツールと同じ方式)。
  Riot の方針変更で動かなくなる可能性があり、利用は自己責任です。
- **Cookie はパスワード同等**: `RIOT_COOKIES` を持っている人はあなたのアカウントとしてログインできます。
  必ず GitHub Secrets に入れ、他人に見せないでください。

## セットアップ

### 1. Discord Bot を作る

1. [Discord Developer Portal](https://discord.com/developers/applications) で **New Application** を作成。
2. **Bot** → **Reset Token** でトークンをコピー (`DISCORD_BOT_TOKEN`)。特別な Intent は不要です。
3. **OAuth2 → URL Generator** で scope に `bot` だけチェックし、出てきた URL から
   **自分が入っているサーバー** に Bot を招待 (自分専用のサーバーを作って入れるのがおすすめ)。
   権限は何も付けなくて OK です。
4. そのサーバーで「サーバーにいるメンバーからのダイレクトメッセージを許可する」が ON になっているか確認
   (サーバー名 → プライバシー設定)。Bot はサーバーを共有している相手にしか DM できません。
5. Discord の設定 → 詳細設定 → **開発者モード** を ON にし、自分のアイコンを右クリック → **ユーザーIDをコピー** (`DISCORD_USER_ID`)。

### 2. Riot の Cookie を取得

1. ブラウザでこの URL を開き、Riot アカウントでログイン (「ログインしたままにする」にチェック):
   `https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20openid&nonce=1`
2. playvalorant.com に移動したら、もう一度上の URL を開いて `auth.riotgames.com` のページで開発者ツールを開く
   (F12 → **Application** (Chrome) / **ストレージ** (Firefox) → Cookies → `https://auth.riotgames.com`)。
3. `ssid` の値をコピー。`clid` `tdid` `sub` `csid` もあれば `ssid=...; clid=...; tdid=...` の形でまとめると長持ちします。

> `ssid` は HttpOnly なので `document.cookie` には出てきません。必ず開発者ツールのストレージ画面から取ってください。

### 3. GitHub Secrets を登録

リポジトリの **Settings → Secrets and variables → Actions** で登録します。

| Secret | 内容 |
| --- | --- |
| `RIOT_COOKIES` | 手順 2 の Cookie |
| `COOKIE_JAR_KEY` | 適当な長いランダム文字列 (推奨)。更新された Cookie を暗号化して次回に引き継ぎ、Cookie の期限切れを減らします |
| `DISCORD_BOT_TOKEN` | 手順 1 の Bot トークン |
| `DISCORD_USER_ID` | 手順 1 の自分のユーザーID |

任意の **Variables**:

| Variable | 内容 |
| --- | --- |
| `VALORANT_REGION` | 地域の自動判定がうまくいかない場合に `ap` などを指定 |
| `DISCORD_OUTPUTS` | 送り先。既定は `dm`。下の「プロフィールウィジェット」を参照 |

### 4. 実行

**Actions → Send VALORANT daily store → Run workflow** で手動実行して、DM が届くか確認してください。
以後は毎日 00:17 UTC (09:17 JST、ストア更新の 17 分後) に自動で届きます。
(GitHub の定期実行は混雑時に遅れることがあり、数時間遅れる日もあります。混みやすい毎時 0 分前後を避けて 17 分にしています)

## ローカルで動かす

GitHub Actions の IP が Riot 側でブロックされる場合は、自宅 PC で動かしてください
(Windows のタスクスケジューラや cron で毎日 `npm start`)。

```bash
npm install
cp .env.example .env   # 値を記入
npm run dry-run        # DM は送らず、out/ にバナーと store.json を出力
npm start              # DM を送信
npm test
```

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `Riot session cookies are invalid or expired` | Cookie の期限切れ。手順 2 をやり直して `RIOT_COOKIES` を更新 |
| `Riot auth returned 403` | IP が Cloudflare にブロックされている可能性。ローカル実行を試す |
| `Bot cannot DM you` | Bot と共通のサーバーにいるか、そのサーバーで DM を許可しているか確認 |
| バナーの文字が豆腐 (□) になる | 日本語フォントが無い。`BANNER_FONT_PATH` にフォントファイルのパスを指定 |

## プロフィールウィジェット (上級者向け)

[Discord Profiles Can Do This Now](https://www.youtube.com/watch?v=gYv7D83u7yQ) のような
プロフィールウィジェットにも送れます。ただし 2026 年 7 月末に Discord が個人向けカスタムウィジェットの実験を終了したため
([Discord Previews](https://x.com/DiscordPreviews/status/2081887185418977488))、
**新規作成はできず、終了前に作ったウィジェットが今も表示されている場合のみ** 動作します。

使う場合は Variables で `DISCORD_OUTPUTS` を `widget` (DM と両方なら `dm,widget`) にし、
Secret `DISCORD_APPLICATION_ID` (ウィジェットのアプリ) を追加します。DM 用の Bot ではなく、
ウィジェットのアプリの Bot トークンを `DISCORD_BOT_TOKEN` に使ってください。
レイアウトは `widget/widget-config.json` を
[Discord-Widgets-Extension](https://github.com/TheCreativeGod/Discord-Widgets-Extension) の **Import** で読み込めます。
バナー画像はリポジトリの `widget-assets` ブランチに公開されるので、リポジトリは公開にしてください
(非公開なら Variable `BANNER_PUBLISH=false` で、1 枚目のスキン画像が代わりに使われます)。

送信するデータフィールド:

| フィールド | 型 | 例 |
| --- | --- | --- |
| `store_banner` | 画像 | バナー画像の URL |
| `store_title` | 文字列 | `10/14 のデイリーストア` |
| `store_summary` | 文字列 | `プライム ヴァンダル / エゴ ナイフ / ...` |
| `refresh_at` | 文字列 | `10/15 09:00` |
| `total_price` | 数値 | `6600` |
| `riot_id` | 文字列 | `Player#JP1` |
| `skin1_name` 〜 `skin4_name` | 文字列 | `プライム ヴァンダル` |
| `skin1_price` 〜 `skin4_price` | 数値 | `1775` |
| `skin1_price_text` 〜 `skin4_price_text` | 文字列 | `1,775 VP` |
| `skin1_image` 〜 `skin4_image` | 画像 | スキン画像の URL |

`APPLICATION_IDENTITY_PROVIDER_USER_ID_MISMATCH` が出たら、`DISCORD_IDENTITY_ID` に以前使った ID (例: `0`) を設定してください。

## 参考

- [Valorant API Docs (techchrism)](https://valapidocs.techchrism.me/)
- [valorant-api.com](https://valorant-api.com/)
- [How to Make Discord Widgets (Chloe Cinders)](https://chloecinders.com/blog/discord-widgets)
- [discord-github-profile-widget (AdityaLF)](https://github.com/AdityaLF/discord-github-profile-widget)
