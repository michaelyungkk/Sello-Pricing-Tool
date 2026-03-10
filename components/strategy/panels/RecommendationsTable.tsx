import React, { useState } from 'react';
import { GradeBadge } from '../../GradeBadge';
import { FilterBar } from '../../common/FilterBar';
import { SortableHeader } from '../../common/SortableHeader';
import { SortState } from '../../../utils/tableSort';
import { Eye, EyeOff, AlertCircle, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { SkuFamily, Product } from '../../../types';
import { VAT_MULTIPLIER } from '../../../constants';

interface RecommendationsTableProps {
  paginatedData: any[];
  totalCount: number;
  currentPage: number;
  setCurrentPage: (p: number | ((prev: number) => number)) => void;
  itemsPerPage: number;
  setItemsPerPage: (n: number) => void;
  totalPages: number;
  sort: SortState<string> | null;
  setSort: (s: SortState<string> | null) => void;
  filterTab: string;
  setFilterTab: (t: any) => void;
  showOOS: boolean;
  setShowOOS: (b: boolean) => void;
  searchTags: string[];
  setSearchTags: (t: string[]) => void;
  setSearchQuery: (q: string) => void;
  themeColor: string;
  showAudit?: boolean;
  auditActive?: boolean;
  onAuditToggle?: () => void;
  skuFamilies: SkuFamily[];
  products: Product[];
}

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({
  paginatedData,
  totalCount,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  totalPages,
  sort,
  setSort,
  filterTab,
  setFilterTab,
  showOOS,
  setShowOOS,
  searchTags,
  setSearchTags,
  setSearchQuery,
  themeColor,
  showAudit,
  auditActive,
  onAuditToggle,
  skuFamilies = [],
  products = [],
}) => {

  const [activeFamilyTooltip, setActiveFamilyTooltip] = useState<string | null>(null);

  const getRunwayBin = (days: number, stockLevel: number, leadTime: number) => {
    if (stockLevel <= 0) return { label: 'Out of Stock', cls: 'sello-badge badge-run-crit' };
    if (days > 730)      return { label: '> 2 Years',    cls: 'sello-badge badge-run-ok' };

    let label = 'Healthy';
    let cls   = 'sello-badge badge-run-ok';

    if (days < leadTime) {
      label = 'Critical';
      cls   = 'sello-badge badge-run-crit';
    } else if (days < leadTime * 1.5) {
      label = 'Warning';
      cls   = 'sello-badge badge-run-warn';
    } else if (days > leadTime * 4) {
      label = 'Overstock';
      cls   = 'sello-badge badge-run-over';
    }

    const weeks = days / 7;
    return { label: `${weeks.toFixed(1)} Weeks`, cls };
  };

  return (
    <div>
      {/* ── Filter Bar ── */}
      <FilterBar
        searchValue={searchTags[0] || ''}
        onSearchChange={val => { setSearchTags([val]); setSearchQuery(val); setCurrentPage(1); }}
        searchPlaceholder="Filter by SKU or Alias…"
        pillGroup={{
          options: [
            { key: 'All',      label: 'All' },
            { key: 'INCREASE', label: 'Increase' },
            { key: 'DECREASE', label: 'Decrease' },
            { key: 'MAINTAIN', label: 'Maintain' },
          ],
          active: filterTab,
          onChange: setFilterTab,
        }}
        toggles={[{
          key:         'oos',
          label:       'OOS Hidden',
          activeLabel: 'OOS Shown',
          icon:        EyeOff,
          activeIcon:  Eye,
          active:      showOOS,
          onChange:    setShowOOS,
        }]}
        showAudit={showAudit}
        auditActive={auditActive}
        onAuditToggle={onAuditToggle}
        rightSlot={
          <div style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>
            Showing <strong>{totalCount}</strong> SKUs
          </div>
        }
      />

      {/* ── Table ── */}
      <div className="sello-table-wrap">
        <div className="sello-table-scroll">
          <table className="sello-table">
            <thead>
              <tr>
                <SortableHeader label="Product"             sortKey="sku"           sort={sort} onChange={setSort} />
                <SortableHeader label="Runway / Velocity"   sortKey="runway"        sort={sort} onChange={setSort} align="right" />
                <SortableHeader label="Inventory"           sortKey="inventory"     sort={sort} onChange={setSort} align="right" />
                <SortableHeader label="Recent Avg Price"    sortKey="avgPrice"      sort={sort} onChange={setSort} align="right" tint="blue" />
                <SortableHeader label="Recent Sales £"      sortKey="sales"         sort={sort} onChange={setSort} align="right" tint="blue" />
                <SortableHeader label="Recent Qty"          sortKey="qty"           sort={sort} onChange={setSort} align="right" tint="blue" />
                <SortableHeader label="Net PM%"             sortKey="margin"        sort={sort} onChange={setSort} align="right" tint="green" />
                <SortableHeader label="Changes 30D"         sortKey="recentChanges" sort={sort} onChange={setSort} align="center" />
                <SortableHeader label="CA Price"            sortKey="caPrice"       sort={sort} onChange={setSort} align="right" tint="ca" />
                <SortableHeader label="New Price"           sortKey="newPrice"      sort={sort} onChange={setSort} align="right" />
                <th className="c">Action</th>
                <th>Reason</th>
              </tr>
            </thead>

            <tbody>
              {paginatedData.map((row: any) => {
                const rowCls = row.safetyViolation ? 'row-warn' : '';

                return (
                  <tr key={row.id} className={rowCls}>
                    {/* Product cell */}
                    <td style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#111827', letterSpacing: '-0.2px' }}>
                          {row.sku}
                        </span>
                        <GradeBadge gradeLevel={row.gradeLevel} />

                        {/* Family group badge */}
                        {(() => {
                          const family = skuFamilies.find(f => f.memberSkus.includes(row.sku));
                          if (!family) return null;
                          const siblings = family.memberSkus.filter(s => s !== row.sku);
                          return (
                            <div
                              style={{ marginLeft: 2, position: 'relative' }}
                              onMouseEnter={() => setActiveFamilyTooltip(row.sku)}
                              onMouseLeave={() => setActiveFamilyTooltip(null)}
                            >
                              <div style={{
                                width: 17, height: 17, borderRadius: 4,
                                background: 'var(--theme-10)', border: '1px solid var(--theme-20)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'help',
                              }}>
                                <Layers style={{ width: 9, height: 9, color: 'var(--theme)' }} />
                              </div>
                              {/* Tooltip */}
                              <div style={{
                                position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                                width: 280, padding: 12, background: '#111827', color: 'white',
                                fontSize: 11, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                opacity: activeFamilyTooltip === row.sku ? 1 : 0,
                                pointerEvents: 'none', zIndex: 100,
                                transition: 'opacity 150ms',
                              }}>
                                <div style={{ fontWeight: 700, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Layers style={{ width: 12, height: 12, color: '#818cf8' }} />
                                  Family: {family.name}
                                </div>
                                {siblings.length > 0 ? siblings.map(s => {
                                  const prod = products.find(p => p.sku === s);
                                  const price = prod ? (prod.caPrice || prod.currentPrice * VAT_MULTIPLIER) : 0;
                                  return (
                                    <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginBottom: 3 }}>
                                      <span style={{ color: '#d1d5db' }}>{s}</span>
                                      <span style={{ fontWeight: 700, color: '#a5b4fc', fontFamily: 'monospace' }}>£{formatMoney(price, 2, '')}</span>
                                    </div>
                                  );
                                }) : <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No sibling SKUs</div>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                        {row.name}
                      </div>

                      {/* Tags */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {row.subcategory && (
                          <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'rgba(241,245,249,0.9)', color: '#64748b', border: '1px solid rgba(226,232,240,0.8)' }}>
                            {row.subcategory}
                          </span>
                        )}
                        {row.seasonTags?.slice(0, 2).map((tag: string) => (
                          <span key={tag} style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'rgba(241,245,249,0.9)', color: '#64748b', border: '1px solid rgba(226,232,240,0.8)' }}>
                            {tag}
                          </span>
                        ))}
                        {(row.seasonTags?.length || 0) > 2 && (
                          <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'rgba(241,245,249,0.9)', color: '#9ca3af', border: '1px solid rgba(226,232,240,0.8)' }}>
                            +{(row.seasonTags?.length || 0) - 2}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Runway / Velocity */}
                    <td className="r">
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {(() => {
                          const bin = getRunwayBin(row.runwayDays, row.stockLevel, row.leadTimeDays);
                          return <span className={bin.cls}>{bin.label}</span>;
                        })()}
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>
                          {formatNumber(row.dailyVelocity, 1)} / day
                        </span>
                      </div>
                    </td>

                    {/* Inventory */}
                    <td className="r">
                      <span className="v-num">{row.stockLevel}</span>
                    </td>

                    {/* Recent Avg Price — blue tint */}
                    <td className="r col-blue">
                      <span className="v-num">£{formatMoney(row.averagePrice, 2, '')}</span>
                    </td>

                    {/* Recent Sales — blue tint */}
                    <td className="r col-blue">
                      <span className="v-num">£{formatNumber(row.recentTotalSales, 2)}</span>
                    </td>

                    {/* Recent Qty — blue tint */}
                    <td className="r col-blue">
                      <span className="v-num v-bold">{formatNumber(row.recentTotalQty, 0)}</span>
                    </td>

                    {/* Net PM% — green tint */}
                    <td className="r col-green">
                      <span
                        className={`v-num v-hint${row.netPmPercent < 0 ? ' v-neg' : ''}`}
                        title={`Profit: £${formatMoney(row.totalProfit, 4, '')} / Sales: £${formatNumber(row.recentTotalSales, 2)}`}
                      >
                        {formatPct(row.netPmPercent, 1)}
                      </span>
                    </td>

                    {/* Changes 30D */}
                    <td className="c">
                      {row.recentChanges && Array.isArray(row.recentChanges) && row.recentChanges.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          title="History (30D): Oldest → Newest">
                          {row.recentChanges.map((type: string | null, idx: number) => {
                            if (type === 'INCREASE') return (
                              <span key={idx}><ArrowUpRight style={{ width: 14, height: 14 }} className="arr-up" strokeWidth={3} /></span>
                            );
                            if (type === 'DECREASE') return (
                              <span key={idx}><ArrowDownRight style={{ width: 14, height: 14 }} className="arr-dn" strokeWidth={3} /></span>
                            );
                            return <span key={idx} className="arr-nt" style={{ fontSize: 11, fontFamily: 'monospace' }}>–</span>;
                          })}
                        </div>
                      ) : (
                        <span className="v-dim">–</span>
                      )}
                    </td>

                    {/* CA Price — purple */}
                    <td className="r">
                      <span className="v-ca">
                        {row.caPrice ? `£${formatMoney(row.caPrice, 2, '')}` : <span className="v-dim">—</span>}
                      </span>
                    </td>

                    {/* New Price */}
                    <td className="r">
                      {row.action !== 'MAINTAIN' ? (
                        <span className="v-num v-bold">
                          £{formatMoney(row.adjustedPrice, 2, '')}
                        </span>
                      ) : <span className="v-dim">—</span>}
                      {row.safetyViolation && (
                        <AlertCircle style={{ width: 13, height: 13, color: '#dc2626', display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
                      )}
                    </td>

                    {/* Action */}
                    <td className="c">
                      {row.action === 'INCREASE' && <span className="sello-badge badge-increase">INCREASE</span>}
                      {row.action === 'DECREASE' && <span className="sello-badge badge-decrease">DECREASE</span>}
                      {row.action === 'MAINTAIN' && <span className="sello-badge badge-maintain">MAINTAIN</span>}
                    </td>

                    {/* Reason */}
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, color: '#9ca3af' }} title={row.reasoning}>
                      {row.inPromotion && (
                        <span style={{ color: 'var(--theme)', fontWeight: 700, marginRight: 4 }}>[PROMO]</span>
                      )}
                      {row.reasoning}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Table Footer ── */}
        {totalCount > 0 && (
          <div className="sello-table-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#6b7280' }}>
              <span>
                Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong>–<strong>{Math.min(currentPage * itemsPerPage, totalCount)}</strong> of <strong>{totalCount}</strong> SKUs
              </span>
              <select
                value={itemsPerPage}
                onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                style={{
                  fontSize: 11, border: '1px solid rgba(209,213,219,0.7)', borderRadius: 7,
                  background: 'white', padding: '3px 6px', fontFamily: 'Inter, sans-serif',
                  color: '#374151', cursor: 'pointer',
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="sello-pagination">
                <button
                  className="sello-page-btn"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft style={{ width: 14, height: 14 }} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      className={`sello-page-btn${currentPage === page ? ' active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
                {totalPages > 7 && <span style={{ padding: '0 4px', color: '#9ca3af', fontSize: 11, alignSelf: 'center' }}>…</span>}
                <button
                  className="sello-page-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
