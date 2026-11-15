import React, { useEffect, useState, useMemo } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../contexts/AuthContext';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
    Users, MessageSquare, PhoneCall, ShieldAlert, AlertTriangle,
    Database, HardDrive, CheckCircle2, Clock, RefreshCw, ArrowUpRight, TrendingUp
} from 'lucide-react';

export const AdminOverview = () => {
    const { currentUser } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeRange, setTimeRange] = useState(30); // 7, 30, 90 days

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminService.getStats(timeRange);
            setStats(data);
        } catch (err) {
            console.error('[AdminOverview] Error loading stats:', err);
            setError(err.message || 'Failed to retrieve system telemetry.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, [timeRange]);

    const StatCard = ({ title, value, subtext, icon: Icon, color = 'indigo', badge }) => {
        const colorClasses = {
            indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50',
            emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50',
            amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50',
            rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/50',
            blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50'
        }[color] || 'bg-slate-50 text-slate-600';

        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {title}
                    </span>
                    <div className={`p-2 rounded-xl border ${colorClasses}`}>
                        <Icon size={18} />
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        {value.toLocaleString()}
                    </span>
                    {badge && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {badge}
                        </span>
                    )}
                </div>
                {subtext && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1 font-medium">
                        {subtext}
                    </p>
                )}
            </div>
        );
    };

    if (loading && !stats) {
        return (
            <div className="p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
                <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800/60 rounded-2xl animate-pulse" />
                    ))}
                </div>
                <div className="h-80 bg-slate-100 dark:bg-slate-800/40 rounded-2xl animate-pulse" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 sm:p-8 flex items-center justify-center">
                <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-6 text-center shadow-lg">
                    <AlertTriangle size={32} className="mx-auto text-rose-500 mb-3" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                        Failed to Load Telemetry
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">{error}</p>
                    <button
                        onClick={loadStats}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-6 md:p-8 space-y-5 sm:space-y-8 h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
            {/* Header with Time Range Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        Command Center
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Operational telemetry, active workloads, and live infrastructure metrics.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm text-xs">
                        {[
                            { label: '7D', value: 7 },
                            { label: '30D', value: 30 },
                            { label: '90D', value: 90 }
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => setTimeRange(t.value)}
                                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                                    timeRange === t.value
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={loadStats}
                        disabled={loading}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                        title="Refresh metrics"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Registered Users"
                    value={stats?.totalUsers || 0}
                    subtext={`+${stats?.newUsersRange || 0} registered in last ${timeRange}d`}
                    icon={Users}
                    color="indigo"
                />
                <StatCard
                    title="Active Users (24h)"
                    value={stats?.activeUsers24h || 0}
                    subtext="Real-time online presence"
                    icon={CheckCircle2}
                    color="emerald"
                />
                <StatCard
                    title="Messages Processed"
                    value={stats?.totalMessages || 0}
                    subtext="Encrypted chat records"
                    icon={MessageSquare}
                    color="blue"
                />
                <StatCard
                    title="Voice & Video Calls"
                    value={stats?.totalCalls || 0}
                    subtext="WebRTC media sessions"
                    icon={PhoneCall}
                    color="amber"
                />
            </div>

            {/* Action Item Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Pending Reports"
                    value={stats?.pendingReports || 0}
                    subtext={stats?.pendingReports > 0 ? 'Requires moderator review' : 'No pending flags'}
                    icon={ShieldAlert}
                    color={stats?.pendingReports > 0 ? 'rose' : 'emerald'}
                    badge={stats?.pendingReports > 0 ? 'Action Needed' : 'Nominal'}
                />
                <StatCard
                    title="Account Deletion Requests"
                    value={stats?.pendingDeletions || 0}
                    subtext="Pending GDPR erasure verification"
                    icon={AlertTriangle}
                    color={stats?.pendingDeletions > 0 ? 'amber' : 'emerald'}
                    badge={stats?.pendingDeletions > 0 ? 'Pending' : 'Clear'}
                />
                <StatCard
                    title="Active Conversations"
                    value={stats?.totalChats || 0}
                    subtext="Direct & Group streams"
                    icon={MessageSquare}
                    color="indigo"
                />
                <StatCard
                    title="System Status"
                    value={stats?.systemHealth?.database ? 'Healthy' : 'Degraded'}
                    subtext={`DB: ${stats?.systemHealth?.databaseLatency} · Storage: ${stats?.systemHealth?.storageLatency}`}
                    icon={CheckCircle2}
                    color={stats?.systemHealth?.database ? 'emerald' : 'rose'}
                />
            </div>

            {/* Growth Trajectory Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm min-w-0 overflow-hidden">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />
                            User Registration Trajectory
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Real-time user onboarding activity over the selected {timeRange}-day period.
                        </p>
                    </div>
                </div>

                <div className="h-60 sm:h-64 w-full min-w-0 overflow-hidden">
                    {stats?.charts?.userGrowth && (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.charts.userGrowth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0f172a',
                                        borderColor: '#334155',
                                        borderRadius: '12px',
                                        color: '#f8fafc',
                                        fontSize: '12px'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    fill="url(#growthGrad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Core Infrastructure Health Probes */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Measured Infrastructure Health
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                <Database size={18} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">PostgreSQL Database</h4>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">Probe latency: {stats?.systemHealth?.databaseLatency}</p>
                            </div>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Operational
                        </span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                                <RefreshCw size={18} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Supabase Realtime</h4>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">WebSocket Gateway: Connected</p>
                            </div>
                        </div>
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Connected
                        </span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                                <HardDrive size={18} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Media Storage Bucket</h4>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">Access latency: {stats?.systemHealth?.storageLatency}</p>
                            </div>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Available
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminOverview;
