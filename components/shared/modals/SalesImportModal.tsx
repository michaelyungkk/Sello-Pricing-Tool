
import React, { useState, useRef, useMemo } from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { Product, PricingRules, HistoryPayload, PriceLog } from '../../../types';
import { Upload, X, FileBarChart, AlertCircle, Check, Loader2, RefreshCw, Calendar, ArrowRight, HelpCircle, Settings2, DollarSign, Tag, Truck, RotateCcw, Search, Hash } from 'lucide-react';

export type { HistoryPayload };

interface SalesImportModalProps {
    products: Product[];
    pricingRules: PricingRules;
    salesHistory?: PriceLog[];
    learnedAliases?: Record<string, string>;
    onClose: () => void;
    onResetData?: () => void;
    onConfirm: (
        updatedProducts: Product[],
        dateLabels?: { current: string, last: string },
        historyPayload?: HistoryPayload[],
        shipmentLogs?: any[],
        discoveredPlatforms?: string[],
        newlyLearnedAliases?: Record<string, string>,
        importDirective?: {
            salesPushMode: 'incremental' | 'reconciliation' | 'full_snapshot';
            reason: string;
            reconciliationPlan?: {
                upsertKeys: string[];
                removedKeys: string[];
                added: number;
                changed: number;
                removed: number;
            } | null;
        },
        progressReporter?: (status: { message: string; progress: number }) => void
    ) => void | Promise<void>;
}

interface ColumnMapping {
    sku: string;
    qty: string;
    revenue: string;
    date?: string;
    platform?: string;
    platformLevel2?: string; // New: Detect FBA/FBM distinction
    // Extended ERP Columns
    category?: string;
    cogs?: string;
    promoRebate?: string;
    sellingFee?: string;
    adsFee?: string;
    postage?: string;
    logisticsService?: string; // New field for rate calibration
    extraFreight?: string;
    otherFee?: string;
    subscriptionFee?: string;
    wmsFee?: string;
    profitExclRn?: string; // New: Absolute Profit currency
    profitExclRnPercent?: string; // New: Net PM%
    outerOrderId?: string; // New: Unique Order ID
    orderType?: string;    // New: order_type (normal vs ad_only)
    receivePostcode?: string; // New: Receive Postcode
    logisticPartner?: string; // New: Logistic Partner (label_provider)
}

