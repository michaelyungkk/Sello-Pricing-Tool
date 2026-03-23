
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { localDateStamp } from '../../../utils/format';
import { Settings, Check, Upload, Trash2, Database, FileSpreadsheet, AlertCircle, Play, Download, AlertTriangle, ArrowRightLeft, Sliders, ShieldCheck, XCircle, FileWarning, FileText, Plus, X, Search, Link, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventorySyncToolProps } from '../types';
import { InventoryTemplate, SingleBufferRule, BufferRules } from '../../../types';

// Helper component to handle local input state before confirming match
const MatchInput = ({ 
    onConfirm, 
    placeholder = "Search SKU..." 
}: { 
    onConfirm: (val: string) => void, 
    placeholder?: string
}) => {
    const [val, setVal] = useState('');
    
    const commit = () => {
        if(val.trim()) onConfirm(val.trim());
    };

    return (
        <div className="flex items-center gap-1 w-full">
            <input 
                type="text" 
                list="master-sku-list" 
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-theme"
                placeholder={placeholder}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
            />
            <button 
                onClick={commit}
                disabled={!val.trim()}
                className="p-1.5 bg-theme-10 text-theme rounded hover:bg-theme-10 disabled:opacity-50 transition-colors border border-indigo-100"
                title="Confirm Match"
            >
                <Check className="w-3 h-3" />
            </button>
        </div>
    );
};

