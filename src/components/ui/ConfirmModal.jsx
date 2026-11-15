import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

export const ConfirmModal = ({
    isOpen,
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false,
    requirePhrase = null, // e.g. 'PURGE' or 'CONFIRM DELETION'
    onConfirm,
    onCancel,
    loading = false
}) => {
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isConfirmDisabled = requirePhrase ? inputValue.trim() !== requirePhrase : false;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={`p-2.5 rounded-xl ${
                                isDestructive
                                    ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                                    : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                            }`}
                        >
                            {isDestructive ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                    {message}
                </div>

                {requirePhrase && (
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Type <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-rose-600 dark:text-rose-400">{requirePhrase}</span> to confirm:
                        </label>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={requirePhrase}
                            disabled={loading}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                        />
                    </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isConfirmDisabled || loading}
                        className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                            isDestructive
                                ? 'bg-rose-600 hover:bg-rose-700 active:scale-95'
                                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                        }`}
                    >
                        {loading && <Loader2 size={13} className="animate-spin" />}
                        <span>{confirmText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
