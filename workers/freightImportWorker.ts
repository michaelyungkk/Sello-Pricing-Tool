import * as XLSX from 'xlsx';
import { calculateFreight, canCalculateFreight } from '../services/freightCalculator';

interface ProductSnapshot {
    sku: string;
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
}

interface ParsedRow {
    sku: string;
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
    cubicWeight?: number;
    totalCharge: number;
    source: 'erp' | 'formula';
    matched: boolean;
    status: 'valid' | 'error' | 'unmatched';
}

const postProgress = (message: string) => {
    self.postMessage({ type: 'progress', message });
};

const parseSpreadsheetPayload = (
    fileName: string,
    fileBuffer?: ArrayBuffer,
    fileText?: string
): any[] => {
    const lowerName = (fileName || '').toLowerCase();
    if ((lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) && fileBuffer) {
        const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: false, dense: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    }
    const text = fileText || '';
    const workbook = XLSX.read(text, { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
};

const findColumn = (row: Record<string, any>, candidates: string[]): string | null => {
    for (const candidate of candidates) {
        const found = Object.keys(row).find((key) => key.toLowerCase().trim() === candidate);
        if (found) return found;
    }
    return null;
};

self.onmessage = (event: MessageEvent<{
    fileName: string;
    fileBuffer?: ArrayBuffer;
    fileText?: string;
    products: ProductSnapshot[];
}>) => {
    try {
        postProgress('Parsing freight file...');
        const rows = parseSpreadsheetPayload(
            event.data?.fileName || 'freight.xlsx',
            event.data?.fileBuffer,
            event.data?.fileText
        );

        if (!rows.length) {
            throw new Error('File appears to be empty.');
        }

        const first = rows[0] || {};
        const skuCol = findColumn(first, ['sku_code', 'sku', 'sku code', 'item', 'product_code', 'productcode']);
        const chargeCol = findColumn(first, ['totalcharge', 'total_charge', 'total charge', 'freight', 'freight_cost', 'freightcost', 'cost', 'rate', 'charge']);
        const lengthCol = findColumn(first, ['length', 'len', 'l']);
        const widthCol = findColumn(first, ['width', 'wid', 'w']);
        const heightCol = findColumn(first, ['height', 'hgt', 'h']);
        const weightCol = findColumn(first, ['weight', 'wgt', 'actual_weight', 'actualweight']);
        const cubicCol = findColumn(first, ['cubicweight', 'cubic_weight', 'cubic weight', 'vol_weight']);

        if (!skuCol) throw new Error("Could not find SKU column. Expected 'sku_code', 'sku', or 'item'.");
        if (!chargeCol) throw new Error("Could not find charge column. Expected 'totalCharge', 'freight', or 'rate'.");

        postProgress('Matching ERP freight rates...');
        const productMap = new Map<string, ProductSnapshot>();
        (event.data?.products || []).forEach((product) => {
            const sku = String(product?.sku || '').trim().toUpperCase();
            if (!sku) return;
            productMap.set(sku, product);
        });

        const results: ParsedRow[] = [];
        rows.forEach((row: Record<string, any>) => {
            const sku = String(row[skuCol] || '').trim();
            if (!sku) return;

            const charge = parseFloat(String(row[chargeCol]));
            if (!Number.isFinite(charge) || charge <= 0) return;

            const length = lengthCol ? parseFloat(String(row[lengthCol])) || 0 : 0;
            const width = widthCol ? parseFloat(String(row[widthCol])) || 0 : 0;
            const height = heightCol ? parseFloat(String(row[heightCol])) || 0 : 0;
            const weight = weightCol ? parseFloat(String(row[weightCol])) || 0 : 0;
            const cubicWeight = cubicCol ? parseFloat(String(row[cubicCol])) || 0 : 0;
            const matched = productMap.has(sku.toUpperCase());

            results.push({
                sku,
                length,
                width,
                height,
                weight,
                cubicWeight,
                totalCharge: charge,
                source: 'erp',
                matched,
                status: 'valid'
            });
        });

        postProgress('Preparing fallback preview...');
        const inFile = new Set(results.map((row) => row.sku.toUpperCase()));
        (event.data?.products || []).forEach((product) => {
            const sku = String(product?.sku || '').trim();
            if (!sku || inFile.has(sku.toUpperCase())) return;
            if (!canCalculateFreight({
                length: product.length,
                width: product.width,
                height: product.height,
                weight: product.weight
            })) return;

            results.push({
                sku,
                totalCharge: calculateFreight({
                    length: Number(product.length) || 0,
                    width: Number(product.width) || 0,
                    height: Number(product.height) || 0,
                    weight: Number(product.weight) || 0
                }),
                source: 'formula',
                matched: true,
                status: 'valid'
            });
        });

        const erpCount = results.filter((row) => row.source === 'erp').length;
        const formulaCount = results.filter((row) => row.source === 'formula').length;
        const matchedCount = results.filter((row) => row.source === 'erp' && row.matched).length;

        self.postMessage({
            type: 'success',
            parsed: results,
            stats: {
                total: results.length,
                erp: erpCount,
                formula: formulaCount,
                matched: matchedCount
            }
        });
    } catch (error: any) {
        self.postMessage({
            type: 'error',
            error: error?.message || 'Failed to parse freight file.'
        });
    }
};
