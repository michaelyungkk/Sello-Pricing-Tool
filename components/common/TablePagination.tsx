import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
    currentPage: number;
    itemsPerPage: number;
    totalCount: number;
    totalPages: number;
    setCurrentPage: (page: number | ((prev: number) => number)) => void;
    setItemsPerPage: (n: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
    currentPage,
    itemsPerPage,
    totalCount,
    totalPages,
    setCurrentPage,
    setItemsPerPage,
}) => {
    if (totalCount <= 0) return null;

    const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
        .reduce<(number | '...')[]>((acc, page, index, arr) => {
            if (index > 0 && page - (arr[index - 1] as number) > 1) acc.push('...');
            acc.push(page);
            return acc;
        }, []);

    return (
        <div className="sello-table-footer">
            <div className="summary">
                <span>
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} results
                </span>
                <span className="summary-divider">|</span>
                <select
                    className="sello-per-page"
                    value={itemsPerPage}
                    onChange={e => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                    }}
                >
                    {[10, 25, 50, 100].map(n => (
                        <option key={n} value={n}>{n} / page</option>
                    ))}
                </select>
            </div>
            {totalPages > 1 && (
                <nav className="sello-pagination">
                    <button
                        className="sello-page-btn"
                        onClick={() => setCurrentPage(page => Math.max(page - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    {pages.map((page, index) => page === '...'
                        ? (
                            <span key={`ellipsis-${index}`} className="sello-page-btn" style={{ cursor: 'default' }}>
                                ...
                            </span>
                        )
                        : (
                            <button
                                key={page}
                                className={`sello-page-btn${currentPage === page ? ' active' : ''}`}
                                onClick={() => setCurrentPage(page)}
                            >
                                {page}
                            </button>
                        )
                    )}
                    <button
                        className="sello-page-btn"
                        onClick={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
                        disabled={currentPage === totalPages}
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </nav>
            )}
        </div>
    );
};
