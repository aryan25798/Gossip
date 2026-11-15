import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { BsTelephone, BsCameraVideo, BsArrowDownLeft, BsArrowUpRight } from "react-icons/bs";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Pagination } from "./ui/Pagination";
import { format } from "date-fns";

export default function CallHistory() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [totalCount, setTotalCount] = useState(0);

    const { currentUser } = useAuth();
    const { startCall } = useCall();

    const fetchCalls = async () => {
        const userId = currentUser?.uid || currentUser?.id;
        if (!userId) return;

        setLoading(true);
        try {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await supabase
                .from('calls')
                .select('*', { count: 'exact' })
                .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (data && !error) {
                setHistory(data.map(item => ({
                    id: item.id,
                    direction: item.caller_id === userId ? 'outgoing' : 'incoming',
                    callerId: item.caller_id,
                    receiverId: item.receiver_id,
                    callerName: item.caller_name || 'User',
                    receiverName: item.receiver_name || 'User',
                    callerPhoto: item.caller_photo,
                    receiverPhoto: item.receiver_photo,
                    status: item.status,
                    duration: item.duration || 0,
                    timestamp: item.created_at
                })));
                setTotalCount(count || 0);
            }
        } catch (err) {
            console.error("[CallHistory] Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalls();
    }, [currentUser?.uid, currentUser?.id, page, pageSize]);

    const formatCallTime = (ts) => {
        if (!ts) return "";
        const date = new Date(ts);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return format(date, 'HH:mm');
        }
        return format(date, 'MMM d, HH:mm');
    };

    const formatDuration = (seconds) => {
        if (!seconds) return "";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };

    const handleCallAction = (item, type) => {
        const otherUser = item.direction === 'outgoing'
            ? { uid: item.receiverId, id: item.receiverId, displayName: item.receiverName || "User", photoURL: item.receiverPhoto }
            : { uid: item.callerId, id: item.callerId, displayName: item.callerName || "User", photoURL: item.callerPhoto };

        startCall(otherUser, type);
    };

    if (loading && history.length === 0) {
        return (
            <div className="flex-1 p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="bg-muted p-4 rounded-full mb-4">
                    <BsTelephone className="w-8 h-8 opacity-50" />
                </div>
                <p>No recent calls</p>
                <p className="text-xs mt-1">Start a call from your contacts list.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                <div className="max-w-3xl mx-auto w-full">
                    {history.map(item => {
                        const isMissed = item.status === 'missed' || (item.status === 'ringing' && item.direction === 'incoming');
                        const isOutgoing = item.direction === 'outgoing';
                        const otherName = isOutgoing ? item.receiverName : item.callerName;
                        const otherPhoto = isOutgoing ? item.receiverPhoto : item.callerPhoto;

                        return (
                            <div key={item.id} className="flex items-center gap-4 p-3 hover:bg-surface-elevated transition-all rounded-xl cursor-pointer group mb-1 border border-transparent hover:border-border/30 hover:shadow-sm">
                                <Avatar src={otherPhoto} alt={otherName} size="md" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-sm truncate text-foreground">{otherName}</h4>
                                        {isMissed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-bold uppercase tracking-wider">Missed</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                        {isOutgoing ? (
                                            <BsArrowUpRight className="text-emerald-500 shrink-0" size={12} />
                                        ) : (
                                            <BsArrowDownLeft className={isMissed ? "text-rose-500 shrink-0" : "text-emerald-500 shrink-0"} size={12} />
                                        )}
                                        <span>{isOutgoing ? 'Outgoing' : 'Incoming'}</span>
                                        <span>•</span>
                                        <span>{formatCallTime(item.timestamp)}</span>
                                        {item.duration > 0 && (
                                            <>
                                                <span>•</span>
                                                <span>{formatDuration(item.duration)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-9 w-9 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCallAction(item, 'audio');
                                        }}
                                        title="Audio Call"
                                    >
                                        <BsTelephone size={15} />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-9 w-9 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCallAction(item, 'video');
                                        }}
                                        title="Video Call"
                                    >
                                        <BsCameraVideo size={16} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pagination Controls */}
            {totalCount > pageSize && (
                <Pagination
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    loading={loading}
                />
            )}
        </div>
    );
}
