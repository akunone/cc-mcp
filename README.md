# cc-mvp

`cc-mvp` is a Cocos Creator 3.8 editor extension that exposes scene, node, component, prefab, preview, build, asset, and debug operations as MCP tools.

It is designed for AI clients such as Codex and Claude Code:

- Cocos Creator keeps the real editor state and executes the actual operations.
- `cc-mvp` starts a local HTTP bridge at `http://127.0.0.1:17321`.
- `dist/mcp-server.js` is a stdio MCP adapter that forwards MCP tool calls to that local bridge.

## What it provides

Main capability groups:

- Scene tools: get current scene, list scenes, open scene, save scene, create scene, inspect hierarchy
- Node tools: create, read, find, move, duplicate, delete, update transforms and active state
- Component tools: add, remove, inspect, set properties, mount custom script components
- Prefab tools: list, inspect, open, instantiate, create, export scene nodes to real prefab assets
- Preview tools: browser preview, GameView start/pause/step/stop
- Build tools: query platforms/tasks, trigger real Creator builds, AI-friendly build helpers
- Asset/debug/environment tools: asset CRUD, logs, scene JS execution, stats, validation, preferences, server info

AI-oriented high-level tools include:

- `ai_preview_browser_with_scene`
- `ai_build_web_desktop_default`
- `ai_build_web_mobile_default`
- `ai_build_web_mobile_and_wait`
- `ai_export_selected_nodes_to_prefabs`
- `ai_export_nodes_by_name_to_prefabs`

## Architecture

- `source/main.ts`: extension main process, HTTP bridge, MCP-style JSON-RPC routing, project/build/asset/log tools
- `source/scene.ts`: scene script for real scene/node/component/prefab/GameView operations
- `source/mcp-server.ts`: stdio MCP server that forwards to `http://127.0.0.1:17321`

## Install

Place the extension in your project:

```text
YourProject/
├─ assets/
├─ extensions/
│  └─ cc-mvp/
│     ├─ source/
│     ├─ dist/
│     ├─ package.json
│     └─ ...
└─ ...
```

Install and build:

```powershell
cd E:\CocosWorkspace\Test33\extensions\cc-mvp
npm install
npm run build
```

Then in Cocos Creator:

1. Open the project.
2. Enable or refresh the `cc-mvp` extension.
3. Keep Creator open while your AI client uses MCP.

## Verify the bridge

After the extension loads, the bridge should be available at:

```text
http://127.0.0.1:17321
```

Quick health check:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:17321/health"
```

Expected result:

- HTTP 200
- JSON containing the extension name, version, and project path

## MCP endpoints

`cc-mvp` exposes three practical entry points:

1. Stdio MCP server

```powershell
node E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js
```

2. HTTP JSON-RPC MCP endpoint

```text
POST http://127.0.0.1:17321/mcp
```

3. Simplified HTTP tool endpoint

```text
POST http://127.0.0.1:17321/tool
```

Other useful routes:

- `GET /health`
- `GET /tools`
- `POST /message`
- `POST /crud`

## Use with Codex

Codex CLI and the Codex IDE extension share the same MCP configuration. OpenAI documents that MCP servers can be added either with `codex mcp add` or through `~/.codex/config.toml` / project `.codex/config.toml`. See the official docs: [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp) and [Advanced Configuration – Codex](https://developers.openai.com/codex/config-advanced).

### Option A: add from the CLI

Run this once:

```powershell
codex mcp add cc-mvp -- node E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js
```

Then verify inside Codex:

- Run `codex mcp --help` for MCP management commands
- Run `/mcp` inside the Codex TUI to see whether `cc-mvp` is connected

### Option B: add to `.codex/config.toml`

For this project, create or edit:

- `E:\CocosWorkspace\Test33\.codex\config.toml`

Example:

```toml
[mcp_servers.cc-mvp]
command = "node"
args = ["E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js"]
cwd = "E:/CocosWorkspace/Test33"
startup_timeout_sec = 20
tool_timeout_sec = 600
enabled = true
```

If you prefer user-wide setup, put the same block in:

- `~/.codex/config.toml`

### How to prompt Codex

Once the server is connected, you can ask Codex to call the tools naturally. Examples:

- `Use cc-mvp to get the current Cocos scene and summarize the node hierarchy.`
- `Open db://assets/scene.scene and start browser preview with cc-mvp.`
- `Export the currently selected nodes to db://assets/prefabs/selected using cc-mvp.`
- `Run a web-mobile build with cc-mvp and wait until it finishes.`

