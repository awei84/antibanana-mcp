# antibanana-mcp

把 Antigravity 的生图能力封装成一个可通过 stdio 启动的 MCP Server。

默认情况下，程序会直接读取本机 Antigravity 的 凭证，无需手动导出凭证文件；如果你已经有一份可用的凭证 JSON，也可以通过环境变量显式指定。

## 功能

- `list_models`：列出当前账号可用的生图模型
- `check_quota`：查看指定模型配额
- `generate_image`：根据提示词生成图片

## 环境要求

- Node.js 20+
- 本机已登录 Antigravity，或一份可用的凭证 JSON

## 本地开发

安装依赖：

```bash
npm install --cache .npm-cache
```

构建：

```bash
npm run build
```

测试：

```bash
npm test
```

## 启动

直接使用本机默认凭证：

```bash
npm run dev
```

显式指定凭证文件：

```bash
ANTIBANANA_CREDENTIALS_PATH=/绝对路径/credential.json npm run dev
```

带代理启动：

```bash
ANTIBANANA_PROXY_URL=http://127.0.0.1:7890 npm run dev
```

## 常用环境变量

- `ANTIBANANA_CREDENTIALS_PATH`：显式指定凭证 JSON 路径
- `ANTIBANANA_PROJECT_ID`：显式指定 `project_id`
- `ANTIBANANA_PROXY_URL`：代理地址
- `ANTIBANANA_TIMEOUT_MS`：请求超时毫秒数

## MCP 接入示例

以 Claude Desktop 为例：

```json
{
  "mcpServers": {
    "antibanana": {
      "command": "node",
      "args": [
        "/绝对路径/antibanana-mcp/dist/index.js"
      ]
    }
  }
}
```

## 说明

- 默认读取本机 Antigravity `state.vscdb`
- 支持显式指定凭证 JSON
- 当前只提供 stdio MCP Server，不包含图形界面
