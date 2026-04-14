
import React, { useState, useCallback } from 'react';
import { RefreshCw, X, CheckCircle, FileText } from 'lucide-react';
import ProductList from '../parts/ProductList';
import {
    Product,
    PricingRules,
    SkuFamily,
    PriceLog,
    OptimalPriceResult,
    BenchmarkUpdateNotice,
    CohortSnapshot,
} from '../../../types';
import { getCanonicalSku } from '../../../services/skuNormalization';
import { formatSmartMoney } from '../../../utils/format';
import { CohortShiftWarning } from '../../../services/cohortAnalysis';
import { ShowcaseSelectionModal } from '../parts/ShowcaseSelectionModal';
import { generateShowcasePdf } from '../../../services/showcasePdfGenerator';

type BenchmarkRecalcMode = 'incremental' | 'full';
type BenchmarkRecalcStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
type BenchmarkRecalcStage = 'IDLE' | 'PREPARING' | 'REBUILDING_COHORTS' | 'CALCULATING_OPTIMAL_PRICES' | 'FINALIZING';

interface BenchmarkRecalcState {
    status: BenchmarkRecalcStatus;
    stage: BenchmarkRecalcStage;
    mode: BenchmarkRecalcMode;
    processed: number;
    total: number;
    elapsedMs: number;
    startedAt: string | null;
    completedAt: string | null;
    summary: string;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface MasterCatalogueTabProps {
    products: Product[];
    skuFamilies: SkuFamily[];
    onEditAliases?: (product: Product) => void;
    onEditTags?: (product: Product) => void;
    onViewShipments?: (sku: string) => void;
    onViewElasticity?: (product: Product, result?: OptimalPriceResult) => void;
    onDeepDive?: (sku: string) => void;
    dateLabels?: { current: string; last: string };
    pricingRules?: PricingRules;
    themeColor: string;
    priceHistoryMap: Map<string, PriceLog[]>;
    // Optimal pricing
    optimalPriceResults?: Map<string, OptimalPriceResult>;
    benchmarkUpdateNotices?: BenchmarkUpdateNotice[];
    onRecalculateBenchmarks?: (options?: { mode?: BenchmarkRecalcMode; categories?: string[] }) => Promise<CohortShiftWarning[]>;
    benchmarkRecalcState?: BenchmarkRecalcState;
    cohortSnapshot?: CohortSnapshot | null;
    onStampLandedAt?: (skus: string[], date: string) => void;
}

// ─────────────────────────────────────────────
// Confidence Badge (inline, used in optimal price column)
// ─────────────────────────────────────────────

const ConfidenceBadge: React.FC<{ confidence: number; source: string }> = ({ confidence, source }) => {
    if (source === 'COHORT' || confidence < 0.3) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-gray-300 text-gray-500">Benchmark</span>;
    }
    if (confidence >= 0.9) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-700">High</span>;
    }
    if (confidence >= 0.5) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-700">Medium</span>;
    }
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500">Low</span>;
};

// ─────────────────────────────────────────────
// Benchmark Shifts Review Modal
// ─────────────────────────────────────────────

interface ShiftReviewModalProps {
    shifts: CohortShiftWarning[];
    rebuiltCategories: string[];
    onAccept: () => void;
    onCancel: () => void;
}