const SalesImportModal: React.FC<SalesImportModalProps> = ({ products, pricingRules, salesHistory = [], learnedAliases = {}, onClose, onResetData, onConfirm }) => {
    const [step, setStep] = useState<'upload' | 'mapping' | 'resolution' | 'preview'>('upload');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[][]>([]);
    const [importProgress, setImportProgress] = useState(0);
    const [importProgressText, setImportProgressText] = useState('');
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [isClosingAfterImport, setIsClosingAfterImport] = useState(false);

    const [mapping, setMapping] = useState<ColumnMapping>({ sku: '', qty: '', revenue: '' });
    const [periodDays, setPeriodDays] = useState<number>(30); // Default to 30 days calculation if no dates
    const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);

    const [previewData, setPreviewData] = useState<any>(null);
    const [selectedSalesPushMode, setSelectedSalesPushMode] = useState<'incremental' | 'reconciliation' | 'full_snapshot'>('incremental');
    const [unknownSkus, setUnknownSkus] = useState<Record<string, { count: number, revenue: number, masterSku: string | null }>>({});
    const [resolvedAliases, setResolvedAliases] = useState<Record<string, string>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const reconciliationPlanRef = useRef<{
        upsertKeys: string[];
        removedKeys: string[];
        added: number;
        changed: number;
        removed: number;
    } | null>(null);
    const importPayloadRef = useRef<{
        updates: Product[];
        history: HistoryPayload[];
        shipmentLogs: any[];
        discoveredPlatforms: string[];
    } | null>(null);
    const revenueDisplay = useMemo(() => {
        const value = Number(previewData?.stats?.totalRevenue || 0);
        return `£${value.toLocaleString()}`;
    }, [previewData?.stats?.totalRevenue]);
    const revenueFontClass = useMemo(() => {
        const len = revenueDisplay.length;
        if (len >= 14) return 'text-sm';
        if (len >= 12) return 'text-base';
        if (len >= 10) return 'text-lg';
        return 'text-2xl';
    }, [revenueDisplay]);
    const syncRecommendation = previewData?.syncRecommendation || {
        mode: 'incremental' as const,
        reason: 'No recommendation available yet.',
        label: 'Incremental push recommended'
    };
    React.useEffect(() => {
        if (step === 'preview') {
            setSelectedSalesPushMode(syncRecommendation.mode);
        }
    }, [step, syncRecommendation.mode]);

    const buildSyncRecommendation = (payload: any) => {
        const existing = Array.isArray(salesHistory) ? salesHistory : [];
        const plan = payload?.reconciliationPlan || null;
        if (existing.length === 0) {
            return {
                mode: 'incremental' as const,
                reason: 'No existing sales history baseline detected.',
                label: 'Incremental push recommended'
            };
        }
        if (plan && ((plan.added || 0) + (plan.changed || 0) + (plan.removed || 0) > 0)) {
            return {
                mode: 'reconciliation' as const,
                reason: `Historical mutations detected. Total delta: added ${plan.added || 0}, removed ${plan.removed || 0}, changed ${plan.changed || 0}.`,
                label: 'Targeted sales reconciliation recommended'
            };
        }
        return {
            mode: 'incremental' as const,
            reason: 'No historical mutations detected in the analyzed import snapshot.',
            label: 'Incremental push recommended'
        };
    };

    const storeWorkerResult = (payload: any) => {
        reconciliationPlanRef.current = payload.reconciliationPlan || null;
        importPayloadRef.current = {
            updates: Array.isArray(payload.updates) ? payload.updates : [],
            history: Array.isArray(payload.history) ? payload.history : [],
            shipmentLogs: Array.isArray(payload.shipmentLogs) ? payload.shipmentLogs : [],
            discoveredPlatforms: Array.isArray(payload?.stats?.discoveredPlatforms) ? payload.stats.discoveredPlatforms : []
        };
        setPreviewData({
            stats: payload.stats,
            features: payload.features,
            sampleUpdates: Array.isArray(payload.updates) ? payload.updates.slice(0, 50) : [],
            syncRecommendation: buildSyncRecommendation(payload)
        });
    };

    const prepareForClose = async () => {
        setIsClosingAfterImport(true);
        setImportProgressText('Finalizing modal close...');
        setStep('upload');
        setPreviewData(null);
        setUnknownSkus({});
        setResolvedAliases({});
        setRawHeaders([]);
        setRawRows([]);
        setShowAdvancedMapping(false);
        reconciliationPlanRef.current = null;
        importPayloadRef.current = null;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    };

    const handleConfirmImport = async () => {
        if (!previewData || !importPayloadRef.current || isConfirmingImport) return;

        setIsConfirmingImport(true);
        setImportProgress(5);
        setImportProgressText('Applying import and waiting for app to settle...');

        let progressInterval: ReturnType<typeof setInterval> | null = null;
        let shouldClose = false;
        try {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            progressInterval = setInterval(() => {
                setImportProgress(prev => (prev >= 70 ? prev : prev + 3));
            }, 180);

            await Promise.resolve(onConfirm(
                importPayloadRef.current.updates,
                { current: previewData.stats.dateLabel, last: "Previous" },
                importPayloadRef.current.history,
                importPayloadRef.current.shipmentLogs,
                importPayloadRef.current.discoveredPlatforms,
                resolvedAliases,
                {
                    salesPushMode: selectedSalesPushMode,
                    reason: syncRecommendation.reason,
                    reconciliationPlan: reconciliationPlanRef.current
                },
                (status) => {
                    setImportProgressText(status.message);
                    setImportProgress(status.progress);
                }
            ));
            setImportProgressText('Finalizing visible page...');
            setImportProgress(100);
            setImportProgressText('Import complete');
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            await prepareForClose();
            shouldClose = true;
        } catch (err) {
            console.error(err);
            setError('Failed to apply import. Please try again.');
        } finally {
            if (progressInterval) clearInterval(progressInterval);
            setIsConfirmingImport(false);
            if (shouldClose) onClose();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) processFile(e.target.files[0]);
    };

    const processFile = (file: File) => {
        setIsProcessing(true);
        setImportProgress(0);
        setImportProgressText('Reading file...');
        setError(null);
        setPreviewData(null);
        importPayloadRef.current = null;
        reconciliationPlanRef.current = null;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const worker = new Worker(
                    new URL('../../../workers/salesImportWorker.ts', import.meta.url),
                    { type: 'module' }
                );
                worker.onmessage = (message) => {
                    const payload = message.data;
                    if (payload?.type === 'progress') {
                        setImportProgress(payload.progress || 0);
                        setImportProgressText(payload.message || 'Processing...');
                        return;
                    }

                    if (payload?.type === 'parsed') {
                        worker.terminate();
                        setRawHeaders(payload.headers || []);
                        setRawRows(payload.rows || []);
                        setMapping(payload.detectedMapping || { sku: '', qty: '', revenue: '' });
                        setStep('mapping');
                        setIsProcessing(false);
                        setImportProgress(100);
                        setImportProgressText('Mapping required');
                        return;
                    }

                    worker.terminate();
                    if (payload?.success) {
                        setRawHeaders(payload.headers || []);
                        setRawRows(payload.rows || []);
                        if (payload.detectedMapping) setMapping(payload.detectedMapping);
                        storeWorkerResult(payload);
                        if (Object.keys(payload.unknownSkus || {}).length > 0) {
                            setUnknownSkus(payload.unknownSkus);
                            setStep('resolution');
                        } else {
                            setStep('preview');
                        }
                        setImportProgress(100);
                        setImportProgressText('Import analysis complete');
                    } else {
                        setError(payload?.error || 'Processing failed');
                    }
                    setIsProcessing(false);
                };

                worker.onerror = (err) => {
                    worker.terminate();
                    setError('Processing error: ' + err.message);
                    setIsProcessing(false);
                };

                worker.postMessage({
                    fileName: file.name,
                    fileBuffer: data instanceof ArrayBuffer ? data : undefined,
                    fileText: typeof data === 'string' ? data : undefined,
                    products,
                    pricingRules,
                    existingSalesHistory: salesHistory,
                    learnedAliases,
                    extraAliases: {}
                });
                return;
            } catch (err) {
                console.error(err);
                setError("Failed to parse file.");
            }
            setIsProcessing(false);
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };



    const handleManualAnalyze = () => {
        if (!mapping.sku || !mapping.qty || !mapping.revenue) {
            setError("Please map at least SKU, Quantity, and Revenue.");
            return;
        }

        const worker = new Worker(
            new URL('../../../workers/salesImportWorker.ts', import.meta.url),
            { type: 'module' }
        );

        setIsProcessing(true);
        setImportProgress(0);
        setImportProgressText('Analyzing mapped data...');

        worker.onmessage = (e) => {
            const payload = e.data;
            if (payload?.type === 'progress') {
                setImportProgress(payload.progress || 0);
                setImportProgressText(payload.message || 'Processing...');
                return;
            }

            worker.terminate();
            if (payload.success) {
                storeWorkerResult(payload);
                if (Object.keys(payload.unknownSkus || {}).length > 0) {
                    setUnknownSkus(payload.unknownSkus);
                    setStep('resolution');
                } else {
                    setStep('preview');
                }
                setImportProgress(100);
                setImportProgressText('Analysis complete');
            } else {
                setError(payload.error || 'Processing failed');
            }
            setIsProcessing(false);
        };

        worker.onerror = (err) => {
            worker.terminate();
            setError('Processing error: ' + err.message);
            setIsProcessing(false);
        };

        worker.postMessage({
            headers: rawHeaders,
            rows: rawRows,
            mapping,
            products,
            pricingRules,
            existingSalesHistory: salesHistory,
            learnedAliases,
            extraAliases: {}
        });
    };

    const mapField = (field: keyof ColumnMapping, value: string) => {
        setMapping(prev => ({ ...prev, [field]: value }));
    };

    const analyzeWithResolutions = () => {
        const newAliases: Record<string, string> = {};
        (Object.entries(unknownSkus) as [string, { count: number, revenue: number, masterSku: string | null }][]).forEach(([fileSku, data]) => {
            if (data.masterSku && products.some(p => p.sku === data.masterSku)) {
                newAliases[fileSku] = data.masterSku;
            }
        });

        const worker = new Worker(
            new URL('../../../workers/salesImportWorker.ts', import.meta.url),
            { type: 'module' }
        );

        setIsProcessing(true);
        setImportProgress(0);
        setImportProgressText('Reprocessing with SKU resolutions...');

        worker.onmessage = (e) => {
            const payload = e.data;
            if (payload?.type === 'progress') {
                setImportProgress(payload.progress || 0);
                setImportProgressText(payload.message || 'Processing...');
                return;
            }

            worker.terminate();
            if (payload.success) {
                storeWorkerResult(payload);
                setResolvedAliases(payload.resolvedAliases);
                setStep('preview');
                setImportProgress(100);
                setImportProgressText('Resolution complete');
            } else {
                setError(payload.error || 'Processing failed');
            }
            setIsProcessing(false);
        };

        worker.onerror = (err) => {
            worker.terminate();
            setError('Processing error: ' + err.message);
            setIsProcessing(false);
        };

        worker.postMessage({
            headers: rawHeaders,
            rows: rawRows,
            mapping,
            products,
            pricingRules,
            existingSalesHistory: salesHistory,
            learnedAliases,
            extraAliases: newAliases
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-theme-10 text-theme rounded-lg">
                            <FileBarChart className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Import Sales Transaction Report</h2>
                            <p className="text-xs text-gray-500">This import replaces existing sales transaction history with the latest ERP snapshot.</p>
                        </div>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto relative">
                    {isProcessing && step !== 'preview' && step !== 'upload' && (
                        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
                            <Loader2 className="w-12 h-12 text-theme animate-spin mb-4" />
                            <h3 className="text-xl font-bold text-gray-900">Processing Data</h3>
                            <p className="text-gray-500 text-center mt-2">
                                Processing {rawRows.length} rows... this may take a moment
                            </p>
                        </div>
                    )}

                    {isResetConfirmOpen && (
                        <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
                            <div className="bg-red-50 p-4 rounded-full mb-6">
                                <AlertCircle className="w-12 h-12 text-red-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Are you sure?</h3>
                            <p className="text-gray-500 text-center max-w-md mb-8">
                                This will <strong>permanently delete</strong> all imported sales history, custom product limits, and derived metrics. This action cannot be undone.
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setIsResetConfirmOpen(false)}
                                    className="px-6 py-3 text-gray-700 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onResetData?.();
                                        setIsResetConfirmOpen(false);
                                    }}
                                    className="px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-lg hover:shadow-red-500/30 transition-all flex items-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Yes, Wipe Everything
                                </button>
                            </div>
                        </div>
                    )}

                    {(isProcessing || isConfirmingImport || isClosingAfterImport) && (
                        <div className="mb-4 rounded-lg border border-theme-20 bg-theme-5 p-3">
                            <div className="flex items-center justify-between text-xs text-theme mb-2">
                                <span>{importProgressText || 'Processing import...'}</span>
                                <span>{Math.round(importProgress)}%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                                <div
                                    className="h-full bg-theme transition-all duration-200"
                                    style={{ width: `${Math.max(0, Math.min(100, importProgress))}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {!isClosingAfterImport && step === 'upload' && (
                        <div className="space-y-6">
                            <div
                                className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input ref={fileInputRef} type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileChange} />
                                {isProcessing ? (
                                    <div className="flex flex-col items-center animate-in fade-in zoom-in">
                                        <Loader2 className="w-10 h-10 text-theme animate-spin mb-3" />
                                        <p className="font-medium text-theme">{importProgressText || 'Auto-detecting Columns...'}</p>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-10 h-10 text-gray-400 mb-4" />
                                        <p className="font-medium text-gray-700">Click to upload Transaction Report</p>
                                        <p className="text-sm text-gray-500 mt-1">Supports CSV or Excel from ERP</p>
                                    </>
                                )}
                                {error && <p className="text-red-500 mt-4 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
                            </div>
                        </div>
                    )}

                    {!isClosingAfterImport && step === 'mapping' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-600">We couldn&apos;t auto-match everything. Please confirm columns.</p>
                                <button
                                    onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                                    className="text-xs text-theme font-medium flex items-center gap-1 hover:underline"
                                >
                                    <Settings2 className="w-3 h-3" />
                                    {showAdvancedMapping ? 'Hide Advanced Fees' : 'Show Advanced Fees'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <MappingSelect label="SKU (sku_code)" value={mapping.sku} onChange={(v: string) => mapField('sku', v)} options={rawHeaders} required />
                                <MappingSelect label="Quantity (sku_quantity)" value={mapping.qty} onChange={(v: string) => mapField('qty', v)} options={rawHeaders} required />
                                <MappingSelect label="Revenue (sales_amt)" value={mapping.revenue} onChange={(v: string) => mapField('revenue', v)} options={rawHeaders} required />
                                <MappingSelect label="Date (order_time)" value={mapping.date} onChange={(v: string) => mapField('date', v)} options={rawHeaders} />
                                <MappingSelect label="Order ID (Optional)" value={mapping.outerOrderId} onChange={(v: string) => mapField('outerOrderId', v)} options={rawHeaders} />
                                <MappingSelect label="Postcode (receive_postcode)" value={mapping.receivePostcode} onChange={(v: string) => mapField('receivePostcode', v)} options={rawHeaders} />
                                <MappingSelect label="Platform Level 1" value={mapping.platform} onChange={(v: string) => mapField('platform', v)} options={rawHeaders} />
                                <MappingSelect label="Platform Level 2 (Subsource)" value={mapping.platformLevel2} onChange={(v: string) => mapField('platformLevel2', v)} options={rawHeaders} />
                            </div>

                            {showAdvancedMapping && (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fees & Logistics (Optional)</h4>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <MappingSelect label="Selling Fee" value={mapping.sellingFee} onChange={(v: string) => mapField('sellingFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Ad Spend / PPC" value={mapping.adsFee} onChange={(v: string) => mapField('adsFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Postage Cost" value={mapping.postage} onChange={(v: string) => mapField('postage', v)} options={rawHeaders} />
                                        <MappingSelect label="Promo Rebate" value={mapping.promoRebate} onChange={(v: string) => mapField('promoRebate', v)} options={rawHeaders} />
                                        <MappingSelect label="Logistics Name (Service)" value={mapping.logisticsService} onChange={(v: string) => mapField('logisticsService', v)} options={rawHeaders} />
                                        <MappingSelect label="WMS Fee" value={mapping.wmsFee} onChange={(v: string) => mapField('wmsFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Extra Freight (Income)" value={mapping.extraFreight} onChange={(v: string) => mapField('extraFreight', v)} options={rawHeaders} />
                                        <MappingSelect label="Category" value={mapping.category} onChange={(v: string) => mapField('category', v)} options={rawHeaders} />
                                        <MappingSelect label="Net PM% (profit_excl_rn%)" value={mapping.profitExclRnPercent} onChange={(v: string) => mapField('profitExclRnPercent', v)} options={rawHeaders} />
                                        <MappingSelect label="Logistic Partner (label_provider)" value={mapping.logisticPartner} onChange={(v: string) => mapField('logisticPartner', v)} options={rawHeaders} />
                                    </div>
                                </div>
                            )}

                            {!mapping.date && (
                                <div className="bg-yellow-50 p-3 rounded border border-yellow-100 flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-yellow-600" />
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-yellow-800 uppercase mb-1">Manual Period (Days)</label>
                                        <input
                                            type="number"
                                            value={periodDays}
                                            onChange={e => setPeriodDays(parseInt(e.target.value) || 1)}
                                            className="border rounded p-1 w-20 text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                        </div>
                    )}

                    {!isClosingAfterImport && step === 'resolution' && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 p-4 bg-theme-10 text-theme rounded-xl border border-indigo-100">
                                <HelpCircle className="w-5 h-5 flex-shrink-0" />
                                <div className="text-sm">
                                    <p className="font-bold">Unknown SKUs Detected</p>
                                    <p className="opacity-80">These codes aren&apos;t in your inventory yet. Map them to a Master SKU to include them.</p>
                                </div>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-xl">
                                <table className="tbl tbl-compact w-full text-sm text-left">
                                    <thead className="sticky top-0">
                                        <tr>
                                            <th className="p-3">Unknown Code (In File)</th>
                                            <th className="p-3 text-center">Qty / Orders</th>
                                            <th className="p-3">Map to Master SKU</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(Object.entries(unknownSkus) as [string, { count: number, revenue: number, masterSku: string | null }][]).map(([fileSku, data]) => (
                                            <tr key={fileSku}>
                                                <td className="p-3 font-mono text-xs text-gray-700">{fileSku}</td>
                                                <td className="p-3 text-center text-gray-500">{data.count}</td>
                                                <td className="p-3">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            list="masterSkuList"
                                                            value={data.masterSku || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setUnknownSkus(prev => ({
                                                                    ...prev,
                                                                    [fileSku]: { ...prev[fileSku], masterSku: val }
                                                                }));
                                                            }}
                                                            placeholder="Search inventory..."
                                                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-theme"
                                                        />
                                                        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <datalist id="masterSkuList">
                                {products.map(p => <option key={p.id} value={p.sku}>{p.name}</option>)}
                            </datalist>

                            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div className="text-xs text-gray-500">
                                    Mapped SKUs will be remembered globally for future imports.
                                </div>
                                <button
                                    onClick={analyzeWithResolutions}
                                    className="px-6 py-2 bg-theme text-white font-medium rounded-lg hover:bg-theme shadow-md transition-all flex items-center gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    Continue Analysis
                                </button>
                            </div>
                        </div>
                    )}

                    {!isClosingAfterImport && step === 'preview' && previewData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-4 gap-4 text-center">
                                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                                    <div className="h-full flex flex-col items-center justify-between">
                                        <div className="min-h-[2.25rem] w-full flex items-center justify-center">
                                            <div className="text-2xl font-bold text-green-700">{previewData.stats.matchedSkus}</div>
                                        </div>
                                        <div className="text-xs text-green-600 uppercase font-medium">Products Matched</div>
                                    </div>
                                </div>
                                <div className="min-w-0 max-w-full overflow-hidden p-4 bg-theme-10 rounded-xl border border-indigo-100">
                                    <div className="h-full flex flex-col items-center justify-between">
                                        <div className="min-h-[2.25rem] w-full flex items-center justify-center">
                                            <div className={`block w-full text-center leading-tight font-bold text-theme whitespace-nowrap tabular-nums ${revenueFontClass}`}>
                                                {revenueDisplay}
                                            </div>
                                        </div>
                                        <div className="text-xs text-theme uppercase font-medium">Total Revenue</div>
                                    </div>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <div className="h-full flex flex-col items-center justify-between">
                                        <div className="min-h-[2.25rem] w-full flex items-center justify-center">
                                            <div className="text-2xl font-bold text-blue-700">{previewData.stats.period} Days</div>
                                        </div>
                                        <div className="text-xs text-blue-600 uppercase font-medium">{previewData.stats.dateLabel}</div>
                                    </div>
                                </div>
                                <div className={`p-4 rounded-xl border ${previewData.stats.orderIdsCount > 0 ? 'bg-teal-50 border-teal-100' : 'bg-gray-50 border-gray-100'}`}>
                                    <div className="h-full flex flex-col items-center justify-between">
                                        <div className="min-h-[2.25rem] w-full flex items-center justify-center">
                                            <div className={`text-2xl font-bold ${previewData.stats.orderIdsCount > 0 ? 'text-teal-700' : 'text-gray-400'}`}>{previewData.stats.orderIdsCount}</div>
                                        </div>
                                        <div className={`text-xs uppercase font-medium ${previewData.stats.orderIdsCount > 0 ? 'text-teal-600' : 'text-gray-400'}`}>Transactions with IDs</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 justify-center">
                                {previewData.features?.ads && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium border border-purple-200">
                                        <Check className="w-3 h-3" /> Ad Data Detected
                                    </span>
                                )}
                                {previewData.features?.logistics && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium border border-orange-200">
                                        <Check className="w-3 h-3" /> Logistics Costs Detected
                                    </span>
                                )}
                                {previewData.stats.shipmentCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-medium border border-teal-200">
                                        <Truck className="w-3 h-3" /> {previewData.stats.shipmentCount} Shipments Logged
                                    </span>
                                )}
                            </div>

                            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                <table className="tbl tbl-compact w-full text-sm text-left">
                                    <thead className="sticky top-0">
                                        <tr>
                                            <th className="p-3">SKU</th>
                                            <th className="p-3 text-right">Old Vel.</th>
                                            <th className="p-3 text-right">New Vel.</th>
                                            <th className="p-3 text-right">Unit Price</th>
                                            <th className="p-3 text-right">Unit Fees</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.sampleUpdates.map((u: any, i: number) => {
                                            const totalFees = (u.sellingFee || 0) + (u.adsFee || 0) + (u.postage || 0) + (u.wmsFee || 0);
                                            return (
                                                <tr key={i}>
                                                    <td className="p-3 font-mono text-xs">{u.sku}</td>
                                                    <td className="p-3 text-right text-gray-400">{u.previousDailySales?.toFixed(1) || '-'}</td>
                                                    <td className="p-3 text-right font-bold text-theme">{u.averageDailySales.toFixed(1)}</td>
                                                    <td className="p-3 text-right">{formatSmartMoney((u.currentPrice || 0))}</td>
                                                    <td className="p-3 text-right text-xs text-gray-500">
                                                        {totalFees > 0 ? formatSmartMoney(totalFees) : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className={`p-3 rounded-lg border ${syncRecommendation.mode === 'incremental' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                <div className="text-xs font-bold mb-1">Sync Recommendation</div>
                                <div className="text-xs text-gray-700 mb-2">{syncRecommendation.label}</div>
                                <div className="text-[11px] text-gray-600 mb-2">{syncRecommendation.reason}</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-gray-600">Sales Push Mode:</span>
                                    <select
                                        value={selectedSalesPushMode}
                                        onChange={(e) => setSelectedSalesPushMode(e.target.value as 'incremental' | 'reconciliation' | 'full_snapshot')}
                                        className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                                    >
                                        <option value="incremental">Incremental</option>
                                        <option value="reconciliation">Reconcile Changes</option>
                                        <option value="full_snapshot">Clean + Replace</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center rounded-b-xl">
                    <div>
                        {onResetData && (
                            <button
                                onClick={() => setIsResetConfirmOpen(true)}
                                title="Delete all sales logs and start fresh"
                                className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-all shadow-sm bg-white"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Reset Data
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={isConfirmingImport} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg disabled:opacity-50">Cancel</button>
                        {step === 'mapping' && (
                            <button
                                onClick={handleManualAnalyze}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-theme text-white text-sm font-bold rounded-lg hover:bg-theme disabled:opacity-50 flex items-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                Analyze Data
                            </button>
                        )}
                        {step === 'preview' && previewData && (
                            <button
                                onClick={handleConfirmImport}
                                disabled={isConfirmingImport}
                                className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
                            >
                                {isConfirmingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                {isConfirmingImport ? 'Applying Import...' : 'Confirm Import'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MappingSelect = ({ label, value, onChange, options, required }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
            <select
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className={`w-full border rounded-lg py-2 px-3 text-sm appearance-none bg-white focus:ring-2 focus:ring-theme ${required && !value ? 'border-red-300' : 'border-gray-300'}`}
            >
                <option value="">-- Ignore --</option>
                {options.map((h: string) => <option key={h} value={h}>{h}</option>)}
            </select>
            <div className="absolute right-3 top-2.5 pointer-events-none text-gray-400">
                <ArrowRight className="w-4 h-4 rotate-90" />
            </div>
        </div>
    </div>
);

export default SalesImportModal;
