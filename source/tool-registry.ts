export type JsonSchema = Record<string, unknown>;

export type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: JsonSchema;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'scene_get_current_scene',
        description: 'Get the current open scene or prefab editing context.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'scene_get_scene_list',
        description: 'List all scenes in the project.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'scene_open_scene',
        description: 'Open a scene by uuid, db url, asset path, or file path.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'scene_save_current_scene',
        description: 'Save the current scene.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'scene_create_scene',
        description: 'Create a new scene asset with a custom name and open it.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                folderUrl: { type: 'string' },
                url: { type: 'string' },
                overwrite: { type: 'boolean' },
            },
            required: ['name'],
            additionalProperties: false,
        },
    },
    {
        name: 'scene_get_hierarchy',
        description: 'Get the full scene hierarchy, optionally including component properties.',
        inputSchema: {
            type: 'object',
            properties: {
                includeComponentProperties: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'node_create_node',
        description: 'Create a node in the current scene.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                parentUuid: { type: 'string' },
                nodeType: { enum: ['Node', '2DNode', '3DNode'] },
                position: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
                rotation: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
                scale: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'node_get_node',
        description: 'Get node information by uuid.',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string' },
                includeComponentProperties: { type: 'boolean' },
            },
            required: ['uuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'node_find_nodes_by_name',
        description: 'Find nodes by name pattern.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string' },
                exact: { type: 'boolean' },
                regex: { type: 'boolean' },
                includeComponentProperties: { type: 'boolean' },
            },
            required: ['pattern'],
            additionalProperties: false,
        },
    },
    {
        name: 'node_set_properties',
        description: 'Update node name, transform, active state, or parent.',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string' },
                name: { type: 'string' },
                active: { type: 'boolean' },
                parentUuid: { type: 'string' },
                siblingIndex: { type: 'number' },
                position: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
                rotation: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
                scale: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
            },
            required: ['uuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'node_delete_node',
        description: 'Delete a node by uuid.',
        inputSchema: {
            type: 'object',
            properties: { uuid: { type: 'string' } },
            required: ['uuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'node_move_node',
        description: 'Move a node under a different parent.',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string' },
                newParentUuid: { type: 'string' },
                siblingIndex: { type: 'number' },
            },
            required: ['uuid', 'newParentUuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'node_duplicate_node',
        description: 'Duplicate a node and its hierarchy.',
        inputSchema: {
            type: 'object',
            properties: {
                uuid: { type: 'string' },
                parentUuid: { type: 'string' },
                name: { type: 'string' },
            },
            required: ['uuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'component_add_component',
        description: 'Add a component to a node by component type name.',
        inputSchema: {
            type: 'object',
            properties: {
                nodeUuid: { type: 'string' },
                componentType: { type: 'string' },
            },
            required: ['nodeUuid', 'componentType'],
            additionalProperties: false,
        },
    },
    {
        name: 'component_remove_component',
        description: 'Remove a component by component uuid or by node and component type.',
        inputSchema: {
            type: 'object',
            properties: {
                componentUuid: { type: 'string' },
                nodeUuid: { type: 'string' },
                componentType: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'component_get_node_components',
        description: 'List all components on a node.',
        inputSchema: {
            type: 'object',
            properties: {
                nodeUuid: { type: 'string' },
                includeProperties: { type: 'boolean' },
            },
            required: ['nodeUuid'],
            additionalProperties: false,
        },
    },
    {
        name: 'component_set_property',
        description: 'Set a component property using a dotted property path.',
        inputSchema: {
            type: 'object',
            properties: {
                componentUuid: { type: 'string' },
                nodeUuid: { type: 'string' },
                componentType: { type: 'string' },
                path: { type: 'string' },
                value: {},
            },
            required: ['path', 'value'],
            additionalProperties: false,
        },
    },
    {
        name: 'component_mount_script_component',
        description: 'Attach a script component to a node using a script asset path or uuid.',
        inputSchema: {
            type: 'object',
            properties: {
                nodeUuid: { type: 'string' },
                script: { type: 'string' },
            },
            required: ['nodeUuid', 'script'],
            additionalProperties: false,
        },
    },
    {
        name: 'component_list_available_types',
        description: 'List available component types, grouped into builtin and custom.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'prefab_get_prefab_list',
        description: 'List all prefab assets in the project.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'prefab_get_prefab_info',
        description: 'Get detailed prefab information and dependency data.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'prefab_open_prefab',
        description: 'Open a prefab asset in the editor.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'prefab_instantiate_prefab',
        description: 'Instantiate a prefab into the current scene.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
                parentUuid: { type: 'string' },
                name: { type: 'string' },
                unlinkPrefab: { type: 'boolean' },
                position: {
                    type: 'object',
                    properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
                    additionalProperties: false,
                },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'prefab_create_prefab',
        description: 'Create a prefab asset from raw prefab JSON content or from a default template.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' },
                content: { type: 'string' },
            },
            required: ['url'],
            additionalProperties: false,
        },
    },
    {
        name: 'prefab_export_node_to_prefab',
        description: 'Export a scene node directly into a prefab asset.',
        inputSchema: {
            type: 'object',
            properties: {
                nodeUuid: { type: 'string' },
                url: { type: 'string' },
            },
            required: ['nodeUuid', 'url'],
            additionalProperties: false,
        },
    },
    {
        name: 'project_get_info',
        description: 'Get project metadata and editor information.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'project_open_build_panel',
        description: 'Open the Creator build panel with optional options.',
        inputSchema: {
            type: 'object',
            properties: {
                panel: { enum: ['default', 'build-bundle'] },
                options: { type: 'object' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_set_preview_platform',
        description: 'Set the active preview platform to gameView, browser, or simulator.',
        inputSchema: {
            type: 'object',
            properties: {
                platform: { enum: ['gameView', 'browser', 'simulator'] },
            },
            required: ['platform'],
            additionalProperties: false,
        },
    },
    {
        name: 'project_preview_start',
        description: 'Trigger a real preview start for gameView, browser, or simulator.',
        inputSchema: {
            type: 'object',
            properties: {
                platform: { enum: ['gameView', 'browser', 'simulator'] },
                timeoutMs: { type: 'number' },
                retryDelayMs: { type: 'number' },
                retries: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_preview_stop',
        description: 'Stop or reload the active preview session depending on platform.',
        inputSchema: {
            type: 'object',
            properties: {
                platform: { enum: ['gameView', 'browser', 'simulator'] },
                timeoutMs: { type: 'number' },
                retryDelayMs: { type: 'number' },
                retries: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_preview_pause',
        description: 'Pause or resume gameView preview playback.',
        inputSchema: {
            type: 'object',
            properties: {
                paused: { type: 'boolean' },
                timeoutMs: { type: 'number' },
                retryDelayMs: { type: 'number' },
                retries: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_preview_step',
        description: 'Advance one frame in gameView preview.',
        inputSchema: {
            type: 'object',
            properties: {
                timeoutMs: { type: 'number' },
                retryDelayMs: { type: 'number' },
                retries: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_get_preview_info',
        description: 'Get preview platform, preview URL, and connected client count.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'project_get_build_platforms',
        description: 'List available Creator build platforms and platform config.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'project_get_build_tasks',
        description: 'Query current build task queue and task status.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { enum: ['build', 'bundle'] },
                sortType: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'project_build',
        description: 'Create and trigger a real Creator build task.',
        inputSchema: {
            type: 'object',
            properties: {
                platform: { type: 'string' },
                buildPath: { type: 'string' },
                scenes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            url: { type: 'string' },
                            uuid: { type: 'string' },
                        },
                        required: ['url', 'uuid'],
                        additionalProperties: false,
                    },
                },
                startScene: { type: 'string' },
                taskName: { type: 'string' },
                name: { type: 'string' },
                outputName: { type: 'string' },
                debug: { type: 'boolean' },
                sourceMaps: {
                    anyOf: [
                        { type: 'boolean' },
                        { const: 'inline' },
                    ],
                },
                preview: { type: 'boolean' },
                buildMode: { enum: ['normal', 'bundle', 'script'] },
                md5Cache: { type: 'boolean' },
                mainBundleCompressionType: { type: 'string' },
                mainBundleIsRemote: { type: 'boolean' },
                useBuiltinServer: { type: 'boolean' },
                customPipeline: { type: 'boolean' },
                experimentalEraseModules: { type: 'boolean' },
                bundleCommonChunk: { type: 'boolean' },
                inlineSpriteFrames: { type: 'boolean' },
                mangleProperties: { type: 'boolean' },
                inlineEnum: { type: 'boolean' },
                skipCompressTexture: { type: 'boolean' },
                nativeCodeBundleMode: { enum: ['wasm', 'asmjs', 'both'] },
                nextStages: { type: 'array', items: { type: 'string' } },
                resolution: { type: 'object' },
                polyfills: { type: 'object' },
                flags: { type: 'object' },
                macroConfig: { type: 'object' },
                includeModules: { type: 'array', items: { type: 'string' } },
                packages: { type: 'object' },
                shouldWait: { type: 'boolean' },
            },
            required: ['platform', 'buildPath', 'scenes'],
            additionalProperties: false,
        },
    },
    {
        name: 'ai_preview_browser_with_scene',
        description: 'AI-friendly helper: optionally open a scene, then start real browser preview.',
        inputSchema: {
            type: 'object',
            properties: {
                scene: { type: 'string' },
                target: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'ai_build_web_desktop_default',
        description: 'AI-friendly helper: trigger a default web-desktop build using current or provided scenes.',
        inputSchema: {
            type: 'object',
            properties: {
                scenes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            uuid: { type: 'string' },
                            url: { type: 'string' },
                            target: { type: 'string' },
                        },
                        additionalProperties: false,
                    },
                },
                startScene: { type: 'string' },
                buildPath: { type: 'string' },
                taskName: { type: 'string' },
                name: { type: 'string' },
                outputName: { type: 'string' },
                debug: { type: 'boolean' },
                preview: { type: 'boolean' },
                md5Cache: { type: 'boolean' },
                sourceMaps: {
                    anyOf: [
                        { type: 'boolean' },
                        { const: 'inline' },
                    ],
                },
                shouldWait: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'ai_build_web_mobile_default',
        description: 'AI-friendly helper: trigger a default web-mobile build using current or provided scenes.',
        inputSchema: {
            type: 'object',
            properties: {
                scenes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            uuid: { type: 'string' },
                            url: { type: 'string' },
                            target: { type: 'string' },
                        },
                        additionalProperties: false,
                    },
                },
                startScene: { type: 'string' },
                buildPath: { type: 'string' },
                taskName: { type: 'string' },
                name: { type: 'string' },
                outputName: { type: 'string' },
                debug: { type: 'boolean' },
                preview: { type: 'boolean' },
                md5Cache: { type: 'boolean' },
                sourceMaps: {
                    anyOf: [
                        { type: 'boolean' },
                        { const: 'inline' },
                    ],
                },
                shouldWait: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'ai_build_web_mobile_and_wait',
        description: 'AI-friendly helper: trigger a default web-mobile build and wait for the final task state.',
        inputSchema: {
            type: 'object',
            properties: {
                scenes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            uuid: { type: 'string' },
                            url: { type: 'string' },
                            target: { type: 'string' },
                        },
                        additionalProperties: false,
                    },
                },
                startScene: { type: 'string' },
                buildPath: { type: 'string' },
                taskName: { type: 'string' },
                name: { type: 'string' },
                outputName: { type: 'string' },
                debug: { type: 'boolean' },
                preview: { type: 'boolean' },
                md5Cache: { type: 'boolean' },
                sourceMaps: {
                    anyOf: [
                        { type: 'boolean' },
                        { const: 'inline' },
                    ],
                },
                timeoutMs: { type: 'number' },
                pollMs: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'ai_export_selected_nodes_to_prefabs',
        description: 'AI-friendly helper: export all currently selected scene nodes to prefab assets.',
        inputSchema: {
            type: 'object',
            properties: {
                folderUrl: { type: 'string' },
                overwrite: { type: 'boolean' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'ai_export_nodes_by_name_to_prefabs',
        description: 'AI-friendly helper: find nodes by name pattern and export them as prefab assets.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string' },
                folderUrl: { type: 'string' },
                exact: { type: 'boolean' },
                regex: { type: 'boolean' },
                overwrite: { type: 'boolean' },
            },
            required: ['pattern'],
            additionalProperties: false,
        },
    },
    {
        name: 'project_refresh_assets',
        description: 'Refresh the asset database at a target path or db url.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'asset_query_assets',
        description: 'Query assets using asset-db filters.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string' },
                importer: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                extname: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                ccType: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                isBundle: { type: 'boolean' },
                userData: { type: 'object' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'asset_get_asset_info',
        description: 'Get detailed asset information, meta, dependencies, and users.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_create_asset',
        description: 'Create a new asset file.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' },
                content: {},
                overwrite: { type: 'boolean' },
                rename: { type: 'boolean' },
            },
            required: ['url'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_copy_asset',
        description: 'Copy an asset to another target url.',
        inputSchema: {
            type: 'object',
            properties: {
                source: { type: 'string' },
                target: { type: 'string' },
                overwrite: { type: 'boolean' },
                rename: { type: 'boolean' },
            },
            required: ['source', 'target'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_move_asset',
        description: 'Move an asset to another target url.',
        inputSchema: {
            type: 'object',
            properties: {
                source: { type: 'string' },
                target: { type: 'string' },
                overwrite: { type: 'boolean' },
                rename: { type: 'boolean' },
            },
            required: ['source', 'target'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_delete_asset',
        description: 'Delete an asset.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_import_asset',
        description: 'Import an external file into the asset database.',
        inputSchema: {
            type: 'object',
            properties: {
                source: { type: 'string' },
                target: { type: 'string' },
                overwrite: { type: 'boolean' },
                rename: { type: 'boolean' },
            },
            required: ['source', 'target'],
            additionalProperties: false,
        },
    },
    {
        name: 'asset_reimport_asset',
        description: 'Reimport an existing asset.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
            },
            required: ['target'],
            additionalProperties: false,
        },
    },
    {
        name: 'log_get_logs',
        description: 'Read editor logs with optional filters.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { enum: ['log', 'info', 'warn', 'error'] },
                process: { enum: ['browser', 'renderer'] },
                keyword: { type: 'string' },
                limit: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'log_clear_logs',
        description: 'Clear editor logs.',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'debug_execute_scene_javascript',
        description: 'Execute JavaScript in the scene process.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string' },
            },
            required: ['code'],
            additionalProperties: false,
        },
    },
    {
        name: 'debug_get_detailed_node_tree',
        description: 'Get a detailed node tree for debugging.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'debug_get_scene_stats',
        description: 'Get aggregate scene statistics.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'debug_validate_scene',
        description: 'Run simple validation checks against the current scene.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'env_get_environment_info',
        description: 'Get editor, OS, project, and network environment information.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'preferences_get',
        description: 'Get preferences or project config values.',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { enum: ['preferences', 'project'] },
                group: { type: 'string' },
                key: { type: 'string' },
                scope: { enum: ['default', 'global', 'local', 'project'] },
            },
            required: ['group'],
            additionalProperties: false,
        },
    },
    {
        name: 'preferences_set',
        description: 'Set preferences or project config values.',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { enum: ['preferences', 'project'] },
                group: { type: 'string' },
                key: { type: 'string' },
                value: {},
                scope: { enum: ['default', 'global', 'local', 'project'] },
            },
            required: ['group', 'key', 'value'],
            additionalProperties: false,
        },
    },
    {
        name: 'server_get_info',
        description: 'Get server and editor network information.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'message_broadcast',
        description: 'Broadcast a custom editor message.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                args: { type: 'array' },
            },
            required: ['name'],
            additionalProperties: false,
        },
    },
];
