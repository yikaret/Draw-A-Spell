// src/ai/profiles/ControlProfile.ts
import { Profile } from './index';

export const ControlProfile: Profile = {
  id: 'control',
  description: 'Board parity, high removal value, card advantage & safe trades.',
  weights: {
    lifeLead: 0.6,
    myBoardPower: 0.5,
    myUnitCount: 0.4,
    theirUnitCount: -1.2,
    domainLead: 0.5,
    siteDamageThisTurn: 0.4,
    killValue: 1.8,
    removalValue: 1.6,
    useAllManaBias: 0.2,
    thresholdProgress: 0.5,
    protectAvatar: 1.0,
  },
  drawPolicy: {
    earlyAtlasBiasTurns: 2,
    preferAtlasIf: { missingThreshold: true },
  },
  directives: {
    mustPlayOpeningSite: true,
  },
};
