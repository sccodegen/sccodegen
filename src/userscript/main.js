/**
 * ScCodeGen 完整智能体用户脚本入口
 *
 * 由 esbuild 打包成单文件用户脚本（scripts/build-userscript.mjs），安装到
 * Tampermonkey 后在 scratch.mit.edu 作品页提供一个 AI 编程面板：
 *   - 对话输入：用 puter 匿名模式（免费模型、≤10 RPM）驱动智能体
 *   - read/write/edit 操作 VFS（localStorage 持久化），commit 应用到 Scratch VM
 *   - 修改前/修改后版本切换、编译为用户脚本、导出项目
 *
 * 注意：本入口依赖用户脚本头部 @require https://js.puter.com/v2/ 提供的全局 puter，
 * 以及 Tampermonkey 提供的 unsafeWindow（.vm = Scratch VM）。
 */

import { ScratchAgent } from "../agent/core/index.js";

const VM_MISSING_MSG = "unsafeWindow.vm 不存在，脚本结束运行";

function getVm() {
    try {
        if (typeof unsafeWindow !== "undefined" && unsafeWindow.vm) return unsafeWindow.vm;
        if (globalThis && globalThis.unsafeWindow && globalThis.unsafeWindow.vm) {
            return globalThis.unsafeWindow.vm;
        }
    } catch {
        // 忽略
    }
    return null;
}

function injectStyle(css) {
    if (typeof GM_addStyle === "function") {
        GM_addStyle(css);
        return;
    }
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
}

const CSS = `
#scodegen-panel {
    position: fixed; right: 12px; bottom: 12px; z-index: 999999;
    width: 360px; max-height: 70vh; display: flex; flex-direction: column;
    font: 13px/1.5 system-ui, sans-serif; color: #333;
    background: #fff; border: 1px solid #d9e3f0; border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0,0,0,.18); overflow: hidden;
}
#scodegen-panel header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: #4c97ff; color: #fff; font-weight: 600;
}
#scodegen-panel header .close { cursor: pointer; border: 0; background: none; color: #fff; font-size: 16px; }
#scodegen-log {
    flex: 1; overflow: auto; padding: 8px 12px; background: #f7fafd;
    white-space: pre-wrap; word-break: break-word; max-height: 260px;
}
#scodegen-log .err { color: #d1495b; }
#scodegen-log .ok { color: #2e8b57; }
#scodegen-log .info { color: #7a8699; }
#scodegen-input {
    border: 0; border-top: 1px solid #e3ecf5; padding: 10px 12px; resize: none;
    font: inherit; outline: none; min-height: 64px;
}
#scodegen-tools {
    display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid #e3ecf5;
    flex-wrap: wrap;
}
#scodegen-tools button {
    font: inherit; padding: 4px 10px; border: 1px solid #bcd3ef; border-radius: 6px;
    background: #fff; cursor: pointer;
}
#scodegen-tools button:hover { background: #eef5ff; }
#scodegen-send {
    margin: 0 12px 10px; padding: 8px; border: 0; border-radius: 8px;
    background: #4c97ff; color: #fff; font-weight: 600; cursor: pointer;
}
`;

function log(el, text, cls = "info") {
    const line = document.createElement("div");
    line.className = cls;
    line.textContent = text;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function download(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildPanel(agent, vm) {
    const panel = document.createElement("div");
    panel.id = "scodegen-panel";
    panel.innerHTML = `
        <header><span>ScCodeGen 智能体</span><button class="close" title="关闭">✕</button></header>
        <div id="scodegen-log"></div>
        <textarea id="scodegen-input" placeholder="描述你的 Scratch 需求，例如：让小猫按 WASD 移动……"></textarea>
        <div id="scodegen-tools">
            <button data-act="commit">应用(commit)</button>
            <button data-act="before">切到修改前</button>
            <button data-act="after">切到修改后</button>
            <button data-act="build">编译为用户脚本</button>
            <button data-act="export">导出项目</button>
        </div>
        <button id="scodegen-send">发送给智能体</button>
    `;
    const logEl = panel.querySelector("#scodegen-log");
    const input = panel.querySelector("#scodegen-input");
    const send = panel.querySelector("#scodegen-send");

    panel.querySelector(".close").addEventListener("click", () => panel.remove());
    send.addEventListener("click", async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        log(logEl, "▶ " + text, "info");
        send.disabled = true;
        try {
            const reply = await agent.run(text);
            log(logEl, "🤖 " + reply, "ok");
        } catch (e) {
            log(logEl, "✗ " + (e && e.message), "err");
        } finally {
            send.disabled = false;
        }
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send.click();
        }
    });
    panel.querySelectorAll("#scodegen-tools button").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const act = btn.dataset.act;
            try {
                if (act === "commit") {
                    const r = await agent.commit("（面板手动应用当前 VFS）");
                    log(logEl, r.success ? "✓ " + r.diffText : "✗ " + (r.errorText || r.error), r.success ? "ok" : "err");
                } else if (act === "before" || act === "after") {
                    const h = agent.getHistory();
                    if (!h.length) return log(logEl, "还没有提交历史", "info");
                    const r = agent.switchVersion(h.length - 1, act);
                    log(logEl, r.success ? `✓ 已切换到${act === "before" ? "修改前" : "修改后"}` : "✗ " + r.error, r.success ? "ok" : "err");
                } else if (act === "build") {
                    log(logEl, "⏳ 正在编译为用户脚本……", "info");
                    const built = await agent.buildUserScript();
                    if (!built.ok) return log(logEl, "✗ " + built.message, "err");
                    download("scodegen-project.user.js", built.singleFile);
                    log(logEl, `✓ 已生成单文件用户脚本（${built.singleFile.length} 字符），另生成了 ${built.bundler} 源码/配置`, "ok");
                } else if (act === "export") {
                    download(`scodegen-project-${Date.now()}.json`, JSON.stringify(agent.exportProject(), null, 2));
                    log(logEl, "✓ 已导出项目 JSON", "ok");
                }
            } catch (e) {
                log(logEl, "✗ " + (e && e.message), "err");
            }
        });
    });
    document.body.appendChild(panel);
    log(logEl, "ScCodeGen 已就绪。描述需求即可开始（puter 匿名模式，≤10 RPM）。", "info");
}

function main() {
    const vm = getVm();
    if (!vm) {
        console.error("[ScCodeGen] " + VM_MISSING_MSG);
        // 页面没有 Scratch VM（未进入编辑器 / 加载失败）时直接结束运行
        return;
    }
    injectStyle(CSS);
    const agent = new ScratchAgent({ vm });
    buildPanel(agent, vm);
}

if (document.readyState === "complete") main();
else window.addEventListener("load", main);
