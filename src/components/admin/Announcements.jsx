import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import { Pagination } from '../ui/Pagination';
import { BulkActionToolbar } from '../ui/BulkActionToolbar';
import { ConfirmModal } from '../ui/ConfirmModal';
import { format } from 'date-fns';
import {
    Megaphone, Send, Trash2, CheckCircle2, AlertTriangle,
    Info, ShieldAlert, Plus, RefreshCw, Eye, EyeOff
} from 'lucide-react';

export const Announcements = () => {
    const { currentUser } = useAuth();

    // Data State
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    // Filters
    const [typeFilter, setTypeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');

    // Composer Form State
    const [showComposer, setShowComposer] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [type, setType] = useState('info');
    const [priority, setPriority] = useState('normal');
    const [submitting, setSubmitting] = useState(false);

    // Bulk selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [processing, setProcessing] = useState(false);

    // Confirm Modal
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        isDestructive: false,
        onConfirm: () => {}
    });

    const fetchAnnouncements = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminService.getAnnouncementsPaginated({
                page,
                pageSize,
                type: typeFilter,
                priority: priorityFilter
            });
            setAnnouncements(res.announcements);
            setTotalCount(res.totalCount);
        } catch (err) {
            console.error('[Announcements] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, typeFilter, priorityFilter]);

    useEffect(() => {
        fetchAnnouncements();
    }, [fetchAnnouncements]);

    // Handle Create Announcement
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!title.trim() || !body.trim()) return;

        setSubmitting(true);
        try {
            await adminService.createAnnouncement({
                title: title.trim(),
                body: body.trim(),
                type,
                priority,
                is_active: true
            }, currentUser);

            setTitle('');
            setBody('');
            setShowComposer(false);
            fetchAnnouncements();
        } catch (err) {
            alert('Failed to publish announcement: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Toggle Active Status
    const handleToggleActive = async (item) => {
        try {
            await adminService.updateAnnouncement(item.id, { is_active: !item.is_active }, currentUser);
            fetchAnnouncements();
        } catch (err) {
            alert('Status update failed: ' + err.message);
        }
    };

    // Delete Single
    const handleDelete = (item) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Announcement',
            message: `Are you sure you want to delete the broadcast "${item.title}"?`,
            confirmText: 'Delete Broadcast',
            isDestructive: true,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.deleteAnnouncement(item.id, currentUser);
                    fetchAnnouncements();
                } catch (err) {
                    alert('Deletion failed: ' + err.message);
                }
            }
        });
    };

    // Bulk Delete
    const handleBulkDelete = () => {
        const ids = Array.from(selectedIds);
        setConfirmModal({
            isOpen: true,
            title: 'Bulk Delete Announcements',
            message: `Permanently delete ${ids.length} selected broadcast announcements?`,
            confirmText: 'Delete Selected',
            isDestructive: true,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setProcessing(true);
                try {
                    await adminService.bulkDeleteAnnouncements(ids, currentUser);
                    setSelectedIds(new Set());
                    fetchAnnouncements();
                } catch (err) {
                    alert('Bulk delete failed: ' + err.message);
                } finally {
                    setProcessing(false);
                }
            }
        });
    };

    const handleToggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
            {/* Header & Controls Area */}
            <div className="p-3 sm:p-6 pb-3 sm:pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            Megaphone — Broadcast Announcements
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                                {totalCount} Broadcasts
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Author and manage platform-wide alerts and system notices.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowComposer(!showComposer)}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                            <Plus size={15} />
                            <span>New Announcement</span>
                        </button>
                        <button
                            onClick={fetchAnnouncements}
                            disabled={loading}
                            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={typeFilter}
                        onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setPage(1);
                        }}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="alert">System Alert</option>
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(e) => {
                            setPriorityFilter(e.target.value);
                            setPage(1);
                        }}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                        <option value="all">All Priorities</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                    </select>
                </div>

                {/* Bulk Toolbar */}
                <BulkActionToolbar
                    selectedCount={selectedIds.size}
                    onClearSelection={() => setSelectedIds(new Set())}
                    processing={processing}
                >
                    <button
                        onClick={handleBulkDelete}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                        <Trash2 size={13} /> Delete Selected
                    </button>
                </BulkActionToolbar>
            </div>

            {/* Composer Drawer / Modal */}
            {showComposer && (
                <div className="p-6 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 shrink-0 animate-in slide-in-from-top-4 duration-200">
                    <form onSubmit={handleCreate} className="max-w-2xl space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Megaphone size={16} className="text-indigo-600" />
                            Compose Platform Broadcast
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                type="text"
                                placeholder="Broadcast title..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                            />

                            <div className="flex gap-2">
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="info">Info Notice</option>
                                    <option value="warning">Maintenance Warning</option>
                                    <option value="alert">Critical Alert</option>
                                </select>

                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value)}
                                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="high">High Priority</option>
                                </select>
                            </div>
                        </div>

                        <textarea
                            placeholder="Broadcast content / message body..."
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={3}
                            required
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowComposer(false)}
                                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
                            >
                                {submitting ? 'Publishing...' : 'Publish Announcement'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Announcements List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 custom-scrollbar">
                {loading && announcements.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">Loading broadcasts...</div>
                ) : announcements.length === 0 ? (
                    <div className="text-center py-12 sm:py-16 text-slate-400">
                        <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No Announcements</p>
                        <p className="text-xs text-slate-400 mt-1">Click "New Announcement" to broadcast to all users.</p>
                    </div>
                ) : (
                    announcements.map((item) => {
                        const isSelected = selectedIds.has(item.id);
                        return (
                            <div
                                key={item.id}
                                className={`p-4 sm:p-5 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                    isSelected
                                        ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/20'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                <div className="flex items-start gap-3 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleToggleSelect(item.id)}
                                        className="mt-1 w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{item.title}</h4>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                item.type === 'alert'
                                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60'
                                                    : item.type === 'warning'
                                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60'
                                                    : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60'
                                            }`}>
                                                {item.type}
                                            </span>
                                            {item.is_active ? (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full uppercase">
                                                    Live
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full uppercase">
                                                    Archived
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xl break-words">
                                            {item.body}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-2">
                                            By {item.sender_name || 'System Admin'} • {item.created_at ? format(new Date(item.created_at), 'PPP') : '—'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                    <button
                                        onClick={() => handleToggleActive(item)}
                                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                                        title={item.is_active ? 'Archive broadcast' : 'Activate broadcast'}
                                    >
                                        {item.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item)}
                                        className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 transition-colors"
                                        title="Delete broadcast"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
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

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                isDestructive={confirmModal.isDestructive}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default Announcements;
