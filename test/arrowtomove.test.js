import compiler from "../src/dsl/compiler.js";

const code = `
new event.whenflagclicked(() => {
    control.forever(() => {
        control.if(sensing.keypressed(text("W")), () => {
            motion.changeyby(math_number(5));
        });
        control.if(sensing.keypressed(text("S")), () => {
            motion.changeyby(math_number(-5));
        });
        control.if(sensing.keypressed(text("A")), () => {
            motion.changexby(math_number(-5));
        });
        control.if(sensing.keypressed(text("D")), () => {
            motion.changexby(math_number(5));
        });
    });
});
`;

const result = compiler(code);
console.log("Compiled blocks:", JSON.stringify(result, null, 2));
const stack = result[0];
const blocks = stack.blocks;