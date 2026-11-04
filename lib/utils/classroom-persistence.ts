import type { Scene, Stage } from '@/lib/types/stage';

/** A successful HTTP response is required before a classroom is considered shared. */
export async function persistClassroomToServer(stage: Stage, scenes: Scene[]): Promise<void> {
  const response = await fetch('/api/classroom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, scenes }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(
      result?.details || result?.error || `Classroom save failed: HTTP ${response.status}`,
    );
  }
}
