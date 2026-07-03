import { defaultTheme } from './scene-content';

/** Mock response for POST /api/generate/scene-actions */
export function createMockSceneActionsResponse(stageId: string) {
  return {
    success: true,
    scene: {
      id: 'scene-0',
      stageId,
      type: 'slide',
      title: 'Basic Concepts of Photosynthesis',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide-0',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: defaultTheme,
          elements: [
            {
              type: 'text',
              id: 'title-el',
              content: 'Basic Concepts of Photosynthesis',
              left: 50,
              top: 50,
              width: 900,
              height: 100,
            },
          ],
        },
      },
      actions: [
        {
          id: 'action-0',
          type: 'speech',
          agent: 'teacher',
          text: 'Today we will learn the basic concepts of photosynthesis.',
        },
      ],
    },
    previousSpeeches: [],
  };
}
