#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const read = (relPath) => {
  const abs = path.join(repoRoot, relPath);
  return fs.readFileSync(abs, 'utf8');
};

const assertContains = (content, needle, message) => {
  if (!content.includes(needle)) {
    throw new Error(message + `\nMissing snippet: ${needle}`);
  }
};

const assertNotContains = (content, needle, message) => {
  if (content.includes(needle)) {
    throw new Error(message + `\nFound forbidden snippet: ${needle}`);
  }
};

const run = () => {
  // Guard 1: important refresh token flow in sync
  const appState = read('hooks/useAppState.ts');
  assertContains(
    appState,
    "const FORCE_FULL_PULL_TOKEN_KEY = 'sello_last_force_full_pull_token';",
    'useAppState missing force-full-pull token key setup'
  );
  assertContains(
    appState,
    'const forceImportantRefresh = Boolean(remoteForceToken && remoteForceToken !== localForceToken);',
    'useAppState missing token-diff activation logic'
  );
  assertContains(
    appState,
    'if (!forceImportantRefresh && localNewestDate && cachedTransactions.length > 0) {',
    'useAppState incremental transaction gate not protected by forceImportantRefresh'
  );
  assertContains(
    appState,
    'const lastRefundUpdatedAt = forceImportantRefresh',
    'useAppState refunds cursor is not bypassed during important refresh'
  );
  assertContains(
    appState,
    'localStorage.setItem(FORCE_FULL_PULL_TOKEN_KEY, remoteForceToken);',
    'useAppState missing consumed-token persistence after important refresh'
  );

  // Guard 2: named label renderer for PricingHistorySection (lint regression)
  const pricingHistory = read('components/skuDeepDive/sections/PricingHistorySection.tsx');
  assertContains(
    pricingHistory,
    'function ProfitLabelRenderer(props: any): React.ReactElement {',
    'PricingHistorySection missing named ProfitLabelRenderer function'
  );
  assertNotContains(
    pricingHistory,
    ') => (props: any) => {',
    'PricingHistorySection reverted to anonymous inline label renderer'
  );

  console.log('[recent-guards] OK');
};

try {
  run();
} catch (err) {
  console.error('[recent-guards] FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