const ShiftReviewModal: React.FC<ShiftReviewModalProps> = ({ shifts, rebuiltCategories, onAccept, onCancel }) => (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Price Benchmarks Updated</h3>
            </div>

            <div className="p-6 space-y-4">
                <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rebuilt</div>
                    <div className="text-sm text-gray-700">{rebuiltCategories.join(', ') || 'All categories'}</div>
                </div>

                {shifts.length > 0 ? (
                    <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                            {shifts.length} SKU{shifts.length > 1 ? 's' : ''} moved to a different price range
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {shifts.map((s, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                                    <span className="font-mono font-bold text-gray-800 min-w-[120px]">{s.sku}</span>
                                    <span className="text-gray-400">{s.category}</span>
                                    <span className="ml-auto flex items-center gap-1 text-gray-600">
                                        <span className="text-gray-400">{s.oldBucket}</span>
                                        <span className="text-gray-400">→</span>
                                        <span className="font-bold text-theme">{s.newBucket}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Optimal prices for affected SKUs will be updated.</p>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No SKUs changed price buckets.</p>
                )}
            </div>

            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={onAccept}
                    className="px-4 py-2 text-sm font-bold text-white bg-theme hover:bg-theme rounded-lg transition-colors shadow-sm"
                >
                    Accept &amp; Update
                </button>
            </div>
        </div>
    </div>
);

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export const MasterCatalogueTab: React.FC<MasterCatalogueTabProps> = ({
    products,
    skuFamilies,
    onEditAliases,
    onEditTags,
    onViewShipments,
    onViewElasticity,
    onDeepDive,
    dateLabels,
    pricingRules,
    themeColor,
    priceHistoryMap,
    optimalPriceResults,
    benchmarkUpdateNotices,
    onRecalculateBenchmarks,
    benchmarkRecalcState,
    cohortSnapshot,
    onStampLandedAt,
}) => {
    const [shiftReview, setShiftReview] = useState<{
        shifts: CohortShiftWarning[];
        rebuiltCategories: string[];
    } | null>(null);
    const [showShowcaseModal, setShowShowcaseModal] = useState(false);

    // ── Setup benchmark handler (first-time button)
    const isBenchmarkRunning = benchmarkRecalcState?.status === 'running';
    const handleSetupBenchmarks = useCallback(async () => {
        if (!onRecalculateBenchmarks) return;
        const shifts = await onRecalculateBenchmarks({ mode: 'full' });
        const cats = Array.from(new Set(shifts.map(s => s.category)));
        setShiftReview({ shifts, rebuiltCategories: cats.length > 0 ? cats : ['All categories'] });
    }, [onRecalculateBenchmarks]);

    // ── Recalculate button handler
    const handleRecalculate = useCallback(async () => {
        if (!onRecalculateBenchmarks) return;
        const categories = benchmarkUpdateNotices?.map(n => n.category) ?? [];
        const shifts = await onRecalculateBenchmarks({ mode: 'incremental', categories });
        setShiftReview({ shifts, rebuiltCategories: categories.length > 0 ? categories : ['Incremental scope'] });
    }, [onRecalculateBenchmarks, benchmarkUpdateNotices]);

    const handleFullRebuild = useCallback(async () => {
        if (!onRecalculateBenchmarks) return;
        const shifts = await onRecalculateBenchmarks({ mode: 'full' });
        const cats = benchmarkUpdateNotices?.map(n => n.category) ?? [];
        setShiftReview({ shifts, rebuiltCategories: cats.length > 0 ? cats : ['All categories'] });
    }, [onRecalculateBenchmarks, benchmarkUpdateNotices]);

    const handleAcceptShifts = useCallback(() => {
        setShiftReview(null);
    }, []);

    const noticeCount = benchmarkUpdateNotices?.length ?? 0;

    return (
        <div className="flex flex-col gap-4">

            {/* ── First-time setup banner */}
            {!cohortSnapshot && (
                <div className="p-4 bg-theme-10 border border-theme-20 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-indigo-900">⚙ Price Benchmarks not yet calculated</div>
                        <div className="text-xs text-theme mt-0.5">
                            Build benchmarks to enable optimal pricing across all SKUs
                        </div>
                    </div>
                    {onRecalculateBenchmarks && (
                        <button
                            onClick={handleSetupBenchmarks}
                            disabled={isBenchmarkRunning}
                            className="px-4 py-2 bg-theme text-white text-sm font-bold rounded-lg hover:bg-theme transition-colors shadow-sm whitespace-nowrap ml-4 disabled:opacity-50 disabled:cursor-wait"
                        >
                            Calculate Price Benchmarks &amp; Optimal Prices
                        </button>
                    )}
                </div>
            )}

            {/* ── Toolbar: recalculate button + showcase button */}
            {cohortSnapshot && onRecalculateBenchmarks && (
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setShowShowcaseModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Generate Weekly Report
                    </button>
                    <div className="relative group">
                        <button
                            onClick={handleRecalculate}
                            disabled={isBenchmarkRunning}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-wait"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBenchmarkRunning ? 'animate-spin' : ''}`} />
                            Recalculate Price Benchmarks
                            {noticeCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                                    {noticeCount}
                                </span>
                            )}
                        </button>

                        {/* Warning tooltip */}
                        {noticeCount > 0 && benchmarkUpdateNotices && (
                            <div className="absolute top-full right-0 mt-2 w-72 p-3 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50 pointer-events-none">
                                <div className="font-bold mb-2">{noticeCount} {noticeCount === 1 ? 'category' : 'categories'} may need updating:</div>
                                {benchmarkUpdateNotices.map(n => (
                                    <div key={n.category} className="flex justify-between py-0.5 text-gray-300">
                                        <span>{n.category}</span>
                                        <span className="text-gray-500">
                                            {n.reason === 'new_sku' ? 'New SKU' : 'Price shift'} ({n.skuCount})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleFullRebuild}
                        disabled={isBenchmarkRunning}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-wait"
                    >
                        Full Rebuild
                    </button>
                </div>
            )}

            {/* ── Product table */}
            <ProductList
                products={products}
                skuFamilies={skuFamilies}
                onEditAliases={onEditAliases}
                onEditTags={onEditTags}
                onViewShipments={onViewShipments}
                onViewElasticity={onViewElasticity}
                onDeepDive={onDeepDive}
                pricingRules={pricingRules}
                themeColor={themeColor}
                priceHistoryMap={priceHistoryMap}
                optimalPriceResults={optimalPriceResults}
            />

            {/* ── Showcase selection modal */}
            {showShowcaseModal && (
                <ShowcaseSelectionModal
                    products={products}
                    cohortSnapshot={cohortSnapshot ?? null}
                    themeColor={themeColor}
                    onClose={() => setShowShowcaseModal(false)}
                    onStampLandedAt={onStampLandedAt}
                    onGenerate={(selectedSkus) => {
                        setShowShowcaseModal(false);
                        generateShowcasePdf(selectedSkus, products, cohortSnapshot ?? null, themeColor);
                    }}
                />
            )}

            {/* ── Shift review modal */}
            {shiftReview && (
                <ShiftReviewModal
                    shifts={shiftReview.shifts}
                    rebuiltCategories={shiftReview.rebuiltCategories}
                    onAccept={handleAcceptShifts}
                    onCancel={() => setShiftReview(null)}
                />
            )}
        </div>
    );
};
