/**
 * 智能体部分（重写版）
 *   base/        通用工具调用智能体基类
 *   core/        ScratchAgent：read/write/edit/commit 四工具 + VFS + 应用到 Scratch VM
 *   utils/       puter.js 匿名模式 AI 调用层（自动免费模型、≤10 RPM）
 */

export { Agent } from "./base/index.js";
export { ScratchAgent, SYSTEM_PROMPT } from "./core/index.js";
export { VFS, normalizePath, spritePathInfo, FIXED_SPRITE_NAMES } from "./core/vfs.js";
export { PuterAI } from "./utils/puter.js";
export {
    buildUserScript,
    assembleSingleFile,
    assembleBuildSources,
    compileProject,
    BUILD_TOOLS,
    DEFAULT_HEADER,
} from "./core/userscript.js";
export { compileSpriteCode, collectBlocks, serializeStacks } from "./core/compile.js";
export { diffBlockSnapshots } from "./core/diff.js";
export {
    applySpriteBlocks,
    ensureSprite,
    resolveTargetId,
    snapshotTargetBlocks,
    restoreTargetBlocks,
    clearTargetBlocks,
    refreshWorkspace,
} from "./core/apply.js";
