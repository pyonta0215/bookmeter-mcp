import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_PATH = fileURLToPath(new URL("./books.json", import.meta.url));
const raw = JSON.parse(readFileSync(process.env.BOOKS_JSON ?? DEFAULT_PATH, "utf-8"));
const books = Array.isArray(raw) ? raw : raw.books ?? [];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC");

const server = new McpServer({ name: "bookmeter-mcp", version: "0.1.0" });

server.registerTool(
  "search_books",
  {
    title: "蔵書検索",
    description: "タイトル・著者のキーワードで読書記録を検索する（「この本読んだ?」判定用）",
    inputSchema: { keyword: z.string(), limit: z.number().default(20) },
  },
  async ({ keyword, limit }) => {
    const q = norm(keyword);
    const hits = books
      .filter((b) => norm(`${b.t} ${b.a}`).includes(q))
      .slice(0, limit);
    return {
      content: [
        { type: "text", text: JSON.stringify({ count: hits.length, books: hits }, null, 2) },
      ],
    };
  }
);

server.registerTool(
  "books_by_author",
  {
    title: "著者別書籍一覧",
    description: "指定した著者の登録本を全件返す",
    inputSchema: { author: z.string() },
  },
  async ({ author }) => {
    const q = norm(author);
    const hits = books.filter((b) => norm(b.a).includes(q));
    return {
      content: [
        { type: "text", text: JSON.stringify({ count: hits.length, books: hits }, null, 2) },
      ],
    };
  }
);

server.registerTool(
  "reading_stats",
  {
    title: "読書統計",
    description: "総冊数・著者別トップN・年別冊数を集計する",
    inputSchema: { topAuthors: z.number().default(10) },
  },
  async ({ topAuthors }) => {
    const authorCounts = new Map();
    const yearCounts = new Map();

    for (const b of books) {
      const author = b.a || "不明";
      authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);

      const d = b.d;
      const match = typeof d === "string" ? d.match(/\d{4}/) : null;
      const year = match ? match[0] : "不明";
      yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    }

    const topAuthorsList = [...authorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topAuthors)
      .map(([author, count]) => ({ author, count }));

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
              totalBooks: books.length,
              topAuthors: topAuthorsList,
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

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
