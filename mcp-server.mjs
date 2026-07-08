// メディア記録(本・映画・アニメ・ゲームなど)を提供する MCP サーバーのツール定義。
// stdio版(server.mjs)とリモート版(app.mjs)の双方から createServer() を共有する。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// メディア種別ごとのデータソース定義。
// - books.json は Bookmeter エクスポート形式(t/a/d/r/i/u)のまま温存し、読み込み時に共通スキーマへ正規化する
// - それ以外のファイルは最初から共通スキーマ(title/creator/date/review/url + 任意フィールド)で記録する
// - 新しい種別を増やすときはここに1行足して <type>s.json を置くだけでよい
const SOURCES = [
  {
    type: "book",
    file: "books.json",
    env: "BOOKS_JSON",
    normalize: (b) => ({
      type: "book",
      title: b.t,
      creator: b.a,
      date: b.d,
      review: b.r,
      image: b.i,
      url: b.u,
    }),
  },
  { type: "movie", file: "movies.json", env: "MOVIES_JSON" },
  { type: "anime", file: "anime.json", env: "ANIME_JSON" },
  { type: "game", file: "games.json", env: "GAMES_JSON" },
];

export const MEDIA_TYPES = SOURCES.map((s) => s.type);

// 各ファイルはモジュール読み込み時に一度だけ読む(Lambda warm 時はキャッシュされる)。
// 環境変数でパス上書き可。既定パスのファイルが無い種別は空扱いにする。
function loadSource({ type, file, env, normalize }) {
  const path = process.env[env] ?? fileURLToPath(new URL(`./${file}`, import.meta.url));
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT" && !process.env[env]) return [];
    throw e;
  }
  const records = Array.isArray(raw) ? raw : raw.records ?? raw.books ?? [];
  return records.map(normalize ?? ((r) => ({ type, ...r })));
}

export const media = SOURCES.flatMap(loadSource);

// 検索用の正規化(小文字化 + NFKC で全角/半角を吸収)
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC");

const typeSchema = z.enum(MEDIA_TYPES).optional();
const byType = (type) => (type ? media.filter((m) => m.type === type) : media);

// 3ツールを登録した McpServer インスタンスを生成して返す。
// stateless 運用のためリクエストごとに新規生成できるよう関数化している。
export function createServer() {
  const server = new McpServer({ name: "bookmeter-mcp", version: "0.2.0" });

  // タイトル・作者のキーワード検索(「これ読んだ/観た/やった?」判定用)
  server.registerTool(
    "search_media",
    {
      title: "メディア記録検索",
      description:
        "タイトル・作者のキーワードでメディア記録(本・映画・アニメ・ゲーム)を検索する（「これ読んだ/観た/やった?」判定用）。type未指定なら全種別を横断検索",
      inputSchema: { keyword: z.string(), type: typeSchema, limit: z.number().default(20) },
    },
    async ({ keyword, type, limit }) => {
      const q = norm(keyword);
      const hits = byType(type)
        .filter((m) => norm(`${m.title} ${m.creator}`).includes(q))
        .slice(0, limit);
      return {
        content: [
          { type: "text", text: JSON.stringify({ count: hits.length, media: hits }, null, 2) },
        ],
      };
    }
  );

  // 指定した作者(著者・監督・開発元など)の記録を全件返す
  server.registerTool(
    "media_by_creator",
    {
      title: "作者別メディア一覧",
      description:
        "指定した作者(著者・監督・開発元など)のメディア記録を全件返す。type未指定なら全種別を対象にする",
      inputSchema: { creator: z.string(), type: typeSchema },
    },
    async ({ creator, type }) => {
      const q = norm(creator);
      const hits = byType(type).filter((m) => norm(m.creator).includes(q));
      return {
        content: [
          { type: "text", text: JSON.stringify({ count: hits.length, media: hits }, null, 2) },
        ],
      };
    }
  );

  // 総件数・種別内訳・感想を書いた数・作者別トップN・年別件数を集計する
  server.registerTool(
    "media_stats",
    {
      title: "メディア統計",
      description:
        "メディア記録の総件数・種別内訳・感想を書いた数・作者別トップN・年別件数を集計する。type指定でその種別のみ集計",
      inputSchema: { type: typeSchema, topCreators: z.number().default(10) },
    },
    async ({ type, topCreators }) => {
      const records = byType(type);
      const typeCounts = new Map();
      const creatorCounts = new Map();
      const yearCounts = new Map();
      let reviewed = 0;

      for (const m of records) {
        typeCounts.set(m.type, (typeCounts.get(m.type) ?? 0) + 1);
        if (m.review) reviewed++;
        const creator = m.creator || "不明";
        creatorCounts.set(creator, (creatorCounts.get(creator) ?? 0) + 1);

        const d = m.date;
        const match = typeof d === "string" ? d.match(/\d{4}/) : null;
        const year = match ? match[0] : "不明";
        yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
      }

      const topCreatorsList = [...creatorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topCreators)
        .map(([creator, count]) => ({ creator, count }));

      // 年でソート、"不明" は末尾へ
      const byYear = [...yearCounts.entries()]
        .sort((a, b) => {
          if (a[0] === "不明") return 1;
          if (b[0] === "不明") return -1;
          return a[0].localeCompare(b[0]);
        })
        .map(([year, count]) => ({ year, count }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalRecords: records.length,
                byType: Object.fromEntries(typeCounts),
                withReview: reviewed,
                withoutReview: records.length - reviewed,
                topCreators: topCreatorsList,
                byYear,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}
