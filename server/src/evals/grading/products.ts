import { normalizeKeepCase } from "./text.ts";

/**
 * Recognizing catalog products in free text.
 *
 * Replies rarely use full names ("Ridge 2 Backpacking Tent"); they say "the
 * Ridge 2" or "the Squall". So each product has hand-written aliases. They're
 * written by hand because the obvious automatic rule (drop the category words)
 * breaks on real pairs: "Loft Down Jacket" and "Loft Synthetic Jacket" would
 * both become "Loft", and "Squall" would swallow "Squall Pro". A test checks
 * that every product has aliases and that no alias belongs to two products.
 *
 * Matching rules:
 *  - The full name is always an alias.
 *  - Multi-word aliases (and any with a digit) match case-insensitively.
 *  - Single-word aliases ("Squall", "Nightjar") must be capitalized, so the
 *    words "pocket", "spirit" or "kindling" in a sentence don't count.
 *  - The longest match wins and matches can't overlap: "Squall Pro" is the
 *    Pro, not the Pro plus the plain Squall.
 */
export const PRODUCT_ALIASES: Record<string, string[]> = {
  // Tents
  "tent-ridge-2": ["Ridge 2"],
  "tent-summit-3": ["Summit 3"],
  "tent-willow-1": ["Willow 1", "Willow"],
  "tent-fernlight-2": ["Fernlight 2", "Fernlight"],
  "tent-basecamp-4": ["Basecamp 4", "Basecamp"],
  "tent-meadow-6": ["Meadow 6"],
  "tent-tundra-2": ["Tundra 2"],
  "tent-creek-2": ["Creek 2"],
  "tent-canopy-2": ["Canopy 2"],
  "tent-hollow-bivy": ["Hollow Bivy", "Hollow"],
  // Sleeping bags
  "bag-ember-0": ["Ember 0°C", "Ember 0"],
  "bag-ember-minus10": ["Ember -10°C", "Ember -10", "Ember minus 10"],
  "bag-drift-5": ["Drift 5°C", "Drift 5"],
  "bag-drift-minus5": ["Drift -5°C", "Drift -5", "Drift minus 5"],
  "bag-glacier-minus20": ["Glacier -20°C", "Glacier -20", "Glacier"],
  "bag-balmy-12": ["Balmy 12°C", "Balmy 12", "Balmy"],
  "bag-nightjar-quilt": ["Nightjar 2°C", "Nightjar quilt", "Nightjar"],
  "bag-sprout-kids": ["Sprout 5°C", "Sprout"],
  "bag-harbor-double": ["Harbor 3°C", "Harbor Double", "Harbor"],
  // Backpacks
  "pack-traverse-65": ["Traverse 65"],
  "pack-traverse-50": ["Traverse 50"],
  "pack-swift-30": ["Swift 30"],
  "pack-swift-20": ["Swift 20"],
  "pack-alpine-40": ["Alpine 40"],
  "pack-featherline-45": ["Featherline 45", "Featherline"],
  "pack-voyager-80": ["Voyager 80", "Voyager"],
  "pack-cub-15": ["Cub 15", "Cub Kids Pack"],
  "pack-rill-12": ["Rill 12", "Rill"],
  // Stoves
  "stove-pocket": ["Pocket Canister", "Pocket stove", "Pocket"],
  "stove-pocket-pro": ["Pocket Pro"],
  "stove-quickboil": ["Quickboil"],
  "stove-nomad-multifuel": ["Nomad Multi-Fuel", "Nomad"],
  "stove-campside-twin": ["Campside Twin-Burner", "Campside"],
  "stove-kindling-wood": ["Kindling Wood-Burning", "Kindling stove", "Kindling"],
  "stove-spirit-alcohol": ["Spirit Alcohol", "Spirit stove", "Spirit"],
  "stove-fuel-230": ["Isobutane Fuel Canister", "fuel canister"],
  // Headlamps
  "lamp-glowworm-300": ["Glowworm 300"],
  "lamp-glowworm-150": ["Glowworm 150"],
  "lamp-beacon-500": ["Beacon 500"],
  "lamp-beacon-900": ["Beacon 900"],
  "lamp-stride-400": ["Stride 400", "Stride"],
  "lamp-firefly-kids": ["Firefly Kids", "Firefly"],
  "lamp-nightowl-200": ["Nightowl 200", "Nightowl"],
  "lamp-hearth-350": ["Hearth 350", "Hearth"],
  // Jackets
  "jacket-squall": ["Squall Rain", "Squall"],
  "jacket-squall-pro": ["Squall Pro"],
  "jacket-loft-down": ["Loft Down"],
  "jacket-loft-synthetic": ["Loft Synthetic"],
  "jacket-thicket-fleece": ["Thicket Fleece", "Thicket"],
  "jacket-gale-softshell": ["Gale Softshell", "Gale"],
  "jacket-tundra-parka": ["Tundra Insulated Parka", "Tundra parka"],
  "jacket-breeze-wind": ["Breeze Wind", "Breeze"],
  // Boots
  "boot-ridgeline-mid": ["Ridgeline Mid"],
  "boot-ridgeline-low": ["Ridgeline Low"],
  "boot-crag-mountaineering": ["Crag Mountaineering", "Crag"],
  "boot-scree-runner": ["Scree Trail Runner", "Scree"],
  "boot-frostline-winter": ["Frostline Winter", "Frostline"],
  "boot-riverwalk-sandal": ["Riverwalk"],
  "boot-ledge-approach": ["Ledge Approach", "Ledge"],
  "boot-cub-kids": ["Cub Kids Hiking Boot", "Cub Kids boot", "Cub hiking boot", "Cub boot"],
};

