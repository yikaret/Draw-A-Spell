// src/ai/profiles/index.ts
export interface ProfileDirectives {
  mustPlayOpeningSite?: boolean;
}

export interface Profile {
  id: string;
  description: string;
  weights: Record<string, number>;
  drawPolicy: {
    earlyAtlasBiasTurns: number;
    preferAtlasIf: Partial<{
      missingThreshold: boolean;
      fewSitesInPlay: boolean;
    }>;
  };
  directives?: ProfileDirectives;
}
export { AggroProfile } from './AggroProfile';
export { ControlProfile } from './ControlProfile';
export { RampProfile } from './RampProfile';
