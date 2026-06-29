type Vec3Like = {
    x?: number;
    y?: number;
    z?: number;
};

type SerializeOptions = {
    includeComponentProperties?: boolean;
};

type NodeCreateSpec = {
    name?: string;
    parentUuid?: string;
    nodeType?: 'Node' | '2DNode' | '3DNode';
    position?: Vec3Like;
    rotation?: Vec3Like;
    scale?: Vec3Like;
};

type NodeUpdateSpec = {
    uuid: string;
    name?: string;
    active?: boolean;
    parentUuid?: string;
    siblingIndex?: number;
    position?: Vec3Like;
    rotation?: Vec3Like;
    scale?: Vec3Like;
};

type ComponentTargetSpec = {
    componentUuid?: string;
    nodeUuid?: string;
    componentType?: string;
};

type PreviewPlatform = 'gameView' | 'browser' | 'simulator';

type PreviewRetryOptions = {
    timeoutMs?: number;
    retryDelayMs?: number;
    retries?: number;
};

declare const cce: any;

function getCC(): any {
    return require('cc');
}

function sceneManager(): any {
    const manager = cce?.Scene;
    if (!manager) {
        throw new Error('Scene manager is not ready.');
    }
    return manager;
}

function currentSceneUuidOrNull(): string | null {
    const uuid = cce?.SceneFacadeManager?.queryCurrentSceneUuid?.();
    return typeof uuid === 'string' && uuid ? uuid : null;
}

function rootNodeOrNull(): any | null {
    return sceneManager().rootNode ?? null;
}

function requireCurrentSceneUuid(): string {
    const uuid = currentSceneUuidOrNull();
    if (!uuid) {
        throw new Error('No scene or prefab is currently open.');
    }
    return uuid;
}

function rootNode(): any {
    const root = rootNodeOrNull();
    if (!root) {
        throw new Error('No scene or prefab is currently open.');
    }
    return root;
}

