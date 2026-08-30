import assert from "node:assert/strict";
import compiler from "../src/dsl/compiler.js";

const code = `
new event_whenflagclicked(() => {
    motion_movesteps(math_number(10));
    motion_turnright(math_number(15));
    motion_turnleft(motion_direction());
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

const hat = byOpcode("event_whenflagclicked");
const moveSteps = byOpcode("motion_movesteps");
const turnRight = byOpcode("motion_turnright");
const turnLeft = byOpcode("motion_turnleft");
const direction = byOpcode("motion_direction");
const number10 = byOpcode("math_number", 10);
const number15 = byOpcode("math_number", 15);

assert.equal(hat.parent, null);
assert.equal(hat.next, moveSteps.id);
assert.equal(moveSteps.parent, hat.id);
assert.equal(moveSteps.next, turnRight.id);
assert.equal(turnRight.parent, moveSteps.id);
assert.equal(turnRight.next, turnLeft.id);
assert.equal(turnLeft.parent, turnRight.id);
assert.equal(turnLeft.next, null);
assert.equal(direction.parent, turnLeft.id);
assert.equal(number10.parent, moveSteps.id);
assert.equal(number15.parent, turnRight.id);
assert.equal(moveSteps.inputs.STEPS.block, number10.id);
assert.equal(moveSteps.inputs.STEPS.shadow, number10.id);
assert.equal(turnRight.inputs.DEGREES.block, number15.id);
assert.equal(turnRight.inputs.DEGREES.shadow, number15.id);

console.log("parent chain test passed");