# antibanana-mcp

把 Antigravity 的生图能力封装成一个可通过 stdio 启动的 MCP Server。

默认读取本机已登录的 Antigravity 凭证，无需额外配置；也支持通过凭证文件显式指定。

[![LINUX DO](https://img.shields.io/badge/LINUX%20DO-Community-blue)](https://linux.do)

## 功能

- `list_models`：列出当前账号可用的生图模型
- `check_quota`：查看指定模型配额
- `generate_image`：根据提示词生成图片，支持指定宽高比和分辨率（512 / 1K / 2K / 4K，默认 1K）

## 环境要求

- Node.js 20+
- 本机已登录 Antigravity，或一份可用的凭证 JSON

## MCP 接入

以 Claude Desktop 为例（`~/Library/Application Support/Claude/claude_desktop_config.json`）：

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

需要代理（国内访问 Google 服务）：

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

## 固化凭证（可选，更稳定）

默认每次启动都会读取本机 Antigravity 数据库，首次 `generate_image` 时还会自动获取 project_id。

如果想固定下来，可以创建一个凭证文件（例如 `~/antigravity-creds.json`）：

```json
{
  "refresh_token": "1//你的refresh_token",
  "project_id": "你的project-id"
}
```

然后在 MCP 配置里指定：

```json
{
  "env": {
    "ANTIBANANA_CREDENTIALS_PATH": "/Users/你的用户名/antigravity-creds.json"
  }
}
```

`refresh_token` 和 `project_id` 的值在首次 `generate_image` 成功后可从 MCP 启动日志里获取。

## 环境变量

| 变量 | 说明 |
|------|------|
| `HTTPS_PROXY` | 代理地址（影响 token 刷新） |
| `ANTIBANANA_PROXY_URL` | 代理地址（影响 API 请求） |
| `ANTIBANANA_CREDENTIALS_PATH` | 凭证 JSON 路径（不设则自动读本机 Antigravity） |
| `ANTIBANANA_PROJECT_ID` | 显式指定 project_id（不设则首次生图时自动获取） |
| `ANTIBANANA_TIMEOUT_MS` | 请求超时毫秒数（默认 120000） |
| `ANTIBANANA_MAX_RETRIES` | 请求失败最大重试次数（默认 2） |
| `ANTIBANANA_IMAGE_FILTER` | 返回图片筛选模式，`largest` 为默认值（每个 candidate 只保留 base64 最大的一张），`all` 为返回全部图片 |

## 本地开发

```bash
npm install
npm run build
npm test
```

## 致谢

感谢 [LINUX DO](https://linux.do) 社区的支持与推广。
