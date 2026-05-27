# Supported Agents

Because the Superman framework natively implements the **Model Context Protocol (MCP)**, your backend instantly becomes a fully-featured toolset for *any* MCP-compatible AI agent. 

By running the built-in MCP server, these agents can read your OpenAPI specs, explore your database schemas, and even invoke your backend endpoints dynamically!

![Superman AI Agents](/agents-illustration.png)

## Compatible Agents

Superman's MCP integration works seamlessly with the following agents out-of-the-box:

- 🤖 **Claude Desktop / Claude Code**: Anthropic's flagship coding and reasoning agents.
- 💻 **Cursor / Codex**: The popular AI-first code editor.
- 🦉 **Hermes Agent**: Leading open-weights models that support structured tool use.
- 🦀 **OpenClaw / OpenHands**: The open-source autonomous AI software engineer.
- 🔌 **Any MCP-Compliant Agent**: Because Superman adheres strictly to the open MCP standard, any future agent that supports MCP can connect to your backend immediately.

---

## Simple Setup Guide

Exposing your backend to an AI agent is as simple as running your server. Because Superman uses the **Streamable HTTP transport**, you don't need any complex command-line wrappers. 

### Connect Your Agent (Example: Claude Desktop)

To connect Claude to your Superman backend, you simply need to point it to your `/mcp` route (adjusting for your `prefix` and `port`) in your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-superman-backend": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

No `command` or `args` are needed — providing a `url` tells the agent to use the Streamable HTTP transport.

Restart your agent, and it will discover your tools automatically!
