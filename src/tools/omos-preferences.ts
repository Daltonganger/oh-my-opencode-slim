import {
  type PluginInput,
  type ToolDefinition,
  tool,
} from '@opencode-ai/plugin';
import { parseConfig, writeConfig } from '../cli/config-io';
import { getExistingLiteConfigPath } from '../cli/paths';
import { resolveAgentWithPrecedence } from '../cli/precedence-resolver';
import {
  type AgentOverrideConfig,
  ManualPlanSchema,
  type PluginConfig,
  type Preset,
} from '../config';

const AGENT_NAMES = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

type AgentName = (typeof AGENT_NAMES)[number];

type ManualAgentPlan = {
  primary: string;
  fallback1: string;
  fallback2: string;
  fallback3: string;
};

type ManualPlan = Record<AgentName, ManualAgentPlan>;

const DEFAULT_CHAIN_FILL = [
  'opencode/gpt-5-nano',
  'opencode/glm-4.7-free',
  'opencode/big-pickle',
  'opencode/sonic',
];

function dedupe(models: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }
  return result;
}

function readLiteConfig(): { path: string; config: PluginConfig } {
  const path = getExistingLiteConfigPath();
  const parsed = parseConfig(path);
  if (parsed.error) {
    throw new Error(`Failed to parse lite config: ${parsed.error}`);
  }
  return { path, config: (parsed.config ?? {}) as PluginConfig };
}

function getActivePresetAgents(config: PluginConfig): Record<string, unknown> {
  const presetName = config.preset;
  if (presetName && config.presets?.[presetName]) {
    return config.presets[presetName] as Record<string, unknown>;
  }
  return (config.agents ?? {}) as Record<string, unknown>;
}

function getAgentPrimary(
  config: PluginConfig,
  agentName: AgentName,
): string | undefined {
  const fromRoot = (
    config.agents?.[agentName] as { model?: string } | undefined
  )?.model;
  if (fromRoot) return fromRoot;

  const activePresetAgents = getActivePresetAgents(config);
  return (activePresetAgents[agentName] as { model?: string } | undefined)
    ?.model;
}

function deriveAgentChain(
  config: PluginConfig,
  agentName: AgentName,
): string[] {
  const primary = getAgentPrimary(config, agentName);
  const fromFallback = config.fallback?.chains?.[agentName] ?? [];
  const resolved = dedupe([primary, ...fromFallback]);

  const fill = dedupe([...resolved, ...DEFAULT_CHAIN_FILL]);
  return fill.slice(0, 4);
}

export function deriveManualPlanFromConfig(config: PluginConfig): ManualPlan {
  const entries = AGENT_NAMES.map((agentName) => {
    const chain = deriveAgentChain(config, agentName);
    return [
      agentName,
      {
        primary: chain[0] ?? 'opencode/big-pickle',
        fallback1: chain[1] ?? 'opencode/gpt-5-nano',
        fallback2: chain[2] ?? 'opencode/glm-4.7-free',
        fallback3: chain[3] ?? 'opencode/sonic',
      },
    ];
  });

  return Object.fromEntries(entries) as ManualPlan;
}

function buildAgentConfig(
  existing: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  return {
    ...existing,
    model,
  };
}

export function compileManualPlanToConfig(
  config: PluginConfig,
  manualPlan: ManualPlan,
): PluginConfig {
  const fallbackChains: Record<string, string[]> = {};
  const rootAgents: Record<string, AgentOverrideConfig> = {
    ...(config.agents ?? {}),
  };

  const activePresetAgents = getActivePresetAgents(config);
  const manualPreset: Preset = {};

  for (const agentName of AGENT_NAMES) {
    const plan = manualPlan[agentName];
    const resolved = resolveAgentWithPrecedence({
      agentName,
      manualUserPlan: [
        plan.primary,
        plan.fallback1,
        plan.fallback2,
        plan.fallback3,
      ],
      systemDefault: ['opencode/big-pickle'],
    });

    fallbackChains[agentName] = resolved.chain;

    const existingRoot = (rootAgents[agentName] ?? {}) as Record<
      string,
      unknown
    >;
    rootAgents[agentName] = buildAgentConfig(
      existingRoot,
      plan.primary,
    ) as AgentOverrideConfig;

    const existingPreset =
      (activePresetAgents[agentName] as Record<string, unknown> | undefined) ??
      {};
    manualPreset[agentName] = buildAgentConfig(
      existingPreset,
      plan.primary,
    ) as AgentOverrideConfig;
  }

  return {
    ...config,
    preset: 'manual',
    manualPlan,
    agents: rootAgents,
    presets: {
      ...(config.presets ?? {}),
      manual: manualPreset,
    },
    fallback: {
      enabled: config.fallback?.enabled ?? true,
      timeoutMs: config.fallback?.timeoutMs ?? 15000,
      chains: {
        ...(config.fallback?.chains ?? {}),
        ...fallbackChains,
      },
    },
  };
}

