/**
 * cohortAnalysis.ts
 *
 * Layer 2 — Cohort / Price Benchmark Service.
 *
 * Responsibilities:
 *   - Group products by category into log-scale price buckets
 *   - Compute cohort stats (median velocity, margin %, elasticity) per bucket
 *   - Estimate a cohort-level optimal price for SKUs with insufficient own data
 *   - Detect when benchmarks need rebuilding after an import
 *   - Produce CohortSnapshot for persistence and downstream blending
 */

import {
    Product,
    PriceBucket,
    CohortStats,
    CohortSnapshot,
    PricePoint,
    BenchmarkUpdateNotice,
} from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_ELASTICITY = -2.0;
const MIN_SKUS_PER_BUCKET = 3;      // buckets with fewer SKUs are merged
const COHORT_RELIABLE_SKU_MIN = 3;  // minimum SKUs to trust elasticity estimate
const PRICE_SEARCH_STEPS = 100;     // granularity of cohort optimal price search

// =============================================================================
// EXPORTED TYPES
// =============================================================================

export interface CohortShiftWarning {
    sku: string;
    oldBucket: string;
    newBucket: string;
    category: string;
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Returns the median value of a numeric array.
 * Returns 0 for empty arrays.
 */
function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Generates a human-readable label for a price bucket range.
 * e.g. priceMin=80, priceMax=120 → "£80–120"
 */
function bucketLabel(priceMin: number, priceMax: number): string {
    return `£${Math.round(priceMin)}–${Math.round(priceMax)}`;
}

/**
 * Returns the CA price for a product, falling back to currentPrice.
 */
function getProductPrice(p: Product): number {
    return p.caPrice ?? p.currentPrice ?? 0;
}

/**
 * Returns per-unit total cost for a product.
 */
function getProductCosts(p: Product): number {
    const cogs = p.costPrice ?? p.costDetail?.cogs ?? 0;
    const postage = p.postage ?? p.costDetail?.postage ?? 0;
    const fee = p.sellingFee ?? p.costDetail?.sellingFee ?? 0;
    const ads = p.adsFee ?? p.costDetail?.adsFee ?? 0;
    return cogs + postage + fee + ads;
}

// =============================================================================
// 1. BUCKET HELPERS
// =============================================================================

/**
 * Merges any bucket with fewer than `minSkus` SKUs into its nearest neighbour
 * (the adjacent bucket with the smaller skuCount). Repeats until all buckets
 * meet the threshold or only one bucket remains.
 *
 * After each merge, bucketIndex values are re-assigned from 0.
 */
function mergeThinBuckets(buckets: PriceBucket[], minSkus: number): PriceBucket[] {
    let result = [...buckets];

    while (result.length > 1) {
        const thinIdx = result.findIndex(b => b.skuCount < minSkus);
        if (thinIdx === -1) break; // all buckets satisfy threshold

        // Find the adjacent bucket with the smaller skuCount
        const candidates: Array<{ idx: number; count: number }> = [];
        if (thinIdx > 0) candidates.push({ idx: thinIdx - 1, count: result[thinIdx - 1].skuCount });
        if (thinIdx < result.length - 1) candidates.push({ idx: thinIdx + 1, count: result[thinIdx + 1].skuCount });

        // Pick the neighbour with fewer SKUs (absorbs less data, more conservative merge)
        const neighbour = candidates.reduce((a, b) => b.count < a.count ? b : a);
        const mergeIdx = neighbour.idx;

        // Merge thinIdx into mergeIdx — combined bucket spans both price ranges
        const lo = Math.min(thinIdx, mergeIdx);
        const hi = Math.max(thinIdx, mergeIdx);
        const merged: PriceBucket = {
            category: result[lo].category,
            bucketIndex: lo,
            priceMin: result[lo].priceMin,
            priceMax: result[hi].priceMax,
            label: bucketLabel(result[lo].priceMin, result[hi].priceMax),
            skuCount: result[lo].skuCount + result[hi].skuCount,
        };

        // Splice out both originals, insert merged
        result.splice(lo, 2, merged);

        // Re-index
        result = result.map((b, i) => ({ ...b, bucketIndex: i }));
    }

    return result;
}

// =============================================================================
// 2. BUILD PRICE BUCKETS
// =============================================================================

/**
 * Groups products by category, then divides each category into log-scale
 * price buckets using quantile boundaries. Thin buckets (< MIN_SKUS_PER_BUCKET)
 * are merged into neighbours.
 *
 * When resolveCanonical is provided, alias variants are collapsed to their
 * canonical SKU before bucketing so duplicates don't inflate bucket counts.
 * The returned map is keyed by category; bucket skuCount reflects distinct
 * canonical SKUs only.
 *
 * @param products           Full product catalogue
 * @param bucketsPerCategory Target number of buckets per category (default 4)
 * @param resolveCanonical   Optional alias resolver — collapses variants
 * @returns Map<category, PriceBucket[]>
 */
export function buildPriceBuckets(
    products: Product[],
    bucketsPerCategory = 4,
    resolveCanonical?: (sku: string) => string
): Map<string, PriceBucket[]> {
    const result = new Map<string, PriceBucket[]>();

    // De-duplicate by canonical SKU — keep the first product seen per canonical
    const seen = new Set<string>();
    const deduped: Product[] = [];
    for (const p of products) {
        const key = resolveCanonical ? resolveCanonical(p.sku) : p.sku;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(p);
    }

    // Group de-duped products by category, filtering those with a valid price
    const byCategory = new Map<string, Product[]>();
    for (const p of deduped) {
        const cat = p.category ?? 'Uncategorised';
        const price = getProductPrice(p);
        if (price <= 0) continue;
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(p);
    }

    for (const [category, catProducts] of byCategory) {
        const prices = catProducts.map(getProductPrice).sort((a, b) => a - b);

        if (prices.length === 0) continue;

        const logPrices = prices.map(p => Math.log(p));
        const logMin = logPrices[0];
        const logMax = logPrices[logPrices.length - 1];

        // Number of buckets — can't exceed number of distinct prices
        const numBuckets = Math.min(bucketsPerCategory, new Set(prices).size);

        let boundaries: number[];
        if (logMin === logMax || numBuckets <= 1) {
            // All products at same price — single bucket
            boundaries = [prices[0], prices[prices.length - 1]];
        } else {
            // Log-scale quantile boundaries: evenly spaced in log space
            boundaries = [];
            for (let i = 0; i <= numBuckets; i++) {
                const t = i / numBuckets;
                const logBoundary = logMin + t * (logMax - logMin);
                boundaries.push(Math.exp(logBoundary));
            }
            // Ensure exact min/max
            boundaries[0] = prices[0];
            boundaries[numBuckets] = prices[prices.length - 1];
        }

        // Assign each product to a bucket
        const rawBuckets: PriceBucket[] = [];
        for (let i = 0; i < boundaries.length - 1; i++) {
            const priceMin = boundaries[i];
            const priceMax = boundaries[i + 1];
            const isLast = i === boundaries.length - 2;

            const count = catProducts.filter(p => {
                const price = getProductPrice(p);
                return isLast
                    ? price >= priceMin && price <= priceMax
                    : price >= priceMin && price < priceMax;
            }).length;

            rawBuckets.push({
                category,
                bucketIndex: i,
                priceMin,
                priceMax,
                label: bucketLabel(priceMin, priceMax),
                skuCount: count,
            });
        }

        // Remove empty buckets before merging, then merge thin ones
        const nonEmpty = rawBuckets
            .filter(b => b.skuCount > 0)
            .map((b, i) => ({ ...b, bucketIndex: i }));
        const merged = mergeThinBuckets(nonEmpty, MIN_SKUS_PER_BUCKET);

        result.set(category, merged);
    }

    return result;
}

// =============================================================================
// 3. ELASTICITY ESTIMATION
// =============================================================================

/**
 * Estimates price elasticity of demand for a cohort by pairing SKUs within
 * the bucket and computing point elasticity: (ΔV/ΔP) × (avgP / avgV).
 *
 * Requires at least COHORT_RELIABLE_SKU_MIN SKUs with valid price/velocity.
 * Falls back to DEFAULT_ELASTICITY (-2.0) if insufficient data.
 * Result is clamped to [-5.0, -0.5].
 */
function estimateElasticity(
    skusInBucket: Product[],
    allPricePoints: Map<string, PricePoint[]>
): number {
    // Build (price, velocity) observations using organic price points
    const observations: Array<{ price: number; velocity: number }> = [];

    for (const p of skusInBucket) {
        const price = getProductPrice(p);
        if (price <= 0) continue;

        const points = allPricePoints.get(p.sku) ?? [];
        const organicPoints = points.filter(pt => pt.source === 'organic');

        if (organicPoints.length === 0) {
            const vel = p.averageDailySales ?? p.dailyAverageSales ?? 0;
            if (vel > 0) observations.push({ price, velocity: vel });
        } else {
            const vel = median(organicPoints.map(pt => pt.velocity));
            if (vel > 0) observations.push({ price, velocity: vel });
        }
    }

    if (observations.length < COHORT_RELIABLE_SKU_MIN) return DEFAULT_ELASTICITY;

    // All pairs (i, j) — compute point elasticity for each pair
    const elasticities: number[] = [];
    for (let i = 0; i < observations.length; i++) {
        for (let j = i + 1; j < observations.length; j++) {
            const deltaP = observations[j].price - observations[i].price;
            const deltaV = observations[j].velocity - observations[i].velocity;
            if (Math.abs(deltaP) < 0.01) continue;

            const avgP = (observations[i].price + observations[j].price) / 2;
            const avgV = (observations[i].velocity + observations[j].velocity) / 2;
            if (avgV === 0) continue;

            elasticities.push((deltaV / deltaP) * (avgP / avgV));
        }
    }

    if (elasticities.length === 0) return DEFAULT_ELASTICITY;

    const raw = median(elasticities);
    return Math.max(-5.0, Math.min(-0.5, raw));
}

// =============================================================================
// 4. COHORT OPTIMAL PRICE
// =============================================================================

/**
 * Returns the cohort-benchmark optimal price for a given SKU.
 *
 * Resolves the SKU to its canonical form before looking up the bucket
 * assignment so alias variants (e.g. BF1071-K-DG-UK_1) correctly map to
 * the same cohort as their canonical SKU (BF1071-K-DG-UK).
 *
 * Used by optimalPriceEngine.ts as the Layer 2 input to blending.
 *
 * @param sku               Product whose optimal price is being calculated
 * @param cohortSnapshot    Current snapshot containing bucket assignments
 * @param resolveCanonical  Alias resolver from buildCanonicalResolver()
 */
export function getCohortOptimalPrice(
    sku: Product,
    cohortSnapshot: CohortSnapshot,
    resolveCanonical?: (sku: string) => string
): number {
    const canonicalSku = resolveCanonical ? resolveCanonical(sku.sku) : sku.sku;
    const bucketKey = cohortSnapshot.skuAssignments.get(canonicalSku);
    const cohortStats = bucketKey ? cohortSnapshot.cohortStats.get(bucketKey) : undefined;

    if (!cohortStats) return sku.caPrice ?? sku.currentPrice ?? 0;

    return getCohortOptimalPriceFromStats(cohortStats, sku);
}

/**
 * Inner function: scans a price range to find the price that maximises
 * daily profit using the cohort demand curve.
 *
 * Velocity projection: V(p) = medianVelocity × max(0, 1 + ε × (p − mid) / mid)
 * where ε = priceElasticity and mid = bucket midpoint price.
 */
function getCohortOptimalPriceFromStats(cohort: CohortStats, sku: Product): number {
    const costs = getProductCosts(sku);
    const bucketMid = (cohort.bucket.priceMin + cohort.bucket.priceMax) / 2;
    const baseVelocity = cohort.medianVelocity;
    const elasticity = cohort.priceElasticity;

    if (baseVelocity <= 0 || bucketMid <= 0) {
        return sku.caPrice ?? sku.currentPrice ?? bucketMid;
    }

    const searchMin = Math.max(costs * 1.01, cohort.bucket.priceMin * 0.7);
    const searchMax = cohort.bucket.priceMax * 1.5;
    const step = (searchMax - searchMin) / PRICE_SEARCH_STEPS;

    let bestPrice = sku.caPrice ?? sku.currentPrice ?? bucketMid;
    let bestProfit = -Infinity;

    for (let i = 0; i <= PRICE_SEARCH_STEPS; i++) {
        const testPrice = searchMin + i * step;
        const margin = testPrice - costs;
        if (margin <= 0) continue;

        const velocityFactor = 1 + elasticity * ((testPrice - bucketMid) / bucketMid);
        const estimatedVelocity = baseVelocity * Math.max(0, velocityFactor);
        const dailyProfit = margin * estimatedVelocity;

        if (dailyProfit > bestProfit) {
            bestProfit = dailyProfit;
            bestPrice = testPrice;
        }
    }

    return bestPrice;
}

// =============================================================================
// 5. COMPUTE COHORT STATS (single bucket)
// =============================================================================

/**
 * Computes full CohortStats for a single PriceBucket.
 *
 * allPricePoints is keyed by canonical SKU. Products in skusInBucket are
 * looked up by their canonical form so alias variants share price points.
 *
 * @param bucket            The bucket definition (category, price range, skuCount)
 * @param skusInBucket      Products assigned to this bucket (canonical reps only)
 * @param allPricePoints    Map canonicalSku → PricePoint[] (from Layer 1)
 */
export function computeCohortStats(
    bucket: PriceBucket,
    skusInBucket: Product[],
    allPricePoints: Map<string, PricePoint[]>,
): CohortStats {
    const bucketKey = `${bucket.category}::${bucket.label}`;

    // Median velocity — median of each SKU's best organic velocity
    const skuVelocities: number[] = [];
    for (const p of skusInBucket) {
        const points = allPricePoints.get(p.sku) ?? [];
        const organicVelocities = points
            .filter(pt => pt.source === 'organic')
            .map(pt => pt.velocity);

        if (organicVelocities.length > 0) {
            skuVelocities.push(median(organicVelocities));
        } else {
            const v = p.averageDailySales ?? p.dailyAverageSales ?? 0;
            if (v > 0) skuVelocities.push(v);
        }
    }

    // Median margin % at current CA price
    const skuMarginPcts: number[] = [];
    for (const p of skusInBucket) {
        const price = getProductPrice(p);
        const costs = getProductCosts(p);
        if (price > 0) {
            skuMarginPcts.push(((price - costs) / price) * 100);
        }
    }

    // Total eligible transactions in this bucket
    const totalEligibleTx = skusInBucket.reduce((sum, p) => {
        const points = allPricePoints.get(p.sku) ?? [];
        return sum + points.reduce((s, pt) => s + pt.totalUnits, 0);
    }, 0);

    const priceElasticity = estimateElasticity(skusInBucket, allPricePoints);
    const medianVelocity = median(skuVelocities);
    const medianMarginPct = median(skuMarginPcts);

    // Build stats object first (needed to call getCohortOptimalPriceFromStats)
    const stats: CohortStats = {
        bucketKey,
        category: bucket.category,
        bucket,
        skuCount: skusInBucket.length,
        totalEligibleTx,
        medianVelocity,
        medianMarginPct,
        priceElasticity,
        optimalPriceRatio: 1.0,
        optimalDailyProfit: 0,
    };

    // Compute optimalPriceRatio and optimalDailyProfit using representative SKU
    const repSku = skusInBucket[0];
    if (repSku) {
        const optPrice = getCohortOptimalPriceFromStats(stats, repSku);
        const bucketMid = (bucket.priceMin + bucket.priceMax) / 2;
        stats.optimalPriceRatio = bucketMid > 0 ? optPrice / bucketMid : 1.0;

        const repCosts = getProductCosts(repSku);
        const margin = optPrice - repCosts;
        if (margin > 0 && bucketMid > 0) {
            const velocityFactor = 1 + priceElasticity * ((optPrice - bucketMid) / bucketMid);
            stats.optimalDailyProfit = margin * medianVelocity * Math.max(0, velocityFactor);
        }
    }

    return stats;
}

// =============================================================================
// 6. COMPUTE ALL COHORT STATS
// =============================================================================

/**
 * Builds price buckets for all categories, computes CohortStats per bucket,
 * assigns each SKU to its bucket, and returns a complete CohortSnapshot.
 *
 * When resolveCanonical is provided:
 *   - Alias variants are collapsed before bucketing (buildPriceBuckets)
 *   - skuAssignments maps canonical SKUs → bucketKey, so alias variants
 *     correctly resolve to the same bucket during blending
 *
 * @param products           Full product catalogue
 * @param allPricePoints     Map canonicalSku → PricePoint[] from current data
 * @param bucketsPerCategory Target number of buckets per category (default 4)
 * @param resolveCanonical   Optional alias resolver from buildCanonicalResolver()
 */
export function computeAllCohortStats(
    products: Product[],
    allPricePoints: Map<string, PricePoint[]>,
    bucketsPerCategory = 4,
    resolveCanonical?: (sku: string) => string
): CohortSnapshot {
    const categoryBuckets = buildPriceBuckets(products, bucketsPerCategory, resolveCanonical);
    const cohortStats = new Map<string, CohortStats>();
    const skuAssignments = new Map<string, string>();

    for (const [category, buckets] of categoryBuckets) {
        // Work with canonical-de-duped products for this category
        const seen = new Set<string>();
        const catProducts = products.filter(p => {
            const cat = p.category ?? 'Uncategorised';
            if (cat !== category) return false;
            const canonical = resolveCanonical ? resolveCanonical(p.sku) : p.sku;
            if (seen.has(canonical)) return false;
            seen.add(canonical);
            return true;
        });

        for (let bi = 0; bi < buckets.length; bi++) {
            const bucket = buckets[bi];
            const isLast = bi === buckets.length - 1;

            const skusInBucket = catProducts.filter(p => {
                const price = getProductPrice(p);
                return isLast
                    ? price >= bucket.priceMin && price <= bucket.priceMax
                    : price >= bucket.priceMin && price < bucket.priceMax;
            });

            if (skusInBucket.length === 0) continue;

            // Re-key skusInBucket by canonical SKU for price-point lookup
            const canonicalSkusInBucket = skusInBucket.map(p => ({
                ...p,
                sku: resolveCanonical ? resolveCanonical(p.sku) : p.sku,
            }));

            const bucketKey = `${category}::${bucket.label}`;
            const stats = computeCohortStats(bucket, canonicalSkusInBucket, allPricePoints);
            cohortStats.set(bucketKey, stats);

            // Assign CANONICAL SKU → bucketKey so alias variants are covered
            for (const p of skusInBucket) {
                const canonical = resolveCanonical ? resolveCanonical(p.sku) : p.sku;
                skuAssignments.set(canonical, bucketKey);
            }
        }
    }

    return {
        computedAt: new Date().toISOString(),
        categoryBuckets,
        cohortStats,
        skuAssignments,
        version: 1,
    };
}

// =============================================================================
// 7. DETECT BENCHMARK SHIFTS
// =============================================================================

/**
 * Compares two snapshots to find SKUs that moved from one price bucket to
 * another after a rebuild. Returns one CohortShiftWarning per affected SKU.
 */
export function detectBenchmarkShifts(
    oldSnapshot: CohortSnapshot,
    newSnapshot: CohortSnapshot
): CohortShiftWarning[] {
    const warnings: CohortShiftWarning[] = [];

    for (const [sku, newBucketKey] of newSnapshot.skuAssignments) {
        const oldBucketKey = oldSnapshot.skuAssignments.get(sku);
        if (!oldBucketKey) continue;        // new SKU — not a shift
        if (oldBucketKey === newBucketKey) continue; // unchanged

        const category = newBucketKey.split('::')[0] ?? 'Unknown';
        warnings.push({
            sku,
            oldBucket: oldBucketKey.split('::')[1] ?? oldBucketKey,
            newBucket: newBucketKey.split('::')[1] ?? newBucketKey,
            category,
        });
    }

    return warnings;
}

// =============================================================================
// 8. DETECT BENCHMARK UPDATE NEEDED
// =============================================================================

/**
 * Called from the import flow. Checks whether any category needs a benchmark
 * rebuild after new transaction data arrives.
 *
 * Detection rules:
 *   1. New SKU — a canonical SKU in newlyImportedSkus has no entry in snapshot.skuAssignments
 *   2. Price bucket shift — a SKU's current caPrice now falls outside its recorded bucket
 *
 * Returns one BenchmarkUpdateNotice per affected category (deduplicated,
 * skuCount = total affected SKUs in that category).
 */
export function detectBenchmarkUpdateNeeded(
    products: Product[],
    snapshot: CohortSnapshot,
    newlyImportedSkus: string[]
): BenchmarkUpdateNotice[] {
    // category → { reason, skuCount }
    const affected = new Map<string, { reason: BenchmarkUpdateNotice['reason']; skuCount: number }>();

    const bump = (category: string, reason: BenchmarkUpdateNotice['reason']) => {
        const existing = affected.get(category);
        if (!existing) {
            affected.set(category, { reason, skuCount: 1 });
        } else {
            affected.set(category, { reason: existing.reason, skuCount: existing.skuCount + 1 });
        }
    };

    // Rule 1: New SKU not yet in snapshot
    const productMap = new Map<string, Product>(products.map(p => [p.sku, p]));
    for (const canonicalSku of newlyImportedSkus) {
        if (!snapshot.skuAssignments.has(canonicalSku)) {
            const product = productMap.get(canonicalSku);
            const category = product?.category ?? 'Uncategorised';
            bump(category, 'new_sku');
        }
    }

    // Rule 2: Price bucket shift — current caPrice falls outside recorded bucket
    for (const [canonicalSku, currentBucketKey] of snapshot.skuAssignments) {
        const product = productMap.get(canonicalSku);
        if (!product) continue;

        const currentPrice = getProductPrice(product);
        if (currentPrice <= 0) continue;

        const category = currentBucketKey.split('::')[0] ?? '';
        const categoryBuckets = snapshot.categoryBuckets.get(category) ?? [];

        const matchedBucket = categoryBuckets.find((b, i) => {
            const isLast = i === categoryBuckets.length - 1;
            return isLast
                ? currentPrice >= b.priceMin && currentPrice <= b.priceMax
                : currentPrice >= b.priceMin && currentPrice < b.priceMax;
        });

        if (!matchedBucket) continue;

        const expectedBucketKey = `${category}::${matchedBucket.label}`;
        if (expectedBucketKey !== currentBucketKey) {
            bump(category, 'price_bucket_shift');
        }
    }

    const now = new Date().toISOString();
    return Array.from(affected.entries()).map(([category, { reason, skuCount }]) => ({
        category,
        reason,
        skuCount,
        detectedAt: now,
    }));
}
