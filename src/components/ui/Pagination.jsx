import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const Pagination = ({
    page = 1,
    pageSize = 20,
    totalCount = 0,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
    loading = false,
    className = ''
}) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const endRecord = Math.min(page * pageSize, totalCount);

    const handlePrevious = () => {
        if (page > 1 && !loading) onPageChange(page - 1);
    };

    const handleNext = () => {
        if (page < totalPages && !loading) onPageChange(page + 1);
    };

    const handleFirst = () => {
        if (page !== 1 && !loading) onPageChange(1);
    };

    const handleLast = () => {
        if (page !== totalPages && !loading) onPageChange(totalPages);
    };

    // Calculate visible page range (up to 5 numbers for desktop)
    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, page - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 select-none shrink-0 w-full overflow-hidden ${className}`}>
            {/* Record summary & Page size selector */}
            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-[11px] sm:text-xs">
                <span className="truncate">
                    Showing <strong className="font-semibold text-slate-900 dark:text-slate-200">{startRecord}</strong>–
                    <strong className="font-semibold text-slate-900 dark:text-slate-200">{endRecord}</strong> of{' '}
                    <strong className="font-semibold text-slate-900 dark:text-slate-200">{totalCount}</strong>
                </span>

                {onPageSizeChange && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="hidden md:inline text-slate-400">Rows:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            disabled={loading}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                            {pageSizeOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt} / page
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-center gap-1 w-full sm:w-auto shrink-0">
                {/* First Page (Desktop) */}
                <button
                    onClick={handleFirst}
                    disabled={page <= 1 || loading}
                    className="hidden md:inline-flex p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="First page"
                >
                    <ChevronsLeft size={14} />
                </button>

                {/* Previous Page */}
                <button
                    onClick={handlePrevious}
                    disabled={page <= 1 || loading}
                    className="p-1 sm:p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 px-2 text-xs font-semibold"
                    title="Previous page"
                >
                    <ChevronLeft size={14} />
                    <span className="hidden xs:inline">Prev</span>
                </button>

                {/* Mobile Compact Page Indicator */}
                <span className="inline-flex sm:hidden px-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {page} / {totalPages}
                </span>

                {/* Desktop Numeric Pages */}
                <div className="hidden sm:flex items-center gap-1 mx-1">
                    {getPageNumbers().map((num) => (
                        <button
                            key={num}
                            onClick={() => onPageChange(num)}
                            disabled={loading}
                            className={`min-w-[28px] h-7 px-2 rounded-lg font-medium text-xs transition-colors ${
                                num === page
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>

                {/* Next Page */}
                <button
                    onClick={handleNext}
                    disabled={page >= totalPages || loading}
                    className="p-1 sm:p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 px-2 text-xs font-semibold"
                    title="Next page"
                >
                    <span className="hidden xs:inline">Next</span>
                    <ChevronRight size={14} />
                </button>

                {/* Last Page (Desktop) */}
                <button
                    onClick={handleLast}
                    disabled={page >= totalPages || loading}
                    className="hidden md:inline-flex p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Last page"
                >
                    <ChevronsRight size={14} />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
