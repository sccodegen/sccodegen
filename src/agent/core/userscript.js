/**
 * buildUserScript —— 把 VFS 中的 Scratch 作品编译为用户脚本（Tampermonkey）
 *
 * 两种产物（按需求"两者都要"）：
 *   A. 单文件用户脚本：头部 + 内联编译结果 + 紧凑的"页面加载后自动应用积木"运行时，
 *      可直接粘贴进 Tampermonkey 安装，无需本地构建。
 *   B. 源码 + 构建配置：生成入口源码、所选构建工具（vite/tsup/esbuild）的配置与
 *      构建命令说明，供用户本地构建扩展版。
 *
 * 构建工具选择前会列出各工具优缺点并询问用户（通过可注入的 askUser 回调；
 * 在本仓库开发环境中由 ask_user_question 提供）。
 */

import { compileSpriteCode, serializeStacks } from "./compile.js";

// ---------------- 用户脚本头部 ----------------

export const DEFAULT_HEADER = `// ==UserScript==
// @name         ScCodeGen - AI Scratch 代码生成
// @namespace    https://github.com/sccodegen/sccodegen
// @version      0.1.0
// @description  在 Scratch 编辑器中用 AI 智能体生成并应用积木（puter 匿名模式）
// @author       XQYWorld
// @match        https://scratch.mit.edu/projects/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @require      https://js.puter.com/v2/
// @run-at       document-idle
// @noframes
// ==/UserScript==`;

// ---------------- 构建工具优缺点 ----------------

export const BUILD_TOOLS = {
    esbuild: {
        name: "esbuild",
        pros: [
            "构建速度最快（Go 编写），对单文件用户脚本这种小目标几乎是即时的",
            "零配置起步：一条命令即可打包成单文件 IIFE，并用 --banner 注入用户脚本头部",
            "产物体积最小、依赖最少，无需额外插件",
        ],
        cons: [
            "没有开发服务器 / HMR，调试迭代不如 vite 方便",
            "插件生态远小于 vite，复杂自定义（如按需转换、多入口模板）要自己写脚本",
        ],
    },
    tsup: {
        name: "tsup",
        pros: [
            "基于 esbuild，速度同样快，但提供更友好的零配置默认值",
            "专注库/工具打包：多格式输出、自动生成类型声明、banner 注入都内置",
            "配置比 esbuild 少写很多样板",
        ],
        cons: [
            "比 esbuild 多一层抽象，极端场景仍要透传 esbuild 配置",
            "无 HMR；对非库项目（用户脚本）部分功能用不上",
        ],
    },
    vite: {
        name: "vite",
        pros: [
            "生态最丰富、插件最多（如 vite-plugin-monkey 可自动生成用户脚本头部）",
            "开发模式 HMR 体验最好，适合边改边看",
        ],
        cons: [
            "为应用开发设计，对单文件用户脚本偏重：配置与依赖更多",
            "构建产物偏大、构建速度不如 esbuild，需要额外插件处理头部",
        ],
    },
};

/** 生成某构建工具的配置说明文本 */
export function bundlerInfo(bundler) {
    const t = BUILD_TOOLS[bundler];
    if (!t) throw new Error(`未知构建工具：${bundler}（可选：${Object.keys(BUILD_TOOLS).join("/")}）`);
    return (
        `${t.name} 优缺点：\n` +
        `  优点：${t.pros.map((p) => `- ${p}`).join("\n        ")}\n` +
        `  缺点：${t.cons.map((c) => `- ${c}`).join("\n        ")}`
    );
}

// ---------------- 单文件运行时模板 ----------------

