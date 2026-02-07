/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import type { PluginConfig } from '../config';
import {
  compileManualPlanToConfig,
  deriveManualPlanFromConfig,
} from './omos-preferences';

describe('omos-preferences helpers', () => {
  test('derives manual plan from agents and fallback chains', () => {
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'openai/gpt-5.3-codex' },
      },
      fallback: {
        enabled: true,
        timeoutMs: 15000,
        chains: {
          oracle: [
            'openai/gpt-5.3-codex',
            'anthropic/claude-opus-4-6',
            'chutes/kimi-k2.5',
            'opencode/gpt-5-nano',
          ],
        },
      },
    };

    const manualPlan = deriveManualPlanFromConfig(config);
    expect(manualPlan.oracle.primary).toBe('openai/gpt-5.3-codex');
    expect(manualPlan.oracle.fallback1).toBe('anthropic/claude-opus-4-6');
    expect(manualPlan.oracle.fallback2).toBe('chutes/kimi-k2.5');
    expect(manualPlan.oracle.fallback3).toBe('opencode/gpt-5-nano');
  });

  test('compiles manual plan into runtime agents and fallback chains', () => {
    const input: PluginConfig = {};
    const manualPlan = {
      orchestrator: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
      oracle: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
      designer: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
      explorer: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
      librarian: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
      fixer: {
        primary: 'openai/gpt-5.3-codex',
        fallback1: 'anthropic/claude-opus-4-6',
        fallback2: 'chutes/kimi-k2.5',
        fallback3: 'opencode/gpt-5-nano',
      },
    };

    const next = compileManualPlanToConfig(input, manualPlan);
    expect(next.preset).toBe('manual');
    expect(next.agents?.oracle?.model).toBe('openai/gpt-5.3-codex');
    expect(next.fallback?.chains.oracle).toEqual([
      'openai/gpt-5.3-codex',
      'anthropic/claude-opus-4-6',
      'chutes/kimi-k2.5',
      'opencode/gpt-5-nano',
      'opencode/big-pickle',
    ]);
  });
});
