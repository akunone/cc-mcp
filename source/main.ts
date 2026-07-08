import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { TOOL_DEFINITIONS } from './tool-registry';
// @ts-ignore
import packageJSON from '../package.json';

type Vec3Like = { x?: number; y?: number; z?: number };

type ToolCallInput = {
    name: string;
    arguments?: Record<string, unknown>;
};

type ToolResult = {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
};

type JsonRpcRequest = {
    jsonrpc?: '2.0';
    id?: string | number | null;
    method: string;
    params?: any;
};

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
};

let bridgeServer: Server | null = null;

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSceneScript<T>(method: string, ...args: unknown[]): Promise<T> {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: packageJSON.name,
        method,
        args,
    }) as Promise<T>;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function optionalVec3(value: unknown): Vec3Like | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const input = value as Record<string, unknown>;
    return {
        x: typeof input.x === 'number' ? input.x : undefined,
        y: typeof input.y === 'number' ? input.y : undefined,
        z: typeof input.z === 'number' ? input.z : undefined,
    };
}

function strictVec3(value: Vec3Like | undefined): { x: number; y: number; z: number } | undefined {
    if (!value) {
        return undefined;
    }
    return {
        x: value.x ?? 0,
        y: value.y ?? 0,
        z: value.z ?? 0,
    };
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        || /^[0-9A-Za-z+/=]{22,23}$/.test(value);
}

async function resolveAssetUuid(target: string): Promise<string> {
    if (isUuidLike(target)) {
        return target;
    }

    const uuid = await Editor.Message.request('asset-db', 'query-uuid', target);
    if (!uuid) {
        throw new Error(`Asset not found: ${target}`);
    }
    return uuid;
}

async function queryAssetInfo(target: string, includeMeta = true) {
    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', target, [
        'uuid',
        'url',
        'path',
        'file',
        'type',
        'importer',
        'readonly',
        'visible',
        'mtime',
        'depends',
        'dependeds',
    ]) as any;

    if (!assetInfo) {
        return null;
    }

    const info: Record<string, unknown> = {
        uuid: assetInfo.uuid,
        url: assetInfo.url,
        path: assetInfo.path,
        file: assetInfo.file,
        type: assetInfo.type,
        importer: assetInfo.importer,
        readonly: assetInfo.readonly,
        visible: assetInfo.visible,
        mtime: assetInfo.mtime,
        depends: assetInfo.depends ?? [],
        dependeds: assetInfo.dependeds ?? [],
    };

    if (includeMeta) {
        info.meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
        info.dependencies = await Editor.Message.request('asset-db', 'query-asset-dependencies', assetInfo.uuid, 'all');
        info.users = await Editor.Message.request('asset-db', 'query-asset-users', assetInfo.uuid, 'all');
    }

    return info;
}

function defaultPrefabContent(): string {
    return JSON.stringify([
        {
            "__type__": "cc.Prefab",
            "_name": "New Prefab",
            "_objFlags": 0,
            "_native": "",
            "data": { "__id__": 1 },
            "optimizationPolicy": 0,
            "persistent": false,
            "asyncLoadAssets": false,
        },
        {
            "__type__": "cc.Node",
            "_name": "New Node",
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": null,
            "_children": [],
            "_active": true,
            "_components": [],
            "_prefab": { "__id__": 2 },
            "_lpos": { "__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0 },
            "_lrot": { "__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1 },
            "_lscale": { "__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1 },
            "_layer": 33554432,
            "_euler": { "__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0 },
            "_id": "",
        },
        {
            "__type__": "cc.PrefabInfo",
            "root": { "__id__": 1 },
            "asset": { "__id__": 0 },
            "fileId": "root",
            "instance": null,
            "targetOverrides": null,
            "nestedPrefabInstanceRoots": [],
        },
    ], null, 2);
}

function loadSceneTemplate(sceneName: string): string {
    const projectScenePath = join(Editor.Project.path, 'assets', 'scene.scene');

    if (existsSync(projectScenePath)) {
        const content = JSON.parse(readFileSync(projectScenePath, 'utf8')) as any[];
        if (Array.isArray(content) && content[0]) {
            if (content[0]._name) {
                content[0]._name = sceneName;
            }
            if (content[1]?._name) {
                content[1]._name = sceneName;
            }
        }
        return JSON.stringify(content, null, 2);
    }

    throw new Error('No scene template was found. Add assets/scene.scene to use scene creation.');
}

function ensureTextContent(content: unknown): string | Buffer | null {
    if (content === undefined || content === null) {
        return null;
    }
    if (Buffer.isBuffer(content) || typeof content === 'string') {
        return content;
    }
    return JSON.stringify(content, null, 2);
}

function wrapTextResult(data: unknown): ToolResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}

async function toolSceneGetCurrentScene() {
    const sceneInfo = await executeSceneScript<any>('getCurrentScene');
    const uuid = sceneInfo?.uuid ?? null;
    const url = uuid ? await Editor.Message.request('asset-db', 'query-url', uuid).catch(() => null) : null;
    const path = uuid ? await Editor.Message.request('asset-db', 'query-path', uuid).catch(() => null) : null;

    return {
        uuid,
        url,
        path,
        dirty: !!sceneInfo?.dirty,
        root: sceneInfo?.root ?? null,
    };
}

async function toolSceneGetSceneList() {
    const scenes = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: 'db://assets/**/*.scene',
    }, ['uuid', 'url', 'path', 'file']) as any[];

    const current = await toolSceneGetCurrentScene();

    return {
        currentSceneUuid: current.uuid,
        scenes: (scenes ?? []).map((scene) => ({
            uuid: scene.uuid,
            url: scene.url,
            path: scene.path,
            file: scene.file,
            folder: dirname(scene.url),
            current: scene.uuid === current.uuid,
        })),
    };
}

async function toolSceneOpenScene(args: Record<string, unknown>) {
    const target = requireString(args.target, 'target');
    const uuid = await resolveAssetUuid(target);
    await Editor.Message.request('scene', 'open-scene', uuid);

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const scene = await toolSceneGetCurrentScene();
        if (scene.uuid) {
            return scene;
        }
        await delay(100);
    }

    return {
        uuid,
        url: await Editor.Message.request('asset-db', 'query-url', uuid).catch(() => null),
        path: await Editor.Message.request('asset-db', 'query-path', uuid).catch(() => null),
        dirty: false,
        root: null,
        pendingOpen: true,
    };
}

async function toolSceneSaveCurrentScene() {
    const savedPath = await Editor.Message.request('scene', 'save-scene');
    return {
        savedPath: savedPath ?? null,
        scene: await toolSceneGetCurrentScene(),
    };
}

