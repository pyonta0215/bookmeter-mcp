# bookmeter-mcp

読書記録（Bookmeter）を提供する最小の MCP サーバーです。3つのツールで蔵書を検索・集計できます。

使い方は2通りあります。

- **ローカル(stdio)** — 自分の PC の Claude Desktop / Claude Code から使う。セットアップが最も簡単。
- **リモート(AWS Lambda)** — claude.ai(Web) やモバイルアプリからも使う。公開エンドポイントを立てる。

## 提供ツール

- `search_books(keyword, limit=20)` — タイトル・著者をキーワード検索（「この本読んだ?」判定用）
- `books_by_author(author)` — 指定著者の登録本を全件返す
- `reading_stats(topAuthors=10)` — 総冊数・著者別トップN・年別冊数を集計

## 使い方1: ローカル(stdio)

```bash
git clone <このリポジトリのURL>
cd bookmeter-mcp
npm install
node server.mjs
```

`node server.mjs` を実行して、エラーなく起動しプロセスが待機状態になっていれば起動確認は完了です
（stdio 前提のサーバーなので、ターミナルで単体実行しても何も表示されずに待機し続けるのが正常動作です。
終了する場合は Ctrl+C で止めてください）。

### Claude Desktop などMCPクライアントへの登録

npm パッケージとして公開しているわけではないため、`npx` ではなく `node` コマンドで直接起動します。
設定ファイル（例: Claude Desktop の `claude_desktop_config.json`）に以下のように追記してください。
`args` の値は、クローンした先の `server.mjs` への**絶対パス**に置き換えます。

```json
{
  "mcpServers": {
    "bookmeter": {
      "command": "node",
      "args": ["/絶対パス/bookmeter-mcp/server.mjs"]
    }
  }
}
```

設定後、MCP クライアントを再起動すると `bookmeter` サーバーが認識され、上記3つのツールが利用できます。

## 使い方2: リモート(AWS Lambda + Function URL)

claude.ai(Web) やモバイルアプリからも使いたい場合、AWS Lambda に立てて「リモート MCP コネクタ」として登録します。ローカルの stdio サーバーは claude.ai(Web) からは使えないため、Web で使うにはこちらが必要です。

### 構成

- AWS Lambda + Function URL（認証なし）/ Node.js 22.x（arm64）
- トランスポート: Streamable HTTP（stateless、単一 JSON 応答）
- Express アプリ（`app.mjs`）を `@codegenie/serverless-express` で Lambda ハンドラ（`lambda.mjs`）に載せる
- ツール定義（`mcp-server.mjs`）は stdio 版とリモート版で共有
- 費用: Lambda 無料枠内（月100万リクエスト）。API Gateway も WAF も使わないので実質 $0/月

### 2段階の防御（認証なしで公開する代わり）

1. **IP制限** — Lambda ハンドラで送信元 IP を検査し、Anthropic の outbound レンジ `160.79.104.0/21`（[公式](https://platform.claude.com/docs/en/api/ip-addresses)）以外を 403 で拒否
2. **URL秘匿** — MCP エンドポイントのパスを推測困難なランダム文字列にする（`/mcp/<ランダム>`）。パスは環境変数 `MCP_PATH` で渡し、コードには含めない

> `books.json` 自体は公開リポジトリに含まれるため、上記はデータ機密性というより無駄なアクセス・DoS を防ぐ目的です。

### 前提

- AWS アカウントと認証済みの AWS CLI
- AWS SAM CLI

### デプロイ

```bash
# 1. 秘匿パスを生成（出力の32文字hexをメモ）
openssl rand -hex 16

# 2. デプロイ（McpPath に /mcp/<生成した文字列> を渡す）
sam deploy \
  --stack-name bookmeter-mcp \
  --resolve-s3 --capabilities CAPABILITY_IAM \
  --region ap-northeast-1 \
  --parameter-overrides 'McpPath=/mcp/<生成した文字列> AllowedCidr=160.79.104.0/21'
```

デプロイ後、出力の `FunctionUrl` の末尾に秘匿パスを付けたものが MCP エンドポイントです:
`https://xxxx.lambda-url.ap-northeast-1.on.aws/mcp/<生成した文字列>`

| パラメータ | 意味 | 既定 |
| --- | --- | --- |
| `McpPath` | MCP エンドポイントの秘匿パス | (必須) |
| `AllowedCidr` | 許可する送信元 IP レンジ | `160.79.104.0/21` |

> 自分の PC から疎通確認したいときは、一時的に `AllowedCidr` を自分のグローバル IP（`curl https://checkip.amazonaws.com` の結果）の `/32` にしてデプロイし、確認後に `160.79.104.0/21` へ戻します。本番レンジのままだと、Anthropic のクラウド経由（＝Claude から）以外はすべて 403 になります。

### claude.ai / Claude Desktop への登録

1. **Settings > Connectors**（設定 > コネクタ）を開く
2. **Add custom connector**（カスタムコネクタを追加）
3. 上記の MCP エンドポイント URL（秘匿パス込み）を入力。認証（OAuth）は不要
4. 追加後、チャットの「+」からコネクタを ON にして使う

無料プランでも1個まで登録できます。一度登録すれば Web・モバイル・Desktop すべてで使えます（新規登録は Web / Desktop 推奨）。

## データについて

`books.json` に読書記録が入っています。各レコードのフィールドは以下の通りです。

| フィールド | 内容 |
| --- | --- |
| `t` | タイトル |
| `a` | 著者 |
| `d` | 日付（`"YYYY/MM/DD"` 形式の文字列、または `"日付不明"`） |
| `r` | 感想文 |
| `i` | Amazon画像URL |
| `u` | Amazon商品ページURL |

`books.json` のパスは環境変数 `BOOKS_JSON` で上書きできます（未指定時はこのディレクトリ内の
`books.json` を使用します）。
