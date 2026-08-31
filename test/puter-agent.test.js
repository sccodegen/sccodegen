/**
 * puter 匿名模式 AI 层测试：
 * - 匿名调用（不注入 token 也能用全局 puter）
 * - 自动选择免费模型（cost 为 0 优先，失败回退默认）
 * - 速率控制（默认 ≤10 RPM，测试用短间隔验证）
 * - 工具调用 + Agent 工具循环
 */

import assert from "node:assert/strict";
import { PuterAI } from "../src/agent/utils/puter.js";
import { Agent } from "../src/agent/base/index.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const originalPuter = globalThis.puter;

async function withPuter(fake, fn) {
    globalThis.puter = fake;
    try {
        return await fn();
    } finally {
        if (originalPuter === undefined) delete globalThis.puter;
        else globalThis.puter = originalPuter;
    }
}

(async () => {
    // ---------- 1. 匿名模式 + 响应解析 ----------
    await withPuter(
        {
            ai: {
                chat: async (messages, options) => {
                    assert.ok(Array.isArray(messages), "messages 应为数组");
                    assert.ok(messages[0].role === "system");
                    return { message: { role: "assistant", content: "匿名模式 OK" } };
                },
                listModels: async () => [],
            },
        },
        async () => {
            const ai = new PuterAI({ model: "gpt-5-nano", minIntervalMs: 0 });
            const msg = await ai.chat([{ role: "system", content: "s" }, { role: "user", content: "hi" }]);
            assert.equal(msg.content, "匿名模式 OK");
            console.log("✓ 匿名模式调用 + 响应解析通过");
        }
    );

    // ---------- 2. 自动选择免费模型 ----------
    await withPuter(
        {
            ai: {
                chat: async () => ({ message: { role: "assistant", content: "" } }),
                listModels: async () => [
                    { id: "claude-opus-4-8", provider: "claude", cost: { currency: "usd-cents", tokens: 1e6, input: 500, output: 2500 } },
                    { id: "gpt-4o-mini", provider: "openai", cost: { input: 0, output: 0 } },
                    { id: "gpt-5-nano", provider: "openai", cost: { input: 0, output: 0 } },
                    { id: "paid-nano", provider: "openai" }, // 无 cost 视为不可用
                ],
            },
        },
        async () => {
            const ai = new PuterAI({ minIntervalMs: 0 });
            const model = await ai.selectFreeModel();
            assert.equal(model, "gpt-5-nano", "应在免费模型中按偏好顺序选择 gpt-5-nano");
            // 缓存生效
            const again = await ai.selectFreeModel();
            assert.equal(again, "gpt-5-nano");
            console.log("✓ 自动选择免费模型通过（偏好顺序）");
        }
    );

    // ---------- 3. listModels 失败回退默认模型 ----------
    await withPuter(
        {
            ai: {
                chat: async () => ({ message: { role: "assistant", content: "" } }),
                listModels: async () => {
                    throw new Error("network error");
                },
            },
        },
        async () => {
            const ai = new PuterAI({ minIntervalMs: 0 });
            assert.equal(await ai.selectFreeModel(), "gpt-5-nano");
            console.log("✓ listModels 失败回退默认模型通过");
        }
    );

    // ---------- 4. 速率控制（≤10 RPM ⇒ 间隔 ≥ minIntervalMs） ----------
    await withPuter(
        {
            ai: {
                chat: async () => ({ message: { role: "assistant", content: "x" } }),
                listModels: async () => [],
            },
        },
        async () => {
            const ai = new PuterAI({ model: "gpt-5-nano", minIntervalMs: 60 });
            const t0 = Date.now();
            await ai.chat([{ role: "user", content: "1" }]);
            await ai.chat([{ role: "user", content: "2" }]);
            const elapsed = Date.now() - t0;
            assert.ok(elapsed >= 60, `两次请求间隔应 ≥60ms，实际 ${elapsed}ms`);
            console.log(`✓ 速率控制通过（2 次请求间隔 ${elapsed}ms ≥ 60ms，默认配置为 6000ms ⇒ 10 RPM）`);
        }
    );

    // ---------- 5. 429 退避重试 ----------
    let calls = 0;
    await withPuter(
        {
            ai: {
                chat: async () => {
                    calls++;
                    if (calls === 1) {
                        const e = new Error("429 too_many_requests");
                        throw e;
                    }
                    return { message: { role: "assistant", content: "重试成功" } };
                },
                listModels: async () => [],
            },
        },
        async () => {
            const ai = new PuterAI({ model: "gpt-5-nano", minIntervalMs: 0 });
            const msg = await ai.chat([{ role: "user", content: "hi" }]);
            assert.equal(msg.content, "重试成功");
            assert.equal(calls, 2);
            console.log("✓ 429 退避重试通过");
        }
    );

    // ---------- 6. Agent 工具循环（工具调用 → 执行 → 最终回复） ----------
    const ai = {
        chat: async (messages, options) => {
            assert.ok(options.tools.length >= 1, "应传工具表");
            const hasToolResult = messages.some((m) => m.role === "tool");
            if (!hasToolResult) {
                return {
                    role: "assistant",
                    content: "开始",
                    tool_calls: [
                        {
                            id: "call_1",
                            type: "function",
                            function: { name: "add", arguments: JSON.stringify({ a: 2, b: 3 }) },
                        },
                    ],
                };
            }
            return { role: "assistant", content: "结果是 5" };
        },
    };
    const agent = new Agent({ ai, systemPrompt: "你是测试助手" });
    agent.addTool(
        "add",
        "两个数相加",
        { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
        async ({ a, b }) => ({ result: a + b })
    );
    // 第一轮：AI 返回 tool_calls
    const reply = await agent.run("需求");
    assert.equal(reply, "结果是 5");
    // 验证工具结果已回填
    const toolMsg = agent.messages.find((m) => m.role === "tool");
    assert.ok(toolMsg && toolMsg.tool_call_id === "call_1");
    assert.equal(JSON.parse(toolMsg.content).result, 5);
    console.log("✓ Agent 工具循环通过");

    console.log("\nPuterAI / Agent 全部测试通过 ✔");
})().catch((e) => {
    console.error("PuterAI 测试失败:", e);
    process.exitCode = 1;
});
