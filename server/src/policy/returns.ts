import type { OrderStatus } from "../db/schema.ts";
import { addDays, calendarDaysBetween } from "../domain/clock.ts";
import { DAMAGED_AFTER_DELIVERY_MESSAGE } from "./refunds.ts";
import { RULES } from "./rules.ts";

/** "used" is worn or used with nothing wrong with it; damage has its own two conditions (see DAMAGE_CAUSES). */
export const ITEM_CONDITIONS = ["unused", "used", "arrived_damaged", "damaged_after_delivery"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export type ReturnCheckInput = {
  orderStatus: OrderStatus;
  deliveredAt: Date | null;
  item: { qty: number; returnedQty: number };
  /** What the customer said about the item. Unknown = not stated yet. */
  condition?: ItemCondition;
  now: Date;
};

export type ReturnCheck =
  | { eligible: true; code: "ELIGIBLE"; message: string; returnBy: string; conditionRequired: string }
  | {
      eligible: false;
      code:
        | "NOT_DELIVERED_YET"
        | "ORDER_LOST"
        | "ALREADY_RETURNED"
        | "WINDOW_EXPIRED"
        | "ITEM_USED"
        | "USE_DAMAGED_ITEM_PROCESS"
        | "DAMAGED_AFTER_DELIVERY";
      message: string;
      details?: Record<string, unknown>;
    };

export function checkReturnEligibility(input: ReturnCheckInput): ReturnCheck {
  const { orderStatus, deliveredAt, item, condition, now } = input;

  if (orderStatus === "lost") {
    return { eligible: false, code: "ORDER_LOST", message: "This order was lost in transit, so there's nothing to return. Lost orders are refunded in full." };
  }
  if (orderStatus === "returned" || item.returnedQty >= item.qty) {
    return { eligible: false, code: "ALREADY_RETURNED", message: "This item has already been returned." };
  }
  if (orderStatus !== "delivered" || !deliveredAt) {
    return { eligible: false, code: "NOT_DELIVERED_YET", message: "The order hasn't been delivered yet. Returns can start once it arrives." };
  }

  const daysSince = calendarDaysBetween(deliveredAt, now);
  const returnBy = addDays(deliveredAt, RULES.returnWindowDays).toISOString().slice(0, 10);

  if (condition === "damaged_after_delivery") {
    return { eligible: false, code: "DAMAGED_AFTER_DELIVERY", message: DAMAGED_AFTER_DELIVERY_MESSAGE, details: { daysSinceDelivery: daysSince } };
  }
  if (condition === "arrived_damaged") {
    return {
      eligible: false,
      code: "USE_DAMAGED_ITEM_PROCESS",
      message: `Items that arrived damaged follow the damaged-items process instead of a normal return (report within ${RULES.damageReportWindowDays} days of delivery).`,
      details: { daysSinceDelivery: daysSince, withinDamageWindow: daysSince <= RULES.damageReportWindowDays },
    };
  }
  if (daysSince > RULES.returnWindowDays) {
    return {
      eligible: false,
      code: "WINDOW_EXPIRED",
      message: `The ${RULES.returnWindowDays}-day return window ended on ${returnBy} (delivered ${daysSince} days ago).`,
      details: { returnBy, daysSinceDelivery: daysSince },
    };
  }
  if (condition === "used") {
    return {
      eligible: false,
      code: "ITEM_USED",
      message: "Only unused items in original condition can be returned. If the item is defective, the warranty may cover it.",
    };
  }
  return {
    eligible: true,
    code: "ELIGIBLE",
    message: `Eligible for return until ${returnBy}, provided the item is unused and in its original packaging. The refund is issued when the warehouse receives it.`,
    returnBy,
    conditionRequired: "unused, original packaging",
  };
}
