/**
 * Expected-value campaign economics.
 *
 * Notation (per campaign):
 *   N  = customers messaged            rT = assumed return rate with the offer
 *   rB = baseline return rate          ρ  = redemption rate among returners
 *   B  = average basket                Bo = basket when redeeming = max(B, minimum spend)
 *   m  = gross margin rate             d  = merchant cost per redemption
 *   c  = cost per message (0 when no message is sent)
 *   k  = follow-on full-price visits a returning customer makes later in the window
 *
 *   Revenue with campaign    = N × rT × (ρ·Bo + (1 − ρ)·B + k·B)
 *   Revenue without campaign = N × rB × B × (1 + k)
 *   Incremental margin       = (with − without) × m
 *   Offer cost               = N × rT × ρ × d   ← includes people who would have returned anyway
 *   Message cost             = N × c
 *   Net incremental profit   = incremental margin − offer cost − message cost
 */
import type { CampaignAssumptions, Offer } from './types';

export interface CampaignEconomicsInput {
  customers: number;
  averageBasketPaise: number;
  offer: Offer;
  assumedReturnRate: number;
  assumptions: CampaignAssumptions;
}

export interface CampaignEconomics {
  expectedReturners: number;
  expectedIncrementalReturners: number;
  expectedRedemptions: number;
  revenueWithCampaignPaise: number;
  revenueWithoutCampaignPaise: number;
  incrementalRevenuePaise: number;
  incrementalMarginPaise: number;
  offerCostPaise: number;
  messageCostPaise: number;
  totalCostPaise: number;
  netIncrementalProfitPaise: number;
  /** Net profit ÷ total cost; null when nothing is spent. */
  returnOnSpend: number | null;
  /** Return rate at which net profit is exactly zero; Infinity if no rate breaks even. */
  breakEvenReturnRate: number;
  /** Returning customers needed to break even; Infinity if unreachable. */
  breakEvenReturners: number;
}

export function redeemingBasketPaise(averageBasketPaise: number, offer: Offer): number {
  return Math.max(averageBasketPaise, offer.minSpendPaise);
}

export function messageCostPerCustomer(offer: Offer, assumptions: CampaignAssumptions): number {
  return offer.kind === 'none' ? 0 : assumptions.messageCostPaise;
}

export function campaignEconomics(input: CampaignEconomicsInput): CampaignEconomics {
  const { customers: n, averageBasketPaise: b, offer, assumedReturnRate: rT, assumptions } = input;
  const { grossMarginRate: m, baselineReturnRate: rB } = assumptions;
  const rho = offer.kind === 'none' ? 0 : assumptions.redemptionRate;
  const bo = redeemingBasketPaise(b, offer);
  const d = offer.costPerRedemptionPaise;
  const c = messageCostPerCustomer(offer, assumptions);
  const k = assumptions.followOnVisits;

  const basketPerReturner = rho * bo + (1 - rho) * b + k * b;
  const revenueWithCampaignPaise = n * rT * basketPerReturner;
  const revenueWithoutCampaignPaise = n * rB * b * (1 + k);
  const incrementalRevenuePaise = revenueWithCampaignPaise - revenueWithoutCampaignPaise;
  const incrementalMarginPaise = incrementalRevenuePaise * m;
  const offerCostPaise = n * rT * rho * d;
  const messageCostPaise = n * c;
  const totalCostPaise = offerCostPaise + messageCostPaise;
  const netIncrementalProfitPaise = incrementalMarginPaise - totalCostPaise;

  // Solve net(rT) = 0:  rT × (basketPerReturner·m − ρ·d) = rB·B·(1 + k)·m + c
  const perReturnerContribution = basketPerReturner * m - rho * d;
  const breakEvenReturnRate =
    perReturnerContribution > 0 ? (rB * b * (1 + k) * m + c) / perReturnerContribution : Number.POSITIVE_INFINITY;

  return {
    expectedReturners: n * rT,
    expectedIncrementalReturners: n * (rT - rB),
    expectedRedemptions: n * rT * rho,
    revenueWithCampaignPaise,
    revenueWithoutCampaignPaise,
    incrementalRevenuePaise,
    incrementalMarginPaise,
    offerCostPaise,
    messageCostPaise,
    totalCostPaise,
    netIncrementalProfitPaise,
    returnOnSpend: totalCostPaise === 0 ? null : netIncrementalProfitPaise / totalCostPaise,
    breakEvenReturnRate,
    breakEvenReturners: n * breakEvenReturnRate,
  };
}
