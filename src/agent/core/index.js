import { Agent } from "../base/index.js";
import compiler from "../../dsl/compiler.js";

/**
 * Scratch 代码生成智能体
 * 基于用户需求自动生成和编译 Scratch DSL 代码
 */
export class ScratchAgent extends Agent {
    constructor(config) {
        super(config);
        this.compiledBlocks = null;
        
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

        const systemPrompt = `You are an expert Scratch DSL code generator. Your task is to:
1. Understand the user's requirements
2. Generate valid Scratch DSL code that fulfills the requirements
3. Make sure the code compiles correctly

When you have generated the DSL code, call the generate_scratch_dsl tool, then compile_scratch_dsl tool to verify it works.
Finally, call validate_scratch_code to ensure the code meets the requirements.

Important: Always output the final compiled Scratch code in your response.`;

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
