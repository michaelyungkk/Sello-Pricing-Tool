/**
 * showcasePdfGenerator.ts
 * Layout: 2x2 grid (4 cards per page), grouped by category.
 * Card structure: image left | text right (SKU, brand, name, bullets, pills, price position, speed)
 */

import { Product, CohortSnapshot } from '../types';
import { extractProductBullets } from './bulletExtractor';

const TEAL        = '#134E4A';
const TEAL_LIGHT  = '#ccfbf1';
const TEAL_50     = '#f0fdfa';
const TEAL_MID    = '#0f766e';
const WHITE       = '#ffffff';
const GRAY_900    = '#111827';
const GRAY_600    = '#4b5563';
const GRAY_400    = '#9ca3af';
const GRAY_100    = '#f3f4f6';
const GRAY_200    = '#e5e7eb';
const GREEN_700   = '#047857';
const GREEN_50    = '#ecfdf5';
const GREEN_100   = '#d1fae5';
const BLUE_700    = '#0369a1';
const BLUE_50     = '#f0f9ff';
const BLUE_100    = '#dbeafe';
const AMBER_700   = '#b45309';
const AMBER_50    = '#fffbeb';
const AMBER_100   = '#fef3c7';
const RED_700     = '#be123c';
const RED_50      = '#fff1f2';
const RED_100     = '#fee2e2';
const PURPLE_700  = '#6d28d9';
const PURPLE_50   = '#f5f3ff';

// A4 landscape
const PW = 297;
const PH = 210;
const MARGIN = 6;

function gradeColour(grade?: number): { bg: string; text: string } {
    const n = Number(grade);
    if (!n || n <= 0) return { bg: GRAY_100,  text: GRAY_600  };
    if (n <= 2)       return { bg: GREEN_50,  text: GREEN_700  };
    if (n === 3)      return { bg: BLUE_50,   text: BLUE_700   };
    if (n <= 5)       return { bg: AMBER_50,  text: AMBER_700  };
    return                   { bg: RED_50,    text: RED_700    };
}

function marginColour(pct: number): { bg: string; text: string } {
    if (pct >= 15) return { bg: GREEN_50,  text: GREEN_700 };
    if (pct >= 5)  return { bg: AMBER_50,  text: AMBER_700 };
    return               { bg: RED_50,    text: RED_700   };
}

function calcTotalCost(p: Product): number {
    return (p.costPrice ?? 0)
         + ((p as any).postage ?? (p as any).costDetail?.postage ?? 0)
         + ((p as any).sellingFee ?? (p as any).costDetail?.sellingFee ?? 0)
         + ((p as any).adsFee ?? 0)
         + ((p as any).wmsFee ?? 0)
         + ((p as any).otherFee ?? 0);
}

function calcMarginPct(p: Product): number | null {
    const price = p.caPrice || p.currentPrice || 0;
    if (price <= 0) return null;
    return ((price - calcTotalCost(p)) / price) * 100;
}

interface BucketInfo {
    label: string;
    priceMin: number;
    priceMax: number;
    medianVelocity?: number;
    medianMarginPct?: number;
    skuCount?: number;
    bucketIndex?: number;
    totalBuckets?: number;
}

function getBucketInfo(sku: string, category: string, snap: CohortSnapshot | null): BucketInfo | null {
    if (!snap) return null;
    const bucketKey = snap.skuAssignments?.get(sku) || snap.skuAssignments?.get(sku.toUpperCase());
    if (!bucketKey) return null;
    const stats  = snap.cohortStats?.get(bucketKey);
    const bucket = stats?.bucket;
    const catBuckets = snap.categoryBuckets?.get(category) || snap.categoryBuckets?.get(category.toLowerCase());
    if (!bucket) {
        if (!catBuckets) return null;
        const found = catBuckets.find((b: any) =>
            `${b.category}|${b.bucketIndex}` === bucketKey || bucketKey.includes(`|${b.bucketIndex}`)
        );
        return found ? { label: found.label, priceMin: found.priceMin, priceMax: found.priceMax,
                         bucketIndex: found.bucketIndex, totalBuckets: catBuckets.length } : null;
    }
    return {
        label: bucket.label, priceMin: bucket.priceMin, priceMax: bucket.priceMax,
        medianVelocity: stats.medianVelocity, medianMarginPct: stats.medianMarginPct,
        skuCount: stats.skuCount, bucketIndex: bucket.bucketIndex, totalBuckets: catBuckets?.length,
    };
}

