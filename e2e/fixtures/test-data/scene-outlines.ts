import type { SceneOutline } from '../../../lib/types/generation';

/** Mock SceneOutline data matching lib/types/generation.ts:SceneOutline */
export const mockOutlines: SceneOutline[] = [
  {
    id: 'outline-0',
    type: 'slide' as const,
    title: 'Basic Concepts of Photosynthesis',
    description: 'Introduction to the definition and basic equation of photosynthesis',
    keyPoints: ['Definition of photosynthesis', 'Reaction equation', 'Energy conversion'],
    order: 0,
  },
  {
    id: 'outline-1',
    type: 'slide' as const,
    title: 'Light Reaction Phase',
    description: 'Light energy absorption and water splitting in light reactions',
    keyPoints: ['Light absorption', 'Water photolysis', 'ATP 与 NADPH 生成'],
    order: 1,
  },
  {
    id: 'outline-2',
    type: 'slide' as const,
    title: 'Dark Reaction Phase',
    description: 'Carbon fixation and sugar synthesis in dark reactions',
    keyPoints: ['CO₂ fixation', 'C₃ reduction', 'Sugar synthesis'],
    order: 2,
  },
];
