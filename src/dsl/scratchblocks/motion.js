const getCurrentBlocks = () => {
    if (globalThis.__currentBlocks) return globalThis.__currentBlocks;
    if (globalThis.blocks && globalThis.blocks.length) return globalThis.blocks[globalThis.blocks.length - 1];
    return null;
};

const attachInputParent = (stack, parentId, childId) => {
    if (!stack || !parentId || !childId || !stack.blocks[childId]) return;
    stack.linkChildToParent(childId, parentId);
};

const getCurrentFlowParent = (stack) => {
    if (!stack || !stack.controlFlowIds || !stack.controlFlowIds.length) return null;
    return stack.controlFlowIds[stack.controlFlowIds.length - 1];
};

export function motion_movesteps(steps) {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    stack.pushControl(id, {
        opcode: "motion_movesteps",
        inputs: {
            STEPS: {
                name: "STEPS",
                block: steps,
                shadow: steps
            }
        },
        fields: {},
        shadow: false,
        next: null
    });
    attachInputParent(stack, id, steps);
    return id;
}

export function motion_turnright(degrees) {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    stack.pushControl(id, {
        opcode: "motion_turnright",
        inputs: {
            DEGREES: {
                name: "DEGREES",
                block: degrees,
                shadow: degrees
            }
        },
        fields: {},
        shadow: false,
        next: null
    });
    attachInputParent(stack, id, degrees);
    return id;
};

export function motion_turnleft(degrees) {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    stack.pushControl(id, {
        opcode: "motion_turnleft",
        inputs: {
            DEGREES: {
                name: "DEGREES",
                block: degrees,
                shadow: degrees
            }
        },
        fields: {},
        shadow: false,
        next: null
    });
    attachInputParent(stack, id, degrees);
    return id;
};

export function motion_direction() {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const stack = getCurrentBlocks();
    if (!stack) throw new Error("No active Scratch stack");

    const parentId = getCurrentFlowParent(stack);
    stack.push(id, {
        opcode: "motion_direction",
        inputs: {},
        fields: {},
        shadow: false,
        next: null
    }, parentId, false);
    return id;
}