# cc-mcp

`cc-mcp` 是一个面向 AI / MCP 的 Cocos Creator 3.8 编辑器扩展。

它把场景、节点、组件、预制体、预览、构建、资源和调试能力暴露成 MCP 工具，方便 Codex、Claude Code 或你自己的 MCP 客户端直接调用。

整体结构是三层：

1. Cocos Creator 内部扩展
2. 本地 HTTP bridge：`http://127.0.0.1:17321`
3. `dist/mcp-server.js`：标准 `stdio` MCP 适配层，转发到本地 bridge

## 主要能力

- 场景：获取当前场景、场景列表、打开场景、保存场景、创建场景、读取完整层级
- 节点：创建、读取、查找、移动、复制、删除、设置位置/旋转/缩放/激活状态
- 组件：添加、删除、列出、改属性、挂载脚本组件
- 预制体：列出、读取、打开、实例化、创建、把场景节点导出成真正的 prefab 资源
- 预览：浏览器预览、GameView 启动/暂停/单步/停止
- 构建：查询平台、查询任务、触发真实构建、等待构建完成
- 资源/调试/环境：资源 CRUD、日志、执行场景 JS、统计、校验、偏好设置、服务信息

更适合 AI 直接调用的高层工具有：

- `ai_preview_browser_with_scene`
- `ai_build_web_desktop_default`
- `ai_build_web_mobile_default`
- `ai_build_web_mobile_and_wait`
- `ai_export_selected_nodes_to_prefabs`
- `ai_export_nodes_by_name_to_prefabs`

## 项目结构

- `source/main.ts`
  运行在扩展主进程，负责 bridge、MCP 风格 JSON-RPC、构建/资源/日志/项目级工具
- `source/scene.ts`
  运行在 scene script，负责真实的场景、节点、组件、prefab、GameView 操作
- `source/mcp-server.ts`
  标准 `stdio` MCP server，把 MCP 请求转发到 `http://127.0.0.1:17321`

## 安装

把扩展放进项目：

```text
您的项目/
├─ assets/
├─ extensions/
│  └─ cc-mcp/
│     ├─ source/
│     ├─ dist/
│     ├─ package.json
│     └─ ...
└─ ...
```

安装依赖并构建：

```powershell
cd E:\CocosWorkspace\Test33\extensions\cc-mcp
npm install
npm run build
```

然后在 Cocos Creator 里：

1. 打开项目 `E:\CocosWorkspace\Test33`
2. 启用或刷新 `cc-mcp`
3. 在 AI 使用 MCP 的整个过程中保持 Creator 打开

## 先确认 bridge 正常

扩展加载后，应能访问：

```text
http://127.0.0.1:17321
```

健康检查：

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:17321/health"
```

预期：

- 返回 200
- 返回扩展名、版本号、项目路径

## 你可以怎么接

`cc-mcp` 有三种常用入口：

1. 标准 `stdio` MCP server

```powershell
node E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js
```

2. MCP JSON-RPC HTTP 端点

```text
POST http://127.0.0.1:17321/mcp
```

3. 简化工具调用端点

```text
POST http://127.0.0.1:17321/tool
```

其他辅助接口：

- `GET /health`
- `GET /tools`
- `POST /message`
- `POST /crud`

## 给 Codex 用

OpenAI 官方文档说明，Codex 的 MCP 可以通过 `codex mcp add` 或 `config.toml` 配置，CLI 和 IDE 扩展共用同一套配置。参考：

- [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp)
- [Advanced Configuration – Codex](https://developers.openai.com/codex/config-advanced)

### 方式 A：直接用命令添加

```powershell
codex mcp add cc-mcp -- node E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js
```

添加后可检查：

- `codex mcp --help`
- 在 Codex TUI 里输入 `/mcp`

### 方式 B：写进 `.codex/config.toml`

项目级配置文件建议放这里：

- `E:\CocosWorkspace\Test33\.codex\config.toml`

示例：

```toml
[mcp_servers.cc-mcp]
command = "node"
args = ["E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js"]
cwd = "E:/CocosWorkspace/Test33"
startup_timeout_sec = 20
tool_timeout_sec = 600
enabled = true
```

如果你想全局可用，也可以写到：

- `~/.codex/config.toml`

### 在 Codex 里怎么提需求

连上后，直接自然语言要求它调用工具即可，例如：

- `用 cc-mcp 读取当前 Cocos 场景，并总结节点层级。`
- `用 cc-mcp 打开 db://assets/scene.scene，然后启动浏览器预览。`
- `用 cc-mcp 把当前选中的节点导出到 db://assets/prefabs/selected。`
- `用 cc-mcp 做一次 web-mobile 构建，并等待构建完成。`

比较常见的工具链路：

