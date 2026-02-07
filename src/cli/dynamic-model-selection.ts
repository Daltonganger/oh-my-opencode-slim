import type {
  DiscoveredModel,
  DynamicModelPlan,
  ExternalSignalMap,
  InstallConfig,
} from './types';

const AGENTS = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

type AgentName = (typeof AGENTS)[number];

const ROLE_VARIANT: Record<AgentName, string | undefined> = {
  orchestrator: undefined,
  oracle: 'high',
  designer: 'medium',
  explorer: 'low',
  librarian: 'low',
  fixer: 'low',
};

function getEnabledProviders(config: InstallConfig): string[] {
  const providers: string[] = [];
  if (config.hasOpenAI) providers.push('openai');
  if (config.hasAnthropic) providers.push('anthropic');
  if (config.hasCopilot) providers.push('github-copilot');
  if (config.hasZaiPlan) providers.push('zai-coding-plan');
  if (config.hasKimi) providers.push('kimi-for-coding');
  if (config.hasAntigravity) providers.push('google');
  if (config.hasChutes) providers.push('chutes');
  if (config.useOpenCodeFreeModels) providers.push('opencode');
  return providers;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalize(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return clamp01(value / max);
}

function statusMultiplier(status: DiscoveredModel['status']): number {
  if (status === 'active') return 1;
  if (status === 'beta') return 0.7;
  if (status === 'alpha') return 0.4;
  return 0;
}

function capabilityScore(agent: AgentName, model: DiscoveredModel): number {
  if (model.status === 'deprecated') return -10_000;

  if (
    (agent === 'orchestrator' ||
      agent === 'explorer' ||
      agent === 'librarian' ||
      agent === 'fixer') &&
    !model.toolcall
  ) {
    return -10_000;
  }

  const context = normalize(Math.min(model.contextLimit, 1_000_000), 1_000_000);
  const output = normalize(Math.min(model.outputLimit, 300_000), 300_000);
  const reasoning = model.reasoning ? 1 : 0;
  const toolcall = model.toolcall ? 1 : 0;
  const attachment = model.attachment ? 1 : 0;
  const status = statusMultiplier(model.status);

  if (agent === 'oracle') {
    return (
      status * 20 + context * 28 + reasoning * 26 + toolcall * 10 + output * 8
    );
  }

  if (agent === 'orchestrator') {
    return (
      status * 20 + reasoning * 22 + toolcall * 24 + context * 20 + output * 8
    );
  }

  if (agent === 'designer') {
    return (
      status * 20 +
      attachment * 24 +
      output * 20 +
      reasoning * 14 +
      toolcall * 10 +
      context * 8
    );
  }

  if (agent === 'explorer') {
    return (
      status * 20 + toolcall * 20 + output * 14 + context * 10 + reasoning * 8
    );
  }

  if (agent === 'librarian') {
    return (
      status * 20 + context * 30 + output * 20 + toolcall * 16 + reasoning * 8
    );
  }

  return (
    status * 20 + toolcall * 24 + reasoning * 18 + output * 16 + context * 12
  );
}

function modelLookupKeys(model: DiscoveredModel): string[] {
  const fullKey = model.model.toLowerCase();
  const idKey = model.model.split('/')[1]?.toLowerCase();
  const keys = new Set<string>();

  keys.add(fullKey);
  if (idKey) keys.add(idKey);

  if (model.providerID === 'chutes' && idKey) {
    keys.add(`chutes/${idKey}`);
    keys.add(idKey.replace(/-(free|flash)$/i, ''));
  }

  return [...keys];
}

function getExternalSignalBoost(
  agent: AgentName,
  model: DiscoveredModel,
  externalSignals: ExternalSignalMap | undefined,
): number {
  if (!externalSignals) return 0;

  const signal = modelLookupKeys(model)
    .map((key) => externalSignals[key])
    .find((item) => item !== undefined);

  if (!signal) return 0;

  const quality = clamp01((signal.qualityScore ?? 0) / 100);
  const coding = clamp01((signal.codingScore ?? 0) / 100);
  const latency = clamp01((signal.latencySeconds ?? 0) / 20);

  const blendedPrice =
    signal.inputPricePer1M !== undefined &&
    signal.outputPricePer1M !== undefined
      ? signal.inputPricePer1M * 0.75 + signal.outputPricePer1M * 0.25
      : (signal.inputPricePer1M ?? signal.outputPricePer1M ?? 0);
  const price = clamp01(blendedPrice / 30);

  if (agent === 'explorer') {
    return quality * 10 + coding * 8 - latency * 18 - price * 12;
  }

  if (agent === 'designer') {
    return quality * 10 + coding * 6 - latency * 8 - price * 8;
  }

  if (agent === 'librarian') {
    return quality * 12 + coding * 8 - latency * 6 - price * 8;
  }

  if (agent === 'fixer') {
    return quality * 10 + coding * 14 - latency * 8 - price * 8;
  }

  return quality * 14 + coding * 12 - latency * 8 - price * 10;
}

function combinedScore(
  agent: AgentName,
  model: DiscoveredModel,
  externalSignals?: ExternalSignalMap,
): number {
  return (
    capabilityScore(agent, model) +
    getExternalSignalBoost(agent, model, externalSignals)
  );
}

function rankModels(
  models: DiscoveredModel[],
  agent: AgentName,
  externalSignals?: ExternalSignalMap,
): DiscoveredModel[] {
  return [...models].sort((a, b) => {
    const delta =
      combinedScore(agent, b, externalSignals) -
      combinedScore(agent, a, externalSignals);
    if (delta !== 0) return delta;

    const providerTieBreak = a.providerID.localeCompare(b.providerID);
    if (providerTieBreak !== 0) return providerTieBreak;

    return a.model.localeCompare(b.model);
  });
}

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

function ensureSyntheticModel(
  models: DiscoveredModel[],
  fullModelID: string | undefined,
): DiscoveredModel[] {
  if (!fullModelID) return models;
  if (models.some((model) => model.model === fullModelID)) return models;

  const [providerID, modelID] = fullModelID.split('/');
  if (!providerID || !modelID) return models;

  return [
    ...models,
    {
      providerID,
      model: fullModelID,
      name: modelID,
      status: 'active',
      contextLimit: 200_000,
      outputLimit: 32_000,
      reasoning: true,
      toolcall: true,
      attachment: false,
    },
  ];
}

export function buildDynamicModelPlan(
  catalog: DiscoveredModel[],
  config: InstallConfig,
  externalSignals?: ExternalSignalMap,
): DynamicModelPlan | null {
  const catalogWithSelectedModels = [
    config.selectedChutesPrimaryModel,
    config.selectedChutesSecondaryModel,
    config.selectedOpenCodePrimaryModel,
    config.selectedOpenCodeSecondaryModel,
  ].reduce((acc, modelID) => ensureSyntheticModel(acc, modelID), catalog);

  const enabledProviders = new Set(getEnabledProviders(config));
  const providerCandidates = catalogWithSelectedModels.filter((model) =>
    enabledProviders.has(model.providerID),
  );

  if (providerCandidates.length === 0) {
    return null;
  }

  const agents: Record<string, { model: string; variant?: string }> = {};
  const chains: Record<string, string[]> = {};

  for (const agent of AGENTS) {
    const ranked = rankModels(providerCandidates, agent, externalSignals);
    const primary = ranked[0];
    if (!primary) continue;

    const selectedOpencode =
      agent === 'explorer' || agent === 'librarian' || agent === 'fixer'
        ? (config.selectedOpenCodeSecondaryModel ??
          config.selectedOpenCodePrimaryModel)
        : config.selectedOpenCodePrimaryModel;

    const selectedChutes =
      agent === 'explorer' || agent === 'librarian' || agent === 'fixer'
        ? (config.selectedChutesSecondaryModel ??
          config.selectedChutesPrimaryModel)
        : config.selectedChutesPrimaryModel;

    const chain = dedupe([
      primary.model,
      ...ranked.slice(0, 7).map((model) => model.model),
      selectedChutes,
      selectedOpencode,
      'opencode/big-pickle',
    ]).slice(0, 10);

    agents[agent] = {
      model: chain[0] ?? primary.model,
      variant: ROLE_VARIANT[agent],
    };
    chains[agent] = chain;
  }

  if (Object.keys(agents).length === 0) {
    return null;
  }

  return { agents, chains };
}
