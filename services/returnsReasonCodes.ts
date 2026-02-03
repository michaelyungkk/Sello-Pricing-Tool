
export interface ReturnsReasonMeta {
    short: string;
    full: string;
    family?: string;
    sub?: string;
}

// Baseline known codes for legend/reference
const KNOWN_CODES: Record<string, string> = {
    'CM/C1': 'CM - Change of Mind / C1 - Customer not like or wrong buy',
    'QI/Q3': 'QI - Quality Issue / Q3 - Functionality issue',
    'DI/D3': 'DI - Damage Issue / D3 - Damaged in transit',
    'QI/Q8': 'QI - Quality Issue / Q8 - Other quality issues',
    'CM/C2': 'CM - Change of Mind / C2 - Ordered wrong item',
    'DI/D1': 'DI - Damage Issue / D1 - Broken item',
    'QI/Q1': 'QI - Quality Issue / Q1 - Item not working',
    'DI/D6': 'DI - Damage Issue / D6 - Scratched/Scuffed',
    'DI/D4': 'DI - Damage Issue / D4 - Package damaged',
    'QI/Q2': 'QI - Quality Issue / Q2 - Poor quality',
    'DI/D7': 'DI - Damage Issue / D7 - Missing accessories',
    'LS/L2': 'LS - Logistics Service / L2 - Late delivery',
    'DI/D2': 'DI - Damage Issue / D2 - Crushed',
    'WI/W2': 'WI - Warranty Issue / W2 - Warranty claim',
    'LS/L1': 'LS - Logistics Service / L1 - Lost in transit',
    'QI/Q4': 'QI - Quality Issue / Q4 - Appearance not as expected',
    'QI/Q6': 'QI - Quality Issue / Q6 - Size/Fit issue',
    'PT/P1': 'PT - Part Issue / P1 - Missing parts',
    'DI/D5': 'DI - Damage Issue / D5 - Water damage',
    'IT/I1': 'IT - Item Issue / I1 - Item not as described'
};

export function parseReturnsReason(raw: string | null | undefined): ReturnsReasonMeta {
    if (!raw || !raw.trim()) {
        return { short: 'UNK', full: 'Unknown / Unmapped' };
    }

    // Typical Format: "CM - Change of Mind/C1 - Customer not like or wrong buy"
    // Goal: Extract "CM" and "C1" to make "CM/C1"
    
    const parts = raw.split('/');
    const familyPart = parts[0] ? parts[0].trim() : '';
    const subPart = parts[1] ? parts[1].trim() : '';

    const extractCode = (segment: string): string => {
        // Look for "CODE - " pattern at start
        const match = segment.match(/^([A-Z0-9]+)\s+-\s+/);
        if (match) {
            return match[1];
        }
        // Fallback: take first word if it looks like a code (2-3 chars, uppercase/digits)
        const firstWord = segment.split(' ')[0];
        if (firstWord.length <= 4 && /^[A-Z0-9]+$/.test(firstWord)) {
            return firstWord;
        }
        return '?';
    };

    const familyCode = extractCode(familyPart);
    const subCode = subPart ? extractCode(subPart) : '';

    let short = 'UNK';

    if (familyCode !== '?' && subCode !== '?' && subCode) {
        short = `${familyCode}/${subCode}`;
    } else if (familyCode !== '?') {
        short = familyCode;
    } else {
        // Fallback for non-standard strings, create a slug or truncate
        short = raw.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    return {
        short,
        full: raw,
        family: familyCode !== '?' ? familyCode : undefined,
        sub: subCode !== '?' ? subCode : undefined
    };
}

export function getReturnsReasonKey(meta: ReturnsReasonMeta): string {
    return meta.short || 'UNK';
}

export function getReturnsReasonLegendList(): Array<{ short: string; full: string }> {
    return Object.entries(KNOWN_CODES).map(([short, full]) => ({
        short,
        full
    }));
}
