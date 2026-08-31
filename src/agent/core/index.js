/**
 * ScratchAgent —— 重写后的 Scratch 代码生成智能体
 *
 * 四个工具（LLM 可调用）：
 *   read(path)    读取虚拟文件系统中的文件 / 列出目录
 *   write(path, content)  写入文件（角色代码必须写到 /<角色id>/code.js）
 *   edit(path, oldText, newText)  文本替换
 *   commit(message)  全量编译每个角色的 code.js → 用户确认 → 应用到 Scratch VM
 *
 * 关键行为（按需求）：
 * - VFS：/<角色id>/code.js + /<角色id>/costumes/ + /<角色id>/sounds/，localStorage 持久化；
 * - commit 编译失败返回错误信息和位置；成功则等待用户确认后应用；
 * - 应用：vm.runtime.targets 解析角色 id → vm.setEditingTarget → createBlock；
 *   角色不存在自动创建；应用前后各拍 blocks 快照，可切换"修改前/修改后"对比；
 * - unsafeWindow.vm 不存在则直接结束（中止应用）；
 * - AI：puter 匿名模式、自动选择免费模型、≤10 RPM（由 PuterAI 处理）；
 * - buildUserScript()：编译为用户脚本（单文件 + 源码/构建配置两种形态）。
 */

import { Agent } from "../base/index.js";
import PuterAI from "../utils/puter.js";
import { VFS } from "./vfs.js";
import { compileSpriteCode } from "./compile.js";
import { diffBlockSnapshots } from "./diff.js";
import { applySpriteBlocks, restoreTargetBlocks } from "./apply.js";
import { buildUserScript as buildUserScriptImpl, bundlerInfo } from "./userscript.js";

const genId = () =>
    Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

export const SYSTEM_PROMPT = `你是一个运行在 Scratch 编辑器（scratch.mit.edu）里的 AI 编程智能体，使用虚拟文件系统（VFS）管理 Scratch 作品，并把编译结果应用到页面上的 Scratch VM。

【VFS 结构（名字固定，不可改）】
- 每个角色是一个目录：/<角色id>/，角色 id 由你决定（例如 sprite1、Cat、Player1）。
- 每个角色的积木脚本 DSL 必须写在 /<角色id>/code.js。
- 素材放在 /<角色id>/costumes/ 与 /<角色id>/sounds/。
- 根目录还可以放说明文件（如 /README.md），但只有 */code.js 会被编译。

【code.js 的 DSL 语法】
1. 每个脚本必须以 hat 积木开头：new event.whenflagclicked(() => {...});、
   new event.whenkeypressed("space", () => {...}); 等。
2. 重要：hat 积木的字段参数（按键名、广播名、背景名等）直接传字符串，
   例如 new event.whenkeypressed("w", ...)、new event.whenbroadcastreceived("start", ...)。
   不要用 text() 包 hat 的参数——text()/math_number() 只能在 hat 或子栈回调内部使用。
3. 语句以分号结尾；包含子栈的积木用回调函数：control.forever(() => {...})、
   control.repeat(math_number(10), () => {...})、control.if(条件, () => {...})。
4. 数字用 math_number(10)，文本用 text("...") 或直接字符串。
5. 布尔条件用 operators.operator_gt(a, b)、operators.operator_equals(a, b)、
   sensing.keypressed(text("w")) 等；reporter 可嵌套，如
   looks.say(operators.operator_join("x=", motion.xposition()))。
6. 命令积木只能在 hat 或子栈回调里调用，不要出现在顶层。

【工作流程】
1. 先 read 查看现有 VFS（默认只有一个空作品）。
2. 用 write 为每个角色创建目录并写 code.js（先写 code.js 再写素材）；
   修改已有文件用 edit（注意 oldText 要唯一）。
3. 写完后调用 commit，传入清晰的提交消息。commit 会全量编译每个角色的 code.js：
   - 编译失败：返回错误信息与位置（角色、文件、行号），修复后重试；
   - 编译成功：会请求用户确认，确认后应用到 Scratch 作品，并返回每个角色
     修改前后积木差异（新增/删除/修改）。
4. 根据差异与用户反馈继续 write/edit，再次 commit，直到满足需求。
5. 若用户要求把作品编译成可安装的用户脚本，用 agent.buildUserScript() 生成。`;

