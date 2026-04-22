import { Product } from '../types';
import { extractProductBullets } from './bulletExtractor';

const TEAL = '#134E4A';
const WHITE = '#ffffff';
const GRAY_900 = '#111827';
const GRAY_700 = '#374151';
const GRAY_500 = '#6b7280';
const GRAY_300 = '#d1d5db';
const GRAY_200 = '#e5e7eb';
const RED_50 = '#fef2f2';
const RED_700 = '#b91c1c';
const TEAL_50 = '#f0fdfa';

const PW = 297;
const PH = 210;
const MARGIN = 10;
const CONTENT_W = PW - (MARGIN * 2);
const FUNCTIONS_BASE = '/.netlify/functions';

function roundedRect(doc: any, x: number, y: number, w: number, h: number, radius: number, fill?: string, stroke?: string) {
    if (fill) {
        doc.setFillColor(fill);
        doc.roundedRect(x, y, w, h, radius, radius, 'F');
    }
    if (stroke) {
        doc.setDrawColor(stroke);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, w, h, radius, radius, 'S');
    }
}

const loadJsPdf = async () => {
    let jsPDF: any;
    try {
        jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
        if (!jsPDF) {
            const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' as any);
            jsPDF = mod.jsPDF || mod.default?.jsPDF;
        }
    } catch {
        return null;
    }
    return jsPDF || null;
};

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const blobType = (blob.type || '').toLowerCase();
        if (!blobType.startsWith('image/')) return null;
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
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

function drawHeader(doc: any, themeColor: string, pageNo: number) {
    doc.setFillColor(themeColor);
    doc.rect(0, 0, PW, 18, 'F');
    doc.setTextColor(WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Pitching Catalogue', MARGIN, 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, PW - MARGIN, 11.5, { align: 'right' });

    doc.setTextColor(GRAY_500);
    doc.setFontSize(7);
    doc.text(`Page ${pageNo}`, PW - MARGIN, PH - 4.5, { align: 'right' });
}

function drawTableHeader(doc: any, y: number) {
    roundedRect(doc, MARGIN, y, CONTENT_W, 8, 1.5, '#f8fafc', GRAY_200);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(GRAY_700);
    doc.text('SKU', MARGIN + 3, y + 5.2);
    doc.text('Image', MARGIN + 35, y + 5.2);
    doc.text('Product Title', MARGIN + 58, y + 5.2);
    doc.text('Features', MARGIN + 146, y + 5.2);
}

function drawImagePlaceholder(doc: any, x: number, y: number, size: number, label: string) {
    roundedRect(doc, x, y, size, size, 1.4, TEAL_50, GRAY_300);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(TEAL);
    doc.text(label, x + (size / 2), y + (size / 2) + 2, { align: 'center' });
}

function drawImageCell(doc: any, imageDataUrl: string | null, product: Product, x: number, y: number, size: number) {
    if (!imageDataUrl) {
        drawImagePlaceholder(doc, x, y, size, (product.brand || product.name || 'P').slice(0, 1).toUpperCase());
        return;
    }
    for (const format of detectImageFormats(imageDataUrl)) {
        try {
            roundedRect(doc, x, y, size, size, 1.4, TEAL_50);
            doc.addImage(imageDataUrl, format, x, y, size, size, undefined, 'FAST');
            return;
        } catch {
            // try next format
        }
    }
    drawImagePlaceholder(doc, x, y, size, (product.brand || product.name || 'P').slice(0, 1).toUpperCase());
}

function getFeatureLines(doc: any, features: string[], maxWidth: number): string[] {
    if (!features || features.length === 0) return ['-'];
    const lines: string[] = [];
    features.forEach(feature => {
        const wrapped = doc.splitTextToSize(`- ${feature}`, maxWidth) as string[];
        if (wrapped.length === 0) {
            lines.push('-');
        } else {
            wrapped.forEach(line => lines.push(String(line)));
        }
    });
    return lines;
}

function getDescriptionFallbackFeatures(description: string): string[] {
    if (!description || description.length < 10) return [];
    return description
        .replace(/\r/g, '\n')
        .split(/\n+/)
        .map(line => String(line || '').replace(/\s{2,}/g, ' ').trim())
        .filter(line => line.length > 20);
}

function getRowLayout(doc: any, product: Product, titleWidth: number, featuresWidth: number) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const titleLines = (doc.splitTextToSize(product.name || '-', titleWidth) as string[]).map(line => String(line));

    doc.setFontSize(7);
    const extractedFeatures = extractProductBullets(product.description || '').features;
    const features = extractedFeatures.length > 0
        ? extractedFeatures
        : getDescriptionFallbackFeatures(product.description || '');
    const featureLines = getFeatureLines(doc, features, featuresWidth);

    const titleLineHeight = 4.2;
    const featureLineHeight = 4.2;
    const titleStartOffset = 7;
    const featureStartOffset = 7;
    const imageBottomOffset = 3.5 + 16;
    const priceHeight = 7;
    const priceGap = 2;

    const titleHeight = Math.max(1, titleLines.length) * titleLineHeight;
    const featureHeight = Math.max(1, featureLines.length) * featureLineHeight;
    const priceTopOffset = titleStartOffset + titleHeight + priceGap;
    const textBottomOffset = Math.max(priceTopOffset + priceHeight, featureStartOffset + featureHeight);

    const rowHeight = Math.max(imageBottomOffset + 3, textBottomOffset + 3);

    return { titleLines, featureLines, priceTopOffset, rowHeight };
}

