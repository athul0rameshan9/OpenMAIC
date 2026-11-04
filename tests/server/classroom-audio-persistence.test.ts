import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  predicates: [] as unknown[][],
}));
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.read }) }),
      update: (data: unknown) => {
        mocks.update(data);
        const query = {
          eq: (...args: unknown[]) => {
            mocks.predicates.push(args);
            return query;
          },
          is: (...args: unknown[]) => {
            mocks.predicates.push(args);
            return query;
          },
          select: () => mocks.update.getMockImplementation()?.('__result'),
        };
        return query;
      },
      insert: mocks.insert,
    }),
  },
}));

import { persistClassroom } from '@/lib/server/classroom-storage-supabase';
const speechScene = (audioUrl?: string, text = 'Hello') =>
  ({
    id: 'scene',
    actions: [
      { id: 'a', type: 'speech', text, ...(audioUrl ? { audioId: 'tts_a', audioUrl } : {}) },
    ],
  }) as Scene;
const stage = { id: 'class', name: 'Class', updatedAt: 10 } as Stage;
const saved = (scenes: Scene[], updatedAt = 11) => ({
  data: { id: 'class', stage: { ...stage, updatedAt }, scenes, created_at: '2026-01-01T00:00:00Z' },
  error: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.predicates.length = 0;
  mocks.update.mockImplementation((data) =>
    data === '__result' ? Promise.resolve({ data: [{ id: 'class' }], error: null }) : undefined,
  );
});

describe('saving a browser class after audio repair', () => {
  it('preserves durable refs omitted by the stale browser and the creation date', async () => {
    mocks.read.mockResolvedValue(saved([speechScene('https://repaired.wav')]));
    const result = await persistClassroom(
      { id: 'class', stage, scenes: [speechScene()] },
      'https://app',
    );
    expect(result.scenes[0].actions![0]).toMatchObject({ audioUrl: 'https://repaired.wav' });
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('created_at');
    expect(mocks.predicates).toContainEqual(['stage->>updatedAt', '11']);
    expect(result.stage.updatedAt).toBeGreaterThan(11);
  });

  it('rereads and merges refs after a concurrent write wins the compare-and-swap', async () => {
    mocks.read
      .mockResolvedValueOnce(saved([speechScene()], 11))
      .mockResolvedValueOnce(saved([speechScene('https://concurrent-repair.wav')], 12));
    let attempts = 0;
    mocks.update.mockImplementation((data) =>
      data === '__result'
        ? Promise.resolve({ data: ++attempts === 1 ? [] : [{ id: 'class' }], error: null })
        : undefined,
    );
    const result = await persistClassroom(
      { id: 'class', stage, scenes: [speechScene()] },
      'https://app',
    );
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(result.scenes[0].actions![0]).toMatchObject({
      audioUrl: 'https://concurrent-repair.wav',
    });
    expect(mocks.predicates).toContainEqual(['stage->>updatedAt', '12']);
  });

  it('keeps edits unvoiced instead of attaching narration for the old text', async () => {
    mocks.read.mockResolvedValue(saved([speechScene('https://old.wav')]));
    const result = await persistClassroom(
      { id: 'class', stage, scenes: [speechScene(undefined, 'Edited')] },
      'https://app',
    );
    expect(result.scenes[0].actions![0]).not.toHaveProperty('audioUrl');
  });

  it('bounds retries and reports a conflict instead of silently overwriting repairs', async () => {
    mocks.read.mockResolvedValue(saved([speechScene()]));
    mocks.update.mockImplementation((data) =>
      data === '__result' ? Promise.resolve({ data: [], error: null }) : undefined,
    );
    await expect(
      persistClassroom({ id: 'class', stage, scenes: [speechScene()] }, 'https://app'),
    ).rejects.toThrow('changed during save');
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });
});