export type ProductMention = { productId: string; start: number; end: number; text: string };

type Alias = { productId: string; alias: string; caseSensitive: boolean };

export type ProductMatcher = {
  /** Catalog products named in the text, in order of appearance (one entry per mention). */
  find(text: string): ProductMention[];
  /** Distinct product ids named in the text. */
  ids(text: string): string[];
  /** Model families that take a number ("Ridge", "Traverse", ...), for spotting invented variants like "Ridge 3". */
  numberedFamilies: Set<string>;
};

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

export function createProductMatcher(products: { id: string; name: string }[]): ProductMatcher {
  const aliases: Alias[] = [];
  for (const p of products) {
    for (const a of new Set([p.name, ...(PRODUCT_ALIASES[p.id] ?? [])])) {
      const alias = normalizeKeepCase(a);
      aliases.push({ productId: p.id, alias, caseSensitive: !/\s/.test(alias) && !/\d/.test(alias) });
    }
  }
  // Longest first, so "Squall Pro" is tried before "Squall".
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  const numberedFamilies = new Set<string>();
  for (const { alias } of aliases) {
    const m = /^(\p{Lu}[\p{L}]+) -?\d/u.exec(alias);
    if (m) numberedFamilies.add(m[1]!);
  }

  function find(text: string): ProductMention[] {
    const norm = normalizeKeepCase(text);
    const lower = norm.toLowerCase();
    const taken: ProductMention[] = [];
    for (const a of aliases) {
      const hay = a.caseSensitive ? norm : lower;
      const needle = a.caseSensitive ? a.alias : a.alias.toLowerCase();
      for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
        const end = i + needle.length;
        // Whole words only: "Swift 30" must not match inside "Swift 300".
        if (isWordChar(hay[i - 1]) || isWordChar(hay[end])) continue;
        // A trailing "°C" belongs to the temperature, so "Ember 0" must not match "Ember 0.5".
        if (hay[end] === "." && /\d/.test(hay[end + 1] ?? "")) continue;
        if (taken.some((t) => i < t.end && end > t.start)) continue;
        taken.push({ productId: a.productId, start: i, end, text: norm.slice(i, end) });
      }
    }
    return taken.sort((x, y) => x.start - y.start);
  }

  return {
    find,
    ids: (text) => [...new Set(find(text).map((m) => m.productId))],
    numberedFamilies,
  };
}