function currentSceneContext() {
    const uuid = requireCurrentSceneUuid();
    const root = rootNode();
    return {
        uuid,
        root,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePreviewError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('removeAttribute')
        || message.includes('Cannot read properties of undefined')
        || message.includes('preview')
        || message.includes('timeout');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timeout after ${timeoutMs}ms.`));
        }, timeoutMs);

        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

async function runGameViewPreviewAction<T>(
    label: string,
    action: () => Promise<T>,
    options: PreviewRetryOptions = {},
): Promise<{ ok: boolean; attempts: number; result?: T; warning?: string }> {
    const retries = options.retries ?? 2;
    const retryDelayMs = options.retryDelayMs ?? 250;
    const timeoutMs = options.timeoutMs ?? 8000;

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
            const result = await withTimeout(action(), timeoutMs, label);
            return {
                ok: true,
                attempts: attempt,
                result,
            };
        } catch (error) {
            lastError = error;
            if (attempt > retries || !isRetryablePreviewError(error)) {
                break;
            }
            await sleep(retryDelayMs);
        }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    return {
        ok: false,
        attempts: retries + 1,
        warning: `${label} failed: ${message}`,
    };
}

function findNode(uuid: string): any | null {
    const root = rootNode();
    const stack = [root];

    while (stack.length) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        if (node.uuid === uuid) {
            return node;
        }
        const children = node.children ?? [];
        for (const child of children) {
            stack.push(child);
        }
    }

    return null;
}

function flattenNodes(): any[] {
    const root = rootNode();
    const all: any[] = [];
    const stack = [root];

    while (stack.length) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        all.push(node);
        const children = node.children ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }

    return all;
}

function nodePath(node: any): string {
    const names: string[] = [];
    let cursor = node;
    while (cursor) {
        names.push(cursor.name ?? cursor.uuid);
        cursor = cursor.parent;
    }
    return names.reverse().join('/');
}

function vec3(value: any): { x: number; y: number; z: number } {
    return {
        x: value?.x ?? 0,
        y: value?.y ?? 0,
        z: value?.z ?? 0,
    };
}

function applyVec3(target: any, patch?: Vec3Like): void {
    if (!patch || !target) {
        return;
    }
    if (typeof patch.x === 'number') {
        target.x = patch.x;
    }
    if (typeof patch.y === 'number') {
        target.y = patch.y;
    }
    if (typeof patch.z === 'number') {
        target.z = patch.z;
    }
}

function componentType(component: any): string {
    return component?.constructor?.name
        ?? component?.name
        ?? component?._name
        ?? component?.__classname__
        ?? 'UnknownComponent';
}

function safeSerialize(value: unknown, depth = 0, seen = new Set<unknown>()): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'function') {
        return '[Function]';
    }

    if (depth >= 3) {
        if (typeof value === 'object' && (value as any)?.uuid) {
            return {
                uuid: (value as any).uuid,
                name: (value as any).name,
                type: (value as any).constructor?.name ?? 'Object',
            };
        }
        return '[MaxDepth]';
    }

    if (seen.has(value)) {
        return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => safeSerialize(item, depth + 1, seen));
    }

    if (typeof value === 'object') {
        const objectValue = value as Record<string, unknown>;
        if ('uuid' in objectValue && 'name' in objectValue && 'parent' in objectValue) {
            return {
                uuid: objectValue.uuid,
                name: objectValue.name,
                type: (value as any).constructor?.name ?? 'NodeLike',
            };
        }

        const result: Record<string, unknown> = {};
        for (const key of Object.keys(objectValue)) {
            if (key.startsWith('__')) {
                continue;
            }
            const keyValue = objectValue[key];
            if (typeof keyValue === 'function') {
                continue;
            }
            result[key] = safeSerialize(keyValue, depth + 1, seen);
        }
        return result;
    }

    return String(value);
}

function serializeComponent(component: any, includeProperties = false) {
    const result: Record<string, unknown> = {
        uuid: component.uuid,
        type: componentType(component),
        enabled: typeof component.enabled === 'boolean' ? component.enabled : undefined,
    };

    if (includeProperties) {
        const properties: Record<string, unknown> = {};
        for (const key of Object.keys(component)) {
            if (key === 'node' || key.startsWith('__') || typeof component[key] === 'function') {
                continue;
            }
            if (key.startsWith('_') && !key.startsWith('_enabled') && !key.startsWith('_name')) {
                continue;
            }
            properties[key] = safeSerialize(component[key]);
        }
        result.properties = properties;
    }

    return result;
}

function serializeNode(node: any, options: SerializeOptions = {}) {
    return {
        uuid: node.uuid,
        name: node.name,
        active: !!node.active,
        path: nodePath(node),
        position: vec3(node.position ?? node._lpos),
        rotation: vec3(node.eulerAngles ?? node.rotation ?? node._euler),
        scale: vec3(node.scale ?? node._lscale),
        components: (node.components ?? []).map((component: any) => serializeComponent(component, !!options.includeComponentProperties)),
        children: (node.children ?? []).map((child: any) => serializeNode(child, options)),
    };
}

function markDirty(): void {
    const manager = sceneManager();
    if (typeof manager.snapshot === 'function') {
        manager.snapshot();
    }
}

function resolveNodeParent(parentUuid?: string): any {
    if (!parentUuid) {
        return rootNode();
    }
    const parent = findNode(parentUuid);
    if (!parent) {
        throw new Error(`Parent node not found: ${parentUuid}`);
    }
    return parent;
}

function ensureNodeType(node: any, nodeType?: string): void {
    if (nodeType !== '2DNode') {
        return;
    }
    const cc = getCC();
    const hasUITransform = (node.components ?? []).some((component: any) => componentType(component) === 'UITransform');
    if (!hasUITransform) {
        node.addComponent(cc.UITransform);
    }
}

function resolveComponentCtor(componentName: string): any {
    const cc = getCC();
    const ctor = cc?.js?.getClassByName?.(componentName);
    return ctor ?? componentName;
}

function findComponent(target: ComponentTargetSpec): any | null {
    if (target.componentUuid) {
        for (const node of flattenNodes()) {
            for (const component of node.components ?? []) {
                if (component.uuid === target.componentUuid) {
                    return component;
                }
            }
        }
        return null;
    }

    if (!target.nodeUuid) {
        return null;
    }

    const node = findNode(target.nodeUuid);
    if (!node) {
        return null;
    }

    if (!target.componentType) {
        return null;
    }

    return (node.components ?? []).find((component: any) => componentType(component) === target.componentType) ?? null;
}

function setValueByPath(target: any, path: string, value: unknown): void {
    const segments = path.split('.').filter(Boolean);
    if (!segments.length) {
        throw new Error('Property path must not be empty.');
    }

    let cursor = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (!cursor[segment] || typeof cursor[segment] !== 'object') {
            cursor[segment] = {};
        }
        cursor = cursor[segment];
    }

    cursor[segments[segments.length - 1]] = value;
}

export function load() {}

export function unload() {}

export const methods = {
    async getCurrentScene() {
        const uuid = currentSceneUuidOrNull();
        const root = rootNodeOrNull();

        if (!uuid || !root) {
            return {
                uuid: null,
                dirty: false,
                root: null,
            };
        }

        const dirty = await cce?.SceneFacadeManager?.querySceneDirty?.().catch?.(() => false)
            ?? false;

        return {
            uuid,
            dirty: !!dirty,
            root: serializeNode(root),
        };
    },

    async getNodeTree(options?: SerializeOptions) {
        return serializeNode(rootNode(), options);
    },

    async getNode(uuid: string, options?: SerializeOptions) {
        const node = findNode(uuid);
        return node ? serializeNode(node, options) : null;
    },

    async findNodesByName(pattern: string, options?: { exact?: boolean; regex?: boolean; includeComponentProperties?: boolean }) {
        const matcher = options?.regex
            ? new RegExp(pattern)
            : null;

        return flattenNodes()
            .filter((node) => {
                if (options?.exact) {
                    return node.name === pattern;
                }
                if (matcher) {
                    return matcher.test(node.name);
                }
                return String(node.name).includes(pattern);
            })
            .map((node) => serializeNode(node, { includeComponentProperties: options?.includeComponentProperties }));
    },

    async createNode(spec: NodeCreateSpec) {
        const cc = getCC();
        const node = new cc.Node(spec.name ?? 'AI_Node');

        ensureNodeType(node, spec.nodeType);
        applyVec3(node.position, spec.position);
        applyVec3(node.eulerAngles, spec.rotation);
        applyVec3(node.scale, spec.scale);

        const parent = resolveNodeParent(spec.parentUuid);
        parent.addChild(node);
        markDirty();

        return {
            uuid: node.uuid,
            node: serializeNode(node),
        };
    },

    async updateNode(spec: NodeUpdateSpec) {
        const node = findNode(spec.uuid);
        if (!node) {
            throw new Error(`Node not found: ${spec.uuid}`);
        }

        if (typeof spec.name === 'string') {
            node.name = spec.name;
        }
        if (typeof spec.active === 'boolean') {
            node.active = spec.active;
        }
        if (spec.parentUuid) {
            const parent = resolveNodeParent(spec.parentUuid);
            parent.addChild(node);
        }
        if (typeof spec.siblingIndex === 'number') {
            node.setSiblingIndex(spec.siblingIndex);
        }
        applyVec3(node.position, spec.position);
        applyVec3(node.eulerAngles, spec.rotation);
        applyVec3(node.scale, spec.scale);

        markDirty();
        return serializeNode(node);
    },

    async moveNode(spec: { uuid: string; newParentUuid: string; siblingIndex?: number }) {
        return methods.updateNode({
            uuid: spec.uuid,
            parentUuid: spec.newParentUuid,
            siblingIndex: spec.siblingIndex,
        });
    },

    async duplicateNode(spec: { uuid: string; parentUuid?: string; name?: string }) {
        const source = findNode(spec.uuid);
        if (!source) {
            throw new Error(`Node not found: ${spec.uuid}`);
        }

        const cc = getCC();
        const clone = cc.instantiate(source);
        if (typeof spec.name === 'string') {
            clone.name = spec.name;
        }

        const parent = resolveNodeParent(spec.parentUuid ?? source.parent?.uuid);
        parent.addChild(clone);
        markDirty();

        return {
            uuid: clone.uuid,
            node: serializeNode(clone),
        };
    },

    async deleteNode(uuid: string) {
        const node = findNode(uuid);
        if (!node) {
            throw new Error(`Node not found: ${uuid}`);
        }
        node.removeFromParent();
        node.destroy();
        markDirty();
        return { uuid };
    },

    async addComponent(spec: { nodeUuid: string; componentType: string }) {
        const node = findNode(spec.nodeUuid);
        if (!node) {
            throw new Error(`Node not found: ${spec.nodeUuid}`);
        }

        const ctor = resolveComponentCtor(spec.componentType);
        const component = node.addComponent(ctor);
        markDirty();

        return serializeComponent(component, true);
    },

    async removeComponent(spec: ComponentTargetSpec) {
        const component = findComponent(spec);
        if (!component) {
            throw new Error('Component not found.');
        }

        const uuid = component.uuid;
        component.destroy();
        markDirty();
        return { uuid };
    },

    async getNodeComponents(spec: { nodeUuid: string; includeProperties?: boolean }) {
        const node = findNode(spec.nodeUuid);
        if (!node) {
            throw new Error(`Node not found: ${spec.nodeUuid}`);
        }

        return (node.components ?? []).map((component: any) => serializeComponent(component, !!spec.includeProperties));
    },

    async setComponentProperty(spec: ComponentTargetSpec & { path: string; value: unknown }) {
        const component = findComponent(spec);
        if (!component) {
            throw new Error('Component not found.');
        }

        setValueByPath(component, spec.path, spec.value);
        markDirty();
        return serializeComponent(component, true);
    },

    async exportNodeToPrefab(spec: { nodeUuid: string; url: string }) {
        const node = findNode(spec.nodeUuid);
        if (!node) {
            throw new Error(`Node not found: ${spec.nodeUuid}`);
        }

        const createdUuid = await cce?.Prefab?.createPrefabAssetFromNode?.(spec.nodeUuid, spec.url);
        if (!createdUuid) {
            throw new Error(`Failed to export node ${spec.nodeUuid} to prefab: ${spec.url}`);
        }

        return {
            nodeUuid: spec.nodeUuid,
            url: spec.url,
            prefabUuid: createdUuid,
            node: serializeNode(node),
        };
    },

    async setPreviewPlatform(platform: PreviewPlatform) {
        if (!['gameView', 'browser', 'simulator'].includes(platform)) {
            throw new Error(`Unsupported preview platform: ${platform}`);
        }

        if (platform === 'gameView') {
            await Editor.Profile.setConfig('scene', 'console.extend.clearOnPlay.show', true, 'global');
        } else {
            await Editor.Profile.setConfig('scene', 'console.extend.clearOnPlay.show', false, 'global');
        }

        await Editor.Profile.setConfig('preview', 'preview.current.platform', platform, 'local');
        Editor.Message.send('console', 'update-extension-visible');

        return {
            platform,
            updated: true,
        };
    },

    async gameViewSetPlay(state: boolean, options?: PreviewRetryOptions) {
        const run = await runGameViewPreviewAction(
            `gameViewSetPlay(${state})`,
            () => Editor.Message.request('scene', 'editor-preview-set-play', state),
            options,
        );

        return {
            platform: 'gameView',
            playing: state,
            changed: !!run.result,
            ok: run.ok,
            attempts: run.attempts,
            warning: run.warning,
        };
    },

    async gameViewCallMethod(method: 'pause' | 'step', methodArgs: unknown[] = [], options?: PreviewRetryOptions) {
        const run = await runGameViewPreviewAction(
            `gameViewCallMethod(${method})`,
            () => Editor.Message.request('scene', 'editor-preview-call-method', method, ...methodArgs),
            options,
        );

        return {
            platform: 'gameView',
            method,
            ok: run.ok,
            attempts: run.attempts,
            warning: run.warning,
            result: safeSerialize(run.result),
        };
    },

    async getSelectedNodes(options?: SerializeOptions) {
        const uuids = cce?.SceneFacadeManager?.querySelection?.()
            ?? cce?.Selection?.query?.()
            ?? [];

        return uuids
            .map((uuid: string) => findNode(uuid))
            .filter(Boolean)
            .map((node: any) => serializeNode(node, options));
    },

    async evaluate(code: string) {
        const context = currentSceneContext();
        const fn = new Function(
            'cc',
            'scene',
            'rootNode',
            'findNode',
            'serializeNode',
            `return (async () => { ${code} })();`,
        );

        const result = await fn(getCC(), context, context.root, findNode, serializeNode);
        return safeSerialize(result);
    },

    async debugStats() {
        const nodes = flattenNodes();
        const componentCounts: Record<string, number> = {};
        let maxDepth = 0;

        for (const node of nodes) {
            maxDepth = Math.max(maxDepth, nodePath(node).split('/').length);
            for (const component of node.components ?? []) {
                const name = componentType(component);
                componentCounts[name] = (componentCounts[name] ?? 0) + 1;
            }
        }

        return {
            nodeCount: nodes.length,
            componentCount: Object.values(componentCounts).reduce((sum, count) => sum + count, 0),
            inactiveNodeCount: nodes.filter((node) => !node.active).length,
            maxDepth,
            componentCounts,
        };
    },

    async validateScene() {
        const nodes = flattenNodes();
        const warnings: string[] = [];
        const duplicatePathSet = new Set<string>();
        const seenPaths = new Set<string>();

        for (const node of nodes) {
            const path = nodePath(node);
            if (seenPaths.has(path)) {
                duplicatePathSet.add(path);
            }
            seenPaths.add(path);

            if (!String(node.name ?? '').trim()) {
                warnings.push(`Node ${node.uuid} has an empty name.`);
            }

            for (const component of node.components ?? []) {
                const name = componentType(component);
                if (name.includes('Missing')) {
                    warnings.push(`Node ${path} has a missing component: ${name}.`);
                }
            }
        }

        for (const duplicatePath of duplicatePathSet) {
            warnings.push(`Duplicate node path detected: ${duplicatePath}`);
        }

        return {
            valid: warnings.length === 0,
            warnings,
        };
    },
};
