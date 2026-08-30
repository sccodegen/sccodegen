import assert from "node:assert/strict";
import compiler from "../src/dsl/compiler.js";

const code = `
new event.whenflagclicked(() => {
    control.forever(() => {
        motion.movesteps(math_number(10));
        motion.turnright(math_number(15));
    });
});
`;

const result = compiler(code);
console.log("Compiled blocks:", JSON.stringify(result, null, 2));
const stack = result[0];
const blocks = stack.blocks;

const byOpcode = (opcode, value = undefined) => {
    const matches = Object.values(blocks).filter((block) => block.opcode === opcode);
    if (value === undefined) return matches[0];
    return matches.find((block) => block.fields?.NUM?.value === value);
};

const forever = byOpcode("control_forever");
const moveSteps = byOpcode("motion_movesteps");
const turnRight = byOpcode("motion_turnright");
const number10 = byOpcode("math_number", 10);
const number15 = byOpcode("math_number", 15);
const hat = byOpcode("event_whenflagclicked");

assert.equal(hat.next, forever.id);
assert.equal(forever.parent, hat.id);
assert.equal(forever.next, null);
assert.equal(moveSteps.parent, forever.id);
assert.equal(moveSteps.next, turnRight.id);
assert.equal(turnRight.parent, moveSteps.id);
assert.equal(turnRight.next, null);
assert.equal(forever.inputs.SUBSTACK.block, moveSteps.id);
assert.equal(forever.inputs.SUBSTACK.shadow, null);
assert.equal(number10.parent, moveSteps.id);
assert.equal(number15.parent, turnRight.id);
console.log("C-block forever regression test passed");