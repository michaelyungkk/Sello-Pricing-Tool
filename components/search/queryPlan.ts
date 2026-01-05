
import { MetricId, TimePresetId } from './types';

export type TimePreset = TimePresetId;

export interface QueryFilter {
  field: string;
  op: "GT" | "LT" | "GTE" | "LTE" | "EQ" | "CONTAINS";
  value: any;
}

export interface QuerySort {
  field: string;
  direction: "ASC" | "DESC";
}

export interface QueryPlan {
  metrics: string[];
  primaryMetric: string;
  groupBy: "PLATFORM" | "SKU" | "DATE";
  timePreset: TimePreset;
  platforms?: string[];
  filters: QueryFilter[];
  sort: QuerySort;
  limit: number;
  viewHint: "SUMMARY_CARDS" | "TABLE" | "RANKED_LIST";
  explain: string;
}

export type { MetricId };
