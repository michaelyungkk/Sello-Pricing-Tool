/**
 * optimalPriceEngine.ts
 *
 * Core optimal pricing algorithm for Sello UK Hub.
 * Calculates the price that maximises daily gross profit per SKU by blending
 * SKU-level evidence (Layer 1) with cohort benchmarks (Layer 2) and applying
 * business guardrails (Layer 3).
 *
 * Architecture: Three layers
 *   Layer 1 — SKU-level price-velocity curve (this file)
 *   Layer 2 — Cohort benchmark (cohortAnalysis.ts, Session 2)
 *   Layer 3 — Guardrails (this file)
 */

import {
    Product,
    PriceLog,
    PriceChangeRecord,
    PromotionEvent,
    PricingRules,
    PriceEra,
    TaggedTransaction,
    TransactionSource,
    PricePoint,
    OptimalPriceResult,
    CohortSnapshot,
    CohortStats,
} from '../types';
import { buildCanonicalResolver } from './skuNormalization';
import { getCohortOptimalPrice } from './cohortAnalysis';

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIDENCE_THRESHOLD = 30;
const DEFAULT_ELASTICITY = -2.0; // eslint-disable-line @typescript-eslint/no-unused-vars

// Guardrail constants
const MAX_PRICE_MULTIPLIER = 1.5;   // recommended price ≤ caPrice × 1.5
const MIN_MARKUP_OVER_COST = 1.05;  // recommended price ≥ totalCost × 1.05

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Returns an ISO week key ("YYYY-Www") for a given date string.
 * Used to aggregate transactions by week before taking the median.
 */