const RUNTIME_TEMPLATE = `(function () {
    "use strict";
    // ScCodeGen 自动应用运行时（由 buildUserScript 生成，勿手改）
    // __PROJECT__ 处嵌入编译结果：{ "<角色id>": [{ "blocks": { ... } }, ...], ... }

    var PROJECT = __PROJECT__;

    function getVm() {
        try {
            if (typeof unsafeWindow !== "undefined" && unsafeWindow.vm) return unsafeWindow.vm;
            if (globalThis && globalThis.unsafeWindow && globalThis.unsafeWindow.vm) return globalThis.unsafeWindow.vm;
            if (globalThis && globalThis.vm) return globalThis.vm;
        } catch (e) {}
        return null;
    }

    function isSprite(t) { return t && typeof t.isSprite === "function" && t.isSprite() && !(typeof t.isStage === "function" && t.isStage()); }

    function resolveTargetId(vm, spriteId) {
        var targets = (vm.runtime && vm.runtime.targets) || [];
        for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            var name = typeof t.getName === "function" ? t.getName() : t.name;
            if (t.id === spriteId || name === spriteId) return t.id;
        }
        return null;
    }

    function ensureSprite(vm, spriteId) {
        var existing = resolveTargetId(vm, spriteId);
        if (existing) return Promise.resolve(existing);
        var donor = (vm.runtime && vm.runtime.targets || []).filter(isSprite)[0];
        if (donor && typeof vm.duplicateSprite === "function") {
            return vm.duplicateSprite(donor.id).then(function () {
                var dups = (vm.runtime && vm.runtime.targets || []).filter(function (t) { return isSprite(t) && t.id !== donor.id; });
                var dup = dups[dups.length - 1];
                if (!dup) throw new Error("自动创建角色 " + spriteId + " 失败");
                return typeof vm.renameSprite === "function" ? vm.renameSprite(dup.id, spriteId).then(function () { return dup.id; }) : dup.id;
            });
        }
        if (typeof vm.addSprite !== "function") return Promise.reject(new Error("无法自动创建角色 " + spriteId));
        var stage = (vm.runtime && typeof vm.runtime.getTargetForStage === "function" && vm.runtime.getTargetForStage())
            || (vm.runtime && vm.runtime.targets || []).filter(function (t) { return t.isStage && t.isStage(); })[0];
        var c = stage && typeof stage.getCostumes === "function" ? stage.getCostumes()[0] : null;
        var spriteJson = {
            isStage: false, name: spriteId, visible: true, x: 0, y: 0, size: 100, direction: 90,
            draggable: false, rotationStyle: "all around",
            costumes: c ? [{ name: "costume1", assetId: c.assetId || (c.asset && c.asset.assetId), md5ext: c.md5ext || (c.asset && c.asset.md5ext), dataFormat: c.dataFormat || (c.asset && c.asset.dataFormat), rotationCenterX: c.rotationCenterX || 0, rotationCenterY: c.rotationCenterY || 0, bitmapResolution: c.bitmapResolution || 1 }] : [],
            sounds: [], blocks: {}, variables: {}, lists: {}, broadcasts: {}, comments: {}
        };
        return vm.addSprite(spriteJson).then(function () { return resolveTargetId(vm, spriteId); });
    }

    function clearBlocks(vm, targetId) {
        vm.setEditingTarget(targetId);
        var blocks = vm.editingTarget.blocks;
        if (typeof blocks.getScripts === "function") {
            var scripts = blocks.getScripts().slice();
            for (var i = 0; i < scripts.length; i++) blocks.deleteBlock(scripts[i]);
        } else {
            var dict = blocks._blocks || blocks.blocks || {};
            var ids = Object.keys(dict);
            for (var j = 0; j < ids.length; j++) {
                var b = dict[ids[j]];
                if (b && (b.topLevel || b.parent === null)) blocks.deleteBlock(ids[j]);
            }
        }
    }

    function applySprite(vm, spriteId, stacks) {
        return ensureSprite(vm, spriteId).then(function (targetId) {
            vm.setEditingTarget(targetId);
            var blocks = vm.editingTarget.blocks;
            clearBlocks(vm, targetId);
            var count = 0;
            for (var s = 0; s < stacks.length; s++) {
                var stackBlocks = stacks[s].blocks || {};
                var ids = Object.keys(stackBlocks);
                for (var k = 0; k < ids.length; k++) {
                    blocks.createBlock(stackBlocks[ids[k]]);
                    count++;
                }
            }
            return { targetId: targetId, count: count };
        });
    }

    function main() {
        var vm = getVm();
        if (!vm || !vm.runtime || !vm.editingTarget) {
            console.error("[ScCodeGen] unsafeWindow.vm 不存在，脚本结束运行");
            return;
        }
        var spriteIds = Object.keys(PROJECT);
        var chain = Promise.resolve();
        var applied = [];
        spriteIds.forEach(function (spriteId) {
            chain = chain.then(function () {
                return applySprite(vm, spriteId, PROJECT[spriteId]).then(function (r) {
                    applied.push(spriteId + "：" + r.count + " 个积木");
                });
            });
        });
        chain.then(function () {
            if (typeof vm.emitWorkspaceUpdate === "function") vm.emitWorkspaceUpdate();
            if (typeof vm.emitTargetsUpdate === "function") vm.emitTargetsUpdate();
            console.log("[ScCodeGen] 已应用：" + applied.join("，"));
        }).catch(function (e) {
            console.error("[ScCodeGen] 应用失败：", e && e.message ? e.message : e);
        });
    }

    if (document.readyState === "complete") main();
    else window.addEventListener("load", main);
})();
`;