async function toolSceneCreateScene(args: Record<string, unknown>) {
    const name = requireString(args.name, 'name');
    const folderUrl = optionalString(args.folderUrl) ?? 'db://assets';
    const url = optionalString(args.url) ?? `${folderUrl}/${name}.scene`;
    const overwrite = optionalBoolean(args.overwrite) ?? false;
    const finalUrl = overwrite ? url : await Editor.Message.request('asset-db', 'generate-available-url', url);
    const content = loadSceneTemplate(name);

    const created = await Editor.Message.request('asset-db', 'create-asset', finalUrl, content, { overwrite });
    await Editor.Message.request('scene', 'open-scene', created?.uuid ?? await resolveAssetUuid(finalUrl));

    return {
        asset: created,
        scene: await toolSceneGetCurrentScene(),
    };
}

async function toolSceneGetHierarchy(args: Record<string, unknown>) {
    return executeSceneScript('getNodeTree', {
        includeComponentProperties: optionalBoolean(args.includeComponentProperties) ?? false,
    });
}

async function toolNodeCreate(args: Record<string, unknown>) {
    return executeSceneScript('createNode', {
        name: optionalString(args.name),
        parentUuid: optionalString(args.parentUuid),
        nodeType: optionalString(args.nodeType),
        position: optionalVec3(args.position),
        rotation: optionalVec3(args.rotation),
        scale: optionalVec3(args.scale),
    });
}

async function toolNodeGet(args: Record<string, unknown>) {
    return executeSceneScript('getNode', requireString(args.uuid, 'uuid'), {
        includeComponentProperties: optionalBoolean(args.includeComponentProperties) ?? false,
    });
}

async function toolNodeFindByName(args: Record<string, unknown>) {
    return executeSceneScript('findNodesByName', requireString(args.pattern, 'pattern'), {
        exact: optionalBoolean(args.exact) ?? false,
        regex: optionalBoolean(args.regex) ?? false,
        includeComponentProperties: optionalBoolean(args.includeComponentProperties) ?? false,
    });
}

async function toolNodeSetProperties(args: Record<string, unknown>) {
    return executeSceneScript('updateNode', {
        uuid: requireString(args.uuid, 'uuid'),
        name: optionalString(args.name),
        active: optionalBoolean(args.active),
        parentUuid: optionalString(args.parentUuid),
        siblingIndex: optionalNumber(args.siblingIndex),
        position: optionalVec3(args.position),
        rotation: optionalVec3(args.rotation),
        scale: optionalVec3(args.scale),
    });
}

async function toolNodeDelete(args: Record<string, unknown>) {
    return executeSceneScript('deleteNode', requireString(args.uuid, 'uuid'));
}

async function toolNodeMove(args: Record<string, unknown>) {
    return executeSceneScript('moveNode', {
        uuid: requireString(args.uuid, 'uuid'),
        newParentUuid: requireString(args.newParentUuid, 'newParentUuid'),
        siblingIndex: optionalNumber(args.siblingIndex),
    });
}

async function toolNodeDuplicate(args: Record<string, unknown>) {
    return executeSceneScript('duplicateNode', {
        uuid: requireString(args.uuid, 'uuid'),
        parentUuid: optionalString(args.parentUuid),
        name: optionalString(args.name),
    });
}

async function toolComponentAdd(args: Record<string, unknown>) {
    return executeSceneScript('addComponent', {
        nodeUuid: requireString(args.nodeUuid, 'nodeUuid'),
        componentType: requireString(args.componentType, 'componentType'),
    });
}

async function toolComponentRemove(args: Record<string, unknown>) {
    return executeSceneScript('removeComponent', {
        componentUuid: optionalString(args.componentUuid),
        nodeUuid: optionalString(args.nodeUuid),
        componentType: optionalString(args.componentType),
    });
}

async function toolComponentGetNodeComponents(args: Record<string, unknown>) {
    return executeSceneScript('getNodeComponents', {
        nodeUuid: requireString(args.nodeUuid, 'nodeUuid'),
        includeProperties: optionalBoolean(args.includeProperties) ?? false,
    });
}

async function toolComponentSetProperty(args: Record<string, unknown>) {
    return executeSceneScript('setComponentProperty', {
        componentUuid: optionalString(args.componentUuid),
        nodeUuid: optionalString(args.nodeUuid),
        componentType: optionalString(args.componentType),
        path: requireString(args.path, 'path'),
        value: args.value,
    });
}

async function toolComponentMountScript(args: Record<string, unknown>) {
    const script = requireString(args.script, 'script');
    const nodeUuid = requireString(args.nodeUuid, 'nodeUuid');
    const scriptUuid = await resolveAssetUuid(script);
    const registered = await Editor.Message.request('scene', 'query-components') as Array<{
        name: string;
        cid: string;
        path: string;
        assetUuid: string;
    }>;

    const match = registered.find((component) => component.assetUuid === scriptUuid || component.path === script);
    if (!match) {
        throw new Error(`No registered script component matches ${script}.`);
    }

    return executeSceneScript('addComponent', {
        nodeUuid,
        componentType: match.name,
    });
}

