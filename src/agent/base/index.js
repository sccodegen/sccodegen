/**
 * Agent —— 通用工具调用智能体基类
 *
 * 环境无关：不直接依赖 Node 或浏览器 API。AI 后端通过 config.ai 注入
 * （缺省由子类提供，例如 PuterAI 匿名模式）。消息与工具定义均为
 * OpenAI 风格，兼容 puter.ai.chat / OpenAI chat completions。
 */

export class Agent {
    /**
     * @param {object} [config]
     * @param {object} [config.ai]   AI 后端，需实现 chat(messages, {tools}) → message
     * @param {string} [config.systemPrompt] 系统提示词（可选，callAI 时自动前置）
     */
    constructor(config = {}) {
        this.config = config;
        this.messages = [];
        this.tools = [];
        this.toolFunctions = {};
        this.ai = config.ai ?? null;
    }

    reset() {
        this.messages = [];
        this.tools = [];
        this.toolFunctions = {};
    }

    pushMessage(role, content) {
        this.messages.push({ role, content });
    }

    /**
     * 注册工具
     * @param {string} name        工具名
     * @param {string} description 工具描述
     * @param {object} parameters  JSON Schema（{type:'object', properties, required}）
     * @param {(args:object)=>any} fn 工具实现
     */
    addTool(name, description, parameters = {}, fn) {
        this.tools.push({
            type: "function",
            function: { name, description, parameters },
        });
        this.toolFunctions[name] = fn;
    }

    /** 调用 AI（自动附带系统提示词与工具表） */
    async callAI() {
        if (!this.ai) throw new Error("未配置 AI 后端（config.ai）");
        const system = this.config.systemPrompt;
        const messages = system
            ? [{ role: "system", content: system }, ...this.messages]
            : this.messages;
        return this.ai.chat(messages, { tools: this.tools });
    }

    async executeTool(name, args) {
        const fn = this.toolFunctions[name];
        if (!fn) throw new Error(`未知工具：${name}`);
        return await fn(args);
    }

    /**
     * Tool Calling 主循环：持续请求 AI 并执行工具，直到 AI 不再请求工具。
     * @param {string} initialMessage 用户需求
     * @param {object} [opts] {maxTurns?:number}
     * @returns {Promise<string>} 最终回复内容
     */
    async run(initialMessage, opts = {}) {
        const { maxTurns = 30 } = opts;
        this.pushMessage("user", initialMessage);
        for (let turn = 0; turn < maxTurns; turn++) {
            const response = await this.callAI();
            this.messages.push(response);
            const calls = response?.tool_calls ?? [];
            if (!calls.length) return response?.content ?? "";
            for (const call of calls) {
                let content;
                try {
                    const args = JSON.parse(call.function?.arguments ?? "{}");
                    content = JSON.stringify(await this.executeTool(call.function.name, args));
                } catch (e) {
                    content = JSON.stringify({ success: false, error: e.message });
                }
                this.messages.push({ role: "tool", content, tool_call_id: call.id });
            }
        }
        const last = this.messages[this.messages.length - 1];
        return typeof last?.content === "string" ? last.content : "";
    }
}

export default Agent;
