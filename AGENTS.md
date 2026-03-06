# Sello Pricing Tool — AI Agent Rules

## About This Project
A React/TypeScript e-commerce analytics dashboard for Sello UK. Large codebase (~150+ files) with a mature design system. Handle with care — do not restructure, reformat, or rename without explicit instruction.

Key stack: React, TypeScript, Vite, Firebase, Recharts, Tailwind CSS, XLSX, D3.

---

## 🔴 Token & Performance Rules (Claude Code)
- **NEVER use parallel agents** unless explicitly instructed
- Work on **ONE file at a time**, sequentially
- **Do not read files** that are not directly relevant to the current task
- Before making any changes, **list which files you will touch and what you will do** — then wait for approval
- Prefer **targeted edits** over rewriting entire files
- Use `/compact` if the conversation gets long
- Always use **Sonnet** model, never switch to Opus for sub-agents

---

## 🔴 Git Rules (Claude Code)
- **NEVER create a new worktree**
- **NEVER create a new branch** unless explicitly asked
- Always work **directly on main** in the current directory
- Do not run `git worktree` commands
- Commit directly to main when instructed

---

## Code Style & Conventions
- All monetary values are **GBP (£)**, tax-inclusive unless stated otherwise
- Use `VAT_MULTIPLIER` from `constants.ts` for tax calculations — never hardcode 1.2
- Date keys are `YYYY-MM-DD` strings — use `asDateKey()` from `services/dateUtils.ts`
- Profit figures are **ex-VAT** internally; display values are inc-VAT
- Use `formatMoney()` and `formatPct()` from `utils/format.ts` for display

---

## Design System Rules
- Glass aesthetic: `bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl`
- Standard card: `bg-custom-glass backdrop-blur-custom border border-custom-glass p-4 rounded-xl shadow-sm`
- Use `FilterBar` from `components/common/FilterBar.tsx` for ALL filter bars — never build custom ones
- Use `ContextBar` from `components/common/ContextBar.tsx` for page-level time window controls
- Use `MetricCard` from `components/productManagement/parts/MetricCard.tsx` for KPI cards
- Use `TabSwitcher` from `components/common/TabSwitcher.tsx` for all tab navigation
- Button styles: primary = indigo-600, audit = amber-500, destructive = red-500
- Do NOT use plain HTML `<select>` elements for platform filters — use FilterBar multiSelect pattern

---

## Architecture Rules
- Page containers live in `components/[page]/[Page]PageContainer.tsx`
- Tab components live in `components/[page]/tabs/[Tab]Tab.tsx`
- Shared components live in `components/common/`
- Services (pure logic, no React) live in `services/`
- Never put business logic inside JSX — extract to `useMemo` or service functions
- Never hardcode platform names — always derive dynamically from `pricingRules` or live data

---

## What NOT to Do
- Do not reformat or re-indent lines you are not changing
- Do not rename variables, props, or components without explicit instruction
- Do not delete or rewrite existing logic — only add or surgically edit
- Do not add imports that already exist in a file
- Do not restructure JSX or move elements unless asked
- Do not change `AuditPanel.tsx`, `FilterBar.tsx`, or `ContextBar.tsx` unless explicitly told to

---

## Antigravity Visual Editor Compatibility
**IMPORTANT**: When generating or modifying HTML, JSX, or TSX code, ALWAYS follow these rules:

1. **Use proper tag structure** — opening/closing tags on separate lines, properly indented
2. **Add identifiers** — give key sections `id` or `class`/`className` attributes
3. **No fragments for editable elements** — avoid `<>...</>` for elements that need visual editing
4. **Wrap logical groups** — cards, list items etc. should be wrapped in container elements
5. **Direct text content** — use `<p>Text here</p>` not `<p>{textVariable}</p>` for editable text
6. **Inline styles in JSX** — use `style={{ camelCase: 'value' }}` format

**DO:**
```jsx
<section id="features" className="features-section">
  <div className="feature-card">
    <h3>Feature Title</h3>
    <p>Feature description text here.</p>
  </div>
</section>
```

**DON'T:**
```jsx
<>
  <h3>{title}</h3>
  <p>{description}</p>
</>
```

See `.agent/workflows/code-generation.md` for complete Antigravity rules.

---

## Key File Locations
- Types: `types.ts`, `components/platformManagement/platformManagement.types.ts`
- Constants: `constants.ts`
- Metrics logic: `services/metrics.ts`
- Date utilities: `services/dateUtils.ts`
- Format utilities: `utils/format.ts`
- App state: `hooks/useAppState.ts`
- Firebase: `services/firebase.ts`, `services/dbService.ts`
