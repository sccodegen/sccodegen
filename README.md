# ScCodeGen (SCG)

在 Scratch 编辑器中用 AI 智能体生成并应用积木。

- 虚拟文件系统（VFS）管理作品：`/<角色id>/code.js` 写 JS-like Scratch DSL，
  素材放 `/<角色id>/costumes/` 与 `/<角色id>/sounds/`
- AI 后端：puter.js 匿名模式（零配置、自动免费模型、≤10 RPM）
- 四个工具：`read` / `write` / `edit` / `commit`（全量编译 → 用户确认 → 应用到
  `unsafeWindow.vm`，角色不存在自动创建，支持修改前/后版本切换对比）
- 可编译为带 Tampermonkey 头部的用户脚本（esbuild 构建）

## 安装

```bash
npm install sccodegen --save
```

## 使用示例

### JS-like Scratch DSL

```js
import { compiler } from 'sccodegen';
const code = `
new event.whenflagclicked(() => {
    control.forever(() => {
        control.if(sensing.keypressed(text("W")), () => {
            motion.changeyby(math_number(5));
        });
    });
});
`;
const stacks = compiler(code);
console.log(stacks[0].blocks);
```

### 智能体（VFS + commit 应用到 Scratch）

```js
import { ScratchAgent, VFS } from 'sccodegen';

const vfs = new VFS();
vfs.write('/Sprite1/code.js', `
new event.whenflagclicked(() => {
    motion.movesteps(math_number(100));
    motion.turnright(math_number(90));
});
`);

const agent = new ScratchAgent({
    vfs,
    confirmApply: async (summary) => window.confirm(summary), // 编译成功后确认
});

const result = await agent.commit('正方形的一边');
console.log(result.diffText);        // 修改前后积木差异
agent.switchVersion(0, 'before');    // 切到修改前
agent.switchVersion(0, 'after');     // 切回修改后
```

### 编译为用户脚本

```bash
npm run build:userscript   # → dist/scodegen.user.js（安装到 Tampermonkey）
```

或由智能体生成：

```js
const built = await agent.buildUserScript({ bundler: 'esbuild' });
// built.singleFile：单文件用户脚本（可直接安装）
// built.sources：  入口源码 + esbuild 配置 + 构建说明
```

## 目录结构

```
src/
    dsl/                        // JS-like Scratch DSL 编译器
        blocksStack/            // 积木段
        scratchblocks/          // 生成 Scratch 积木（浏览器兼容：静态 JSON 导入）
        compiler.js             // DSL → 积木堆栈
    agent/
        base/index.js           // 通用工具调用智能体基类
        core/
            index.js            // ScratchAgent：read/write/edit/commit 四工具
            vfs.js              // 虚拟文件系统（localStorage 持久化）
            compile.js          // 逐角色编译 + 错误定位
            apply.js            // 应用到 Scratch VM（setEditingTarget/createBlock/自动建角色）
            diff.js             // 修改前后积木差异
            userscript.js       // 编译为用户脚本（头部/单文件/构建配置）
        utils/puter.js          // puter 匿名 AI（自动免费模型、≤10 RPM）
    userscript/main.js          // 完整智能体用户脚本入口（esbuild 打包）
scripts/build-userscript.mjs    // 构建用户脚本（esbuild）
```

## 测试与构建

```bash
npm test                 # DSL + PuterAI + 四工具 + commit 全流程
npm run build:userscript # 生成 dist/scodegen.user.js
```

详细文档见 [AGENT_GUIDE.md](AGENT_GUIDE.md)，示例见 `examples/`。
