// src/ai/carddb/CardDB.ts
import { CardInfo } from '../types';
import { addDerivedTags } from './CardTags';

type JsonPool = CardInfo[] | Record<string, CardInfo | Record<string, unknown>>;

export class CardDB {
  private byId = new Map<string, CardInfo>();

  /**
   * Build a database from already loaded JSON (array of cards or id→card map).
   */
  static fromJSON(data: unknown): CardDB {
    const pool = data as JsonPool;
    const db = new CardDB();

    if (Array.isArray(pool)) {
      for (const c of pool) db.put(addDerivedTags(c));
    } else if (pool && typeof pool === 'object') {
      for (const [id, card] of Object.entries(pool)) {
        const normalized = addDerivedTags({ id, ...(card as Record<string, unknown>) } as CardInfo);
        db.put(normalized);
      }
    }

    return db;
  }

  /** Fetch JSON from a URL (browser or Node fetch) and build a CardDB. */
  static async fromURL(url: string): Promise<CardDB> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch card pool: ${response.status} ${response.statusText}`);
    const json = await response.json();
    return CardDB.fromJSON(json);
  }

  put(card: CardInfo) { this.byId.set(card.id, card); }
  get(id: string): CardInfo | undefined { return this.byId.get(id); }
}
