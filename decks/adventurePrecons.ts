type AdvRarity = 'Ordinary' | 'Exceptional' | 'Elite' | 'Unique';

export type AdventureCardSpec = {
  name: string;
  rarity: AdvRarity;
  count?: number;
};

export type AdventurePreconName =
  | 'Ranger'
  | 'Defender'
  | 'Rogue'
  | 'Arcanist'
  | 'Cleric'
  | 'Pyro';

export type AdventurePreconList = {
  known: AdventureCardSpec[];
  equipped: AdventureCardSpec[];
};

const ord = (name: string, count = 1): AdventureCardSpec => ({ name, rarity: 'Ordinary', count });
const exc = (name: string, count = 1): AdventureCardSpec => ({ name, rarity: 'Exceptional', count });
const elite = (name: string, count = 1): AdventureCardSpec => ({ name, rarity: 'Elite', count });
const unique = (name: string, count = 1): AdventureCardSpec => ({ name, rarity: 'Unique', count });

export const ADVENTURE_PRECONS: Record<AdventurePreconName, AdventurePreconList> = {
  Ranger: {
    known: [
      ord('Snow Leopard'),
      ord('Cloud Spirit'),
      ord('Blink'),
      ord('Lightning Bolt'),
      exc('Headless Haunt'),
      exc('Sling Pixies'),
      exc('Waypoint Portal'),
      elite('Master Tracker'),
      elite('Nimbus Jinn'),
      unique('Questing Beast'),
    ],
    equipped: [exc('Headless Haunt'), ord('Lightning Bolt'), ord('Blink')],
  },
  Defender: {
    known: [
      ord('Land Surveyor'),
      ord('Belmotte Longbowmen'),
      ord('Amazon Warriors'),
      ord('Bury'),
      exc('Pudge Butcher'),
      exc('Frontier Settlers'),
      exc('Siege Ballista'),
      elite('Stone-gaze Gorgons'),
      elite('Royal Bodyguard'),
      unique('King of the Realm'),
    ],
    equipped: [ord('Overpower'), ord('Belmotte Longbowmen'), ord('Bury')],
  },
  Rogue: {
    known: [
      ord('Midnight Rogue'),
      ord('Snow Leopard'),
      ord('Blink'),
      ord('Lightning Bolt'),
      exc('Headless Haunt'),
      exc('Sling Pixies'),
      exc('Lucky Charm'),
      elite('Recurring Specter'),
      elite('Nightmare'),
      unique('Grim Reaper'),
    ],
    equipped: [exc('Chain Lightning'), ord('Blink'), ord('Midnight Rogue')],
  },
  Arcanist: {
    known: [
      ord('Apprentice Wizard'),
      ord('Cloud Spirit'),
      ord('Blink'),
      ord('Lightning Bolt'),
      exc('Lucky Charm'),
      exc('Thunderstorm'),
      exc('Waypoint Portal'),
      elite('Grandmaster Wizard'),
      elite('Adept Illusionist'),
      unique('Merlin'),
    ],
    equipped: [ord('Lightning Bolt'), ord('Apprentice Wizard'), exc('Lucky Charm')],
  },
  Cleric: {
    known: [
      ord('Swan Maidens'),
      ord('Coral-reef Kelpie'),
      ord('Sacred Scarabs'),
      ord('Sedge Crabs'),
      exc('Wayfaring Pilgrim'),
      exc('Tide Naiads'),
      exc('Marine Voyage'),
      elite('Wrath of the Sea'),
      elite('Diluvian Kraken'),
      unique('Mother Nature'),
    ],
    equipped: [exc('Dodge Roll'), exc('Wayfaring Pilgrim'), ord('Swan Maidens')],
  },
  Pyro: {
    known: [
      ord('Firebolts'),
      ord('Heat Ray'),
      ord('Minor Explosion'),
      ord('Pit Vipers'),
      exc('Quarrelsome Kobolds'),
      exc('Blaze'),
      exc('Clamor of Harpies'),
      elite('Askelon Phoenix'),
      elite('Infernal Legion'),
      unique('Vesuvius'),
    ],
    equipped: [exc('Blaze'), ord('Firebolts'), ord('Minor Explosion')],
  },
};
