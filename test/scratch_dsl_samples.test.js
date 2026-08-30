import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compiler from "../src/dsl/compiler.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(testDir, "outputs");
const definitions = JSON.parse(
    fs.readFileSync(path.join(testDir, "../src/dsl/scratchblocks/scratch_blocks.json"), "utf8")
);

fs.mkdirSync(outputDir, { recursive: true });

const validateResult = (result) => {
    assert.ok(Array.isArray(result));
    for (const stack of result) {
        assert.ok(stack && typeof stack.blocks === "object");
        for (const [id, block] of Object.entries(stack.blocks)) {
            assert.equal(block.id, id);
            if (block.parent !== null) assert.ok(stack.blocks[block.parent]);
            if (block.next !== null) assert.ok(stack.blocks[block.next]);
            for (const input of Object.values(block.inputs ?? {})) {
                if (input.block !== undefined && input.block !== null && Object.hasOwn(stack.blocks, input.block)) {
                    assert.equal(stack.blocks[input.block].parent, block.id);
                }
                if (input.shadow !== undefined && input.shadow !== null && Object.hasOwn(stack.blocks, input.shadow)) {
                    assert.ok(stack.blocks[input.shadow]);
                }
            }
            if (block.topLevel) assert.equal(block.parent, null);
        }
    }
};

const compileAndWrite = (name, code) => {
    const result = compiler(code);
    validateResult(result);
    fs.writeFileSync(path.join(outputDir, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
    return result;
};

const samples = {
    motionAndLooks: `
new event.whenflagclicked(() => {
    motion.gotoxy(math_number(-120), math_number(80));
    motion.glidesecstoxy(math_number(1), math_number(0), math_number(0));
    motion.turnright(math_number(45));
    looks.say("hello Scratch");
    looks.sayforsecs("testing", math_number(2));
    looks.changesizeby(math_number(-10));
});
`,
    reportersAndBooleans: `
new event.whenflagclicked(() => {
    motion.movesteps(operators.operator_add(math_number(10), math_number(5)));
    looks.say(operators.operator_join("x=", motion.xposition()));
    control.if(operators.operator_gt(motion.direction(), math_number(0)), math_number(1));
    sensing.touchingobject("mouse-pointer");
    sensing.mousedown();
});
`,
    dataSoundAndPen: `
new event.whenflagclicked(() => {
    data.setvariableto("score", math_number(0));
    data.changevariableby("score", math_number(1));
    data.addtolist("item", "items");
    sound.setvolumeto(math_number(75));
    sound.changevolumeby(math_number(-5));
    pen.penDown();
    pen.setPenSizeTo(math_number(3));
    pen.penUp();
});
`,
    multipleHatsAndDefaults: `
new event.whenflagclicked(() => {
    motion.movesteps();
    motion.turnright();
    control.wait();
});
new event.whenkeypressed("space", () => {
    event.broadcast("message1");
});
new event.whenbackdropswitchesto("backdrop1", () => {
    looks.nextbackdrop();
});
`,
    extensions: `
new videoSensing.video_on(10, () => {
    videoSensing.video_move("on");
    text2speech.speakAndWait("testing");
    translate.getTranslate("hello", "es");
    speech2text.listenAndWait();
    wedo2.motorOnFor("motor A", math_number(1));
    microbit.displayText("Hi");
    boost.motorOff("motor A");
    gdx_for.getForce();
    ev3.beep(math_number(1));
});
`
};

for (const [name, code] of Object.entries(samples)) compileAndWrite(name, code);

const argumentValue = (argument, index) => {
    if (argument.menu) return JSON.stringify(`menu-${index}`);
    if (argument.field) return JSON.stringify(`field-${index}`);
    if (["NUMBER", "ANGLE", "INTEGER"].includes(argument.type)) return `math_number(${index})`;
    if (argument.type === "BOOLEAN") return `operators.operator_equals(math_number(${index}), math_number(${index}))`;
    return JSON.stringify(`text-${index}`);
};

const exhaustiveCalls = [];
const exhaustiveHats = [];
let valueIndex = 1;
for (const categoryGroup of Object.values(definitions.categories)) {
    for (const [namespace, namespaceDefinition] of Object.entries(categoryGroup)) {
        for (const block of namespaceDefinition.blocks ?? []) {
            const functionName = block.opcode.startsWith(`${namespace}_`)
                ? block.opcode.slice(namespace.length + 1)
                : block.opcode;
            const argumentsList = Object.values(block.arguments ?? {});
            if (block.blockType === "HAT") {
                const values = argumentsList.map((argument) => {
                    const index = valueIndex++;
                    if (argument.menu || argument.field) return JSON.stringify(`hat-${index}`);
                    if (["NUMBER", "ANGLE", "INTEGER"].includes(argument.type)) return String(index);
                    if (argument.type === "BOOLEAN") return "true";
                    return JSON.stringify(`hat-${index}`);
                });
                exhaustiveHats.push(
                    `new ${namespace}.${functionName}(${[...values, "() => {}"].join(", ")});`
                );
            } else {
                const values = argumentsList.map((argument) => argumentValue(argument, valueIndex++));
                exhaustiveCalls.push(`${namespace}.${functionName}(${values.join(", ")});`);
            }
        }
    }
}

const exhaustiveResult = compileAndWrite(
    "all-defined-blocks",
    `new event.whenflagclicked(() => {\n${exhaustiveCalls.map((call) => `    ${call}`).join("\n")}\n});\n${exhaustiveHats.join("\n")}`
);
const exhaustiveOpcodes = new Set(
    exhaustiveResult.flatMap((stack) => Object.values(stack.blocks).map((block) => block.opcode))
);
const definedOpcodes = Object.values(definitions.categories).flatMap((group) =>
    Object.values(group).flatMap((namespace) => (namespace.blocks ?? []).map((block) => block.opcode))
);
for (const opcode of definedOpcodes) assert.ok(exhaustiveOpcodes.has(opcode), `${opcode} was not compiled`);

assert.throws(() => compiler("motion.movesteps(math_number(1));"), /No active Scratch stack/);
assert.doesNotThrow(() => compiler("new event.whenflagclicked(() => {});"));
console.log(`Scratch DSL samples passed; outputs written to ${outputDir}`);