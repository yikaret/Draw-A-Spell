// src/ai/profiles/AggroProfile.ts
import { Profile } from './index';

export const AggroProfile: Profile = {
  id: 'aggro',
  description: 'Race life, push damage, prefer cheap minions & site pressure.',
  weights: {
    lifeLead: 0.8,
    myBoardPower: 1.2,
    myUnitCount: 0.7,
    theirUnitCount: -1.2,
    domainLead: 1.0,            // more sites than opponent
    siteDamageThisTurn: 3.0,    // attacking sites reduces avatar life (rulebook)
    killValue: 2.2,
    removalValue: 1.7,
    useAllManaBias: 1.1,
    thresholdProgress: 0.25,
    protectAvatar: 0.25,
  },
  drawPolicy: {
    earlyAtlasBiasTurns: 2,     // first N turns: prefer atlas draw if no site in play or hand
    preferAtlasIf: { missingThreshold: true, fewSitesInPlay: true },
  },
  directives: {
    mustPlayOpeningSite: true,
  },
};
