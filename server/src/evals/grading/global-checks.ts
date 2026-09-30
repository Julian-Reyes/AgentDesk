/**
 * Judge checks that apply to every conversation, whatever the case (approved by
 * Julian, 2026-09-30). They catch what phrase bans can't: the pilot's
 * "I'll let you know once it's approved!" and "You should see it in your account
 * soon." (b) replaces the old "business days" phrase ban.
 */
export const GLOBAL_JUDGE_CHECKS: { id: string; statement: string }[] = [
  {
    id: "judge:followup",
    statement:
      "The agent never promises or implies that it will do something later that it can't do in this chat, such as notifying the customer, following up, checking back, or keeping an eye on an approval, refund or delivery. Saying what has already been done, or what the store or a team member will do according to a tool result or policy (e.g. 'a team member will review it, usually within one business day'), is fine.",
  },
  {
    id: "judge:timing",
    statement:
      "Every statement about timing (when something will ship, arrive, be refunded, reviewed or processed, or how long it takes) matches a tool result or store policy shown in the conversation. Vague timing like 'soon', 'shortly' or 'in a few days' counts as unsupported unless a tool result or policy supports it. If the agent makes no timing claims, answer yes.",
  },
];