1. `scene_get_current_scene`
2. `scene_get_hierarchy`
3. `node_find_nodes_by_name` 或 `node_create_node`
4. `project_preview_start` 或 `ai_preview_browser_with_scene`
5. `project_build` 或 `ai_build_web_mobile_and_wait`

## 给 Claude Code 用

Anthropic 官方文档支持用 `claude mcp add --transport stdio <name> -- <command> [args...]` 添加本地 stdio MCP server。参考：

- [Connect Claude Code to tools via MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)

### 方式 A：本地作用域，最省事

```powershell
claude mcp add --transport stdio cc-mcp -- node E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js
```

### 方式 B：项目作用域，写入仓库 `.mcp.json`

```powershell
claude mcp add --transport stdio cc-mcp --scope project -- node E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js
```

Anthropic 目前的作用域语义是：

- `local`：默认值，只对你当前这个项目有效，配置存到 `~/.claude.json`
- `project`：写到仓库 `.mcp.json`，适合团队共享
- `user`：用户级，对你所有项目可用

### 对应的 `.mcp.json` 示例

如果你想手写配置，可以这样：

```json
{
  "mcpServers": {
    "cc-mcp": {
      "command": "node",
      "args": [
        "E:/CocosWorkspace/Test33/extensions/cc-mcp/dist/mcp-server.js"
      ],
      "env": {}
    }
  }
}
```

### 检查连接状态

```powershell
claude mcp list
claude mcp get cc-mcp
```

在 Claude Code 里：

```text
/mcp
```

### 在 Claude Code 里怎么提需求

例如：

- `Use the cc-mcp MCP server to inspect the current Cocos scene.`
- `Use cc-mcp to open db://assets/scene.scene and launch browser preview.`
- `Use cc-mcp to export nodes named Enemy into db://assets/prefabs/enemies.`
- `Use cc-mcp to build web-mobile and wait for completion.`

## 如果你自己写客户端

你也可以直接调 bridge。

### 简化 `/tool` 调用

请求体：

```json
{
  "name": "scene_get_current_scene",
  "arguments": {}
}
```

PowerShell：

```powershell
$body = @{
  name = "scene_get_current_scene"
  arguments = @{}
} | ConvertTo-Json -Depth 20

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:17321/tool" `
  -ContentType "application/json" `
  -Body $body
```

### MCP JSON-RPC 调用

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "scene_get_current_scene",
    "arguments": {}
  }
}
```

## 推荐先试的几个工具

新客户端刚接上时，建议先跑这几条：

1. `scene_get_current_scene`
2. `scene_get_scene_list`
3. `scene_get_hierarchy`
4. `project_get_info`
5. `env_get_environment_info`

确认通了之后，再跑真实动作：

1. `ai_preview_browser_with_scene`
2. `prefab_export_node_to_prefab`
3. `ai_export_selected_nodes_to_prefabs`
4. `ai_build_web_mobile_and_wait`

## 实战示例

### 打开场景并启动浏览器预览

```json
{
  "name": "ai_preview_browser_with_scene",
  "arguments": {
    "scene": "db://assets/scene.scene"
  }
}
```

### 触发 web-mobile 构建并等待完成

```json
{
  "name": "ai_build_web_mobile_and_wait",
  "arguments": {
    "debug": true,
    "buildPath": "project://build/web-mobile",
    "timeoutMs": 600000,
    "pollMs": 1500
  }
}
```

### 把场景节点导出成真正的 prefab 资源

```json
{
  "name": "prefab_export_node_to_prefab",
  "arguments": {
    "nodeUuid": "YOUR_NODE_UUID",
    "url": "db://assets/prefabs/Enemy.prefab"
  }
}
```

## 使用上的注意点

- `stdio` MCP server 依赖正在运行的 Creator bridge，所以 Creator 不能关。
- `dist/mcp-server.js` 本身不直接操作工程文件，它只是把请求转发给当前打开的编辑器。
- 浏览器预览通常是更稳的自动化路径。
- GameView 的开始/暂停/单步/停止已经做了增强重试，但 Creator UI 状态仍可能影响时序。
- 构建工具触发的是真实 Creator 构建任务，不只是打开构建面板。
- 资源路径尽量传 `db://` URL。

## 排错

如果 Codex 或 Claude Code 不能正常调用：

1. 确认 Creator 正在打开 `E:\CocosWorkspace\Test33`
2. 确认 `cc-mcp` 已启用
3. 确认 `http://127.0.0.1:17321/health` 返回成功
4. 重新构建扩展：

```powershell
cd E:\CocosWorkspace\Test33\extensions\cc-mcp
npm run build
```

5. 刷新或重启 Creator
6. 如果客户端仍指向旧路径，重新执行一次 `codex mcp add ...` 或 `claude mcp add ...`
