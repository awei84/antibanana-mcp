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
- **完全模拟 AG IDE** — 相同的请求体结构、UA（`antigravity/1.19.6`）、imageConfig 参数，默认行为与 Antigravity IDE 完全一致，不额外传输 AG IDE 未使用的字段
- **分辨率可选** — 支持 512 / 1K / 2K / 4K 输出（默认 1K）。`imageSize` 仅在用户显式指定时才传给后端，保持请求指纹一致
- **智能去缩略图** — 后端可能在同一 response 中返回缩略图和高清图，默认自动过滤，只保留每个 candidate 中最大的图
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
| `generate_image` | 根据提示词生成图片，支持指定宽高比和分辨率（512 / 1K / 2K / 4K，默认 1K） |

`generate_image` 可能返回多张图。默认 `largest` 模式会对每个 candidate 只保留 base64 最大的一张，设置 `ANTIBANANA_IMAGE_FILTER=all` 可返回后端给出的全部图片。

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
| `ANTIBANANA_TIMEOUT_MS` | 请求超时毫秒数（默认 120000） |
| `ANTIBANANA_MAX_RETRIES` | 请求失败最大重试次数（默认 2） |
| `ANTIBANANA_IMAGE_FILTER` | 图片筛选模式：`largest`（默认）单次响应含多个 candidate 时只保留最大图，`all` 返回全部图片 |

## FAQ

**为什么只支持 1:1 正方形？**
不是的。Antigravity IDE 自身只生成 1:1 图片，但本项目通过 API 参数 `aspectRatio` 支持任意宽高比（如 `4:3`、`16:9`、`3:4` 等）。

**为什么返回 base64 而不是直接保存文件？**
返回 base64 图片是 MCP 协议的标准做法。AI 客户端收到后会直接内联显示，需要保存时 AI 可以一步写入任意路径。图片以 `type: "image"` 内容块返回，客户端按视觉 token 计算（约 1600 token/张），不会大量占用上下文。

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
