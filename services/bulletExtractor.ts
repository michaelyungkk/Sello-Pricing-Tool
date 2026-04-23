/**
 * Extracts feature bullet points, specifications, and package contents
 * from structured product description text.
 *
 * No AI - pure regex + deterministic text parsing.
 */

export interface ProductBullets {
    features: string[];
    specs: Record<string, string>;
    packageContent: string[];
}

// Strip characters jsPDF standard fonts cannot encode (CJK, fullwidth brackets, etc.)
// and clean up fullwidth bracket headers like 【TITLE】.
function sanitiseLine(line: string): string {
    return line
        .replace(/\u3010[^\u3011]*\u3011/g, '')
        .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2019\u201C\u201D\u2022\u00B7]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
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

    const scored = sentences.map((sentence, idx) => {
        const normalized = sentence.toLowerCase();
        let score = featureWords.filter(word => normalized.includes(word)).length;
        if (sentence.length > 40 && sentence.length < 120) score += 1;
        if (filler.some(word => normalized.includes(word))) score -= 3;
        if (idx === 0) score -= 1;
        return { score, text: sentence };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .filter(item => item.score >= 1)
        .map(item => sanitiseLine(item.text.replace(/\.$/, '')));
}

function toOrderedFeatureLines(content: string, maxLines = 5): string[] {
    const lines = content
        .replace(/\r/g, '\n')
        .split(/\n+/)
        .map(line => sanitiseLine(line.replace(/^[-\u2022*]\s*/, '')))
        .filter(line => line.length > 20);

    if (lines.length > 0) {
        return lines.slice(0, maxLines);
    }

    return scoreSentences(content, maxLines);
}

export function extractProductBullets(content: string): ProductBullets {
    const result: ProductBullets = { features: [], specs: {}, packageContent: [] };
    if (!content || content.length < 20) return result;

    const normalizedContent = content.replace(/\r/g, '');

    // 1) Extract FEATURES section
    const featMatch = normalizedContent.match(
        /(?:^|\n)\s*FEATURES?\s*[:\-\u2013]?\s*\n([\s\S]*?)(?=\n\s*(?:SPECIFICATIONS?|PACKAGE|WHAT'?S?\s*INCLUDED)\b|$)/i
    );
    if (featMatch) {
        result.features = featMatch[1]
            .split(/\n/)
            .map(line => sanitiseLine(line.replace(/^[-\u2022*]\s*/, '')))
            .filter(line => line.length > 10)
            .slice(0, 5);
    }

    // 2) Fallback: preserve description order first, then score if needed
    if (result.features.length === 0) {
        const descMatch = normalizedContent.match(
            /^([\s\S]*?)(?=\n\s*(?:FEATURES?|SPECIFICATIONS?|PACKAGE)\b|$)/i
        );
        if (descMatch) {
            result.features = toOrderedFeatureLines(descMatch[1], 5);
        }
    }

    // 3) Extract SPECIFICATION section
    const specMatch = normalizedContent.match(
        /(?:^|\n)\s*SPECIFICATIONS?\s*[:\-\u2013]?\s*\n([\s\S]*?)(?=\n\s*(?:PACKAGE|WHAT'?S?\s*INCLUDED)\b|$)/i
    );
    if (specMatch) {
        specMatch[1].split(/\n/).forEach(line => {
            const kv = line.match(/^([^:]+):\s*(.+)/);
            if (!kv) return;
            const key = kv[1].trim();
            const value = kv[2].trim();
            if (key && value && key !== 'Function' && value.length < 200) {
                result.specs[key] = value;
            }
        });
    }

    // 4) Extract PACKAGE CONTENT section
    const packageMatch = normalizedContent.match(
        /(?:^|\n)\s*(?:PACKAGE\s*CONTENT|WHAT'?S?\s*INCLUDED)\s*[:\-\u2013]?\s*\n([\s\S]*?)$/i
    );
    if (packageMatch) {
        result.packageContent = packageMatch[1]
            .split(/\n/)
            .map(line => line.replace(/<\/?[^>]+>/g, '').replace(/^[-\u2022*]\s*/, '').trim())
            .filter(line => line.length > 3 && !line.startsWith('<'));
    }

    return result;
}
