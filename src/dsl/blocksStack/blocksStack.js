class BlocksStack {
    constructor() {
        this.blocks = {};
        this.editable = true;
        this.controlFlowIds = [];
    }

    push (id, block, parent = null, topLevel = false) {
        this.blocks[id] = {
            ...block,
            id,
            x: 0,
            y: 0,
            topLevel,
            parent: parent ?? null,
            next: block.next ?? null
        };
    }

    pushControl (id, block, topLevel = false) {
        const previousId = this.controlFlowIds.length ? this.controlFlowIds[this.controlFlowIds.length - 1] : null;
        if (previousId && this.blocks[previousId]) {
            this.blocks[previousId].next = id;
        }
        this.push(id, block, previousId ?? null, topLevel);
        this.controlFlowIds.push(id);
    }

    linkChildToParent (childId, parentId) {
        if (!childId || !this.blocks[childId]) return;
        this.blocks[childId].parent = parentId ?? null;
    }
}

export { BlocksStack };