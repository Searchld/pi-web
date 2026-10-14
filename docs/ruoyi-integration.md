# RuoYi 对接与二开维护

> 若需要了解从登录、会话隔离、实时权限到业务工具调用的完整原理，请先阅读 [RuoYi → Pi Web 集成：流程、权限与工具说明](./ruoyi-pi-web-architecture.md)。本文保留部署与界面集成细节。

本版本负责 RuoYi 登录用户打开 Pi Web、收发消息、恢复自己的会话，以及调用当前用户有权限的业务查询工具；模型、数字人和窗口联动的约束见后文对应章节。

## 业务查询工具

主会话按 RuoYi 实时策略启用文件工具，同时会从 RuoYi `GET /agent/v1/business-tools` 获取当前用户可用的业务工具目录，并将每项注册为 `system_business_<工具名>`。模型调用时会将原始问题提交至 `POST /agent/v1/business-tools/execute`；Pi Web 不配置也不回退到服务账号，调用只携带当前请求已验证的 RuoYi 用户令牌。

RuoYi 受控会话不加载宿主机、用户或项目提示词文件。默认由 Pi Web 注入“小锡业务助手”规则：遇到需要业务数据的提问，模型必须从当前已授权的 `system_business_*` 工具中选择并调用，再依据返回结果作答。这样不会出现模型只回复“我来查询”便正常结束的假完成；规则不影响 Pi Web 非 RuoYi 模式。拥有“常规”设置权限的用户可在“设置 → 常规 → 业务提示词”编辑这段文本，或关闭开关以使用 Pi Web 默认提示词；该偏好按已验证的 RuoYi 用户单独保存于 Pi 配置目录，下一条消息生效，且不会改变 RuoYi 下发的工具白名单、工作区隔离或第三方扩展限制。注意：当前运行时并不存在名为“查找业务工具”或“执行业务查询”的通用工具，实际能力由上述按用户权限动态注册的工具提供。

RuoYi 嵌入态仍使用 Pi Web 常规设置中的界面/等宽字体、聊天字号与聊天内容宽度；`ChatWindow` 会直接订阅字号和宽度偏好并应用到消息区，避免 iframe 或开发热更新下仅根 CSS 变量更新而可见消息区未重绘。消息的输入、输出、缓存读取/写入用量标签也通过 Pi Web 现有本地化词条显示。

因此，业务工具是否可见、是否可执行、能查询哪些数据，最终都由 RuoYi 的 `agent:chat:use`、`agent:business:use`、具体业务权限及数据范围校验决定。`agent:tool:read` 只决定是否额外启用 Pi Web 的文件读取工具，并不是加载业务查询工具的前提。Pi Web 只过滤不合法的工具目录项，并把令牌保留在运行内存，不写入会话 JSONL 或发送给浏览器。

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

修改环境变量后必须重启 `npm run dev`。本地 RuoYi 直接嵌入 Pi Web 的 `30141` 端口；直接从 RuoYi 打开“小锡Agent”即可完成 iframe 令牌握手。`/qimiao-web` 旧开发代理已移除，生产环境统一使用 `/xi-web`。

## 生产部署

RuoYi 当前生产地址使用 `/xi-web`，Pi Web 必须以同一子路径构建：

```env
PI_WEB_BASE_PATH=/xi-web
RUOYI_API_BASE_URL=http://127.0.0.1:8002
NEXT_PUBLIC_RUOYI_EMBED_ORIGIN=https://你的-ruoyi-域名
```

`PI_WEB_BASE_PATH` 和 `NEXT_PUBLIC_RUOYI_EMBED_ORIGIN` 是构建时变量。RuoYi 的 `VITE_QIMIAO_WEB_URL`、反向代理路径和 `PI_WEB_BASE_PATH` 必须都使用 `/xi-web`。反向代理应保留此前缀转发给 Pi Web，不能在 `proxy_pass` 中将其剥掉。

文件下载和文档预览（包括 XLSX）也必须通过 `withAppBasePath()` 生成地址。首屏的 `fetch` 补丁无法覆盖 iframe 的页面导航；若预览地址仍是根路径 `/api/files/...`，部署在 `/xi-web` 下时会绕过该子路径，导致预览 iframe 加载失败。

本地 RuoYi 内嵌 Pi Web 时，XLSX/DOCX 预览是第二层 iframe；其预览响应的 CSP 必须把 `NEXT_PUBLIC_RUOYI_EMBED_ORIGIN` 中配置的精确本地来源加入 `frame-ancestors`。否则工作簿已在服务端解析成功，浏览器仍会显示“localhost 拒绝了我们的连接请求”。不要用 `*` 放宽该限制。

