
export interface ReturnsReasonMeta {
    short: string;
    full: string;
    description: string;
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
        return { short: 'UNK', full: 'Unknown / Unmapped', description: 'Unknown / Unmapped' };
    }

    // Format: "CM - Change of Mind / C1 - Customer not like or wrong buy"
    // Goal: 
    // Short: "CM/C1"
    // Description: "Change of Mind: Customer not like or wrong buy"

    const parts = raw.split('/');
    const familyPart = parts[0] ? parts[0].trim() : '';
    const subPart = parts[1] ? parts[1].trim() : '';

    const parseSegment = (segment: string) => {
        // Look for "CODE - Description"
        const match = segment.match(/^([A-Z0-9]+)\s+-\s+(.+)$/);
        if (match) {
            return { code: match[1], desc: match[2].trim() };
        }
        // Look for "CODE - " (empty desc)
        const matchEmpty = segment.match(/^([A-Z0-9]+)\s+-\s*$/);
        if (matchEmpty) {
            return { code: matchEmpty[1], desc: '' };
        }

        // Fallback: check if first word is code
        const firstWord = segment.split(' ')[0];
        if (firstWord.length <= 4 && /^[A-Z0-9]+$/.test(firstWord)) {
             const rest = segment.substring(firstWord.length).replace(/^[-\s]+/, '').trim();
             return { code: firstWord, desc: rest || firstWord }; // If no desc, use code as desc? Or leave empty.
        }

        return { code: '?', desc: segment };
    };

    const family = parseSegment(familyPart);
    const sub = subPart ? parseSegment(subPart) : { code: '', desc: '' };

    let short = 'UNK';
    let description = raw; // Default to full raw if parsing fails

    if (family.code !== '?' && sub.code) {
        short = `${family.code}/${sub.code}`;
        description = `${family.desc}: ${sub.desc}`;
    } else if (family.code !== '?') {
        short = family.code;
        description = family.desc;
    } else {
        // Fallback for non-standard strings
        // If raw is short enough, use it as short? No, keep UNK or truncated
        // Check if raw looks like "Quality Issue" (no code)
        if (raw.length < 50) {
             description = raw;
             // Try to generate a short code from initials? No, too risky.
             // Just use UNK or the first few chars
             short = raw.substring(0, 8).toUpperCase().replace(/[^A-Z]/g, '');
        }
    }
    
    // Clean up description
    if (description.startsWith(': ')) description = description.substring(2);
    if (!description) description = raw; // Fallback

    return {
        short,
        full: raw,
        description: description,
        family: family.code !== '?' ? family.code : undefined,
        sub: sub.code ? sub.code : undefined
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