function drawRow(doc: any, product: Product, y: number, rowH: number, imageDataUrl: string | null) {
    roundedRect(doc, MARGIN, y, CONTENT_W, rowH, 1.5, WHITE, GRAY_200);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(GRAY_900);
    doc.text(product.sku || '-', MARGIN + 3, y + 7);

    drawImageCell(doc, imageDataUrl, product, MARGIN + 34, y + 3.5, 16);

    const titleX = MARGIN + 58;
    const featuresX = MARGIN + 146;
    const titleWidth = 84;
    const featuresWidth = CONTENT_W - (featuresX - MARGIN) - 4;
    const layout = getRowLayout(doc, product, titleWidth, featuresWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRAY_700);
    doc.text(layout.titleLines, titleX, y + 7);
    const priceText = typeof product.caPrice === 'number' && Number.isFinite(product.caPrice)
        ? `\u00A3${product.caPrice.toFixed(2)}`
        : '-';

    // Price sits under product title for easier scanning
    roundedRect(doc, titleX, y + layout.priceTopOffset, 30, 7, 1.2, RED_50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(RED_700);
    doc.text(priceText, titleX + 28, y + layout.priceTopOffset + 4.8, { align: 'right' });

    // Features rendered line-by-line to avoid merged/garbled wrapping
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY_700);
    layout.featureLines.forEach((line, idx) => {
        doc.text(line, featuresX, y + 7 + (idx * 4.2));
    });
}

export async function generatePitchingCataloguePdf(
    selectedSkus: string[],
    allProducts: Product[],
    themeColor: string = TEAL
): Promise<void> {
    const jsPDF = await loadJsPdf();
    if (!jsPDF) {
        alert('Could not load PDF library. Please check your network connection and try again.');
        return;
    }

    const selected = selectedSkus
        .map(sku => allProducts.find(product => product.sku === sku))
        .filter((product): product is Product => !!product);

    if (selected.length === 0) return;

    const imageCache = new Map<string, string | null>();
    await Promise.all(selected.filter(p => p.imageUrl).map(async (p) => {
        const url = p.imageUrl as string;
        const data = await loadImg(url);
        imageCache.set(url, data);
    }));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let pageNo = 1;
    let y = 22;

    drawHeader(doc, themeColor, pageNo);
    drawTableHeader(doc, y);
    y += 10;

    selected.forEach((product, idx) => {
        const titleWidth = 84;
        const featuresWidth = CONTENT_W - ((MARGIN + 146) - MARGIN) - 4;
        const rowH = getRowLayout(doc, product, titleWidth, featuresWidth).rowHeight;
        if (y + rowH + 8 > PH) {
            doc.addPage();
            pageNo += 1;
            drawHeader(doc, themeColor, pageNo);
            y = 22;
            drawTableHeader(doc, y);
            y += 10;
        }
        const imageDataUrl = product.imageUrl ? (imageCache.get(product.imageUrl) ?? null) : null;
        drawRow(doc, product, y, rowH, imageDataUrl);
        y += rowH + 2;

        if (idx === selected.length - 1) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(GRAY_500);
            doc.text(`Total SKU: ${selected.length}`, MARGIN, PH - 4.5);
        }
    });

    doc.save(`sello-pitching-catalogue-${new Date().toISOString().split('T')[0]}.pdf`);
}
