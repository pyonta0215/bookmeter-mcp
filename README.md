# bookmeter-mcp

読書記録（Bookmeter）を提供する最小のMCPサーバーです。トランスポートは stdio のみで、
HTTP/リモート接続・認証・Web UIは提供しません。

## 提供ツール

- `search_books(keyword, limit=20)` — タイトル・著者をキーワード検索
- `books_by_author(author)` — 指定著者の登録本を全件返す
- `reading_stats(topAuthors=10)` — 総冊数・著者別トップN・年別冊数を集計

## セットアップ

```bash
git clone <このリポジトリのURL>
cd bookmeter-mcp
npm install
node server.mjs
```

`node server.mjs` を実行して、エラーなく起動しプロセスが待機状態になっていれば起動確認は完了です
（stdio前提のサーバーなので、ターミナルで単体実行しても何も表示されずに待機し続けるのが正常動作です。
終了する場合は Ctrl+C で止めてください）。

## Claude Desktop などMCPクライアントへの登録方法

npmパッケージとして公開しているわけではないため、`npx` ではなく `node` コマンドで直接起動します。
設定ファイル（例: Claude Desktop の `claude_desktop_config.json`）に以下のように追記してください。
`args` の値は、このリポジトリをクローンした先の `server.mjs` への**絶対パス**に置き換えてください。

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

例えば `~/workspace/bookmeter-mcp` にクローンした場合は
`"/Users/yourname/workspace/bookmeter-mcp/server.mjs"` のようになります。

設定後、MCPクライアントを再起動すると `bookmeter` サーバーが認識され、上記3つのツールが利用できます。

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
