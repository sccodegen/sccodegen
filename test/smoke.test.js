// 快速冒烟测试：VFS + commit(编译→确认→应用) + 差异 + 版本切换 + buildUserScript
import assert from "node:assert/strict";
import { ScratchAgent } from "../src/agent/core/index.js";
import { VFS } from "../src/agent/core/vfs.js";

// ---------- 构造一个假的 Scratch VM ----------
function makeFakeVm({ sprites = [] } = {}) {
    const targets = [];
    let idSeq = 1;
    const newId = () => "target_" + idSeq++;
    const mkTarget = (name, isStage = false) => {
        const t = {
            id: newId(),
            name,
            _stage: isStage,
            blocks: { _blocks: {}, _scripts: [] },
        };
        t.blocks.getScripts = () => [...t.blocks._scripts];
        t.blocks.createBlock = (b) => {
            if (Object.prototype.hasOwnProperty.call(t.blocks._blocks, b.id)) return;
            t.blocks._blocks[b.id] = JSON.parse(JSON.stringify(b));
            if (b.topLevel) t.blocks._scripts.push(b.id);
        };
        t.blocks.deleteBlock = (id) => {
            const b = t.blocks._blocks[id];
            if (!b) return;
            if (b.next !== null) t.blocks.deleteBlock(b.next);
            for (const inp of Object.values(b.inputs || {})) {
                if (inp && inp.block) t.blocks.deleteBlock(inp.block);
            }
            delete t.blocks._blocks[id];
            t.blocks._scripts = t.blocks._scripts.filter((s) => s !== id);
        };
        t.getName = () => t.name;
        t.isStage = () => t._stage;
        t.isSprite = () => !t._stage;
        t.getCostumes = () => [{ assetId: "abc", md5ext: "abc.png", dataFormat: "png", rotationCenterX: 0, rotationCenterY: 0, bitmapResolution: 1 }];
        targets.push(t);
        return t;
    };
    // 真实 Scratch 作品一定有舞台
    mkTarget("Stage", true);
    for (const name of sprites) mkTarget(name);

    const vm = {
        runtime: {
            targets,
            getTargetById: (id) => targets.find((t) => t.id === id) || null,
            getTargetForStage: () => targets.find((t) => t._stage) || null,
            emitProjectChanged: () => {},
        },
        editingTarget: null,
        setEditingTarget(id) {
            this.editingTarget = this.runtime.getTargetById(id);
            assert.ok(this.editingTarget, "setEditingTarget: target not found");
        },
        async duplicateSprite(id) {
            const donor = targets.find((t) => t.id === id);
            assert.ok(donor, "duplicateSprite: donor missing");
            const clone = mkTarget(donor.name);
            clone.blocks._blocks = JSON.parse(JSON.stringify(donor.blocks._blocks));
            clone.blocks._scripts = [...donor.blocks._scripts];
            return clone.id;
        },
        async renameSprite(id, name) {
            const t = targets.find((t) => t.id === id);
            t.name = name;
        },
        async addSprite(spriteJson) {
            mkTarget(spriteJson.name);
        },
        emitWorkspaceUpdate: () => {},
        emitTargetsUpdate: () => {},
    };
    return vm;
}

const DSL = `
new event.whenflagclicked(() => {
    control.forever(() => {
        motion.movesteps(math_number(10));
        motion.turnright(math_number(15));
    });
});
`;

