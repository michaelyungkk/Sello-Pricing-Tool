import { logRuntimeDebug, warnRuntimeDebug } from './runtimeDebug';

export const perfNowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const perfElapsedMs = (startedAt: number) => Number((perfNowMs() - startedAt).toFixed(1));

export const logPerfPostCommitTail = (
    label: string,
    startedAt: number,
    detail: Record<string, unknown> = {}
) => {
    setTimeout(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                logRuntimeDebug(`${label} post-commit tail`, {
                    elapsedMs: perfElapsedMs(startedAt),
                    ...detail
                });
            });
        });
    }, 0);
};

let uiResponsivenessObserverStarted = false;
let lastLongTaskEndedAt = 0;
let applySettleTokenCounter = 0;

const ensureUiResponsivenessObserver = () => {
    if (uiResponsivenessObserverStarted) return;
    uiResponsivenessObserverStarted = true;
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = Array.isArray((PerformanceObserver as any).supportedEntryTypes)
        ? (PerformanceObserver as any).supportedEntryTypes
        : [];
    if (!supported.includes('longtask')) return;
    try {
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const latest = entries[entries.length - 1];
            if (!latest) return;
            lastLongTaskEndedAt = latest.startTime + latest.duration;
        });
        observer.observe({ entryTypes: ['longtask'] });
    } catch {
        // Ignore observer setup failures and fall back to paint-based waiting only.
    }
};

const waitForResponsivePaint = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
        setTimeout(resolve, 32);
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
    });
});

const sampleEventLoopLag = async (delayMs: number = 80) => {
    const startedAt = perfNowMs();
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return perfNowMs() - startedAt - delayMs;
};

const waitForBrowserIdle = async (timeoutMs: number = 250) => {
    if (typeof window === 'undefined' || typeof (window as any).requestIdleCallback !== 'function') {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(timeoutMs, 100)));
        return false;
    }
    return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finalize = (value: boolean) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const idleId = (window as any).requestIdleCallback(() => finalize(true), { timeout: timeoutMs });
        setTimeout(() => {
            try {
                (window as any).cancelIdleCallback?.(idleId);
            } catch {
                // Ignore idle callback cancellation failures.
            }
            finalize(false);
        }, timeoutMs + 20);
    });
};

