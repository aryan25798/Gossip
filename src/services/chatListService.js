import { supabase } from "../supabase";
import { chatService } from "./chatService";

export const subscribeToUserChats = (userId, callback, limitCount = 30) => {
    if (!userId) return () => {};

    let isSubscribed = true;

    const loadChats = async () => {
        try {
            const chats = await chatService.getUserChats(userId);
            if (isSubscribed) {
                callback(chats);
            }
        } catch (err) {
            console.error("[chatListService] Error loading chats:", err);
        }
    };

    // Initial load
    loadChats();

    // Realtime channel on conversation_participants & conversations
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
        .subscribe();

    return () => {
        isSubscribed = false;
        supabase.removeChannel(channel);
    };
};

export const createPrivateChat = async (currentUser, otherUser) => {
    const currentUserId = currentUser.uid || currentUser.id;
    const targetUserId = otherUser.uid || otherUser.id;
    return await chatService.createDirectChat(currentUserId, targetUserId);
};
