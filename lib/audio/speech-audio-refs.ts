import type { Scene } from '@/lib/types/stage';

/** Fill missing durable audio references without replacing lesson content or local edits. */
export function mergeSpeechAudioRefs(scenes: Scene[], sourceScenes: Scene[]): Scene[] {
  const sources = new Map(sourceScenes.map((scene) => [scene.id, scene]));
  let changed = false;
  const merged = scenes.map((scene) => {
    const source = sources.get(scene.id);
    if (!source?.actions || !scene.actions) return scene;
    const speeches = new Map(
      source.actions
        .filter((action) => action.type === 'speech')
        .map((action) => [action.id, action]),
    );
    let sceneChanged = false;
    const actions = scene.actions.map((action) => {
      if (action.type !== 'speech' || action.audioUrl) return action;
      const speech = speeches.get(action.id);
      // Exact text equality is essential: an edited line must never pick up the old narration.
      if (!speech?.audioUrl || speech.text !== action.text) return action;
      sceneChanged = changed = true;
      return { ...action, audioId: speech.audioId, audioUrl: speech.audioUrl };
    });
    return sceneChanged ? { ...scene, actions } : scene;
  });
  return changed ? merged : scenes;
}
