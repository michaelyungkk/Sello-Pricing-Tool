
import React from 'react';
import { CostManagementPageProps } from './types';
import { useCostManagementState } from './hooks/useCostManagementState';
import { CostSummarySection } from './sections/CostSummarySection';
import { FeeBreakdownTable } from './sections/FeeBreakdownTable';
import { MarginImpactTable } from './sections/MarginImpactTable';
import { CostNotesPanel } from './sections/CostNotesPanel';

const CostManagementPageInner: React.FC<CostManagementPageProps> = ({ products, themeColor, headerStyle }) => {
    const {
        searchTags, setSearchTags,
        setSearch,
        sortConfig, setSortConfig,
        showInactive, setShowInactive,
        includeVat, setIncludeVat,
        showPercentPrimary, setShowPercentPrimary,
        viewMode, setViewMode,
        currentPage, setCurrentPage,
        itemsPerPage, setItemsPerPage,
        filteredAndSorted,
        paginatedProducts,
        totalPages,
        handleExport
    } = useCostManagementState(products);

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20 flex flex-col">
            <CostSummarySection
                themeColor={themeColor}
                headerStyle={headerStyle}
                includeVat={includeVat}
                setIncludeVat={setIncludeVat}
                showPercentPrimary={showPercentPrimary}
                setShowPercentPrimary={setShowPercentPrimary}
                viewMode={viewMode}
                setViewMode={setViewMode}
                searchTags={searchTags}
                setSearchTags={setSearchTags}
                setSearch={setSearch}
                setCurrentPage={setCurrentPage}
                showInactive={showInactive}
                setShowInactive={setShowInactive}
                onExport={handleExport}
            />

            <FeeBreakdownTable
                paginatedProducts={paginatedProducts}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                themeColor={themeColor}
                includeVat={includeVat}
                showPercentPrimary={showPercentPrimary}
                viewMode={viewMode}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
                setCurrentPage={setCurrentPage}
                totalPages={totalPages}
                filteredCount={filteredAndSorted.length}
            />
            
            <MarginImpactTable />
            <CostNotesPanel />
        </div>
    );
};

const CostManagementPage = React.memo(CostManagementPageInner);
export default CostManagementPage;