const FUNCTIONS_BASE = '/.netlify/functions';

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const blobType = (blob.type || '').toLowerCase();
        if (!blobType.startsWith('image/')) return null;
        return new Promise(res => {
            const r = new FileReader();
            r.onload  = () => res(r.result as string);
            r.onerror = () => res(null);
            r.readAsDataURL(blob);
        });
    } catch { return null; }
}

async function loadImg(url: string): Promise<string | null> {
    const direct = await fetchImageAsDataUrl(url);
    if (direct) return direct;

    try {
        const proxiedUrl = `${FUNCTIONS_BASE}/image-proxy?url=${encodeURIComponent(url)}`;
        return await fetchImageAsDataUrl(proxiedUrl);
    } catch {
        return null;
    }
}

function detectImageFormats(dataUrl: string): string[] {
    const head = dataUrl.slice(0, 40).toLowerCase();
    if (head.startsWith('data:image/png')) return ['PNG', 'JPEG'];
    if (head.startsWith('data:image/webp')) return ['WEBP', 'PNG', 'JPEG'];
    if (head.startsWith('data:image/jpg') || head.startsWith('data:image/jpeg')) return ['JPEG', 'PNG'];
    return ['JPEG', 'PNG'];
}

function sanitizePdfText(text: string): string {
    return text
        .replace(/\u00C2\u00A3/g, '\u00A3')
        .replace(/\u00E2\u20AC\u201C|\u00E2\u20AC\u201D/g, '-')
        .replace(/\u00E2\u20AC\u00A2/g, '-')
        .replace(/\u00C2\u00B7/g, ' | ')
        .replace(/[^\u0020-\u007E\u00A3]/g, '')
        .trim();
}

function splitText(doc: any, text: string, maxW: number): string[] {
    return doc.splitTextToSize(sanitizePdfText(text || ''), maxW);
}

function rrect(doc: any, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
    if (fill)   { doc.setFillColor(fill);   doc.roundedRect(x, y, w, h, r, r, 'F'); }
    if (stroke) { doc.setDrawColor(stroke); doc.setLineWidth(0.25); doc.roundedRect(x, y, w, h, r, r, 'S'); }
}

// Draw pill, returns next x position
function pill(doc: any, x: number, y: number, label: string, bg: string, fg: string, fs = 6): number {
    const safeLabel = sanitizePdfText(label);
    doc.setFontSize(fs);
    const tw = doc.getTextWidth(safeLabel);
    const pw = tw + 4, ph = 4.5;
    rrect(doc, x, y - 3.2, pw, ph, 1.2, bg);
    doc.setTextColor(fg);
    doc.text(safeLabel, x + 2, y);
    return x + pw + 1.5;
}

