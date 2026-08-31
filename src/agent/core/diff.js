/**
 * diff —— 同一角色修改前后 blocks 快照的差异对比
 */

const opcodeCount = (arr) =>
    arr.reduce((m, b) => {
        const key = b.opcode || "(unknown)";
        m[key] = (m[key] || 0) + 1;
        return m;
    }, {});

const fmtCounts = (obj) => {
    const entries = Object.entries(obj);
    if (!entries.length) return "无";
    return entries.map(([op, n]) => `${op}×${n}`).join("、");
};

/**
 * 对比修改前后的积木快照
 * @param {string} spriteId 角色 id
 * @param {Array}  before   修改前快照（积木对象数组）
 * @param {Array}  after    修改后快照
 * @returns {object} {sprite, added, removed, changed, addedCount, removedCount, changedCount, summary}
 */
export function diffBlockSnapshots(spriteId, before, after) {
    const b = new Map((before || []).map((x) => [x.id, x]));
    const a = new Map((after || []).map((x) => [x.id, x]));

    const added = [];
    const removed = [];
    const changed = [];
    for (const [id, blk] of a) {
        if (!b.has(id)) added.push(blk);
        else if (JSON.stringify(b.get(id)) !== JSON.stringify(blk)) changed.push(blk);
    }
    for (const [id, blk] of b) {
        if (!a.has(id)) removed.push(blk);
    }

    return {
        sprite: spriteId,
        added: added.map((b) => b.opcode),
        removed: removed.map((b) => b.opcode),
        changed: changed.map((b) => b.opcode),
        addedCount: added.length,
        removedCount: removed.length,
        changedCount: changed.length,
        summary:
            `角色 ${spriteId}：新增 ${added.length} 个积木（${fmtCounts(opcodeCount(added))}），` +
            `删除 ${removed.length} 个（${fmtCounts(opcodeCount(removed))}），` +
            `修改 ${changed.length} 个（${fmtCounts(opcodeCount(changed))}）`,
    };
}

export default diffBlockSnapshots;