async function toolComponentListAvailableTypes() {
    const classes = await Editor.Message.request('scene', 'query-classes', {
        extends: 'Component',
        excludeSelf: false,
    }) as Array<{ name: string }>;

    const custom = await Editor.Message.request('scene', 'query-components') as Array<{
        name: string;
        cid: string;
        path: string;
        assetUuid: string;
    }>;

    const customNames = new Set(custom.map((item) => item.name));

    return {
        builtin: classes.map((item) => item.name).filter((name) => !customNames.has(name)).sort(),
        custom: custom
            .map((item) => ({
                name: item.name,
                path: item.path,
                assetUuid: item.assetUuid,
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
    };
}

async function listPrefabAssets() {
    const assets = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: 'db://assets/**/*.prefab',
    }, ['uuid', 'url', 'path', 'file', 'type', 'importer']) as any[];

    return (assets ?? []).map((asset) => ({
        uuid: asset.uuid,
        url: asset.url,
        path: asset.path,
        file: asset.file,
        folder: dirname(asset.url),
        name: basename(asset.url),
        type: asset.type,
        importer: asset.importer,
    }));
}

async function toolPrefabGetPrefabList() {
    return {
        prefabs: await listPrefabAssets(),
    };
}

async function toolPrefabGetPrefabInfo(args: Record<string, unknown>) {
    return queryAssetInfo(requireString(args.target, 'target'));
}

async function toolPrefabOpenPrefab(args: Record<string, unknown>) {
    const target = requireString(args.target, 'target');
    const uuid = await resolveAssetUuid(target);
    await Editor.Message.request('asset-db', 'open-asset', uuid);
    return queryAssetInfo(uuid);
}

async function toolPrefabInstantiatePrefab(args: Record<string, unknown>) {
    const target = requireString(args.target, 'target');
    const prefabUuid = await resolveAssetUuid(target);

    const createdUuid = await Editor.Message.request('scene', 'create-node', {
        parent: optionalString(args.parentUuid),
        name: optionalString(args.name),
        assetUuid: prefabUuid,
        type: 'cc.Prefab',
        unlinkPrefab: optionalBoolean(args.unlinkPrefab) ?? false,
        position: strictVec3(optionalVec3(args.position)),
    });

    return executeSceneScript('getNode', createdUuid, {
        includeComponentProperties: false,
    });
}

async function toolPrefabCreatePrefab(args: Record<string, unknown>) {
    const url = requireString(args.url, 'url');
    const content = optionalString(args.content) ?? defaultPrefabContent();
    const created = await Editor.Message.request('asset-db', 'create-asset', url, content);
    return queryAssetInfo(created?.uuid ?? url);
}

async function toolPrefabExportNodeToPrefab(args: Record<string, unknown>) {
    const result = await executeSceneScript<any>('exportNodeToPrefab', {
        nodeUuid: requireString(args.nodeUuid, 'nodeUuid'),
        url: requireString(args.url, 'url'),
    });

    return {
        ...result,
        asset: await queryAssetInfo(result.prefabUuid ?? result.url),
    };
}

function sanitizeFileName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'Node';
}

async function getSceneList() {
    const scenes = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: 'db://assets/**/*.scene',
    }, ['uuid', 'url', 'path', 'file']) as any[];

    return scenes ?? [];
}

async function resolveSceneItems(inputs?: unknown): Promise<Array<{ uuid: string; url: string }>> {
    if (Array.isArray(inputs) && inputs.length) {
        const output: Array<{ uuid: string; url: string }> = [];
        for (const item of inputs) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const record = item as Record<string, unknown>;
            const rawTarget = optionalString(record.uuid) ?? optionalString(record.url) ?? optionalString(record.target);
            if (!rawTarget) {
                continue;
            }
            const uuid = await resolveAssetUuid(rawTarget);
            const url = await Editor.Message.request('asset-db', 'query-url', uuid);
            if (uuid && url) {
                output.push({ uuid, url });
            }
        }
        return output;
    }

    const current = await toolSceneGetCurrentScene();
    if (current.uuid && current.path) {
        const url = await Editor.Message.request('asset-db', 'query-url', current.uuid).catch(() => null);
        if (url) {
            return [{ uuid: current.uuid, url }];
        }
    }

    const allScenes = await getSceneList();
    if (!allScenes.length) {
        throw new Error('No scene assets were found in the project.');
    }

    const startSceneUuid = await Editor.Message.request('preferences', 'query-config', 'preview', 'general.start_scene', 'local')
        .catch(() => null);
    const preferred = allScenes.find((scene) => scene.uuid === startSceneUuid)
        ?? allScenes.find((scene) => scene.uuid === current.uuid)
        ?? allScenes[0];

    return [{
        uuid: preferred.uuid,
        url: preferred.url,
    }];
}

async function getSelectedNodes(includeComponentProperties = false) {
    return executeSceneScript<any[]>('getSelectedNodes', {
        includeComponentProperties,
    });
}

async function toolProjectGetInfo() {
    return {
        packageName: packageJSON.name,
        packageVersion: packageJSON.version,
        projectName: Editor.Project.name,
        projectUuid: Editor.Project.uuid,
        projectPath: Editor.Project.path,
        tempPath: Editor.Project.tmpDir,
        editorVersion: Editor.App.version,
        appName: Editor.App.name,
        appPath: Editor.App.path,
        appHome: Editor.App.home,
        appTemp: Editor.App.temp,
        isDev: Editor.App.dev,
        isPackaged: Editor.App.isPackaged,
    };
}

async function toolProjectOpenBuildPanel(args: Record<string, unknown>) {
    const panel = (optionalString(args.panel) as 'default' | 'build-bundle' | undefined) ?? 'default';
    const options = (args.options && typeof args.options === 'object') ? args.options : undefined;
    await Editor.Message.request('builder', 'open', panel, options);
    return {
        opened: true,
        panel,
        workerReady: await Editor.Message.request('builder', 'query-worker-ready'),
    };
}

async function toolProjectSetPreviewPlatform(args: Record<string, unknown>) {
    const platform = requireString(args.platform, 'platform') as 'gameView' | 'browser' | 'simulator';

    if (platform === 'gameView') {
        return executeSceneScript('setPreviewPlatform', platform);
    }

    await executeSceneScript('setPreviewPlatform', platform);
    await Editor.Message.request('preview', 'change-platform', platform);

    return {
        platform,
        changed: true,
    };
}

async function toolProjectPreviewStart(args: Record<string, unknown>) {
    const platform = optionalString(args.platform) as 'gameView' | 'browser' | 'simulator' | undefined;
    if (platform) {
        await toolProjectSetPreviewPlatform({ platform });
    }

    const activePlatform = (platform
        ?? await Editor.Message.request('preferences', 'query-config', 'preview', 'preview.current.platform', 'local')
        ?? 'browser') as 'gameView' | 'browser' | 'simulator';

    if (activePlatform === 'gameView') {
        return executeSceneScript('gameViewSetPlay', true, {
            timeoutMs: optionalNumber(args.timeoutMs) ?? 8000,
            retryDelayMs: optionalNumber(args.retryDelayMs) ?? 250,
            retries: optionalNumber(args.retries) ?? 2,
        });
    }

    await Editor.Message.request('preview', 'open-terminal');
    const previewUrl = await Editor.Message.request('preview', 'query-preview-url').catch(() => null);

    return {
        platform: activePlatform,
        started: true,
        previewUrl,
    };
}

