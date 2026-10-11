# RuoYi 对接（基础交互版）

本版本负责 RuoYi 登录用户打开 Pi Web、收发消息、恢复自己的会话，以及调用当前用户有权限的只读业务查询工具。不包含模型权限或数字人联动限制。

## 业务查询工具

主会话固定使用只读文件工具，同时会从 RuoYi `GET /agent/v1/business-tools` 获取当前用户可用的业务工具目录，并将每项注册为 `system_business_<工具名>`。模型调用时会将原始问题提交至 `POST /agent/v1/business-tools/execute`；Pi Web 不配置也不回退到服务账号，调用只携带当前请求已验证的 RuoYi 用户令牌。

因此，业务工具是否可见、是否可执行、能查询哪些数据，最终都由 RuoYi 的 `agent:chat:use`、具体业务权限及数据范围校验决定。业务查询会话至少还需授予 `agent:read`，以启用主会话的只读工具和业务工具扩展。Pi Web 只过滤不合法的工具目录项，并把令牌保留在运行内存，不写入会话 JSONL 或发送给浏览器。

## Agent 工具授权

在“角色管理 → 工作台”按工具单独授予权限：`agent:tool:read`、`grep`、`find`、`ls`、`edit`、`write`、`bash`，以及业务工具 `agent:business:use`、子 Agent 的启动/结果/引导三项权限。未获得任何 Agent 工具权限的用户仅能聊天。

Pi Web 设置按页面分别使用 `agent:settings:general`、`agent:settings:models`、`agent:settings:skills`、`agent:settings:subagents`、`agent:settings:plugins`、`agent:settings:mcp`。没有对应权限时页签不会显示，且服务端会拒绝该页面的设置 API；`agent:settings:subagents` 只控制子代理配置的新增、编辑、启停，不替代运行时的子 Agent 工具权限。

Pi Web 每次创建、恢复会话、连接 SSE 和提交消息都会重新取得当前用户的工具白名单并在服务端强制应用；前端隐藏或勾选状态不是安全边界。Web 终端与 `bash` 都是任意命令执行能力：只有 `agent:tool:bash` 才显示终端入口，终端的创建、重连、输入、调整大小、关闭和事件流接口也都会再次校验该权限。不要把它授予不可信角色，也不要以“命令黑名单拦截删除”替代角色授权。

## 本地开发

项目的 `.env.local` 已按当前本机 RuoYi 配置填写：

```env
RUOYI_API_BASE_URL=http://127.0.0.1:8002
NEXT_PUBLIC_RUOYI_EMBED_ORIGIN=http://localhost:3006,http://127.0.0.1:3006
```

修改环境变量后必须重启 `npm run dev`。RuoYi 开发服务器会将 `/qimiao-web` 代理至 Pi Web 的 `30141` 端口；直接从 RuoYi 打开“小锡Agent”即可完成 iframe 令牌握手。

## 生产部署

RuoYi 当前生产地址使用 `/xi-web`，Pi Web 必须以同一子路径构建：

```env
PI_WEB_BASE_PATH=/xi-web
RUOYI_API_BASE_URL=http://127.0.0.1:8002
NEXT_PUBLIC_RUOYI_EMBED_ORIGIN=https://你的-ruoyi-域名
```

`PI_WEB_BASE_PATH` 和 `NEXT_PUBLIC_RUOYI_EMBED_ORIGIN` 是构建时变量。RuoYi 的 `VITE_QIMIAO_WEB_URL`、反向代理路径和 `PI_WEB_BASE_PATH` 必须都使用 `/xi-web`。反向代理应保留此前缀转发给 Pi Web，不能在 `proxy_pass` 中将其剥掉。

## 隔离规则

- Pi Web 以 RuoYi `/getInfo` 返回的 `userId` 确认身份，不信任浏览器传入的用户 ID 或工作目录。
- 每位用户只使用 `pi-web/pi-cwd-<安全用户标识>-<24位哈希>` 工作目录。
- RuoYi 模式不显示工作目录选择器、“使用默认目录”、“自定义路径”和“打开其他项目”入口；该限制由 `RUOYI_API_BASE_URL` 是否配置决定，不依赖 iframe URL。
- 会话列表、搜索、运行状态，以及按会话 ID 的读写、SSE、导出和媒体加载都检查该工作目录；跨用户会话返回 404。
- 侧边栏的置顶、归档和项目显示偏好会按 RuoYi 用户分别保存在 Pi Agent 数据目录，绝不与其他用户共享。
