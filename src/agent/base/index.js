import { callOpenAI } from "../utils/callOpenAI.js";

export class Agent {
    constructor(config) {
        this.config = config;
        this.messages = [];
        this.tools = [];
        this.toolFunctions = {}; // 存储工具实现
    }

    reset() {
        this.tools = [];
        this.messages = [];
        this.toolFunctions = {};
    }

    pushMessage(role, msg) {
        this.messages.push({role, content: msg});
    }

    addTool(name, desc, params = {}, toolFunc) {
        this.tools.push({
            type: "function",
            function: {
                name,
                description: desc,
                parameters: {
                    type: "object",
                    properties: params.properties || {},
                    required: params.required || [],
                },
            },
        });
        // 注册工具实现
        if (toolFunc) {
            this.toolFunctions[name] = toolFunc;
        }
    }

    async callAI(msg) {
        this.pushMessage('user', msg);
        const response = await callOpenAI(this.config, this.messages, this.tools);
        this.messages.push(response);
        return response;
    }

    // 执行工具调用
    async executeTool(toolName, toolArgs) {
        if (this.toolFunctions[toolName]) {
            return await this.toolFunctions[toolName](toolArgs);
        } else {
            throw new Error(`Tool ${toolName} not found`);
        }
    }

    // Tool Calling 主循环
    async run(initialMessage) {
        await this.callAI(initialMessage);

        // 持续循环，直到模型不再调用工具
        while (true) {
            const lastMessage = this.messages[this.messages.length - 1];
            
            // 检查是否有工具调用
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                // 执行所有工具调用
                for (const toolCall of lastMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments);
                    
                    const result = await this.executeTool(toolName, toolArgs);
                    
                    // 将工具结果添加到消息中
                    this.messages.push({
                        role: "tool",
                        content: JSON.stringify(result),
                        tool_call_id: toolCall.id
                    });
                }

                // 继续请求模型
                const response = await callOpenAI(this.config, this.messages, this.tools);
                this.messages.push(response);
            } else {
                // 没有工具调用了，返回最终响应
                break;
            }
        }

        // 返回最后一条消息的内容
        return this.messages[this.messages.length - 1].content;
    }
}