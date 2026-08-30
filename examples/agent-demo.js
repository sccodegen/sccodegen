/**
 * Scratch Agent 使用示例
 * 
 * 这个示例展示了如何使用 ScratchAgent 来自动生成 Scratch 代码
 * 基于自然语言的需求，Agent 会：
 * 1. 理解需求
 * 2. 生成 Scratch DSL 代码
 * 3. 编译成 Scratch 积木
 * 4. 验证代码的正确性
 */

import { ScratchAgent } from '../src/index.js';

// 配置 OpenAI API
// 注意：需要设置环境变量或传入有效的配置
const config = {
    base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview'
};

// 示例需求
const requirements = [
    "Create a Scratch program that makes a cat sprite move in a square pattern",
    "Create a simple game where the cat follows the mouse cursor",
    "Make a sprite bounce around the stage, changing color when it hits the edge"
];

async function demonstrateAgent() {
    console.log("=== Scratch Agent Demo ===\n");

    const agent = new ScratchAgent(config);

    for (const req of requirements) {
        console.log(`\nGenerating code for: "${req}"\n`);
        
        try {
            const result = await agent.generateScratchCode(req);
            
            if (result.success) {
                console.log("✓ Generation successful!");
                console.log("Final Response:", result.response);
                
                if (result.compiled_blocks) {
                    console.log("Compiled blocks:", JSON.stringify(result.compiled_blocks, null, 2));
                }
            } else {
                console.log("✗ Generation failed:", result.error);
            }
        } catch (error) {
            console.error("Error:", error.message);
        }

        // 重置 Agent 以处理下一个需求
        agent.reset();
    }
}

// 直接使用示例（不依赖 API，仅展示流程）
async function demonstrateWithoutAPI() {
    console.log("=== Scratch Agent Flow Demo (Without API) ===\n");

    const agent = new ScratchAgent({
        base: 'https://api.openai.com/v1',
        key: 'dummy-key',
        model: 'gpt-4'
    });

    // 示例 DSL 代码
    const dslCode = `
    new event.whenflagclicked(() => {
        control.forever(() => {
            motion.movesteps(math_number(10));
            control.wait(math_number(0.1));
            motion.turnright(math_number(5));
        });
    });
    `;

    console.log("Testing DSL compilation...\n");
    
    try {
        // 直接测试编译工具
        const compileResult = await agent.compileScratchDSL({ dsl_code: dslCode });
        console.log("Compilation result:", JSON.stringify(compileResult, null, 2));
        
        if (compileResult.success) {
            const blocks = agent.getCompiledBlocks();
            console.log("\nCompiled blocks structure:");
            console.log(JSON.stringify(blocks, null, 2));
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

// 当文件直接运行时
if (import.meta.url === `file://${process.argv[1]}`) {
    // 运行不依赖 API 的演示
    console.log("Note: Full API demo requires valid OpenAI API credentials.\n");
    demonstrateWithoutAPI().catch(console.error);
}

export { demonstrateAgent, demonstrateWithoutAPI };
