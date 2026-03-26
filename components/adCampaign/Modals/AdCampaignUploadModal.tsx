import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Check, AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
    AdSnapshot,
    AdCampaign,
    DailySkuRow,
} from '../../../types';
import {
    detectAndParseCsv,
    parseSummaryCsv,
    parseDetailCsv,
    detectWeekFromDetailRows,
    buildSnapshot,
    weekLabel,
} from '../../../services/adCampaignService';
import { Product, PriceLog } from '../../../types';

interface AdCampaignUploadModalProps {
    products: Product[];
    salesHistory: PriceLog[];
    learnedAliases: Record<string, string>;
    existingSnapshots: AdSnapshot[];
    budgets: Record<string, number>;
    platform?: string;
    onConfirm: (snapshot: AdSnapshot, updatedBudgets: Record<string, number>) => void;
    onClose: () => void;
}

type Step = 'upload' | 'budgets' | 'mapping' | 'preview' | 'done';

interface ParsedFile {
    name: string;
    type: 'summary' | 'detail' | 'unknown';
    rows: Record<string, string>[];
}

const AdCampaignUploadModal: React.FC<AdCampaignUploadModalProps> = ({
    products,
    salesHistory,
    learnedAliases,
    existingSnapshots,
    budgets,
    platform = 'The Range',
    onConfirm,
    onClose,
}) => {
    const [step, setStep] = useState<Step>('upload');
    const [files, setFiles] = useState<ParsedFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [weekStart, setWeekStart] = useState('');
    const [weekEnd, setWeekEnd] = useState('');
    const [localBudgets, setLocalBudgets] = useState<Record<string, number>>({ ...budgets });
    const [adGroupNames, setAdGroupNames] = useState<string[]>([]);
    const [builtSnapshot, setBuiltSnapshot] = useState<AdSnapshot | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (fileList: FileList) => {
        setError(null);
        setIsProcessing(true);
        const parsed: ParsedFile[] = [];

        for (const file of Array.from(fileList)) {
            const text = await file.text();
            const result = detectAndParseCsv(text);
            parsed.push({ name: file.name, type: result.type, rows: result.rows });
        }

        if (parsed.length === 0) { setError('No files selected.'); setIsProcessing(false); return; }

        const summary = parsed.find(f => f.type === 'summary');
        const detail = parsed.find(f => f.type === 'detail');

        if (!summary && !detail) {
            setError('Could not recognise file format. Expected ad group summary or daily detail CSV.');
            setIsProcessing(false);
            return;
        }

        setFiles(parsed);

        // Extract ad group names from summary
        if (summary) {
            const groups = [...new Set(summary.rows.map(r => r['Ad group']).filter(Boolean))];
            setAdGroupNames(groups);
        }

        // Detect week from detail rows
        if (detail) {
            const detailRows = parseDetailCsv(detail.rows, learnedAliases);
            const { weekStartDate, weekEndDate } = detectWeekFromDetailRows(detailRows);
            setWeekStart(weekStartDate);
            setWeekEnd(weekEndDate);
        } else {
            // Default to last Mon–Sun
            const today = new Date();
            const day = today.getDay();
            const lastMon = new Date(today);
            lastMon.setDate(today.getDate() - ((day + 6) % 7) - 7);
            const lastSun = new Date(lastMon);
            lastSun.setDate(lastMon.getDate() + 6);
            setWeekStart(lastMon.toISOString().split('T')[0]);
            setWeekEnd(lastSun.toISOString().split('T')[0]);
        }

        setIsProcessing(false);
        setStep('budgets');
    }, [learnedAliases]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleBuildSnapshot = useCallback(() => {
        setIsProcessing(true);
        const summary = files.find(f => f.type === 'summary');
        const detail = files.find(f => f.type === 'detail');

        const campaigns: AdCampaign[] = summary
            ? parseSummaryCsv(summary.rows, localBudgets, platform)
            : [];

        const dailySkuData: DailySkuRow[] = detail
            ? parseDetailCsv(detail.rows, learnedAliases)
            : [];

        const prevSnapshot = existingSnapshots
            .filter(s => s.platform === platform)
            .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0] ?? null;

        const snapshot = buildSnapshot(
            platform,
            campaigns,
            dailySkuData,
            weekStart,
            weekEnd,
            prevSnapshot,
            products
        );

        setBuiltSnapshot(snapshot);
        setIsProcessing(false);
        setStep('preview');
    }, [files, localBudgets, learnedAliases, platform, weekStart, weekEnd, existingSnapshots, products]);

    const handleConfirm = useCallback(() => {
        if (!builtSnapshot) return;
        onConfirm(builtSnapshot, localBudgets);
        setStep('done');
    }, [builtSnapshot, localBudgets, onConfirm]);

    const totalSpend = builtSnapshot?.campaigns.reduce((s, c) =>
        s + c.adGroups.reduce((ss, g) => ss + g.spend, 0), 0) ?? 0;
    const totalSales = builtSnapshot?.campaigns.reduce((s, c) =>
        s + c.adGroups.reduce((ss, g) => ss + g.sales, 0), 0) ?? 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
            onClick={onClose}>
            <div className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="font-bold text-gray-900">Upload Ad Campaign Data</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{platform} · {weekStart ? weekLabel(weekStart) : 'Detecting week...'}</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-5">
                    {/* ── STEP: UPLOAD ── */}
                    {step === 'upload' && (
                        <div>
                            <div
                                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/20 transition-all"
                                onClick={() => fileRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={e => e.preventDefault()}
                            >
                                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                <p className="font-medium text-gray-700 text-sm">Drop Campaign CSV files here</p>
                                <p className="text-xs text-gray-400 mt-1">Accepts ad group summary + daily detail CSV (1 or 2 files)</p>
                                <button className="mt-3 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                                    Browse Files
                                </button>
                            </div>
                            <input ref={fileRef} type="file" accept=".csv" multiple className="hidden"
                                onChange={e => e.target.files && handleFiles(e.target.files)} />
                            {isProcessing && (
                                <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Parsing files...
                                </div>
                            )}
                            {error && (
                                <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                                </div>
                            )}
                            <div className="mt-4 text-xs text-gray-400 space-y-1">
                                <p className="font-bold text-gray-500">Expected formats:</p>
                                <p>• <span className="font-mono bg-gray-100 px-1 rounded">Summary CSV</span> — Ad group, Campaign, Account, Impressions, Clicks, Spend, Sales, ROAS...</p>
                                <p>• <span className="font-mono bg-gray-100 px-1 rounded">Detail CSV</span> — Date, Ad group, Offer SKU, Impressions, Clicks, Spend, Sales, Direct Sales...</p>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: BUDGETS ── */}
                    {step === 'budgets' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100">
                                <Check className="w-4 h-4 shrink-0" />
                                <span>
                                    {files.map(f => (
                                        <span key={f.name} className="mr-2">
                                            <span className="font-medium">{f.name}</span>
                                            <span className="ml-1 text-green-600">({f.type})</span>
                                        </span>
                                    ))}
                                </span>
                            </div>

                            <div>
                                <p className="text-sm font-bold text-gray-700 mb-1">Week</p>
                                <div className="flex gap-2">
                                    <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                                        className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono" />
                                    <span className="self-center text-gray-400">→</span>
                                    <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
                                        className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono" />
                                </div>
                            </div>

                            {adGroupNames.length > 0 && (
                                <div>
                                    <p className="text-sm font-bold text-gray-700 mb-2">Daily Budget per Ad Group (£)</p>
                                    <div className="space-y-2">
                                        {adGroupNames.map(name => {
                                            const key = `${platform}::${name}`;
                                            return (
                                                <div key={name} className="flex items-center gap-3">
                                                    <span className="flex-1 text-xs text-gray-600 truncate" title={name}>{name}</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={localBudgets[key] ?? ''}
                                                        placeholder="e.g. 20"
                                                        onChange={e => setLocalBudgets(prev => ({
                                                            ...prev,
                                                            [key]: parseFloat(e.target.value) || 0,
                                                        }))}
                                                        className="w-24 text-xs border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-right"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2">Used to calculate budget utilisation. Pre-filled from previous week.</p>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setStep('upload')} className="flex-1 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                    Back
                                </button>
                                <button onClick={handleBuildSnapshot} disabled={isProcessing}
                                    className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Building...</> : 'Build Snapshot'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: PREVIEW ── */}
                    {step === 'preview' && builtSnapshot && (
                        <div className="space-y-4">
                            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Snapshot Preview</div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                                        <div className="text-lg font-bold text-gray-900">£{totalSpend.toFixed(2)}</div>
                                        <div className="text-[10px] text-gray-400 uppercase">Spend</div>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                                        <div className="text-lg font-bold text-gray-900">£{totalSales.toFixed(2)}</div>
                                        <div className="text-[10px] text-gray-400 uppercase">Sales</div>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                                        <div className="text-lg font-bold text-gray-900">
                                            {totalSpend > 0 ? (totalSales / totalSpend).toFixed(2) : '—'}
                                        </div>
                                        <div className="text-[10px] text-gray-400 uppercase">ROAS</div>
                                    </div>
                                </div>

                                {builtSnapshot.campaigns.map(campaign => (
                                    <div key={campaign.name} className="space-y-1">
                                        <div className="text-xs font-bold text-gray-700">{campaign.name}</div>
                                        {campaign.adGroups.map(group => (
                                            <div key={group.name} className="flex justify-between items-center text-xs text-gray-600 bg-white rounded px-3 py-1.5 border border-gray-100">
                                                <span className="truncate flex-1 mr-2">{group.name}</span>
                                                <span className="font-mono text-gray-400 shrink-0">
                                                    £{group.spend.toFixed(2)} spend · ROAS {group.roasOptIn.toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}

                                {builtSnapshot.dailySkuData.length > 0 && (
                                    <div className="text-xs text-gray-500">
                                        {builtSnapshot.dailySkuData.length} SKU-day rows imported
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setStep('budgets')} className="flex-1 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                    Back
                                </button>
                                <button onClick={handleConfirm}
                                    className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4" /> Confirm Import
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: DONE ── */}
                    {step === 'done' && (
                        <div className="text-center py-6 space-y-3">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <Check className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="font-bold text-gray-900">Snapshot Imported</p>
                            <p className="text-sm text-gray-500">{weekLabel(weekStart)} data saved for {platform}.</p>
                            <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdCampaignUploadModal;
