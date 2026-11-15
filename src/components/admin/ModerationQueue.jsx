import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabase';
import { Pagination } from '../ui/Pagination';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Avatar } from '../ui/Avatar';
import { format } from 'date-fns';
import {
    ShieldAlert, Trash2, CheckCircle2, UserX, AlertTriangle,
    XCircle, Clock, MessageSquare, RefreshCw, UserCheck, CheckSquare
} from 'lucide-react';

export const ModerationQueue = () => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('reports'); // 'reports', 'flagged', 'deletions'

    // Reports State
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [reportsPage, setReportsPage] = useState(1);
    const [reportsPageSize, setReportsPageSize] = useState(20);
    const [reportsTotal, setReportsTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('pending');

    // Flagged Messages State
    const [flaggedMessages, setFlaggedMessages] = useState([]);
    const [flaggedLoading, setFlaggedLoading] = useState(false);
    const [flaggedPage, setFlaggedPage] = useState(1);
    const [flaggedPageSize, setFlaggedPageSize] = useState(20);
    const [flaggedTotal, setFlaggedTotal] = useState(0);

    // Deletion Requests State
    const [deletionUsers, setDeletionUsers] = useState([]);
    const [deletionsLoading, setDeletionsLoading] = useState(false);
    const [deletionsPage, setDeletionsPage] = useState(1);
    const [deletionsPageSize, setDeletionsPageSize] = useState(20);
    const [deletionsTotal, setDeletionsTotal] = useState(0);

    // Confirm Modal
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        isDestructive: false,
        requirePhrase: null,
        onConfirm: () => {}
    });

    // 1. Fetch Reports
    const fetchReports = useCallback(async () => {
        setReportsLoading(true);
        try {
            const res = await adminService.getReportsPaginated({
                page: reportsPage,
                pageSize: reportsPageSize,
                status: statusFilter
            });
            setReports(res.reports);
            setReportsTotal(res.totalCount);
        } catch (err) {
            console.error('[ModerationQueue] Reports error:', err);
        } finally {
            setReportsLoading(false);
        }
    }, [reportsPage, reportsPageSize, statusFilter]);

    // 2. Fetch Flagged Messages
    const fetchFlagged = useCallback(async () => {
        setFlaggedLoading(true);
        try {
            const res = await adminService.getFlaggedMessagesPaginated({
                page: flaggedPage,
                pageSize: flaggedPageSize
            });
            setFlaggedMessages(res.messages);
            setFlaggedTotal(res.totalCount);
        } catch (err) {
            console.error('[ModerationQueue] Flagged error:', err);
        } finally {
            setFlaggedLoading(false);
        }
    }, [flaggedPage, flaggedPageSize]);

    // 3. Fetch Deletion Requests
    const fetchDeletions = useCallback(async () => {
        setDeletionsLoading(true);
        try {
            const res = await adminService.getUsersPaginated({
                page: deletionsPage,
                pageSize: deletionsPageSize,
                status: 'deletion_requested'
            });
            setDeletionUsers(res.users);
            setDeletionsTotal(res.totalCount);
        } catch (err) {
            console.error('[ModerationQueue] Deletions error:', err);
        } finally {
            setDeletionsLoading(false);
        }
    }, [deletionsPage, deletionsPageSize]);

    useEffect(() => {
        if (activeTab === 'reports') fetchReports();
        else if (activeTab === 'flagged') fetchFlagged();
        else if (activeTab === 'deletions') fetchDeletions();
    }, [activeTab, fetchReports, fetchFlagged, fetchDeletions]);

    // Report Actions
    const handleResolveReport = async (reportId, actionType, reportedUserId, messageId) => {
        let title = 'Resolve Report';
        let message = 'Are you sure you want to resolve this report?';
        let isDestructive = false;

        if (actionType === 'ban') {
            title = 'Approve Report & Ban User';
            message = 'This will ban the reported user account and mark the report resolved.';
            isDestructive = true;
        } else if (actionType === 'delete_msg') {
            title = 'Remove Violating Message';
            message = 'This will permanently delete the offending message and resolve the report.';
            isDestructive = true;
        }

        setConfirmModal({
            isOpen: true,
            title,
            message,
            confirmText: 'Confirm Resolution',
            isDestructive,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    if (actionType === 'ban' && reportedUserId) {
                        await adminService.banUser(reportedUserId, true, currentUser);
                    }
                    if (actionType === 'delete_msg' && messageId) {
                        await adminService.hardDeleteMessage(messageId, currentUser);
                    }

                    await adminService.updateReportStatus(reportId, {
                        status: 'resolved',
                        moderator_notes: `Resolved by ${currentUser.email} with action: ${actionType}`
                    }, currentUser);

                    fetchReports();
                } catch (err) {
                    alert('Resolution failed: ' + err.message);
                }
            }
        });
    };

    const handleDismissReport = async (reportId) => {
        try {
            await adminService.updateReportStatus(reportId, {
                status: 'rejected',
                moderator_notes: `Dismissed by ${currentUser.email}`
            }, currentUser);
            fetchReports();
        } catch (err) {
            alert('Dismiss failed: ' + err.message);
        }
    };

    // Flagged Message Actions
    const handleClearFlag = async (msgId) => {
        try {
            await adminService.clearMessageFlag(msgId, currentUser);
            fetchFlagged();
        } catch (err) {
            alert('Clear failed: ' + err.message);
        }
    };

    const handleDeleteMessage = async (msgId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Message Permanently',
            message: 'Permanently remove this message from the database?',
            confirmText: 'Delete Message',
            isDestructive: true,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.hardDeleteMessage(msgId, currentUser);
                    fetchFlagged();
                } catch (err) {
                    alert('Deletion failed: ' + err.message);
                }
            }
        });
    };

    // Deletion Request Actions
    const handleApproveErasure = (user) => {
        setConfirmModal({
            isOpen: true,
            title: 'Approve Permanent Account Erasure',
            message: `Verify user-initiated GDPR deletion request for ${user.display_name || user.email}. This will permanently purge all account records, messages, and files.`,
            confirmText: 'Approve & Purge Account',
            isDestructive: true,
            requirePhrase: 'CONFIRM DELETION',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.eraseUser(user.id, currentUser);
                    alert(`Account ${user.email} successfully purged.`);
                    fetchDeletions();
                } catch (err) {
                    alert('Erasure failed: ' + err.message);
                }
            }
        });
    };

    const handleRejectDeletion = async (user) => {
        try {
            await adminService.banUser(user.id, false, currentUser);
            // Reset deletion_requested flag in database
            await supabase.from('users').update({ deletion_requested: false }).eq('id', user.id);
            fetchDeletions();
        } catch (err) {
            alert('Reject failed: ' + err.message);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden w-full">
            {/* Header & Tabs Area */}
            <div className="p-3 sm:p-6 pb-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div className="min-w-0">
                        <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                            <ShieldAlert className="text-indigo-600 dark:text-indigo-400 shrink-0" size={20} />
                            <span>The Shield — Moderation Queue</span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            Triage reported transmissions, flagged keywords, and GDPR deletion requests.
                        </p>
                    </div>

                    <button
                        onClick={() => {
                            if (activeTab === 'reports') fetchReports();
                            else if (activeTab === 'flagged') fetchFlagged();
                            else if (activeTab === 'deletions') fetchDeletions();
                        }}
                        className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors self-start sm:self-auto shrink-0"
                        title="Refresh Queue"
                    >
                        <RefreshCw size={15} className={reportsLoading || flaggedLoading || deletionsLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 sm:gap-6 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`py-2.5 sm:py-3 border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
                            activeTab === 'reports'
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <ShieldAlert size={15} />
                        <span>User Reports</span>
                        {reportsTotal > 0 && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold">
                                {reportsTotal}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('flagged')}
                        className={`py-2.5 sm:py-3 border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
                            activeTab === 'flagged'
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <MessageSquare size={15} />
                        <span>Flagged Messages</span>
                        {flaggedTotal > 0 && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold">
                                {flaggedTotal}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('deletions')}
                        className={`py-2.5 sm:py-3 border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
                            activeTab === 'deletions'
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <AlertTriangle size={15} />
                        <span>Deletion Requests</span>
                        {deletionsTotal > 0 && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                                {deletionsTotal}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Tab 1: User Reports Content */}
            {activeTab === 'reports' && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    {/* Status Filter */}
                    <div className="p-3 sm:p-4 px-3 sm:px-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 overflow-x-auto custom-scrollbar">
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
                            {['all', 'pending', 'resolved', 'rejected'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => {
                                        setStatusFilter(status);
                                        setReportsPage(1);
                                    }}
                                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all shrink-0 ${
                                        statusFilter === status
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 custom-scrollbar">
                        {reportsLoading && reports.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">Loading reports...</div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-12 sm:py-16 text-slate-400">
                                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                                <p className="font-semibold text-slate-700 dark:text-slate-300">All Clear</p>
                                <p className="text-xs text-slate-400 mt-1">No user reports in the "{statusFilter}" queue.</p>
                            </div>
                        ) : (
                            reports.map(rep => (
                                <div key={rep.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                                {rep.category || 'General'}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-500">
                                                Priority: <strong className="text-slate-700 dark:text-slate-300 capitalize">{rep.priority}</strong>
                                            </span>
                                        </div>
                                        <span className="text-[11px] sm:text-xs text-slate-400">
                                            Reported: {rep.created_at ? format(new Date(rep.created_at), 'PPPp') : '—'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs">
                                        <div>
                                            <p className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">Offending Message Content</p>
                                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium break-words">
                                                {rep.message?.content || '[Message text or attachment]'}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">Reporter Reason</p>
                                            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 break-words">
                                                {rep.reason}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                                            <span className="truncate">Reported User: <strong className="text-slate-900 dark:text-slate-100">{rep.reported_user?.display_name || rep.reported_user?.email}</strong></span>
                                        </div>

                                        {rep.status === 'pending' && (
                                            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                                                <button
                                                    onClick={() => handleDismissReport(rep.id)}
                                                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
                                                >
                                                    Dismiss
                                                </button>
                                                {rep.message_id && (
                                                    <button
                                                        onClick={() => handleResolveReport(rep.id, 'delete_msg', rep.reported_user_id, rep.message_id)}
                                                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-xs font-semibold transition-colors"
                                                    >
                                                        Delete Content
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleResolveReport(rep.id, 'ban', rep.reported_user_id, rep.message_id)}
                                                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-sm"
                                                >
                                                    Ban Offender
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Pagination
                        page={reportsPage}
                        pageSize={reportsPageSize}
                        totalCount={reportsTotal}
                        onPageChange={setReportsPage}
                        onPageSizeChange={setReportsPageSize}
                        loading={reportsLoading}
                    />
                </div>
            )}

            {/* Tab 2: Flagged Messages Content */}
            {activeTab === 'flagged' && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 custom-scrollbar">
                        {flaggedLoading && flaggedMessages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">Loading flagged queue...</div>
                        ) : flaggedMessages.length === 0 ? (
                            <div className="text-center py-12 sm:py-16 text-slate-400">
                                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                                <p className="font-semibold text-slate-700 dark:text-slate-300">No Flagged Messages</p>
                                <p className="text-xs text-slate-400 mt-1">All flagged transmissions have been triaged.</p>
                            </div>
                        ) : (
                            flaggedMessages.map(msg => (
                                <div key={msg.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                                        <Avatar src={msg.sender?.avatar_url} alt={msg.sender?.display_name} size="md" className="shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{msg.sender?.display_name || 'User'}</span>
                                                <span className="text-[10px] text-slate-400">{msg.created_at ? format(new Date(msg.created_at), 'MMM dd, HH:mm') : ''}</span>
                                            </div>
                                            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 break-words">
                                                {msg.content}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                        <button
                                            onClick={() => handleClearFlag(msg.id)}
                                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 transition-colors"
                                        >
                                            <CheckCircle2 size={13} className="text-emerald-500" /> Clear
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 border border-rose-200 dark:border-rose-900/40 transition-colors"
                                        >
                                            <Trash2 size={13} /> Delete
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Pagination
                        page={flaggedPage}
                        pageSize={flaggedPageSize}
                        totalCount={flaggedTotal}
                        onPageChange={setFlaggedPage}
                        onPageSizeChange={setFlaggedPageSize}
                        loading={flaggedLoading}
                    />
                </div>
            )}

            {/* Tab 3: Deletion Requests Content */}
            {activeTab === 'deletions' && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 custom-scrollbar">
                        {deletionsLoading && deletionUsers.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">Loading deletion requests...</div>
                        ) : deletionUsers.length === 0 ? (
                            <div className="text-center py-12 sm:py-16 text-slate-400">
                                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                                <p className="font-semibold text-slate-700 dark:text-slate-300">No Pending Requests</p>
                                <p className="text-xs text-slate-400 mt-1">There are no outstanding GDPR account deletion requests.</p>
                            </div>
                        ) : (
                            deletionUsers.map(user => (
                                <div key={user.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar src={user.avatar_url} alt={user.display_name} size="md" className="shrink-0" />
                                        <div className="min-w-0">
                                            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{user.display_name || 'Anonymous User'}</h4>
                                            <p className="text-xs text-slate-500 font-mono truncate">{user.email || user.id}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                        <button
                                            onClick={() => handleRejectDeletion(user)}
                                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
                                        >
                                            Dismiss Request
                                        </button>
                                        <button
                                            onClick={() => handleApproveErasure(user)}
                                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                                        >
                                            <Trash2 size={13} /> Approve Purge
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Pagination
                        page={deletionsPage}
                        pageSize={deletionsPageSize}
                        totalCount={deletionsTotal}
                        onPageChange={setDeletionsPage}
                        onPageSizeChange={setDeletionsPageSize}
                        loading={deletionsLoading}
                    />
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                isDestructive={confirmModal.isDestructive}
                requirePhrase={confirmModal.requirePhrase}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default ModerationQueue;
