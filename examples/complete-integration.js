/**
 * 完整集成示例：puter 匿名模式 + buildUserScript
 *
 * 演示：
 *  1. PuterAI 匿名模式：不配置任何 key，自动选择免费模型，≤10 RPM
 *  2. 把 VFS 中的作品编译为用户脚本（单文件 + esbuild 源码/配置）
 *
 * 注意：真实 AI 对话需要浏览器里的 puter.js（用户脚本头部 @require
 * https://js.puter.com/v2/）。本示例用注入的假 puter 演示调用链，
 * 真实环境把 config.puter 去掉即可。
 */

import { ScratchAgent, PuterAI, VFS } from "../src/index.js";

// ---------- 假 puter（演示匿名调用链；真实环境由 @require 提供） ----------
const fakePuter = {
    ai: {
        listModels: async () => [
            { id: "gpt-5-nano", provider: "openai", cost: { input: 0, output: 0 } },
            { id: "claude-opus-4-8", provider: "claude", cost: { input: 500, output: 2500 } },
        ],
        chat: async (messages, options) => {
            console.log(`[puter.ai.chat] model=${options.model}, tools=${(options.tools || []).length}`);
            return {
                message: {
                    role: "assistant",
                    content:
                        "（演示）我会先在 VFS 里创建角色并编写 code.js，然后调用 commit 应用到作品。",
                },
            };
        },
    },
};

async function main() {
    console.log("=== 完整集成：puter 匿名 + 编译为用户脚本 ===\n");

    // VFS：一个角色的作品
    const vfs = new VFS();
    vfs.write("/Cat/code.js", `
new event.whenflagclicked(() => {
    control.forever(() => {
        motion.movesteps(math_number(10));
        control.if(sensing.touchingobject("_edge_"), () => {
            motion.turnright(math_number(90));
        });
    });
});
`);

    // 智能体：puter 匿名模式（显式注入假 puter；真实环境去掉 puter 配置即可）
    const ai = new PuterAI({ puter: fakePuter, minIntervalMs: 0 });
    const agent = new ScratchAgent({
        ai,
        vfs,
        confirmApply: async () => true, // 演示直接确认
        vm: null, // 演示环境没有 Scratch VM，commit 会在应用前结束
    });

    // 1) AI 对话（匿名 + 自动免费模型）
    await agent.callAI();

    // 2) commit：VM 不存在 → 直接结束运行（符合"unsafeWindow.vm 不存在则结束"）
    const commit = await agent.commit("演示提交");
    console.log("\ncommit 结果：", commit.success ? "成功" : "失败");
    if (!commit.success) console.log("  原因：", commit.errorText || commit.error);

    // 3) 编译为用户脚本（esbuild：单文件 + 源码/配置）
    const built = await agent.buildUserScript({ bundler: "esbuild" });
    console.log("\n用户脚本产物：");
    console.log(`  · 单文件（可安装到 Tampermonkey）：${built.singleFile.length} 字符`);
    console.log(`  · 头部首行：${built.singleFile.split("\n")[0]}`);
    console.log(`  · 运行时含 VM 检查：${built.singleFile.includes("unsafeWindow.vm 不存在")}`);
    console.log(`  · esbuild 配置已生成：${built.sources.config.length} 字符`);

    console.log("\n真实环境用法：安装 dist/scodegen.user.js 到 Tampermonkey，");
    console.log("打开 scratch.mit.edu 作品页，面板描述需求即可（puter 匿名，≤10 RPM）。");
}

main().catch((e) => {
    console.error("集成演示失败：", e);
    process.exit(1);
});
