/**
 * 完整集成示例
 * 展示如何端到端使用 ScratchAgent 生成 Scratch 代码
 */

import { ScratchAgent } from '../src/index.js';

/**
 * 示例场景：使用 AI 智能体生成 Scratch 代码
 */

// 配置（从环境变量或默认值）
const config = {
    base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY || 'test-key',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo'
};

// 示例需求
const scenarios = [
    {
        name: '基础运动',
        requirement: '创建一个程序，使小猫精灵前进100步，然后右转90度，再前进100步'
    },
    {
        name: '条件判断',
        requirement: '创建一个程序，让小猫根据按下的按键做出不同的动作：按"W"向上移动，按"S"向下移动'
    },
    {
        name: '循环结构',
        requirement: '创建一个程序，让小猫持续在舞台上移动，每次移动10步，然后转向'
    }
];

/**
 * 本地演示（不调用真实 API）
 */
async function localDemo() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   ScCodeGen Agent - 本地集成演示              ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const agent = new ScratchAgent(config);

    // 演示 DSL 代码
    const demoCode = `
    new event.whenflagclicked(() => {
        control.forever(() => {
            motion.movesteps(math_number(10));
            motion.turnright(math_number(15));
        });
    });
    `;

    console.log('【场景 1】基础 DSL 编译演示\n');
    console.log('输入代码：');
    console.log(demoCode);
    console.log('\n处理中...\n');

    try {
        // 编译 DSL
        const compileResult = await agent.compileScratchDSL({
            dsl_code: demoCode
        });

        if (compileResult.success) {
            console.log('✓ 编译成功！');
            console.log(`  · 生成的堆栈数: ${compileResult.blocks_count}`);
            console.log(`  · 状态: ${compileResult.message}`);
            
            // 显示编译后的块信息
            console.log('\n  编译后的块信息:');
            compileResult.blocks.forEach(block => {
                console.log(`    - ${block.summary}`);
            });
        } else {
            console.log('✗ 编译失败:', compileResult.error);
        }
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n---\n');

    // 演示代码生成
    console.log('【场景 2】代码生成演示\n');
    
    const genResult = await agent.generateScratchDSL({
        description: '小猫运动程序',
        dsl_code: demoCode
    });

    if (genResult.success) {
        console.log('✓ 代码生成成功！');
        console.log(`  · 状态: ${genResult.message}`);
    }

    console.log('\n---\n');

    // 演示代码验证
    console.log('【场景 3】代码验证演示\n');

    let validateResult;
    try {
        validateResult = await agent.validateScratchCode({
            requirements: '小猫循环运动'
        });
    } catch (error) {
        validateResult = { success: false, error: error.message };
    }

    if (validateResult.success) {
        console.log('✓ 代码验证成功！');
        console.log(`  · 总堆栈数: ${validateResult.total_stacks}`);
        console.log(`  · 需求满足: ${validateResult.requirements_met ? '是' : '否'}`);
    } else {
        console.log('✗ 验证失败:', validateResult.error);
    }

    console.log('\n---\n');

    // 演示完整流程
    console.log('【场景 4】Agent 工具链演示\n');
    console.log('Agent 拥有以下工具:');
    agent.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.function.name}`);
        console.log(`     ${tool.function.description}`);
    });

    console.log('\n---\n');

    // 演示消息管理
    console.log('【场景 5】对话历史演示\n');
    
    agent.pushMessage('user', '生成一个让小猫移动的程序');
    agent.pushMessage('assistant', '我会为你生成这样的程序');
    agent.pushMessage('user', '使用循环结构');

    console.log('对话历史:');
    agent.messages.forEach((msg, index) => {
        console.log(`  ${index + 1}. [${msg.role.toUpperCase()}] ${msg.content}`);
    });

    console.log('\n---\n');

    // 演示 Agent 重置
    console.log('【场景 6】Agent 状态管理\n');
    console.log('重置前:');
    console.log(`  · 消息数: ${agent.messages.length}`);
    console.log(`  · 工具数: ${agent.tools.length}`);

    agent.reset();
    
    console.log('\n重置后:');
    console.log(`  · 消息数: ${agent.messages.length}`);
    console.log(`  · 工具数: ${agent.tools.length}`);

    console.log('\n✓ 所有演示场景完成!\n');
}

/**
 * 完整流程演示（需要真实 API）
 */
async function fullDemo() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   ScCodeGen Agent - 完整 API 演示             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('⚠️  此演示需要有效的 OpenAI API 密钥\n');

    if (!process.env.OPENAI_API_KEY) {
        console.log('未找到 OPENAI_API_KEY 环境变量');
        console.log('请设置: export OPENAI_API_KEY=your-key\n');
        return;
    }

    const agent = new ScratchAgent(config);

    for (const scenario of scenarios) {
        console.log(`【${scenario.name}】\n`);
        console.log(`需求: ${scenario.requirement}\n`);

        try {
            const result = await agent.generateScratchCode(scenario.requirement);
            
            if (result.success) {
                console.log('✓ 生成成功！\n');
                console.log('AI 响应:');
                console.log(result.response);
                
                if (result.compiled_blocks) {
                    console.log('\n编译后的积木:');
                    console.log(JSON.stringify(result.compiled_blocks, null, 2));
                }
            } else {
                console.log('✗ 生成失败:', result.error);
            }
        } catch (error) {
            console.error('错误:', error.message);
        }

        console.log('\n' + '='.repeat(50) + '\n');

        // 重置 Agent
        agent.reset();
    }
}

/**
 * 工具测试演示
 */
async function toolDemo() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   ScratchAgent 工具单元测试                    ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const agent = new ScratchAgent(config);

    // 测试用例
    const testCases = [
        {
            name: '简单移动',
            code: `
            new event.whenflagclicked(() => {
                motion.movesteps(math_number(50));
            });
            `
        },
        {
            name: '复杂循环',
            code: `
            new event.whenflagclicked(() => {
                control.repeat(math_number(4), () => {
                    motion.movesteps(math_number(100));
                    motion.turnright(math_number(90));
                });
            });
            `
        }
    ];

    for (const testCase of testCases) {
        console.log(`测试: ${testCase.name}\n`);
        
        try {
            const result = await agent.compileScratchDSL({
                dsl_code: testCase.code
            });

            if (result.success) {
                console.log('✓ 编译成功');
                console.log(`  块数: ${result.blocks_count}`);
                result.blocks.forEach(b => console.log(`  · ${b.summary}`));
            } else {
                console.log('✗ 编译失败:', result.error);
            }
        } catch (error) {
            console.error('错误:', error.message);
        }

        console.log();
    }
}

// 主程序
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--full')) {
        await fullDemo();
    } else if (args.includes('--tools')) {
        await toolDemo();
    } else {
        await localDemo();
    }
}

main().catch(console.error);

export { localDemo, fullDemo, toolDemo };
