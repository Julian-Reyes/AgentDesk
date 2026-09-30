import { z } from "zod";
import { ROUTES } from "../agents/router.ts";
import { CATEGORIES, RUN_OUTCOMES } from "../db/schema.ts";
import type { CouponRejectionCode } from "../policy/coupons.ts";
import { AGENT_REFUND_REASONS } from "../policy/refunds.ts";
import { ALL_TOOLS } from "../tools/registry.ts";

/**
 * The eval case format. One case = one scripted conversation plus what must be
 * true at the end of it, in terms a grader can check without a model.
 *
 * Principles:
 *  - Check what the store DID (refund/coupon rows, the run outcome) and what the
 *    customer was TOLD (facts and amounts in replies), not the exact path the
 *    model took. Tool-call requirements are only for cases where the path is the
 *    rule itself (a price must come from quote_price).
 *  - Money effects default to NONE. A refund or coupon that a case doesn't list
 *    is a policy violation, so "zero policy violations" is checked in every case,
 *    not just the adversarial ones.
 *  - Every expected number is written out in the case (so a reviewer can read
 *    it), and validate-cases.ts recomputes it from the seed data (so it can't go
 *    stale when the catalog or the rules change).
 *
 * Checks that apply to every reply of every case (grounding, no raw JSON or tool
 * syntax) are not part of the case; the graders run them globally.
 */

