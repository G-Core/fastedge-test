import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineTestSuite, runFlow, loadConfigFile, runAndExit } from '../../../test-framework/suite-runner';
import type { IWasmRunner } from '../../../runner/IWasmRunner';
import type { FullFlowResult, HookResult } from '../../../runner/types';

// ─── Shared mock builders ─────────────────────────────────────────────────────

function makeHookResult(): HookResult {
  return {
    returnCode: 0,
    logs: [],
    input: { request: { headers: {}, body: '' }, response: { headers: {}, body: '' } },
    output: { request: { headers: {}, body: '' }, response: { headers: {}, body: '' } },
    properties: {},
  };
}

function makeFullFlowResult(): FullFlowResult {
  return {
    hookResults: { onRequestHeaders: makeHookResult() },
    finalResponse: { status: 200, statusText: 'OK', headers: {}, body: '', contentType: 'text/plain' },
  };
}

function makeMockRunner(overrides: Partial<IWasmRunner> = {}): IWasmRunner {
  return {
    load: vi.fn(),
    execute: vi.fn(),
    callHook: vi.fn(),
    callFullFlow: vi.fn().mockResolvedValue(makeFullFlowResult()),
    cleanup: vi.fn().mockResolvedValue(undefined),
    getType: vi.fn().mockReturnValue('proxy-wasm'),
    setStateManager: vi.fn(),
    ...overrides,
  } as unknown as IWasmRunner;
}

// ─── defineTestSuite ──────────────────────────────────────────────────────────

describe('defineTestSuite', () => {
  const validTest = { name: 'test', run: async () => {} };

  it('returns the config unchanged when valid with wasmPath', () => {
    const config = { wasmPath: './app.wasm', tests: [validTest] };
    expect(defineTestSuite(config)).toBe(config);
  });

  it('returns the config unchanged when valid with wasmBuffer', () => {
    const config = { wasmBuffer: Buffer.from([0]), tests: [validTest] };
    expect(defineTestSuite(config)).toBe(config);
  });

  it('throws when neither wasmPath nor wasmBuffer is provided', () => {
    expect(() => defineTestSuite({ tests: [validTest] } as any)).toThrow(
      'wasmPath or wasmBuffer'
    );
  });

  it('throws when tests array is empty', () => {
    expect(() => defineTestSuite({ wasmPath: './app.wasm', tests: [] })).toThrow(
      'at least one test case'
    );
  });
});

// ─── runFlow ──────────────────────────────────────────────────────────────────

describe('runFlow', () => {
  it('derives pseudo-headers from url and method', async () => {
    const runner = makeMockRunner();
    await runFlow(runner, { url: 'https://example.com/api/data?q=1', method: 'POST' });

    expect(runner.callFullFlow).toHaveBeenCalledWith(
      'https://example.com/api/data?q=1',
      'POST',
      expect.objectContaining({
        ':method': 'POST',
        ':path': '/api/data?q=1',
        ':authority': 'example.com',
        ':scheme': 'https',
      }),
      '',   // requestBody default
      {},   // properties default
      true, // enforceProductionPropertyRules default
    );
  });

  it('defaults method to GET', async () => {
    const runner = makeMockRunner();
    await runFlow(runner, { url: 'https://example.com/' });

    expect(runner.callFullFlow).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      expect.objectContaining({ ':method': 'GET' }),
      expect.anything(), expect.anything(), expect.anything(),
    );
  });

  it('caller-supplied requestHeaders override pseudo-header defaults', async () => {
    const runner = makeMockRunner();
    await runFlow(runner, {
      url: 'https://example.com/',
      requestHeaders: { ':authority': 'override.example.com', 'x-custom': 'val' },
    });

    expect(runner.callFullFlow).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({
        ':authority': 'override.example.com',
        'x-custom': 'val',
      }),
      expect.anything(), expect.anything(), expect.anything(),
    );
  });

  it('passes through properties and enforceProductionPropertyRules', async () => {
    const runner = makeMockRunner();
    await runFlow(runner, {
      url: 'https://example.com/',
      properties: { env: 'prod' },
      enforceProductionPropertyRules: false,
    });

    expect(runner.callFullFlow).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      { env: 'prod' },
      false,
    );
  });

  it('returns the FullFlowResult from the runner', async () => {
    const runner = makeMockRunner();
    const result = await runFlow(runner, { url: 'https://example.com/' });
    expect(result.finalResponse.status).toBe(200);
  });
});

