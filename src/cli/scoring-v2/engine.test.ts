/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import type { DiscoveredModel, ExternalSignalMap } from '../types';
import { rankModelsV2, scoreCandidateV2 } from './engine';

function model(
  input: Partial<DiscoveredModel> & { model: string },
): DiscoveredModel {
  const [providerID] = input.model.split('/');
  return {
    providerID: providerID ?? 'openai',
    model: input.model,
    name: input.name ?? input.model,
    status: input.status ?? 'active',
    contextLimit: input.contextLimit ?? 200000,
    outputLimit: input.outputLimit ?? 32000,
    reasoning: input.reasoning ?? true,
    toolcall: input.toolcall ?? true,
    attachment: input.attachment ?? false,
    dailyRequestLimit: input.dailyRequestLimit,
    costInput: input.costInput,
    costOutput: input.costOutput,
  };
}

describe('scoring-v2', () => {
  test('returns explain breakdown with deterministic total', () => {
    const candidate = model({ model: 'openai/gpt-5.3-codex' });
    const signalMap: ExternalSignalMap = {
      'openai/gpt-5.3-codex': {
        source: 'artificial-analysis',
        qualityScore: 70,
        codingScore: 75,
        latencySeconds: 1.2,
        inputPricePer1M: 1,
        outputPricePer1M: 3,
      },
    };

    const first = scoreCandidateV2(candidate, 'oracle', signalMap);
    const second = scoreCandidateV2(candidate, 'oracle', signalMap);

    expect(first.totalScore).toBe(second.totalScore);
    expect(first.scoreBreakdown.features.quality).toBe(0.7);
    expect(first.scoreBreakdown.weighted.coding).toBeGreaterThan(0);
  });

  test('uses stable tie-break when scores are equal', () => {
    const ranked = rankModelsV2(
      [
        model({ model: 'zai-coding-plan/glm-4.7', reasoning: false }),
        model({ model: 'openai/gpt-5.3-codex', reasoning: false }),
      ],
      'explorer',
    );

    expect(ranked[0]?.model.providerID).toBe('openai');
    expect(ranked[1]?.model.providerID).toBe('zai-coding-plan');
  });
});
