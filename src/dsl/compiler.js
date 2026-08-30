import {
    event_whenflagclicked
} from "./scratchblocks/hat.js";
import {
    motion_movesteps,
    motion_turnright,
    motion_turnleft,
    motion_direction
} from "./scratchblocks/motion.js";
import {
    math_number
} from "./scratchblocks/inputs.js";

const compiler = (code) => {
    globalThis.blocks = [];
    globalThis.__currentBlocks = null;
    eval(code);
    const result = globalThis.blocks;
    globalThis.blocks = [];
    globalThis.__currentBlocks = null;
    return result;
};

export default compiler;