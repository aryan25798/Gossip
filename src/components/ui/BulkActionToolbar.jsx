import React from 'react';
import { CheckSquare, X, Loader2 } from 'lucide-react';

export const BulkActionToolbar = ({
    selectedCount = 0,
    onClearSelection,
    processing = false,
    processingText = 'Processing...',
    children,
    className = ''
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl shadow-sm text-xs text-indigo-900 dark:text-indigo-200 animate-in fade-in slide-in-from-top-2 duration-200 ${className}`}>
            <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-indigo-600 dark:text-indigo-400" />
                <span className="font-semibold">
                    {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
                </span>
                <button
                    onClick={onClearSelection}
                    disabled={processing}
                    className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline font-medium"
                >
                    Clear selection
                </button>
            </div>

            <div className="flex items-center gap-2">
                {processing ? (
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
                        <Loader2 size={14} className="animate-spin" />
                        <span>{processingText}</span>
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

export default BulkActionToolbar;
