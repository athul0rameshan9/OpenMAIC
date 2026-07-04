'use client';

/**
 * Single source of truth for "an agent's TTS voice".
 *
 * Every TTS path (lecture narration, multi-agent discussion, voice preview,
 * settings test) resolves voice options through `resolveAgentVoiceOptions`,
 * which reads the agent profile (`voiceConfig` + `voiceDesign`).
 */

import type { AgentConfig } from '@/lib/orchestration/registry/types';

export interface AgentVoiceResolveOptions {
  providerId: string;
  providerConfig?: {
    apiKey?: string;
    baseUrl?: string;
    customDefaultBaseUrl?: string;
    modelId?: string;
    providerOptions?: Record<string, unknown>;
  };
  voiceId: string;
  /** Course language / locale. */
  language?: string;
}

/**
 * Pick the agent whose voice narration should use (the teacher).
 */
export function pickNarratorAgent(agents: AgentConfig[]): AgentConfig | undefined {
  return (
    agents.find((a) => a.role === 'teacher' && a.voiceDesign) ??
    agents.find((a) => a.role === 'teacher')
  );
}

/**
 * Produce the `ttsProviderOptions` to send to /api/generate/tts for `agent`.
 * Returns undefined for providers with no special options.
 */
export async function resolveAgentVoiceOptions(
  _agent: AgentConfig | undefined,
  _opts: AgentVoiceResolveOptions,
): Promise<Record<string, unknown> | undefined> {
  return undefined;
}

/**
 * Eager warm-up: no-op now that VoxCPM is removed.
 */
export function warmUpAgentVoices(_agents: AgentConfig[]): void {
  // No-op: no providers require voice pre-registration
}