// ---------------- 组装 ----------------

/** 编译 VFS 中所有角色，返回 {ok, project, errors, summary} */
export function compileProject(vfs) {
    const spriteIds = vfs.sprites();
    const project = {};
    const errors = [];
    const summary = [];
    for (const id of spriteIds) {
        const code = vfs.readSpriteCode(id);
        if (code === null) continue; // 目录存在但还没有 code.js，跳过
        const r = compileSpriteCode(id, code);
        if (!r.ok) {
            errors.push({ sprite: id, error: r.error, location: r.location });
        } else {
            project[id] = serializeStacks(r.stacks);
            summary.push({ sprite: id, stacks: r.stacks.length, blocks: r.blocks.length });
        }
    }
    return { ok: errors.length === 0, project, errors, summary };
}

/** 产物 A：单文件用户脚本 */
export function assembleSingleFile(project, { header = DEFAULT_HEADER } = {}) {
    const embedded = JSON.stringify(project, null, 2).replace(/<\/script>/g, "<\\/script>");
    return `${header}\n\n${RUNTIME_TEMPLATE.replace("__PROJECT__", embedded)}`;
}

/** 产物 B：esbuild 配置 + 入口源码 + 构建说明（同一运行时，可编辑扩展） */
export function assembleBuildSources(project, { bundler = "esbuild", header = DEFAULT_HEADER } = {}) {
    const mainSource = `// ScCodeGen 用户脚本入口（由 buildUserScript 生成）
${RUNTIME_TEMPLATE.replace("__PROJECT__", JSON.stringify(project))}
`;
    const config = `// ${bundler} 构建配置（由 buildUserScript 生成）
import { build } from "${bundler}";
import { readFileSync } from "node:fs";

const header = readFileSync(new URL("./userscript.header.js", import.meta.url), "utf8");

await build({
    entryPoints: ["userscript.main.js"],
    bundle: true,
    format: "iife",
    outfile: "dist/scodegen.user.js",
    banner: { js: header },
    target: ["es2020"],
});
`;
    const headerFile = header;
    const readme = `# 构建用户脚本（${bundler}）

1. \`npm i -D ${bundler}\`
2. \`node esbuild.config.mjs\`（若选 vite/tsup 请按对应工具的 CLI 或配置等价转换）
3. 安装 dist/scodegen.user.js 到 Tampermonkey

注意：若用 vite 构建，可用 vite-plugin-monkey 生成头部；本配置默认按 esbuild 输出。
`;
    return { mainSource, config, headerFile, readme, bundler };
}

/**
 * 完整构建流程：询问构建工具 → 编译 VFS → 产出两种形态
 * @param {object} vfs
 * @param {object} [opts] {bundler?, header?, askUser?}
 * @returns {Promise<{bundler:string, singleFile:string, sources:object, summary:Array, errors:Array}>}
 */
export async function buildUserScript(vfs, opts = {}) {
    const askUser = opts.askUser ?? defaultAskUser;
    let bundler = opts.bundler;
    if (!bundler) {
        bundler = await askUser({
            question: "编译为用户脚本，请选择构建工具（优缺点如下）：",
            options: Object.values(BUILD_TOOLS).map((t) => ({
                id: t.name,
                label: t.name,
                description: `优点：${t.pros.join("；")}。缺点：${t.cons.join("；")}`,
            })),
        });
        if (!bundler) throw new Error("未选择构建工具，已取消");
    }
    const { ok, project, errors, summary } = compileProject(vfs);
    if (!ok) {
        return {
            bundler,
            ok: false,
            errors,
            summary,
            message: errors
                .map((e) => `/${e.sprite}/code.js：${e.error}（第 ${e.location?.line ?? "?"} 行）`)
                .join("\n"),
        };
    }
    const singleFile = assembleSingleFile(project, { header: opts.header });
    const sources = assembleBuildSources(project, { bundler, header: opts.header });
    return { bundler, ok: true, singleFile, sources, summary, errors };
}

/** 默认询问实现：浏览器用 prompt 列选项；无可用 UI 时抛错 */
async function defaultAskUser({ question, options }) {
    const lines = options.map((o, i) => `${i + 1}. ${o.label} —— ${o.description}`).join("\n");
    if (typeof prompt === "function") {
        const answer = prompt(`${question}\n\n${lines}\n\n请输入编号：`);
        const idx = Number(answer) - 1;
        return options[idx] ? options[idx].id : null;
    }
    throw new Error(`需要注入 askUser 回调来选择构建工具。选项：\n${lines}`);
}

export default buildUserScript;