export class ScratchAgent extends Agent {
    /**
     * @param {object} [config]
     * @param {object} [config.ai]        AI 后端（缺省自动创建 PuterAI 匿名模式）
     * @param {object} [config.puter]     显式 puter 实例（测试用）
     * @param {string} [config.model]     指定模型；缺省自动选择免费模型
     * @param {number} [config.minIntervalMs] AI 请求最小间隔（默认 6000ms ⇒ ≤10 RPM）
     * @param {object} [config.vfs]       显式 VFS 实例（测试用）
     * @param {string} [config.persistKey] VFS 持久化键名（默认按页面 URL 生成）
     * @param {object} [config.storage]   localStorage 兼容对象（测试用）
     * @param {object} [config.vm]        显式 Scratch VM（测试用；缺省取 unsafeWindow.vm）
     * @param {Function} [config.confirmApply] 提交确认回调 (summaryText, message) => Promise<boolean>
     * @param {Function} [config.askUser]      构建工具选择回调
     * @param {Function} [config.onStatus]     AI 状态回调
     */
    constructor(config = {}) {
        super(config);
        this.config = config;
        this.systemPrompt = SYSTEM_PROMPT;

        // VFS（localStorage 持久化）
        const persistKey =
            config.persistKey ??
            (typeof location !== "undefined" && location.href
                ? `scodegen:vfs:${location.href}`
                : null);
        this.vfs =
            config.vfs ??
            new VFS({
                persistKey,
                storage: config.storage,
                files: config.files,
            });

        // AI 后端（puter 匿名模式）
        this.ai =
            config.ai ??
            new PuterAI({
                model: config.model,
                minIntervalMs: config.minIntervalMs,
                puter: config.puter,
                authToken: config.authToken,
                onStatus: config.onStatus,
            });

        // 提交历史：{id, message, date, perSprite:[{sprite, before, after, diff}]}
        this.history = [];

        this.registerTools();
    }

    /** 解析 Scratch VM：显式注入 > unsafeWindow.vm（不存在返回 null） */
    _getVm() {
        if (this.config.vm) return this.config.vm;
        try {
            if (typeof unsafeWindow !== "undefined" && unsafeWindow.vm) return unsafeWindow.vm;
            if (globalThis && globalThis.unsafeWindow && globalThis.unsafeWindow.vm) {
                return globalThis.unsafeWindow.vm;
            }
        } catch {
            // 忽略访问异常
        }
        return null;
    }

