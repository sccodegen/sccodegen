import assert from 'node:assert/strict';
import { callOpenAI } from '../src/agent/utils/callOpenAI.js';
import { ScratchAgent } from '../src/agent/core/index.js';

const originalPuter = globalThis.puter;

(async () => {
  try {
    globalThis.puter = {
      ai: {
        chat: async (messages, options = {}) => {
          assert.ok(Array.isArray(messages), 'messages should be passed as an array');
          assert.equal(options.model, 'gpt-5-nano');
          return {
            message: {
              role: 'assistant',
              content: 'Puter API ok',
            },
          };
        },
      },
    };

    const result = await callOpenAI(
      {
        apiType: 'puter',
        model: 'gpt-5-nano',
      },
      [{ role: 'user', content: 'Hello' }],
      []
    );

    assert.equal(result.content, 'Puter API ok');
    console.log('Puter API adapter test passed');

    const generatedDsl = `
new event.whenflagclicked(() => {
    motion.movesteps(math_number(10));
    motion.turnright(math_number(90));
});
`;

    const toolResponses = [
      {
        message: {
          role: 'assistant',
          content: 'Generating Scratch DSL and compiling it.',
          tool_calls: [
            {
              id: 'call_generate',
              type: 'function',
              function: {
                name: 'generate_scratch_dsl',
                arguments: JSON.stringify({
                  description: 'Have a sprite move forward then turn right.',
                  dsl_code: generatedDsl,
                }),
              },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Compiling the generated code.',
          tool_calls: [
            {
              id: 'call_compile',
              type: 'function',
              function: {
                name: 'compile_scratch_dsl',
                arguments: JSON.stringify({
                  dsl_code: generatedDsl,
                }),
              },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Validating the compiled blocks.',
          tool_calls: [
            {
              id: 'call_validate',
              type: 'function',
              function: {
                name: 'validate_scratch_code',
                arguments: JSON.stringify({
                  requirements: 'Move forward then turn right.',
                  compiled_result: JSON.stringify({ ok: true }),
                }),
              },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Generated a moving Scratch program and validated the blocks.',
        },
      },
    ];

    let responseIndex = 0;
    globalThis.puter = {
      ai: {
        chat: async (messages, options = {}) => {
          assert.ok(Array.isArray(messages), 'messages should be passed as an array');
          assert.equal(options.model, 'gpt-5-nano');
          assert.ok(responseIndex < toolResponses.length, 'unexpected extra AI call');
          return toolResponses[responseIndex++];
        },
      },
    };

    const agent = new ScratchAgent({
      apiType: 'puter',
      model: 'gpt-5-nano',
    });

    const agentResult = await agent.generateScratchCode('Make a sprite move forward then turn right.');

    assert.equal(agentResult.success, true);
    assert.ok(agentResult.compiled_blocks && agentResult.compiled_blocks.length > 0, 'compiled blocks should exist');
    assert.ok(
      Object.values(agentResult.compiled_blocks[0].blocks).some((block) => block.opcode === 'event_whenflagclicked'),
      'expected a when flag clicked block in compiled result'
    );
    assert.ok(
      Object.values(agentResult.compiled_blocks[0].blocks).some((block) => block.opcode === 'motion_movesteps'),
      'expected a move steps block in compiled result'
    );
    assert.ok(
      Object.values(agentResult.compiled_blocks[0].blocks).some((block) => block.opcode === 'motion_turnright'),
      'expected a turn right block in compiled result'
    );
    assert.ok(typeof agentResult.response === 'string' && agentResult.response.includes('Generated a moving Scratch program'));
    console.log('Full agent-to-Scratch DSL integration test passed');
  } catch (error) {
    console.error('Puter/Scratch agent integration tests failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (originalPuter === undefined) {
      delete globalThis.puter;
    } else {
      globalThis.puter = originalPuter;
    }
  }
})();
