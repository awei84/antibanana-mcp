# antibanana-mcp

[![npm version](https://img.shields.io/npm/v/antibanana-mcp)](https://www.npmjs.com/package/antibanana-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue)](LICENSE)
[![LINUX DO](https://img.shields.io/badge/LINUX%20DO-Community-blue)](https://linux.do)

中文 | **[English](./README.en.md)**

> MCP Server that wraps Google Antigravity's Nano Banana image generation, enabling any MCP-compatible AI client to generate images.

```
AI Client (Claude Code / Cursor / ...)
  → MCP Tool call
    → antibanana-mcp
      → Google Antigravity API
        → Nano Banana image generation
```

## Features

- **Zero config** — Automatically reads local Antigravity credentials. Just run `npx -y antibanana-mcp`. Also supports explicit credential files
- **Faithful AG IDE simulation** — Identical request body and imageConfig parameters. By default, the server fetches the latest UA version from the Antigravity releases endpoint and combines it with the current platform, keeping requests aligned with the current AG IDE without sending extra fields AG IDE does not use
- **Resolution control** — Supports 512 / 1K / 2K / 4K output (defaults to 1K). The `imageSize` parameter is only sent to the backend when explicitly specified, keeping the request fingerprint consistent
- **Smart thumbnail filtering** — The backend may return both thumbnails and full-resolution images in a single response. By default, only the largest image per candidate is kept
- **Local save** — Use the `outputPath` parameter to save generated images directly to disk (supports `~/`, `~\\`, and Windows absolute paths) without any extra scripting
- **Proxy support** — HTTPS proxy supported for regions that need it

## Quick Start

```bash
npx -y antibanana-mcp
```

### Requirements

- Node.js 20+
- A local Antigravity login, or a valid credentials JSON file

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "antibanana": {
      "command": "npx",
      "args": ["-y", "antibanana-mcp"]
    }
  }
}
```

### With Proxy

```json
{
  "mcpServers": {
    "antibanana": {
      "command": "npx",
      "args": ["-y", "antibanana-mcp"],
      "env": {
        "HTTPS_PROXY": "http://127.0.0.1:7890",
        "ANTIBANANA_PROXY_URL": "http://127.0.0.1:7890"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_models` | List available image generation models and their quota info |
| `check_quota` | Check remaining quota and reset time for a specific model |
| `generate_image` | Generate images from text prompts with optional aspect ratio, resolution, and local save path |

`generate_image` parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Image description. Write in English for best results |
| `aspectRatio` | string | — | Aspect ratio, e.g. `1:1`, `16:9`, `4:3` |
| `model` | string | — | Model ID, defaults to `gemini-3.1-flash-image` |
| `imageSize` | string | — | Resolution: `512` / `1K` / `2K` / `4K`, default 1K (non-standard param — AI will warn before using) |
| `outputPath` | string | — | Local file path to save the image, e.g. `~/Desktop/cat.jpg` or `C:\Users\Alice\Desktop\cat.jpg`. Supports `~/`, `~\\`, and Windows absolute paths. Strongly recommended by default; when set, the image is written to disk and the tool returns only text confirmation plus metadata instead of base64 image data, avoiding heavy context usage |

`generate_image` may return multiple images. The default `largest` mode keeps only the largest image per candidate. Set `ANTIBANANA_IMAGE_FILTER=all` to return all images from the backend.

If `outputPath` is omitted, the tool returns the full base64 image inline. This is useful for clients that need immediate inline display, but it can consume a large amount of context. Unless the user explicitly wants to view the image inline in chat, or explicitly does not want a local file written, you should always provide `outputPath`. If the user did not specify a save location, prefer a reasonable local path such as `~/Desktop/antibanana-image.png`; if the MCP server runs on Windows, a path like `C:\Users\<user>\Desktop\antibanana-image.png` is also appropriate.

Note: `outputPath` is always resolved on the MCP server host. If the server runs inside WSL, a Windows path like `C:\...` is converted to `/mnt/<drive>/...`. If the server runs on regular Linux/macOS, passing a Windows absolute path returns a real error instead of silently writing to the wrong directory.

## Pinned Credentials (Optional)

By default, antibanana-mcp reads your local Antigravity database on each startup, and auto-fetches the `project_id` on the first `generate_image` call.

To pin credentials, create a file (e.g. `~/antigravity-creds.json`):

```json
{
  "refresh_token": "1//your_refresh_token",
  "project_id": "your-project-id"
}
```

```bash
chmod 600 ~/antigravity-creds.json
```

Then add to your MCP config:

```json
{
  "env": {
    "ANTIBANANA_CREDENTIALS_PATH": "/Users/yourname/antigravity-creds.json"
  }
}
```

> `refresh_token` and `project_id` can be found in the MCP startup logs after the first successful `generate_image` call.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HTTPS_PROXY` | Proxy for token refresh |
| `ANTIBANANA_PROXY_URL` | Proxy for API requests |
| `ANTIBANANA_CREDENTIALS_PATH` | Path to credentials JSON (auto-reads local Antigravity if not set) |
| `ANTIBANANA_PROJECT_ID` | Explicit project_id (auto-fetched on first image generation if not set) |
| `ANTIBANANA_USER_AGENT` | Explicitly override the default User-Agent (otherwise the latest Antigravity releases version is used automatically) |
| `ANTIBANANA_TIMEOUT_MS` | Request timeout in ms (default: 120000) |
| `ANTIBANANA_MAX_RETRIES` | Max retry count on failure (default: 2) |
| `ANTIBANANA_IMAGE_FILTER` | Image filter mode: `largest` (default) keeps only the largest image per candidate, `all` returns everything |

## Development

```bash
npm install
npm run build
npm test
```

## Acknowledgements

Thanks to the [LINUX DO](https://linux.do) community for their support.

## License

[ISC](LICENSE)
