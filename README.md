# ScCodeGen (SCG)

## 使用示例

先安装该库

```bash
npm install sccodegen --save
```

### JS-like Scratch DSL

```js
import { compiler } from 'sccodegen';
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

const stacks = compiler(code);
console.log(stacks[0].blocks);
```

## 目录结构
src/
    dsl/                            // 一种专门用于Scratch的DSL
        blocksStack/                // 积木段
            blocksStack.js
        scratchblocks/              // 用于生成Scratch积木
            context.js
            inputs.js
            scratch_blocks.json
        compiler.js                 // 编译器，把DSL转换为Scratch积木
    agent/
        core/
    index.js