async function main() {
    // 1) VFS + 工具
    const vfs = new VFS({ persistKey: null, storage: null });
    vfs.write("/sprite1/code.js", DSL);
    vfs.write("/sprite1/costumes/cat.svg", "<svg/>");
    vfs.write("/README.md", "demo");
    assert.deepEqual(vfs.sprites(), ["sprite1"]);
    assert.throws(() => vfs.write("/sprite1/wrong.js", "x"), /只允许/);
    const ed = vfs.edit("/sprite1/code.js", "math_number(10)", "math_number(20)");
    assert.equal(ed.applied, true);
    console.log("✓ VFS 读写/编辑/约束通过");

    // 2) commit：编译错误应返回错误+位置
    const badVfs = new VFS({ persistKey: null, storage: null });
    badVfs.write("/sprite1/code.js", "this is not valid js !!!");
    const badAgent = new ScratchAgent({ vfs: badVfs, confirmApply: async () => true });
    const bad = await badAgent.commit("bad code");
    assert.equal(bad.success, false);
    assert.ok(bad.errors.length >= 1, "应返回编译错误");
    assert.ok(bad.errors[0].file === "/sprite1/code.js", "应返回出错文件");
    console.log("✓ commit 编译失败返回错误+位置:", bad.errorText.split("\n")[0]);

    // 3) commit：成功 → 确认 → 应用
    const vm = makeFakeVm({ sprites: ["sprite1"] });
    const agent = new ScratchAgent({ vfs, vm, confirmApply: async () => true });
    const r = await agent.commit("移动并旋转");
    assert.equal(r.success, true);
    const target = vm.runtime.targets.find((t) => t.name === "sprite1");
    const opcodes = Object.values(target.blocks._blocks).map((b) => b.opcode);
    assert.ok(opcodes.includes("event_whenflagclicked"));
    assert.ok(opcodes.includes("motion_movesteps"));
    assert.ok(opcodes.includes("motion_turnright"));
    assert.ok(opcodes.includes("control_forever"));
    assert.ok(r.diffText.includes("新增"), "应有差异摘要: " + r.diffText);
    console.log("✓ commit 成功应用:", r.diffText);

    // 4) 自动创建角色
    const vfs2 = new VFS({ persistKey: null, storage: null });
    vfs2.write("/player/code.js", "new event.whenflagclicked(() => { motion.movesteps(math_number(5)); });");
    const vm2 = makeFakeVm({ sprites: [] });
    const agent2 = new ScratchAgent({ vfs: vfs2, vm: vm2, confirmApply: async () => true });
    const r2 = await agent2.commit("create player");
    assert.equal(r2.success, true);
    assert.ok(vm2.runtime.targets.some((t) => t.name === "player"), "应自动创建 player 角色");
    console.log("✓ 角色不存在自动创建通过");

    // 5) 版本切换（before/after）
    const h = agent.getHistory();
    assert.equal(h.length, 1);
    const beforeBlocks = JSON.stringify(
        Object.values(vm.runtime.targets.find((t) => t.name === "sprite1").blocks._blocks)
    );
    let sw = agent.switchVersion(0, "before");
    assert.equal(sw.success, true);
    const afterSwitch = Object.values(
        vm.runtime.targets.find((t) => t.name === "sprite1").blocks._blocks
    );
    assert.equal(afterSwitch.length, 0, "切回 before 应清空积木");
    sw = agent.switchVersion(0, "after");
    assert.equal(sw.success, true);
    const restored = JSON.stringify(
        Object.values(vm.runtime.targets.find((t) => t.name === "sprite1").blocks._blocks)
    );
    assert.equal(restored, beforeBlocks, "切回 after 应恢复积木");
    console.log("✓ before/after 版本切换通过");

    // 6) VM 不存在 → 直接结束
    const agent3 = new ScratchAgent({ vfs, vm: null, confirmApply: async () => true });
    const r3 = await agent3.commit("no vm");
    assert.equal(r3.success, false);
    assert.ok(r3.aborted === true, "应中止");
    console.log("✓ unsafeWindow.vm 不存在时结束运行:", r3.error);

    // 7) buildUserScript
    const built = await agent.buildUserScript({ bundler: "esbuild" });
    assert.equal(built.ok, true);
    assert.ok(built.singleFile.startsWith("// ==UserScript=="), "单文件应带用户脚本头部");
    assert.ok(built.singleFile.includes("@match        https://scratch.mit.edu/projects/*"));
    assert.ok(built.singleFile.includes("unsafeWindow.vm 不存在"), "运行时应有 VM 检查");
    assert.ok(built.sources.config.includes("esbuild"), "应生成 esbuild 配置");
    console.log(`✓ buildUserScript 通过（单文件 ${built.singleFile.length} 字符，含头部）`);

    console.log("\n全部冒烟测试通过 ✔");
}

main().catch((e) => {
    console.error("冒烟测试失败:", e);
    process.exit(1);
});