async function toolProjectPreviewStop(args: Record<string, unknown>) {
    const platform = optionalString(args.platform) as 'gameView' | 'browser' | 'simulator' | undefined;
    const activePlatform = (platform
        ?? await Editor.Message.request('preferences', 'query-config', 'preview', 'preview.current.platform', 'local')
        ?? 'browser') as 'gameView' | 'browser' | 'simulator';

    if (activePlatform === 'gameView') {
        return executeSceneScript('gameViewSetPlay', false, {
            timeoutMs: optionalNumber(args.timeoutMs) ?? 8000,
            retryDelayMs: optionalNumber(args.retryDelayMs) ?? 250,
            retries: optionalNumber(args.retries) ?? 2,
        });
    }

    if (activePlatform === 'simulator') {
        await Editor.Message.request('preview', 'restart-simulator');
        return {
            platform: activePlatform,
            restarted: true,
        };
    }

    await Editor.Message.request('preview', 'reload-terminal');
    const previewUrl = await Editor.Message.request('preview', 'query-preview-url').catch(() => null);
    return {
        platform: activePlatform,
        reloaded: true,
        previewUrl,
    };
}

async function toolProjectPreviewPause(args: Record<string, unknown>) {
    const paused = optionalBoolean(args.paused) ?? true;
    return executeSceneScript('gameViewCallMethod', 'pause', [paused], {
        timeoutMs: optionalNumber(args.timeoutMs) ?? 8000,
        retryDelayMs: optionalNumber(args.retryDelayMs) ?? 250,
        retries: optionalNumber(args.retries) ?? 2,
    });
}

async function toolProjectPreviewStep(args: Record<string, unknown>) {
    return executeSceneScript('gameViewCallMethod', 'step', [], {
        timeoutMs: optionalNumber(args.timeoutMs) ?? 8000,
        retryDelayMs: optionalNumber(args.retryDelayMs) ?? 250,
        retries: optionalNumber(args.retries) ?? 2,
    });
}

async function toolProjectGetPreviewInfo() {
    const platform = await Editor.Message.request('preferences', 'query-config', 'preview', 'preview.current.platform', 'local')
        .catch(() => 'browser');
    const previewUrl = await Editor.Message.request('preview', 'query-preview-url').catch(() => null);
    const connectNum = await Editor.Message.request('preview', 'query-connect-num').catch(() => null);

    return {
        platform,
        previewUrl,
        connectNum,
    };
}

function optionalArrayOfStrings(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((item): item is string => typeof item === 'string');
}

async function toolProjectGetBuildPlatforms() {
    return Editor.Message.request('builder', 'query-platform-config');
}

async function toolProjectGetBuildTasks(args: Record<string, unknown>) {
    const type = optionalString(args.type) as 'build' | 'bundle' | undefined;
    const sortType = optionalString(args.sortType);
    return Editor.Message.request('builder', 'query-tasks-info', {
        type: type ?? 'build',
        sortType,
    });
}

async function toolProjectBuild(args: Record<string, unknown>) {
    const platform = requireString(args.platform, 'platform');
    const buildPath = requireString(args.buildPath, 'buildPath');
    const scenes = Array.isArray(args.scenes) ? args.scenes as any[] : [];
    if (!scenes.length) {
        throw new Error('scenes must contain at least one scene item.');
    }

    const taskName = optionalString(args.taskName) ?? `AI Build ${platform}`;
    const name = optionalString(args.name) ?? Editor.Project.name;
    const outputName = optionalString(args.outputName) ?? Editor.Project.name;
    const startScene = optionalString(args.startScene) ?? String(scenes[0]?.uuid ?? '');
    if (!startScene) {
        throw new Error('startScene is required when scenes are empty or invalid.');
    }

    const taskOptions: Record<string, unknown> = {
        name,
        taskName,
        outputName,
        platform,
        buildPath,
        scenes,
        startScene,
        debug: optionalBoolean(args.debug) ?? true,
        sourceMaps: args.sourceMaps === 'inline' ? 'inline' : (optionalBoolean(args.sourceMaps) ?? false),
        preview: optionalBoolean(args.preview) ?? false,
        buildMode: optionalString(args.buildMode) ?? 'normal',
        md5Cache: optionalBoolean(args.md5Cache) ?? false,
        replaceSplashScreen: optionalBoolean(args.replaceSplashScreen),
        mainBundleCompressionType: optionalString(args.mainBundleCompressionType) ?? 'none',
        mainBundleIsRemote: optionalBoolean(args.mainBundleIsRemote) ?? false,
        useBuiltinServer: optionalBoolean(args.useBuiltinServer) ?? true,
        customPipeline: optionalBoolean(args.customPipeline) ?? false,
        experimentalEraseModules: optionalBoolean(args.experimentalEraseModules) ?? false,
        bundleCommonChunk: optionalBoolean(args.bundleCommonChunk) ?? true,
        inlineSpriteFrames: optionalBoolean(args.inlineSpriteFrames) ?? false,
        mangleProperties: optionalBoolean(args.mangleProperties) ?? false,
        inlineEnum: optionalBoolean(args.inlineEnum) ?? false,
        skipCompressTexture: optionalBoolean(args.skipCompressTexture) ?? false,
        nativeCodeBundleMode: optionalString(args.nativeCodeBundleMode) ?? 'wasm',
        packages: (args.packages && typeof args.packages === 'object') ? args.packages : {},
    };

    const nextStages = optionalArrayOfStrings(args.nextStages);
    if (nextStages?.length) {
        taskOptions.nextStages = nextStages;
    }

    if (args.resolution && typeof args.resolution === 'object') {
        taskOptions.resolution = args.resolution;
    }

    if (args.polyfills && typeof args.polyfills === 'object') {
        taskOptions.polyfills = args.polyfills;
    }

    if (args.flags && typeof args.flags === 'object') {
        taskOptions.flags = args.flags;
    }

    if (args.macroConfig && typeof args.macroConfig === 'object') {
        taskOptions.macroConfig = args.macroConfig;
    }

    if (args.includeModules && Array.isArray(args.includeModules)) {
        taskOptions.includeModules = args.includeModules;
    }

    const shouldWait = optionalBoolean(args.shouldWait) ?? true;
    const result = await Editor.Message.request('builder', 'add-task', taskOptions, shouldWait);
    const tasks = await Editor.Message.request('builder', 'query-tasks-info', { type: 'build' }).catch(() => null);

    return {
        requested: true,
        taskOptions,
        result,
        tasks,
    };
}

async function waitForBuildTask(taskId: string, timeoutMs = 600000, pollMs = 1500) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const tasks = await Editor.Message.request('builder', 'query-tasks-info', { type: 'build' }).catch(() => null) as any;
        const task = tasks?.queue?.[taskId]
            ?? tasks?.list?.find((item: any) => item.id === taskId);

        if (task && ['success', 'failed', 'break'].includes(task.state)) {
            return {
                finished: true,
                task,
                tasks,
            };
        }

        await delay(pollMs);
    }

    const tasks = await Editor.Message.request('builder', 'query-tasks-info', { type: 'build' }).catch(() => null);
    return {
        finished: false,
        timeout: true,
        taskId,
        tasks,
    };
}

