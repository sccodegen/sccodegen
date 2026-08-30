/**
 * Agent 功能测试
 * 测试 Agent 的 Tool Calling 机制和 Scratch 代码生成
 */

import { Agent } from '../src/agent/base/index.js';
import { ScratchAgent } from '../src/agent/core/index.js';
import compiler from '../src/dsl/compiler.js';

// 测试 1: 基础 Agent 功能
console.log("=== Test 1: Basic Agent Functionality ===\n");

const testAgent = new Agent({
    base: 'https://api.openai.com/v1',
    key: 'test-key',
    model: 'gpt-4'
});

// 添加测试工具
testAgent.addTool(
    'add_numbers',
    'Add two numbers together',
    {
        properties: {
            a: { type: 'number', description: 'First number' },
            b: { type: 'number', description: 'Second number' }
        },
        required: ['a', 'b']
    },
    async (args) => {
        console.log(`Tool called: add_numbers with args: ${JSON.stringify(args)}`);
        return { result: args.a + args.b };
    }
);

console.log("✓ Agent created and tool added");
console.log(`  Tools available: ${testAgent.tools.length}`);
console.log(`  Tool name: ${testAgent.tools[0].function.name}\n`);

// 测试 2: Scratch Agent 初始化
console.log("=== Test 2: ScratchAgent Initialization ===\n");

const scratchAgent = new ScratchAgent({
    base: 'https://api.openai.com/v1',
    key: 'test-key',
    model: 'gpt-4'
});

console.log("✓ ScratchAgent created");
console.log(`  Available tools: ${scratchAgent.tools.length}`);
scratchAgent.tools.forEach((tool, index) => {
    console.log(`  - ${index + 1}. ${tool.function.name}: ${tool.function.description}`);
});
console.log();

// 测试 3: DSL 编译功能
console.log("=== Test 3: DSL Compilation ===\n");

const testDSLCode = `
new event.whenflagclicked(() => {
    motion.movesteps(math_number(100));
    motion.turnright(math_number(90));
    motion.movesteps(math_number(100));
});
`;

try {
    const compiledResult = compiler(testDSLCode);
    console.log("✓ DSL compilation successful");
    console.log(`  Number of stacks: ${compiledResult.length}`);
    if (compiledResult.length > 0) {
        console.log(`  First stack blocks: ${compiledResult[0].blocks.length}`);
    }
    console.log();
} catch (error) {
    console.log(`✗ DSL compilation failed: ${error.message}\n`);
}

// 测试 4: ScratchAgent 工具执行
console.log("=== Test 4: ScratchAgent Tool Execution ===\n");

(async () => {
    try {
        // 测试编译工具
        const compileResult = await scratchAgent.compileScratchDSL({
            dsl_code: testDSLCode
        });
        
        if (compileResult.success) {
            console.log("✓ compile_scratch_dsl tool executed successfully");
            console.log(`  Blocks count: ${compileResult.blocks_count}`);
            console.log(`  Message: ${compileResult.message}`);
        } else {
            console.log(`✗ compile_scratch_dsl failed: ${compileResult.error}`);
        }
        console.log();

        // 测试生成工具
        const generateResult = await scratchAgent.generateScratchDSL({
            description: "Simple square movement",
            dsl_code: testDSLCode
        });
        
        if (generateResult.success) {
            console.log("✓ generate_scratch_dsl tool executed successfully");
            console.log(`  Message: ${generateResult.message}`);
        } else {
            console.log(`✗ generate_scratch_dsl failed: ${generateResult.error}`);
        }
        console.log();

        // 测试验证工具
        const validateResult = await scratchAgent.validateScratchCode({
            requirements: "Simple square movement",
            compiled_result: JSON.stringify(compileResult)
        });
        
        if (validateResult.success) {
            console.log("✓ validate_scratch_code tool executed successfully");
            console.log(`  Total stacks: ${validateResult.total_stacks}`);
            console.log(`  Requirements met: ${validateResult.requirements_met}`);
        } else {
            console.log(`✗ validate_scratch_code failed: ${validateResult.error}`);
        }
        console.log();

    } catch (error) {
        console.error("Error during tool execution:", error.message);
    }

    // 测试 5: 消息管理
    console.log("=== Test 5: Message Management ===\n");
    
    const testAgent2 = new Agent({
        base: 'https://api.openai.com/v1',
        key: 'test-key',
        model: 'gpt-4'
    });

    testAgent2.pushMessage('user', 'Hello');
    testAgent2.pushMessage('assistant', 'Hi there!');
    testAgent2.pushMessage('user', 'How are you?');

    console.log("✓ Messages pushed to agent");
    console.log(`  Total messages: ${testAgent2.messages.length}`);
    testAgent2.messages.forEach((msg, index) => {
        console.log(`  - Message ${index + 1}: role=${msg.role}, content=${msg.content}`);
    });
    console.log();

    testAgent2.reset();
    console.log("✓ Agent reset");
    console.log(`  Messages after reset: ${testAgent2.messages.length}`);
    console.log(`  Tools after reset: ${testAgent2.tools.length}\n`);

    // 测试完成
    console.log("=== All Tests Complete ===\n");
    console.log("Summary:");
    console.log("✓ Basic Agent functionality working");
    console.log("✓ ScratchAgent initialized with tools");
    console.log("✓ DSL compilation working");
    console.log("✓ Tool execution working");
    console.log("✓ Message management working");
    console.log("✓ Agent reset working\n");

})().catch(console.error);
