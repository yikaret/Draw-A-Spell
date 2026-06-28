import { DeckStats } from './computeDeckStats';

export type Suggestion = { message: string };

export function suggestFromStats(stats: DeckStats): Suggestion[] {
  const tips: Suggestion[] = [];
  const { composition, costCurve, thresholds } = stats;

  // Curve balance
  const low = (costCurve.find(b => b.cost <= 2)?.count ?? 0);
  const mid = (costCurve.find(b => b.cost === 3 || b.cost === 4)?.count ?? 0);
  const high = (costCurve.find(b => b.cost >= 5)?.count ?? 0);
  if (high > low + mid) {
    tips.push({ message: 'You have many 4–5+ cost cards compared to 1–2 cost cards. Consider adding more early plays.' });
  }

  // Site sufficiency (very simple heuristic)
  const nonSites = composition.total - composition.sites;
  if (composition.sites > 0 && nonSites > composition.sites * 3) {
    tips.push({ message: 'You may be short on sites for this curve — aim for steadier mana development.' });
  }

  // Threshold vs sources
  for (const [elem, demand] of Object.entries(thresholds.demand)) {
    if (demand <= 0) continue;
    const sources = thresholds.siteSources[elem as keyof typeof thresholds.siteSources] ?? 0;
    if (sources * 2 < demand) {
      tips.push({ message: `Heavy ${elem} threshold demand but few ${elem} sources in sites.` });
    }
  }

  return tips;
}

