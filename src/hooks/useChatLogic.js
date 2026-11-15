import { useState, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { subscribeToMessages, sendMessage, loadOlderMessages, resetChatUnreadCount, searchMessages } from "../services/chatService";
import { preCacheMedia } from "../utils/mediaCache";

export function useChatLogic(chat, currentUser) {
    const [messages, setMessages] = useState([]);
    const [historyMessages, setHistoryMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [serverResults, setServerResults] = useState([]);
    const [pendingQueue, setPendingQueue] = useState([]);
    const [rtdbStatus, setRtdbStatus] = useState({});
    const [typingUsers, setTypingUsers] = useState({});

    // Reset state when chat changes
    useEffect(() => {
        setMessages([]);
        setHistoryMessages([]);
        setPendingQueue([]);
        setHasMoreMessages(true);
        setLoading(true);
        setServerResults([]);
        setRtdbStatus({});
        setTypingUsers({});

        const userId = currentUser?.uid || currentUser?.id;
        if (chat?.id && userId) {
            resetChatUnreadCount(chat.id, userId);
        }
    }, [chat?.id, currentUser?.uid, currentUser?.id]);

    // 1. Message Subscription via Supabase
    useEffect(() => {
        const userId = currentUser?.uid || currentUser?.id;
        if (!chat?.id || !userId) return;

        setLoading(true);
        let isMounted = true;

        const unsubscribe = subscribeToMessages(chat.id, userId, (newMessages) => {
            if (!isMounted) return;
            setMessages(newMessages);
            setLoading(false);
            setHasMoreMessages(newMessages.length >= 20);
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [chat?.id, currentUser?.uid, currentUser?.id]);

    // 2. Helper Functions
    const handleLoadMore = useCallback(async () => {
        if (loadingHistory || !hasMoreMessages) return;
        const oldestMessage = historyMessages.length > 0 ? historyMessages[0] : messages[0];
        if (!oldestMessage) return;

        setLoadingHistory(true);
        const olderMsgs = await loadOlderMessages(chat.id, oldestMessage.timestamp);
        if (olderMsgs.length < 30) setHasMoreMessages(false);
        if (olderMsgs.length > 0) setHistoryMessages(prev => [...olderMsgs, ...prev]);
        setLoadingHistory(false);
    }, [chat?.id, historyMessages, messages, loadingHistory, hasMoreMessages]);

    const handleSendMessage = useCallback(async (text, replyContext, metadata) => {
        const userId = currentUser?.uid || currentUser?.id;
        const messageId = uuidv4();
        const optimisticMsg = {
            id: messageId,
            clientMessageId: messageId,
            text: text,
            senderId: userId,
            senderName: currentUser.displayName || currentUser.email,
            timestamp: new Date().toISOString(),
            status: 'pending',
            type: 'text',
            replyTo: replyContext,
            isOptimistic: true
        };

        setPendingQueue(prev => [...prev, optimisticMsg]);

        try {
            await sendMessage(chat.id, currentUser, text, replyContext, messageId, metadata);
        } catch (err) {
            console.error("Send failed:", err);
            setPendingQueue(prev => prev.filter(m => m.id !== messageId));
            throw err;
        }
    }, [chat?.id, currentUser]);

    // 3. Time/Ordering Utils
    const getMillis = (t) => {
        if (!t) return 0;
        if (typeof t.toMillis === 'function') return t.toMillis();
        if (t instanceof Date) return t.getTime();
        if (typeof t === 'string') return new Date(t).getTime();
        if (t.seconds) return t.seconds * 1000;
        return Number(t) || 0;
    };

    // 4. Memoization Logic
    const sortedMessages = useMemo(() => {
        const uniqueMap = new Map();
        const userId = currentUser?.uid || currentUser?.id;

        const process = (m) => {
            if (!m) return;
            uniqueMap.set(m.id || m.clientMessageId, m);
        };

        if (serverResults?.length > 0) serverResults.forEach(process);
        historyMessages.forEach(process);
        messages.forEach(process);
        pendingQueue.forEach(process);

        return Array.from(uniqueMap.values()).sort((a, b) => {
            const tA = getMillis(a.timestamp);
            const tB = getMillis(b.timestamp);
            return tA !== tB ? tA - tB : (a.id || '').localeCompare(b.id || '');
        });
    }, [messages, historyMessages, serverResults, pendingQueue, currentUser?.uid, currentUser?.id]);

    // 5. Display Logic
    const processMessages = useMemo(() => {
        return sortedMessages.map((msg, i) => {
            const nextMsg = sortedMessages[i + 1];
            const showTail = !nextMsg || nextMsg.senderId !== msg.senderId || nextMsg.type === 'call_log';
            return { ...msg, showTail };
        });
    }, [sortedMessages]);

    // Prune pending queue
    useEffect(() => {
        if (pendingQueue.length === 0) return;
        const dbIds = new Set(messages.map(m => m.id || m.clientMessageId));
        setPendingQueue(prev => {
            const stillPending = prev.filter(m => !dbIds.has(m.id));
            return stillPending.length !== prev.length ? stillPending : prev;
        });
    }, [messages, pendingQueue.length]);

    // Media Pre-cache
    useEffect(() => {
        if (messages.length > 0) {
            const mediaUrls = messages
                .map(m => m.mediaUrl || m.fileUrl || m.imageUrl || m.videoUrl)
                .filter(url => !!url);
            if (mediaUrls.length > 0) preCacheMedia(mediaUrls);
        }
    }, [messages]);

    return {
        messages: processMessages,
        loading,
        loadingHistory,
        hasMoreMessages,
        rtdbStatus,
        typingUsers,
        handleLoadMore,
        handleSendMessage,
        setServerResults,
        setPendingQueue,
        pendingQueue,
        signalMessages: []
    };
}
