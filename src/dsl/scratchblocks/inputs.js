const getCurrentBlocks = () => {
    if (globalThis.__currentBlocks) return globalThis.__currentBlocks;
    if (globalThis.blocks && globalThis.blocks.length) return globalThis.blocks[globalThis.blocks.length - 1];
    return null;
};

export function math_number(value) {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    const parentId = stack.controlFlowIds && stack.controlFlowIds.length ? stack.controlFlowIds[stack.controlFlowIds.length - 1] : null;
    stack.push(id, {
        opcode: "math_number",
        fields: {
            NUM: {
                id: undefined,
                name: "NUM",
                value: value
            }
        },
        inputs: {},
        shadow: true,
        next: null
    }, parentId, false);
    return id;
}

export function text(value) {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    const parentId = stack.controlFlowIds && stack.controlFlowIds.length ? stack.controlFlowIds[stack.controlFlowIds.length - 1] : null;
    stack.push(id, {
        opcode: "text",
        fields: {
            TEXT: {
                id: undefined,
                name: "TEXT",
                value: value
            }
        },
        inputs: {},
        shadow: true,
        next: null
    }, parentId, false);
    return id;
}