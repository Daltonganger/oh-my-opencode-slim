import type {
  DiscoveredModel,
  ExternalModelSignal,
  ExternalSignalMap,
} from '../types';
import type { FeatureVector, ScoringAgentName } from './types';

function modelLookupKeys(model: DiscoveredModel): string[] {
  const fullKey = model.model.toLowerCase();
  const idKey = model.model.split('/')[1]?.toLowerCase();
  const keys = new Set<string>([fullKey]);
  if (idKey) keys.add(idKey);
  return [...keys];
}

function findSignal(
  model: DiscoveredModel,
  externalSignals?: ExternalSignalMap,
): ExternalModelSignal | undefined {
  if (!externalSignals) return undefined;
  return modelLookupKeys(model)
    .map((key) => externalSignals[key])
    .find((item) => item !== undefined);
}

function statusValue(status: DiscoveredModel['status']): number {
  if (status === 'active') return 1;
  if (status === 'beta') return 0.4;
  if (status === 'alpha') return -0.25;
  return -1;
}

function capability(value: boolean): number {
  return value ? 1 : -1;
}

function blendedPrice(signal: ExternalModelSignal | undefined): number {
  if (!signal) return 0;
  if (
    signal.inputPricePer1M !== undefined &&
    signal.outputPricePer1M !== undefined
  ) {
    return signal.inputPricePer1M * 0.75 + signal.outputPricePer1M * 0.25;
  }
  return signal.inputPricePer1M ?? signal.outputPricePer1M ?? 0;
}

export function extractFeatureVector(
  model: DiscoveredModel,
  agent: ScoringAgentName,
  externalSignals?: ExternalSignalMap,
): FeatureVector {
  const signal = findSignal(model, externalSignals);
  const latency = signal?.latencySeconds ?? 0;
  const normalizedContext = Math.min(model.contextLimit, 1_000_000) / 100_000;
  const normalizedOutput = Math.min(model.outputLimit, 300_000) / 30_000;
  const quality = (signal?.qualityScore ?? 0) / 100;
  const coding = (signal?.codingScore ?? 0) / 100;
  const pricePenalty = Math.min(blendedPrice(signal), 50) / 10;

  const explorerLatencyMultiplier = agent === 'explorer' ? 1.4 : 1;

  return {
    status: statusValue(model.status),
    context: normalizedContext,
    output: normalizedOutput,
    reasoning: capability(model.reasoning),
    toolcall: capability(model.toolcall),
    attachment: capability(model.attachment),
    quality,
    coding,
    latencyPenalty: Math.min(latency, 20) * explorerLatencyMultiplier,
    pricePenalty,
  };
}