// Cover
function drawCover(doc: any, products: Product[], themeColor: string) {
    doc.setFillColor(themeColor);
    doc.rect(0, 0, PW, PH, 'F');
    doc.setFillColor(TEAL_MID);
    doc.circle(PW - 22, 22, 42, 'F');
    doc.circle(22, PH - 22, 30, 'F');

    const cX = MARGIN + 10, cY = 20, cW = PW - (MARGIN + 10) * 2, cH = PH - 40;
    rrect(doc, cX, cY, cW, cH, 7, WHITE);

    doc.setFontSize(28); doc.setFont('helvetica', 'bold'); doc.setTextColor(themeColor);
    doc.text('NEW PRODUCT', PW / 2, 58, { align: 'center' });
    doc.text('SHOWCASE',    PW / 2, 75, { align: 'center' });

    doc.setFillColor(themeColor);
    doc.rect(PW / 2 - 20, 80, 40, 0.8, 'F');

    const weekStr = sanitizePdfText(`Week of ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_600);
    doc.text(weekStr, PW / 2, 89, { align: 'center' });

    const speeds = products.filter(p => p.landedAt && p.listingReadyAt && p.landedAt !== p.listingReadyAt)
        .map(p => Math.round((new Date(p.listingReadyAt!).getTime() - new Date(p.landedAt!).getTime()) / 86400000));
    const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
    const cats = new Set(products.map(p => p.category || 'Uncategorised')).size;

    const stats = [
        { v: String(products.length),                                    l: 'Products'          },
        { v: String(cats),                                               l: 'Categories'        },
        { v: String(products.filter(p => p.imageUrl).length),            l: 'With Images'       },
        { v: String(products.filter(p => p.description).length),         l: 'With Descriptions' },
        { v: avgSpeed != null ? `${avgSpeed}d` : '-',                    l: 'Avg Listing Speed' },
    ];
    const sW = cW / stats.length;
    stats.forEach(({ v, l }, i) => {
        const sx = cX + i * sW + sW / 2;
        doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(themeColor);
        doc.text(v, sx, 115, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_400);
        doc.text(l.toUpperCase(), sx, 123, { align: 'center' });
    });

    doc.setFontSize(6.5); doc.setTextColor(GRAY_400);
    doc.text('Generated by Sello UK Hub', PW / 2, PH - 10, { align: 'center' });
}

// Single card (drawn into a bounding box)
async function drawCard(
    doc: any,
    p: Product,
    x: number, y: number, w: number, h: number,
    snap: CohortSnapshot | null,
    imgCache: Map<string, string | null>,
    themeColor: string,
    bulletCache: Map<string, string[]>
) {
    // Card shell
    rrect(doc, x, y, w, h, 3, WHITE, GRAY_200);
    // Top teal accent
    doc.setFillColor(themeColor);
    doc.rect(x, y, w, 1.2, 'F');

    const PAD = 3.5;
    const IMG_SIZE = 28;   // image column width = 28mm

    // Left column: image
    const imgX = x + PAD;
    const imgY = y + PAD + 1.5;
    let drawn = false;

    if (p.imageUrl) {
        let d = imgCache.get(p.imageUrl);
        if (d === undefined) { d = await loadImg(p.imageUrl); imgCache.set(p.imageUrl, d); }
        if (d) {
            const formats = detectImageFormats(d);
            for (const fmt of formats) {
                try {
                    rrect(doc, imgX, imgY, IMG_SIZE, IMG_SIZE, 2, TEAL_50);
                    doc.addImage(d, fmt, imgX, imgY, IMG_SIZE, IMG_SIZE, undefined, 'FAST');
                    drawn = true;
                    break;
                } catch {
                    // Try next compatible format
                }
            }
        }
    }
    if (!drawn) {
        rrect(doc, imgX, imgY, IMG_SIZE, IMG_SIZE, 2, TEAL_50, TEAL_LIGHT);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(themeColor);
        doc.text((p.brand || p.name || 'P')[0].toUpperCase(), imgX + IMG_SIZE / 2, imgY + IMG_SIZE / 2 + 2, { align: 'center' });
    }

    // Right column: text
    const txtX = imgX + IMG_SIZE + 3.5;
    const txtW = x + w - txtX - PAD;
    let cy = y + PAD + 3;

    // Row 1: SKU + grade badge
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(themeColor);
    const safeSku = sanitizePdfText(p.sku || '');
    doc.text(safeSku, txtX, cy);
    if (p.gradeLevel) {
        const gc = gradeColour(p.gradeLevel);
        const skuW = doc.getTextWidth(safeSku);
        pill(doc, txtX + skuW + 2, cy, `G${p.gradeLevel}`, gc.bg, gc.text, 6);
    }
    cy += 4.5;

    // Row 2: brand
    if (p.brand) {
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_400);
        doc.text(sanitizePdfText(p.brand.toUpperCase()), txtX, cy);
        cy += 3.5;
    }

    // Row 3: product name (2 lines max)
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(GRAY_900);
    const nameLines = splitText(doc, p.name || '', txtW).slice(0, 2);
    doc.text(nameLines, txtX, cy);
    cy += nameLines.length * 3.8 + 2.5;

    // Horizontal rule + padding
    doc.setDrawColor(GRAY_200); doc.setLineWidth(0.25);
    doc.line(txtX, cy, txtX + txtW, cy);
    cy += 3.5; // padding below rule

    // Rows 4-8: bullets (leave room for pills + price panel + speed)
    const bullets = bulletCache.get(p.sku) || [];

    // Reserve space: pills row (6) + price panel (if any, 18) + speed (6) + bottom pad (2)
    const bi = getBucketInfo(p.sku, p.category || '', snap);
    const reservedH = 6 + (bi ? 17 : 0) + 5 + 2;
    const bulletBottom = y + h - reservedH;

    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_600);
    for (const b of bullets) {
        if (cy > bulletBottom) break;
        const wrapped = splitText(doc, `- ${b}`, txtW).slice(0, 2);
        doc.text(wrapped, txtX, cy);
        cy += wrapped.length * 3 + 0.8;
    }

    // Snap cy: ensure bullets don't push into the reserved area
    cy = Math.min(cy + 2, bulletBottom);

    // Row 9: Metric pills
    let px = txtX;
    const price = p.caPrice || p.currentPrice || 0;
    if (price > 0) px = pill(doc, px, cy, `\u00A3${price.toFixed(2)}`, TEAL_50, TEAL_MID);
    if (p.stockLevel !== undefined) px = pill(doc, px, cy, `Stock: ${p.stockLevel}`, GRAY_100, GRAY_600);
    const mPct = calcMarginPct(p);
    if (mPct !== null) {
        const mc = marginColour(mPct);
        px = pill(doc, px, cy, `${mPct.toFixed(0)}% margin`, mc.bg, mc.text);
    }
    if (bi) {
        pill(doc, px, cy, `${sanitizePdfText(p.category || 'Uncategorised')} | ${sanitizePdfText(bi.label)}`, PURPLE_50, PURPLE_700);
    } else {
        pill(doc, px, cy, sanitizePdfText(p.category || 'Uncategorised'), TEAL_LIGHT, themeColor);
    }
    cy += 6;

    // Price position panel (inline, below pills)
    if (bi) {
        const panelH = 16;
        rrect(doc, txtX, cy, txtW, panelH, 2, TEAL_50);
        const py = cy + 3;

        doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(themeColor);
        doc.text('PRICE POSITION', txtX + txtW / 2, py, { align: 'center' });

        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(GRAY_900);
        doc.text(bi.label, txtX + txtW / 2, py + 3.5, { align: 'center' });

        // Progress bar
        if (bi.totalBuckets && bi.bucketIndex !== undefined) {
            const barX = txtX + 4, barW = txtW - 8, barH = 2;
            const barY = py + 5.5;
            rrect(doc, barX, barY, barW, barH, 1, GRAY_200);
            const fill = Math.max(3, barW * (bi.bucketIndex + 1) / bi.totalBuckets);
            rrect(doc, barX, barY, fill, barH, 1, themeColor);

            doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_400);
            doc.text('lower', barX, barY + barH + 2);
            doc.text('higher', barX + barW, barY + barH + 2, { align: 'right' });
        }

        // Median stats (compact, single line)
        if (bi.medianVelocity !== undefined) {
            const statsY = py + 13;
            doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_600);
            doc.text(`Bucket median: `, txtX + 2, statsY);
            doc.setFont('helvetica', 'bold'); doc.setTextColor(GRAY_900);
            const labelW = doc.getTextWidth('Bucket median: ');
            doc.text(
                `${bi.medianVelocity.toFixed(1)}/day | ${(bi.medianMarginPct || 0).toFixed(0)}% margin | ${bi.skuCount ?? '-'} SKUs`,
                txtX + 2 + labelW, statsY
            );
        }
        cy += panelH + 0.5;
    }

    // Row 10: Listing speed
    // landedAt = arrived in warehouse  |  listingReadyAt = content & images ready (listed)
    const speedY = y + h - 4;
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_400);

    const parts: string[] = [];
    if (p.landedAt) parts.push(`Landed: ${sanitizePdfText(p.landedAt)}`);
    if (p.listingReadyAt && p.listingReadyAt !== p.landedAt) {
        parts.push(`Listed: ${sanitizePdfText(p.listingReadyAt)}`);
        if (p.landedAt) {
            const days = Math.round(
                (new Date(p.listingReadyAt).getTime() - new Date(p.landedAt).getTime()) / 86400000
            );
            if (days > 0) parts.push(`${days}d to list`);
        }
    } else if (p.listingReadyAt) {
        // Same date - only show once, label as "Listed"
        parts.push(`Listed: ${sanitizePdfText(p.listingReadyAt)}`);
    }

    if (parts.length) doc.text(sanitizePdfText(parts.join(' | ')), x + PAD, speedY);
}

// Category product pages (2x2 grid)
async function drawProductPages(
    doc: any,
    byCategory: Map<string, Product[]>,
    snap: CohortSnapshot | null,
    imgCache: Map<string, string | null>,
    themeColor: string,
    bulletCache: Map<string, string[]>
) {
    const HEADER_H = 12;
    const FOOTER_H = 5;
    const COLS = 2, ROWS = 2;
    const CARDS_PER_PAGE = COLS * ROWS;
    const GAP = 2;

    const availW = PW - MARGIN * 2;
    const availH = PH - HEADER_H - FOOTER_H - MARGIN;
    const cardW = (availW - GAP) / COLS;
    const cardH = (availH - GAP) / ROWS;

    for (const [category, products] of byCategory) {
        const remaining = [...products];
        while (remaining.length > 0) {
            doc.addPage();
            const chunk = remaining.splice(0, CARDS_PER_PAGE);

            // Category header
            doc.setFillColor(themeColor);
            doc.rect(0, 0, PW, HEADER_H, 'F');
            doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(WHITE);
            doc.text(sanitizePdfText(category.toUpperCase()), MARGIN, 8);

            // Footer
            doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_400);
            doc.text('Sello UK Hub - New Product Showcase', PW / 2, PH - 2.5, { align: 'center' });

            for (let i = 0; i < chunk.length; i++) {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const cx = MARGIN + col * (cardW + GAP);
                const cy = HEADER_H + 2 + row * (cardH + GAP);
                await drawCard(doc, chunk[i], cx, cy, cardW, cardH, snap, imgCache, themeColor, bulletCache);
            }
        }
    }
}

// Summary page
function drawSummary(doc: any, products: Product[], snap: CohortSnapshot | null) {
    doc.addPage();
    doc.setFillColor(TEAL);
    doc.rect(0, 0, PW, 14, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(WHITE);
    doc.text('Summary', MARGIN, 10);

    const byCategory = new Map<string, Product[]>();
    products.forEach(p => {
        const cat = p.category || 'Uncategorised';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(p);
    });

    let ty = 24;
    const cols = { cat: MARGIN, count: 75, price: 100, bucket: 134, margin: 210, img: 248, desc: 270 };

    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(GRAY_400);
    ['CATEGORY','COUNT','AVG CA PRICE','PRICE BUCKET (COHORT)','AVG MARGIN','IMG','DESC'].forEach((h, i) => {
        doc.text(h, [cols.cat, cols.count, cols.price, cols.bucket, cols.margin, cols.img, cols.desc][i], ty);
    });
    doc.setDrawColor(GRAY_200); doc.setLineWidth(0.3);
    doc.line(MARGIN, ty + 2, PW - MARGIN, ty + 2);
    ty += 7;

    let totalRevPot = 0;
    let rowIdx = 0;

    byCategory.forEach((ps, catName) => {
        if (rowIdx % 2 === 0) { doc.setFillColor(GRAY_100); doc.rect(MARGIN, ty - 3.5, PW - MARGIN * 2, 7, 'F'); }
        const priced = ps.filter(p => p.caPrice && p.caPrice > 0);
        const avgP = priced.length ? priced.reduce((s, p) => s + p.caPrice!, 0) / priced.length : 0;
        const mVals = ps.map(p => calcMarginPct(p)).filter((v): v is number => v !== null);
        const avgM = mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : null;
        totalRevPot += ps.reduce((s, p) => s + (p.caPrice || 0) * (p.stockLevel || 0), 0);

        const bucketSet = new Set<string>();
        ps.forEach(p => { const bi = getBucketInfo(p.sku, p.category || '', snap); if (bi) bucketSet.add(bi.label); });

        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_900);
        doc.text(sanitizePdfText(catName), cols.cat, ty);
        doc.setTextColor(GRAY_600);
        doc.text(String(ps.length), cols.count, ty);
        doc.text(avgP > 0 ? `\u00A3${avgP.toFixed(2)}` : '-', cols.price, ty);
        doc.text(splitText(doc, bucketSet.size ? [...bucketSet].join(', ') : '-', 68).slice(0,1), cols.bucket, ty);
        if (avgM !== null) {
            const mc = marginColour(avgM);
            doc.setTextColor(mc.text);
            doc.text(`${avgM.toFixed(1)}%`, cols.margin, ty);
            doc.setTextColor(GRAY_600);
        } else {
            doc.text('-', cols.margin, ty);
        }
        doc.text(`${ps.filter(p => p.imageUrl).length}/${ps.length}`, cols.img, ty);
        doc.text(`${ps.filter(p => p.description).length}/${ps.length}`, cols.desc, ty);
        ty += 7; rowIdx++;
        if (ty > PH - 20) { doc.addPage(); ty = MARGIN + 10; }
    });

    doc.setDrawColor(TEAL); doc.setLineWidth(0.5);
    doc.line(MARGIN, ty, PW - MARGIN, ty);
    ty += 5;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(TEAL);
    doc.text(`Total: ${products.length} products across ${byCategory.size} categories`, MARGIN, ty);
    if (totalRevPot > 0) {
        ty += 5;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(GRAY_600);
        doc.text(`Stock value potential: \u00A3${Math.round(totalRevPot).toLocaleString('en-GB')}`, MARGIN, ty);
    }
}

// Main export
export async function generateShowcasePdf(
    selectedSkus: string[],
    allProducts: Product[],
    cohortSnapshot: CohortSnapshot | null,
    themeColor: string = TEAL
): Promise<void> {
    let jsPDF: any;
    try {
        jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
        if (!jsPDF) {
            const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' as any);
            jsPDF = mod.jsPDF || mod.default?.jsPDF;
        }
    } catch {
        alert('PDF generation requires jsPDF. Please check your network connection and try again.');
        return;
    }
    if (!jsPDF) { alert('Could not load PDF library.'); return; }

    const selected = selectedSkus
        .map(sku => allProducts.find(p => p.sku === sku))
        .filter((p): p is Product => !!p);
    if (!selected.length) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Pre-load all images in parallel
    const imgCache = new Map<string, string | null>();
    let imageAttemptCount = 0;
    let imageLoadedCount = 0;
    await Promise.all(
        selected.filter(p => p.imageUrl)
                .map(async (p) => {
                    imageAttemptCount += 1;
                    const d = await loadImg(p.imageUrl!);
                    if (d) imageLoadedCount += 1;
                    imgCache.set(p.imageUrl!, d);
                })
    );
    if (imageAttemptCount > 0) {
        const failed = imageAttemptCount - imageLoadedCount;
        console.log(`[showcasePdf] image preload: ${imageLoadedCount}/${imageAttemptCount} loaded${failed > 0 ? ` (${failed} fallback to placeholder)` : ''}`);
    }

    // Cover
    drawCover(doc, selected, themeColor);

    // Group by category
    const byCategory = new Map<string, Product[]>();
    selected.forEach(p => {
        const cat = p.category || 'Uncategorised';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(p);
    });

    // Pre-compute bullets for all products (avoids regex parsing per card in draw loop)
    const bulletCache = new Map<string, string[]>();
    selected.forEach(p => {
        if (p.description) {
            bulletCache.set(p.sku, extractProductBullets(p.description).features.slice(0, 5));
        }
    });

    // Product pages
    await drawProductPages(doc, byCategory, cohortSnapshot, imgCache, themeColor, bulletCache);

    // Summary
    drawSummary(doc, selected, cohortSnapshot);

    doc.save(`sello-new-product-showcase-${new Date().toISOString().split('T')[0]}.pdf`);
}