async function toolAiBuildWebMobileAndWait(args: Record<string, unknown>) {
    const buildResult = await toolAiBuildWebMobileDefault({
        ...args,
        shouldWait: false,
    });

    const taskId = buildResult?.tasks?.list?.[0]?.id ?? buildResult?.tasks?.list?.find((item: any) => item.taskName === 'AI Build Web Mobile')?.id;
    if (!taskId) {
        return {
            ...buildResult,
            wait: {
                finished: false,
                error: 'Unable to determine task id for waiting.',
            },
        };
    }

    const wait = await waitForBuildTask(
        taskId,
        optionalNumber(args.timeoutMs) ?? 600000,
        optionalNumber(args.pollMs) ?? 1500,
    );

    return {
        ...buildResult,
        wait,
    };
}

async function toolAiPreviewBrowserWithScene(args: Record<string, unknown>) {
    const target = optionalString(args.scene) ?? optionalString(args.target);
    if (target) {
        await toolSceneOpenScene({ target });
    }

    const preview = await toolProjectPreviewStart({ platform: 'browser' });
    return {
        scene: await toolSceneGetCurrentScene(),
        preview,
    };
}

async function toolAiBuildWebDesktopDefault(args: Record<string, unknown>) {
    const scenes = await resolveSceneItems(args.scenes);
    const buildPath = optionalString(args.buildPath) ?? 'project://build/web-desktop';
    return toolProjectBuild({
        platform: 'web-desktop',
        buildPath,
        scenes,
        startScene: optionalString(args.startScene) ?? scenes[0].uuid,
        debug: optionalBoolean(args.debug) ?? true,
        preview: optionalBoolean(args.preview) ?? false,
        md5Cache: optionalBoolean(args.md5Cache) ?? false,
        sourceMaps: args.sourceMaps === 'inline' ? 'inline' : (optionalBoolean(args.sourceMaps) ?? false),
        taskName: optionalString(args.taskName) ?? 'AI Build Web Desktop',
        outputName: optionalString(args.outputName) ?? Editor.Project.name,
        name: optionalString(args.name) ?? Editor.Project.name,
        shouldWait: optionalBoolean(args.shouldWait) ?? true,
    });
}

async function toolAiBuildWebMobileDefault(args: Record<string, unknown>) {
    const scenes = await resolveSceneItems(args.scenes);
    const buildPath = optionalString(args.buildPath) ?? 'project://build/web-mobile';
    return toolProjectBuild({
        platform: 'web-mobile',
        buildPath,
        scenes,
        startScene: optionalString(args.startScene) ?? scenes[0].uuid,
        debug: optionalBoolean(args.debug) ?? true,
        preview: optionalBoolean(args.preview) ?? false,
        md5Cache: optionalBoolean(args.md5Cache) ?? false,
        sourceMaps: args.sourceMaps === 'inline' ? 'inline' : (optionalBoolean(args.sourceMaps) ?? false),
        taskName: optionalString(args.taskName) ?? 'AI Build Web Mobile',
        outputName: optionalString(args.outputName) ?? Editor.Project.name,
        name: optionalString(args.name) ?? Editor.Project.name,
        shouldWait: optionalBoolean(args.shouldWait) ?? true,
    });
}

async function toolAiExportSelectedNodesToPrefabs(args: Record<string, unknown>) {
    const folderUrl = optionalString(args.folderUrl) ?? 'db://assets/prefabs';
    const overwrite = optionalBoolean(args.overwrite) ?? false;
    const selectedNodes = await getSelectedNodes(false);

    if (!selectedNodes.length) {
        throw new Error('No selected nodes found in the current scene.');
    }

    const exported = [];
    for (const node of selectedNodes) {
        const baseUrl = `${folderUrl}/${sanitizeFileName(node.name)}.prefab`;
        const url = overwrite ? baseUrl : await Editor.Message.request('asset-db', 'generate-available-url', baseUrl);
        exported.push(await toolPrefabExportNodeToPrefab({
            nodeUuid: node.uuid,
            url,
        }));
    }

    return {
        count: exported.length,
        prefabs: exported,
    };
}

async function toolAiExportNodesByNameToPrefabs(args: Record<string, unknown>) {
    const pattern = requireString(args.pattern, 'pattern');
    const folderUrl = optionalString(args.folderUrl) ?? 'db://assets/prefabs';
    const exact = optionalBoolean(args.exact) ?? false;
    const regex = optionalBoolean(args.regex) ?? false;
    const overwrite = optionalBoolean(args.overwrite) ?? false;

    const matchedNodes = await executeSceneScript<any[]>('findNodesByName', pattern, {
        exact,
        regex,
        includeComponentProperties: false,
    });

    if (!matchedNodes.length) {
        throw new Error(`No nodes matched pattern: ${pattern}`);
    }

    const exported = [];
    for (const node of matchedNodes) {
        const baseUrl = `${folderUrl}/${sanitizeFileName(node.name)}.prefab`;
        const url = overwrite ? baseUrl : await Editor.Message.request('asset-db', 'generate-available-url', baseUrl);
        exported.push(await toolPrefabExportNodeToPrefab({
            nodeUuid: node.uuid,
            url,
        }));
    }

    return {
        pattern,
        count: exported.length,
        prefabs: exported,
    };
}

async function toolProjectRefreshAssets(args: Record<string, unknown>) {
    const target = optionalString(args.target) ?? 'db://assets';
    await Editor.Message.request('asset-db', 'refresh-asset', target);
    return { refreshed: target };
}

function assetOperationOptions(args: Record<string, unknown>) {
    return {
        overwrite: optionalBoolean(args.overwrite),
        rename: optionalBoolean(args.rename),
    };
}

async function toolAssetQueryAssets(args: Record<string, unknown>) {
    const options: Record<string, unknown> = {};
    for (const key of ['pattern', 'importer', 'extname', 'ccType', 'isBundle', 'userData']) {
        if (args[key] !== undefined) {
            options[key] = args[key];
        }
    }

    const assets = await Editor.Message.request('asset-db', 'query-assets', options, [
        'uuid',
        'url',
        'path',
        'file',
        'type',
        'importer',
        'readonly',
        'visible',
        'mtime',
    ]) as any[];

    return {
        count: assets?.length ?? 0,
        assets,
    };
}

async function toolAssetGetAssetInfo(args: Record<string, unknown>) {
    return queryAssetInfo(requireString(args.target, 'target'));
}

