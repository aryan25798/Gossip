import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';
import { ConfirmModal } from '../ui/ConfirmModal';
import { format } from 'date-fns';
import {
    X, Shield, ShieldAlert, Trash2, Mail, Phone, Calendar,
    Activity, MessageSquare, PhoneCall, AlertTriangle, UserCheck, UserX, ExternalLink, Loader2
} from 'lucide-react';

export const UserDossier = ({ user, onClose, onRefreshList }) => {
    const { currentUser } = useAuth();
    const [dossierData, setDossierData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'activity', 'security'

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        isDestructive: false,
        requirePhrase: null,
        onConfirm: () => {}
    });

    useEffect(() => {
        if (!user?.id) return;
        const loadDossier = async () => {
            setLoading(true);
            try {
                const data = await adminService.getUserDossier(user.id);
                setDossierData(data);
            } catch (err) {
                console.error('[UserDossier] Load error:', err);
            } finally {
                setLoading(false);
            }
        };
        loadDossier();
    }, [user?.id]);

    if (!user) return null;

    const handleBan = async () => {
        const willBan = !user.is_banned;
        setConfirmModal({
            isOpen: true,
            title: willBan ? 'Ban User Account' : 'Restore User Account',
            message: `Are you sure you want to ${willBan ? 'ban' : 'unban'} ${user.display_name || user.email}?`,
            confirmText: willBan ? 'Ban Account' : 'Unban Account',
            isDestructive: willBan,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.banUser(user.id, willBan, currentUser);
                    onClose();
                    if (onRefreshList) onRefreshList();
                } catch (err) {
                    alert('Action failed: ' + err.message);
                }
            }
        });
    };

    const handleErasure = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Permanent Account Erasure',
            message: `CRITICAL ACTION: This will execute complete account erasure for ${user.display_name || user.email}. All authentication credentials, messages, files, and relationships will be wiped permanently.`,
            confirmText: 'Permanently Erase Account',
            isDestructive: true,
            requirePhrase: 'PURGE',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.eraseUser(user.id, currentUser);
                    alert('Account permanently erased.');
                    onClose();
                    if (onRefreshList) onRefreshList();
                } catch (err) {
                    alert('Erasure failed: ' + err.message);
                }
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <Avatar
                            src={user.avatar_url || user.photoURL}
                            alt={user.display_name}
                            fallback={user.display_name?.[0]}
                            size="lg"
                            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border-2 border-white dark:border-slate-800 shadow-md shrink-0"
                        />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {user.display_name || 'Anonymous User'}
                                </h3>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                    user.is_banned
                                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                                }`}>
                                    {user.is_banned ? 'Banned' : 'Active'}
                                </span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-500 font-mono mt-0.5 truncate">
                                ID: {user.id}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs Navigation */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 gap-4 sm:gap-6 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-500 overflow-x-auto">
                    {[
                        { id: 'profile', label: 'Identity & Details' },
                        { id: 'activity', label: 'Activity & Telemetry' },
                        { id: 'security', label: 'Moderation & Actions' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-3 sm:py-3.5 border-b-2 transition-all whitespace-nowrap shrink-0 ${
                                activeTab === tab.id
                                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                                    : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Body Content */}
                <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 sm:space-y-6">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <Loader2 size={24} className="animate-spin text-indigo-500" />
                            <span className="text-xs">Loading user dossier...</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'profile' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5 text-slate-500 mb-1.5">
                                                <Mail size={15} />
                                                <span className="text-xs font-semibold uppercase tracking-wider">Email Address</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 font-mono">
                                                {user.email || '—'}
                                            </p>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5 text-slate-500 mb-1.5">
                                                <Phone size={15} />
                                                <span className="text-xs font-semibold uppercase tracking-wider">Phone Frequency</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 font-mono">
                                                {user.phone_number || 'Not provided'}
                                            </p>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5 text-slate-500 mb-1.5">
                                                <Calendar size={15} />
                                                <span className="text-xs font-semibold uppercase tracking-wider">Registration Date</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                {user.created_at ? format(new Date(user.created_at), 'PPPp') : 'Unknown'}
                                            </p>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5 text-slate-500 mb-1.5">
                                                <Shield size={15} />
                                                <span className="text-xs font-semibold uppercase tracking-wider">System Role</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                                {user.role || 'user'}
                                            </p>
                                        </div>
                                    </div>

                                    {user.deletion_requested && (
                                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center gap-3 text-amber-800 dark:text-amber-300 text-xs">
                                            <AlertTriangle size={20} className="shrink-0 text-amber-600" />
                                            <div>
                                                <p className="font-bold">Account Deletion Requested</p>
                                                <p className="mt-0.5">This user has requested permanent account termination under GDPR right-to-be-forgotten.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'activity' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-center">
                                            <MessageSquare size={18} className="mx-auto text-indigo-600 dark:text-indigo-400 mb-1" />
                                            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 block">
                                                {dossierData?.metrics?.messagesSent || 0}
                                            </span>
                                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Messages</span>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 text-center">
                                            <Activity size={18} className="mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
                                            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 block">
                                                {dossierData?.metrics?.conversationsJoined || 0}
                                            </span>
                                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Chats Joined</span>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 text-center">
                                            <PhoneCall size={18} className="mx-auto text-amber-600 dark:text-amber-400 mb-1" />
                                            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 block">
                                                {dossierData?.metrics?.callsParticipated || 0}
                                            </span>
                                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Calls Log</span>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/50 text-center">
                                            <ShieldAlert size={18} className="mx-auto text-rose-600 dark:text-rose-400 mb-1" />
                                            <span className="text-xl font-bold text-slate-900 dark:text-slate-100 block">
                                                {dossierData?.metrics?.reportsReceived || 0}
                                            </span>
                                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Reports</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'security' && (
                                <div className="space-y-4">
                                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                                Platform Access Status
                                            </h4>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {user.is_banned
                                                    ? 'This user is currently banned and cannot log into the platform.'
                                                    : 'This user has full access to the messaging platform.'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleBan}
                                            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                                                user.is_banned
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                                            }`}
                                        >
                                            {user.is_banned ? 'Restore Access' : 'Restrict Account'}
                                        </button>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                                                Permanent Account Erasure
                                            </h4>
                                            <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5 max-w-sm">
                                                Permanently purge auth identity, media files, messages, and telemetry from the database.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleErasure}
                                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all"
                                        >
                                            Purge Account
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                        Close Dossier
                    </button>
                </div>
            </div>

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

export default UserDossier;
