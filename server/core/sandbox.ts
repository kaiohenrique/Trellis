import { spawn } from 'node:child_process';
import vm from 'node:vm';
import type { RunResponse } from '@kb/shared';
import { buildKbSdk, type SdkContext } from '../sdk/kb.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.KB_SCRIPT_TIMEOUT ?? 10000);

export async function runScript(
  workspaceId: string,
  lang: 'js' | 'python',
  code: string,
): Promise<RunResponse> {
  if (lang === 'js') return runJs(workspaceId, code);
  if (lang === 'python') return runPython(workspaceId, code);
  return { result: null, logs: [], widgets: [], error: `unsupported lang: ${lang}` };
}

// ---------------------------------------------------------------------------
// JS runner — vm.runInNewContext with timeout
// ---------------------------------------------------------------------------

async function runJs(workspaceId: string, code: string): Promise<RunResponse> {
  const ctx: SdkContext = {
    workspaceId,
    logs: [],
    widgetIds: new Set<string>(),
    source_script: code,
  };
  const kb = buildKbSdk(ctx);

  const consoleShim = {
    log: (...args: unknown[]) => kb.log(...args),
    error: (...args: unknown[]) => kb.log('[error]', ...args),
    warn: (...args: unknown[]) => kb.log('[warn]', ...args),
    info: (...args: unknown[]) => kb.log(...args),
  };

  // Wrap the user code so we can return both `result` and any thrown error.
  // The wrapper uses an async IIFE: the caller can use top-level await syntax.
  const wrapped = `(async () => { let result; ${code}; return result; })()`;

  const sandbox: Record<string, unknown> = {
    kb,
    console: consoleShim,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Error,
    // Network globals — widgets often fetch from third-party APIs.
    fetch,
    Headers,
    Request,
    Response,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    // Explicitly omit: require, process, fs, global, globalThis, Buffer
  };

  const context = vm.createContext(sandbox, {
    name: 'kb-script',
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    const script = new vm.Script(wrapped, { filename: 'agent-script.js' });
    const runResult = script.runInContext(context, {
      timeout: DEFAULT_TIMEOUT_MS,
      displayErrors: true,
    }) as Promise<unknown>;

    const result = await withTimeout(runResult, DEFAULT_TIMEOUT_MS);
    return {
      result: serializable(result),
      logs: ctx.logs,
      widgets: Array.from(ctx.widgetIds),
    };
  } catch (err) {
    return {
      result: null,
      logs: ctx.logs,
      widgets: Array.from(ctx.widgetIds),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`script timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function serializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Python runner — subprocess with HTTP-callback SDK
// ---------------------------------------------------------------------------

const PYTHON_WRAPPER = `
import json, os, sys, urllib.request

API_BASE = os.environ.get("KB_API_BASE", "http://127.0.0.1:3000/api/v1")

def _req(method, path, body=None):
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode() or "{}")

class _Kb:
    def get(self, id): return _req("GET", "/nodes/" + id)["data"]
    def list(self, domain=None, tags=None):
        qs = []
        if domain: qs.append("domain=" + domain)
        if tags: qs.append("tags=" + ",".join(tags))
        path = "/nodes" + ("?" + "&".join(qs) if qs else "")
        return _req("GET", path)["data"]
    def search(self, q): return _req("GET", "/nodes?q=" + q)["data"]
    def query(self, q): return _req("POST", "/query", q)["data"]
    def edges(self, **kw):
        qs = "&".join(k + "=" + v for k, v in kw.items() if v)
        return _req("GET", "/edges" + ("?" + qs if qs else ""))["data"]
    def save(self, **node): return _req("POST", "/nodes", node)["data"]
    def link(self, **e): return _req("POST", "/edges", e)["data"]
    def widget(self, id, title, spec, **kw):
        body = {"id": id, "title": title, "type": spec["type"], "spec": spec, **kw}
        return _req("POST", "/widgets", body)["data"]

kb = _Kb()
result = None
logs = []
def kb_log(*args):
    logs.append(" ".join(str(a) for a in args))
kb.log = kb_log

# User code begins
__USER_CODE__
# User code ends

print("__KB_OUTPUT__" + json.dumps({"result": result, "logs": logs}))
`;

async function runPython(workspaceId: string, code: string): Promise<RunResponse> {
  const indented = code.split('\n').join('\n');
  const wrapped = PYTHON_WRAPPER.replace('__USER_CODE__', indented);
  const base = process.env.KB_API_BASE ?? 'http://127.0.0.1:3000/api/v1';

  return new Promise<RunResponse>((resolve) => {
    const proc = spawn('python3', ['-c', wrapped], {
      env: {
        ...process.env,
        // Python wrapper calls back to the workspace-scoped API.
        KB_API_BASE: `${base}/workspaces/${workspaceId}`,
      },
    });

    let stdout = '';
    let stderr = '';
    const logs: string[] = [];

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({
        result: null,
        logs,
        widgets: [],
        error: `script timed out after ${DEFAULT_TIMEOUT_MS}ms`,
      });
    }, DEFAULT_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderr) logs.push(stderr.trim());

      const marker = '__KB_OUTPUT__';
      const idx = stdout.lastIndexOf(marker);
      let result: unknown = null;
      if (idx >= 0) {
        try {
          const parsed = JSON.parse(stdout.slice(idx + marker.length).trim());
          result = parsed.result;
          if (Array.isArray(parsed.logs)) logs.push(...parsed.logs);
          const pre = stdout.slice(0, idx).trim();
          if (pre) logs.unshift(pre);
        } catch (e) {
          logs.push(`failed to parse python output: ${(e as Error).message}`);
        }
      } else if (stdout.trim()) {
        logs.unshift(stdout.trim());
      }

      if (code !== 0 && !stderr) {
        resolve({ result, logs, widgets: [], error: `python exited with code ${code}` });
      } else if (stderr && code !== 0) {
        resolve({ result, logs, widgets: [], error: stderr.trim() });
      } else {
        resolve({ result, logs, widgets: [] });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ result: null, logs, widgets: [], error: err.message });
    });
  });
}