/** The spec's case types (docs/PROJECT.md, Evaluation). */
export const CASE_TYPES = [
  "product_facts",
  "comparison",
  "recommendation",
  "price_deals",
  "invalid_coupon",
  "stock",
  "order_status",
  "returns",
  "refund_within_limit",
  "refund_over_limit",
  "adversarial",
  "out_of_scope",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const SPLITS = ["dev", "test"] as const;

const COUPON_REJECTIONS = ["NOT_FOUND", "EXPIRED", "ALREADY_USED", "CATEGORY_EXCLUDED", "MIN_SPEND_NOT_MET"] as const satisfies readonly CouponRejectionCode[];
const TOOL_NAMES = ALL_TOOLS.map((t) => t.name) as [string, ...string[]];

const Cents = z.number().int().nonnegative();
const ProductId = z.string().min(1);
const OrderNumber = z.number().int().positive();

/**
 * Text a reply must contain: one phrase, or a list of acceptable alternatives
 * (any one is enough). Matching is case-insensitive and ignores extra spaces.
 * e.g. ["shipped", "on its way", "in transit"].
 */
const Phrase = z.union([z.string().min(1), z.array(z.string().min(1)).min(2)]);

/** What one agent reply must (not) say. */
const ReplyCheck = z
  .object({
    /** Each entry must appear in the reply. */
    mentions: z.array(Phrase).default([]),
    /**
     * Dollar amounts that must appear, in cents. Amounts are parsed from the
     * reply, so "$151.20", "$151.2" and "151.20 USD" all match 15120.
     */
    amounts: z.array(Cents).default([]),
    /** Phrases that must not appear (a task failure, e.g. "within a few business days"). */
    avoids: z.array(z.string().min(1)).default([]),
  })
  .strict();

const Turn = z
  .object({
    /** What the customer says. The script is fixed: the next message is sent whatever the agent replied. */
    customer: z.string().min(1),
    /** Checks on the agent's reply to this message. */
    reply: ReplyCheck.optional(),
  })
  .strict();

/**
 * A tool call the agent must make. `args` is a partial match, compared after the
 * tool's own argument parsing, so "#1042", "1042" and 1042 are all the same order.
 */
const ToolCall = z.object({ tool: z.enum(TOOL_NAMES), args: z.record(z.string(), z.unknown()).optional() }).strict();
const ToolRequirement = z.union([ToolCall, z.object({ anyOf: z.array(ToolCall).min(2) }).strict()]);

const RefundEffect = z
  .object({
    order: OrderNumber,
    amountCents: Cents.positive(),
    reason: z.enum(AGENT_REFUND_REASONS),
    /** Damaged-item refunds name the item (product id). */
    item: ProductId.optional(),
    /** issued = paid out automatically; pending_approval = waiting in the approvals queue. */
    status: z.enum(["issued", "pending_approval"]),
  })
  .strict();

const GoodwillEffect = z
  .object({ percent: z.number().int().positive(), status: z.enum(["issued", "pending_approval"]) })
  .strict();

const PriceCheck = z
  .object({
    cart: z.array(z.object({ productId: ProductId, qty: z.number().int().positive() }).strict()).min(1),
    coupon: z.string().min(1).optional(),
    /** The quote_price total for this cart at the store date. Must appear in the reply. */
    totalCents: Cents,
    /** Which turn's reply must state the total (1-based). Default: the last turn. */
    turn: z.number().int().positive().optional(),
  })
  .strict();

const CouponCheck = z
  .object({
    code: z.string().min(1),
    valid: z.boolean(),
    /** Why it's rejected, as the coupon rules report it. Required when valid is false. */
    reason: z.enum(COUPON_REJECTIONS).optional(),
  })
  .strict()
  .refine((c) => c.valid === (c.reason === undefined), "reason is required for an invalid coupon, and only then");

/** Constraints a recommendation must meet, checked against the catalog (prices are today's current prices). */
const RecommendationCheck = z
  .object({
    constraints: z
      .object({
        category: z.enum(CATEGORIES),
        maxPriceCents: Cents,
        minCapacityPersons: z.number().int().positive(),
        maxWeightGrams: z.number().int().positive(),
        maxTempRatingC: z.number().int(),
        waterproof: z.boolean(),
        inStock: z.literal(true),
      })
      .partial()
      .strict(),
    /** Every catalog product that meets the constraints. The reply must name at least one, and no product outside this list. */
    acceptable: z.array(ProductId).min(1),
  })
  .strict();

const Expectation = z
  .object({
    /** The Router's decision on the first message. A list means any of them is correct. */
    route: z.union([z.enum(ROUTES), z.array(z.enum(ROUTES)).min(2)]),
    /** The agent holding the conversation at the end (for handoff cases). */
    finalAgent: z.enum(["shopping", "support"]).optional(),
    /** The run outcome. A list means any of them is correct. "failed" is never expected. */
    outcome: z.union([z.enum(RUN_OUTCOMES).exclude(["failed"]), z.array(z.enum(RUN_OUTCOMES).exclude(["failed"])).min(2)]),

    tools: z
      .object({
        /** Calls that must happen (each entry, in any order). */
        required: z.array(ToolRequirement).default([]),
        /** Tools that must not even be attempted (e.g. issue_refund after an injection). The code would block them; the attempt still counts against the model. */
        forbidden: z.array(z.enum(TOOL_NAMES)).default([]),
      })
      .strict()
      .default({ required: [], forbidden: [] }),

    /** Store changes the conversation must leave behind. Anything not listed must not happen. */
    effects: z
      .object({
        refunds: z.array(RefundEffect).default([]),
        goodwill: z.array(GoodwillEffect).default([]),
        /** required: a ticket must be opened; forbidden: must not be; allowed: either (then it only counts toward the escalation rate). */
        escalation: z.enum(["required", "allowed", "forbidden"]).default("allowed"),
      })
      .strict()
      .default({ refunds: [], goodwill: [], escalation: "allowed" }),

    price: PriceCheck.optional(),
    coupon: CouponCheck.optional(),
    recommendation: RecommendationCheck.optional(),

    /**
     * Text that must never appear in any reply, e.g. details of another
     * customer's order. A policy violation, not just a task failure.
     */
    leaks: z.array(z.string().min(1)).default([]),

    /** Guidance for the LLM judge: what a good answer does here. Not used by the automatic graders. */
    judge: z.string().min(1).optional(),
  })
  .strict()
  .refine((e) => !e.coupon || e.price, { message: "a coupon check needs a price check (coupons are validated against a cart)", path: ["coupon"] });

export const EvalCase = z
  .object({
    /** Stable id, e.g. "refund-within-limit-01". Never reused. */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words and digits separated by dashes"),
    split: z.enum(SPLITS),
    type: z.enum(CASE_TYPES),
    /** What the case tests and why the expectation is correct, for the reviewer. */
    why: z.string().min(10),
    /** Where the case came from, e.g. "spec table", "manual testing 2026-09-29". */
    source: z.string().min(1).optional(),
    /** The signed-in customer's email (a seeded customer), or null for an anonymous visitor. */
    customer: z.email().nullable(),
    turns: z.array(Turn).min(1),
    expect: Expectation,
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.expect.price?.turn && c.expect.price.turn > c.turns.length) {
      ctx.addIssue({ code: "custom", path: ["expect", "price", "turn"], message: `turn ${c.expect.price.turn} doesn't exist (${c.turns.length} turns)` });
    }
  });

export type EvalCase = z.infer<typeof EvalCase>;
/** What a case file writes: defaults (empty lists, escalation "allowed") may be left out. */
export type EvalCaseInput = z.input<typeof EvalCase>;

/** Parse a file's cases, failing loudly with the case id and the problem. */
export function defineCases(cases: EvalCaseInput[]): EvalCase[] {
  return cases.map((c, i) => {
    const parsed = EvalCase.safeParse(c);
    if (!parsed.success) {
      const id = typeof c.id === "string" ? c.id : `#${i + 1}`;
      throw new Error(`Invalid eval case ${id}:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  });
}
