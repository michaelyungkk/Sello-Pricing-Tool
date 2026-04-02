/**
 * freightCalculator.ts
 * Freight cost estimator reverse-engineered from 730-SKU dataset.
 *
 * HOW IT WORKS:
 *   chargeable_weight = max(actual_weight_kg, L×W×H cm³ ÷ 10,000)
 *   The courier uses volumetric weight with a 10,000 divisor (lighter than
 *   the standard 5,000 — reflects bulky-but-light items like pet beds, mattresses).
 *
 * ACCURACY: ~85% on the dataset. The £3.00/£3.40/£4.15 bands genuinely overlap
 * in chargeable weight — these appear to be manually assigned or use carrier-
 * specific zone/contract factors not in this data. Estimates for mid-range items
 * should be treated as indicative, not exact.
 *
 * Charge bands: £1.71 / £2.65 / £3.00 / £3.40 / £4.15 / £6.50 / £8.89 / £17.06 / £17.61 / £43.20
 */

export interface FreightDimensions {
    length: number;   // cm
    width: number;    // cm
    height: number;   // cm
    weight: number;   // kg (actual weight)
}

export function calculateFreight(dims: FreightDimensions): number {
    const { length, width, height, weight } = dims;
    if (!length || !width || !height || !weight) return 0;

    const maxDim = Math.max(length, width, height);
    const vol    = length * width * height;               // cm³
    const cw     = Math.max(weight, vol / 10000);         // chargeable weight

    // Small parcel: compact dimensions and light
    if (maxDim <= 59 && cw <= 5.2) return 1.71;

    // Long/light items: tubes, rolled mats, blinds etc.
    if (maxDim <= 70 && weight <= 1.0) return 2.65;

    // Weight tiers (chargeable weight determines band)
    if (cw <= 7.5)  return 3.00;
    if (cw <= 14.5) return 3.40;
    if (cw <= 16.0) return 4.15;
    if (cw <= 25.0) return 6.50;
    if (cw <= 29.0) return 8.89;
    if (cw <= 30.5) return 17.06;
    if (cw <= 35.0) return 17.61;
    return 43.20;
}

export function canCalculateFreight(dims: Partial<FreightDimensions>): boolean {
    return !!(dims.length && dims.width && dims.height && dims.weight);
}
