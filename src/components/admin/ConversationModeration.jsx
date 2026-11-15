import React, { useState, useEffect, useRef, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { supabase } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Pagination } from '../ui/Pagination';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Avatar } from '../ui/Avatar';
import { VideoPlayer } from '../ui/VideoPlayer';
import { downloadMedia } from '../../utils/downloadHelper';
import { format } from 'date-fns';
import {
    Eye, ShieldAlert, Trash2, Search, MessageSquare, AlertTriangle,
    RefreshCw, X, Download, FileText, Radio, CheckCircle2
} from 'lucide-react';

export const ConversationModeration = () => {
    const { currentUser } = useAuth();

    // Conversations List State
    const [chats, setChats] = useState([]);
    const [chatsLoading, setChatsLoading] = useState(true);
    const [chatsPage, setChatsPage] = useState(1);
    const [chatsPageSize, setChatsPageSize] = useState(15);
    const [chatsTotal, setChatsTotal] = useState(0);
    const [searchChat, setSearchChat] = useState('');

    // Active Chat Live Stream State
    const [activeChatId, setActiveChatId] = useState(null);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [msgPage, setMsgPage] = useState(1);
    const [msgTotal, setMsgTotal] = useState(0);

    // Confirm Modal
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        isDestructive: false,
        onConfirm: () => {}
    });

    const messagesEndRef = useRef(null);

    // 1. Fetch Conversations Directory
    const fetchChats = useCallback(async () => {
        setChatsLoading(true);
        try {
            const res = await adminService.getAllChatsPaginated({
                page: chatsPage,
                pageSize: chatsPageSize,
                search: searchChat
            });
            setChats(res.chats);
            setChatsTotal(res.totalCount);
        } catch (err) {
            console.error('[SpyMode] Error loading chats:', err);
        } finally {
            setChatsLoading(false);
        }
    }, [chatsPage, chatsPageSize, searchChat]);

    useEffect(() => {
        fetchChats();
    }, [fetchChats]);

    // 2. Fetch Messages when a conversation is selected
    const loadConversationMessages = useCallback(async (chatId, page = 1) => {
        if (!chatId) return;
        setMessagesLoading(true);
        try {
            const res = await adminService.getChatMessagesPaginated(chatId, {
                page,
                pageSize: 50
            });
            setActiveChat(res);
            setMessages(res.messages);
            setMsgTotal(res.totalCount);
            if (page === 1) {
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        } catch (err) {
            console.error('[SpyMode] Error loading messages:', err);
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    const handleSelectChat = (chatId) => {
        setActiveChatId(chatId);
        setMsgPage(1);
        loadConversationMessages(chatId, 1);
    };

    // 3. Real-Time Interception Feed (Supabase Realtime Channel)
    useEffect(() => {
        if (!activeChatId) return;

        const channel = supabase
            .channel(`spy_chat_${activeChatId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${activeChatId}`
                },
                (payload) => {
                    const row = payload.new;
                    const newMsg = {
                        id: row.id,
                        senderId: row.sender_id,
                        senderName: 'User',
                        text: row.content,
                        content: row.content,
                        type: row.message_type,
                        fileUrl: row.media_url,
                        timestamp: row.created_at,
                        status: row.status
                    };

                    setMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeChatId]);

    // 4. Hard Delete Message
    const handleDeleteMessage = (msgId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Remove Message Permanently',
            message: 'Permanently remove this message from the database for all participants?',
            confirmText: 'Delete Message',
            isDestructive: true,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.hardDeleteMessage(msgId, currentUser);
                    setMessages(prev => prev.filter(m => m.id !== msgId));
                } catch (err) {
                    alert('Delete failed: ' + err.message);
                }
            }
        });
    };

    // 5. Purge Whole Conversation
    const handlePurgeChat = () => {
        if (!activeChatId) return;
        setConfirmModal({
            isOpen: true,
            title: 'Purge Entire Conversation',
            message: 'CRITICAL ACTION: This will permanently delete this entire chat and all associated messages for ALL users. This action cannot be undone.',
            confirmText: 'Purge Conversation',
            isDestructive: true,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await adminService.hardDeleteChat(activeChatId, currentUser);
                    setActiveChatId(null);
                    setActiveChat(null);
                    fetchChats();
                } catch (err) {
                    alert('Purge failed: ' + err.message);
                }
            }
        });
    };

    return (
        <div className="flex h-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
            {/* Left Panel: Conversations Directory */}
            <div className={`w-full lg:w-80 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 ${
                activeChatId ? 'hidden lg:flex' : 'flex'
            }`}>
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Eye size={16} className="text-indigo-600 dark:text-indigo-400" />
                            Live Chat Feeds
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 uppercase">
                            {chatsTotal} Streams
                        </span>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search active chats..."
                            value={searchChat}
                            onChange={(e) => {
                                setSearchChat(e.target.value);
                                setChatsPage(1);
                            }}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                        />
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar">
                    {chatsLoading && chats.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400">Loading conversation feeds...</div>
                    ) : chats.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-400">No active conversations found.</div>
                    ) : (
                        chats.map(c => (
                            <div
                                key={c.id}
                                onClick={() => handleSelectChat(c.id)}
                                className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                                    activeChatId === c.id ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-l-4 border-indigo-600' : ''
                                }`}
                            >
                                <div className="flex justify-between items-baseline mb-1">
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]">
                                        {c.title || `Direct Chat (${c.id.slice(0, 8)})`}
                                    </h4>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {c.lastMessageTimestamp ? format(new Date(c.lastMessageTimestamp), 'HH:mm') : ''}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 truncate">{c.lastMessage || 'Empty chat history'}</p>
                            </div>
                        ))
                    )}
                </div>

                {chatsTotal > chatsPageSize && (
                    <Pagination
                        page={chatsPage}
                        pageSize={chatsPageSize}
                        totalCount={chatsTotal}
                        onPageChange={setChatsPage}
                        onPageSizeChange={setChatsPageSize}
                        loading={chatsLoading}
                    />
                )}
            </div>

            {/* Right Panel: Live Spy Message Viewer */}
            <div className={`flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden ${
                activeChatId ? 'flex' : 'hidden lg:flex'
            }`}>
                {activeChatId ? (
                    <>
                        {/* Header */}
                        <div className="p-4 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-sm">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setActiveChatId(null)}
                                    className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500"
                                >
                                    ✕
                                </button>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                            Neural Feed: <span className="font-mono text-indigo-600 dark:text-indigo-400">{activeChatId.slice(0, 12)}...</span>
                                        </h3>
                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Live Intercept
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {activeChat?.participants?.map(p => p.display_name).join(', ') || 'Participants active'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePurgeChat}
                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                                    title="Permanently Delete Entire Chat"
                                >
                                    <Trash2 size={13} /> Purge Chat
                                </button>
                            </div>
                        </div>

                        {/* Messages Feed */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                            {messagesLoading ? (
                                <div className="text-center py-12 text-xs text-slate-400">Loading conversation history...</div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 text-xs">No messages recorded in this chat stream.</div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-start justify-between gap-4 group hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                        <div className="space-y-1.5 max-w-xl">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{msg.senderName}</span>
                                                <span className="text-[10px] text-slate-400">
                                                    {msg.timestamp ? format(new Date(msg.timestamp), 'p') : ''}
                                                </span>
                                                {msg.status === 'flagged' && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 uppercase">Flagged</span>
                                                )}
                                            </div>

                                            {/* Rich Media Render */}
                                            {msg.type === 'image' && (
                                                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 max-w-sm mt-1 relative group/img">
                                                    <img src={msg.fileUrl || msg.content} alt="Media" className="w-full object-cover max-h-60" />
                                                    <button
                                                        onClick={() => downloadMedia(msg.fileUrl || msg.content, 'image.png')}
                                                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                        title="Download image"
                                                    >
                                                        <Download size={13} />
                                                    </button>
                                                </div>
                                            )}

                                            {msg.type === 'video' && (
                                                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 max-w-sm mt-1">
                                                    <VideoPlayer src={msg.fileUrl || msg.content} />
                                                </div>
                                            )}

                                            {msg.type === 'audio' && (
                                                <div className="mt-1">
                                                    <audio controls src={msg.fileUrl || msg.content} className="h-8 w-60" />
                                                </div>
                                            )}

                                            {msg.type === 'document' && (
                                                <div
                                                    onClick={() => downloadMedia(msg.fileUrl, 'document')}
                                                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 transition-colors w-fit text-xs"
                                                >
                                                    <FileText size={16} className="text-indigo-500" />
                                                    <span className="font-medium text-slate-700 dark:text-slate-200">Shared Document</span>
                                                    <Download size={13} className="text-slate-400" />
                                                </div>
                                            )}

                                            {(msg.text && (msg.type === 'text' || !['image', 'video', 'audio', 'document'].includes(msg.type))) && (
                                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                                    {msg.text || msg.content}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-opacity"
                                            title="Permanently remove message"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                        <Eye size={48} className="opacity-20 mb-3 text-indigo-500" />
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Live Interception Dormant</h4>
                        <p className="text-xs text-slate-400 mt-1">Select an active conversation feed on the left to monitor encrypted traffic in real time.</p>
                    </div>
                )}
            </div>

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

export default ConversationModeration;
