// src/ai/profiles/RampProfile.ts
import { Profile } from './index';

export const RampProfile: Profile = {
  id: 'ramp',
  description: 'Expand domain & threshold; deploy bigger spells later.',
  weights: {
    lifeLead: 0.4,
    myBoardPower: 0.4,
    myUnitCount: 0.2,
    theirUnitCount: -0.6,
    domainLead: 1.0,            // maximize sites (more mana + thresholds)
    siteDamageThisTurn: 0.3,
    killValue: 1.2,
    removalValue: 0.8,
    useAllManaBias: 0.25,
    thresholdProgress: 1.1,
    protectAvatar: 0.8,
  },
  drawPolicy: {
    earlyAtlasBiasTurns: 5,
    preferAtlasIf: { missingThreshold: true, fewSitesInPlay: true },
  },
  directives: {
    mustPlayOpeningSite: true,
  },
};
