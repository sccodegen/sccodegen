/**
 * PuterAI —— puter.js 匿名模式 AI 调用层
 *
 * 设计要点（按需求）：
 * - 匿名模式：不配置任何 auth token 时，直接使用全局 puter（用户脚本头部 @require
 *   https://js.puter.com/v2/ 引入），不调用 setAuthToken。
 * - 自动选择免费模型：通过 puter.ai.listModels() 拉取模型表，优先挑 cost 为 0 的
 *   免费模型（按 FREE_MODEL_PREFERENCE 的顺序），失败时回退默认模型。
 * - 速度控制 ≤10 RPM：默认 minIntervalMs = 6000，每次请求前保证与上一次请求间隔
 *   至少 6 秒；命中 429/限速错误时退避 30 秒重试（最多 3 次）。
 */

const DEFAULT_MODEL = "gpt-5-nano";

// 免费模型优先顺序：按 id（或 aliases）匹配 listModels 结果中 cost 为 0 的模型
const FREE_MODEL_PREFERENCE = [
    "gpt-5-nano",
    "gpt-4o-mini",
    "claude-haiku-4-5",
    "claude-3-5-haiku",
    "gemini-2.0-flash-lite",
    "llama-3.1-8b",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isFreeModel = (m) => {
    const c = m && m.cost;
    if (!c) return false;
    return Number(c.input) === 0 && Number(c.output) === 0;
};

export class PuterAI {
    /**
     * @param {object} [config]
     * @param {string} [config.model]          显式指定模型；缺省时自动选择免费模型
     * @param {number} [config.minIntervalMs]  请求最小间隔（默认 6000ms ⇒ ≤10 RPM）
     * @param {object} [config.puter]          显式注入 puter 实例（测试用）；缺省用 globalThis.puter
     * @param {string} [config.authToken]      可选：显式 auth token；缺省 = 匿名模式
     * @param {(msg:string)=>void} [config.onStatus] 状态回调（限速等待等提示）
     */
    constructor(config = {}) {
        this.model = config.model ?? null;
        this.minIntervalMs = config.minIntervalMs ?? 6000;
        this.puter = config.puter ?? null;
        this.authToken = config.authToken ?? null;
        this.onStatus = config.onStatus ?? null;
        this._lastCall = 0;
        this._modelsCache = null;
    }

    _status(msg) {
        if (this.onStatus) this.onStatus(msg);
    }

    /** 解析 puter 实例：显式注入 > 全局（匿名模式） */
    _resolvePuter() {
        if (this.puter) return this.puter;
        const g = globalThis;
        if (g && g.puter && typeof g.puter.ai === "object") return g.puter;
        throw new Error(
            "puter.js 未加载：请在用户脚本头部 @require https://js.puter.com/v2/ ，或传入 config.puter"
        );
    }

    _applyAuth(puter) {
        // 匿名模式：只有显式传入 authToken 才调用 setAuthToken
        if (this.authToken && typeof puter.setAuthToken === "function") {
            puter.setAuthToken(this.authToken);
        }
    }

    /** 自动选择免费模型（结果缓存） */
    async selectFreeModel() {
        if (this.model) return this.model;
        if (this._modelsCache) return this._modelsCache;
        let pick = DEFAULT_MODEL;
        try {
            const puter = this._resolvePuter();
            const models = (await puter.ai.listModels?.()) ?? [];
            const pool = models.filter(isFreeModel);
            const candidates = pool.length ? pool : models;
            const found = FREE_MODEL_PREFERENCE.map((p) =>
                candidates.find(
                    (m) => m.id === p || (Array.isArray(m.aliases) && m.aliases.includes(p))
                )
            ).find(Boolean);
            if (found && found.id) pick = found.id;
            this._status(
                `已选择模型：${pick}${pool.length ? "（免费）" : ""}（共 ${models.length} 个模型）`
            );
        } catch {
            // listModels 失败（网络/权限）时回退默认模型
        }
        this._modelsCache = pick;
        return pick;
    }

    /** 速率控制：保证两次请求间隔 ≥ minIntervalMs */
    async _waitForSlot() {
        const now = Date.now();
        const wait = this._lastCall + this.minIntervalMs - now;
        if (wait > 0) {
            this._status(`限速：等待 ${Math.ceil(wait / 1000)}s（≤10 RPM）`);
            await sleep(wait);
        }
        this._lastCall = Date.now();
    }

    /**
     * 发起一次 AI 对话（带工具调用、限速、429 退避）
     * @param {Array} messages  OpenAI 风格消息数组
     * @param {object} [options]
     * @param {Array}  [options.tools]
     * @param {number} [options.temperature]
     * @param {number} [options.max_tokens]
     * @param {boolean}[options.stream]
     * @returns {Promise<object>} message 对象 {role, content, tool_calls?}
     */
    async chat(messages, options = {}) {
        const puter = this._resolvePuter();
        this._applyAuth(puter);
        const model = await this.selectFreeModel();
        const chatOptions = { model };
        if (options.tools && options.tools.length) chatOptions.tools = options.tools;
        if (options.temperature !== undefined) chatOptions.temperature = options.temperature;
        if (options.max_tokens !== undefined) chatOptions.max_tokens = options.max_tokens;
        if (options.stream) chatOptions.stream = true;

        await this._waitForSlot();

        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resp = await puter.ai.chat(messages, chatOptions);
                if (options.stream) return resp;
                if (resp && resp.message) return resp.message;
                if (typeof resp === "string") return { role: "assistant", content: resp };
                if (resp && resp.choices && resp.choices[0] && resp.choices[0].message) {
                    return resp.choices[0].message;
                }
                throw new Error("Puter AI 响应格式无效");
            } catch (e) {
                lastErr = e;
                const msg = String((e && e.message) || e);
                if (/429|rate\s*limit|too\s*many/i.test(msg)) {
                    this._status("触发速度限制，等待 30s 后重试");
                    await sleep(30000);
                    continue;
                }
                throw e;
            }
        }
        throw lastErr;
    }
}

export default PuterAI;
