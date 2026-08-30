import { BlocksStack } from "../blocksStack/blocksStack.js";

export function event_whenflagclicked(substack) {
    const stack = new BlocksStack();
    globalThis.__currentBlocks = stack;
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    stack.pushControl(id, {
        opcode: "event_whenflagclicked",
        inputs: {},
        fields: {},
        shadow: false
    }, true);
    substack();
    if (!globalThis.blocks) globalThis.blocks = [];
    globalThis.blocks.push(stack);
    globalThis.__currentBlocks = null;
}