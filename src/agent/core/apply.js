/**
 * apply —— 把编译好的积木应用到 Scratch VM
 *
 * 流程（按需求）：
 *   1. 通过 vm.runtime.targets 解析角色 id（按 id 或名字匹配）；
 *   2. 角色不存在则自动创建（优先复制现有角色，兜底用舞台素材构造最小角色）；
 *   3. vm.setEditingTarget(targetId) 后遍历积木列表调用
 *      vm.editingTarget.blocks.createBlock(block)；
 *   4. 应用前后各拍一份该角色 blocks 快照，供"修改前/修改后"切换对比。
 */

/** 深拷贝（structuredClone 优先，兼容不支持的环境） */
export function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

/** 从 vm.runtime.targets 解析角色 id（.id 或名字匹配） */
export function resolveTargetId(vm, spriteId) {
    const targets = (vm && vm.runtime && vm.runtime.targets) || [];
    for (const t of targets) {
        const name = typeof t.getName === "function" ? t.getName() : t.name;
        if (t.id === spriteId || name === spriteId) return t.id;
    }
    return null;
}

/** 取一个目标（按 id） */
export function getTarget(vm, targetId) {
    if (vm.runtime && typeof vm.runtime.getTargetById === "function") {
        const t = vm.runtime.getTargetById(targetId);
        if (t) return t;
    }
    return ((vm.runtime && vm.runtime.targets) || []).find((t) => t.id === targetId) || null;
}

/**
 * 自动创建角色。优先复制现有角色（保证素材可用），
 * 若舞台是唯一目标，则用舞台背景素材构造最小角色 JSON 走 vm.addSprite。
 * @returns {Promise<string>} 新角色的 target id
 */
export async function ensureSprite(vm, spriteId) {
    const existing = resolveTargetId(vm, spriteId);
    if (existing) return existing;

    const isSprite = (t) => t && t.isSprite && t.isSprite() && !(t.isStage && t.isStage());
    const donor = ((vm.runtime && vm.runtime.targets) || []).find(isSprite);

    if (donor) {
        if (typeof vm.duplicateSprite !== "function" || typeof vm.renameSprite !== "function") {
            throw new Error(`自动创建角色 ${spriteId} 失败：VM 不支持 duplicateSprite/renameSprite`);
        }
        await vm.duplicateSprite(donor.id);
        const dup = ((vm.runtime && vm.runtime.targets) || [])
            .filter((t) => isSprite(t) && t.id !== donor.id)
            .at(-1);
        if (!dup) throw new Error(`自动创建角色 ${spriteId} 失败：无法定位复制出的角色`);
        await vm.renameSprite(dup.id, spriteId);
        return dup.id;
    }

    // 兜底：用舞台背景素材构造最小角色
    if (typeof vm.addSprite !== "function") {
        throw new Error(`自动创建角色 ${spriteId} 失败：VM 不支持 addSprite 且没有可复制的角色`);
    }
    const stage =
        (vm.runtime && typeof vm.runtime.getTargetForStage === "function" && vm.runtime.getTargetForStage()) ||
        ((vm.runtime && vm.runtime.targets) || []).find((t) => t.isStage && t.isStage());
    const costume = stage && typeof stage.getCostumes === "function" ? stage.getCostumes()[0] : null;
    const spriteJson = {
        isStage: false,
        name: spriteId,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: "all around",
        costumes: costume
            ? [
                  {
                      name: "costume1",
                      assetId: costume.assetId ?? costume.asset?.assetId,
                      md5ext: costume.md5ext ?? costume.asset?.md5ext,
                      dataFormat: costume.dataFormat ?? costume.asset?.dataFormat,
                      rotationCenterX: costume.rotationCenterX ?? 0,
                      rotationCenterY: costume.rotationCenterY ?? 0,
                      bitmapResolution: costume.bitmapResolution ?? 1,
                  },
              ]
            : [],
        sounds: [],
        blocks: {},
        variables: {},
        lists: {},
        broadcasts: {},
        comments: {},
    };
    await vm.addSprite(spriteJson);
    const targetId = resolveTargetId(vm, spriteId);
    if (!targetId) throw new Error(`自动创建角色 ${spriteId} 失败`);
    return targetId;
}

/** 拍摄角色 blocks 快照（积木对象数组，深拷贝） */
export function snapshotTargetBlocks(vm, targetId) {
    const target = getTarget(vm, targetId);
    if (!target || !target.blocks) return [];
    const dict = target.blocks._blocks || target.blocks.blocks || {};
    return deepClone(Object.values(dict));
}

/** 清空角色所有积木（递归删除每个顶层脚本） */
export function clearTargetBlocks(vm, targetId) {
    const target = getTarget(vm, targetId);
    if (!target || !target.blocks) return;
    const blocks = target.blocks;
    if (typeof blocks.getScripts === "function") {
        for (const id of [...blocks.getScripts()]) blocks.deleteBlock(id);
    } else {
        const dict = blocks._blocks || blocks.blocks || {};
        for (const id of Object.keys(dict)) {
            const b = dict[id];
            if (b && (b.topLevel || b.parent === null)) blocks.deleteBlock(id);
        }
    }
}

/** 用快照恢复角色积木 */
export function restoreTargetBlocks(vm, targetId, snapshot) {
    vm.setEditingTarget(targetId);
    clearTargetBlocks(vm, targetId);
    const blocks = vm.editingTarget.blocks;
    for (const blk of snapshot || []) blocks.createBlock(blk);
    refreshWorkspace(vm);
}

/** 通知 GUI 刷新工作区（scratch-gui 监听 WORKSPACE_UPDATE / TARGETS_UPDATE） */
export function refreshWorkspace(vm) {
    if (typeof vm.emitWorkspaceUpdate === "function") vm.emitWorkspaceUpdate();
    if (typeof vm.emitTargetsUpdate === "function") vm.emitTargetsUpdate();
    if (vm.runtime && typeof vm.runtime.emitProjectChanged === "function") {
        vm.runtime.emitProjectChanged();
    }
}

/**
 * 把一个角色的积木应用到 VM（应用前后各拍快照）
 * @param {object} vm  Scratch VM（unsafeWindow.vm）
 * @param {string} spriteId 角色 id（VFS 目录名）
 * @param {Array}  stacks 编译出的积木堆栈列表
 * @param {object} [opts] {clearExisting?:boolean}
 * @returns {Promise<{targetId:string, before:Array, after:Array, created:string[]}>}
 */
export async function applySpriteBlocks(vm, spriteId, stacks, opts = {}) {
    const { clearExisting = true } = opts;
    const targetId = await ensureSprite(vm, spriteId);
    const before = snapshotTargetBlocks(vm, targetId);

    vm.setEditingTarget(targetId);
    const blocks = vm.editingTarget.blocks;
    if (clearExisting) clearTargetBlocks(vm, targetId);

    const created = [];
    for (const stack of stacks || []) {
        if (!stack || !stack.blocks) continue;
        for (const blk of Object.values(stack.blocks)) {
            blocks.createBlock(blk);
            created.push(blk.id);
        }
    }

    const after = snapshotTargetBlocks(vm, targetId);
    refreshWorkspace(vm);
    return { targetId, before, after, created };
}

export default applySpriteBlocks;
