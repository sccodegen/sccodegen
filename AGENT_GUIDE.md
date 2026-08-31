# ScCodeGen 智能体文档（重写版）

## 概述

ScCodeGen 智能体是一个运行在 Scratch 编辑器（scratch.mit.edu）里的 AI 编程智能体。
它通过虚拟文件系统（VFS）管理 Scratch 作品：每个角色一个目录，角色的积木脚本用
JS-like 的 Scratch DSL 写在 `code.js` 里；智能体把 DSL 编译成 Scratch 积木，
经用户确认后应用到页面上的 Scratch VM（`unsafeWindow.vm`）。

AI 后端使用 puter.js 匿名模式：无需任何配置与密钥，自动选择免费模型，
请求速度控制在 10 RPM 以内以避免触发限速。

## 架构

```
用户需求
   ↓
ScratchAgent（puter 匿名 AI，≤10 RPM，自动免费模型）
   ↓  工具调用循环
┌────────────────────────────────────────────┐
│ read(path)     读取/列出虚拟文件系统        │
│ write(path, content)  写入文件（自动建目录）│
│ edit(path, oldText, newText)  文本替换      │
│ commit(message) 全量编译 → 确认 → 应用 VM   │
└────────────────────────────────────────────┘
   ↓
VFS（/<角色id>/code.js、costumes/、sounds/，localStorage 持久化）
   ↓
应用到 Scratch VM：vm.runtime.targets 解析 id → vm.setEditingTarget →
   vm.editingTarget.blocks.createBlock（角色不存在自动创建）
   ↓
修改前/修改后快照切换 + 差异摘要
```

另提供 `buildUserScript()`：把作品编译成可安装的用户脚本
（单文件形态 + 源码/esbuild 配置形态，带头部，构建工具可选用 esbuild/tsup/vite）。

## 核心组件

### 1. Agent 基类（`src/agent/base/index.js`）

环境无关的通用工具调用智能体：

```javascript
import { Agent } from 'sccodegen';

const agent = new Agent({ ai, systemPrompt: '...' });
agent.addTool('name', '描述', { type: 'object', properties: {...}, required: [...] }, async (args) => {...});
const reply = await agent.run('用户需求');
```

- `addTool(name, description, parameters, fn)` 注册工具
- `run(initialMessage)` 工具调用主循环（直到 AI 不再调用工具）
- 消息与工具均为 OpenAI 风格，兼容 puter.ai.chat

### 2. PuterAI（`src/agent/utils/puter.js`）

puter.js 匿名模式 AI 调用层：

- **匿名模式**：不传 `authToken` 时直接使用全局 `puter`（用户脚本头部
  `@require https://js.puter.com/v2/` 引入），不调用 `setAuthToken`；
- **自动免费模型**：`puter.ai.listModels()` 拉取模型表，优先选 `cost` 为 0 的
  免费模型（偏好顺序见 `FREE_MODEL_PREFERENCE`），失败回退 `gpt-5-nano`；
- **速度控制 ≤10 RPM**：默认 `minIntervalMs = 6000`，两次请求间隔至少 6 秒；
  命中 429 限速时退避 30 秒重试（最多 3 次）。

```javascript
const ai = new PuterAI();                       // 匿名 + 自动免费模型 + 10 RPM
const msg = await ai.chat([{ role: 'user', content: 'hi' }], { tools });
```

### 3. VFS（`src/agent/core/vfs.js`）

虚拟文件系统，约定结构（**名字固定，不可改**）：

```
/<角色id>/code.js          角色的积木脚本（JS-like Scratch DSL）
/<角色id>/costumes/*       角色素材
/<角色id>/sounds/*         角色声音
```

- 根目录下一级目录 = 角色，目录名 = 角色 id（如 `Sprite1`、`player`）；
- 角色目录内只允许 `code.js`、`costumes/`、`sounds/`，写其他路径会报错；
- 可选 localStorage 持久化（`persistKey`），刷新后自动恢复；
- `sprites()` 返回角色列表，`tree()/restore()` 导出/恢复整棵树。

### 4. ScratchAgent（`src/agent/core/index.js`）

四个工具（LLM 可调用）：

#### a) `read(path)`
读取文件内容或列出目录。

#### b) `write(path, content)`
写入文件，自动创建目录。角色代码必须写到 `/<角色id>/code.js`。

#### c) `edit(path, oldText, newText)`
文本替换。`oldText` 需与文件内容完全一致；未命中返回错误，多匹配只替换第一处
并返回匹配次数。

