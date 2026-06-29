import { request } from 'http';
import { TOOL_DEFINITIONS } from './tool-registry';

type JsonRpcRequest = {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: any;
};

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
};

function encodeMessage(payload: JsonRpcResponse): string {
    const body = JSON.stringify(payload);
    return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function send(payload: JsonRpcResponse): void {
    process.stdout.write(encodeMessage(payload));
}

function wrapTextResult(data: unknown) {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}

function bridgeRequest(path: string, payload?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                host: '127.0.0.1',
                port: 17321,
                method: payload ? 'POST' : 'GET',
                path,
                headers: payload ? { 'Content-Type': 'application/json' } : undefined,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on('end', () => {
                    try {
                        const raw = Buffer.concat(chunks).toString('utf8');
                        const parsed = raw ? JSON.parse(raw) : {};
                        if (parsed.ok === false) {
                            reject(new Error(parsed.error ?? `Bridge request failed: ${path}`));
                            return;
                        }
                        resolve(parsed.data ?? parsed);
                    } catch (error) {
                        reject(error);
                    }
                });
            },
        );

        req.on('error', reject);
        if (payload) {
            req.write(JSON.stringify(payload));
        }
        req.end();
    });
}

async function handleRequest(requestMessage: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = requestMessage.id ?? null;

    try {
        switch (requestMessage.method) {
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
                        name: 'cc-mvp',
                        version: '1.0.0',
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
            const name = requestMessage.params?.name as string;
            const args = (requestMessage.params?.arguments ?? {}) as Record<string, unknown>;
            const result = await bridgeRequest('/tool', { name, arguments: args });
            return {
                jsonrpc: '2.0',
                id,
                result: result?.content ? result : wrapTextResult(result),
            };
        }
        default:
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32601,
                    message: `Method not found: ${requestMessage.method}`,
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

let buffer = Buffer.alloc(0);

function tryReadMessage(): JsonRpcRequest | null {
    const separator = '\r\n\r\n';
    const headerEnd = buffer.indexOf(separator);
    if (headerEnd === -1) {
        return null;
    }

    const headerText = buffer.subarray(0, headerEnd).toString('utf8');
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
        throw new Error('Missing Content-Length header');
    }

    const contentLength = Number(match[1]);
    const bodyStart = headerEnd + Buffer.byteLength(separator);
    const bodyEnd = bodyStart + contentLength;
    if (buffer.length < bodyEnd) {
        return null;
    }

    const body = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.subarray(bodyEnd);
    return JSON.parse(body);
}

process.stdin.on('data', async (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

    while (true) {
        let message: JsonRpcRequest | null = null;
        try {
            message = tryReadMessage();
        } catch (error) {
            send({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: error instanceof Error ? error.message : String(error),
                },
            });
            buffer = Buffer.alloc(0);
            return;
        }

        if (!message) {
            return;
        }

        const response = await handleRequest(message);
        if (response) {
            send(response);
        }
    }
});
