# ScCodeGen Agent 智能体文档

## 概述

ScCodeGen 智能体是一个能够自动理解用户需求、生成 Scratch DSL 代码、编译成 Scratch 积木的 AI 驱动系统。

## 架构

```
用户需求
    ↓
ScratchAgent (调用 AI)
    ↓
AI 生成 DSL 代码
    ↓
Tool Calling 循环:
  - generate_scratch_dsl: 生成代码
  - compile_scratch_dsl: 编译代码
  - validate_scratch_code: 验证代码
    ↓
返回编译后的 Scratch 积木
```

## 核心组件

### 1. Agent 基类 (`src/agent/base/index.js`)

提供基础的 Agent 框架，支持：
- 消息管理
- 工具注册和执行
- Tool Calling 自动循环
- OpenAI API 集成

**关键方法：**

```javascript
import { Agent } from 'sccodegen';

const agent = new Agent({
    base: 'https://api.openai.com/v1',
    key: 'your-api-key',
    model: 'gpt-4-turbo'
});

// 注册工具
agent.addTool(
    'tool_name',
    'Tool description',
    { properties: {...}, required: [...] },
    async (args) => { /* 工具实现 */ }
);

// 运行 Agent
const result = await agent.run('用户需求');
```

### 2. ScratchAgent 智能体 (`src/agent/core/index.js`)

专门为 Scratch 代码生成设计，包含三个主要工具：

#### a) `generate_scratch_dsl`
- **目的**：生成符合需求的 Scratch DSL 代码
- **输入**：需求描述和生成的代码
- **输出**：验证和返回代码

#### b) `compile_scratch_dsl`
- **目的**：将 DSL 代码编译成 Scratch 积木
- **输入**：DSL 代码字符串
- **输出**：编译结果和积木堆栈信息

#### c) `validate_scratch_code`
- **目的**：验证生成的代码是否满足需求
- **输入**：原始需求和编译结果
- **输出**：验证结果和最终的 Scratch 积木

**关键方法：**

```javascript
import { ScratchAgent } from 'sccodegen';

const agent = new ScratchAgent(config);

// 生成 Scratch 代码
const result = await agent.generateScratchCode('Create a sprite that moves around');

// 访问结果
console.log(result.compiled_blocks); // Scratch 积木结构
console.log(result.response);        // AI 的最终响应
```

## 使用示例

### 基础用法

```javascript
import { ScratchAgent } from 'sccodegen';

const config = {
    base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo'
};

const agent = new ScratchAgent(config);

const result = await agent.generateScratchCode(
    'Make a cat sprite that moves in a square'
);

if (result.success) {
    console.log('Generated code!');
    console.log(result.compiled_blocks);
}
```

### 高级用法

```javascript
import { Agent } from 'sccodegen';
import { compiler } from 'sccodegen';

// 创建自定义 Agent
const agent = new Agent(config);

// 添加自定义工具
agent.addTool(
    'analyze_code',
    'Analyze and optimize Scratch code',
    {
        properties: {
            code: { type: 'string', description: 'Scratch code to analyze' }
        },
        required: ['code']
    },
    async (args) => {
        // 自定义逻辑
        return { analysis: '...' };
    }
);

// 运行 Agent
const result = await agent.run('用户需求');
```

## Tool Calling 流程

Agent 使用 Tool Calling 实现多轮对话和智能工具调用：

1. **用户发送需求** → Agent 添加到消息历史
2. **调用 OpenAI API** → 传递已定义的工具
3. **AI 返回响应** → 可能包含工具调用请求
4. **检查是否有 tool_calls** → 如果有，执行对应工具
5. **将工具结果返回给 AI** → 继续对话
6. **重复步骤 2-5** → 直到 AI 不再调用工具
7. **返回最终结果** → 用户得到完整的 Scratch 代码

## API 参考

### Agent 类

#### 构造函数
```javascript
new Agent(config)
```
- `config`: 配置对象
  - `base`: OpenAI API 基础 URL
  - `key`: API 密钥
  - `model`: 使用的模型名称

#### 方法

**addTool(name, description, params, implementation)**
- 注册一个工具供 Agent 使用
- `params`: 参数定义 `{ properties: {...}, required: [...] }`
- `implementation`: 异步函数，处理工具调用

**pushMessage(role, content)**
- 手动添加消息到对话历史

**run(initialMessage)**
- 启动 Tool Calling 循环
- 返回最终的响应文本

**reset()**
- 清空消息和工具列表

### ScratchAgent 类

继承自 `Agent`，添加额外方法：

**generateScratchCode(requirements)**
- 完整的代码生成流程
- 返回 `{ success, requirements, response, compiled_blocks }`

**getCompiledBlocks()**
- 获取最后编译的 Scratch 积木

**getConversationHistory()**
- 获取完整的对话历史

## 测试

运行测试套件：

```bash
npm test
```

运行智能体测试：

```bash
node test/agent-tools.test.js
```

## 环境变量

- `OPENAI_API_BASE`: OpenAI API 基础 URL（默认：https://api.openai.com/v1）
- `OPENAI_API_KEY`: OpenAI API 密钥
- `OPENAI_MODEL`: 使用的模型（默认：gpt-4-turbo-preview）

## 错误处理

Agent 会返回错误信息，可以检查 `success` 字段：

```javascript
const result = await agent.generateScratchCode('需求');

if (!result.success) {
    console.error('生成失败:', result.error);
} else {
    console.log('生成成功!');
}
```

## 扩展 Agent

创建自定义 Agent 来添加额外功能：

```javascript
import { Agent } from 'sccodegen';

class MyCustomAgent extends Agent {
    constructor(config) {
        super(config);
        
        // 添加自定义工具
        this.addTool(
            'custom_tool',
            'My custom tool',
            { properties: {...}, required: [...] },
            this.myToolImplementation.bind(this)
        );
    }

    async myToolImplementation(args) {
        // 实现自定义逻辑
        return { result: '...' };
    }

    async run(initialMessage) {
        // 自定义运行逻辑
        return super.run(initialMessage);
    }
}
```

## 限制和注意事项

1. **API 调用费用**：使用 OpenAI API 会产生费用
2. **Token 限制**：模型的最大 token 数限制了代码复杂度
3. **网络依赖**：需要网络连接来调用 OpenAI API
4. **异步操作**：所有 API 调用都是异步的，需要 await

## 常见问题

**Q: 如何离线使用？**
A: 可以实现本地 LLM（如 Ollama、LLaMA）的适配器

**Q: 如何提高生成代码的质量？**
A: 
- 使用更高级的模型（如 gpt-4）
- 优化系统提示词
- 提供更详细的需求描述

**Q: 支持哪些版本的 Scratch？**
A: 目前主要支持 Scratch 3.0 的积木结构

## 许可证

Apache-2.0

## 贡献

欢迎提交 Issues 和 Pull Requests！