function stringify(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function createOmosPreferencesTools(_ctx: PluginInput): {
  omos_preferences: ToolDefinition;
} {
  const z = tool.schema;

  const omos_preferences = tool({
    description: `Manage OMOS model preferences.

Operations:
- show: show current per-agent primary + 3 fallbacks
- plan: validate and preview manual plan compile (no write)
- apply: validate and write manual plan atomically
- reset-agent: reset one agent manual chain from policy defaults`,
    args: {
      operation: z.enum(['show', 'plan', 'apply', 'reset-agent']),
      plan: z.unknown().optional(),
      agent: z.string().optional(),
      confirm: z.boolean().optional(),
    },
    async execute(args) {
      const operation = args.operation;

      if (operation === 'show') {
        const { path, config } = readLiteConfig();
        const manualPlan = deriveManualPlanFromConfig(config);
        return `Loaded: ${path}\n\n${stringify({ manualPlan })}`;
      }

      if (operation === 'plan') {
        const { config } = readLiteConfig();
        const parsed = ManualPlanSchema.safeParse(args.plan);
        if (!parsed.success) {
          return `Invalid plan:\n${stringify(parsed.error.format())}`;
        }

        const preview = compileManualPlanToConfig(config, parsed.data);
        const compiled = {
          agents: AGENT_NAMES.reduce(
            (acc, agentName) => {
              acc[agentName] = {
                model: (
                  preview.agents?.[agentName] as { model?: string } | undefined
                )?.model,
              };
              return acc;
            },
            {} as Record<string, { model?: string }>,
          ),
          fallback: preview.fallback,
        };

        return `Plan preview (no write):\n\n${stringify(compiled)}`;
      }

      if (operation === 'apply') {
        if (args.confirm !== true) {
          return 'Refusing apply without confirm=true.';
        }

        const { path, config } = readLiteConfig();
        const parsed = ManualPlanSchema.safeParse(args.plan);
        if (!parsed.success) {
          return `Invalid plan:\n${stringify(parsed.error.format())}`;
        }

        const nextConfig = compileManualPlanToConfig(config, parsed.data);
        writeConfig(path, nextConfig as Record<string, unknown>);
        return `Applied manual plan to ${path}. Backup written as ${path}.bak. Restart OpenCode for new sessions.`;
      }

      const agent = args.agent as AgentName | undefined;
      if (!agent || !AGENT_NAMES.includes(agent)) {
        return `Invalid agent. Expected one of: ${AGENT_NAMES.join(', ')}`;
      }

      if (operation === 'reset-agent') {
        const { path, config } = readLiteConfig();
        const currentPlan = deriveManualPlanFromConfig(config);
        const chain = deriveAgentChain(config, agent);
        currentPlan[agent] = {
          primary: chain[0] ?? 'opencode/big-pickle',
          fallback1: chain[1] ?? 'opencode/gpt-5-nano',
          fallback2: chain[2] ?? 'opencode/glm-4.7-free',
          fallback3: chain[3] ?? 'opencode/sonic',
        };

        const nextConfig = compileManualPlanToConfig(config, currentPlan);
        writeConfig(path, nextConfig as Record<string, unknown>);
        return `Reset agent ${agent} and wrote updated plan to ${path}.`;
      }

      return 'Unsupported operation';
    },
  });

  return { omos_preferences };
}
