import React, { useState, useRef, useEffect, useMemo, KeyboardEvent, ClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Activity, SlidersHorizontal, Check } from 'lucide-react';

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;

  // Tag search mode — when provided, search becomes a tag chip input
  searchTags?: string[];
  onSearchTagsChange?: (tags: string[]) => void;

  multiSelects?: Array<{
    key: string;
    label: string;
    icon?: React.ElementType;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
  }>;

  rangeFilters?: Array<{
    key: string;
    label: string;
    minValue: string;
    maxValue: string;
    onMinChange: (val: string) => void;
    onMaxChange: (val: string) => void;
    minPlaceholder?: string;
    maxPlaceholder?: string;
  }>;

  pillGroup?: {
    options: Array<{ key: string; label: string }>;
    active: string;
    onChange: (key: string) => void;
  };

  toggles?: Array<{
    key: string;
    label: string;
    activeLabel?: string;
    icon?: React.ElementType;
    activeIcon?: React.ElementType;
    active: boolean;
    onChange: (active: boolean) => void;
  }>;

  showAudit?: boolean;
  auditActive?: boolean;
  onAuditToggle?: () => void;

  rightSlot?: React.ReactNode;
  subRowLeft?: React.ReactNode;
  subRowRight?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  searchTags,
  onSearchTagsChange,
  multiSelects = [],
  rangeFilters = [],
  pillGroup,
  toggles = [],
  showAudit,
  auditActive,
  onAuditToggle,
  rightSlot,
  subRowLeft,
  subRowRight,
}) => {
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState<Record<string, string>>({});
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 240 });
  const triggerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  const isTagMode = searchTags !== undefined && onSearchTagsChange !== undefined;

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = tagInput.split(/[\n,\t]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
      const unique = newTags.filter(t => !searchTags!.includes(t));
      if (unique.length > 0) onSearchTagsChange!([...searchTags!, ...unique]);
      setTagInput('');
      if (onSearchChange) onSearchChange('');
    } else if (e.key === 'Backspace' && !tagInput && searchTags!.length > 0) {
      onSearchTagsChange!(searchTags!.slice(0, -1));
    }
  };

  const handleTagPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const newTags = text.split(/[\n,\t]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const unique = newTags.filter(t => !searchTags!.includes(t));
    if (unique.length > 0) onSearchTagsChange!([...searchTags!, ...unique]);
    setTagInput('');
    if (onSearchChange) onSearchChange('');
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
    if (onSearchChange) onSearchChange(e.target.value);
  };

  const removeTag = (tag: string) => {
    onSearchTagsChange!(searchTags!.filter(t => t !== tag));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
          && (!portalRef.current || !portalRef.current.contains(event.target as Node))) {
        setOpenDropdownKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (isTagMode ? (searchTags!.length > 0 || tagInput) : searchValue) count++;
    multiSelects.forEach(m => { if (m.selected.length > 0) count++; });
    rangeFilters.forEach(r => { if ((r.minValue || '').trim() || (r.maxValue || '').trim()) count++; });
    if (pillGroup && pillGroup.options.length > 0 && pillGroup.active !== pillGroup.options[0].key) count++;
    toggles.forEach(t => { if (t.active) count++; });
    return count;
  }, [searchValue, searchTags, tagInput, isTagMode, multiSelects, rangeFilters, pillGroup, toggles]);

  const handleClearAll = () => {
    if (onSearchChange) onSearchChange('');
    if (isTagMode) { onSearchTagsChange!([]); setTagInput(''); }
    multiSelects.forEach(m => m.onChange([]));
    rangeFilters.forEach(r => { r.onMinChange(''); r.onMaxChange(''); });
    if (pillGroup && pillGroup.options.length > 0) pillGroup.onChange(pillGroup.options[0].key);
    toggles.forEach(t => t.onChange(false));
  };

  const getDisplayText = (selected: string[]) => {
    if (!selected || selected.length === 0) return 'All';
    if (selected.length === 1) return selected[0];
    return `${selected.length} Selected`;
  };

  return (
    <div style={{ width: '100%' }}>
    <div className="sello-filter-bar">
      {/* Search — tag mode */}
      {isTagMode && (
        <div className="sello-search-wrap" onClick={() => tagInputRef.current?.focus()}>
          <Search />
          <div className="sello-tag-input">
            {searchTags!.map(tag => (
              <span key={tag} className="sello-tag-chip">
                {tag}
                <button onClick={e => { e.stopPropagation(); removeTag(tag); }}>
                  <X style={{ width: 9, height: 9 }} />
                </button>
              </span>
            ))}
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={handleTagInputChange}
              onKeyDown={handleTagKeyDown}
              onPaste={handleTagPaste}
              placeholder={searchTags!.length === 0 ? (searchPlaceholder || 'Search…') : ''}
            />
            {(searchTags!.length > 0 || tagInput) && (
              <button
                onClick={e => { e.stopPropagation(); onSearchTagsChange!([]); setTagInput(''); if (onSearchChange) onSearchChange(''); }}
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#9ca3af', flexShrink: 0, marginLeft: 'auto' }}
              >
                <X style={{ width: 11, height: 11 }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search — plain mode */}
      {!isTagMode && onSearchChange && (
        <div className="sello-search-wrap">
          <Search />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue || ''}
            onChange={e => onSearchChange(e.target.value)}
            className="sello-search-input"
          />
        </div>
      )}

      {/* Pill Group */}
      {pillGroup && pillGroup.options.length > 0 && (
        <div className="sello-pill-group">
          {pillGroup.options.map(opt => (
            <button
              key={opt.key}
              onClick={() => pillGroup.onChange(opt.key)}
              className={`sello-pill${pillGroup.active === opt.key ? ' active' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Toggles */}
      {toggles.map(t => {
        const Icon = t.active ? (t.activeIcon || t.icon) : t.icon;
        return (
          <button
            key={t.key}
            onClick={() => t.onChange(!t.active)}
            className={`sello-btn${t.active ? ' active' : ''}`}
          >
            {Icon && <Icon style={{ width: 13, height: 13 }} />}
            {t.active ? (t.activeLabel || t.label) : t.label}
          </button>
        );
      })}

      {/* Multi Selects */}
      <div className="flex flex-wrap items-center gap-2 relative" ref={dropdownRef}>
        {multiSelects.map(m => {
          const isOpen = openDropdownKey === m.key;
          const searchKey = dropdownSearch[m.key] || '';
          const filteredOptions = m.options.filter(opt =>
            opt.toLowerCase().includes(searchKey.toLowerCase())
          );

          return (
            <div key={m.key} className="relative">
              <div ref={el => { triggerRefs.current[m.key] = el; }}>
              <button
                onClick={() => {
                  if (isOpen) { setOpenDropdownKey(null); return; }
                  const el = triggerRefs.current[m.key];
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    setDropdownPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX, width: Math.max(240, rect.width) });
                  }
                  setOpenDropdownKey(m.key);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid rgba(209,213,219,0.7)',
                  borderRadius: 8,
                  background: 'white',
                  overflow: 'hidden',
                  height: 30,
                  cursor: 'pointer',
                  transition: 'border-color 0.12s',
                }}
              >
                <div style={{
                  background: 'rgba(249,250,251,0.9)',
                  borderRight: '1px solid rgba(229,231,235,0.7)',
                  padding: '0 10px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}>
                  {m.icon && <m.icon style={{ width: 11, height: 11 }} />}
                  {m.label}
                </div>
                <div style={{
                  padding: '0 10px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#374151',
                }}>
                  {getDisplayText(m.selected)}
                  <ChevronDown
                    style={{
                      width: 12,
                      height: 12,
                      color: '#9ca3af',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.12s',
                    }}
                  />
                </div>
              </button>

              {isOpen && createPortal(
                <div ref={portalRef} style={{
                  position: 'fixed',
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  background: 'white',
                  border: '1px solid rgba(229,231,235,0.8)',
                  borderRadius: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  zIndex: 9999,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: 8, borderBottom: '1px solid rgba(229,231,235,0.6)', background: 'rgba(249,250,251,0.8)' }}>
                    <div style={{ position: 'relative' }}>
                      <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#9ca3af' }} />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchKey}
                        onChange={e => setDropdownSearch(prev => ({ ...prev, [m.key]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: '100%',
                          paddingLeft: 26,
                          paddingRight: 8,
                          paddingTop: 5,
                          paddingBottom: 5,
                          fontSize: 11,
                          border: '1px solid rgba(209,213,219,0.7)',
                          borderRadius: 6,
                          outline: 'none',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(229,231,235,0.6)' }}>
                    <button
                      onClick={() => m.onChange(m.options)}
                      style={{ flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 700, color: 'var(--theme)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase' }}
                    >Select All</button>
                    <button
                      onClick={() => m.onChange([])}
                      style={{ flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 700, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', borderLeft: '1px solid rgba(229,231,235,0.6)' }}
                    >Clear</button>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', padding: 4 }}>
                    {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                      const isSelected = m.selected.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            if (isSelected) {
                              m.onChange(m.selected.filter(s => s !== opt));
                            } else {
                              m.onChange([...m.selected, opt]);
                            }
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? 'var(--theme)' : '#374151',
                            background: isSelected ? 'var(--theme-10)' : 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          {opt}
                          {isSelected && <Check style={{ width: 12, height: 12, color: 'var(--theme)' }} />}
                        </button>
                      );
                    }) : (
                      <div style={{ padding: '12px 10px', textAlign: 'center', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>No options found</div>
                    )}
                  </div>
                </div>,
                document.body
              )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Range Filters */}
      {rangeFilters.map(r => (
        <div
          key={r.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid rgba(209,213,219,0.7)',
            borderRadius: 8,
            background: 'white',
            overflow: 'hidden',
            height: 30,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              background: 'rgba(249,250,251,0.9)',
              borderRight: '1px solid rgba(229,231,235,0.7)',
              padding: '0 10px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              fontSize: 9.5,
              fontWeight: 700,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}
          >
            {r.label}
          </div>
          <input
            type="number"
            min="0"
            value={r.minValue}
            placeholder={r.minPlaceholder || 'Min'}
            onChange={e => r.onMinChange(e.target.value)}
            style={{
              width: 46,
              border: 'none',
              outline: 'none',
              textAlign: 'center',
              fontSize: 10,
              color: '#374151',
              background: 'transparent',
              padding: '0 4px',
            }}
          />
          <span style={{ color: '#9ca3af', fontSize: 10, padding: '0 2px' }}>-</span>
          <input
            type="number"
            min="0"
            value={r.maxValue}
            placeholder={r.maxPlaceholder || 'Max'}
            onChange={e => r.onMaxChange(e.target.value)}
            style={{
              width: 46,
              border: 'none',
              outline: 'none',
              textAlign: 'center',
              fontSize: 10,
              color: '#374151',
              background: 'transparent',
              padding: '0 4px',
            }}
          />
        </div>
      ))}

      {/* Filter count & clear */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 1, height: 16, background: 'rgba(229,231,235,0.8)' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', background: 'var(--theme-10)',
            border: '1px solid var(--theme-20)', borderRadius: 7,
          }}>
            <SlidersHorizontal style={{ width: 11, height: 11, color: 'var(--theme)' }} />
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filters:</span>
            <span style={{
              width: 16, height: 16, background: 'var(--theme)', color: 'white',
              fontSize: 9.5, fontWeight: 700, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{activeFilterCount}</span>
          </div>
          <button
            onClick={handleClearAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', fontSize: 10.5, fontWeight: 700,
              color: '#dc2626', background: 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <X style={{ width: 11, height: 11 }} />
            Clear All
          </button>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 10 }} />

      {/* Right slot + Audit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
        {rightSlot}
        {showAudit && (
          <button
            onClick={onAuditToggle}
            className={`sello-btn${auditActive ? ' primary' : ''}`}
            title="Toggle Audit Panel"
          >
            <Activity style={{ width: 13, height: 13 }} />
            Audit{auditActive ? ': On' : ''}
          </button>
        )}
      </div>
    </div>
    {(subRowLeft || subRowRight) && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(229,231,235,0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {subRowLeft}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', minWidth: 0 }}>
          {subRowRight}
        </div>
      </div>
    )}
    </div>
  );
};
