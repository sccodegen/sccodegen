import { buildContext } from "./scratchblocks/context.js";
import { math_number, text } from "./scratchblocks/inputs.js";

const compiler = (code) => {
    globalThis.blocks = [];
    globalThis.__currentBlocks = null;
    const context = buildContext();
    // 注入特殊积木到各命名空间，方便 eval 内直接访问
    globalThis.math_number = math_number;
    for (const ns of Object.values(context)) {
        if (!ns.math_number) ns.math_number = math_number;
    }
    globalThis.__blockContext = context;
    // 展开到顶层命名空间（motion / event / looks ...）
    Object.assign(globalThis, context);
    eval(code);
    const result = globalThis.blocks;
    globalThis.blocks = [];
    globalThis.__currentBlocks = null;
    delete globalThis.__blockContext;
    return result;
};

export default compiler;