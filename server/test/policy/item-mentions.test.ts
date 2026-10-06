import { describe, expect, it } from "vitest";
import { itemsNamedIn } from "../../src/policy/item-mentions.ts";

// #1074 in the seed: the order from refund-within-limit-03 (dev-dmg, 2026-10-06).
const ORDER_1074 = [
  { productId: "pack-voyager-80", name: "Voyager 80 Expedition Pack" },
  { productId: "jacket-squall", name: "Squall Rain Jacket" },
  { productId: "lamp-firefly-kids", name: "Firefly Kids Headlamp" },
];

describe("itemsNamedIn: which items the customer named in their own words", () => {
  it("names nothing when the customer only says something broke (refund-within-limit-03, turn 1)", () => {
    expect(itemsNamedIn(["Something from my order #1074 arrived broken. What can you do?"], ORDER_1074)).toEqual([]);
  });

  it("finds the item in a whole message, through apostrophes and other words (turn 2)", () => {
    expect(itemsNamedIn(["It's the kids' headlamp, the Firefly. It won't switch on at all, and the battery door is cracked."], ORDER_1074)).toEqual(["lamp-firefly-kids"]);
  });

  it("reads every customer message so far, and can find more than one item", () => {
    expect(itemsNamedIn(["My jacket arrived ripped.", "Oh, and the backpack too… the Voyager."], ORDER_1074)).toEqual(["pack-voyager-80", "jacket-squall"]);
  });

  it("accepts a product id, plurals either way, and any case", () => {
    expect(itemsNamedIn(["refund lamp-firefly-kids please"], ORDER_1074)).toEqual(["lamp-firefly-kids"]);
    expect(itemsNamedIn(["The HEADLAMPS are broken"], ORDER_1074)).toEqual(["lamp-firefly-kids"]);
    expect(itemsNamedIn(["the kid lamp"], ORDER_1074)).toEqual(["lamp-firefly-kids"]);
  });

  it("doesn't count a fragment of a word, a short word, or a number", () => {
    expect(itemsNamedIn(["the lamp is broken"], ORDER_1074)).toEqual([]); // "lamp" isn't "headlamp"
    expect(itemsNamedIn(["I paid $80 for it"], ORDER_1074)).toEqual([]); // "80" is under 3 characters
    expect(itemsNamedIn(["it rained on my package"], ORDER_1074)).toEqual([]);
  });

  it("a word two items share names neither; a word only one has still names it", () => {
    const twoLamps = [...ORDER_1074, { productId: "lamp-glowworm-300", name: "Glowworm 300 Headlamp" }];
    expect(itemsNamedIn(["The headlamp arrived broken"], twoLamps)).toEqual([]);
    expect(itemsNamedIn(["The Glowworm arrived broken"], twoLamps)).toEqual(["lamp-glowworm-300"]);
    expect(itemsNamedIn(["The 300 arrived broken"], twoLamps)).toEqual(["lamp-glowworm-300"]);
  });

  it("two lines of the same product count as one item", () => {
    const sameTwice = [ORDER_1074[2]!, ORDER_1074[2]!, ORDER_1074[0]!];
    expect(itemsNamedIn(["the firefly"], sameTwice)).toEqual(["lamp-firefly-kids"]);
  });
});
