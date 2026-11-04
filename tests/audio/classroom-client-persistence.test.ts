import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Stage } from '@/lib/types/stage';
import { persistClassroomToServer } from '@/lib/utils/classroom-persistence';

afterEach(() => vi.unstubAllGlobals());

describe('classroom save response handling', () => {
  it.each([
    { status: 500, body: { success: false, error: 'Failed to store classroom' } },
    { status: 200, body: { success: false, error: 'Failed to store classroom' } },
  ])('reports failed saves even when fetch resolves (HTTP $status)', async ({ status, body }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
    await expect(persistClassroomToServer({ id: 'class' } as Stage, [])).rejects.toThrow(
      'Failed to store classroom',
    );
  });
  it('accepts a confirmed successful server save', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, id: 'class' }), { status: 201 }),
        ),
    );
    await expect(persistClassroomToServer({ id: 'class' } as Stage, [])).resolves.toBeUndefined();
  });
});
