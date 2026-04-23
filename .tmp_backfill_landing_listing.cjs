const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const backupPath = 'C:/Users/SELLOCP102-1/Downloads/sello_backup_2026-04-22.json';
const inventoryPath = 'C:/Users/SELLOCP102-1/Downloads/InventoryExport_Current_Columns_4-22-2026-20-0-35-314.xlsx';
const outDir = 'C:/Users/SELLOCP102-1/Documents/Sello-Pricing-Tool';
const outJson = path.join(outDir, 'sello_backup_2026-04-22_landed-listing-backfill.json');
const outReport = path.join(outDir, 'sello_backup_2026-04-22_landed-listing-backfill_report.json');

function normalizeSku(s) {
  return String(s || '').trim().toUpperCase();
}
function stripUkSuffix(sku) {
  return normalizeSku(sku).replace(/[-_]UK$/i, '');
}
function parseDdMmYyyyToDateKey(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || (dt.getUTCMonth() + 1) !== mo || dt.getUTCDate() !== d) return null;
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const products = Array.isArray(backup.products) ? backup.products : [];

const wb = XLSX.readFile(inventoryPath, { cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

const invMap = new Map();
let inventoryRowsWithSku = 0;
let inventoryRowsWithValidDates = 0;
for (const row of rows) {
  const sku = normalizeSku(row['Inventory Number'] || row['SKU'] || row['sku']);
  if (!sku) continue;
  inventoryRowsWithSku += 1;
  const createDate = parseDdMmYyyyToDateKey(row['Item Create Date']);
  const modifiedDate = parseDdMmYyyyToDateKey(row['Item Last Modified Date']);
  if (createDate && modifiedDate) inventoryRowsWithValidDates += 1;
  invMap.set(sku, { createDate, modifiedDate, rawCreate: row['Item Create Date'], rawModified: row['Item Last Modified Date'] });
  const stripped = stripUkSuffix(sku);
  if (stripped && !invMap.has(stripped)) {
    invMap.set(stripped, { createDate, modifiedDate, rawCreate: row['Item Create Date'], rawModified: row['Item Last Modified Date'] });
  }
}

let listedCount = 0;
let matchedListedCount = 0;
let updatedLandedAt = 0;
let updatedListingReadyAt = 0;
let alreadyHadLandedAt = 0;
let alreadyHadListingReadyAt = 0;
let missingInventoryMatch = 0;
let invalidCreateDate = 0;
let invalidModifiedDate = 0;
const missingSkuSamples = [];

for (const p of products) {
  if (!p || !p.sku) continue;
  const listed = !!(String(p.imageUrl || '').trim() && String(p.description || '').trim());
  if (!listed) continue;
  listedCount += 1;

  const sku = normalizeSku(p.sku);
  const inv = invMap.get(sku) || invMap.get(stripUkSuffix(sku));
  if (!inv) {
    missingInventoryMatch += 1;
    if (missingSkuSamples.length < 30) missingSkuSamples.push(sku);
    continue;
  }
  matchedListedCount += 1;

  if (!inv.createDate) invalidCreateDate += 1;
  if (!inv.modifiedDate) invalidModifiedDate += 1;

  if (!p.landedAt) {
    if (inv.createDate) {
      p.landedAt = inv.createDate;
      updatedLandedAt += 1;
    }
  } else {
    alreadyHadLandedAt += 1;
  }

  if (!p.listingReadyAt) {
    if (inv.modifiedDate) {
      p.listingReadyAt = inv.modifiedDate;
      updatedListingReadyAt += 1;
    }
  } else {
    alreadyHadListingReadyAt += 1;
  }
}

const report = {
  dateFormatInjected: 'YYYY-MM-DD',
  mode: 'fill-missing-only',
  totals: {
    products: products.length,
    listedProducts: listedCount,
    matchedListedProducts: matchedListedCount,
    missingInventoryMatch,
    inventoryRowsWithSku,
    inventoryRowsWithValidDates,
    updatedLandedAt,
    updatedListingReadyAt,
    alreadyHadLandedAt,
    alreadyHadListingReadyAt,
    invalidCreateDate,
    invalidModifiedDate
  },
  samples: {
    missingInventorySku: missingSkuSamples
  },
  sourceFiles: {
    backupPath,
    inventoryPath
  },
  outputFile: outJson
};

fs.writeFileSync(outJson, JSON.stringify(backup, null, 2), 'utf8');
fs.writeFileSync(outReport, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
