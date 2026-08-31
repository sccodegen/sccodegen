/**
 * 构建用户脚本：esbuild 把 src/userscript/main.js（完整智能体）打包成
 * 带 Tampermonkey 头部的单文件用户脚本 dist/scodegen.user.js。
 *
 * 用法：npm run build:userscript
 * 产物：dist/scodegen.user.js —— 直接安装到 Tampermonkey，打开
 *       https://scratch.mit.edu/projects/* 即可使用。
 */

import { build } from "esbuild";
import { DEFAULT_HEADER } from "../src/agent/core/userscript.js";

const outfile = "dist/scodegen.user.js";

await build({
    entryPoints: ["src/userscript/main.js"],
    bundle: true,
    format: "iife",
    outfile,
    banner: { js: DEFAULT_HEADER + "\n" },
    target: ["es2020"],
    legalComments: "none",
    logLevel: "info",
});

console.log(`\n✓ 已生成用户脚本：${outfile}`);
console.log("  安装到 Tampermonkey 后，打开 https://scratch.mit.edu/projects/ 任意作品页使用。");