Typical tool sequence:

1. `scene_get_current_scene`
2. `scene_get_hierarchy`
3. `node_find_nodes_by_name` or `node_create_node`
4. `project_preview_start` or `ai_preview_browser_with_scene`
5. `project_build` or `ai_build_web_mobile_and_wait`

## Use with Claude Code

Anthropic documents local stdio MCP servers with `claude mcp add --transport stdio <name> -- <command> [args...]`. See the official docs: [Connect Claude Code to tools via MCP](https://docs.anthropic.com/en/docs/claude-code/mcp).

### Option A: local scope

This is the simplest setup and only affects your current project on your machine:

```powershell
claude mcp add --transport stdio cc-mvp -- node E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js
```

### Option B: project scope

If you want the MCP server config written into `.mcp.json` for the repo:

```powershell
claude mcp add --transport stdio cc-mvp --scope project -- node E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js
```

Anthropic currently distinguishes these scopes:

- `local`: stored in `~/.claude.json` for the current project only
- `project`: stored in repo `.mcp.json`, intended for team sharing
- `user`: stored in `~/.claude.json`, available across all projects

### Equivalent `.mcp.json` example

If you want to write the project config manually:

```json
{
  "mcpServers": {
    "cc-mvp": {
      "command": "node",
      "args": [
        "E:/CocosWorkspace/Test33/extensions/cc-mvp/dist/mcp-server.js"
      ],
      "env": {}
    }
  }
}
```

### Check server status

Useful Claude Code commands:

```powershell
claude mcp list
claude mcp get cc-mvp
```

Inside Claude Code:

```text
/mcp
```

### How to prompt Claude Code

Examples:

- `Use the cc-mvp MCP server to inspect the current Cocos scene.`
- `Use cc-mvp to open db://assets/scene.scene and launch browser preview.`
- `Use cc-mvp to export nodes named Enemy into db://assets/prefabs/enemies.`
- `Use cc-mvp to build web-mobile and wait for completion.`

## Direct HTTP usage

If you are building your own client, you can call the bridge directly.

### Simplified `/tool` call

```json
{
  "name": "scene_get_current_scene",
  "arguments": {}
}
```

PowerShell:

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

### MCP JSON-RPC call

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

## Recommended first tool calls

When connecting a new AI client, these are good first checks:

1. `scene_get_current_scene`
2. `scene_get_scene_list`
3. `scene_get_hierarchy`
4. `project_get_info`
5. `env_get_environment_info`

Then move on to real actions:

1. `ai_preview_browser_with_scene`
2. `prefab_export_node_to_prefab`
3. `ai_export_selected_nodes_to_prefabs`
4. `ai_build_web_mobile_and_wait`

## Practical examples

### Open a scene and preview in browser

Use the high-level helper:

```json
{
  "name": "ai_preview_browser_with_scene",
  "arguments": {
    "scene": "db://assets/scene.scene"
  }
}
```

### Trigger a web-mobile build and wait

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

### Export a scene node to a real prefab asset

```json
{
  "name": "prefab_export_node_to_prefab",
  "arguments": {
    "nodeUuid": "YOUR_NODE_UUID",
    "url": "db://assets/prefabs/Enemy.prefab"
  }
}
```

## Notes

- The stdio MCP server depends on the local Creator bridge, so Cocos Creator must stay open.
- `dist/mcp-server.js` does not operate on project files directly. It forwards requests to the running editor.
- Browser preview is usually the most stable path for automated preview flows.
- GameView controls are implemented and tested, but Creator UI state can still affect timing.
- Build tools trigger real Creator build tasks, not just panel navigation.
- Resource paths should use Creator `db://` URLs whenever possible.

## Troubleshooting

If Codex or Claude Code cannot use the tools:

1. Confirm Creator is open with `E:\CocosWorkspace\Test33`.
2. Confirm `cc-mvp` is enabled.
3. Confirm `http://127.0.0.1:17321/health` returns success.
4. Rebuild the extension:

```powershell
cd E:\CocosWorkspace\Test33\extensions\cc-mvp
npm run build
```

5. Refresh or restart Cocos Creator.
6. Re-run `codex mcp add ...` or `claude mcp add ...` if the client still points to an old path.
