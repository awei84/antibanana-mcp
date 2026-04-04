# antibanana-mcp

[![npm version](https://img.shields.io/npm/v/antibanana-mcp)](https://www.npmjs.com/package/antibanana-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue)](LICENSE)
[![LINUX DO](https://img.shields.io/badge/LINUX%20DO-Community-blue)](https://linux.do)

**[English](./README.en.md)** | 中文

> 把 Google Antigravity 的 Nano Banana 生图能力封装成 MCP Server，让任何支持 MCP 的 AI 客户端都能画图。

```
AI 客户端（Claude Code / Cursor / ...）
  → MCP Tool 调用
    → antibanana-mcp
      → Google Antigravity API
        → Nano Banana 生图
```

## 特性

- **零配置启动** — 自动读取本机已登录的 Antigravity 凭证，`npx -y antibanana-mcp` 即可运行；也支持通过凭证文件显式指定
- **完全模拟 AG IDE** — 相同的请求体结构和 imageConfig 参数；默认会从 Antigravity releases 接口获取最新 UA 版本并拼接当前平台信息，尽量保持与当前 AG IDE 一致，不额外传输 AG IDE 未使用的字段
- **分辨率可选** — 支持 512 / 1K / 2K / 4K 输出（默认 1K）。`imageSize` 仅在用户显式指定时才传给后端，保持请求指纹一致
- **智能去缩略图** — 后端可能在同一 response 中返回缩略图和高清图，默认自动过滤，只保留每个 candidate 中最大的图
- **本地保存** — 通过 `outputPath` 参数可将生成的图片直接保存到本地磁盘（支持 `~` 路径），无需额外脚本
- **代理支持** — 支持 HTTPS 代理，国内访问 Google 服务可用

## 快速开始

```bash
npx -y antibanana-mcp
```

### 环境要求

- Node.js 20+
- 本机已登录 Antigravity，或一份可用的凭证 JSON

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`：

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

### 需要代理（国内访问 Google 服务）

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

## 工具

| 工具 | 说明 |
|------|------|
| `list_models` | 列出当前账号可用的生图模型与配额信息 |
| `check_quota` | 查询指定模型的剩余配额和重置时间 |
| `generate_image` | 根据提示词生成图片，支持指定宽高比、分辨率（512 / 1K / 2K / 4K，默认 1K）和本地保存路径 |

`generate_image` 参数说明：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✅ | 生图提示词，建议用英文 |
| `aspectRatio` | string | — | 宽高比，如 `1:1`、`16:9`、`4:3` 等 |
| `model` | string | — | 模型 ID，默认 `gemini-3.1-flash-image` |
| `imageSize` | string | — | 分辨率：`512` / `1K` / `2K` / `4K`，默认 1K（非标参数，AI 会在使用前预警） |
| `outputPath` | string | — | 本地保存路径，如 `~/Desktop/cat.jpg`。支持 `~`。强烈建议默认传入；指定后图片会写入磁盘，并且工具只返回文本确认和元数据，不再回传 base64 图片数据，从而避免严重占用上下文 |

`generate_image` 可能返回多张图。默认 `largest` 模式会对每个 candidate 只保留 base64 最大的一张，设置 `ANTIBANANA_IMAGE_FILTER=all` 可返回后端给出的全部图片。

如果不传 `outputPath`，工具会内联返回完整 base64 图片，适合需要直接显示图片的客户端，但会显著增加上下文占用。除非你明确需要在聊天里内联查看图片，或者明确不希望写本地文件，否则应始终传入 `outputPath`。如果用户没有指定保存位置，推荐默认使用类似 `~/Desktop/antibanana-image.png` 这样的本地路径。

## 固化凭证（可选，更稳定）

默认每次启动都会读取本机 Antigravity 数据库，首次 `generate_image` 时还会自动获取 project_id。

如果想固定下来，可以创建一个凭证文件（例如 `~/antigravity-creds.json`）：

```json
{
  "refresh_token": "1//你的refresh_token",
  "project_id": "你的project-id"
}
```

```bash
chmod 600 ~/antigravity-creds.json
```

然后在 MCP 配置里指定：

```json
{
  "env": {
    "ANTIBANANA_CREDENTIALS_PATH": "/Users/你的用户名/antigravity-creds.json"
  }
}
```

> `refresh_token` 和 `project_id` 的值在首次 `generate_image` 成功后可从 MCP 启动日志里获取。

## 环境变量

| 变量 | 说明 |
|------|------|
| `HTTPS_PROXY` | 代理地址（影响 token 刷新） |
| `ANTIBANANA_PROXY_URL` | 代理地址（影响 API 请求） |
| `ANTIBANANA_CREDENTIALS_PATH` | 凭证 JSON 路径（不设则自动读本机 Antigravity） |
| `ANTIBANANA_PROJECT_ID` | 显式指定 project_id（不设则首次生图时自动获取） |
| `ANTIBANANA_USER_AGENT` | 显式覆盖默认 User-Agent（不设则自动同步 Antigravity 最新 releases 版本） |
| `ANTIBANANA_TIMEOUT_MS` | 请求超时毫秒数（默认 120000） |
| `ANTIBANANA_MAX_RETRIES` | 请求失败最大重试次数（默认 2） |
| `ANTIBANANA_IMAGE_FILTER` | 图片筛选模式：`largest`（默认）单次响应含多个 candidate 时只保留最大图，`all` 返回全部图片 |

## FAQ

**为什么只支持 1:1 正方形？**
不是的。Antigravity IDE 自身只生成 1:1 图片，但本项目通过 API 参数 `aspectRatio` 支持任意宽高比（如 `4:3`、`16:9`、`3:4` 等）。

**为什么返回 base64 而不是直接保存文件？**
两种方式都支持，但行为不同：

- 不传 `outputPath`：返回 base64 图片，客户端可直接内联显示，但会占用大量上下文。
- 传 `outputPath`：MCP server 会把图片写入磁盘，只返回文本确认、保存路径和元数据，不再回传 base64 图片数据。

如果你的客户端会把工具结果带回后续上下文，默认应始终传 `outputPath`；只有在明确需要内联展示图片时才省略。

**如何更新到最新版本？**
配置中使用 `antibanana-mcp@latest` 可自动获取最新版；也可手动执行 `npx clear-npx-cache` 清除缓存后重启。

## 本地开发

```bash
npm install
npm run build
npm test
```

## 致谢

感谢 [LINUX DO](https://linux.do) 社区的支持与推广。

## License

[ISC](LICENSE)