async function toolAssetCreateAsset(args: Record<string, unknown>) {
    const created = await Editor.Message.request(
        'asset-db',
        'create-asset',
        requireString(args.url, 'url'),
        ensureTextContent(args.content),
        assetOperationOptions(args),
    );
    return queryAssetInfo(created?.uuid ?? requireString(args.url, 'url'));
}

async function toolAssetCopyAsset(args: Record<string, unknown>) {
    const copied = await Editor.Message.request(
        'asset-db',
        'copy-asset',
        requireString(args.source, 'source'),
        requireString(args.target, 'target'),
        assetOperationOptions(args),
    );
    return queryAssetInfo(copied?.uuid ?? requireString(args.target, 'target'));
}

async function toolAssetMoveAsset(args: Record<string, unknown>) {
    const moved = await Editor.Message.request(
        'asset-db',
        'move-asset',
        requireString(args.source, 'source'),
        requireString(args.target, 'target'),
        assetOperationOptions(args),
    );
    return queryAssetInfo(moved?.uuid ?? requireString(args.target, 'target'));
}

async function toolAssetDeleteAsset(args: Record<string, unknown>) {
    const target = requireString(args.target, 'target');
    const info = await queryAssetInfo(target, false);
    await Editor.Message.request('asset-db', 'delete-asset', target);
    return {
        deleted: target,
        info,
    };
}

async function toolAssetImportAsset(args: Record<string, unknown>) {
    const imported = await Editor.Message.request(
        'asset-db',
        'import-asset',
        requireString(args.source, 'source'),
        requireString(args.target, 'target'),
        assetOperationOptions(args),
    );
    return queryAssetInfo(imported?.uuid ?? requireString(args.target, 'target'));
}

async function toolAssetReimportAsset(args: Record<string, unknown>) {
    const target = requireString(args.target, 'target');
    await Editor.Message.request('asset-db', 'reimport-asset', target);
    return queryAssetInfo(target);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function toolAssetFindImageReferences(args: Record<string, unknown>) {
    const source = requireString(args.source, 'source');
    const sourceUuid = await resolveAssetUuid(source);

    const prefabs = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: 'db://assets/**/*.prefab',
    }, ['uuid', 'url', 'path', 'file']) as any[];

    const scenes = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: 'db://assets/**/*.scene',
    }, ['uuid', 'url', 'path', 'file']) as any[];

    const allAssets = [...(prefabs ?? []), ...(scenes ?? [])];
    const sourceUrl = await Editor.Message.request('asset-db', 'query-url', sourceUuid).catch(() => null);
    const sourcePath = await Editor.Message.request('asset-db', 'query-path', sourceUuid).catch(() => null);

    const files: Array<{
        uuid: string;
        url: string;
        path: string;
        file: string;
        refCount: number;
    }> = [];
    let totalRefs = 0;

    const regex = new RegExp(escapeRegExp(sourceUuid), 'g');

    for (const asset of allAssets) {
        if (!asset.file || !existsSync(asset.file)) {
            continue;
        }
        const content = readFileSync(asset.file, 'utf8');
        const matches = content.match(regex);
        const refCount = matches ? matches.length : 0;
        if (refCount > 0) {
            files.push({
                uuid: asset.uuid,
                url: asset.url,
                path: asset.path,
                file: asset.file,
                refCount,
            });
            totalRefs += refCount;
        }
    }

    return {
        sourceUuid,
        sourceUrl,
        sourcePath,
        totalFiles: files.length,
        totalReferences: totalRefs,
        files,
    };
}

