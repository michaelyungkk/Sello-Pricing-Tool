import { RefundLog } from '../types';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has', 'was', 'were', 'are', 'but', 'not', 'you', 'your', 'they', 'them',
  'item', 'order', 'return', 'refund', 'customer', 'issue', 'problem', 'received', 'delivery', 'courier', 'seller', 'platform',
  'like', 'wrong', 'asked', 'sent', 'transit', 'lost', 'address', 'described', 'broken', 'quality', 'change', 'mind', 'because',
  'did', 'had', 'can', 'into', 'been', 'will', 'would', 'about', 'there', 'what', 'which', 'their', 'when', 'one', 'two', 'also',
  'some', 'other', 'than', 'then', 'just', 'could', 'should', 'very', 'more', 'most', 'only', 'any', 'been', 'being', 'here',
  'its', 'our', 'she', 'so', 'than', 'these', 'up', 'very', 'we', 'who', 'please', 'thanks', 'thank', 'can', 'not', 'get', 'was'
]);

export interface WordFreq {
  text: string;
  count: number;
}

/**
 * Aggregates keywords by frequency from refund metadata.
 * Deterministic and local processing only.
 */
export function aggregateRefundKeywords(refunds: RefundLog[], limit = 20): WordFreq[] {
  const wordMap = new Map<string, number>();

  refunds.forEach(r => {
    const textParts = [
      r.reason,
      r.customerReason,
      r.platformReason,
      r.remarks,
      r.comments,
      r.commentEn
    ].filter(Boolean);

    const combinedText = textParts.join(' ').toLowerCase();
    // Split by non-alphanumeric, strip symbols
    const tokens = combinedText.split(/[^a-z0-9]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

    tokens.forEach(token => {
      wordMap.set(token, (wordMap.get(token) || 0) + 1);
    });
  });

  return Array.from(wordMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
