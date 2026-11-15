import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminOverview from '../components/admin/AdminOverview';
import UserRegistry from '../components/admin/UserRegistry';
import UserDossier from '../components/admin/UserDossier';
import ModerationQueue from '../components/admin/ModerationQueue';
import ConversationModeration from '../components/admin/ConversationModeration';
import Announcements from '../components/admin/Announcements';
import GodMap from '../components/admin/GodMap';
import AdminAuditLogs from '../components/admin/AdminAuditLogs';
import { Avatar } from '../components/ui/Avatar';
import {
    LayoutDashboard, Users, ShieldAlert, MessageSquare, Megaphone,
    MapPin, FileText, LogOut, Menu, X, ChevronRight, MessageCircle,
    PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

export const AdminDashboard = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'overview';
    const [selectedUserDossier, setSelectedUserDossier] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navigate = useNavigate();
    const { logout, currentUser } = useAuth();

    // Security Gate Check
    useEffect(() => {
        if (currentUser) {
            const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superAdmin' || !!currentUser.isAdmin;
            if (!isAdmin) {
                console.warn('[AdminSecurity] Non-administrative identity detected. Access terminated.');
                navigate('/', { replace: true });
            }
        }
    }, [currentUser, navigate]);

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
        setIsMobileMenuOpen(false);
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch {
            alert('Failed to log out');
        }
    };

    const navItems = [
        { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
        { id: 'registry', label: 'User Registry', icon: Users },
        { id: 'moderation', label: 'Moderation Queue', icon: ShieldAlert },
        { id: 'conversations', label: 'Conversations', icon: MessageSquare },
        { id: 'announcements', label: 'Megaphone Alerts', icon: Megaphone },
        { id: 'locations', label: 'Location Radar', icon: MapPin },
        { id: 'audit', label: 'Audit Trail', icon: FileText },
    ];

    const currentTabObj = navItems.find(item => item.id === activeTab) || navItems[0];

    return (
        <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden select-none">
            {/* Mobile Drawer Backdrop */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside
                className={`
                    fixed lg:static inset-y-0 left-0 z-50 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden
                    ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
                    w-72 max-w-[85vw]
                    ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Brand / Logo */}
                <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 overflow-hidden">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-base shadow-sm shrink-0">
                            N
                        </div>
                        {/* Title: In desktop collapsed mode, hide text completely; always show in mobile drawer */}
                        <div className={`min-w-0 ${isSidebarCollapsed ? 'hidden lg:hidden' : 'block'}`}>
                            <h1 className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 leading-none truncate">
                                NovaChat
                            </h1>
                            <span className="text-[10px] text-slate-500 font-medium tracking-wide block mt-1 truncate">
                                Enterprise Portal
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                        title="Close menu"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto custom-scrollbar overflow-x-hidden">
                    <div className={`px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate ${isSidebarCollapsed ? 'hidden lg:hidden' : 'block'}`}>
                        System Management
                    </div>

                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                title={item.label}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group overflow-hidden
                                    ${isActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                                    }
                                    ${isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}
                                `}
                            >
                                <Icon size={18} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200'}`} />
                                <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : 'inline'}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* Sidebar Footer: App Switcher & Logout */}
                <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 space-y-1 overflow-hidden">
                    <button
                        onClick={() => navigate('/chat')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors overflow-hidden ${
                            isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
                        }`}
                        title="Open NovaChat Messenger"
                    >
                        <MessageCircle size={16} className="text-emerald-500 shrink-0" />
                        <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : 'inline'}`}>Open User Chat</span>
                    </button>

                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors overflow-hidden ${
                            isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
                        }`}
                        title="Sign Out"
                    >
                        <LogOut size={16} className="shrink-0" />
                        <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : 'inline'}`}>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
                {/* Top Enterprise Header Bar */}
                <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 md:px-6 flex items-center justify-between shrink-0 overflow-hidden w-full">
                    {/* Left side: Mobile menu toggle, collapse toggle, breadcrumb / title */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {/* Mobile Drawer Trigger (Visible < lg) */}
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                            title="Open navigation drawer"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Desktop Sidebar Collapse Toggle (Visible >= lg) */}
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="hidden lg:flex p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>

                        {/* Breadcrumbs (Desktop & Tablet) */}
                        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500 min-w-0 truncate">
                            <span className="shrink-0">Admin Portal</span>
                            <ChevronRight size={14} className="text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[140px] lg:max-w-[200px]">
                                {currentTabObj.label}
                            </span>
                        </div>

                        {/* Mobile Tab Title (Phone) */}
                        <span className="md:hidden font-bold text-xs text-slate-900 dark:text-slate-100 truncate max-w-[130px] sm:max-w-[180px]">
                            {currentTabObj.label}
                        </span>
                    </div>

                    {/* Right-aligned Header Telemetry & User Controls */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
                        {/* Return to Chat App Button */}
                        <button
                            onClick={() => navigate('/')}
                            className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shrink-0 flex items-center gap-1.5"
                            title="Return to NovaChat Messenger"
                        >
                            <MessageCircle size={15} className="text-emerald-500 shrink-0" />
                            <span className="hidden sm:inline">User App</span>
                        </button>

                        {/* Live Telemetry Pulse (Only on very wide screens xl: >= 1280px) */}
                        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>System Nominal</span>
                        </div>

                        {/* Admin Identity Badge */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right hidden sm:block max-w-[100px] md:max-w-[130px] lg:max-w-[160px] truncate">
                                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none truncate">
                                    {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Administrator'}
                                </p>
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block mt-0.5 truncate">
                                    {currentUser?.role || 'SuperAdmin'}
                                </span>
                            </div>
                            <Avatar
                                src={currentUser?.avatar_url || currentUser?.photoURL}
                                alt="Admin"
                                fallback="A"
                                size="sm"
                                className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                        </div>
                    </div>
                </header>

                {/* Viewport Content */}
                <main className="flex-1 overflow-hidden relative w-full">
                    {activeTab === 'overview' && <AdminOverview />}
                    {activeTab === 'registry' && <UserRegistry onOpenDossier={setSelectedUserDossier} />}
                    {activeTab === 'moderation' && <ModerationQueue />}
                    {activeTab === 'conversations' && <ConversationModeration />}
                    {activeTab === 'announcements' && <Announcements />}
                    {activeTab === 'locations' && <GodMap />}
                    {activeTab === 'audit' && <AdminAuditLogs />}
                </main>
            </div>

            {/* Global User Dossier Modal */}
            {selectedUserDossier && (
                <UserDossier
                    user={selectedUserDossier}
                    onClose={() => setSelectedUserDossier(null)}
                />
            )}
        </div>
    );
};

export default AdminDashboard;
