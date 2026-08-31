import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlocksStack } from "../blocksStack/blocksStack.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 积木定义仅作为数据源，保持原样
const blocksDef = JSON.parse(
    fs.readFileSync(path.join(__dirname, "scratch_blocks.json"), "utf8")
);

const genId = () =>
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const getCurrentBlocks = () => {
    if (globalThis.__currentBlocks) return globalThis.__currentBlocks;
    if (globalThis.blocks && globalThis.blocks.length) return globalThis.blocks[globalThis.blocks.length - 1];
    return null;
};

const getCurrentFlowParent = (stack) => {
    if (!stack || !stack.controlFlowIds || !stack.controlFlowIds.length) return null;
    return stack.controlFlowIds[stack.controlFlowIds.length - 1];
};

const buildInputsAndFields = (argDefs, resolved) => {
    const inputs = {};
    const fields = {};
    Object.entries(argDefs).forEach(([name, argDef], index) => {
        if (argDef.menu || argDef.field) {
            fields[name] = { id: undefined, name, value: resolved[index] };
        } else if (argDef.type === "SUBSTACK") {
            inputs[name] = { name, block: null, shadow: null };
        } else {
            // 其它参数作为输入积木
            inputs[name] = { name, block: resolved[index], shadow: resolved[index] };
        }
    });
    return { inputs, fields };
};

// 根据单个积木定义生成对应的积木函数
export const makeBlockFn = (blockDef) => {
    const { opcode, blockType, arguments: argDefs = {} } = blockDef;
    const argNames = Object.keys(argDefs);
    const defaults = {};
    for (const [name, def] of Object.entries(argDefs)) {
        if (def.defaultValue !== undefined) defaults[name] = def.defaultValue;
    }

    return function blockFn(...values) {
        const resolved = argNames.map((name, index) =>
            values[index] !== undefined ? values[index] : defaults[name]
        );

        if (blockType === "HAT") {
            // HAT 积木：创建新的栈并执行子栈
            const stack = new BlocksStack();
            globalThis.__currentBlocks = stack;
            const id = genId();
            const { inputs, fields } = buildInputsAndFields(argDefs, resolved);
            stack.pushControl(id, { opcode, inputs, fields, shadow: false }, true);
            const substack = values[argNames.length];
            if (typeof substack === "function") substack();
            if (!globalThis.blocks) globalThis.blocks = [];
            globalThis.blocks.push(stack);
            globalThis.__currentBlocks = null;
            return id;
        }

        const stack = getCurrentBlocks();
        if (!stack) throw new Error("No active Scratch stack");
        const id = genId();
        const { inputs, fields } = buildInputsAndFields(argDefs, resolved);

        const isReporter = blockType === "REPORTER" || blockType === "BOOLEAN";
        if (isReporter) {
            const parentId = getCurrentFlowParent(stack);
            stack.push(id, { opcode, inputs, fields, shadow: false, next: null }, parentId, false);
        } else {
            stack.pushControl(id, { opcode, inputs, fields, shadow: false, next: null });
        }

        for (const [name, argDef] of Object.entries(argDefs)) {
            const value = values[Object.keys(argDefs).indexOf(name)];
            if (argDef.type === "SUBSTACK" && typeof value === "function") {
                const savedFlow = stack.controlFlowIds.slice();
                stack.controlFlowIds = [];
                value();
                const firstSubstackId = stack.controlFlowIds[0] ?? null;
                stack.controlFlowIds = savedFlow;
                if (firstSubstackId && stack.blocks[firstSubstackId]) {
                    inputs[name] = { name, block: firstSubstackId, shadow: null };
                    stack.blocks[firstSubstackId].parent = id;
                } else {
                    inputs[name] = { name, block: null, shadow: null };
                }
            }
        }

        // 把作为输入的子积木的 parent 指向当前积木
        Object.values(inputs).forEach((input) => {
            if (input.block && stack.blocks[input.block]) {
                stack.linkChildToParent(input.block, id);
            }
        });

        return id;
    };
};

// 从 JSON 自动生成积木上下文，使用 getter / setter 惰性生成积木函数
export const buildContext = () => {
    const context = {};
    for (const categoryGroup of Object.values(blocksDef.categories)) {
        for (const [nsName, nsDef] of Object.entries(categoryGroup)) {
            if (!nsDef.blocks) continue;
            const namespace = (context[nsName] = context[nsName] || {});
            for (const blockDef of nsDef.blocks) {
                // motion_movesteps -> motion.movesteps
                const fnName = blockDef.opcode.startsWith(nsName + "_")
                    ? blockDef.opcode.slice(nsName.length + 1)
                    : blockDef.opcode;
                let cached = null;
                Object.defineProperty(namespace, fnName, {
                    get() {
                        return cached ?? (cached = makeBlockFn(blockDef));
                    },
                    set(value) {
                        cached = value;
                    },
                    configurable: true,
                    enumerable: true,
                });
            }
        }
    }
    return context;
};