// ─── loadConfigFile ───────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({ readFile: vi.fn() }));

describe('loadConfigFile', () => {
  // Import the mock after vi.mock is hoisted
  let mockReadFile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const fsMod = await import('fs/promises');
    mockReadFile = fsMod.readFile as unknown as ReturnType<typeof vi.fn>;
    mockReadFile.mockReset();
  });

  it('returns parsed config for a valid file', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ request: { url: 'https://example.com', method: 'GET' } })
    );
    const config = await loadConfigFile('./fastedge-config.test.json');
    expect(config.request.url).toBe('https://example.com');
  });

  it('applies schema defaults (method defaults to GET)', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ request: { url: 'https://example.com' } })
    );
    const config = await loadConfigFile('./fastedge-config.test.json');
    expect(config.request.method).toBe('GET');
  });

  it('throws a descriptive error for invalid JSON', async () => {
    mockReadFile.mockResolvedValue('{ not valid json }');
    await expect(loadConfigFile('./fastedge-config.test.json')).rejects.toThrow('Failed to parse config');
  });

  it('throws a descriptive error when required fields are missing', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ wasm: { path: './app.wasm' } }));
    await expect(loadConfigFile('./fastedge-config.test.json')).rejects.toThrow('Invalid test config');
  });

  it('resolves relative dotenv.path against the config file directory', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        request: { url: 'https://example.com' },
        dotenv: { enabled: true, path: './fixtures' },
      })
    );
    const config = await loadConfigFile('/home/user/project/fastedge-config.test.json');
    expect(config.dotenv?.path).toBe('/home/user/project/fixtures');
  });

  it('leaves absolute dotenv.path unchanged', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        request: { url: 'https://example.com' },
        dotenv: { enabled: true, path: '/abs/path/to/fixtures' },
      })
    );
    const config = await loadConfigFile('/home/user/project/fastedge-config.test.json');
    expect(config.dotenv?.path).toBe('/abs/path/to/fixtures');
  });

  it('resolves parent-relative dotenv.path correctly', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        request: { url: 'https://example.com' },
        dotenv: { enabled: true, path: '../shared/fixtures' },
      })
    );
    const config = await loadConfigFile('/home/user/project/config/fastedge-config.test.json');
    expect(config.dotenv?.path).toBe('/home/user/project/shared/fixtures');
  });
});

// ─── runAndExit ───────────────────────────────────────────────────────────────

vi.mock('../../../runner/standalone', () => ({
  createRunner: vi.fn(),
  createRunnerFromBuffer: vi.fn(),
}));

describe('runAndExit', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Intercept process.exit so it doesn't actually kill the test process
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('exits with 0 when all tests pass', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createRunner } = await import('../../../runner/standalone');
    (createRunner as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockRunner());

    const suite = defineTestSuite({
      wasmPath: './fake.wasm',
      tests: [{ name: 'pass', run: async () => {} }],
    });

    await expect(runAndExit(suite)).rejects.toThrow('process.exit(0)');
  });

  it('exits with 1 when any test fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createRunner } = await import('../../../runner/standalone');
    (createRunner as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockRunner());

    const suite = defineTestSuite({
      wasmPath: './fake.wasm',
      tests: [{ name: 'fail', run: async () => { throw new Error('assertion failed'); } }],
    });

    await expect(runAndExit(suite)).rejects.toThrow('process.exit(1)');
  });

  it('exits with 1 when some pass and some fail', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createRunner } = await import('../../../runner/standalone');
    (createRunner as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockRunner());

    const suite = defineTestSuite({
      wasmPath: './fake.wasm',
      tests: [
        { name: 'pass', run: async () => {} },
        { name: 'fail', run: async () => { throw new Error('nope'); } },
      ],
    });

    await expect(runAndExit(suite)).rejects.toThrow('process.exit(1)');
  });
});
