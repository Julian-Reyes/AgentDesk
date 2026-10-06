/**
 * Which items of an order the customer has named in their own words. Used by
 * issue_refund (round 3, Julian's decision 2026-10-06): on an order with more
 * than one item, a damaged refund is only for an item the customer named, so
 * an agent can't guess one. In dev-dmg, Flash-Lite picked an item itself when
 * the customer only said "something arrived broken", once the $329 pack.
 *
 * It answers the reverse of findOrderItem's question. findOrderItem takes the
 * agent's short query and requires every query word to be in the item's name;
 * a whole customer message ("It's the kids' headlamp, the Firefly. It won't
 * switch on") never passes that. Here an item counts as named when the
 * customer's text contains its product id, or a word of its name that no other
 * item in the order has. Both use the same word splitting.
 */

/** Lower-case words of letters and digits; everything else separates them. */
export const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export type OrderItemRef = { productId: string; name: string };

/** A word as the customer wrote it fits a word of a name, allowing a plural either way ("boots" for "Boot", "kid" for "Kids"). */
const sameWord = (said: string, nameWord: string) =>
  said === nameWord || said === `${nameWord}s` || said === `${nameWord}es` || nameWord === `${said}s` || nameWord === `${said}es`;

/**
 * The product ids (distinct, in order) the customer named. A name word counts
 * only if it's at least 3 characters and in exactly one product's name, so
 * "headlamp" names nothing when the order has two headlamps, and "80" in
 * "Voyager 80" never matches a price or a quantity.
 */
export function itemsNamedIn(customerTexts: readonly string[], items: readonly OrderItemRef[]): string[] {
  const products = [...new Map(items.map((i) => [i.productId, i])).values()];
  const text = customerTexts.join("\n").toLowerCase();
  const said = new Set(words(text));
  const nameWords = new Map(products.map((p) => [p.productId, new Set(words(p.name).filter((w) => w.length >= 3))]));
  const owners = (w: string) => products.filter((p) => nameWords.get(p.productId)!.has(w)).length;
  return products
    .filter((p) => {
      if (text.includes(p.productId.toLowerCase())) return true;
      const distinctive = [...nameWords.get(p.productId)!].filter((w) => owners(w) === 1);
      return distinctive.some((w) => [...said].some((s) => sameWord(s, w)));
    })
    .map((p) => p.productId);
}
