import type { Category, ProductSpecs } from "../db/schema.ts";

/**
 * The Larchgrove Supply Co. catalog: 60 house-brand products. Written by hand
 * (not generated) so specs are coherent and stable: eval conversations quote
 * these names, prices and specs, and the grounding checker compares against them.
 *
 * `variants` lists sizes/colors; stock per variant is seeded in seed/index.ts,
 * with a few fixed values in STOCK_OVERRIDES for eval anchors.
 */
export type CatalogEntry = {
  id: string;
  name: string;
  category: Category;
  priceCents: number;
  rating: number;
  description: string;
  specs: ProductSpecs;
  variants: { sizes?: string[]; colors?: string[] };
};

const JACKET_SIZES = ["XS", "S", "M", "L", "XL"];
const BOOT_SIZES = ["7", "8", "9", "10", "11", "12"];
const PACK_SIZES = ["S/M", "M/L"];
const BAG_SIZES = ["regular", "long"];

export const CATALOG: CatalogEntry[] = [
  // ---------- Tents (10) ----------
  {
    id: "tent-ridge-2", name: "Ridge 2 Backpacking Tent", category: "tents", priceCents: 24900, rating: 4.6,
    description: "Freestanding two-person backpacking tent with two doors and two vestibules.",
    specs: { capacityPersons: 2, weightGrams: 1900, seasons: 3, waterproof: true, waterproofRatingMm: 3000, material: "20D ripstop nylon" },
    variants: { colors: ["green", "orange"] },
  },
  {
    id: "tent-summit-3", name: "Summit 3 Trekking Tent", category: "tents", priceCents: 32900, rating: 4.5,
    description: "Roomy three-person trekking tent with a steep-walled design for long trips.",
    specs: { capacityPersons: 3, weightGrams: 2600, seasons: 3, waterproof: true, waterproofRatingMm: 3000, material: "30D ripstop nylon" },
    variants: { colors: ["green", "grey"] },
  },
  {
    id: "tent-willow-1", name: "Willow 1 Solo Tent", category: "tents", priceCents: 17900, rating: 4.3,
    description: "Compact one-person tent that packs down to the size of a water bottle.",
    specs: { capacityPersons: 1, weightGrams: 1100, seasons: 3, waterproof: true, waterproofRatingMm: 2000, material: "15D ripstop nylon" },
    variants: { colors: ["green"] },
  },
  {
    id: "tent-fernlight-2", name: "Fernlight 2 Ultralight Tent", category: "tents", priceCents: 38900, rating: 4.4,
    description: "Trekking-pole-supported ultralight shelter for two.",
    specs: { capacityPersons: 2, weightGrams: 1200, seasons: 3, waterproof: true, waterproofRatingMm: 1500, material: "silnylon" },
    variants: { colors: ["grey"] },
  },
  {
    id: "tent-basecamp-4", name: "Basecamp 4 Family Tent", category: "tents", priceCents: 27900, rating: 4.2,
    description: "Four-person dome tent for car camping, with a large front porch.",
    specs: { capacityPersons: 4, weightGrams: 5800, seasons: 3, waterproof: true, waterproofRatingMm: 2000, material: "polyester" },
    variants: { colors: ["blue", "green"] },
  },
  {
    id: "tent-meadow-6", name: "Meadow 6 Cabin Tent", category: "tents", priceCents: 39900, rating: 4.1,
    description: "Six-person cabin tent with near-vertical walls and a room divider.",
    specs: { capacityPersons: 6, weightGrams: 9400, seasons: 3, waterproof: true, waterproofRatingMm: 1800, material: "polyester" },
    variants: { colors: ["tan"] },
  },
  {
    id: "tent-tundra-2", name: "Tundra 2 Four-Season Tent", category: "tents", priceCents: 54900, rating: 4.8,
    description: "Two-person mountaineering tent built for snow load and high winds.",
    specs: { capacityPersons: 2, weightGrams: 3300, seasons: 4, waterproof: true, waterproofRatingMm: 5000, material: "40D ripstop nylon" },
    variants: { colors: ["yellow"] },
  },
  {
    id: "tent-creek-2", name: "Creek 2 Budget Tent", category: "tents", priceCents: 12900, rating: 3.9,
    description: "Affordable two-person tent for fair-weather weekends.",
    specs: { capacityPersons: 2, weightGrams: 2400, seasons: 3, waterproof: true, waterproofRatingMm: 1200, material: "polyester" },
    variants: { colors: ["green", "blue"] },
  },
  {
    id: "tent-canopy-2", name: "Canopy 2 Trail Tent", category: "tents", priceCents: 18900, rating: 4.5,
    description: "Lightweight two-person trail tent with a full-coverage fly.",
    specs: { capacityPersons: 2, weightGrams: 2000, seasons: 3, waterproof: true, waterproofRatingMm: 2500, material: "20D ripstop polyester" },
    variants: { colors: ["green", "orange"] },
  },
  {
    id: "tent-hollow-bivy", name: "Hollow Bivy Shelter", category: "tents", priceCents: 15900, rating: 4.0,
    description: "Minimal one-person bivy sack with a hooped head end.",
    specs: { capacityPersons: 1, weightGrams: 600, seasons: 3, waterproof: true, waterproofRatingMm: 10000, material: "3-layer laminate" },
    variants: { colors: ["olive"] },
  },

  // ---------- Sleeping bags (9) ----------
  {
    id: "bag-ember-0", name: "Ember 0°C Down Sleeping Bag", category: "sleeping_bags", priceCents: 25900, rating: 4.7,
    description: "Three-season mummy bag with 650-fill responsibly sourced down.",
    specs: { tempRatingC: 0, weightGrams: 850, material: "650-fill down" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-ember-minus10", name: "Ember -10°C Down Sleeping Bag", category: "sleeping_bags", priceCents: 34900, rating: 4.7,
    description: "Warmer version of the Ember for shoulder-season and early winter trips.",
    specs: { tempRatingC: -10, weightGrams: 1150, material: "650-fill down" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-drift-5", name: "Drift 5°C Synthetic Sleeping Bag", category: "sleeping_bags", priceCents: 9900, rating: 4.2,
    description: "Budget-friendly synthetic mummy bag that stays warm when damp.",
    specs: { tempRatingC: 5, weightGrams: 1300, material: "synthetic fill" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-drift-minus5", name: "Drift -5°C Synthetic Sleeping Bag", category: "sleeping_bags", priceCents: 13900, rating: 4.3,
    description: "Synthetic mummy bag for cold nights on a budget.",
    specs: { tempRatingC: -5, weightGrams: 1700, material: "synthetic fill" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-glacier-minus20", name: "Glacier -20°C Expedition Sleeping Bag", category: "sleeping_bags", priceCents: 49900, rating: 4.9,
    description: "Expedition-grade bag with 800-fill down and a draft collar.",
    specs: { tempRatingC: -20, weightGrams: 1900, material: "800-fill down" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-balmy-12", name: "Balmy 12°C Summer Sleeping Bag", category: "sleeping_bags", priceCents: 5900, rating: 4.0,
    description: "Light rectangular bag for warm summer nights; unzips into a blanket.",
    specs: { tempRatingC: 12, weightGrams: 700, material: "synthetic fill" },
    variants: { sizes: ["regular"] },
  },
  {
    id: "bag-nightjar-quilt", name: "Nightjar 2°C Down Quilt", category: "sleeping_bags", priceCents: 22900, rating: 4.6,
    description: "Hoodless down quilt with pad straps, popular with ultralight hikers.",
    specs: { tempRatingC: 2, weightGrams: 650, material: "800-fill down" },
    variants: { sizes: BAG_SIZES },
  },
  {
    id: "bag-sprout-kids", name: "Sprout 5°C Kids Sleeping Bag", category: "sleeping_bags", priceCents: 4900, rating: 4.4,
    description: "Kid-sized synthetic bag for children up to 150 cm tall.",
    specs: { tempRatingC: 5, weightGrams: 900, material: "synthetic fill" },
    variants: { colors: ["blue", "red"] },
  },
  {
    id: "bag-harbor-double", name: "Harbor 3°C Double Sleeping Bag", category: "sleeping_bags", priceCents: 17999, rating: 4.3,
    description: "Two-person rectangular bag for car camping couples.",
    specs: { capacityPersons: 2, tempRatingC: 3, weightGrams: 2800, material: "synthetic fill" },
    variants: { colors: ["navy"] },
  },

  // ---------- Backpacks (9) ----------
  {
    id: "pack-traverse-65", name: "Traverse 65 Trekking Pack", category: "backpacks", priceCents: 25900, rating: 4.6,
    description: "Adjustable-torso pack for multi-day trips with a ventilated back panel.",
    specs: { volumeLiters: 65, weightGrams: 2100, waterproof: false, material: "210D nylon" },
    variants: { sizes: PACK_SIZES, colors: ["green", "black"] },
  },
  {
    id: "pack-traverse-50", name: "Traverse 50 Trekking Pack", category: "backpacks", priceCents: 21900, rating: 4.5,
    description: "Smaller Traverse for weekend trips and lighter loads.",
    specs: { volumeLiters: 50, weightGrams: 1800, waterproof: false, material: "210D nylon" },
    variants: { sizes: PACK_SIZES, colors: ["green", "black"] },
  },
  {
    id: "pack-swift-30", name: "Swift 30 Daypack", category: "backpacks", priceCents: 11900, rating: 4.4,
    description: "Day-hike pack with hip belt pockets and a rain cover.",
    specs: { volumeLiters: 30, weightGrams: 900, waterproof: false, material: "100D nylon" },
    variants: { colors: ["blue", "black"] },
  },
  {
    id: "pack-swift-20", name: "Swift 20 Daypack", category: "backpacks", priceCents: 8900, rating: 4.3,
    description: "Light everyday daypack with a hydration sleeve.",
    specs: { volumeLiters: 20, weightGrams: 700, waterproof: false, material: "100D nylon" },
    variants: { colors: ["blue", "black", "red"] },
  },
  {
    id: "pack-alpine-40", name: "Alpine 40 Climbing Pack", category: "backpacks", priceCents: 17900, rating: 4.5,
    description: "Streamlined climbing pack with ice-axe loops and a removable lid.",
    specs: { volumeLiters: 40, weightGrams: 1200, waterproof: false, material: "420D nylon" },
    variants: { sizes: PACK_SIZES, colors: ["orange"] },
  },
  {
    id: "pack-featherline-45", name: "Featherline 45 Ultralight Pack", category: "backpacks", priceCents: 23900, rating: 4.4,
    description: "Frameless ultralight pack made from waterproof laminate fabric.",
    specs: { volumeLiters: 45, weightGrams: 800, waterproof: true, material: "waterproof laminate" },
    variants: { sizes: PACK_SIZES, colors: ["white"] },
  },
  {
    id: "pack-voyager-80", name: "Voyager 80 Expedition Pack", category: "backpacks", priceCents: 32900, rating: 4.6,
    description: "Load-hauling expedition pack for heavy, long trips.",
    specs: { volumeLiters: 80, weightGrams: 2600, waterproof: false, material: "420D nylon" },
    variants: { sizes: PACK_SIZES, colors: ["grey"] },
  },
  {
    id: "pack-cub-15", name: "Cub 15 Kids Pack", category: "backpacks", priceCents: 4500, rating: 4.2,
    description: "Small daypack sized for kids, with a chest strap and whistle.",
    specs: { volumeLiters: 15, weightGrams: 400, waterproof: false, material: "polyester" },
    variants: { colors: ["red", "blue"] },
  },
  {
    id: "pack-rill-12", name: "Rill 12 Hydration Pack", category: "backpacks", priceCents: 6900, rating: 4.1,
    description: "Running and biking pack with a 2-liter reservoir included.",
    specs: { volumeLiters: 12, weightGrams: 500, waterproof: false, material: "nylon mesh" },
    variants: { colors: ["black", "green"] },
  },

  // ---------- Stoves (8) ----------
  {
    id: "stove-pocket", name: "Pocket Canister Stove", category: "stoves", priceCents: 3900, rating: 4.4,
    description: "Tiny screw-on stove for isobutane canisters.",
    specs: { fuel: "isobutane canister", weightGrams: 85 },
    variants: {},
  },
  {
    id: "stove-pocket-pro", name: "Pocket Pro Canister Stove", category: "stoves", priceCents: 5500, rating: 4.6,
    description: "Pocket stove with a push-button igniter and wind shield.",
    specs: { fuel: "isobutane canister", weightGrams: 95 },
    variants: {},
  },
  {
    id: "stove-quickboil", name: "Quickboil Cook System", category: "stoves", priceCents: 12900, rating: 4.7,
    description: "Integrated stove and 1-liter pot that boils water in about 3 minutes.",
    specs: { fuel: "isobutane canister", weightGrams: 450, volumeLiters: 1 },
    variants: {},
  },
  {
    id: "stove-nomad-multifuel", name: "Nomad Multi-Fuel Stove", category: "stoves", priceCents: 16900, rating: 4.5,
    description: "Burns white gas, kerosene or canister fuel, for travel and cold weather.",
    specs: { fuel: "multi-fuel (white gas, kerosene, canister)", weightGrams: 330 },
    variants: {},
  },
  {
    id: "stove-campside-twin", name: "Campside Twin-Burner Stove", category: "stoves", priceCents: 11900, rating: 4.3,
    description: "Two-burner propane stove for car camping kitchens.",
    specs: { fuel: "propane", weightGrams: 4500 },
    variants: {},
  },
  {
    id: "stove-kindling-wood", name: "Kindling Wood-Burning Stove", category: "stoves", priceCents: 7900, rating: 4.0,
    description: "Folding stainless steel stove that burns twigs and pine cones.",
    specs: { fuel: "wood", weightGrams: 400 },
    variants: {},
  },
  {
    id: "stove-spirit-alcohol", name: "Spirit Alcohol Stove", category: "stoves", priceCents: 1999, rating: 3.9,
    description: "Ultralight brass alcohol burner with a simmer ring.",
    specs: { fuel: "denatured alcohol", weightGrams: 30 },
    variants: {},
  },
  {
    id: "stove-fuel-230", name: "Isobutane Fuel Canister 230 g", category: "stoves", priceCents: 699, rating: 4.5,
    description: "230 g isobutane-propane canister; fits all threaded canister stoves.",
    specs: { fuel: "isobutane-propane", weightGrams: 360, burnTimeMinutes: 90 },
    variants: {},
  },

  // ---------- Headlamps (8) ----------
  {
    id: "lamp-glowworm-300", name: "Glowworm 300 Headlamp", category: "headlamps", priceCents: 2900, rating: 4.4,
    description: "All-round AAA headlamp with a red night mode.",
    specs: { lumens: 300, burnTimeMinutes: 1800, weightGrams: 78, waterproof: true },
    variants: { colors: ["black", "orange"] },
  },
  {
    id: "lamp-glowworm-150", name: "Glowworm 150 Headlamp", category: "headlamps", priceCents: 1999, rating: 4.1,
    description: "Simple AAA headlamp for camp chores.",
    specs: { lumens: 150, burnTimeMinutes: 2400, weightGrams: 70, waterproof: false },
    variants: { colors: ["black", "blue"] },
  },
  {
    id: "lamp-beacon-500", name: "Beacon 500 Rechargeable Headlamp", category: "headlamps", priceCents: 4900, rating: 4.6,
    description: "USB-C rechargeable headlamp with a lock mode.",
    specs: { lumens: 500, burnTimeMinutes: 1200, weightGrams: 86, waterproof: true },
    variants: { colors: ["black"] },
  },
  {
    id: "lamp-beacon-900", name: "Beacon 900 Rechargeable Headlamp", category: "headlamps", priceCents: 7900, rating: 4.7,
    description: "High-output rechargeable headlamp with a rear battery pack.",
    specs: { lumens: 900, burnTimeMinutes: 900, weightGrams: 140, waterproof: true },
    variants: { colors: ["black"] },
  },
  {
    id: "lamp-stride-400", name: "Stride 400 Running Headlamp", category: "headlamps", priceCents: 5900, rating: 4.5,
    description: "Bounce-free headlamp for trail running.",
    specs: { lumens: 400, burnTimeMinutes: 600, weightGrams: 60, waterproof: true },
    variants: { colors: ["yellow", "black"] },
  },
  {
    id: "lamp-firefly-kids", name: "Firefly Kids Headlamp", category: "headlamps", priceCents: 1499, rating: 4.3,
    description: "Low-power kids' headlamp with a soft strap.",
    specs: { lumens: 100, burnTimeMinutes: 1500, weightGrams: 50, waterproof: false },
    variants: { colors: ["green", "pink"] },
  },
  {
    id: "lamp-nightowl-200", name: "Nightowl 200 Red-Light Headlamp", category: "headlamps", priceCents: 3400, rating: 4.2,
    description: "Headlamp with a strong red mode for stargazing.",
    specs: { lumens: 200, burnTimeMinutes: 2000, weightGrams: 74, waterproof: true },
    variants: { colors: ["black"] },
  },
  {
    id: "lamp-hearth-350", name: "Hearth 350 Lantern Headlamp", category: "headlamps", priceCents: 4400, rating: 4.3,
    description: "Headlamp that converts into a tent lantern with a diffuser.",
    specs: { lumens: 350, burnTimeMinutes: 1400, weightGrams: 95, waterproof: true },
    variants: { colors: ["grey"] },
  },

  // ---------- Jackets (8) ----------
  {
    id: "jacket-squall", name: "Squall Rain Jacket", category: "jackets", priceCents: 14900, rating: 4.5,
    description: "Packable 2.5-layer rain jacket with pit zips.",
    specs: { waterproof: true, waterproofRatingMm: 10000, weightGrams: 380, material: "2.5-layer nylon" },
    variants: { sizes: JACKET_SIZES, colors: ["green", "navy"] },
  },
  {
    id: "jacket-squall-pro", name: "Squall Pro Rain Jacket", category: "jackets", priceCents: 22900, rating: 4.7,
    description: "3-layer storm shell for mountain weather.",
    specs: { waterproof: true, waterproofRatingMm: 20000, weightGrams: 420, material: "3-layer nylon" },
    variants: { sizes: JACKET_SIZES, colors: ["red", "black"] },
  },
  {
    id: "jacket-loft-down", name: "Loft Down Jacket", category: "jackets", priceCents: 19900, rating: 4.6,
    description: "Warm, packable down jacket for cold camps.",
    specs: { waterproof: false, weightGrams: 350, material: "800-fill down" },
    variants: { sizes: JACKET_SIZES, colors: ["black", "blue"] },
  },
  {
    id: "jacket-loft-synthetic", name: "Loft Synthetic Jacket", category: "jackets", priceCents: 14900, rating: 4.4,
    description: "Synthetic insulated jacket that keeps insulating when wet.",
    specs: { waterproof: false, weightGrams: 400, material: "synthetic insulation" },
    variants: { sizes: JACKET_SIZES, colors: ["green", "black"] },
  },
  {
    id: "jacket-thicket-fleece", name: "Thicket Fleece Jacket", category: "jackets", priceCents: 6900, rating: 4.3,
    description: "Mid-weight grid fleece for layering.",
    specs: { waterproof: false, weightGrams: 320, material: "polyester fleece" },
    variants: { sizes: JACKET_SIZES, colors: ["grey", "green"] },
  },
  {
    id: "jacket-gale-softshell", name: "Gale Softshell Jacket", category: "jackets", priceCents: 12900, rating: 4.2,
    description: "Stretchy, wind-resistant softshell for active days.",
    specs: { waterproof: false, waterproofRatingMm: 5000, weightGrams: 480, material: "softshell" },
    variants: { sizes: JACKET_SIZES, colors: ["black"] },
  },
  {
    id: "jacket-tundra-parka", name: "Tundra Insulated Parka", category: "jackets", priceCents: 32900, rating: 4.8,
    description: "Waterproof insulated parka for deep winter.",
    specs: { waterproof: true, waterproofRatingMm: 15000, weightGrams: 1100, tempRatingC: -25, material: "down + waterproof shell" },
    variants: { sizes: JACKET_SIZES, colors: ["black", "red"] },
  },
  {
    id: "jacket-breeze-wind", name: "Breeze Wind Shell", category: "jackets", priceCents: 8900, rating: 4.1,
    description: "Featherweight wind shell that packs into its own pocket.",
    specs: { waterproof: false, waterproofRatingMm: 1500, weightGrams: 90, material: "10D nylon" },
    variants: { sizes: JACKET_SIZES, colors: ["yellow", "blue"] },
  },

  // ---------- Boots (8) ----------
  {
    id: "boot-ridgeline-mid", name: "Ridgeline Mid Hiking Boot", category: "boots", priceCents: 17900, rating: 4.5,
    description: "Waterproof mid-cut hiking boot with a membrane liner.",
    specs: { waterproof: true, weightGrams: 1200, material: "suede and mesh" },
    variants: { sizes: BOOT_SIZES, colors: ["brown"] },
  },
  {
    id: "boot-ridgeline-low", name: "Ridgeline Low Hiking Shoe", category: "boots", priceCents: 13900, rating: 4.4,
    description: "Low-cut waterproof hiking shoe for day hikes.",
    specs: { waterproof: true, weightGrams: 900, material: "suede and mesh" },
    variants: { sizes: BOOT_SIZES, colors: ["brown", "grey"] },
  },
  {
    id: "boot-crag-mountaineering", name: "Crag Mountaineering Boot", category: "boots", priceCents: 32900, rating: 4.7,
    description: "Stiff, crampon-compatible leather boot for alpine routes.",
    specs: { waterproof: true, weightGrams: 1900, material: "full-grain leather" },
    variants: { sizes: BOOT_SIZES, colors: ["black"] },
  },
  {
    id: "boot-scree-runner", name: "Scree Trail Runner", category: "boots", priceCents: 11900, rating: 4.3,
    description: "Breathable, quick-drying trail running shoe.",
    specs: { waterproof: false, weightGrams: 600, material: "mesh" },
    variants: { sizes: BOOT_SIZES, colors: ["blue", "orange"] },
  },
  {
    id: "boot-frostline-winter", name: "Frostline Winter Boot", category: "boots", priceCents: 19900, rating: 4.6,
    description: "Insulated snow boot rated to -30°C.",
    specs: { waterproof: true, weightGrams: 1600, tempRatingC: -30, material: "leather and rubber" },
    variants: { sizes: BOOT_SIZES, colors: ["black"] },
  },
  {
    id: "boot-riverwalk-sandal", name: "Riverwalk Camp Sandal", category: "boots", priceCents: 5900, rating: 4.0,
    description: "Grippy sandal for river crossings and camp.",
    specs: { waterproof: true, weightGrams: 500, material: "webbing and rubber" },
    variants: { sizes: BOOT_SIZES, colors: ["black"] },
  },
  {
    id: "boot-ledge-approach", name: "Ledge Approach Shoe", category: "boots", priceCents: 14900, rating: 4.4,
    description: "Sticky-rubber approach shoe for scrambling.",
    specs: { waterproof: false, weightGrams: 800, material: "suede" },
    variants: { sizes: BOOT_SIZES, colors: ["grey"] },
  },
  {
    id: "boot-cub-kids", name: "Cub Kids Hiking Boot", category: "boots", priceCents: 6900, rating: 4.3,
    description: "Waterproof hiking boot for kids with easy hook-and-loop closure.",
    specs: { waterproof: true, weightGrams: 700, material: "synthetic" },
    variants: { sizes: ["1", "2", "3", "4", "5"], colors: ["green", "purple"] },
  },
];

/** Fixed stock for eval anchors (variant id → stock). Everything else is seeded. */
export const STOCK_OVERRIDES: Record<string, number> = {
  "jacket-squall/M/green": 3,
  "jacket-squall/L/green": 0,
  "jacket-squall/M/navy": 12,
  "tent-ridge-2/green": 8,
  "tent-ridge-2/orange": 0,
  "tent-summit-3/green": 4,
  "boot-ridgeline-mid/10/brown": 0,
  "boot-ridgeline-mid/9/brown": 6,
  "lamp-glowworm-300/black": 40,
};

export function variantId(productId: string, size?: string, color?: string): string {
  return [productId, size, color].filter(Boolean).join("/");
}
