/**
 * ScratchAgent 四工具测试：
 * - 工具注册（read / write / edit / commit）
 * - read/write/edit 操作虚拟文件系统（含目录约束）
 * - edit 未命中/多匹配的处理
 * - localStorage 持久化
 */

import assert from "node:assert/strict";
import { ScratchAgent } from "../src/agent/core/index.js";
import { VFS } from "../src/agent/core/vfs.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 内存版 localStorage
function memStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        _map: map,
    };
}

(async () => {
    // ---------- 1. 工具注册 ----------
    const agent = new ScratchAgent({});
    const names = agent.tools.map((t) => t.function.name);
    assert.deepEqual(names.sort(), ["commit", "edit", "read", "write"]);
    console.log("✓ 四个工具注册通过:", names.join(", "));

    // ---------- 2. read/write/edit 基本操作 ----------
    const r1 = await agent.toolWrite("/sprite1/code.js", "new event.whenflagclicked(() => {});");
    assert.equal(r1.success, true);
    const r2 = await agent.toolRead("/sprite1/code.js");
    assert.equal(r2.success, true);
    assert.ok(r2.content.includes("whenflagclicked"));

    // 目录约束：角色目录内只允许 code.js / costumes / sounds
    const bad = await agent.toolWrite("/sprite1/wrong.js", "x");
    assert.equal(bad.success, false);
    assert.ok(bad.error.includes("只允许"));
    const okCostume = await agent.toolWrite("/sprite1/costumes/cat.svg", "<svg/>");
    assert.equal(okCostume.success, true);

    // 顶层 README 允许（非角色目录）
    const okReadme = await agent.toolWrite("/README.md", "说明");
    assert.equal(okReadme.success, true);
    const sprites = agent.vfs.sprites();
    assert.deepEqual(sprites, ["sprite1"], "README 不应算作角色");
    console.log("✓ read/write 与目录约束通过");

    // edit 命中
    const e1 = await agent.toolEdit("/sprite1/code.js", "whenflagclicked", "whenkeypressed");
    assert.equal(e1.success, true);
    assert.ok(agent.vfs.read("/sprite1/code.js").includes("whenkeypressed"));

    // edit 未命中
    const e2 = await agent.toolEdit("/sprite1/code.js", "不存在的文本", "x");
    assert.equal(e2.success, false);
    assert.ok(e2.matches === 0);

    // edit 多匹配 → 返回 matches 并只替换第一处
    await agent.toolWrite("/sprite1/code.js", "a a a");
    const e3 = await agent.toolEdit("/sprite1/code.js", "a", "b");
    assert.equal(e3.success, true);
    assert.equal(agent.vfs.read("/sprite1/code.js"), "b a a");
    console.log("✓ edit 命中/未命中/多匹配处理通过");

    // ---------- 3. localStorage 持久化 ----------
    const storage = memStorage();
    const key = "scodegen:test:vfs";
    const a1 = new ScratchAgent({ persistKey: key, storage, files: { "/cat/code.js": "// 初始" } });
    assert.ok(storage._map.has(key), "写入后应立即持久化");
    a1.vfs.write("/cat/code.js", "// 修改");
    const a2 = new ScratchAgent({ persistKey: key, storage });
    assert.equal(a2.vfs.read("/cat/code.js"), "// 修改", "重开后应从 localStorage 恢复");
    assert.deepEqual(a2.vfs.sprites(), ["cat"]);
    console.log("✓ VFS localStorage 持久化通过");

    console.log("\nScratchAgent 四工具全部测试通过 ✔");
})().catch((e) => {
    console.error("Agent 工具测试失败:", e);
    process.exitCode = 1;
});
