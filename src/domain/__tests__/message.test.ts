import { describe, expect, it } from 'vitest';
import { generateMessage, mentionedAmounts, MESSAGE_MAX_LENGTH, syncMessage, validateMessage } from '../message';
import type { Offer } from '../types';

const discount: Offer = { kind: 'flat_discount', valuePaise: 3000, costPerRedemptionPaise: 3000, minSpendPaise: 20_000 };
const freeItem: Offer = { kind: 'free_item', valuePaise: 4000, costPerRedemptionPaise: 1400, minSpendPaise: 0 };
const stamps: Offer = { kind: 'loyalty_stamp', valuePaise: 1000, costPerRedemptionPaise: 450, minSpendPaise: 0 };
const codes = (m: string, o: Offer) => validateMessage(m, o).map((i) => i.code);

describe('generateMessage', () => {
  it('writes natural copy from the structured offer', () => {
    expect(generateMessage(discount, 'Sunrise Bakery', 14)).toBe(
      "Hi! We miss seeing you at Sunrise Bakery. Enjoy ₹30 off your next order of ₹200 or more. Valid for 14 days. We'd love to see you again!",
    );
    expect(generateMessage({ ...discount, valuePaise: 4500, costPerRedemptionPaise: 4500, minSpendPaise: 30_000 }, 'X', 7)).toContain(
      '₹45 off your next order of ₹300 or more. Valid for 7 days.',
    );
    expect(generateMessage({ ...discount, minSpendPaise: 0 }, 'X', 14)).toContain('₹30 off your next order.');
  });

  it('produces valid messages for every offer type', () => {
    for (const offer of [discount, freeItem, stamps]) expect(validateMessage(generateMessage(offer, 'Sunrise Bakery', 14), offer)).toEqual([]);
  });
});

describe('validateMessage', () => {
  it('finds rupee amounts in common notations', () => {
    expect(mentionedAmounts('₹30 off, Rs. 200 min, Rs 1,000 cap, INR 5, ₹ 12.5')).toEqual([30, 200, 1000, 5, 12.5]);
  });

  it('requires the discount and minimum order to be stated', () => {
    expect(codes('Hi! Come back to Sunrise Bakery for a treat soon.', discount)).toEqual(['missing_value', 'missing_min_spend']);
    expect(codes('Hi! Get ₹30 off at Sunrise Bakery, any order this week.', discount)).toEqual(['missing_min_spend']);
  });

  it('rejects amounts that are not part of the offer, so text cannot change the economics', () => {
    const issues = validateMessage('Hi! Enjoy ₹50 off your next order of ₹200 or more at Sunrise Bakery.', discount);
    expect(issues.map((i) => i.code)).toEqual(['missing_value', 'unknown_amount']);
    expect(issues[1]!.text).toContain('₹50');
  });

  it('rejects percentage wording for a flat discount', () => {
    expect(codes('Hi! Enjoy ₹30 (10%) off your next order of ₹200 or more.', discount)).toContain('percentage');
  });

  it('checks length limits', () => {
    expect(codes('', discount)).toEqual(['empty']);
    expect(codes('₹30 off ₹200', discount)).toContain('too_short');
    expect(codes(`${generateMessage(discount, 'S', 14)} ${'x'.repeat(MESSAGE_MAX_LENGTH)}`, discount)).toContain('too_long');
  });

  it('checks the reward is mentioned for other offers', () => {
    expect(codes('Hi! We miss you at Sunrise Bakery, come by soon.', freeItem)).toEqual(['missing_reward']);
    expect(codes('Hi! We miss you at Sunrise Bakery, come by soon.', stamps)).toEqual(['missing_reward']);
    expect(codes('Hi! A free cookie awaits you at Sunrise Bakery, worth ₹40.', freeItem)).toEqual(['unknown_amount']);
  });
});

describe('syncMessage', () => {
  const next = { ...discount, valuePaise: 4000, costPerRedemptionPaise: 4000 };

  it('regenerates an unedited message when the offer changes', () => {
    expect(syncMessage(generateMessage(discount, 'S', 14), discount, next, 'S', 14)).toBe(generateMessage(next, 'S', 14));
  });

  it('keeps an edited message, leaving validation to flag stale terms', () => {
    const edited = 'Namaste! ₹30 off your next order of ₹200 or more at Sunrise Bakery.';
    expect(syncMessage(edited, discount, next, 'S', 14)).toBe(edited);
    expect(codes(edited, next)).toContain('missing_value');
  });
});
