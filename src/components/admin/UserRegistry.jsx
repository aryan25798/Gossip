import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import { Pagination } from '../ui/Pagination';
import { BulkActionToolbar } from '../ui/BulkActionToolbar';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Avatar } from '../ui/Avatar';
import { format } from 'date-fns';
import {
    Search, Filter, Shield, ShieldAlert, Trash2, RefreshCw,
    MapPin, UserCheck, UserX, ArrowUpDown, ChevronDown, Download, Check, Eye
} from 'lucide-react';

export const UserRegistry = ({ onOpenDossier }) => {
    const { currentUser } = useAuth();

    // Data & Pagination State
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    // Filters & Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    // Selection & Bulk Actions
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [processingText, setProcessingText] = useState('');

    // Modal Confirmation State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        isDestructive: false,
        requirePhrase: null,
        onConfirm: () => {}
    });

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to page 1 on new search
        }, 400);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Clear selection on page or filter change
    useEffect(() => {
        setSelectedIds(new Set());
    }, [page, pageSize, roleFilter, statusFilter, debouncedSearch]);

    // Fetch users from server
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminService.getUsersPaginated({
                page,
                pageSize,
                search: debouncedSearch,
                role: roleFilter,
                status: statusFilter,
                sortBy,
                sortOrder
            });

            setUsers(res.users);
            setTotalCount(res.totalCount);
        } catch (err) {
            console.error('[UserRegistry] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearch, roleFilter, statusFilter, sortBy, sortOrder]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Selection Handlers
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(new Set(users.map(u => u.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleToggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    // Sort toggle
    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('desc');
        }
        setPage(1);
    };

    // Single Actions
    const handleBanToggle = (user) => {
        const willBan = !user.is_banned;
        setConfirmModal({
            isOpen: true,
            title: willBan ? 'Restrict User Account' : 'Restore User Account',
            message: willBan
                ? `Are you sure you want to ban ${user.display_name || user.email}? They will immediately lose access to the platform.`
                : `Are you sure you want to lift the ban on ${user.display_name || user.email}?`,
            confirmText: willBan ? 'Ban Account' : 'Unban Account',
            isDestructive: willBan,
            requirePhrase: null,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.banUser(user.id, willBan, currentUser);
                    fetchUsers();
                } catch (err) {
                    alert('Action failed: ' + err.message);
                }
            }
        });
    };

    const handleAccountErasure = (user) => {
        setConfirmModal({
            isOpen: true,
            title: 'Permanent Account Erasure',
            message: `CRITICAL ACTION: This will permanently delete ${user.display_name || user.email}'s Supabase Auth user, profile, personal messages, attachments in storage, contacts, and call history. This action CANNOT be undone.`,
            confirmText: 'Permanently Erase Account',
            isDestructive: true,
            requirePhrase: 'PURGE',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setBulkProcessing(true);
                setProcessingText('Executing atomic account erasure...');
                try {
                    await adminService.eraseUser(user.id, currentUser);
                    alert(`Account ${user.email} successfully purged.`);
                    fetchUsers();
                } catch (err) {
                    alert('Erasure failed: ' + err.message);
                } finally {
                    setBulkProcessing(false);
                }
            }
        });
    };

    // Bulk Actions
    const handleBulkBan = (willBan) => {
        const ids = Array.from(selectedIds);
        setConfirmModal({
            isOpen: true,
            title: willBan ? 'Bulk Ban Users' : 'Bulk Restore Users',
            message: `Are you sure you want to ${willBan ? 'ban' : 'unban'} ${ids.length} selected user accounts?`,
            confirmText: willBan ? 'Ban Selected' : 'Unban Selected',
            isDestructive: willBan,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setBulkProcessing(true);
                setProcessingText(`${willBan ? 'Banning' : 'Restoring'} accounts...`);
                try {
                    await adminService.bulkBanUsers(ids, willBan, currentUser);
                    setSelectedIds(new Set());
                    fetchUsers();
                } catch (err) {
                    alert('Bulk action failed: ' + err.message);
                } finally {
                    setBulkProcessing(false);
                }
            }
        });
    };

    const handleBulkErasure = () => {
        const ids = Array.from(selectedIds);
        setConfirmModal({
            isOpen: true,
            title: 'Bulk Permanent Account Erasure',
            message: `DANGER: You are about to permanently erase ${ids.length} user accounts and all associated messages, storage media, and authentication identities.`,
            confirmText: 'Erase Selected Accounts',
            isDestructive: true,
            requirePhrase: 'CONFIRM DELETION',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setBulkProcessing(true);
                setProcessingText(`Erasing ${ids.length} accounts in batch...`);
                try {
                    const result = await adminService.bulkEraseUsers(ids, currentUser);
                    alert(`Bulk Erasure Complete: ${result.success_count} succeeded, ${result.fail_count} failed.`);
                    setSelectedIds(new Set());
                    fetchUsers();
                } catch (err) {
                    alert('Bulk erasure failed: ' + err.message);
                } finally {
                    setBulkProcessing(false);
                }
            }
        });
    };

    // Safe CSV export
    const handleExportCSV = () => {
        const headers = ['User ID', 'Display Name', 'Email', 'Role', 'Status', 'Registered At'];
        const rows = users.map(u => [
            u.id,
            `"${(u.display_name || '').replace(/"/g, '""')}"`,
            u.email || '',
            u.role || 'user',
            u.is_banned ? 'Banned' : 'Active',
            u.created_at || ''
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `novachat_users_page_${page}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const isAllSelected = users.length > 0 && selectedIds.size === users.length;

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden w-full">
            {/* Header & Controls Area */}
            <div className="p-3 sm:p-6 pb-3 sm:pb-4 space-y-3 sm:space-y-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                            <span>User Registry</span>
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shrink-0">
                                {totalCount} Total
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            Search, filter, inspect, and moderate all platform user accounts.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <button
                            onClick={handleExportCSV}
                            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            title="Export current page to CSV"
                        >
                            <Download size={14} />
                            <span className="hidden sm:inline">Export Page</span>
                        </button>
                        <button
                            onClick={fetchUsers}
                            disabled={loading}
                            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
                            title="Refresh users"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            placeholder="Search by name, email, or user ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                        />
                    </div>

                    {/* Role & Status Filter */}
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
                        <select
                            value={roleFilter}
                            onChange={(e) => {
                                setRoleFilter(e.target.value);
                                setPage(1);
                            }}
                            className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="all">All Roles</option>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="superAdmin">SuperAdmin</option>
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="all">All Statuses</option>
                            <option value="active">Active Only</option>
                            <option value="banned">Banned Only</option>
                            <option value="deletion_requested">Deletion Requested</option>
                        </select>
                    </div>
                </div>

                {/* Bulk Action Toolbar */}
                <BulkActionToolbar
                    selectedCount={selectedIds.size}
                    onClearSelection={() => setSelectedIds(new Set())}
                    processing={bulkProcessing}
                    processingText={processingText}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => handleBulkBan(true)}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                            <UserX size={13} /> Ban Selected
                        </button>
                        <button
                            onClick={() => handleBulkBan(false)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                            <UserCheck size={13} /> Unban Selected
                        </button>
                        <button
                            onClick={handleBulkErasure}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
                        >
                            <Trash2 size={13} /> Purge Selected
                        </button>
                    </div>
                </BulkActionToolbar>
            </div>

            {/* Desktop Table View (Hidden on mobile < md) */}
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                            <th className="py-3 px-4 w-10">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
                                />
                            </th>
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('display_name')}>
                                <div className="flex items-center gap-1.5">
                                    <span>User</span>
                                    <ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('email')}>
                                <div className="flex items-center gap-1.5">
                                    <span>Email</span>
                                    <ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors" onClick={() => handleSort('created_at')}>
                                <div className="flex items-center gap-1.5">
                                    <span>Registered</span>
                                    <ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {loading && users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-400">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <RefreshCw size={20} className="animate-spin text-indigo-500" />
                                        <span>Loading user directory...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-12 text-center text-slate-400">
                                    <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">No users found</p>
                                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms or filters.</p>
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => {
                                const isSelected = selectedIds.has(user.id);
                                return (
                                    <tr
                                        key={user.id}
                                        onClick={() => onOpenDossier && onOpenDossier(user)}
                                        className={`group cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors ${
                                            isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                                        }`}
                                    >
                                        {/* Checkbox */}
                                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelect(user.id)}
                                                className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </td>

                                        {/* User Identity */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar
                                                    src={user.avatar_url}
                                                    alt={user.display_name}
                                                    fallback={user.display_name?.[0]}
                                                    size="sm"
                                                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                        {user.display_name || 'Anonymous User'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-mono truncate">
                                                        {user.id}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Email */}
                                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                                            <span className="truncate block max-w-[200px]">{user.email || '—'}</span>
                                        </td>

                                        {/* Role */}
                                        <td className="py-3.5 px-4">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                user.role === 'admin' || user.role === 'superAdmin'
                                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                            }`}>
                                                {user.role || 'user'}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4">
                                            {user.is_banned ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
                                                    Banned
                                                </span>
                                            ) : user.deletion_requested ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                                                    Deletion Req
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
                                                    Active
                                                </span>
                                            )}
                                        </td>

                                        {/* Registered Date */}
                                        <td className="py-3.5 px-4 text-slate-500">
                                            {user.created_at ? format(new Date(user.created_at), 'MMM dd, yyyy') : '—'}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => handleBanToggle(user)}
                                                    className={`p-1.5 rounded-lg border transition-colors ${
                                                        user.is_banned
                                                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                                            : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                                                    }`}
                                                    title={user.is_banned ? 'Restore User' : 'Ban User'}
                                                >
                                                    {user.is_banned ? <UserCheck size={14} /> : <UserX size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => handleAccountErasure(user)}
                                                    className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                                                    title="Permanently Erase Account"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card Stream View (Shown on screens < md) */}
            <div className="block md:hidden flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {loading && users.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                        <RefreshCw size={20} className="animate-spin mx-auto text-indigo-500 mb-2" />
                        <span>Loading user directory...</span>
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">No users found</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms or filters.</p>
                    </div>
                ) : (
                    users.map((user) => {
                        const isSelected = selectedIds.has(user.id);
                        return (
                            <div
                                key={user.id}
                                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm space-y-3 transition-colors ${
                                    isSelected
                                        ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                {/* User Info Header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleSelect(user.id)}
                                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer shrink-0"
                                        />
                                        <Avatar
                                            src={user.avatar_url}
                                            alt={user.display_name}
                                            fallback={user.display_name?.[0]}
                                            size="sm"
                                            className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <p className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                                {user.display_name || 'Anonymous User'}
                                            </p>
                                            <p className="text-[11px] text-slate-500 truncate">
                                                {user.email || 'No email registered'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="shrink-0">
                                        {user.is_banned ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                                                Banned
                                            </span>
                                        ) : user.deletion_requested ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                                                Deletion Req
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Metadata Row */}
                                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span>Role: <strong className="text-slate-700 dark:text-slate-300 uppercase">{user.role || 'user'}</strong></span>
                                    <span>Joined: {user.created_at ? format(new Date(user.created_at), 'MMM dd, yyyy') : '—'}</span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center justify-between gap-2 pt-1">
                                    <button
                                        onClick={() => onOpenDossier && onOpenDossier(user)}
                                        className="flex-1 py-1.5 px-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <Eye size={13} />
                                        <span>Dossier</span>
                                    </button>

                                    <button
                                        onClick={() => handleBanToggle(user)}
                                        className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
                                            user.is_banned
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 border border-emerald-200'
                                                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 border border-amber-200'
                                        }`}
                                    >
                                        {user.is_banned ? <UserCheck size={13} /> : <UserX size={13} />}
                                        <span>{user.is_banned ? 'Unban' : 'Ban'}</span>
                                    </button>

                                    <button
                                        onClick={() => handleAccountErasure(user)}
                                        className="p-1.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 border border-rose-200 hover:bg-rose-100 transition-colors"
                                        title="Purge Account"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination Component */}
            <Pagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                loading={loading}
            />

            {/* Destructive / Action Confirm Modal */}
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

export default UserRegistry;