async function toolAssetReplaceImageReferences(args: Record<string, unknown>) {
    const source = requireString(args.source, 'source');
    const target = requireString(args.target, 'target');
    const dryRun = optionalBoolean(args.dryRun) ?? false;

    const sourceUuid = await resolveAssetUuid(source);
    const targetUuid = await resolveAssetUuid(target);

    if (sourceUuid === targetUuid) {
        throw new Error('Source and target resolve to the same asset UUID. No changes made.');
    }

    // Reuse the find logic to discover affected files
    const findResult = await toolAssetFindImageReferences({ source });
    const files = (findResult as any).files ?? [];

    const results: Array<{
        uuid: string;
        url: string;
        path: string;
        file: string;
        refCount: number;
        replaced: boolean;
        error?: string;
    }> = [];

    for (const fileInfo of files) {
        try {
            if (!dryRun) {
                let content = readFileSync(fileInfo.file, 'utf8');
                const regex = new RegExp(escapeRegExp(sourceUuid), 'g');
                content = content.replace(regex, targetUuid);
                writeFileSync(fileInfo.file, content, 'utf8');
            }
            results.push({ ...fileInfo, replaced: !dryRun });
        } catch (err) {
            results.push({
                ...fileInfo,
                replaced: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // Refresh the asset database when files were actually modified
    if (!dryRun && results.length > 0) {
        await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
    }

    const targetUrl = await Editor.Message.request('asset-db', 'query-url', targetUuid).catch(() => null);

    return {
        sourceUuid,
        targetUuid,
        targetUrl,
        dryRun,
        totalFiles: results.length,
        totalReferences: results.reduce((sum, r) => sum + r.refCount, 0),
        files: results,
    };
}

async function toolLogGetLogs(args: Record<string, unknown>) {
    const type = optionalString(args.type);
    const processType = optionalString(args.process);
    const keyword = optionalString(args.keyword);
    const limit = optionalNumber(args.limit) ?? 200;
    const logs = Editor.Logger.query()
        .filter((log) => !type || log.type === type)
        .filter((log) => !processType || log.process === processType)
        .filter((log) => !keyword || log.message.includes(keyword) || log.stack.includes(keyword))
        .slice(-limit);

    return {
        count: logs.length,
        logs,
    };
}

async function toolLogClearLogs(args: Record<string, unknown>) {
    const keyword = optionalString(args.keyword);
    Editor.Logger.clear(keyword ? new RegExp(keyword) : undefined);
    return { cleared: true, keyword: keyword ?? null };
}

async function toolDebugExecuteSceneJavascript(args: Record<string, unknown>) {
    return executeSceneScript('evaluate', requireString(args.code, 'code'));
}

async function toolDebugGetDetailedNodeTree() {
    return executeSceneScript('getNodeTree', {
        includeComponentProperties: true,
    });
}

async function toolDebugGetSceneStats() {
    return executeSceneScript('debugStats');
}

async function toolDebugValidateScene() {
    return executeSceneScript('validateScene');
}

async function toolEnvGetEnvironmentInfo() {
    return {
        editor: {
            version: Editor.App.version,
            name: Editor.App.name,
            dev: Editor.App.dev,
            packaged: Editor.App.isPackaged,
            path: Editor.App.path,
            home: Editor.App.home,
            temp: Editor.App.temp,
            userAgent: Editor.App.userAgent,
        },
        project: {
            name: Editor.Project.name,
            uuid: Editor.Project.uuid,
            path: Editor.Project.path,
            temp: Editor.Project.tmpDir,
        },
        network: {
            ips: Editor.Network.queryIPList(),
            serverPort: await Editor.Message.request('server', 'query-port'),
            advertisedIps: await Editor.Message.request('server', 'query-ip-list'),
        },
    };
}

async function toolPreferencesGet(args: Record<string, unknown>) {
    const domain = optionalString(args.domain) ?? 'preferences';
    const group = requireString(args.group, 'group');
    const key = optionalString(args.key);
    const scope = optionalString(args.scope) as any;

    if (domain === 'project') {
        return Editor.Message.request('project', 'query-config', group, key, scope);
    }

    return Editor.Message.request('preferences', 'query-config', group, key, scope);
}

async function toolPreferencesSet(args: Record<string, unknown>) {
    const domain = optionalString(args.domain) ?? 'preferences';
    const group = requireString(args.group, 'group');
    const key = requireString(args.key, 'key');
    const value = args.value;
    const scope = optionalString(args.scope) as any;

    if (domain === 'project') {
        const success = await Editor.Message.request('project', 'set-config', group, key, value);
        return { success, domain, group, key, value };
    }

    const success = await Editor.Message.request('preferences', 'set-config', group, key, value, scope);
    return { success, domain, group, key, value, scope: scope ?? null };
}

async function toolServerGetInfo() {
    return {
        editorIps: Editor.Network.queryIPList(),
        serverIps: await Editor.Message.request('server', 'query-ip-list'),
        serverPort: await Editor.Message.request('server', 'query-port'),
    };
}

async function toolMessageBroadcast(args: Record<string, unknown>) {
    const name = requireString(args.name, 'name');
    const broadcastArgs = Array.isArray(args.args) ? args.args : [];
    Editor.Message.broadcast(name, ...broadcastArgs as any[]);
    return {
        broadcast: true,
        name,
        args: broadcastArgs,
    };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
    switch (name) {
    case 'scene_get_current_scene':
        return toolSceneGetCurrentScene();
    case 'scene_get_scene_list':
        return toolSceneGetSceneList();
    case 'scene_open_scene':
        return toolSceneOpenScene(args);
    case 'scene_save_current_scene':
        return toolSceneSaveCurrentScene();
    case 'scene_create_scene':
        return toolSceneCreateScene(args);
    case 'scene_get_hierarchy':
        return toolSceneGetHierarchy(args);
    case 'node_create_node':
        return toolNodeCreate(args);
    case 'node_get_node':
        return toolNodeGet(args);
    case 'node_find_nodes_by_name':
        return toolNodeFindByName(args);
    case 'node_set_properties':
        return toolNodeSetProperties(args);
    case 'node_delete_node':
        return toolNodeDelete(args);
    case 'node_move_node':
        return toolNodeMove(args);
    case 'node_duplicate_node':
        return toolNodeDuplicate(args);
    case 'component_add_component':
        return toolComponentAdd(args);
    case 'component_remove_component':
        return toolComponentRemove(args);
    case 'component_get_node_components':
        return toolComponentGetNodeComponents(args);
    case 'component_set_property':
        return toolComponentSetProperty(args);
    case 'component_mount_script_component':
        return toolComponentMountScript(args);
    case 'component_list_available_types':
        return toolComponentListAvailableTypes();
    case 'prefab_get_prefab_list':
        return toolPrefabGetPrefabList();
    case 'prefab_get_prefab_info':
        return toolPrefabGetPrefabInfo(args);
    case 'prefab_open_prefab':
        return toolPrefabOpenPrefab(args);
    case 'prefab_instantiate_prefab':
        return toolPrefabInstantiatePrefab(args);
    case 'prefab_create_prefab':
        return toolPrefabCreatePrefab(args);
    case 'prefab_export_node_to_prefab':
        return toolPrefabExportNodeToPrefab(args);
    case 'project_get_info':
        return toolProjectGetInfo();
    case 'project_open_build_panel':
        return toolProjectOpenBuildPanel(args);
    case 'project_set_preview_platform':
        return toolProjectSetPreviewPlatform(args);
    case 'project_preview_start':
        return toolProjectPreviewStart(args);
    case 'project_preview_stop':
        return toolProjectPreviewStop(args);
    case 'project_preview_pause':
        return toolProjectPreviewPause(args);
    case 'project_preview_step':
        return toolProjectPreviewStep(args);
    case 'project_get_preview_info':
        return toolProjectGetPreviewInfo();
    case 'project_get_build_platforms':
        return toolProjectGetBuildPlatforms();
    case 'project_get_build_tasks':
        return toolProjectGetBuildTasks(args);
    case 'project_build':
        return toolProjectBuild(args);
    case 'ai_preview_browser_with_scene':
        return toolAiPreviewBrowserWithScene(args);
    case 'ai_build_web_desktop_default':
        return toolAiBuildWebDesktopDefault(args);
    case 'ai_build_web_mobile_default':
        return toolAiBuildWebMobileDefault(args);
    case 'ai_build_web_mobile_and_wait':
        return toolAiBuildWebMobileAndWait(args);
    case 'ai_export_selected_nodes_to_prefabs':
        return toolAiExportSelectedNodesToPrefabs(args);
    case 'ai_export_nodes_by_name_to_prefabs':
        return toolAiExportNodesByNameToPrefabs(args);
    case 'project_refresh_assets':
        return toolProjectRefreshAssets(args);
    case 'asset_query_assets':
        return toolAssetQueryAssets(args);
    case 'asset_get_asset_info':
        return toolAssetGetAssetInfo(args);
    case 'asset_create_asset':
        return toolAssetCreateAsset(args);
    case 'asset_copy_asset':
        return toolAssetCopyAsset(args);
    case 'asset_move_asset':
        return toolAssetMoveAsset(args);
    case 'asset_delete_asset':
        return toolAssetDeleteAsset(args);
    case 'asset_import_asset':
        return toolAssetImportAsset(args);
    case 'asset_reimport_asset':
        return toolAssetReimportAsset(args);
    case 'asset_find_image_references':
        return toolAssetFindImageReferences(args);
    case 'asset_replace_image_references':
        return toolAssetReplaceImageReferences(args);
    case 'log_get_logs':
        return toolLogGetLogs(args);
    case 'log_clear_logs':
        return toolLogClearLogs(args);
    case 'debug_execute_scene_javascript':
        return toolDebugExecuteSceneJavascript(args);
    case 'debug_get_detailed_node_tree':
        return toolDebugGetDetailedNodeTree();
    case 'debug_get_scene_stats':
        return toolDebugGetSceneStats();
    case 'debug_validate_scene':
        return toolDebugValidateScene();
    case 'env_get_environment_info':
        return toolEnvGetEnvironmentInfo();
    case 'preferences_get':
        return toolPreferencesGet(args);
    case 'preferences_set':
        return toolPreferencesSet(args);
    case 'server_get_info':
        return toolServerGetInfo();
    case 'message_broadcast':
        return toolMessageBroadcast(args);
    default:
        throw new Error(`Unknown tool: ${name}`);
    }
}

function legacyCrudToTool(payload: { target: string; action: string; params?: Record<string, unknown> }): ToolCallInput {
    const params = payload.params ?? {};
    if (payload.target === 'scene' && payload.action === 'get') {
        return { name: 'scene_get_current_scene', arguments: params };
    }
    if (payload.target === 'scene' && payload.action === 'update') {
        return { name: 'scene_save_current_scene', arguments: params };
    }
    if (payload.target === 'node' && payload.action === 'list') {
        return { name: 'scene_get_hierarchy', arguments: params };
    }
    if (payload.target === 'node' && payload.action === 'get') {
        return { name: 'node_get_node', arguments: params };
    }
    if (payload.target === 'node' && payload.action === 'create') {
        return { name: 'node_create_node', arguments: params };
    }
    if (payload.target === 'node' && payload.action === 'update') {
        return { name: 'node_set_properties', arguments: params };
    }
    if (payload.target === 'node' && payload.action === 'delete') {
        return { name: 'node_delete_node', arguments: params };
    }
    if (payload.target === 'prefab' && payload.action === 'list') {
        return { name: 'prefab_get_prefab_list', arguments: params };
    }
    if (payload.target === 'prefab' && payload.action === 'get') {
        return { name: 'prefab_get_prefab_info', arguments: { target: params.target } };
    }
    if (payload.target === 'prefab' && payload.action === 'create') {
        return { name: 'prefab_create_prefab', arguments: params };
    }
    throw new Error(`Legacy CRUD mapping is not available for ${payload.target}.${payload.action}`);
}

async function handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;

    try {
        switch (request.method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                    },
                    serverInfo: {
                        name: packageJSON.name,
                        version: packageJSON.version,
                    },
                },
            };
        case 'notifications/initialized':
            return null;
        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: TOOL_DEFINITIONS,
                },
            };
        case 'tools/call': {
            const name = request.params?.name as string;
            const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
            const data = await callTool(name, args);
            return {
                jsonrpc: '2.0',
                id,
                result: wrapTextResult(data),
            };
        }
        default:
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32601,
                    message: `Method not found: ${request.method}`,
                },
            };
        }
    } catch (error) {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                code: -32000,
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload, null, 2));
}

