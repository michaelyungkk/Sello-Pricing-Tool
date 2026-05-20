const PERF_DEBUG_STORAGE_KEY = 'sello_perf_debug';
const RUNTIME_DEBUG_STORAGE_KEY = 'sello_runtime_debug';

const readStorageFlag = (key: string) => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(key) === 'true';
    } catch {
        return false;
    }
};

export const isPerfDebugEnabled = () => {
    if (typeof window === 'undefined') return false;
    return (window as any).__selloPerfDebug === true || readStorageFlag(PERF_DEBUG_STORAGE_KEY);
};

export const isRuntimeDebugEnabled = () => {
    if (typeof window === 'undefined') return false;
    return (
        (window as any).__selloRuntimeDebug === true ||
        readStorageFlag(RUNTIME_DEBUG_STORAGE_KEY) ||
        isPerfDebugEnabled()
    );
};

export const logRuntimeDebug = (...args: unknown[]) => {
    if (!isRuntimeDebugEnabled()) return;
    console.log(...args);
};

export const warnRuntimeDebug = (...args: unknown[]) => {
    if (!isRuntimeDebugEnabled()) return;
    console.warn(...args);
};

export const errorRuntimeDebug = (...args: unknown[]) => {
    if (!isRuntimeDebugEnabled()) return;
    console.error(...args);
};
