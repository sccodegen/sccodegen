/**
 * compile —— 编译单个角色的 code.js（Scratch DSL → 积木堆栈）
 *
 * 编译失败时返回错误信息和位置：出错文件（/<角色id>/code.js）以及从 V8
 * eval 堆栈中提取的行号/列号。
 */

import compiler from "../../dsl/compiler.js";

// V8 对 eval 代码的堆栈：运行时错误形如 "<anonymous>:LINE:COL"（精确位置）。
// 语法错误的 [eval]:LINE:COL 在模块上下文里是固定的假值，改用消息里的 token 启发式定位。
const LOC_RE = /<anonymous>:(\d+):(\d+)/;

// 从 SyntaxError 消息中提取出错的 token，如 "Unexpected identifier 'is'"、
// "Unexpected token '}'"; 然后在源码里找到该 token 首次出现的行。
const TOKEN_RE = /(?:Unexpected|Invalid|missing)\s+(?:identifier|token|number|string|character)\s*'([^']+)'/i;

export function locateSyntaxError(message, code) {
    const m = TOKEN_RE.exec(message);
    if (!m) return null;
    const token = m[1];
    const lines = code.split("\n");
    const idx = lines.findIndex((l) => l.includes(token));
    if (idx === -1) return null;
    return { line: idx + 1, column: lines[idx].indexOf(token) + 1 };
}

/**
 * 编译一个角色的 DSL 代码
 * @param {string} spriteId 角色 id（目录名）
 * @param {string} code     code.js 内容
 * @returns {{ok:true, stacks:Array, blocks:Array} | {ok:false, error:string, location:object}}
 */
export function compileSpriteCode(spriteId, code) {
    const file = `/${spriteId}/code.js`;
    if (typeof code !== "string" || !code.trim()) {
        return {
            ok: false,
            error: "code.js 内容为空",
            location: { sprite: spriteId, file, line: null, column: null },
        };
    }
    try {
        const stacks = compiler(code);
        return { ok: true, stacks, blocks: collectBlocks(stacks) };
    } catch (e) {
        const trace = String((e && e.stack) || e || "");
        const m = LOC_RE.exec(trace);
        let line = m ? Number(m[1]) : null;
        let column = m ? Number(m[2]) : null;
        // 语法错误：V8 不给真实位置，用 token 启发式定位
        if ((!line || !column) && e && e.name === "SyntaxError") {
            const loc = locateSyntaxError(e.message || "", code);
            if (loc) {
                line = loc.line;
                column = loc.column;
            }
        }
        return {
            ok: false,
            error: (e && e.message) || String(e),
            location: {
                sprite: spriteId,
                file,
                line,
                column,
            },
        };
    }
}

/** 把堆栈列表展平为积木数组（按插入顺序，父积木在前） */
export function collectBlocks(stacks) {
    const blocks = [];
    for (const stack of stacks || []) {
        if (stack && stack.blocks && typeof stack.blocks === "object") {
            for (const b of Object.values(stack.blocks)) blocks.push(b);
        }
    }
    return blocks;
}

/** 把堆栈列表转成可序列化形态（buildUserScript 嵌入用）：[{blocks:{...}}, ...] */
export function serializeStacks(stacks) {
    return (stacks || []).map((stack) => ({
        blocks: stack && stack.blocks ? stack.blocks : {},
    }));
}

export default compileSpriteCode;
