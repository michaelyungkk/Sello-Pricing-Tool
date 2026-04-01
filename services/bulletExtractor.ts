/**
 * Extracts feature bullet points, specifications, and package contents
 * from structured product description text.
 *
 * Expected format:
 *   [Product Title]
 *   [Description paragraphs]
 *   FEATURES
 *   - FEATURE NAME – Description
 *   SPECIFICATION
 *   Key: Value
 *   PACKAGE CONTENT
 *   1 x Item
 *
 * No AI — pure regex + sentence scoring.
 */

export interface ProductBullets {
    features: string[];
    specs: Record<string, string>;
    packageContent: string[];
}

export function extractProductBullets(content: string): ProductBullets {
    const result: ProductBullets = { features: [], specs: {}, packageContent: [] };
    if (!content || content.length < 20) return result;

    // ── 1. Extract FEATURES section ──
    const featMatch = content.match(
        /FEATURES?\s*[-–]?\s*\n?([\s\S]*?)(?=\n\s*SPECIFICATIONS?|\n\s*PACKAGE|\n\s*WHAT'?S?\s*INCLUDED|$)/i
    );
    if (featMatch) {
        result.features = featMatch[1]
            .split(/\n/)
            .map(line => line.replace(/^[-•*]\s*/, '').trim())
            .filter(line => line.length > 10)
            .map(line => line.length > 120 ? line.slice(0, 117) + '...' : line)
            .slice(0, 5);
    }

    // ── 2. Fallback: sentence scoring if no FEATURES section ──
    if (result.features.length === 0) {
        const descText = content.match(
            /^([\s\S]*?)(?=\n\s*FEATURES?|\n\s*SPECIFICATIONS?|\n\s*PACKAGE|$)/i
        );
        if (descText) {
            result.features = scoreSentences(descText[1], 5);
        }
    }

    // ── 3. Extract SPECIFICATION section ──
    const specMatch = content.match(
        /SPECIFICATIONS?\s*\n?([\s\S]*?)(?=\n\s*PACKAGE|\n\s*WHAT'?S?\s*INCLUDED|$)/i
    );
    if (specMatch) {
        specMatch[1].split(/\n/).forEach(line => {
            const kv = line.match(/^([^:]+):\s*(.+)/);
            if (kv) {
                const key = kv[1].trim();
                const val = kv[2].trim();
                // Skip overly long "Function:" fields — they're descriptions, not specs
                if (key && val && key !== 'Function' && val.length < 200) {
                    result.specs[key] = val;
                }
            }
        });
    }

    // ── 4. Extract PACKAGE CONTENT section ──
    const pkgMatch = content.match(
        /(?:PACKAGE\s*CONTENT|WHAT'?S?\s*INCLUDED)\s*\n?([\s\S]*?)$/i
    );
    if (pkgMatch) {
        result.packageContent = pkgMatch[1]
            .split(/\n/)
            .map(line => line.replace(/<\/?[^>]+>/g, '').replace(/^[-•*]\s*/, '').trim())
            .filter(line => line.length > 3 && !line.startsWith('<'));
    }

    return result;
}

function scoreSentences(text: string, max: number): string[] {
    const sentences = text
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 30);

    const featureWords = [
        'feature', 'built', 'design', 'provide', 'offer', 'support',
        'adjust', 'sturdy', 'durable', 'comfort', 'storage', 'space',
        'protect', 'easy', 'secure', 'stable', 'portable', 'removable',
        'resistant', 'suitable', 'ideal', 'includes', 'equipped',
        'waterproof', 'breathable', 'foldable', 'lightweight', 'premium'
    ];
    const filler = ['combination of', 'creating a', 'well arranged', 'delivers a', 'making it'];

    const scored = sentences.map((s, idx) => {
        const sl = s.toLowerCase();
        let score = featureWords.filter(w => sl.includes(w)).length;
        if (40 < s.length && s.length < 120) score += 1;
        if (filler.some(f => sl.includes(f))) score -= 3;
        if (idx === 0) score -= 1;
        return { score, text: s };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .filter(s => s.score >= 1)
        .map(s => {
            let t = s.text.replace(/\.$/, '');
            if (t.length > 120) {
                const cut = t.slice(0, 120).lastIndexOf(',');
                t = cut > 50 ? t.slice(0, cut) : t.slice(0, 117) + '...';
            }
            return t;
        });
}
