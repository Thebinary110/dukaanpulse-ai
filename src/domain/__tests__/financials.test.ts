import { describe, expect, it } from 'vitest';
import { blanketDiscountEconomics, campaignEconomics } from '../financials';
import { DEFAULT_ASSUMPTIONS, getIntervention, INTERVENTIONS, returnRateWithUplift } from '../interventions';
import type { CampaignEconomicsInput } from '../financials';

const base: CampaignEconomicsInput = {
  customers: 100,
  averageBasketPaise: 25_000, // ₹250
  offer: getIntervention('win-back-30').offer, // ₹30 off ₹200+
  assumedReturnRate: 0.3,
  assumptions: { ...DEFAULT_ASSUMPTIONS, grossMarginRate: 0.5, baselineReturnRate: 0.1, redemptionRate: 0.8, messageCostPaise: 25, followOnVisits: 0 },
};

describe('campaign economics', () => {
  it('matches a hand-computed example', () => {
    const e = campaignEconomics(base);
    // Revenue with campaign: 100 × 0.3 × ₹250 = ₹7,500 (min spend ₹200 < basket)
    expect(e.revenueWithCampaignPaise).toBeCloseTo(750_000);
    // Without: 100 × 0.1 × ₹250 = ₹2,500
    expect(e.revenueWithoutCampaignPaise).toBeCloseTo(250_000);
    expect(e.incrementalRevenuePaise).toBeCloseTo(500_000);
    expect(e.incrementalMarginPaise).toBeCloseTo(250_000); // 50%
    // Offer cost: 100 × 0.3 × 0.8 × ₹30 = ₹720
    expect(e.offerCostPaise).toBeCloseTo(72_000);
    // Messages: 100 × ₹0.25 = ₹25
    expect(e.messageCostPaise).toBeCloseTo(2_500);
    expect(e.netIncrementalProfitPaise).toBeCloseTo(175_500);
    expect(e.returnOnSpend).toBeCloseTo(175_500 / 74_500);
  });

  it.each(INTERVENTIONS.map((i) => i.id))('holds its accounting identities for %s', (id) => {
    const intervention = getIntervention(id);
    const e = campaignEconomics({
      ...base,
      offer: intervention.offer,
      assumedReturnRate: returnRateWithUplift(base.assumptions.baselineReturnRate, intervention.assumedUplift),
    });
    expect(e.incrementalRevenuePaise).toBeCloseTo(e.revenueWithCampaignPaise - e.revenueWithoutCampaignPaise);
    expect(e.totalCostPaise).toBeCloseTo(e.offerCostPaise + e.messageCostPaise);
    expect(e.netIncrementalProfitPaise).toBeCloseTo(e.incrementalMarginPaise - e.totalCostPaise);
  });

  it('charges the offer to customers who would have returned anyway', () => {
    // At the baseline rate the offer only subsidises existing behaviour, so profit is negative.
    const e = campaignEconomics({ ...base, assumedReturnRate: base.assumptions.baselineReturnRate });
    expect(e.incrementalRevenuePaise).toBeCloseTo(0);
    expect(e.offerCostPaise).toBeGreaterThan(0);
    expect(e.netIncrementalProfitPaise).toBeLessThan(0);
  });

  it('breaks even exactly at the break-even return rate', () => {
    const { breakEvenReturnRate, breakEvenReturners } = campaignEconomics(base);
    expect(breakEvenReturnRate).toBeGreaterThan(base.assumptions.baselineReturnRate);
    expect(breakEvenReturners).toBeCloseTo(breakEvenReturnRate * base.customers);
    const at = (r: number) => campaignEconomics({ ...base, assumedReturnRate: r }).netIncrementalProfitPaise;
    expect(at(breakEvenReturnRate)).toBeCloseTo(0, 6);
    expect(at(breakEvenReturnRate + 0.01)).toBeGreaterThan(0);
    expect(at(breakEvenReturnRate - 0.01)).toBeLessThan(0);
  });

  it('lifts redeeming baskets to the minimum spend', () => {
    const small = campaignEconomics({ ...base, averageBasketPaise: 15_000, assumptions: { ...base.assumptions, redemptionRate: 1 } });
    // All returners redeem, so each spends ₹200, not ₹150.
    expect(small.revenueWithCampaignPaise).toBeCloseTo(100 * 0.3 * 20_000);
  });

  it('adds follow-on full-price visits for returners on both sides of the comparison', () => {
    const k = 2;
    const e = campaignEconomics({ ...base, assumptions: { ...base.assumptions, followOnVisits: k } });
    // With: 100 × 0.3 × (₹250 + 2 × ₹250) = ₹22,500. Without: 100 × 0.1 × ₹250 × 3 = ₹7,500.
    expect(e.revenueWithCampaignPaise).toBeCloseTo(2_250_000);
    expect(e.revenueWithoutCampaignPaise).toBeCloseTo(750_000);
    // Offer cost is unchanged: follow-on visits are at full price.
    expect(e.offerCostPaise).toBeCloseTo(72_000);
    const at = (r: number) =>
      campaignEconomics({ ...base, assumedReturnRate: r, assumptions: { ...base.assumptions, followOnVisits: k } }).netIncrementalProfitPaise;
    expect(at(e.breakEvenReturnRate)).toBeCloseTo(0, 6);
  });

  it('reports an unreachable break-even when each redemption costs more than it earns', () => {
    const e = campaignEconomics({ ...base, offer: { ...base.offer, costPerRedemptionPaise: 20_000 } });
    expect(e.breakEvenReturnRate).toBe(Number.POSITIVE_INFINITY);
    expect(e.breakEvenReturners).toBe(Number.POSITIVE_INFINITY);
  });

  it('treats "do nothing" as zero cost, zero lift, and no messages', () => {
    const none = getIntervention('no-action');
    const e = campaignEconomics({ ...base, offer: none.offer, assumedReturnRate: base.assumptions.baselineReturnRate });
    expect(e.messageCostPaise).toBe(0);
    expect(e.offerCostPaise).toBe(0);
    expect(e.netIncrementalProfitPaise).toBeCloseTo(0);
    expect(e.returnOnSpend).toBeNull();
  });
});

describe('blanketDiscountEconomics', () => {
  it('counts the subsidy on existing orders and the extra orders needed to recover it', () => {
    // 3,000 orders, ₹250 bill, ₹20 off, 55% margin, every order uses it.
    const e = blanketDiscountEconomics({ orders: 3000, averageBillPaise: 25_000, discountPaise: 2000, grossMarginRate: 0.55, redemptionShare: 1 });
    expect(e.subsidyCostPaise).toBe(6_000_000); // ₹60,000
    expect(e.marginPerExtraOrderPaise).toBeCloseTo(11_750); // ₹137.50 − ₹20
    expect(e.breakEvenExtraOrders).toBeCloseTo(6_000_000 / 11_750);
    expect(e.breakEvenOrderGrowth).toBeCloseTo(6_000_000 / 11_750 / 3000);
  });

  it('cannot break even when each extra order loses money', () => {
    const e = blanketDiscountEconomics({ orders: 100, averageBillPaise: 10_000, discountPaise: 6000, grossMarginRate: 0.5, redemptionShare: 1 });
    expect(e.breakEvenExtraOrders).toBe(Number.POSITIVE_INFINITY);
  });
});