export const InventorySyncTool: React.FC<InventorySyncToolProps> = ({ 
    templates, 
    onSaveTemplates, 
    learnedAliases = {},
    onSaveLearnedAliases,
    themeColor,
    pricingRules,
    products = [],
}) => {
    const [masterFile, setMasterFile] = useState<File | null>(null);
    const [platformFile, setPlatformFile] = useState<File | null>(null);
    const [templateFile, setTemplateFile] = useState<File | null>(null);
    
    // New: Step 2 Platform Selection
    const [targetPlatform, setTargetPlatform] = useState<string>('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    
    // Parsed Data
    const [masterInventory, setMasterInventory] = useState<Map<string, number> | null>(null);
    const [specificInventory, setSpecificInventory] = useState<Map<string, number> | null>(null); // New: Track exact raw SKU counts
    const [platformRows, setPlatformRows] = useState<any[] | null>(null);
    const [platformHeaders, setPlatformHeaders] = useState<string[]>([]);
    const [platformMetaRows, setPlatformMetaRows] = useState<any[][]>([]);
    
    // Template Config State
    const [newTemplateHeaders, setNewTemplateHeaders] = useState<string[]>([]);
    const [newTemplateMeta, setNewTemplateMeta] = useState<any[][]>([]); // Capture Meta Rows
    const [newTemplateSkuCol, setNewTemplateSkuCol] = useState('');
    const [newTemplateStockCol, setNewTemplateStockCol] = useState('');
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateFormat, setNewTemplateFormat] = useState<'csv' | 'xlsx'>('xlsx'); // New: File format state
    const [isMappingTemplate, setIsMappingTemplate] = useState(false);
    
    // New: Template Header Row Selection
    const [headerRowIndex, setHeaderRowIndex] = useState(0);
    const [previewRows, setPreviewRows] = useState<any[][]>([]);

    // Pending state for upload
    const [pendingPlatformUpload, setPendingPlatformUpload] = useState<string | null>(null);

    // Processing State
    const [syncStats, setSyncStats] = useState<{ matched: number, unmatched: number, totalStock: number } | null>(null);
    const [unmatchedItems, setUnmatchedItems] = useState<string[]>([]); // Items currently unmatched (for stats/download)
    const [detectedMismatches, setDetectedMismatches] = useState<string[]>([]); // ALL items that failed auto-match (for UI list stability)
    const [error, setError] = useState<string | null>(null);

    // Manual Matching State
    const [manualMatches, setManualMatches] = useState<Map<string, string>>(new Map());
    const [isFixingModalOpen, setIsFixingModalOpen] = useState(false);
    const [fixerSearch, setFixerSearch] = useState('');

    // Unmatched Handling
    const [unmatchedAction, setUnmatchedAction] = useState<'SKIP' | 'ZERO'>('SKIP');

    // Buffer Logic State (Dynamic List)
    const [bufferRulesList, setBufferRulesList] = useState<SingleBufferRule[]>([
        { id: 'default_1', operator: 'EQ', trigger: '', value: '' }
    ]);

    const masterRef = useRef<HTMLInputElement>(null);
    const platformRef = useRef<HTMLInputElement>(null);
    const templateRef = useRef<HTMLInputElement>(null);

    const platformOptions = useMemo(() => Object.keys(pricingRules).sort(), [pricingRules]);

    // Calculate Platform Template Statuses
    const platformTemplateStatus = useMemo(() => {
        return platformOptions.map(p => {
            const t = templates.find(temp => temp.name === p);
            return {
                name: p,
                template: t,
                isMapped: !!t
            };
        });
    }, [platformOptions, templates]);

    const masterSkuList = useMemo(() => {
        if (!masterInventory) return [];
        return Array.from(masterInventory.keys()).sort();
    }, [masterInventory]);

    // Global Alias Map: product channel aliases + manually learned aliases
    const globalAliasMap = useMemo(() => {
        const map = new Map<string, string>();
        products.forEach(p => {
            const master = p.sku.toUpperCase();
            map.set(master, master);
            p.channels.forEach(c => {
                if (c.skuAlias) {
                    c.skuAlias.split(',').forEach(a => {
                        const alias = a.trim().toUpperCase();
                        if (alias) map.set(alias, master);
                    });
                }
            });
        });
        // Merge manually saved aliases so confirmed matches persist across sessions
        Object.entries(learnedAliases).forEach(([alias, master]) => {
            map.set(alias.toUpperCase(), master.toUpperCase());
        });
        return map;
    }, [products, learnedAliases]);

    // --- UTILS ---
    const normalizeBufferRules = (br?: BufferRules): SingleBufferRule[] => {
        if (!br) return [{ id: Date.now().toString(), operator: 'EQ', trigger: '', value: '' }];
        
        if (br.rules && br.rules.length > 0) return br.rules;
        
        // Convert legacy structure
        const rules: SingleBufferRule[] = [];
        if (br.triggerA) rules.push({ id: 'legacy_a', operator: br.operatorA || 'EQ', trigger: br.triggerA, value: br.valueA || '' });
        if (br.triggerB) rules.push({ id: 'legacy_b', operator: br.operatorB || 'EQ', trigger: br.triggerB, value: br.valueB || '' });
        
        if (rules.length === 0) rules.push({ id: Date.now().toString(), operator: 'EQ', trigger: '', value: '' });
        
        return rules;
    };

    const triggerPlatformUpload = (pName: string) => {
        setPendingPlatformUpload(pName);
        setBufferRulesList([{ id: Date.now().toString(), operator: 'EQ', trigger: '', value: '' }]);
        setNewTemplateFormat('xlsx');
        if (templateRef.current) {
            templateRef.current.value = ''; // Reset
            templateRef.current.click();
        }
    };

    const triggerEditTemplate = (t: InventoryTemplate) => {
        setNewTemplateName(t.name);
        setNewTemplateHeaders(t.headers);
        setNewTemplateMeta(t.metaRows || []);
        setNewTemplateSkuCol(t.skuColumn);
        setNewTemplateStockCol(t.stockColumn);
        setHeaderRowIndex(t.metaRows ? t.metaRows.length + 1 : 1);
        setNewTemplateFormat(t.exportFormat || 'xlsx');
        
        // Load saved buffer rules or default
        setBufferRulesList(normalizeBufferRules(t.bufferRules));

        setIsMappingTemplate(true);
        setSelectedTemplateId(t.id);
        // Important: We cannot show previewRows correctly here without re-uploading the file.
        // We will disable row index editing in this mode.
        setPreviewRows([]); 
    };

    // --- PARSING HELPERS ---
    const readExcel = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays
                    resolve(json as any[]);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const normalizeSku = (sku: string): string => {
        if (!sku) return '';
        // Remove common suffixes: _uk, -uk, _1, etc.
        return sku.trim().toUpperCase()
            .replace(/[-_]UK$/i, '')
            .replace(/[-_]ALL$/i, '')
            .replace(/_\d+$/, '') // Remove _1, _2
            .trim();
    };

    // --- HEADER DETECTION LOGIC ---
    const detectHeaderRow = (rows: any[][]): { index: number, headers: string[] } => {
        const keywords = ['sku', 'stock', 'quantity', 'qty', 'price', 'reference', 'ean', 'title', 'id', 'supplier'];
        let bestRowIdx = 0;
        let maxScore = -1;

        // Scan first 10 rows
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            let score = 0;
            let nonEmpty = 0;
            if (!row) continue;

            row.forEach(cell => {
                if (cell !== undefined && cell !== null && cell !== '') {
                    nonEmpty++;
                    const val = String(cell).toLowerCase();
                    if (keywords.some(k => val.includes(k))) score += 2; // Keyword match weighted higher
                }
            });

            const finalScore = score + (nonEmpty > 0 ? 1 : 0);
            if (finalScore > maxScore) {
                maxScore = finalScore;
                bestRowIdx = i;
            }
        }

        const headers = rows[bestRowIdx]?.map(c => String(c || '').trim()) || [];
        return { index: bestRowIdx, headers };
    };

    // --- HANDLERS ---

    const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setMasterFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 2) throw new Error("Empty master file");
                
                // Auto-detect columns
                const { index: headerRowIdx, headers } = detectHeaderRow(rows); 
                
                const lowerHeaders = headers.map(h => h.toLowerCase());
                const skuIdx = lowerHeaders.findIndex((h) => h.includes('sku') || h.includes('reference'));
                
                // Look for 'stock', 'qty', 'quantity' but prefer 'total' or 'available' if ambiguous
                const stockIdx = lowerHeaders.findIndex((h) => h.includes('total') && (h.includes('stock') || h.includes('qty'))) !== -1 
                    ? lowerHeaders.findIndex((h) => h.includes('total') && (h.includes('stock') || h.includes('qty')))
                    : lowerHeaders.findIndex((h) => h.includes('stock') || h.includes('qty') || h.includes('quantity') || h.includes('available'));

                if (skuIdx === -1 || stockIdx === -1) throw new Error("Could not detect SKU or Stock columns in Master file.");

                // --- SMART AGGREGATION LOGIC ---
                // 1. Specific Map: Exact SKU -> Total Stock (Handles duplicate rows for same SKU by summing)
                // 2. Master Map: Normalized SKU -> Aggregate Stock (For sharing logic)

                const tempMap = new Map<string, { rawSkus: Set<string>, sum: number, max: number }>();
                const specificMap = new Map<string, number>();

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r) continue;
                    
                    const skuVal = String(r[skuIdx] || '').trim();
                    if (!skuVal) continue;

                    const stock = parseFloat(r[stockIdx]) || 0;

                    // Populate Specific Map (Summing duplicates)
                    const currentSpecific = specificMap.get(skuVal) || 0;
                    specificMap.set(skuVal, currentSpecific + Math.max(0, stock));

                    // Populate Normalized Aggregators
                    const normalizedSku = normalizeSku(skuVal); 
                    
                    if (!tempMap.has(normalizedSku)) {
                        tempMap.set(normalizedSku, { rawSkus: new Set(), sum: 0, max: 0 });
                    }

                    const entry = tempMap.get(normalizedSku)!;
                    entry.rawSkus.add(skuVal); // Track raw string to detect aliases vs splits
                    entry.sum += Math.max(0, stock);
                    entry.max = Math.max(entry.max, stock); 
                }

                // Finalize Inventory Map
                const invMap = new Map<string, number>();
                tempMap.forEach((data, masterSku) => {
                    // If Raw SKUs set size > 1, it means we found 'SKU' and 'SKU_1' etc.
                    // This implies the file lists aliases separately with full stock. Use MAX.
                    if (data.rawSkus.size > 1) {
                        invMap.set(masterSku, data.max);
                    } else {
                        // If only 1 Raw SKU found (even if multiple rows), implies split inventory. Use SUM.
                        invMap.set(masterSku, data.sum);
                    }
                });

                setMasterInventory(invMap);
                setSpecificInventory(specificMap);
                setError(null);
            } catch (err: any) {
                setError("Master File Error: " + err.message);
                setMasterFile(null);
            }
        }
    };

    const handlePlatformUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setPlatformFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 2) throw new Error("Empty platform file");
                
                const { index, headers } = detectHeaderRow(rows);
                
                // Store structural data for perfect reconstruction
                setPlatformHeaders(headers);
                setPlatformMetaRows(rows.slice(0, index));

                // Convert to objects starting from index + 1 for processing
                const data = rows.slice(index + 1).map(row => {
                    const obj: any = {};
                    headers.forEach((h: any, i: number) => {
                        obj[h] = row[i];
                    });
                    return obj;
                });
                
                setPlatformRows(data);
                setManualMatches(new Map()); // Reset manual matches on new file
                setError(null);
            } catch (err: any) {
                setError("Platform File Error: " + err.message);
                setPlatformFile(null);
            }
        }
    };

    // Helper for robust column finding
    const findHeader = (headers: string[], keywords: string[]) => {
        return headers.find(h => {
            const lower = h.toLowerCase();
            return keywords.some(k => lower.includes(k));
        }) || '';
    };

    const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setTemplateFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 1) throw new Error("Empty template file");
                
                setPreviewRows(rows.slice(0, 5)); // Save preview for manual override if needed
                
                const { index, headers } = detectHeaderRow(rows);
                setHeaderRowIndex(index + 1); // 1-based for UI display
                
                // Capture everything BEFORE the header row
                const meta = rows.slice(0, index);
                setNewTemplateMeta(meta);
                
                setNewTemplateHeaders(headers);
                
                // Improved Heuristic
                const skuGuess = findHeader(headers, ['sku', 'reference', 'code', 'item', 'id', 'product']);
                const stockGuess = findHeader(headers, ['stock', 'qty', 'quantity', 'inventory', 'available', 'count']);
                
                setNewTemplateSkuCol(skuGuess);
                setNewTemplateStockCol(stockGuess);
                
                // If this was triggered from the "Upload Template" button for a specific platform
                if (pendingPlatformUpload) {
                    setNewTemplateName(pendingPlatformUpload);
                    setPendingPlatformUpload(null);
                } 
                // Else if user selected a platform in Step 2 drop-down
                else if (targetPlatform) {
                    setNewTemplateName(targetPlatform);
                } else {
                    setNewTemplateName(f.name.split('.')[0]); 
                }
                
                setIsMappingTemplate(true);
                setSelectedTemplateId(''); 
            } catch (err: any) {
                setError("Template File Error: " + err.message);
            }
        }
    };

    const handleHeaderRowChange = (rowIndexOneBased: number) => {
        const idx = rowIndexOneBased - 1;
        if (previewRows[idx]) {
            const headers = previewRows[idx].map(c => String(c || '').trim());
            setNewTemplateHeaders(headers);
            setHeaderRowIndex(rowIndexOneBased);
            
            // Recalculate guesses when header row changes
            const skuGuess = findHeader(headers, ['sku', 'reference', 'code', 'item', 'id', 'product']);
            const stockGuess = findHeader(headers, ['stock', 'qty', 'quantity', 'inventory', 'available', 'count']);
            
            setNewTemplateSkuCol(skuGuess);
            setNewTemplateStockCol(stockGuess);
        }
    };

    const saveTemplate = () => {
        if (!newTemplateName || !newTemplateSkuCol || !newTemplateStockCol) {
            setError("Please complete all template fields.");
            return;
        }
        
        // Remove existing template with same name to avoid dupe clutter
        const cleanList = templates.filter(t => t.name !== newTemplateName);
        
        const newTemplate: InventoryTemplate = {
            id: selectedTemplateId || `tpl-${Date.now()}`, // Keep ID if editing
            name: newTemplateName,
            headers: newTemplateHeaders,
            skuColumn: newTemplateSkuCol,
            stockColumn: newTemplateStockCol,
            metaRows: newTemplateMeta, // Save detected pre-header data
            bufferRules: { rules: bufferRulesList }, // Save dynamic buffer list
            exportFormat: newTemplateFormat // Save selected format
        };
        const updated = [...cleanList, newTemplate];
        onSaveTemplates(updated);
        setSelectedTemplateId(newTemplate.id);
        setIsMappingTemplate(false);
        setTemplateFile(null); 
    };

    const handleDeleteTemplate = (id: string) => {
        if (confirm("Delete this template?")) {
            const updated = templates.filter(t => t.id !== id);
            onSaveTemplates(updated);
            // Ensure UI state resets if we deleted the currently selected one
            if (selectedTemplateId === id) {
                setSelectedTemplateId('');
                setBufferRulesList([{ id: 'default', operator: 'EQ', trigger: '', value: '' }]);
            }
        }
    };

    const handleApplyManualMatch = (platformSku: string, masterSku: string) => {
        setManualMatches(prev => new Map(prev).set(platformSku, masterSku));
        // Persist immediately so the alias survives page reload / next session
        onSaveLearnedAliases({ [platformSku.toUpperCase()]: masterSku.toUpperCase() });
    };
    
    const handleClearManualMatch = (platformSku: string) => {
        setManualMatches(prev => {
            const next = new Map(prev);
            next.delete(platformSku);
            return next;
        });
    };

    // Auto-Run Reconciliation Effect
    useEffect(() => {
        if (!masterInventory || !platformRows) {
            setSyncStats(null);
            setUnmatchedItems([]);
            setDetectedMismatches([]);
            return;
        }
        
        let matchedCount = 0;
        let unmatchedCount = 0;
        let totalDistributed = 0;
        const remainingUnmatched: string[] = [];
        const allMismatchesSet = new Set<string>();

        const groupedMap = new Map<string, any[]>();
        
        if (platformRows.length === 0) return;
        const firstRow = platformRows[0];
        // Heuristic to find SKU column in Platform Data if not explicit
        const platSkuKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('sku')) || Object.keys(firstRow)[0]; 

        platformRows.forEach(row => {
            const pSku = String(row[platSkuKey]).trim();
            const pSkuUpper = pSku.toUpperCase();
            
            const normalized = normalizeSku(pSku);
            
            // Resolve using manual matches first
            let masterKey = manualMatches.get(pSku);
            
            if (!masterKey) {
                // Try Global Alias Map first (from Product Management)
                if (globalAliasMap.has(pSkuUpper)) {
                    masterKey = normalizeSku(globalAliasMap.get(pSkuUpper)!);
                } 
                // Then try normalized match against Master Inventory
                else if (masterInventory.has(normalized)) {
                    masterKey = normalized;
                }
            }

            const isMatched = !!masterKey && masterInventory.has(masterKey);

            if (!isMatched) {
                allMismatchesSet.add(pSku);
            }
            
            if (masterKey) {
                if (!groupedMap.has(masterKey)) {
                    groupedMap.set(masterKey, []);
                }
                groupedMap.get(masterKey)!.push(row);
            } else {
                // Still unmatched
                if (!groupedMap.has(pSku)) {
                    groupedMap.set(pSku, []);
                }
                groupedMap.get(pSku)!.push(row);
            }
        });

        setDetectedMismatches(Array.from(allMismatchesSet));

        groupedMap.forEach((rows, masterKey) => {
            if (masterInventory.has(masterKey)) {
                matchedCount += rows.length;
                totalDistributed += masterInventory.get(masterKey) || 0;
            } else {
                unmatchedCount += rows.length;
                // Add the specific platform SKUs that failed to match (remaining)
                rows.forEach(r => remainingUnmatched.push(String(r[platSkuKey]).trim()));
            }
        });

        setSyncStats({ matched: matchedCount, unmatched: unmatchedCount, totalStock: totalDistributed });
        setUnmatchedItems(remainingUnmatched);
    }, [masterInventory, platformRows, manualMatches, globalAliasMap]);

    const downloadUnmatched = () => {
        if (unmatchedItems.length === 0) return;
        const ws = XLSX.utils.aoa_to_sheet([["Missing Platform SKU"], ...unmatchedItems.map(s => [s])]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Unmatched");
        XLSX.writeFile(wb, `unmatched_skus_${localDateStamp()}.csv`);
    };

    const handleExport = () => {
        if (!masterInventory || !platformRows || !selectedTemplateId) {
            setError("Missing data or template selection.");
            return;
        }

        const template = templates.find(t => t.id === selectedTemplateId);
        if (!template) return;

        // Normalize rules into array (handle backward compat)
        const effectiveRules = normalizeBufferRules(template.bufferRules);
        const format = template.exportFormat || 'xlsx';

        // Determine the SKU Key in the platform data (Step 2 file)
        const firstRow = platformRows[0];
        const platSkuKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('sku')) || Object.keys(firstRow)[0];
        
        // Pass 1: Group by Master SKU to count aliases (needed for stock division)
        const aliasCounts = new Map<string, number>();
        platformRows.forEach(row => {
            const pSku = String(row[platSkuKey]).trim();
            const pSkuUpper = pSku.toUpperCase();

            // Resolve manual or global alias or normalize
            let masterKey = manualMatches.get(pSku);
            if (!masterKey) {
                if (globalAliasMap.has(pSkuUpper)) {
                    masterKey = normalizeSku(globalAliasMap.get(pSkuUpper)!);
                } else {
                    masterKey = normalizeSku(pSku);
                }
            }

            if (masterKey) {
                aliasCounts.set(masterKey, (aliasCounts.get(masterKey) || 0) + 1);
            }
        });

        // Pass 2: Generate output rows
        const outputRows = platformRows.map(row => {
            const pSku = String(row[platSkuKey]).trim();
            const pSkuUpper = pSku.toUpperCase();

            let masterKey = manualMatches.get(pSku);
            if (!masterKey) {
                if (globalAliasMap.has(pSkuUpper)) {
                    masterKey = normalizeSku(globalAliasMap.get(pSkuUpper)!);
                } else {
                    masterKey = normalizeSku(pSku);
                }
            }
            
            let stockToDistribute = 0;
            let isMatched = false;
            
            // PRIORITY: Check Specific (Exact) Match first
            if (specificInventory && specificInventory.has(pSku)) {
                stockToDistribute = specificInventory.get(pSku)!;
                isMatched = true;
            } 
            // FALLBACK: Use Master Normalized Logic (Divided by aliases)
            else if (masterKey && masterInventory.has(masterKey)) {
                const total = masterInventory.get(masterKey)!;
                const count = aliasCounts.get(masterKey) || 1;
                stockToDistribute = Math.floor(total / count); 
                isMatched = true;
            }

            if (!isMatched) {
                // UNMATCHED ACTION LOGIC
                if (unmatchedAction === 'SKIP') return null;
                // If ZERO, we fall through with stockToDistribute = 0
            }

            // Distribute is now handled above (specific vs shared)
            const perUnit = stockToDistribute;
            
            // --- BUFFER LOGIC START ---
            let finalStock = perUnit;
            
            // Iterate through rules (First match wins)
            for (const rule of bufferRulesList) {
                if (!rule.trigger) continue; // Skip empty rules

                // Range Logic
                if (rule.operator === 'RANGE') {
                    const parts = rule.trigger.split('-').map(s => parseFloat(s.trim()));
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        if (perUnit >= parts[0] && perUnit <= parts[1]) {
                            const v = parseFloat(rule.value);
                            if (!isNaN(v)) finalStock = v;
                            break; // Stop after first match
                        }
                    }
                } else {
                    // Standard Logic
                    const t = parseFloat(rule.trigger);
                    if (!isNaN(t)) {
                        let matches = false;
                        if (rule.operator === 'EQ') matches = perUnit === t;
                        if (rule.operator === 'LT') matches = perUnit < t;
                        if (rule.operator === 'GT') matches = perUnit > t;
                        if (rule.operator === 'LTE') matches = perUnit <= t;
                        if (rule.operator === 'GTE') matches = perUnit >= t;
                        
                        if (matches) {
                            const v = parseFloat(rule.value);
                            if (!isNaN(v)) finalStock = v;
                            break; // Stop after first match
                        }
                    }
                }
            }
            // --- BUFFER LOGIC END ---

            // Create a new row object with updated stock
            return {
                ...row,
                [template.stockColumn]: finalStock
            };
        }).filter(r => r !== null); // Filter out skipped rows

        // Convert Objects back to Arrays based on TEMPLATE HEADERS order
        const finalDataRows = outputRows.map(row => {
            return template.headers.map(header => {
                // Special handling: if the header is the designated Stock Column, use our calculated stock
                if (header === template.stockColumn) {
                    return row[template.stockColumn];
                }
                
                let val = row[header] !== undefined ? row[header] : '';
                
                // Force large numbers to String
                if (typeof val === 'number' && String(val).length > 11) {
                    val = String(val);
                }
                
                return val;
            });
        });

        // RECONSTRUCT FILE: Template Meta Rows + Template Headers + Data
        const finalData = [
            ...(template.metaRows || []), // Restore pre-header rows from TEMPLATE
            template.headers,             // Original headers from TEMPLATE
            ...finalDataRows             // Data with updated stock mapped to template
        ];

        const ws = XLSX.utils.aoa_to_sheet(finalData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "InventoryUpdate");
        
        // Generate filename
        const stamp = localDateStamp();
        const hasBuffer = bufferRulesList.some(r => r.trigger !== '');
        const suffix = hasBuffer ? '_Buffered' : '';
        const filename = `${template.name}_InventoryUpdate${suffix}_${stamp}`;
        
        // Export based on preference
        if (format === 'csv') {
            XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' });
        } else {
            XLSX.writeFile(wb, `${filename}.xlsx`);
        }
    };

    const updateBufferRule = (id: string, field: keyof SingleBufferRule, val: string) => {
        setBufferRulesList(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
    };

    const addBufferRule = () => {
        setBufferRulesList(prev => [...prev, { id: Date.now().toString(), operator: 'EQ', trigger: '', value: '' }]);
    };

    const removeBufferRule = (id: string) => {
        setBufferRulesList(prev => prev.filter(r => r.id !== id));
    };

    const renderBufferRule = (
        rule: SingleBufferRule,
        index: number,
        updateRule: (id: string, field: keyof SingleBufferRule, val: string) => void,
        deleteRule: (id: string) => void
    ) => {
        const isRange = rule.operator === 'RANGE';
        return (
            <div key={rule.id} className="flex items-center gap-2 group mb-2">
                <div className="flex-1 flex items-center gap-3 bg-white p-2 rounded border border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-bold text-xs text-theme w-5">{index + 1}.</span>
                        <span className="font-medium">If Stock</span>
                        <select
                            value={rule.operator}
                            onChange={e => updateRule(rule.id, 'operator', e.target.value)}
                            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold focus:ring-1 focus:ring-theme cursor-pointer"
                        >
                            <option value="EQ">=</option>
                            <option value="LT">&lt;</option>
                            <option value="GT">&gt;</option>
                            <option value="LTE">&le;</option>
                            <option value="GTE">&ge;</option>
                            <option value="RANGE">Range</option>
                        </select>
                        <input 
                            type={isRange ? "text" : "number"}
                            placeholder={isRange ? "Min-Max" : "Val"}
                            value={rule.trigger}
                            onChange={e => updateRule(rule.id, 'trigger', e.target.value)}
                            className={`border border-gray-300 rounded px-2 py-1 text-center font-bold text-sm ${isRange ? 'w-24' : 'w-16'}`}
                        />
                    </div>
                    <ArrowRightLeft className="w-3 h-3 text-gray-300" />
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium">Set to</span>
                        <input 
                            type="number" 
                            placeholder="0" 
                            value={rule.value}
                            onChange={e => updateRule(rule.id, 'value', e.target.value)}
                            className="w-16 border border-gray-300 rounded px-2 py-1 text-center font-bold text-theme text-sm"
                        />
                    </div>
                </div>
                <button 
                    onClick={() => deleteRule(rule.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-60 hover:opacity-100"
                    title="Remove Rule"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* 0. Platform Templates Grid */}
            <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm backdrop-blur-custom">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-theme" />
                    Platform Templates
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {platformTemplateStatus.map(status => (
                        <div key={status.name} className={`relative group p-3 rounded-lg border flex flex-col justify-between h-24 transition-all ${status.isMapped ? 'bg-green-50/50 border-green-200' : 'bg-gray-50 border-gray-200 hover:border-theme-20 hover:bg-white'}`}>
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-gray-700 truncate" title={status.name}>{status.name}</span>
                                {status.isMapped ? (
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
                                )}
                            </div>
                            
                            {status.isMapped ? (
                                <div className="flex gap-2 mt-auto">
                                    <button 
                                        onClick={() => triggerEditTemplate(status.template!)}
                                        className="flex-1 text-[10px] bg-white border border-green-200 text-green-700 py-1 rounded font-medium hover:bg-green-50"
                                    >
                                        Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteTemplate(status.template!.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => triggerPlatformUpload(status.name)}
                                    className="mt-auto w-full text-[10px] bg-white border border-gray-300 text-gray-500 py-1 rounded font-medium hover:bg-theme-10 hover:text-theme hover:border-theme-20 flex items-center justify-center gap-1"
                                >
                                    <Upload className="w-3 h-3" /> Upload
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {/* Hidden File Input for Template Uploads */}
                <input ref={templateRef} type="file" hidden accept=".csv,.xlsx" onChange={handleTemplateUpload} />
            </div>

            {/* Template Mapping Modal (Inline) */}
            {isMappingTemplate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                    <div className="flex justify-between items-start mb-4">
                        <h4 className="font-bold text-amber-800 flex items-center gap-2">
                            <Settings className="w-4 h-4"/> 
                            {selectedTemplateId ? 'Edit Template Mapping' : 'Configure New Template'}
                        </h4>
                        {selectedTemplateId && (
                            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded border border-amber-200">
                                Editing Existing
                            </span>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        {/* Column 1: Name */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Template Name</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    list="platform-list"
                                    value={newTemplateName} 
                                    onChange={e => setNewTemplateName(e.target.value)}
                                    className="w-full border rounded p-2 text-sm"
                                    placeholder="e.g. Amazon Loader"
                                    readOnly={!!selectedTemplateId && platformOptions.includes(newTemplateName)} // Lock name if editing a platform standard
                                />
                                <datalist id="platform-list">
                                    {platformOptions.map(p => <option key={p} value={p} />)}
                                </datalist>
                            </div>
                        </div>

                        {/* Column 2: Header Row Detection */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Header Row #</label>
                            <input 
                                type="number" 
                                min="1"
                                max="10"
                                value={headerRowIndex} 
                                onChange={e => handleHeaderRowChange(parseInt(e.target.value))}
                                className={`w-full border rounded p-2 text-sm ${previewRows.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                                disabled={previewRows.length === 0} // Disable if no file content available to re-parse
                                title={previewRows.length === 0 ? "Cannot change row index without re-uploading file" : ""}
                            />
                            {newTemplateMeta.length > 0 && (
                                <p className="text-[9px] text-green-600 mt-1 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> {newTemplateMeta.length} pre-header rows detected
                                </p>
                            )}
                        </div>

                        {/* Column 3: SKU Map */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">SKU Column</label>
                            <select 
                                value={newTemplateSkuCol} 
                                onChange={e => setNewTemplateSkuCol(e.target.value)}
                                className={`w-full border rounded p-2 text-sm bg-white ${!newTemplateSkuCol ? 'text-gray-400' : 'text-gray-900'}`}
                            >
                                <option value="" disabled>-- Select Column --</option>
                                {newTemplateHeaders.map(h => <option key={h} value={h} className="text-gray-900">{h}</option>)}
                            </select>
                        </div>

                        {/* Column 4: Stock Map */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Stock Column</label>
                            <select 
                                value={newTemplateStockCol} 
                                onChange={e => setNewTemplateStockCol(e.target.value)}
                                className={`w-full border rounded p-2 text-sm bg-white ${!newTemplateStockCol ? 'text-gray-400' : 'text-gray-900'}`}
                            >
                                <option value="" disabled>-- Select Column --</option>
                                {newTemplateHeaders.map(h => <option key={h} value={h} className="text-gray-900">{h}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* File Format Selector */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Output Format</label>
                        <div className="flex gap-4">
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${newTemplateFormat === 'xlsx' ? 'bg-green-50 border-green-200 text-green-800 shadow-sm' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                <input 
                                    type="radio" 
                                    name="fileFormat" 
                                    value="xlsx" 
                                    checked={newTemplateFormat === 'xlsx'} 
                                    onChange={() => setNewTemplateFormat('xlsx')}
                                    className="hidden"
                                />
                                <FileSpreadsheet className="w-4 h-4" />
                                <span className="text-sm font-medium">Excel (.xlsx)</span>
                            </label>
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${newTemplateFormat === 'csv' ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                <input 
                                    type="radio" 
                                    name="fileFormat" 
                                    value="csv" 
                                    checked={newTemplateFormat === 'csv'} 
                                    onChange={() => setNewTemplateFormat('csv')}
                                    className="hidden"
                                />
                                <FileText className="w-4 h-4" />
                                <span className="text-sm font-medium">CSV (.csv)</span>
                            </label>
                        </div>
                    </div>
                    
                    {/* Buffer Logic Section - INSIDE EDIT MODAL */}
                    <div className="border-t border-amber-200 pt-4 w-full mb-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Sliders className="w-4 h-4 text-amber-600" />
                            <h4 className="text-xs font-bold text-amber-700 uppercase">Template-Specific Buffer Rules</h4>
                        </div>
                        
                        <div className="bg-white/50 p-4 rounded-lg border border-amber-100">
                             {bufferRulesList.map((rule, idx) => (
                                 renderBufferRule(rule, idx, updateBufferRule, removeBufferRule)
                             ))}
                             <button
                                onClick={addBufferRule}
                                className="mt-2 flex items-center gap-1 text-xs font-bold text-theme hover:text-indigo-800 px-2 py-1 rounded hover:bg-theme-10 transition-colors"
                             >
                                <Plus className="w-3 h-3" /> Add Condition
                             </button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button onClick={() => { setIsMappingTemplate(false); setPendingPlatformUpload(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
                        <button onClick={saveTemplate} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-amber-700">Save Template</button>
                    </div>
                </div>
            )}

            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Master Inventory */}
                <div className={`p-6 rounded-xl border flex flex-col justify-between h-56 transition-all ${masterFile ? 'bg-green-50 border-green-200' : 'bg-custom-glass border-custom-glass shadow-sm'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-theme-10 p-2 rounded-lg text-theme"><Database className="w-5 h-5"/></div>
                            <h4 className="font-bold text-gray-800">1. Master Inventory</h4>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Upload the source of truth (ERP export) with total stock levels.</p>
                        {masterInventory && (
                            <div className="text-sm font-medium text-green-700 flex items-center gap-1">
                                <Check className="w-4 h-4"/> {masterInventory.size} SKUs Loaded
                            </div>
                        )}
                    </div>
                    <button onClick={() => masterRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                        {masterFile ? 'Replace File' : 'Upload Master'}
                    </button>
                    <input ref={masterRef} type="file" hidden accept=".csv,.xlsx" onChange={handleMasterUpload} />
                </div>

                {/* 2. Platform Data */}
                <div className={`p-6 rounded-xl border flex flex-col justify-between h-56 transition-all ${platformFile && targetPlatform ? 'bg-green-50 border-green-200' : 'bg-custom-glass border-custom-glass shadow-sm'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><FileSpreadsheet className="w-5 h-5"/></div>
                            <h4 className="font-bold text-gray-800">2. Platform Data</h4>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Select platform and upload current active listings report.</p>
                        
                        {/* Platform Dropdown */}
                        <div className="mb-2">
                            <select 
                                value={targetPlatform}
                                onChange={(e) => setTargetPlatform(e.target.value)}
                                className="w-full border rounded p-2 text-sm bg-white focus:ring-2 focus:ring-theme"
                            >
                                <option value="" disabled>Select Target Platform</option>
                                {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        {platformRows && (
                            <div className="text-sm font-medium text-green-700 flex items-center gap-1">
                                <Check className="w-4 h-4"/> {platformRows.length} Rows Loaded
                            </div>
                        )}
                    </div>
                    <button onClick={() => platformRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50" disabled={!targetPlatform}>
                        {platformFile ? 'Replace File' : 'Upload Listings'}
                    </button>
                    <input ref={platformRef} type="file" hidden accept=".csv,.xlsx" onChange={handlePlatformUpload} />
                </div>

                {/* 3. Export Template */}
                <div className="p-6 rounded-xl border border-custom-glass bg-custom-glass shadow-sm flex flex-col justify-between h-56 relative">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                                <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><Settings className="w-5 h-5"/></div>
                                <h4 className="font-bold text-gray-800">3. Export Template</h4>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Choose output format for update file.</p>

                        <div className="relative">
                            <select 
                                className="w-full border rounded p-2 text-sm mb-2 appearance-none bg-white"
                                value={selectedTemplateId}
                                onChange={(e) => {
                                    const tId = e.target.value;
                                    setSelectedTemplateId(tId);
                                    // Update live buffer view on selection
                                    const tmpl = templates.find(t => t.id === tId);
                                    if (tmpl) setBufferRulesList(normalizeBufferRules(tmpl.bufferRules));
                                }}
                            >
                                <option value="" disabled>Select Output Template</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                {!selectedTemplateId && targetPlatform && templates.some(t => t.name === targetPlatform) && (
                                    <option value="suggested" disabled>--- Suggested ---</option>
                                )}
                            </select>
                        </div>
                    </div>
                    
                    <button onClick={() => templateRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                        Upload Custom Template
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5"/>
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Action Bar */}
            {masterInventory && platformRows && selectedTemplateId && !isMappingTemplate && (
                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col">
                    
                    {/* Top Row: Info & Stats */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-900 text-lg">Ready to Reconcile</h3>
                            <p className="text-sm text-gray-500">The system will map Platform Aliases to Master SKUs and distribute stock evenly.</p>
                            
                            {syncStats && (
                                <div className="flex gap-4 mt-3">
                                    <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold border border-green-200">
                                        {syncStats.matched} Aliases Matched
                                    </div>
                                    {syncStats.unmatched > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold border border-red-200 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3"/> {syncStats.unmatched} Unmatched
                                            </div>
                                            <button 
                                                onClick={() => setIsFixingModalOpen(true)}
                                                className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded border border-transparent shadow-sm transition-colors flex items-center gap-1"
                                                title="Manually link platform items to master SKUs"
                                            >
                                                <Link className="w-3 h-3" /> Review & Match
                                            </button>
                                            <button 
                                                onClick={downloadUnmatched}
                                                className="text-[10px] font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded border border-transparent hover:border-red-100 transition-colors flex items-center gap-1"
                                                title="Download CSV of missing SKUs"
                                            >
                                                <Download className="w-3 h-3" /> Download List
                                            </button>
                                        </div>
                                    )}
                                    <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold border border-blue-200">
                                        Total Stock: {syncStats.totalStock}
                                    </div>
                                </div>
                            )}

                            {/* Unmatched Action Control */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-4">
                                <span className="text-xs font-bold text-gray-500 uppercase">Unmatched Action:</span>
                                <div className="flex bg-white border border-gray-300 rounded p-0.5">
                                    <button 
                                        onClick={() => setUnmatchedAction('SKIP')}
                                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${unmatchedAction === 'SKIP' ? 'bg-theme-10 text-theme' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Skip (Safe)
                                    </button>
                                    <button 
                                        onClick={() => setUnmatchedAction('ZERO')}
                                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${unmatchedAction === 'ZERO' ? 'bg-theme-10 text-theme' : 'text-gray-500 hover:text-gray-900'}`}
                                    >
                                        Set to 0
                                    </button>
                                </div>
                                <span className="text-[10px] text-gray-400 italic">
                                    {unmatchedAction === 'SKIP' 
                                        ? 'Unmatched rows will be EXCLUDED from the export file.' 
                                        : 'Unmatched rows will be included with 0 stock.'}
                                </span>
                            </div>
                        </div>

                        <button 
                            onClick={handleExport}
                            className="px-8 py-4 bg-theme text-white rounded-xl shadow-xl hover:bg-theme hover:shadow-2xl transition-all font-bold text-lg flex items-center gap-3"
                            style={{ backgroundColor: themeColor }}
                        >
                            <Download className="w-6 h-6" />
                            Generate Update File
                        </button>
                    </div>

                    {/* Buffer Logic Section - Always Visible */}
                    <div className="border-t border-gray-100 pt-4 w-full">
                        <div className="flex items-center gap-2 mb-3">
                            <Sliders className="w-4 h-4 text-gray-400" />
                            <h4 className="text-xs font-bold text-gray-600 uppercase">Active Buffer Rules</h4>
                        </div>
                        
                        <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                            {bufferRulesList.map((rule, idx) => (
                                renderBufferRule(rule, idx, updateBufferRule, removeBufferRule)
                            ))}
                             <button
                                onClick={addBufferRule}
                                className="mt-2 flex items-center gap-1 text-xs font-bold text-theme hover:text-indigo-800 px-2 py-1 rounded hover:bg-theme-10 transition-colors"
                             >
                                <Plus className="w-3 h-3" /> Add Condition
                             </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* MANUAL MATCH MODAL */}
            {isFixingModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Link className="w-4 h-4 text-theme" /> 
                                Manual SKU Match
                            </h3>
                            <button onClick={() => setIsFixingModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600"/></button>
                        </div>
                        <div className="p-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <p>Map unknown platform items to your Master Inventory. Confirmed matches are saved permanently to your SKU aliases.</p>
                        </div>
                        <div className="p-4 border-b">
                            <input 
                                type="text" 
                                placeholder="Filter unmatched items..." 
                                value={fixerSearch}
                                onChange={e => setFixerSearch(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-theme"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="tbl w-full text-sm text-left">
                                <thead className="sticky top-0">
                                    <tr>
                                        <th className="p-3 w-1/3">Unmatched Platform SKU</th>
                                        <th className="p-3 w-1/3">Map to Master SKU</th>
                                        <th className="p-3 w-1/3 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detectedMismatches.filter(s => s.toLowerCase().includes(fixerSearch.toLowerCase())).map((item, idx) => {
                                        const matched = manualMatches.get(item);
                                        return (
                                            <tr key={idx} className={`${matched ? 'bg-green-50/50' : ''}`}>
                                                <td className="p-3 font-mono text-gray-700">{item}</td>
                                                <td className="p-3">
                                                    {matched ? (
                                                        <span className="font-bold text-theme">{matched}</span>
                                                    ) : (
                                                        <MatchInput 
                                                            onConfirm={(val) => handleApplyManualMatch(item, val)}
                                                        />
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {matched ? (
                                                        <button 
                                                            onClick={() => handleClearManualMatch(item)}
                                                            className="text-xs text-gray-400 hover:text-red-500 flex items-center justify-end gap-1 ml-auto"
                                                        >
                                                            <Edit2 className="w-3 h-3" /> Change
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400 italic">Unmatched</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {detectedMismatches.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="p-8 text-center text-gray-400 italic">No unmatched items found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
                            <button 
                                onClick={() => {
                                    // Flush all confirmed matches to learnedAliases on close
                                    if (manualMatches.size > 0) {
                                        const toSave: Record<string, string> = {};
                                        manualMatches.forEach((masterSku, platformSku) => {
                                            toSave[platformSku.toUpperCase()] = masterSku.toUpperCase();
                                        });
                                        onSaveLearnedAliases(toSave);
                                    }
                                    setIsFixingModalOpen(false);
                                }}
                                className="px-6 py-2 bg-theme text-white font-bold rounded-lg hover:bg-theme shadow-sm"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                    <datalist id="master-sku-list">
                        {masterSkuList.map(s => <option key={s} value={s} />)}
                    </datalist>
                </div>
            )}
        </div>
    );
};
