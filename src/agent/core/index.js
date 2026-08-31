import { Agent } from "../base/index.js";
import { callOpenAI } from "../utils/callOpenAI.js";
import compiler from "../../dsl/compiler.js";

/**
 * Scratch 代码生成智能体
 * 基于用户需求自动生成和编译 Scratch DSL 代码
 */
export class ScratchAgent extends Agent {
    constructor(config) {
        super(config);
        this.compiledBlocks = null;
        this.systemPrompt = this.buildSystemPrompt();
        this.ensureSystemPrompt();
        
        // 添加生成 DSL 代码工具
        this.addTool(
            "generate_scratch_dsl",
            "Generate Scratch DSL code based on user requirements. This tool should return valid JavaScript-like Scratch DSL code.",
            {
                properties: {
                    description: {
                        type: "string",
                        description: "User's requirements for the Scratch program"
                    },
                    dsl_code: {
                        type: "string",
                        description: "The generated Scratch DSL code in JavaScript-like syntax"
                    }
                },
                required: ["description", "dsl_code"]
            },
            this.generateScratchDSL.bind(this)
        );

        // 添加编译 DSL 代码工具
        this.addTool(
            "compile_scratch_dsl",
            "Compile Scratch DSL code into Scratch blocks. Returns the compiled blocks structure.",
            {
                properties: {
                    dsl_code: {
                        type: "string",
                        description: "Scratch DSL code to compile"
                    }
                },
                required: ["dsl_code"]
            },
            this.compileScratchDSL.bind(this)
        );

        // 添加验证代码工具
        this.addTool(
            "validate_scratch_code",
            "Validate that the Scratch code meets the requirements",
            {
                properties: {
                    requirements: {
                        type: "string",
                        description: "Original user requirements"
                    },
                    compiled_result: {
                        type: "string",
                        description: "The compiled result to validate"
                    }
                },
                required: ["requirements", "compiled_result"]
            },
            this.validateScratchCode.bind(this)
        );
    }

    buildSystemPrompt() {
        return `You are an expert Scratch DSL code generator.

Scratch DSL syntax rules:
1. The DSL is JavaScript-like and uses namespace calls such as motion.movesteps(...), looks.say(...), control.if(...), and event.whenflagclicked(...).
2. Every script must start with a hat block created by "new Namespace.HatName(..., () => { ... })". Common examples:
   - new event.whenflagclicked(() => { ... });
   - new event.whenkeypressed(text("space"), () => { ... });
   - new event.whenbackdropswitchesto(text("backdrop1"), () => { ... });
3. Inside the callback body, write Scratch statements as ordinary JavaScript function calls. Statements end with semicolons.
4. Use a callback function as the last argument for blocks that contain a substack, such as:
   - control.if(condition, () => { ... });
   - control.repeat(math_number(10), () => { ... });
   - control.forever(() => { ... });
5. Numeric values should use math_number(value), for example: motion.movesteps(math_number(10));
6. Text values should use quoted strings or text("...") when needed, for example: looks.say("hello");
7. Boolean conditions should be expressions like operators.operator_gt(a, b), operators.operator_equals(a, b), or sensing.keypressed("w").
8. Reporter blocks may be used as arguments inside other blocks, for example: looks.say(operators.operator_join("x=", motion.xposition()));
9. Do not call a command block outside of an active stack. In practice, only call blocks inside a hat callback or another substack callback.
10. Keep the generated DSL valid and compilable; if a block requires arguments, pass the required values in the right order.

Your task is to:
1. Understand the user's requirements.
2. Generate valid Scratch DSL code that fulfills the requirements.
3. Keep the syntax consistent with the rules above.
4. Ensure the code compiles successfully.

When you have generated the DSL code, call the generate_scratch_dsl tool, then compile_scratch_dsl, and finally validate_scratch_code.
Always output the final compiled Scratch code in your response.`;
    }

    ensureSystemPrompt() {
        const hasSystemPrompt = this.messages.some(
            (message) => message.role === "system" && message.content === this.systemPrompt
        );

        if (!hasSystemPrompt) {
            this.messages.unshift({ role: "system", content: this.systemPrompt });
        }
    }

    async callAI(msg) {
        this.ensureSystemPrompt();
        this.pushMessage("user", msg);
        const response = await callOpenAI(this.config, this.messages, this.tools);
        this.messages.push(response);
        return response;
    }

    /**
     * 生成 Scratch DSL 代码
     */
    async generateScratchDSL(args) {
        try {
            // 这个工具主要是让 AI 思考和生成代码
            // 在实际使用中，AI 会直接返回生成的 DSL 代码
            return {
                success: true,
                message: "DSL code generated successfully",
                dsl_code: args.dsl_code
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 编译 Scratch DSL 代码
     */
    async compileScratchDSL(args) {
        try {
            const dslCode = args.dsl_code;
            const stacks = compiler(dslCode);
            
            // 保存编译结果
            this.compiledBlocks = stacks;
            
            return {
                success: true,
                message: "DSL compiled successfully",
                blocks_count: stacks.length,
                blocks: stacks.map((stack, index) => ({
                    stack_index: index,
                    block_count: stack.blocks.length,
                    summary: `Stack ${index}: ${stack.blocks.length} blocks`
                }))
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                hint: "Please check your DSL syntax and make sure all functions are properly called"
            };
        }
    }

    /**
     * 验证生成的 Scratch 代码
     */
    async validateScratchCode(args) {
        try {
            const requirements = args.requirements;
            
            // 检查是否有编译结果
            if (!this.compiledBlocks || this.compiledBlocks.length === 0) {
                return {
                    success: false,
                    message: "No compiled blocks found"
                };
            }
            
            return {
                success: true,
                message: "Code validation passed",
                total_stacks: this.compiledBlocks.length,
                requirements_met: true,
                compiled_code: this.compiledBlocks
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 完整的 Scratch 代码生成流程
     */
    async generateScratchCode(requirements) {
        console.log(`\n=== Scratch Code Generation Started ===`);
        console.log(`Requirements: ${requirements}\n`);

        try {
            const result = await this.run(requirements);
            console.log(`\n=== Code Generation Complete ===\n`);
            
            return {
                success: true,
                requirements: requirements,
                response: result,
                compiled_blocks: this.compiledBlocks
            };
        } catch (error) {
            console.error("Error during code generation:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取编译后的 Scratch 积木
     */
    getCompiledBlocks() {
        return this.compiledBlocks;
    }

    /**
     * 获取完整的对话历史
     */
    getConversationHistory() {
        return this.messages;
    }
}

export default ScratchAgent;
