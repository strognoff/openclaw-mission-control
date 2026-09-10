// Ambient type declarations that mimic the OpenClaw 2026.9.2 host SDK so
// that `tsc` can compile our plugin without the host package being installed
// in the workspace. When the plugin is installed into OpenClaw (which always
// has the host available), the real declarations from `openclaw/plugin-sdk/*`
// take precedence.
//
// If the real package is present, TypeScript will see two declarations and
// the real one wins because it lives under node_modules/openclaw and is
// loaded via `moduleResolution: Bundler`. To avoid duplication, the
// `declare module "openclaw/plugin-sdk/plugin-entry"` below is only consulted
// when the real module is absent.

declare module "openclaw/plugin-sdk/plugin-entry" {
  // Minimal subset of OpenClawPluginApi that we use. Source-of-truth:
  // /home/cechinel/.npm-global/lib/node_modules/openclaw/dist/agent-harness-runtime-CZIVRpx-.d.ts
  // (type OpenClawPluginApi).
  export interface OpenClawPluginApi {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    rootDir?: string;
    registrationMode: string;
    config: Record<string, unknown>;
    pluginConfig?: Record<string, unknown>;
    runtime: Record<string, unknown>;
    logger: {
      info: (msg: string, meta?: Record<string, unknown>) => void;
      warn: (msg: string, meta?: Record<string, unknown>) => void;
      error: (msg: string, meta?: Record<string, unknown>) => void;
      debug: (msg: string, meta?: Record<string, unknown>) => void;
    };
    session: Record<string, unknown>;
    agent: Record<string, unknown>;
    runContext: Record<string, unknown>;
    lifecycle: Record<string, unknown>;
    registerTool: (...args: unknown[]) => void;
    registerHook: (...args: unknown[]) => void;
    registerHttpRoute: (...args: unknown[]) => void;
    registerChannel: (...args: unknown[]) => void;
    registerCli: (...args: unknown[]) => void;
    registerService: (...args: unknown[]) => void;
    registerCommand: (...args: unknown[]) => void;
    registerProvider: (...args: unknown[]) => void;
    registerSpeechProvider: (...args: unknown[]) => void;
    registerEmbeddingProvider: (...args: unknown[]) => void;
    registerImageGenerationProvider: (...args: unknown[]) => void;
    registerVideoGenerationProvider: (...args: unknown[]) => void;
    registerMusicGenerationProvider: (...args: unknown[]) => void;
    registerWebFetchProvider: (...args: unknown[]) => void;
    registerWebSearchProvider: (...args: unknown[]) => void;
    registerMediaUnderstandingProvider: (...args: unknown[]) => void;
    registerRealtimeTranscriptionProvider: (...args: unknown[]) => void;
    registerRealtimeVoiceProvider: (...args: unknown[]) => void;
    registerMigrationProvider: (...args: unknown[]) => void;
    registerGatewayMethod: (...args: unknown[]) => void;
    registerGatewayDiscoveryService: (...args: unknown[]) => void;
    registerTextTransforms: (...args: unknown[]) => void;
    registerConfigMigration: (...args: unknown[]) => void;
    registerAutoEnableProbe: (...args: unknown[]) => void;
    registerDetachedTaskRuntime: (...args: unknown[]) => void;
    registerMemoryCapability: (...args: unknown[]) => void;
    registerMemoryPromptSupplement: (...args: unknown[]) => void;
    registerMemoryPromptPreparation: (...args: unknown[]) => void;
    registerMemoryCorpusSupplement: (...args: unknown[]) => void;
    registerWorkerProvider: (...args: unknown[]) => void;
    registerModelCatalogProvider: (...args: unknown[]) => void;
    registerTranscriptSourceProvider: (...args: unknown[]) => void;
    registerCompactionProvider: (...args: unknown[]) => void;
    registerContextEngine: (...args: unknown[]) => void;
    registerAgentHarness: (...args: unknown[]) => void;
    registerCodexAppServerExtensionFactory: (...args: unknown[]) => void;
    registerAgentToolResultMiddleware: (...args: unknown[]) => void;
    registerBoardWidgetContentKind: (...args: unknown[]) => void;
    registerSessionCatalog: (...args: unknown[]) => void;
    registerHostedMediaResolver: (...args: unknown[]) => void;
    registerWidgetPresenter: (...args: unknown[]) => void;
    registerMcpServerConnectionResolver: (...args: unknown[]) => void;
    registerCliBackend: (...args: unknown[]) => void;
    registerReload: (...args: unknown[]) => void;
    registerNodeHostCommand: (...args: unknown[]) => void;
    registerNodeInvokePolicy: (...args: unknown[]) => void;
    registerSecurityAuditCollector: (...args: unknown[]) => void;
    registerAgentEventSubscription: (...args: unknown[]) => void;
    emitAgentEvent: (...args: unknown[]) => unknown;
    setRunContext: (...args: unknown[]) => boolean;
    getRunContext: (...args: unknown[]) => unknown;
    clearRunContext: (...args: unknown[]) => void;
    registerRuntimeLifecycle: (...args: unknown[]) => void;
    registerSessionExtension: (...args: unknown[]) => void;
    enqueueNextTurnInjection: (...args: unknown[]) => Promise<unknown>;
    registerSessionSchedulerJob: (...args: unknown[]) => unknown;
    registerSessionAction: (...args: unknown[]) => void;
    sendSessionAttachment: (...args: unknown[]) => Promise<unknown>;
    scheduleSessionTurn: (...args: unknown[]) => Promise<unknown>;
    unscheduleSessionTurnsByTag: (...args: unknown[]) => Promise<unknown>;
    registerToolMetadata: (...args: unknown[]) => void;
    registerControlUiDescriptor: (...args: unknown[]) => void;
    registerTrustedToolPolicy: (...args: unknown[]) => void;
    resolvePath: (input: string) => string;
    on: <K extends string>(
      hookName: K,
      handler: (event: unknown, ctx: unknown) => unknown | Promise<unknown>,
      opts?: { priority?: number; registrationId?: string; timeoutMs?: number },
    ) => void;
  }

  // The handler map is open-ended in OpenClaw 2026.9.2 — we type it loosely.
  // Real names: see dist/hook-runner-global-Bj0SlbYF.d.ts PluginHookHandlerMap.
  export function definePluginEntry(spec: {
    id: string;
    name: string;
    description?: string;
    register: (api: OpenClawPluginApi) => void;
  }): {
    id: string;
    name: string;
    description?: string;
    register: (api: OpenClawPluginApi) => void;
  };
}