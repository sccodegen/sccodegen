/**
 * ScratchAgent 使用示例（新架构）
 *
 * 演示：
 *  1. VFS：read/write/edit 操作虚拟文件系统（/<角色id>/code.js + costumes/ + sounds/）
 *  2. commit：全量编译每个角色的 code.js → 用户确认 → 应用到 Scratch VM
 *  3. 修改前/修改后版本切换与差异
 *  4. 编译为用户脚本（单文件 + esbuild 源码/配置）
 *
 * 运行：node examples/agent-demo.js
 * （不依赖真实网络；VM 用内存假实现演示应用流程。真实使用：用户脚本环境，
 *   unsafeWindow.vm 即 Scratch VM，AI 走 puter 匿名模式。）
 */

import { ScratchAgent, VFS } from "../src/index.js";

// ---------- 构造一个内存假 VM（演示应用流程） ----------
function makeFakeVm() {
    const targets = [];
    let seq = 1;
    const mk = (name, isStage = false) => {
        const t = {
            id: "target_" + seq++,
            name,
            blocks: { _blocks: {}, _scripts: [] },
        };
        t.blocks.getScripts = () => [...t.blocks._scripts];
        t.blocks.createBlock = (b) => {
            t.blocks._blocks[b.id] = JSON.parse(JSON.stringify(b));
            if (b.topLevel) t.blocks._scripts.push(b.id);
        };
        t.blocks.deleteBlock = (id) => {
            const b = t.blocks._blocks[id];
            if (!b) return;
            if (b.next !== null) t.blocks.deleteBlock(b.next);
            delete t.blocks._blocks[id];
            t.blocks._scripts = t.blocks._scripts.filter((s) => s !== id);
        };
        t.getName = () => t.name;
        t.isStage = () => isStage;
        t.isSprite = () => !isStage;
        targets.push(t);
        return t;
    };
    mk("Stage", true);
    mk("Sprite1");
    return {
        runtime: {
            targets,
            getTargetById: (id) => targets.find((t) => t.id === id) || null,
            getTargetForStage: () => targets.find((t) => t.isStage()),
        },
        editingTarget: null,
        setEditingTarget(id) {
            this.editingTarget = this.runtime.getTargetById(id);
        },
        async duplicateSprite(id) {
            const d = targets.find((t) => t.id === id);
            const c = mk(d.name);
            c.blocks._blocks = JSON.parse(JSON.stringify(d.blocks._blocks));
            c.blocks._scripts = [...d.blocks._scripts];
            return c.id;
        },
        async renameSprite(id, name) {
            targets.find((t) => t.id === id).name = name;
        },
        emitWorkspaceUpdate() {},
        emitTargetsUpdate() {},
    };
}

async function main() {
    console.log("=== ScCodeGen 智能体演示 ===\n");

    // 1) 构建 VFS：两个角色
    const vfs = new VFS();
    vfs.write("/Sprite1/code.js", `
new event.whenflagclicked(() => {
    control.forever(() => {
        motion.movesteps(math_number(10));
        motion.turnright(math_number(15));
    });
});
`);
    vfs.write("/Sprite1/costumes/cat.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
    vfs.write("/player/code.js", `
new event.whenkeypressed("w", () => {
    motion.changeyby(math_number(10));
});
`);
    console.log("VFS 角色：", vfs.sprites().join(", "));
    console.log("read /Sprite1/code.js 前 40 字符：", JSON.stringify(vfs.read("/Sprite1/code.js").slice(0, 40)));
    vfs.edit("/player/code.js", "math_number(5)", "math_number(10)");
    console.log("edit 后 /player/code.js 含 math_number(10)：", vfs.read("/player/code.js").includes("math_number(10)"));
    console.log();

    // 2) 智能体 + commit（确认回调直接同意）
    const agent = new ScratchAgent({
        vfs,
        vm: makeFakeVm(),
        confirmApply: async (summaryText) => {
            console.log("── 用户确认对话框 ──");
            console.log(summaryText);
            console.log("─────────────────────");
            return true;
        },
    });
    const result = await agent.commit("小猫原地转圈 + 玩家按 W 上移");
    if (result.success) {
        console.log("✓ commit 成功");
        console.log(result.diffText);
    } else {
        console.log("✗ commit 失败：", result.errorText || result.error);
    }
    console.log();

    // 3) 版本切换
    console.log("切换回修改前……");
    agent.switchVersion(0, "before");
    console.log("切换回修改后……");
    agent.switchVersion(0, "after");
    console.log("✓ before/after 切换可用（提交历史数：", agent.getHistory().length, "）\n");

    // 4) 编译为用户脚本
    const built = await agent.buildUserScript({ bundler: "esbuild" });
    console.log(`✓ 单文件用户脚本：${built.singleFile.length} 字符（含 Tampermonkey 头部）`);
    console.log(`✓ esbuild 源码/配置已生成（${built.sources.config.length} 字符）`);
    console.log("\n提示：把单文件脚本安装到 Tampermonkey，或本地执行 esbuild 构建扩展版。");
}

main().catch((e) => {
    console.error("演示失败：", e);
    process.exit(1);
});
