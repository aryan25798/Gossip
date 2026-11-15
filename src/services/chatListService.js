import { supabase } from "../supabase";
import { chatService } from "./chatService";

export const subscribeToUserChats = (userId, callback, limitCount = 30) => {
    if (!userId) return () => {};

    let isSubscribed = true;
    let isConnected = false;
    let disconnectPollInterval = null;

    const loadChats = async () => {
        if (!isSubscribed) return;
        try {
            const chats = await chatService.getUserChats(userId);
            if (isSubscribed) {
                callback(chats);
            }
        } catch (err) {
            console.error("[chatListService] Error loading chats:", err);
        }
    };

    const startDisconnectPolling = () => {
        if (disconnectPollInterval || !isSubscribed) return;
        disconnectPollInterval = setInterval(() => {
            if (!isConnected && isSubscribed) {
                loadChats();
            }
        }, 6000);
    };

    const stopDisconnectPolling = () => {
        if (disconnectPollInterval) {
            clearInterval(disconnectPollInterval);
            disconnectPollInterval = null;
        }
    };

    const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isSubscribed) {
            loadChats();
        }
    };

    const handleOnline = () => {
        if (isSubscribed) {
            loadChats();
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
    }

    // Initial load
    loadChats();

    // Realtime channel on conversation_participants, conversations, and messages
    const channel = supabase
        .channel(`user_chats_${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'conversation_participants',
                filter: `user_id=eq.${userId}`
            },
            () => {
                loadChats();
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversations'
            },
            () => {
                loadChats();
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            },
            () => {
                loadChats();
            }
        )
        .on(
            'broadcast',
            { event: 'chat_updated' },
            () => {
                loadChats();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                isConnected = true;
                stopDisconnectPolling();
                loadChats();
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                isConnected = false;
                startDisconnectPolling();
            }
        });

    return () => {
        isSubscribed = false;
        stopDisconnectPolling();
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', handleOnline);
        }
        supabase.removeChannel(channel);
    };
};

export const createPrivateChat = async (currentUser, otherUser) => {
    const currentUserId = currentUser.uid || currentUser.id;
    const targetUserId = otherUser.uid || otherUser.id;
    return await chatService.createDirectChat(currentUserId, targetUserId);
};
