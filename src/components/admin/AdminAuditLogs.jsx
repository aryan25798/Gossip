import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { Pagination } from '../ui/Pagination';
import { format } from 'date-fns';
import { Shield, RefreshCw, FileText, User, Trash2, Megaphone, MapPin, Eye, X } from 'lucide-react';

export const AdminAuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [actionFilter, setActionFilter] = useState('all');
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminService.getAuditLogsPaginated({
                page,
                pageSize,
                action: actionFilter
            });
            setLogs(res.logs);
            setTotalCount(res.totalCount);
        } catch (err) {
            console.error('[AdminAuditLogs] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, actionFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const getActionBadge = (action) => {
        if (action.includes('ERASURE') || action.includes('DELETE')) {
            return 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-900/40';
        }
        if (action.includes('BAN')) {
            return 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-900/40';
        }
        return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40';
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden w-full">
            {/* Header & Filter Area */}
            <div className="p-3 sm:p-6 pb-3 sm:pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                            <span>Security & Audit Trail</span>
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shrink-0">
                                {totalCount} Events
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            Immutable administrative action ledger and compliance records.
                        </p>
                    </div>

                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl transition-colors self-start sm:self-auto shrink-0"
                        title="Refresh audit logs"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={actionFilter}
                        onChange={(e) => {
                            setActionFilter(e.target.value);
                            setPage(1);
                        }}
                        className="w-full sm:w-auto px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                        <option value="all">All Actions</option>
                        <option value="USER_BAN">User Ban</option>
                        <option value="USER_UNBAN">User Unban</option>
                        <option value="COMPLETE_ACCOUNT_ERASURE">Account Erasure</option>
                        <option value="BULK_ACCOUNT_ERASURE">Bulk Erasure</option>
                        <option value="HARD_DELETE_MESSAGE">Message Delete</option>
                        <option value="CREATE_ANNOUNCEMENT">Announcement Published</option>
                        <option value="VIEW_LOCATION_TELEMETRY">Location Inspection</option>
                    </select>
                </div>
            </div>

            {/* Desktop Table (Hidden on < md) */}
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[750px] text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                            <th className="py-3 px-4">Action</th>
                            <th className="py-3 px-4">Administrator</th>
                            <th className="py-3 px-4">Target Type</th>
                            <th className="py-3 px-4">Target ID</th>
                            <th className="py-3 px-4">Timestamp</th>
                            <th className="py-3 px-4 text-right">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {loading && logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400">Loading audit history...</td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-slate-400">No audit events found.</td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="py-3 px-4">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getActionBadge(log.action)}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                                        {log.admin_email || 'System'}
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-slate-500 uppercase text-[10px]">
                                        {log.target_type}
                                    </td>
                                    <td className="py-3 px-4 font-mono text-slate-400 truncate max-w-[150px]">
                                        {log.target_id || '—'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-500">
                                        {log.created_at ? format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss') : '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => setSelectedLog(log)}
                                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 font-semibold transition-colors"
                                        >
                                            View Metadata
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View (Shown on < md) */}
            <div className="block md:hidden flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {loading && logs.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">Loading audit history...</div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">No audit events found.</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getActionBadge(log.action)}`}>
                                    {log.action}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {log.created_at ? format(new Date(log.created_at), 'MMM dd, HH:mm:ss') : '—'}
                                </span>
                            </div>

                            <div className="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                                <p><strong className="text-slate-800 dark:text-slate-200">Admin:</strong> {log.admin_email || 'System'}</p>
                                <p><strong className="text-slate-800 dark:text-slate-200">Target:</strong> {log.target_type} ({log.target_id || '—'})</p>
                            </div>

                            <div className="pt-1 flex justify-end">
                                <button
                                    onClick={() => setSelectedLog(log)}
                                    className="px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-semibold text-xs"
                                >
                                    View Metadata
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Pagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                loading={loading}
            />

            {/* Details Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Audit Log Record
                            </h3>
                            <button onClick={() => setSelectedLog(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-3 text-xs overflow-y-auto custom-scrollbar flex-1">
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono space-y-1">
                                <p><strong>Action:</strong> {selectedLog.action}</p>
                                <p><strong>Admin:</strong> {selectedLog.admin_email}</p>
                                <p><strong>Target:</strong> {selectedLog.target_type} ({selectedLog.target_id})</p>
                                <p><strong>Time:</strong> {selectedLog.created_at}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Payload Details</p>
                                <pre className="p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 break-words whitespace-pre-wrap">
                                    {JSON.stringify(selectedLog.details, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAuditLogs;
