import { useEffect, useRef } from 'react';
import { isPerfDebugEnabled } from './runtimeDebug';

export const perfNowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type PagePerfDetails = Record<string, unknown>;

export const logPerf = (...args: unknown[]) => {
    if (!isPerfDebugEnabled()) return;
    console.log(...args);
};

export const warnPerf = (...args: unknown[]) => {
    if (!isPerfDebugEnabled()) return;
    console.warn(...args);
};

export const usePagePerfLogger = (
    page: string,
    viewKey: string,
    reportKey: string,
    details: PagePerfDetails,
    enabled: boolean = true,
    startedAtMs?: number
) => {
    const lastReportKeyRef = useRef<string>('');
    const activationCountRef = useRef(0);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || !reportKey || !isPerfDebugEnabled()) return;
        const activeView = typeof (window as any).__selloActiveView === 'string'
            ? (window as any).__selloActiveView as string
            : '';
        if (activeView !== viewKey) return;
        if (lastReportKeyRef.current === reportKey) return;

        lastReportKeyRef.current = reportKey;
        activationCountRef.current += 1;
        const activation = activationCountRef.current;
        const startedAt = startedAtMs ?? perfNowMs();
        const settleStartedAt = perfNowMs();
        let cancelled = false;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (cancelled) return;
                logPerf('[perf][page] settled', {
                    page,
                    view: viewKey,
                    activation,
                    firstActivation: activation === 1,
                    elapsedMs: Number((perfNowMs() - startedAt).toFixed(1)),
                    settleTailMs: Number((perfNowMs() - settleStartedAt).toFixed(1)),
                    ...details
                });
            });
        });

        return () => {
            cancelled = true;
        };
    }, [enabled, page, viewKey, reportKey, details, startedAtMs]);
};