const sampleImmediateTurnLag = async () => {
    const startedAt = perfNowMs();
    await new Promise<void>((resolve) => {
        if (typeof MessageChannel === 'undefined') {
            setTimeout(resolve, 0);
            return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
    });
    return perfNowMs() - startedAt;
};

const readAppBusySignal = () => {
    if (typeof window === 'undefined') {
        return { busy: false, reasons: [] as string[], updatedAt: 0 };
    }
    return {
        busy: Boolean((window as any).__selloAppBusy),
        reasons: Array.isArray((window as any).__selloAppBusyReasons) ? (window as any).__selloAppBusyReasons as string[] : [],
        updatedAt: typeof (window as any).__selloAppBusyUpdatedAt === 'number'
            ? (window as any).__selloAppBusyUpdatedAt as number
            : 0
    };
};

const readOverviewBusySignal = () => {
    if (typeof window === 'undefined') {
        return { busy: false, reason: null as string | null, updatedAt: 0 };
    }
    return {
        busy: Boolean((window as any).__selloOverviewBusy),
        reason: typeof (window as any).__selloOverviewBusyReason === 'string'
            ? (window as any).__selloOverviewBusyReason as string
            : null,
        updatedAt: typeof (window as any).__selloOverviewBusyUpdatedAt === 'number'
            ? (window as any).__selloOverviewBusyUpdatedAt as number
            : 0
    };
};

const readActiveViewSignal = () => {
    if (typeof window === 'undefined') return null;
    return typeof (window as any).__selloActiveView === 'string'
        ? (window as any).__selloActiveView as string
        : null;
};

const beginVisiblePageSettleHandshake = (label: string) => {
    if (typeof window === 'undefined') return null;
    const activeView = readActiveViewSignal();
    if (activeView !== 'overview') return null;
    const token = ++applySettleTokenCounter;
    (window as any).__selloPendingApplySettleToken = token;
    (window as any).__selloPendingApplySettleView = activeView;
    (window as any).__selloPendingApplySettleLabel = label;
    (window as any).__selloPendingApplySettleUpdatedAt = perfNowMs();
    (window as any).__selloSettledApplyToken = null;
    (window as any).__selloSettledApplyView = null;
    (window as any).__selloSettledApplyUpdatedAt = 0;
    (window as any).__selloSettledApplyMeta = null;
    return { token, view: activeView };
};

const readVisiblePageSettleState = () => {
    if (typeof window === 'undefined') {
        return {
            pendingToken: null as number | null,
            pendingView: null as string | null,
            pendingUpdatedAt: 0,
            settledToken: null as number | null,
            settledView: null as string | null,
            settledUpdatedAt: 0
        };
    }
    return {
        pendingToken: typeof (window as any).__selloPendingApplySettleToken === 'number'
            ? (window as any).__selloPendingApplySettleToken as number
            : null,
        pendingView: typeof (window as any).__selloPendingApplySettleView === 'string'
            ? (window as any).__selloPendingApplySettleView as string
            : null,
        pendingUpdatedAt: typeof (window as any).__selloPendingApplySettleUpdatedAt === 'number'
            ? (window as any).__selloPendingApplySettleUpdatedAt as number
            : 0,
        settledToken: typeof (window as any).__selloSettledApplyToken === 'number'
            ? (window as any).__selloSettledApplyToken as number
            : null,
        settledView: typeof (window as any).__selloSettledApplyView === 'string'
            ? (window as any).__selloSettledApplyView as string
            : null,
        settledUpdatedAt: typeof (window as any).__selloSettledApplyUpdatedAt === 'number'
            ? (window as any).__selloSettledApplyUpdatedAt as number
            : 0
    };
};

export const waitForUiResponsiveAfterApply = async (
    label: string,
    startedAt: number,
    detail: Record<string, unknown> = {},
    minQuietMs: number = 2600,
    maxWaitMs: number = 25000
) => {
    ensureUiResponsivenessObserver();
    await waitForResponsivePaint();
    const visibleSettleHandshake = beginVisiblePageSettleHandshake(label);
    const requiredQuietMs = visibleSettleHandshake ? Math.max(minQuietMs, 3600) : minQuietMs;
    const settleWindowStartedAt = perfNowMs();
    const deadline = perfNowMs() + maxWaitMs;
    const getSettleAnchor = (
        appBusyState: { updatedAt: number },
        overviewBusyState: { updatedAt: number },
        visibleSettleState: { pendingUpdatedAt: number; settledUpdatedAt: number }
    ) => Math.max(
        settleWindowStartedAt,
        lastLongTaskEndedAt >= settleWindowStartedAt ? lastLongTaskEndedAt : settleWindowStartedAt,
        appBusyState.updatedAt >= settleWindowStartedAt ? appBusyState.updatedAt : settleWindowStartedAt,
        overviewBusyState.updatedAt >= settleWindowStartedAt ? overviewBusyState.updatedAt : settleWindowStartedAt,
        visibleSettleState.pendingUpdatedAt >= settleWindowStartedAt ? visibleSettleState.pendingUpdatedAt : settleWindowStartedAt,
        visibleSettleState.settledUpdatedAt >= settleWindowStartedAt ? visibleSettleState.settledUpdatedAt : settleWindowStartedAt
    );

    let polls = 0;
    let consecutiveHealthySamples = 0;
    let worstLagMs = 0;
    let worstImmediateLagMs = 0;
    let idleHits = 0;
    let appBusyHits = 0;
    let lastBusyReasons: string[] = [];
    let overviewBusyHits = 0;
    let lastOverviewBusyReason: string | null = null;

    while (perfNowMs() < deadline) {
        polls++;
        const lagMs = await sampleEventLoopLag();
        worstLagMs = Math.max(worstLagMs, lagMs);

        const idleHit = await waitForBrowserIdle(220);
        if (idleHit) idleHits++;

        if (lagMs <= 35) {
            consecutiveHealthySamples++;
        } else {
            consecutiveHealthySamples = 0;
        }

        const appBusyState = readAppBusySignal();
        const overviewBusyState = readOverviewBusySignal();
        const visibleSettleState = readVisiblePageSettleState();
        const settleAnchor = getSettleAnchor(appBusyState, overviewBusyState, visibleSettleState);
        const quietMs = perfNowMs() - settleAnchor;
        const visibleSettleSatisfied = !visibleSettleHandshake
            || (
                visibleSettleState.settledToken === visibleSettleHandshake.token
                && visibleSettleState.settledView === visibleSettleHandshake.view
            );

        if (appBusyState.busy) {
            appBusyHits++;
            lastBusyReasons = appBusyState.reasons;
        }
        if (overviewBusyState.busy) {
            overviewBusyHits++;
            lastOverviewBusyReason = overviewBusyState.reason;
        }

        if (visibleSettleHandshake && !visibleSettleSatisfied) {
            consecutiveHealthySamples = 0;
            idleHits = 0;
            await new Promise<void>((resolve) => setTimeout(resolve, 120));
            continue;
        }

        if (!appBusyState.busy && !overviewBusyState.busy && quietMs >= requiredQuietMs && consecutiveHealthySamples >= 6 && idleHits >= 3) {
            await waitForResponsivePaint();
            const confirmedLagMs = await sampleEventLoopLag(40);
            worstLagMs = Math.max(worstLagMs, confirmedLagMs);
            const immediateLagMs = await sampleImmediateTurnLag();
            worstImmediateLagMs = Math.max(worstImmediateLagMs, immediateLagMs);
            const finalAppBusyState = readAppBusySignal();
            const finalOverviewBusyState = readOverviewBusySignal();
            const finalVisibleSettleState = readVisiblePageSettleState();
            const finalVisibleSettleSatisfied = !visibleSettleHandshake
                || (
                    finalVisibleSettleState.settledToken === visibleSettleHandshake.token
                    && finalVisibleSettleState.settledView === visibleSettleHandshake.view
                );

            if (!finalAppBusyState.busy && !finalOverviewBusyState.busy && finalVisibleSettleSatisfied && confirmedLagMs <= 16 && immediateLagMs <= 12) {
                logRuntimeDebug(`${label} responsive`, {
                    elapsedMs: perfElapsedMs(startedAt),
                    quietMs: Number(quietMs.toFixed(1)),
                    requiredQuietMs,
                    settleWindowMs: Number((perfNowMs() - settleWindowStartedAt).toFixed(1)),
                    lagMs: Number(confirmedLagMs.toFixed(1)),
                    immediateLagMs: Number(immediateLagMs.toFixed(1)),
                    worstLagMs: Number(worstLagMs.toFixed(1)),
                    worstImmediateLagMs: Number(worstImmediateLagMs.toFixed(1)),
                    idleHits,
                    appBusyHits,
                    overviewBusyHits,
                    visibleSettleToken: visibleSettleHandshake?.token || null,
                    polls,
                    ...detail
                });
                return;
            }

            consecutiveHealthySamples = 0;
            idleHits = 0;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 120));
    }

    warnRuntimeDebug(`${label} responsive timeout`, {
        elapsedMs: perfElapsedMs(startedAt),
        quietMs: Number((perfNowMs() - getSettleAnchor(readAppBusySignal(), readOverviewBusySignal(), readVisiblePageSettleState())).toFixed(1)),
        requiredQuietMs,
        settleWindowMs: Number((perfNowMs() - settleWindowStartedAt).toFixed(1)),
        worstLagMs: Number(worstLagMs.toFixed(1)),
        worstImmediateLagMs: Number(worstImmediateLagMs.toFixed(1)),
        idleHits,
        appBusyHits,
        lastBusyReasons,
        overviewBusyHits,
        lastOverviewBusyReason,
        polls,
        ...detail
    });
};
