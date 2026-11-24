# Ruta in Claude Code and Claude Desktop

## MCP server

The server is one self-contained file: `mcp/dist/ruta-mcp-server.mjs` (Node 18+). Point your client at it.

Claude Code, project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "ruta": { "command": "node", "args": ["/absolute/path/to/ruta/mcp/dist/ruta-mcp-server.mjs"] }
  }
}
```

Claude Desktop, `claude_desktop_config.json`: the same `mcpServers` block.

Optional environment variables:

- `RUTA_CATALOG`: path to a JSON array of models (`id`, `provider`, `tier`, `inputPerM`, `outputPerM`, optional `cacheReadPerM`). Without it the prices are illustrative.
- `RUTA_POLICY`: path to a JSON object with policy overrides.
- `RUTA_CLAUDE_MAP`: tier → Claude Code model alias. Default `{"local":"haiku","rapida":"haiku","pro":"sonnet","experta":"opus"}`.

Then ask: "Use ruta_decide on this task before starting." The answer includes `claude_code_model`, so you can switch with `/model haiku`, `/model sonnet` or `/model opus`.

## Subagents

Give each subagent the tier its role deserves: orchestrators and reviewers Pro or higher (`sonnet`/`opus`), workers Rápida (`haiku`). Plan on the strong model, build on the cheaper one, review on the strong one.

## Without MCP

`node claude/skills/ruta/scripts/ruta.mjs "<task>" --channel studio --admin` prints the same decision.
