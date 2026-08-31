/**
 * VFS —— Scratch 作品的虚拟文件系统
 *
 * 约定结构（code.js / costumes / sounds 名字固定，不可改）：
 *   /<角色id>/code.js          角色的积木脚本（JS-like Scratch DSL）
 *   /<角色id>/costumes/*       角色素材
 *   /<角色id>/sounds/*         角色声音
 * 根目录下每个一级目录即一个角色，目录名 = 角色 id。
 *
 * 可选 localStorage 持久化：构造时传入 persistKey，每次写操作后自动保存，
 * 刷新/重开页面后自动恢复。
 */

const FIXED_SPRITE_NAMES = {
    code: "code.js",
    costumes: "costumes",
    sounds: "sounds",
};

export { FIXED_SPRITE_NAMES };

/** 规范化路径：统一 / 分隔、去掉空段和 .、禁止 .. */
export function normalizePath(p) {
    if (typeof p !== "string") throw new Error("路径必须是字符串");
    const parts = String(p)
        .replace(/\\/g, "/")
        .split("/")
        .filter((s) => s && s !== ".");
    if (parts.some((s) => s === "..")) throw new Error(`非法路径（不允许 ..）：${p}`);
    return parts.join("/");
}

/** 判断路径是否位于某个角色目录内（/<id>/...） */
export function spritePathInfo(path) {
    const parts = normalizePath(path).split("/");
    if (parts.length < 2) return null;
    return { spriteId: parts[0], rest: parts.slice(1) };
}

export class VFS {
    /**
     * @param {object} [config]
     * @param {object} [config.files]       初始文件表 {path: content}
     * @param {string} [config.persistKey]  localStorage 键名；缺省不持久化
     * @param {object} [config.storage]     显式注入 storage（localStorage 兼容对象，测试用）
     */
    constructor(config = {}) {
        this.root = new Map(); // path -> { type:'dir' } | { type:'file', content }
        this.persistKey = config.persistKey ?? null;
        this.storage = config.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);