function getISOWeek(dateStr: string): string {
    const d = new Date(dateStr);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Returns the ISO date string for the day before the given date string.
 * Used to build era endDate boundaries.
 */
function dateBefore(dateStr: string): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

/**
 * Computes the total per-unit cost for a SKU across COGS, postage, platform fee,
 * and ads allocation. Returns a single number used in margin calculations.
 */
function getSkuCosts(sku: Product): number {
    const cogs = sku.costPrice ?? sku.costDetail?.cogs ?? 0;
    const postage = sku.postage ?? sku.costDetail?.postage ?? 0;
    const fee = sku.sellingFee ?? sku.costDetail?.sellingFee ?? 0;
    const ads = sku.adsFee ?? sku.costDetail?.adsFee ?? 0;
    return cogs + postage + fee + ads;
}

// =============================================================================
// STEP 0: ALIAS RESOLUTION — re-exported for use in calling code
// =============================================================================

export { buildCanonicalResolver };

// =============================================================================
// DATA FILTERING — WHAT ENTERS THE ALGORITHM
// =============================================================================

/**
 * Returns true if a transaction is eligible to enter the algorithm.
 * Filters out:
 *   - Records missing price or velocity
 *   - Platforms with PLATFORM_COST_BASED pricing control
 *   - Platforms explicitly excluded in pricingRules
 *
 * Promotions are NOT excluded — they are tagged and used as elasticity signals.
 */
export function isEligibleTransaction(
    tx: PriceLog,
    pricingRules: PricingRules
): boolean {
    if (!tx.price || tx.price <= 0) return false;
    if (!tx.velocity || tx.velocity <= 0) return false;
    if (!tx.platform) return false;

    const platformConfig = pricingRules[tx.platform];
    if (platformConfig?.pricingControl === 'PLATFORM_COST_BASED') return false;
    if (platformConfig?.isExcluded) return false;

    return true;
}

// =============================================================================
// TRANSACTION TAGGING — ORGANIC VS PROMO
// =============================================================================

/**
 * Determines whether a transaction falls within an active promotion window.
 * Resolves promotion item SKUs to their canonical form so alias variants are
 * matched correctly against promo item lists.
 */
export function tagTransactionSource(
    tx: PriceLog,
    promotions: PromotionEvent[],
    canonicalSku: string,
    resolveCanonical: (sku: string) => string
): TransactionSource {
    const txDate = tx.date.split('T')[0];

    const isInPromo = promotions.some(promo => {
        if (promo.platform !== tx.platform) return false;
        if (txDate < promo.startDate || txDate > promo.endDate) return false;
        if (promo.promotionScope === 'SHOP') return true;
        // Match against canonical SKU to catch aliases in promo item lists
        return promo.items.some(item => resolveCanonical(item.sku) === canonicalSku);
    });

    return isInPromo ? 'promo' : 'organic';
}

// =============================================================================
// PRICE-POINT SEGMENTATION — CA PRICE ERAS
// =============================================================================

/**
 * Builds price eras from the CA price change log for a canonical SKU.
 * Each era represents a period during which the CA price was stable.
 * If no change events exist, a single era covering all history is returned.
 */
export function buildPriceEras(
    canonicalSku: string,
    priceChangeLog: PriceChangeRecord[],
    currentCaPrice: number,
    today: string,
    resolveCanonical: (sku: string) => string
): PriceEra[] {
    const events = priceChangeLog
        .filter(e => resolveCanonical(e.sku) === canonicalSku)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (events.length === 0) {
        return [{
            eraId: `${canonicalSku}-era-0`,
            sku: canonicalSku,
            caPrice: currentCaPrice,
            startDate: '2000-01-01',
            endDate: today,
        }];
    }

    return events.map((event, i) => ({
        eraId: `${canonicalSku}-era-${i}`,
        sku: canonicalSku,
        caPrice: event.newPrice,
        startDate: event.date,
        endDate: i + 1 < events.length ? dateBefore(events[i + 1].date) : today,
    }));
}

/**
 * Assigns a tagged transaction to the era whose date range covers the
 * transaction date. Returns null if no matching era is found (data gap).
 */
export function assignTransactionToEra(
    tx: PriceLog,
    eras: PriceEra[]
): PriceEra | null {
    const txDate = tx.date.split('T')[0];
    return eras.find(era => txDate >= era.startDate && txDate <= era.endDate) ?? null;
}

// =============================================================================
// VELOCITY CALCULATION
// =============================================================================

/**
 * Calculates median daily velocity from a set of transactions within a single era.
 * Aggregates units per ISO week, then takes the median weekly total ÷ 7.
 * Using the median rather than the mean suppresses spike weeks (promotions, etc).
 */
export function calculateVelocityWithinEra(
    transactions: TaggedTransaction[]
): number {
    const weeklyUnits = new Map<string, number>();
    transactions.forEach(tx => {
        const weekKey = getISOWeek(tx.date);
        weeklyUnits.set(weekKey, (weeklyUnits.get(weekKey) ?? 0) + tx.velocity);
    });

    if (weeklyUnits.size === 0) return 0;

    const sorted = Array.from(weeklyUnits.values()).sort((a, b) => a - b);
    const medianWeekly = sorted[Math.floor(sorted.length / 2)];
    return medianWeekly / 7; // median weekly → daily
}

// =============================================================================
// LAYER 1 HELPERS
// =============================================================================

/**
 * Groups promo transactions by the promotion event they belong to.
 * Returns a Map<promoId, TaggedTransaction[]>.
 */
function groupByPromotion(
    promoTx: TaggedTransaction[],
    promotions: PromotionEvent[],
    resolveCanonical: (sku: string) => string
): Map<string, TaggedTransaction[]> {
    const groups = new Map<string, TaggedTransaction[]>();

    promoTx.forEach(tx => {
        const txDate = tx.date.split('T')[0];
        const promo = promotions.find(p =>
            p.platform === tx.platform &&
            txDate >= p.startDate &&
            txDate <= p.endDate &&
            (
                p.promotionScope === 'SHOP' ||
                p.items.some(item => resolveCanonical(item.sku) === tx.canonicalSku)
            )
        );
        if (!promo) return;
        if (!groups.has(promo.id)) groups.set(promo.id, []);
        groups.get(promo.id)!.push(tx);
    });

    return groups;
}

/**
 * Returns the discount fraction (0.0–1.0) for a given promotion.
 * Falls back to 0 if the promotion is not found or has no discount value.
 */
function getPromoDiscount(promoId: string, promotions: PromotionEvent[]): number {
    const promo = promotions.find(p => p.id === promoId);
    if (!promo) return 0;

    // Use shopDiscountValue for SHOP-scope promos, otherwise look at items
    if (promo.promotionScope === 'SHOP' && promo.shopDiscountValue !== undefined) {
        if (promo.shopDiscountType === 'PERCENT_OFF') return promo.shopDiscountValue / 100;
        return 0;
    }

    // Fall back to discountPct if present (not in current PromotionEvent type,
    // but the spec references it — use 0 as safe default)
    return (promo as any).discountPct ?? 0;
}

/**
 * Counts the number of distinct ISO weeks represented in a transaction set.
 * Used as a data quality indicator in PricePoint.weekCount.
 */
export function countDistinctWeeks(txs: TaggedTransaction[]): number {
    return new Set(txs.map(tx => getISOWeek(tx.date))).size;
}

// =============================================================================
// LAYER 1: SKU-LEVEL PRICE-VELOCITY CURVE
// =============================================================================

/**
 * Builds an array of PricePoints from a canonical SKU's tagged transactions.
 * Each era produces up to two PricePoints — organic and promo (if promo
 * transactions exist in that era).
 *
 * @param canonicalSku      Canonical SKU identifier
 * @param taggedTransactions Transactions already tagged with eraId + source
 * @param eras              Price eras for this SKU
 * @param promotions        All promotion events (for grouping promo tx)
 * @param costs             Total per-unit costs (COGS + postage + fee + ads)
 * @param resolveCanonical  Alias resolver function
 */
export function buildPricePoints(
    canonicalSku: string,
    taggedTransactions: TaggedTransaction[],
    eras: PriceEra[],
    promotions: PromotionEvent[],
    costs: number,
    resolveCanonical: (sku: string) => string
): PricePoint[] {
    const points: PricePoint[] = [];

    for (const era of eras) {
        const eraTx = taggedTransactions.filter(tx => tx.eraId === era.eraId);

        // --- Organic point ---
        const organicTx = eraTx.filter(tx => tx.source === 'organic');
        if (organicTx.length > 0) {
            const velocity = calculateVelocityWithinEra(organicTx);
            const margin = era.caPrice - costs;
            points.push({
                price: era.caPrice,
                source: 'organic',
                eraId: era.eraId,
                totalUnits: organicTx.reduce((s, t) => s + t.velocity, 0),
                weekCount: countDistinctWeeks(organicTx),
                velocity,
                margin,
                dailyProfit: margin * velocity,
            });
        }

        // --- Promo point(s) ---
        // Group promo transactions by promotion event — different promos may
        // have different discount percentages so each becomes a separate point
        const promoTx = eraTx.filter(tx => tx.source === 'promo');
        const promoGroups = groupByPromotion(promoTx, promotions, resolveCanonical);

        for (const [promoId, promoGroup] of promoGroups) {
            if (promoGroup.length === 0) continue;
            const discountPct = getPromoDiscount(promoId, promotions);
            const promoPrice = era.caPrice * (1 - discountPct);
            const velocity = calculateVelocityWithinEra(promoGroup);
            const margin = promoPrice - costs;
            points.push({
                price: promoPrice,
                source: 'promo',
                eraId: era.eraId,
                totalUnits: promoGroup.reduce((s, t) => s + t.velocity, 0),
                weekCount: countDistinctWeeks(promoGroup),
                velocity,
                margin,
                dailyProfit: margin * velocity,
                promoDiscountPct: discountPct,
            });
        }
    }

    return points;
}

/**
 * Returns the PricePoint with the highest dailyProfit, or null if no points exist.
 * This is the SKU-level optimal before blending with the cohort.
 */
export function getSkuOptimalPrice(pricePoints: PricePoint[]): PricePoint | null {
    if (pricePoints.length === 0) return null;
    return pricePoints.reduce((best, p) => p.dailyProfit > best.dailyProfit ? p : best);
}

// =============================================================================
// LAYER 1: CONFIDENCE SCORE
// =============================================================================

/**
 * Calculates a confidence score (0.0–1.0) for the SKU-level recommendation.
 * Higher confidence → more weight given to SKU data vs cohort benchmark.
 *
 * Factors:
 *   - Total eligible transaction count vs CONFIDENCE_THRESHOLD (30)
 *   - Number of distinct observed price points
 *     - ≤1 price point caps confidence at 0.3 (insufficient curve shape)
 *     - ≥3 price points gets a 1.2× boost
 */
export function skuConfidence(pricePoints: PricePoint[], totalEligibleTx: number): number {
    if (totalEligibleTx === 0) return 0;

    const distinctPrices = new Set(pricePoints.map(p => p.price)).size;
    let base = Math.min(1.0, totalEligibleTx / CONFIDENCE_THRESHOLD);

    if (distinctPrices <= 1) base = Math.min(base, 0.3);
    if (distinctPrices >= 3) base = Math.min(1.0, base * 1.2);

    return base;
}

// =============================================================================
// LAYER 3: GUARDRAILS
// =============================================================================

interface GuardrailResult {
    price: number;
    wasConstrained: boolean;
    constraintReason?: string;
}

/**
 * Applies business guardrails to the blended price recommendation:
 *   1. Minimum margin floor (per category, from pricingRules or fallback)
 *   2. Maximum price ceiling (caPrice × MAX_PRICE_MULTIPLIER)
 *   3. Minimum price floor (totalCosts × MIN_MARKUP_OVER_COST)
 *
 * Returns the (possibly adjusted) price and reason if constrained.
 */
export function applyGuardrails(
    price: number,
    sku: Product,
    costs: number,
    categoryMinMarginPct: number
): GuardrailResult {
    const caPrice = sku.caPrice ?? sku.currentPrice ?? 0;
    let result = price;
    let wasConstrained = false;
    let constraintReason: string | undefined;

    // Floor: minimum markup over total cost
    const costFloor = costs * MIN_MARKUP_OVER_COST;
    if (result < costFloor && costFloor > 0) {
        result = costFloor;
        wasConstrained = true;
        constraintReason = `Below minimum cost markup (${Math.round((MIN_MARKUP_OVER_COST - 1) * 100)}% over costs)`;
    }

    // Floor: category minimum margin
    if (categoryMinMarginPct > 0) {
        // Margin % = (price - costs) / price — rearranged: price = costs / (1 - minMarginPct)
        const marginFloor = costs / (1 - categoryMinMarginPct / 100);
        if (result < marginFloor && marginFloor > 0) {
            result = marginFloor;
            wasConstrained = true;
            const category = sku.category ?? 'this category';
            constraintReason = `Below ${category} category minimum margin (${categoryMinMarginPct}%)`;
        }
    }

    // Ceiling: maximum price vs CA price
    if (caPrice > 0) {
        const ceiling = caPrice * MAX_PRICE_MULTIPLIER;
        if (result > ceiling) {
            result = ceiling;
            wasConstrained = true;
            constraintReason = `Exceeds maximum price ceiling (${MAX_PRICE_MULTIPLIER}× CA price)`;
        }
    }

    return {
        price: result,
        wasConstrained,
        constraintReason,
    };
}

/**
 * Rounds a price to the nearest £X.99 psychological price point.
 * e.g. £108.34 → £107.99, £12.10 → £11.99
 */
export function snapTo99(price: number): number {
    if (price <= 0) return price;
    const floor = Math.floor(price);
    const candidate = floor - 0.01; // e.g. £108 → £107.99
    return candidate > 0 ? candidate : price;
}

// =============================================================================
// REASONING — FULL SPECIFICATION
// =============================================================================

/**
 * Builds a human-readable reasoning string for an OptimalPriceResult.
 * Covers: alias merges, transaction count, best observed price-profit,
 * confidence level + blend weights, any guardrail applied, and final delta.
 */
export function buildReasoning(
    sku: Product,
    pricePoints: PricePoint[],
    cohort: CohortStats,
    confidence: number,
    source: 'SKU_DATA' | 'BLENDED' | 'COHORT' | 'GUARDRAIL',
    finalPrice: number,
    wasConstrained: boolean,
    constraintReason?: string,
    aliasesUsed?: string[],
): string {
    const parts: string[] = [];
    const currentPrice = sku.caPrice ?? sku.currentPrice;
    const organicPoints = pricePoints.filter(p => p.source === 'organic');
    const promoPoints = pricePoints.filter(p => p.source === 'promo');
    const totalTx = pricePoints.reduce((s, p) => s + p.totalUnits, 0);
    const bestPoint = pricePoints.length > 0
        ? pricePoints.reduce((a, b) => b.dailyProfit > a.dailyProfit ? b : a)
        : null;

    // 1. Data summary — alias merge notice
    if (aliasesUsed && aliasesUsed.length > 0) {
        parts.push(
            `Sales history merged from ${aliasesUsed.length + 1} SKU aliases (${aliasesUsed.join(', ')}).`
        );
    }

    // 1b. Transaction / price point count
    if (pricePoints.length === 0) {
        parts.push(`${sku.sku} has no eligible sales history.`);
    } else {
        const ptDesc = [
            organicPoints.length > 0
                ? `${organicPoints.length} organic price point${organicPoints.length > 1 ? 's' : ''}`
                : null,
            promoPoints.length > 0
                ? `${promoPoints.length} promo price point${promoPoints.length > 1 ? 's' : ''}`
                : null,
        ].filter(Boolean).join(' and ');
        parts.push(`${sku.sku} has ${totalTx} eligible transactions across ${ptDesc}.`);
    }

    // 2. What the data showed
    if (bestPoint && source !== 'COHORT') {
        const priceLabel = bestPoint.source === 'promo'
            ? `£${bestPoint.price.toFixed(2)} (${Math.round((bestPoint.promoDiscountPct ?? 0) * 100)}%-off promo)`
            : `£${bestPoint.price.toFixed(2)} (organic)`;
        parts.push(
            `${priceLabel} produced the highest daily profit: £${bestPoint.dailyProfit.toFixed(2)}/day ` +
            `(${bestPoint.velocity.toFixed(2)} units/day × £${bestPoint.margin.toFixed(2)} margin).`
        );
    }

    // 3. Confidence & blending
    const confidencePct = Math.round(confidence * 100);
    if (source === 'SKU_DATA') {
        parts.push(`Confidence: High (${confidencePct}%) — recommendation driven by this SKU's own data.`);
    } else if (source === 'BLENDED') {
        parts.push(
            `Confidence: Moderate (${confidencePct}%) — recommendation blends SKU data (${confidencePct}% weight) ` +
            `with ${cohort.category} · ${cohort.bucket.label} cohort benchmark (${100 - confidencePct}% weight).`
        );
    } else if (source === 'COHORT') {
        parts.push(
            `Confidence: Low (${confidencePct}%) — insufficient SKU data. ` +
            `Recommendation based on ${cohort.skuCount} similar SKUs in ` +
            `${cohort.category} · ${cohort.bucket.label} ` +
            `(median margin ${cohort.medianMarginPct.toFixed(1)}%, ` +
            `median velocity ${cohort.medianVelocity.toFixed(2)}/day).`
        );
    } else if (source === 'GUARDRAIL') {
        parts.push(`Confidence: ${confidencePct}% — recommendation constrained by guardrail.`);
    }

    // 4. Guardrail explanation (if applied)
    if (wasConstrained && constraintReason) {
        parts.push(
            `⚠ Profit-maximising price was adjusted: ${constraintReason}. ` +
            `Final price: £${finalPrice.toFixed(2)}.`
        );
    }

    // 5. Price change direction
    const delta = finalPrice - currentPrice;
    if (Math.abs(delta) >= 0.01) {
        const direction = delta > 0 ? 'increase' : 'decrease';
        const pct = Math.abs((delta / currentPrice) * 100).toFixed(1);
        parts.push(
            `Recommended ${direction}: £${currentPrice.toFixed(2)} → £${finalPrice.toFixed(2)} ` +
            `(${delta > 0 ? '+' : ''}${delta.toFixed(2)}, ${pct}%).`
        );
    } else {
        parts.push(`Current price £${currentPrice.toFixed(2)} is already optimal.`);
    }

    return parts.join(' ');
}

// =============================================================================
// MAIN ENTRY POINT — calculateOptimalPrice
// =============================================================================

export interface CalculateOptimalPriceOptions {
    sku: Product;
    priceHistory: PriceLog[];
    priceChangeLog: PriceChangeRecord[];
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    cohortSnapshot: CohortSnapshot;
    learnedAliases: Record<string, string>;
    /** ISO date string for today, defaults to new Date() */
    today?: string;
    /** Category minimum margin % — falls back to 0 if not provided */
    categoryMinMarginPct?: number;
}

/**
 * Main entry point. Calculates the optimal price for a single SKU by running
 * all three layers and returning a fully populated OptimalPriceResult.
 *
 * Call this once per SKU. For bulk calculation, call in a loop.
 */
export function calculateOptimalPrice(options: CalculateOptimalPriceOptions): OptimalPriceResult {
    const {
        sku,
        priceHistory,
        priceChangeLog,
        promotions,
        pricingRules,
        cohortSnapshot,
        learnedAliases,
        today = new Date().toISOString().split('T')[0],
        categoryMinMarginPct = 0,
    } = options;

    const resolveCanonical = buildCanonicalResolver(learnedAliases);
    const canonicalSku = resolveCanonical(sku.sku);
    const costs = getSkuCosts(sku);
    const currentPrice = sku.caPrice ?? sku.currentPrice ?? 0;

    // --- Identify aliases merged into this canonical SKU ---
    const aliasesUsed: string[] = priceHistory
        .map(tx => tx.rawSku ?? tx.sku)
        .filter(raw => {
            const resolved = resolveCanonical(raw);
            return resolved === canonicalSku && raw !== canonicalSku;
        })
        .filter((raw, i, arr) => arr.indexOf(raw) === i); // deduplicate

    // --- Filter eligible transactions ---
    const eligibleTx = priceHistory.filter(tx => isEligibleTransaction(tx, pricingRules));
    const totalEligibleTx = eligibleTx.length;

    // --- Build price eras ---
    const eras = buildPriceEras(canonicalSku, priceChangeLog, currentPrice, today, resolveCanonical);

    // --- Tag and assign transactions ---
    const tagged: TaggedTransaction[] = [];
    for (const tx of eligibleTx) {
        const txCanonical = resolveCanonical(tx.sku);
        if (txCanonical !== canonicalSku) continue;

        const era = assignTransactionToEra(tx, eras);
        if (!era) continue;

        const source = tagTransactionSource(tx, promotions, canonicalSku, resolveCanonical);

        tagged.push({
            ...tx,
            canonicalSku,
            rawSku: tx.rawSku ?? tx.sku,
            source,
            effectivePrice: tx.price,
            eraId: era.eraId,
        });
    }

    // --- Layer 1: Build price points ---
    const pricePoints = buildPricePoints(
        canonicalSku,
        tagged,
        eras,
        promotions,
        costs,
        resolveCanonical
    );

    // --- Layer 1: SKU optimal ---
    const skuBestPoint = getSkuOptimalPrice(pricePoints);
    const skuOptimal = skuBestPoint?.price ?? null;

    // --- Confidence score ---
    const confidence = skuConfidence(pricePoints, totalEligibleTx);

    // --- Layer 2: Cohort optimal ---
    const cohortOptimalPrice = getCohortOptimalPrice(sku, cohortSnapshot);

    // --- Blending ---
    let blendedPrice: number;
    let source: 'SKU_DATA' | 'BLENDED' | 'COHORT';

    if (skuOptimal === null) {
        blendedPrice = cohortOptimalPrice;
        source = 'COHORT';
    } else if (confidence >= 0.9) {
        blendedPrice = skuOptimal;
        source = 'SKU_DATA';
    } else {
        blendedPrice = confidence * skuOptimal + (1 - confidence) * cohortOptimalPrice;
        source = confidence < 0.3 ? 'COHORT' : 'BLENDED';
    }

    // --- Layer 3: Guardrails ---
    const guardrailResult = applyGuardrails(blendedPrice, sku, costs, categoryMinMarginPct);
    const constrainedSource: 'SKU_DATA' | 'BLENDED' | 'COHORT' | 'GUARDRAIL' =
        guardrailResult.wasConstrained ? 'GUARDRAIL' : source;

    // --- Snap to £X.99 ---
    const recommendedPrice = snapTo99(guardrailResult.price);

    // --- Cohort context for output ---
    // Resolve the CohortStats for this SKU's bucket
    const bucketKey = cohortSnapshot.skuAssignments.get(canonicalSku) ?? '';
    const cohortStats = cohortSnapshot.cohortStats.get(bucketKey);

    const cohortContext: OptimalPriceResult['cohort'] = cohortStats
        ? {
            category: cohortStats.category,
            bucket: cohortStats.bucket.label,
            skusInBucket: cohortStats.skuCount,
            medianMarginPct: cohortStats.medianMarginPct,
            medianVelocity: cohortStats.medianVelocity,
            elasticity: cohortStats.priceElasticity,
        }
        : {
            category: sku.category ?? 'Unknown',
            bucket: 'Unknown',
            skusInBucket: 0,
            medianMarginPct: 0,
            medianVelocity: 0,
            elasticity: DEFAULT_ELASTICITY,
        };

    // --- Expected impact ---
    const currentMargin = currentPrice - costs;
    const currentDailyProfit = skuBestPoint
        ? (pricePoints.find(p => p.price === currentPrice)?.dailyProfit ?? currentMargin * (sku.averageDailySales ?? 0))
        : 0;

    const bestAtRecommended = pricePoints.find(p => Math.abs(p.price - recommendedPrice) < 0.5);
    const expectedDailyProfit = bestAtRecommended
        ? bestAtRecommended.dailyProfit
        : (recommendedPrice - costs) * (sku.averageDailySales ?? 0);

    const profitUplift = currentDailyProfit > 0
        ? ((expectedDailyProfit - currentDailyProfit) / currentDailyProfit) * 100
        : 0;

    const recommendedMarginPct = currentPrice > 0 ? ((recommendedPrice - costs) / recommendedPrice) * 100 : 0;
    const currentMarginPct = currentPrice > 0 ? ((currentMargin) / currentPrice) * 100 : 0;

    // --- Reasoning ---
    const reasoning = buildReasoning(
        sku,
        pricePoints,
        cohortStats ?? {
            bucketKey,
            category: cohortContext.category,
            bucket: { category: cohortContext.category, bucketIndex: 0, priceMin: 0, priceMax: 0, label: cohortContext.bucket, skuCount: 0 },
            skuCount: cohortContext.skusInBucket,
            totalEligibleTx,
            medianVelocity: cohortContext.medianVelocity,
            medianMarginPct: cohortContext.medianMarginPct,
            priceElasticity: cohortContext.elasticity,
            optimalPriceRatio: 1,
            optimalDailyProfit: 0,
        },
        confidence,
        constrainedSource,
        recommendedPrice,
        guardrailResult.wasConstrained,
        guardrailResult.constraintReason,
        aliasesUsed.length > 0 ? aliasesUsed : undefined,
    );

    // --- Warnings ---
    const warnings: string[] = [];
    if (totalEligibleTx < 5) {
        warnings.push('Very few eligible transactions — recommendation may be unreliable.');
    }
    if (pricePoints.some(p => p.weekCount < 2)) {
        warnings.push('One or more price points observed for less than 2 weeks — velocity estimate may be volatile.');
    }
    if (aliasesUsed.length > 0) {
        warnings.push(`Data merged from ${aliasesUsed.length} alias SKU(s): ${aliasesUsed.join(', ')}.`);
    }

    return {
        sku: canonicalSku,
        currentPrice,
        recommendedPrice,
        confidence,
        source: constrainedSource,
        currentDailyProfit,
        expectedDailyProfit,
        profitUplift,
        expectedVelocityChange: 0, // velocity delta requires cohort curve projection — see cohortAnalysis
        expectedMarginChange: recommendedMarginPct - currentMarginPct,
        cohort: cohortContext,
        skuPricePoints: pricePoints,
        organicPointCount: pricePoints.filter(p => p.source === 'organic').length,
        promoPointCount: pricePoints.filter(p => p.source === 'promo').length,
        aliasesUsed,
        reasoning,
        wasConstrained: guardrailResult.wasConstrained,
        constraintReason: guardrailResult.constraintReason,
        calculatedAt: new Date().toISOString(),
        warnings,
    };
}

// getCohortOptimalPrice is fully implemented in cohortAnalysis.ts (Session 2)
// and imported at the top of this file.