Nginx 应同时保留精确路径和子路径代理，`proxy_pass` 后面不能加 `/`，否则 `/xi-web` 会被剥离，导致 Next.js 的 `basePath` 与实际请求不一致。不要把 `/xi-web` 重定向到 `/xi-web/`，否则会与 Next.js 的规范路径发生循环跳转。

```nginx
location = /xi-web {
    client_max_body_size 5000m;
    proxy_pass http://127.0.0.1:30141;
    proxy_http_version 1.1;

    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}

location ^~ /xi-web/ {
    client_max_body_size 5000m;
    proxy_pass http://127.0.0.1:30141;
    proxy_http_version 1.1;

    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

## 隔离规则

- Pi Web 以 RuoYi `/getInfo` 返回的 `userId` 确认身份，不信任浏览器传入的用户 ID 或工作目录。
- 每位用户只使用 `pi-web/pi-cwd-<安全用户标识>-<24位哈希>` 工作目录。
- RuoYi 模式不显示工作目录选择器、“使用默认目录”、“自定义路径”和“打开其他项目”入口；该限制由 `RUOYI_API_BASE_URL` 是否配置决定，不依赖 iframe URL。
- 会话列表、搜索、运行状态，以及按会话 ID 的读写、SSE、导出和媒体加载都检查该工作目录；跨用户会话返回 404。
- 侧边栏的置顶、归档和项目显示偏好会按 RuoYi 用户分别保存在 Pi Agent 数据目录，绝不与其他用户共享。

## 二开 UI 基线与上游升级

以下是当前生产界面的约定。升级 Pi Web 时，先以此清单逐项比对；不要直接用上游同名文件覆盖。

### 参考来源

- 本机历史实现位于 `/Users/mac/Desktop/pi-web`，仅作为视觉和交互比对基准，不是运行时依赖。
- 当前维护目录是 `/Users/mac/Desktop/gitproject/pi-web`。后续上游升级应在独立升级分支或工作目录完成合并、验证后，再合入 `main`。

### RuoYi 嵌入态

- `components/AppShell.tsx` 通过 `isRuoyiIntegration` 进入嵌入态；不要仅靠 `?embedded=1` 判断功能开关，后者只负责 iframe 令牌握手。
- RuoYi 受控工作区校验期间只展示“正在验证当前账号…”，不展示普通 Pi Web 的“正在打开工作区”文案或内部工作区路径；普通 Pi Web 仍保留原有诊断信息。
- RuoYi 的 `qimiao-web-launcher` 是 Pi Web iframe 的窗口宿主。嵌入态下，左侧 `Web Agent` 工具栏、中间聊天工具栏和数字人顶部的任意位置都作为窗口标题栏：移动超过 4px 才会进入拖动并通过受 `NEXT_PUBLIC_RUOYI_EMBED_ORIGIN` 限制的 `postMessage` 让宿主移动弹窗，因此工具栏按钮的普通单击保持自身功能；双击会切换宿主弹窗全屏。双击在 iframe 文档的原生捕获阶段监听，并以双击坐标重新命中顶栏：拖动的 pointer capture 会重定向 `event.target`，不能据此判断双击位置。Pi Web 会从已校验的认证消息记住父页实际来源（首次可使用同样经过白名单验证的 referrer），后续只向该来源发送消息；即使本地白名单同时含 `localhost` 与 `127.0.0.1`，也不会向错误来源额外发送。窗口控制以“存在受信任父窗口”为准，不依赖 `?embedded=1`；该参数只负责 iframe 令牌握手。单击工具栏按钮仍保留本身功能。不要在 Pi Web 内伪造“内容区全屏”，也不要放宽为向任意来源发送窗口控制消息。
- RuoYi 嵌入态的侧栏品牌显示为 `Web Agent`；普通 Pi Web 仍显示 `Pi Web`，并保留版本彩蛋。
- RuoYi 嵌入态的“新建”复用 Pi Web 原有工具栏分隔单元格样式，不使用独立的蓝色描边按钮；新建会话的功能与权限逻辑不变。
- `components/ChatWindow.tsx` 的 `businessMode` 只在 RuoYi 嵌入态启用。空会话展示 `BusinessIdleDemo` 和三条业务快捷提问；欢迎区不显示 Logo。普通 Pi Web 仍保留原有 Pi Web 标题、版本信息和工作区选择。
- `components/BusinessIdleDemo.tsx` 是纯前端动画，不读取或请求任何业务数据。快捷提问通过 `ChatInputHandle.replaceText()` 写入并聚焦输入框。
- 中文、英文和繁体中文文案必须同时维护在 `lib/i18n/messages/{zh-CN,en,zh-TW}.ts`，键名以 `chat.business` 开头。

### 视觉层级

- RuoYi 外壳使用 `.qm-art-shell`：浅色主题的页面画布色固定为 `#f5f7fa`；其他主题从 `--bg-panel` 与 `--bg` 混合得到对应深浅色，不要把浅色值硬编码到其他主题选择器。
- 顶部工具栏 `.qm-art-topbar` 与左侧栏 `.qm-art-sidebar-panel` 均使用 `--bg` 白底，和旧版 Pi Web 对齐；RuoYi 顶栏的同组图标不使用内部 1px 分隔线，改以留白和激活态区分。浅灰画布色不能渗入会话列表或文件区。这两个类必须由 `AppShell` 的实际 DOM 节点持有；只添加 CSS 规则不会生效。
- 会话区右侧的 `ChatMinimap` 也属于 RuoYi 业务画布；嵌入态通过 `lightSurface` 使用 `--bg` 白底，并沿用旧版由主题色与底色混合而成的节点/描边，不能直接沿用普通 Pi Web 的 `--bg-panel` 和新版固定灰色节点。
- RuoYi 左侧栏通过 `SessionSidebar` 的 `.is-ruoyi-embedded` 和 `SessionTree` 的 `.is-roomy` 使用旧版业务会话卡片：会话行 `60px`（内部内容 `56px`）、标题一行、时间与消息数第二行。选中与悬停的底色必须落在整行上，以包含归档和菜单操作；不使用左侧蓝线。RuoYi 会话已由服务端限制在当前用户的固定工作区，因此嵌入态隐藏该工作区的项目标题，并强制展开其会话，不能让本地保存的折叠偏好造成会话不可见；会话列表顶部保留 `8px` 留白，不让首张卡片贴住工具栏。项目归属、会话选择、归档和右键菜单仍由原会话树管理，不能为样式重写数据模型。普通 Pi Web 继续使用紧凑行高；虚拟列表高度必须同步由 `RUOYI_SIDEBAR_ROW_HEIGHTS` 计算，不能只用 CSS 拉高行。
- Pi Web 默认采用等宽字体；RuoYi 左侧栏是业务导航，`.is-ruoyi-embedded` 及其按钮、输入框必须改用 `--font-ui`。左上角 `Web Agent` 品牌例外地固定为 `700` 字重、但仍使用界面字体；代码、路径和普通 Pi Web 不在此规则范围内。
- 已进入会话后的 RuoYi 消息区皮肤单独放在 `app/ruoyi-chat.css`，仅由 `.qm-art-shell .qm-ruoyi-chat` 限定。它只能为 0.12 既有消息 DOM 添加背景、间距、卡片层级与过程详情的视觉样式；不得改动消息分组、流式渲染、历史分页、编辑、附件或子 Agent 逻辑。需要完整回退时删除该文件并移除 `app/globals.css` 的导入，再删除 `ChatWindow` 的三个纯 class 标记和 `MessageView` 的用户角色 data 属性。
- RuoYi 左侧栏的会话搜索展开按钮、搜索框边框和焦点态共用 `--qm-art-active-background` / `--qm-art-active-color` 浅蓝体系；移除普通 Pi Web 搜索按钮的深色顶线，并将默认的 `2px` 焦点描边降为浅色 `1px` 描边与低透明度光晕。
- 普通输入框（非 compact）由 `.chat-composer-surface` 包住文本区与底部工具栏，包含焦点流光边框。内部保持 `.chat-composer-card` 与 `.chat-composer-controls`，不要把底部工具栏移回面板外，否则边框和流光会断开。
- 输入面板的非交互空白区域必须可点击并聚焦文本框；发送、附件、模型和其他工具按钮保留各自点击行为。桌面端单行输入框最小高度为 `44px`，避免视觉容器很大但只能精确点击文字行的问题。
- 所有新增动画都需要保留 `prefers-reduced-motion` 降级规则。

