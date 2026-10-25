/**
 * Campaign message rules.
 *
 * The structured offer (amount, minimum spend, reward) is the only source of the
 * campaign's economics. The message is marketing copy: it may be reworded freely, but
 * it must state the offer terms accurately and must not mention any other amount.
 * Messages are previews only; nothing is ever sent.
 */
import { formatINR } from './format';
import type { Offer } from './types';

export const MESSAGE_MIN_LENGTH = 20;
export const MESSAGE_MAX_LENGTH = 300;

export interface MessageIssue {
  code: 'empty' | 'too_short' | 'too_long' | 'missing_value' | 'missing_min_spend' | 'missing_reward' | 'unknown_amount' | 'percentage';
  text: string;
}

/** Default copy for a win-back offer, written for a neighbourhood bakery. */
export function generateMessage(offer: Offer, merchantName: string, windowDays: number): string {
  const greeting = `Hi! We miss seeing you at ${merchantName}.`;
  const validity = `Valid for ${windowDays} days.`;
  switch (offer.kind) {
    case 'flat_discount':
      return `${greeting} Enjoy ${formatINR(offer.valuePaise)} off your next order${
        offer.minSpendPaise > 0 ? ` of ${formatINR(offer.minSpendPaise)} or more` : ''
      }. ${validity} We'd love to see you again!`;
    case 'free_item':
      return `${greeting} Your next order comes with a free cookie on us. ${validity} We'd love to see you again!`;
    case 'loyalty_stamp':
      return `${greeting} Earn double stamps on your loyalty card with your next order. ${validity} We'd love to see you again!`;
    case 'none':
      return '';
  }
}

/** Rupee amounts mentioned in text ("₹30", "₹ 1,000", "Rs. 30", "Rs 30", "INR 30"), in rupees. */
export function mentionedAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:₹|\bRs\.?|\bINR)\s?(\d[\d,]*(?:\.\d+)?)/gi)) out.push(Number(m[1]!.replace(/,/g, '')));
  return out;
}

function hasAmount(text: string, paise: number): boolean {
  return mentionedAmounts(text).some((a) => Math.abs(a * 100 - paise) < 0.5);
}

export function validateMessage(message: string, offer: Offer): MessageIssue[] {
  const text = message.trim();
  const issues: MessageIssue[] = [];
  if (text.length === 0) return [{ code: 'empty', text: 'Write a message.' }];
  if (text.length < MESSAGE_MIN_LENGTH) issues.push({ code: 'too_short', text: `Use at least ${MESSAGE_MIN_LENGTH} characters.` });
  if (message.length > MESSAGE_MAX_LENGTH) issues.push({ code: 'too_long', text: `Keep it within ${MESSAGE_MAX_LENGTH} characters.` });

  const allowed: number[] = [];
  if (offer.kind === 'flat_discount') {
    allowed.push(offer.valuePaise, offer.minSpendPaise);
    if (!hasAmount(text, offer.valuePaise)) issues.push({ code: 'missing_value', text: `Mention the discount: ${formatINR(offer.valuePaise)} off.` });
    if (offer.minSpendPaise > 0 && !hasAmount(text, offer.minSpendPaise)) {
      issues.push({ code: 'missing_min_spend', text: `Mention the minimum order: ${formatINR(offer.minSpendPaise)}.` });
    }
    if (/\d\s?%/.test(text)) issues.push({ code: 'percentage', text: 'The offer is a flat amount, not a percentage.' });
  } else if (offer.kind === 'free_item') {
    if (!/\bfree\b/i.test(text)) issues.push({ code: 'missing_reward', text: 'Say that the item is free.' });
  } else if (offer.kind === 'loyalty_stamp') {
    if (!/\bstamps?\b/i.test(text)) issues.push({ code: 'missing_reward', text: 'Mention the loyalty stamps.' });
  }

  const unknown = [...new Set(mentionedAmounts(text).filter((a) => !allowed.some((p) => Math.abs(a * 100 - p) < 0.5)))];
  if (unknown.length > 0) {
    issues.push({
      code: 'unknown_amount',
      text: `${unknown.map((a) => formatINR(a * 100)).join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not part of the offer. Edit the offer rules instead.`,
    });
  }
  return issues;
}

/**
 * Keeps the message in step with an offer change: a message the merchant never edited
 * is regenerated; an edited one is kept as written (validation will flag stale terms).
 */
export function syncMessage(message: string, previousOffer: Offer, nextOffer: Offer, merchantName: string, windowDays: number): string {
  return message === generateMessage(previousOffer, merchantName, windowDays) ? generateMessage(nextOffer, merchantName, windowDays) : message;
}