    registerTools() {
        this.addTool(
            "read",
            "读取虚拟文件系统中的文件内容，或列出目录内容。角色代码在 /<角色id>/code.js，素材在 /<角色id>/costumes/ 与 /<角色id>/sounds/。",
            {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "VFS 路径，例如 /sprite1/code.js；传 / 或空串列出根目录",
                    },
                },
                required: ["path"],
            },
            async ({ path }) => this.toolRead(path)
        );

        this.addTool(
            "write",
            "写入虚拟文件系统。每个角色一个目录，代码必须写到 /<角色id>/code.js（名字固定不可改），素材写到 /<角色id>/costumes/ 与 /<角色id>/sounds/。自动创建目录。",
            {
                type: "object",
                properties: {
                    path: { type: "string", description: "VFS 路径，如 /sprite1/code.js" },
                    content: { type: "string", description: "文件内容（DSL 代码或素材文本/data URL）" },
                },
                required: ["path", "content"],
            },
            async ({ path, content }) => this.toolWrite(path, content)
        );

        this.addTool(
            "edit",
            "替换虚拟文件系统中某个文件的部分文本（如修改 code.js 里的某段 DSL）。oldText 必须与文件中的文本完全一致。",
            {
                type: "object",
                properties: {
                    path: { type: "string", description: "VFS 路径" },
                    oldText: { type: "string", description: "要替换的原文（需唯一匹配）" },
                    newText: { type: "string", description: "替换后的文本" },
                },
                required: ["path", "oldText", "newText"],
            },
            async ({ path, oldText, newText }) => this.toolEdit(path, oldText, newText)
        );

        this.addTool(
            "commit",
            "提交：全量编译每个角色的 code.js，编译成功并等待用户确认后，把积木应用到当前 Scratch 作品（角色不存在会自动创建）。失败时返回错误信息和位置。",
            {
                type: "object",
                properties: {
                    message: { type: "string", description: "提交消息，说明本次改动" },
                },
                required: ["message"],
            },
            async ({ message }) => this.commit(message)
        );
    }

    // ---------------- 工具实现 ----------------

    toolRead(path = "") {
        try {
            const p = String(path ?? "");
            if (!p || p === "/") {
                return { success: true, type: "dir", entries: this.vfs.list("") };
            }
            if (this.vfs.isDir(p)) {
                return { success: true, type: "dir", entries: this.vfs.list(p) };
            }
            if (this.vfs.isFile(p)) {
                return { success: true, type: "file", path: `/${p.replace(/^\/+/, "")}`, content: this.vfs.read(p) };
            }
            return { success: false, error: `路径不存在：/${p}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    toolWrite(path, content) {
        try {
            if (typeof content !== "string") {
                return { success: false, error: "content 必须是字符串" };
            }
            const len = this.vfs.write(path, content);
            const p = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
            return { success: true, path: `/${p}`, bytes: len, message: `已写入 /${p}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    toolEdit(path, oldText, newText) {
        try {
            const r = this.vfs.edit(path, oldText, newText);
            if (!r.applied) {
                return {
                    success: false,
                    error: r.error,
                    matches: r.matches,
                    hint: "请提供与文件完全一致的 oldText（含缩进）；若匹配多次请包含更多上下文使其唯一",
                };
            }
            return { success: true, file: r.file, message: `已更新 ${r.file}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ---------------- commit ----------------

    /**
     * commit：全量编译 → 失败返回错误+位置；成功 → 确认 → 应用 → 快照+差异
     * @param {string} message 提交消息
     */
    async commit(message) {
        const msg = String(message ?? "").trim() || "(无提交消息)";

        // 1) 全量编译每个角色的 code.js
        const spriteIds = this.vfs.sprites();
        const compiled = {};
        const errors = [];
        for (const id of spriteIds) {
            const code = this.vfs.readSpriteCode(id);
            if (code === null) continue; // 目录存在但还没有 code.js
            const r = compileSpriteCode(id, code);
            if (r.ok) compiled[id] = r;
            else errors.push({ sprite: id, error: r.error, location: r.location });
        }
        if (errors.length) {
            return {
                success: false,
                message: msg,
                errors: errors.map((e) => ({
                    sprite: e.sprite,
                    file: e.location.file,
                    line: e.location.line,
                    column: e.location.column,
                    error: e.error,
                })),
                errorText: errors
                    .map(
                        (e) =>
                            `${e.location.file}：${e.error}` +
                            (e.location.line ? `（第 ${e.location.line} 行${e.location.column ? `，第 ${e.location.column} 列` : ""}）` : "")
                    )
                    .join("\n"),
            };
        }

        const summary = spriteIds
            .filter((id) => compiled[id])
            .map((id) => ({
                sprite: id,
                stacks: compiled[id].stacks.length,
                blocks: compiled[id].blocks.length,
            }));

        // 2) VM 检查：unsafeWindow.vm 不存在则直接结束运行
        const vm = this._getVm();
        if (!vm) {
            return {
                success: false,
                aborted: true,
                message: msg,
                summary,
                error: "Scratch VM 不存在（unsafeWindow.vm），已结束运行",
            };
        }

        // 3) 等待用户确认
        const summaryText =
            `提交消息：${msg}\n\n` +
            summary.map((s) => `角色 ${s.sprite}：${s.stacks} 个脚本，${s.blocks} 个积木`).join("\n");
        const confirmed = await this._confirmApply(summaryText, msg);
        if (!confirmed) {
            return { success: false, cancelled: true, message: msg, summary, error: "用户取消确认，未应用" };
        }

        // 4) 应用到作品（应用前后各拍快照 + 差异）
        const perSprite = [];
        for (const id of spriteIds) {
            if (!compiled[id]) continue;
            try {
                const r = await applySpriteBlocks(vm, id, compiled[id].stacks);
                const diff = diffBlockSnapshots(id, r.before, r.after);
                perSprite.push({ sprite: id, targetId: r.targetId, before: r.before, after: r.after, diff });
            } catch (e) {
                return {
                    success: false,
                    message: msg,
                    summary,
                    error: `应用角色 ${id} 失败：${e.message}`,
                    applied: perSprite,
                };
            }
        }

        const entry = {
            id: genId(),
            message: msg,
            date: Date.now(),
            perSprite,
        };
        this.history.push(entry);

        return {
            success: true,
            message: msg,
            summary,
            historyId: entry.id,
            diffText: perSprite.map((p) => p.diff.summary).join("\n"),
            diff: perSprite.map((p) => ({
                sprite: p.sprite,
                addedCount: p.diff.addedCount,
                removedCount: p.diff.removedCount,
                changedCount: p.diff.changedCount,
                added: p.diff.added,
                removed: p.diff.removed,
                changed: p.diff.changed,
            })),
        };
    }

    _confirmApply(summaryText, message) {
        if (this.config.confirmApply) return this.config.confirmApply(summaryText, message);
        if (typeof confirm === "function") {
            return confirm(`确认将以下修改应用到 Scratch 作品？\n\n${summaryText}`);
        }
        // Node / 无 UI 环境：默认拒绝，避免误应用
        return false;
    }

    // ---------------- 修改前/修改后切换 ----------------

    getHistory() {
        return this.history.map((h) => ({
            id: h.id,
            message: h.message,
            date: h.date,
            perSprite: h.perSprite.map((p) => ({
                sprite: p.sprite,
                targetId: p.targetId,
                diff: p.diff.summary,
                addedCount: p.diff.addedCount,
                removedCount: p.diff.removedCount,
                changedCount: p.diff.changedCount,
            })),
        }));
    }

    /**
     * 切换到某次提交的修改前（before）或修改后（after）版本
     * @param {string|number} historyRef 提交 id 或历史下标
     * @param {'before'|'after'} which
     */
    switchVersion(historyRef, which) {
        const entry = this._findHistory(historyRef);
        if (!entry) return { success: false, error: "找不到该提交历史" };
        if (which !== "before" && which !== "after") {
            return { success: false, error: "which 只能是 before 或 after" };
        }
        const vm = this._getVm();
        if (!vm) {
            return { success: false, error: "Scratch VM 不存在（unsafeWindow.vm），无法切换版本" };
        }
        for (const p of entry.perSprite) {
            const snapshot = which === "before" ? p.before : p.after;
            try {
                restoreTargetBlocks(vm, p.targetId, snapshot);
            } catch (e) {
                return { success: false, error: `切换角色 ${p.sprite} 失败：${e.message}` };
            }
        }
        return { success: true, historyId: entry.id, version: which, message: entry.message };
    }

    _findHistory(ref) {
        if (typeof ref === "number") return this.history[ref] ?? null;
        return this.history.find((h) => h.id === ref) ?? null;
    }

    // ---------------- 编译为用户脚本 ----------------

    /**
     * 编译为用户脚本（两种形态）：
     *   1. 单文件用户脚本（可直接安装到 Tampermonkey）；
     *   2. 源码 + 构建配置（本地用所选工具构建扩展版）。
     * 未指定构建工具时会列出 esbuild/tsup/vite 优缺点并询问用户。
     * @param {object} [opts] {bundler?, header?, askUser?}
     */
    async buildUserScript(opts = {}) {
        const askUser = opts.askUser ?? this.config.askUser;
        const bundler = opts.bundler ?? this.config.bundler ?? null;
        if (bundler) {
            // 明确指定时也给出优缺点说明（随结果返回）
            const info = bundlerInfo(bundler);
            const result = await buildUserScriptImpl(this.vfs, { ...opts, bundler, askUser });
            result.bundlerInfo = info;
            return result;
        }
        if (askUser) {
            // 询问前先展示三个工具的优缺点
            const choice = await askUser({
                question: "编译为用户脚本，请选择构建工具（优缺点如下）：",
                options: ["esbuild", "tsup", "vite"].map((id) => ({
                    id,
                    label: id,
                    description: bundlerInfo(id),
                })),
            });
            if (!choice) throw new Error("未选择构建工具，已取消");
            return this.buildUserScript({ ...opts, bundler: choice, askUser });
        }
        // 无 askUser 回调：buildUserScript 内部有默认 prompt 实现
        return buildUserScriptImpl(this.vfs, opts);
    }

    /** 当前 VFS 快照（导出用） */
    exportProject() {
        return { files: this.vfs.tree(), history: this.getHistory() };
    }
}

export default ScratchAgent;
