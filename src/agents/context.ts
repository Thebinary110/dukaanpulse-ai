/**
 * Conversation context: what a follow-up question can rely on from earlier turns.
 * Offer figures come only from the merchant's own words, parsed deterministically and
 * validated against the same limits as the rest of the app.
 */
import { LIMITS } from '../domain/decision';
import type { ConversationContext, Intent, OfferOverrides } from './types';

export function emptyContext(): ConversationContext {
  return { lastIntent: null, offer: {}, turns: 0 };
}

const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

/** Offer details stated in a question, e.g. "₹20 off", "min order 250", "free cookie". */
export function parseOffer(question: string): OfferOverrides {
  const q = question.toLowerCase();
  const out: OfferOverrides = {};
  if (/\b(free (cookie|item|add-?on)|add-?on)\b/.test(q)) out.interventionId = 'free-addon';
  else if (/\b(loyalty|stamps?)\b/.test(q)) out.interventionId = 'double-stamps';
  else if (/\b(do nothing|no offer)\b/.test(q)) out.interventionId = 'no-action';

  const minSpend = q.match(/(?:min(?:imum)?(?: order| spend| bill)?|above|over|on orders? (?:of|above|over)|on)\s*(?:₹|rs\.?|inr)?\s*(\d{2,4})/);
  if (minSpend && inRange(Number(minSpend[1]), LIMITS.minSpend.min, LIMITS.minSpend.max)) out.minSpendRupees = Number(minSpend[1]);

  const amounts = [...q.matchAll(/(?:₹|rs\.?\s?|inr\s?)(\d{1,4})|(\d{1,4})\s?(?:rupees|rs\b|₹)/g)].map((m) => Number(m[1] ?? m[2]));
  const discount = amounts.find((a) => a !== out.minSpendRupees && inRange(a, LIMITS.discount.min, LIMITS.discount.max));
  if (discount !== undefined && !out.interventionId) {
    out.discountRupees = discount;
    out.interventionId = 'win-back-30';
  }
  const uplift = q.match(/(\d{1,2})\s?(?:%|percent)\s*(?:more|extra|uplift)/);
  if (uplift && inRange(Number(uplift[1]), LIMITS.uplift.min, LIMITS.uplift.max)) out.upliftPercent = Number(uplift[1]);
  return out;
}

export function updateContext(ctx: ConversationContext, intent: Intent, parsed: OfferOverrides): ConversationContext {
  const offerRelated: Intent[] = ['offer_strategy', 'offer_what_if', 'action_request', 'blanket_discount'];
  return {
    lastIntent: intent,
    offer: offerRelated.includes(intent) ? { ...ctx.offer, ...parsed } : ctx.offer,
    turns: ctx.turns + 1,
  };
}

/** Number-free summary of the context for model prompts. */
export function describeContext(ctx: ConversationContext): string {
  const parts = [`Previous topic: ${ctx.lastIntent ?? 'none'}.`];
  if (Object.keys(ctx.offer).length > 0) parts.push(`Offer settings the merchant asked about earlier (use as tool arguments): ${JSON.stringify(ctx.offer)}.`);
  return parts.join(' ');
}