### 原生数字人面板

- RuoYi 嵌入态的数字人由 `components/DigitalHumanPanel.tsx` 作为 Pi Web 独立右侧栏渲染；它不占用文件面板的标签或开关。文件面板仍由原有按钮独立打开。
- 数字人栏右上角的数字人图标仅隐藏该侧栏，避免被误解为关闭整个聊天窗口；面板展开时不显示顶部重复入口，隐藏后才在顶部最右侧显示同一图标以恢复面板。
- 数字人栏顶部必须复用 Pi 的工具栏视觉规格：`--bg` 白底、`36px + safe-area` 高度和同一条底部分隔线；不要以数字人内容区或底部状态栏的背景色替代顶部工具栏。
- 数字人内容区和状态栏同样使用 `--bg`，避免与 Pi 画布出现不连续的浅灰色块；隐藏 RuoYi 旧数字人后，RuoYi 启动容器必须让 Pi iframe 独占宽度，不能保留旧侧栏的空白。
- 数字人媒体页当前按约 `304px` 画布宽度绘制，因此独立侧栏固定为 `304px`；不要随意改为更宽的响应式栏位，否则会露出媒体页右侧白底。
- RuoYi 嵌入态展开文件面板时，其顶部标签工具栏使用 `--bg` 白底，与主工具栏和数字人栏一致；普通 Pi Web 仍使用原本的 `--bg-panel`。
- RuoYi 嵌入态中，文件面板右上角的关闭按钮使用 `×`，避免与顶部“打开文件面板”的分栏图标混淆；普通 Pi Web 保留原图标。
- RuoYi 嵌入态所有可切换工具栏图标的激活态统一为 `#ecf5ff` 浅蓝底和 `#409eff` 图标色，普通 Pi Web 仍使用原主题选中态。
- Pi Web 只承担形象 iframe、浏览器音频、字幕和回复流分句；RuoYi 仍是用户偏好与数字人服务的来源。`GET /api/ruoyi-digital-human` 通过当前 Pi Web HttpOnly RuoYi 会话读取 `/system/user-ui`，不会把 RuoYi 令牌暴露给浏览器。
- 数字人面板必须先取得当前用户的形象偏好再挂载媒体 iframe，不能先渲染默认 `assets1` 再替换，避免出现形象闪换；接口不可用时才一次性回退默认形象。
- 形象 iframe 默认使用 `https://live.beta.kim/static/GuideLive.html`，TTS 默认使用同源 `/guide_speech`；如生产环境地址不同，构建时设置 `NEXT_PUBLIC_DH_LIVE_URL` 与 `NEXT_PUBLIC_XIAOXI_TTS_ENDPOINT`。这两个地址属于公开的数字人媒体服务，不能替换为携带 RuoYi 登录令牌的浏览器直连接口。
- 回答流只将助手正文的 `text_start` / `text_delta` / 完成事件交给数字人；推理内容、工具参数和工具结果不会被播报。中断回答时停止队列，不补播未结束文本。
- 数字人字幕以正在播放的 TTS 音频时长为进度逐字显示：音频实际开始后气泡淡入，暂停时停止推进、恢复后按当前位置继续；不能在音频请求完成时一次性写入整句字幕和气泡。`prefers-reduced-motion` 下保留逐字内容但取消气泡入场动画。
- RuoYi 的 `qimiao-web-launcher` 完成切换后应移除旧的 `ArtBotDigitalHuman` 侧栏和对应 `qimiao-agent-response-*` 转发，避免同一回答被两个数字人实例重复播报。系统讲解、文字宠物和跳转 RuoYi 设置仍留在 RuoYi 工作台，不在 Pi Web 中伪造跨应用控制。

### 升级时的最小验证

1. 在普通 Pi Web 与 RuoYi iframe 各新建一个会话：前者显示标准欢迎头与工作区选择；后者显示无 Logo 的业务欢迎页和业务快捷提问。
2. 验证顶部工具栏和 RuoYi 左侧栏均为白底，以及深色主题下没有遗留浅色硬编码。
3. 验证输入框、底部工具栏和焦点流光仍属于同一个外框；窄屏与“减少动态效果”设置也要检查。
4. 在 RuoYi iframe 中验证独立“业务助手”侧栏默认打开：形象加载、语音开关、暂停/继续、流式分句播报和中断后停止均正常；再单独打开和关闭文件面板，确认二者互不替换且不会创建第二个数字人实例。
5. 运行 `node_modules/.bin/tsc --noEmit`、`npm run lint`、`node --test components/ChatInput.test.mjs components/ChatWindow.lazy-load.test.mjs`。本地开发只运行 `npm run dev`；不要在开发服务器运行时执行 `npm run build`。
