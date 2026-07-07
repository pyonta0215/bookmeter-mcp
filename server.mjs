// ローカル(Claude Desktop / Claude Code)向けの stdio トランスポート起動。
// ツール定義は mcp-server.mjs に集約し、リモート版(app.mjs)と共有する。
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-server.mjs";

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