        if (config.files && typeof config.files === "object") {
            for (const [path, content] of Object.entries(config.files)) {
                this.write(path, content);
            }
        }
        if (this.persistKey && this.storage) {
            try {
                const raw = this.storage.getItem(this.persistKey);
                if (raw) this.restore(JSON.parse(raw));
            } catch (e) {
                console.warn(`[VFS] 恢复 ${this.persistKey} 失败：`, e.message);
            }
        }
    }

    // ---------- 基础操作 ----------

    _ensureDir(path) {
        const parts = normalizePath(path).split("/");
        let cur = "";
        for (const part of parts) {
            cur = cur ? `${cur}/${part}` : part;
            if (!this.root.has(cur)) this.root.set(cur, { type: "dir" });
            else if (this.root.get(cur).type === "file") {
                throw new Error(`路径冲突：${cur} 是文件，无法创建目录`);
            }
        }
    }

    exists(path) {
        return this.root.has(normalizePath(path));
    }

    isDir(path) {
        const n = normalizePath(path);
        const e = this.root.get(n);
        return !!e && e.type === "dir";
    }

    isFile(path) {
        const n = normalizePath(path);
        const e = this.root.get(n);
        return !!e && e.type === "file";
    }

    /** 读取文件内容；路径不存在时抛错 */
    read(path) {
        const n = normalizePath(path);
        const e = this.root.get(n);
        if (!e || e.type !== "file") {
            throw new Error(`文件不存在：/${n}`);
        }
        return e.content;
    }

    /** 写入文件（自动创建目录）；返回文件内容长度 */
    write(path, content) {
        const n = normalizePath(path);
        if (!n) throw new Error("路径不能为空");
        if (typeof content !== "string") {
            throw new Error("内容必须是字符串（素材请用 data URL 或文本）");
        }
        const parts = n.split("/");
        if (parts.length >= 2) {
            const dir = parts.slice(0, -1).join("/");
            this._ensureDir(dir);
            // 角色目录内只允许固定结构：code.js / costumes/* / sounds/*
            if (parts.length >= 2) {
                const rest = parts.slice(1);
                const name = rest[0];
                if (
                    name !== FIXED_SPRITE_NAMES.code &&
                    name !== FIXED_SPRITE_NAMES.costumes &&
                    name !== FIXED_SPRITE_NAMES.sounds
                ) {
                    throw new Error(
                        `角色目录内只允许 ${FIXED_SPRITE_NAMES.code}、${FIXED_SPRITE_NAMES.costumes}/、${FIXED_SPRITE_NAMES.sounds}/，收到：/${n}`
                    );
                }
            }
        }
        this.root.set(n, { type: "file", content });
        this._save();
        return content.length;
    }

    /** 删除文件或空目录 */
    remove(path) {
        const n = normalizePath(path);
        const e = this.root.get(n);
        if (!e) return false;
        if (e.type === "dir") {
            const prefix = n + "/";
            for (const key of [...this.root.keys()]) {
                if (key === n || key.startsWith(prefix)) this.root.delete(key);
            }
        } else {
            this.root.delete(n);
        }
        this._save();
        return true;
    }

    /**
     * 文本替换编辑。oldText 必须匹配至少一次；若匹配多次，默认只替换第一次，
     * 返回匹配次数供调用方判断是否需要精确定位。
     * @returns {{applied:boolean, matches:number, file:string}}
     */
    edit(path, oldText, newText, { occurrence = 0 } = {}) {
        const content = this.read(path);
        if (typeof oldText !== "string" || !oldText) {
            throw new Error("oldText 不能为空");
        }
        let idx = -1;
        let from = 0;
        let matches = 0;
        while (true) {
            const found = content.indexOf(oldText, from);
            if (found === -1) break;
            if (matches === occurrence) {
                idx = found;
                break;
            }
            matches++;
            from = found + oldText.length;
        }
        if (idx === -1) {
            const total = content.split(oldText).length - 1;
            return {
                applied: false,
                matches: total,
                file: `/${normalizePath(path)}`,
                error: `未找到待替换文本（全文件匹配 ${total} 次）`,
            };
        }
        const updated = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
        this.root.set(normalizePath(path), { type: "file", content: updated });
        this._save();
        return { applied: true, matches: 1, file: `/${normalizePath(path)}` };
    }

    /** 列出目录内容；path 缺省为根 */
    list(path = "") {
        const n = path ? normalizePath(path) : "";
        if (n && !this.isDir(n)) throw new Error(`目录不存在：/${n}`);
        const prefix = n ? n + "/" : "";
        const seen = new Map();
        for (const key of this.root.keys()) {
            if (prefix && !key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            if (!rest) continue;
            const seg = rest.split("/")[0];
            if (seen.has(seg)) continue;
            seen.set(seg, {
                name: seg,
                type: this.root.get(prefix + seg).type,
            });
        }
        return [...seen.values()].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    }

    /** 角色列表：根目录下的一级目录（目录名即角色 id） */
    sprites() {
        return this.list("")
            .filter((e) => e.type === "dir")
            .map((e) => e.name);
    }

    /** 读取角色 code.js；不存在时返回 null */
    readSpriteCode(spriteId) {
        const p = `/${spriteId}/${FIXED_SPRITE_NAMES.code}`;
        return this.isFile(p) ? this.read(p) : null;
    }

    // ---------- 持久化 ----------

    /** 导出整棵树为可序列化对象 */
    tree() {
        const out = {};
        for (const [path, e] of this.root) {
            if (e.type === "file") out[path] = e.content;
        }
        return out;
    }

    /** 用对象恢复整棵树（先清空） */
    restore(data) {
        this.root.clear();
        if (data && typeof data === "object") {
            for (const [path, content] of Object.entries(data)) {
                try {
                    this.write(path, content);
                } catch {
                    // 跳过与当前约束冲突的旧数据
                }
            }
        }
        return this;
    }

    serialize() {
        return JSON.stringify(this.tree(), null, 2);
    }

    _save() {
        if (!this.persistKey || !this.storage) return;
        try {
            this.storage.setItem(this.persistKey, this.serialize());
        } catch (e) {
            console.warn(`[VFS] 保存 ${this.persistKey} 失败：`, e.message);
        }
    }
}

export default VFS;