#### d) `commit(message)`
完整流程：
1. **全量编译**每个角色的 `code.js`（DSL → 积木堆栈）；
2. 编译失败 → 返回**错误信息和位置**（角色、文件、行号、列号）；
3. 编译成功 → 检查 `unsafeWindow.vm`，**不存在则直接结束运行**；
4. 展示汇总（每个角色 N 个脚本 / M 个积木），**等待用户确认**；
5. 确认后应用：`vm.runtime.targets` 解析角色 id → `vm.setEditingTarget(targetId)`
   → 遍历积木列表调用 `vm.editingTarget.blocks.createBlock(block)`；
   角色不存在则**自动创建**（优先复制现有角色，兜底用舞台素材构造）；
6. 应用前后各拍一份该角色 blocks 快照，返回**差异摘要**
   （新增/删除/修改的积木数与 opcode 列表）。

#### 版本切换

`commit` 成功后可用以下方法切换"修改前/修改后"对比：

```javascript
agent.getHistory();                          // 提交历史（含差异摘要）
agent.switchVersion(historyId, 'before');    // 切到修改前
agent.switchVersion(historyId, 'after');     // 切到修改后
```

切换通过清空并 `createBlock` 恢复快照实现，只影响被提交的角色。

#### 编译为用户脚本

```javascript
const built = await agent.buildUserScript();   // 未指定工具时会列出优缺点并询问
const built = await agent.buildUserScript({ bundler: 'esbuild' });
// built.singleFile  —— 单文件用户脚本（头部 + 内联编译结果 + 自动应用运行时）
// built.sources    —— 入口源码 + 所选构建工具配置 + 构建说明
```

仓库构建命令：`npm run build:userscript`（esbuild 打包 `src/userscript/main.js`
→ `dist/scodegen.user.js`，带 Tampermonkey 头部）。

## 使用示例

```javascript
import { ScratchAgent, VFS } from 'sccodegen';

const vfs = new VFS();
vfs.write('/Sprite1/code.js', `
new event.whenflagclicked(() => {
    control.forever(() => {
        motion.movesteps(math_number(10));
        motion.turnright(math_number(15));
    });
});
`);

const agent = new ScratchAgent({
    vfs,
    // vm: unsafeWindow.vm，浏览器用户脚本环境自动获取
    confirmApply: async (summary) => window.confirm(summary),
});

const result = await agent.commit('小猫转圈');
console.log(result.diffText);
```

完整示例见 `examples/agent-demo.js` 与 `examples/complete-integration.js`。

## DSL 语法要点

1. 每个脚本以 hat 积木开头：`new event.whenflagclicked(() => {...})`；
2. **hat 的字段参数直接传字符串**（按键名、广播名、背景名等）：
   `new event.whenkeypressed("w", ...)`、`new event.whenbroadcastreceived("start", ...)`；
   不要用 `text()` 包 hat 参数（`text()/math_number()` 只能在活动栈内使用）；
3. 子栈用回调：`control.forever(() => {...})`、`control.repeat(math_number(10), ...)`；
4. 数字 `math_number(10)`、文本 `text("...")`；
5. 条件：`operators.operator_gt(a, b)`、`sensing.touchingobject("_edge_")`、
   `sensing.keypressed(text("w"))`；
6. reporter 可嵌套：`looks.say(operators.operator_join("x=", motion.xposition()))`；
7. 命令积木只能在 hat 或子栈回调里调用。

## 测试

```bash
npm test
```

覆盖：DSL 编译（原有）、PuterAI（匿名/免费模型/限速/429 退避/工具循环）、
四工具（VFS 读写编辑/约束/持久化）、commit 全流程（编译错误定位/确认/应用/
自动创建角色/版本切换/VM 缺失中止）、buildUserScript。

## 构建用户脚本

```bash
npm run build:userscript    # → dist/scodegen.user.js
```

产物安装到 Tampermonkey 后，打开 https://scratch.mit.edu/projects/ 任意作品页，
右下角出现 ScCodeGen 面板：描述需求 → AI 智能体读写 VFS 并 commit → 积木应用到作品。

## 环境与配置

- 无配置即用：puter.js 匿名模式（`@require https://js.puter.com/v2/`）；
- `config.model` 可指定模型；`config.minIntervalMs` 调整限速（默认 6000ms）；
- `config.persistKey` 自定义 VFS 持久化键；`config.storage` 注入 storage；
- `config.confirmApply` 注入确认回调；`config.askUser` 注入构建工具选择回调；
- 测试/嵌入场景用 `config.vm` 显式注入 Scratch VM；`config.puter` 注入 puter。

## 错误处理

- commit 编译失败：`{ success:false, errors:[{sprite, file, line, column, error}], errorText }`；
- VM 不存在：`{ success:false, aborted:true, error:'Scratch VM 不存在…' }`；
- 用户取消：`{ success:false, cancelled:true }`；
- 应用失败：`{ success:false, error:'应用角色 X 失败：…' }`。

## 许可证

Apache-2.0