function startBridgeServer(): void {
    if (bridgeServer) {
        return;
    }

    bridgeServer = createServer(async (req, res) => {
        try {
            if (!req.url) {
                writeJson(res, 404, { ok: false, error: 'Missing URL' });
                return;
            }

            if (req.method === 'GET' && req.url === '/health') {
                writeJson(res, 200, {
                    ok: true,
                    data: {
                        extension: packageJSON.name,
                        version: packageJSON.version,
                        projectPath: Editor.Project.path,
                    },
                });
                return;
            }

            if (req.method === 'GET' && req.url === '/tools') {
                writeJson(res, 200, {
                    ok: true,
                    data: TOOL_DEFINITIONS,
                });
                return;
            }

            if (req.method === 'POST' && req.url === '/tool') {
                const payload = await readJsonBody(req) as ToolCallInput;
                const result = await callTool(payload.name, payload.arguments ?? {});
                writeJson(res, 200, { ok: true, data: result });
                return;
            }

            if (req.method === 'POST' && req.url === '/mcp') {
                const payload = await readJsonBody(req) as JsonRpcRequest;
                const response = await handleJsonRpc(payload);
                if (!response) {
                    writeJson(res, 204, {});
                    return;
                }
                writeJson(res, 200, response);
                return;
            }

            if (req.method === 'POST' && req.url === '/crud') {
                const payload = await readJsonBody(req) as { target: string; action: string; params?: Record<string, unknown> };
                const toolInput = legacyCrudToTool(payload);
                const result = await callTool(toolInput.name, toolInput.arguments ?? {});
                writeJson(res, 200, { ok: true, data: result });
                return;
            }

            if (req.method === 'POST' && req.url === '/message') {
                const payload = await readJsonBody(req) as { channel: string; message: string; args?: unknown[] };
                const result = await Editor.Message.request(
                    payload.channel as any,
                    payload.message as any,
                    ...(payload.args ?? []),
                );
                writeJson(res, 200, { ok: true, data: result });
                return;
            }

            writeJson(res, 404, { ok: false, error: `Unsupported route: ${req.method} ${req.url}` });
        } catch (error) {
            writeJson(res, 500, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    bridgeServer.listen(17321, '127.0.0.1', () => {
        console.log(`[${packageJSON.name}] bridge listening at http://127.0.0.1:17321`);
    });
}

function stopBridgeServer(): void {
    if (!bridgeServer) {
        return;
    }
    bridgeServer.close();
    bridgeServer = null;
}

export const methods: { [key: string]: (...args: any[]) => any } = {
    openPanel() {
        Editor.Panel.open(packageJSON.name);
    },
    listTools() {
        return TOOL_DEFINITIONS;
    },
    async callTool(input: ToolCallInput) {
        return callTool(input.name, input.arguments ?? {});
    },
    async jsonRpc(input: JsonRpcRequest) {
        return handleJsonRpc(input);
    },
    async getBridgeInfo() {
        return {
            name: packageJSON.name,
            version: packageJSON.version,
            httpBaseUrl: 'http://127.0.0.1:17321',
            mcpHttpEndpoint: 'http://127.0.0.1:17321/mcp',
            toolEndpoint: 'http://127.0.0.1:17321/tool',
            mcpServerEntry: join(Editor.Project.path, 'extensions', packageJSON.name, 'dist', 'mcp-server.js'),
        };
    },
};

export function load() {
    startBridgeServer();
}

export function unload() {
    stopBridgeServer();
}
