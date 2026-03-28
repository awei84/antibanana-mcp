# antibanana-mcp

把 Antigravity 的生图能力封装成一个可通过 stdio 启动的 MCP Server。

默认情况下，程序会直接读取本机 Antigravity 的凭证，无需手动导出凭证文件；如果你已经有一份可用的凭证 JSON，也可以通过环境变量显式指定。

## 功能

- `list_models`：列出当前账号可用的生图模型
- `check_quota`：查看指定模型配额
- `generate_image`：根据提示词生成图片

## 环境要求

- Node.js 20+
- 本机已登录 Antigravity，或一份可用的凭证 JSON

## 安装

```bash
npm install -g antibanana-mcp
```

## MCP 接入示例

以 Claude Desktop 为例（`~/Library/Application Support/Claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "antibanana": {
      "command": "npx",
      "args": ["antibanana-mcp"]
    }
  }
}
```

带代理（国内需要）：

```json
{
  "mcpServers": {
    "antibanana": {
      "command": "npx",
      "args": ["antibanana-mcp"],
      "env": {
        "ANTIBANANA_PROXY_URL": "http://127.0.0.1:7890"
      }
    }
  }
}
```

## 常用环境变量

| 变量 | 说明 |
|------|------|
| `ANTIBANANA_CREDENTIALS_PATH` | 显式指定凭证 JSON 路径（不设则自动读本机 Antigravity） |
| `ANTIBANANA_PROJECT_ID` | 显式指定 project_id（不设则自动获取） |
| `ANTIBANANA_PROXY_URL` | 代理地址 |
| `ANTIBANANA_TIMEOUT_MS` | 请求超时毫秒数（默认 120000） |

## 本地开发

```bash
npm install
npm run build
npm test
```

## 说明

- 默认读取本机 Antigravity `state.vscdb`，无需额外配置
- 支持显式指定凭证 JSON
- 当前只提供 stdio MCP Server，不包含图形界面
