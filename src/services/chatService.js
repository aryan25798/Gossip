import { supabase } from "../supabase";
import { v4 as uuidv4 } from "uuid";
import { uploadManager } from "./uploadManager";

export const chatService = {
    // 1. Subscribe to real-time messages for a conversation
    subscribeToMessages: (chatId, currentUserId, callback) => {
        if (!chatId) return () => {};

        let messagesList = [];

        // Fetch initial history (most recent 50 messages)
        supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', chatId)
            .order('created_at', { ascending: true })
            .limit(50)
            .then(({ data, error }) => {
                if (data && !error) {
                    messagesList = data
                        .map(r => formatMessage(r, currentUserId))
                        .filter(m => !m.isDeletedForMe);
                    callback(messagesList);

                    // Mark unread messages as read
                    chatService.markMessagesAsRead(chatId, currentUserId);
                }
            });

        // Supabase Realtime channel for instant messages and updates
        const channel = supabase
            .channel(`chat_${chatId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${chatId}`
                },
                (payload) => {
                    const newMsg = formatMessage(payload.new, currentUserId);
                    if (newMsg.isDeletedForMe) return;

                    // If received from someone else while chat is open, mark as read
                    if (newMsg.senderId !== currentUserId) {
                        chatService.markMessagesAsRead(chatId, currentUserId);
                    }

                    if (!messagesList.some(m => m.id === newMsg.id || (m.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
                        messagesList = [...messagesList, newMsg];
                        callback(messagesList);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${chatId}`
                },
                (payload) => {
                    const updated = formatMessage(payload.new, currentUserId);
                    if (updated.isDeletedForMe) {
                        messagesList = messagesList.filter(m => m.id !== updated.id);
                    } else {
                        messagesList = messagesList.map(m => (m.id === updated.id || (m.clientMessageId && m.clientMessageId === updated.clientMessageId)) ? updated : m);
                    }
                    callback(messagesList);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${chatId}`
                },
                (payload) => {
                    messagesList = messagesList.filter(m => m.id !== payload.old.id);
                    callback(messagesList);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    // 2. Send text message with idempotency key and reply context
    sendMessage: async (chatId, arg2, arg3, replyTo = null, clientMessageId = null, metadata = {}) => {
        if (!chatId) return null;
        const text = typeof arg2 === 'string' ? arg2 : (typeof arg3 === 'string' ? arg3 : '');
        const currentUser = (arg2 && typeof arg2 === 'object') ? arg2 : (arg3 && typeof arg3 === 'object' ? arg3 : {});
        const trimmed = (text || '').trim();
        if (!trimmed) return null;

        const senderId = currentUser.id || currentUser.uid;
        const stableId = clientMessageId || uuidv4();

        // Format reply_to payload if replying
        const replyPayload = replyTo ? {
            id: replyTo.id,
            senderId: replyTo.senderId,
            senderName: replyTo.senderName || 'User',
            text: replyTo.text || replyTo.content || '[Attachment]',
            type: replyTo.type || 'text'
        } : null;

        const { data, error } = await supabase.from('messages').insert({
            conversation_id: chatId,
            sender_id: senderId,
            client_message_id: stableId,
            content: trimmed,
            message_type: 'text',
            status: 'sent',
            reply_to: replyPayload,
            is_deleted: false,
            reactions: {}
        }).select().maybeSingle();

        if (error) {
            console.error('[chatService] Send message error:', error);
            throw error;
        }

        // Update conversation last message timestamp & preview
        await supabase.from('conversations').update({
            last_message_text: trimmed,
            last_message_at: new Date().toISOString()
        }).eq('id', chatId);

        // Increment unread count for other participants
        await chatService.incrementUnreadForOthers(chatId, senderId);

        return formatMessage(data, senderId);
    },

    // 3. Send media message (Supports chunked TUS upload & fallback)
    sendMediaMessage: async (chatId, currentUser, mediaPayload) => {
        if (!chatId) return null;
        const senderId = currentUser.id || currentUser.uid;
        const stableId = uuidv4();

        // If mediaPayload is a raw File, upload it first via uploadManager
        let fileUrl = mediaPayload.url || mediaPayload.publicUrl;
        let fileName = mediaPayload.fileName || mediaPayload.name || 'File';
        let fileSize = mediaPayload.fileSize || mediaPayload.size || 0;
        let mimeType = mediaPayload.fileType || mediaPayload.mimeType || mediaPayload.type || 'application/octet-stream';
        let caption = mediaPayload.caption || '';

        if (mediaPayload instanceof File) {
            const ext = mediaPayload.name.split('.').pop();
            const objectPath = `chat_media/${chatId}/${uuidv4()}.${ext}`;
            const uploadRes = await uploadManager.uploadResumable({
                file: mediaPayload,
                objectPath
            });
            fileUrl = uploadRes.publicUrl;
            fileName = uploadRes.fileName;
            fileSize = uploadRes.size;
            mimeType = uploadRes.mimeType;
        }

        const messageType = mimeType.startsWith('image/') ? 'image'
            : mimeType.startsWith('video/') ? 'video'
            : mimeType.startsWith('audio/') ? 'audio' : 'file';

        const { data, error } = await supabase.from('messages').insert({
            conversation_id: chatId,
            sender_id: senderId,
            client_message_id: stableId,
            content: caption || fileName,
            message_type: messageType,
            media_url: fileUrl,
            media_metadata: {
                fileName,
                fileSize,
                mimeType,
                width: mediaPayload.width || null,
                height: mediaPayload.height || null
            },
            status: 'sent',
            is_deleted: false,
            reactions: {}
        }).select().maybeSingle();

        if (error) {
            console.error('[chatService] sendMediaMessage error:', error);
            throw error;
        }

        await supabase.from('conversations').update({
            last_message_text: caption ? `📷 ${caption}` : `[${messageType.toUpperCase()}] ${fileName}`,
            last_message_at: new Date().toISOString()
        }).eq('id', chatId);

        await chatService.incrementUnreadForOthers(chatId, senderId);

        return formatMessage(data, senderId);
    },

    // 4. Edit message
    editMessage: async (chatId, messageId, newText, currentUserId) => {
        if (!messageId || !newText?.trim()) return false;
        try {
            const { error } = await supabase
                .from('messages')
                .update({
                    content: newText.trim(),
                    is_edited: true,
                    edited_at: new Date().toISOString()
                })
                .match({ id: messageId, sender_id: currentUserId });

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[chatService] Edit message error:', e);
            throw e;
        }
    },

    // 5. Delete message (Delete for me vs Delete for everyone)
    deleteMessage: async (chatId, messageId, mode = 'everyone', currentUserId = null) => {
        try {
            if (mode === 'everyone') {
                // WhatsApp-style soft delete: preserve row but mark deleted
                const { error } = await supabase
                    .from('messages')
                    .update({
                        is_deleted: true,
                        content: 'This message was deleted'
                    })
                    .eq('id', messageId);
                if (error) throw error;
            } else {
                // Delete for me: append current user ID to deleted_for array
                const { data: msg } = await supabase
                    .from('messages')
                    .select('deleted_for')
                    .eq('id', messageId)
                    .maybeSingle();

                const currentDeleted = msg?.deleted_for || [];
                if (currentUserId && !currentDeleted.includes(currentUserId)) {
                    await supabase
                        .from('messages')
                        .update({
                            deleted_for: [...currentDeleted, currentUserId]
                        })
                        .eq('id', messageId);
                }
            }
            return true;
        } catch (e) {
            console.error('[chatService] deleteMessage error:', e);
            throw e;
        }
    },

    // 6. Add or toggle reaction on a message
    addReaction: async (chatId, messageId, emoji, userId) => {
        if (!messageId || !emoji || !userId) return false;
        try {
            const { data: msg, error: fetchErr } = await supabase
                .from('messages')
                .select('reactions')
                .eq('id', messageId)
                .maybeSingle();

            if (fetchErr || !msg) return false;

            const reactions = { ...(msg.reactions || {}) };
            if (reactions[userId] === emoji) {
                // User clicked same emoji -> remove reaction
                delete reactions[userId];
            } else {
                // Set / update reaction
                reactions[userId] = emoji;
            }

            const { error: updateErr } = await supabase
                .from('messages')
                .update({ reactions })
                .eq('id', messageId);

            if (updateErr) throw updateErr;
            return true;
        } catch (e) {
            console.error('[chatService] addReaction error:', e);
            return false;
        }
    },

    // 7. Mark messages as delivered for recipient
    markMessagesAsDelivered: async (chatId, recipientUserId) => {
        if (!chatId || !recipientUserId) return;
        try {
            await supabase
                .from('messages')
                .update({
                    status: 'delivered',
                    delivered_at: new Date().toISOString()
                })
                .eq('conversation_id', chatId)
                .neq('sender_id', recipientUserId)
                .eq('status', 'sent');
        } catch (e) {
            console.debug('[chatService] markMessagesAsDelivered error:', e);
        }
    },

    // 8. Mark messages as read for reader
    markMessagesAsRead: async (chatId, readerUserId) => {
        if (!chatId || !readerUserId) return;
        try {
            // Update messages
            await supabase
                .from('messages')
                .update({
                    status: 'read',
                    read_at: new Date().toISOString()
                })
                .eq('conversation_id', chatId)
                .neq('sender_id', readerUserId)
                .neq('status', 'read');

            // Reset unread count for reader
            await supabase
                .from('conversation_participants')
                .update({ unread_count: 0 })
                .match({ conversation_id: chatId, user_id: readerUserId });
        } catch (e) {
            console.debug('[chatService] markMessagesAsRead error:', e);
        }
    },

    // 9. Increment unread count for other participants
    incrementUnreadForOthers: async (chatId, senderId) => {
        try {
            const { data: members } = await supabase
                .from('conversation_participants')
                .select('id, user_id, unread_count')
                .eq('conversation_id', chatId)
                .neq('user_id', senderId);

            if (members && members.length > 0) {
                for (const m of members) {
                    await supabase
                        .from('conversation_participants')
                        .update({ unread_count: (m.unread_count || 0) + 1 })
                        .eq('id', m.id);
                }
            }
        } catch (e) {
            console.debug('[chatService] incrementUnread error:', e);
        }
    },

    // 10. Typing status via Supabase Realtime Broadcast
    setTypingStatus: (chatId, userId, isTyping) => {
        if (!chatId) return;
        const channel = supabase.channel(`typing_${chatId}`);
        channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, isTyping }
        });
    },

    subscribeToTyping: (chatId, callback) => {
        if (!chatId) return () => {};
        const activeTypers = new Set();
        const channel = supabase
            .channel(`typing_${chatId}`)
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload.isTyping) {
                    activeTypers.add(payload.userId);
                } else {
                    activeTypers.delete(payload.userId);
                }
                callback(Array.from(activeTypers));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    // 11. Fetch user conversations
    getUserChats: async (userId) => {
        if (!userId) return [];
        const { data: participations, error: partErr } = await supabase
            .from('conversation_participants')
            .select('conversation_id, role, unread_count, is_pinned, is_muted, conversations(*)')
            .eq('user_id', userId);

        if (partErr || !participations) return [];

        const chats = [];
        for (const p of participations) {
            const conv = p.conversations;
            if (!conv) continue;

            // Fetch other participants details
            const { data: members } = await supabase
                .from('conversation_participants')
                .select('user_id, users(id, display_name, avatar_url, about_status, last_seen_at)')
                .eq('conversation_id', conv.id);

            const otherUser = members?.find(m => m.user_id !== userId)?.users;

            chats.push({
                id: conv.id,
                name: conv.type === 'direct' ? (otherUser?.display_name || 'Direct Chat') : conv.title,
                chatName: conv.type === 'direct' ? (otherUser?.display_name || 'Direct Chat') : conv.title,
                photoURL: conv.type === 'direct' ? otherUser?.avatar_url : conv.avatar_url,
                lastMessage: conv.last_message_text,
                lastMessageTimestamp: conv.last_message_at,
                unreadCount: p.unread_count || 0,
                isPinned: p.is_pinned || false,
                isMuted: p.is_muted || false,
                type: conv.type,
                participants: members?.map(m => m.user_id) || [],
                participantDetails: members?.map(m => m.users) || []
            });
        }

        // Sort: pinned first, then by last message timestamp
        return chats.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastMessageTimestamp || 0) - new Date(a.lastMessageTimestamp || 0);
        });
    },

    // 12. Create Direct Chat (idempotent lookup)
    createDirectChat: async (currentUserId, targetUserId) => {
        const { data: userChats } = await supabase
            .from('conversation_participants')
            .select('conversation_id, conversations!inner(type)')
            .eq('user_id', currentUserId)
            .eq('conversations.type', 'direct');

        if (userChats && userChats.length > 0) {
            for (const uc of userChats) {
                const { data: match } = await supabase
                    .from('conversation_participants')
                    .select('user_id')
                    .eq('conversation_id', uc.conversation_id)
                    .eq('user_id', targetUserId);
                if (match && match.length > 0) {
                    return uc.conversation_id;
                }
            }
        }

        // Create new direct conversation
        const { data: conv, error: convErr } = await supabase
            .from('conversations')
            .insert({ type: 'direct', created_by: currentUserId })
            .select()
            .maybeSingle();

        if (convErr) throw convErr;

        await supabase.from('conversation_participants').insert([
            { conversation_id: conv.id, user_id: currentUserId, role: 'member' },
            { conversation_id: conv.id, user_id: targetUserId, role: 'member' }
        ]);

        return conv.id;
    },

    // 13. Create Group Chat
    createGroupChat: async (title, memberIds, currentUserId) => {
        const { data: conv, error: convErr } = await supabase
            .from('conversations')
            .insert({ type: 'group', title, created_by: currentUserId })
            .select()
            .maybeSingle();

        if (convErr) throw convErr;

        const allMemberIds = Array.from(new Set([currentUserId, ...memberIds]));
        const participants = allMemberIds.map(id => ({
            conversation_id: conv.id,
            user_id: id,
            role: id === currentUserId ? 'owner' : 'member'
        }));

        await supabase.from('conversation_participants').insert(participants);
        return conv.id;
    },

    // 14. Reset unread count
    resetChatUnreadCount: async (chatId, userId) => {
        try {
            await supabase
                .from('conversation_participants')
                .update({ unread_count: 0 })
                .match({ conversation_id: chatId, user_id: userId });
        } catch (e) {
            console.error('[chatService] Error resetting unread count:', e);
        }
    },

    // 15. Cursor-based pagination (load older messages)
    loadOlderMessages: async (chatId, oldestTimestamp, limit = 30) => {
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (oldestTimestamp) {
                query = query.lt('created_at', oldestTimestamp);
            }

            const { data, error } = await query;
            if (error || !data) return [];
            return data.reverse().map(r => formatMessage(r));
        } catch (e) {
            console.error('[chatService] Error loading older messages:', e);
            return [];
        }
    },

    fetchMessagesCursor: async (chatId, { before = null, limit = 30 } = {}) => {
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', chatId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (before) {
                query = query.lt('created_at', before);
            }

            const { data, error } = await query;
            if (error || !data) return { messages: [], nextCursor: null, hasMore: false };

            const hasMore = data.length === limit;
            const nextCursor = data.length > 0 ? data[data.length - 1].created_at : null;
            const messages = data.reverse().map(r => formatMessage(r));

            return { messages, nextCursor, hasMore };
        } catch (e) {
            console.error('[chatService] Error in fetchMessagesCursor:', e);
            return { messages: [], nextCursor: null, hasMore: false };
        }
    },

    // 16. Search messages
    searchMessages: async (chatId, term) => {
        if (!term?.trim()) return [];
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', chatId)
                .ilike('content', `%${term.trim()}%`)
                .order('created_at', { ascending: true })
                .limit(30);

            if (error || !data) return [];
            return data.map(r => formatMessage(r));
        } catch (e) {
            console.error('[chatService] Error searching messages:', e);
            return [];
        }
    },

    // 17. Pin / Mute Conversation
    togglePinChat: async (chatId, userId, isPinned) => {
        try {
            await supabase
                .from('conversation_participants')
                .update({ is_pinned: !isPinned })
                .match({ conversation_id: chatId, user_id: userId });
            return !isPinned;
        } catch (e) {
            console.error('[chatService] togglePinChat error:', e);
            return isPinned;
        }
    },

    toggleMuteChat: async (chatId, userId, isMuted) => {
        try {
            await supabase
                .from('conversation_participants')
                .update({ is_muted: !isMuted })
                .match({ conversation_id: chatId, user_id: userId });
            return !isMuted;
        } catch (e) {
            console.error('[chatService] toggleMuteChat error:', e);
            return isMuted;
        }
    },

    clearChat: async (chatId) => {
        try {
            await supabase.from('messages').delete().eq('conversation_id', chatId);
        } catch (e) {
            console.error('[chatService] clearChat error:', e);
        }
    },

    hideChat: async (chatId, userId) => {
        try {
            await supabase
                .from('conversation_participants')
                .update({ is_archived: true })
                .match({ conversation_id: chatId, user_id: userId });
            return true;
        } catch (e) {
            console.error('[chatService] hideChat error:', e);
            return false;
        }
    },

    reportMessage: async ({
        reporterId,
        reportedUserId,
        messageId,
        conversationId,
        reason,
        category = 'spam',
        priority = 'normal'
    }) => {
        try {
            const { data, error } = await supabase.from('message_reports').insert({
                reporter_id: reporterId,
                reported_user_id: reportedUserId,
                message_id: messageId,
                conversation_id: conversationId,
                reason,
                category,
                priority,
                status: 'pending'
            }).select().maybeSingle();

            if (error) throw error;
            if (messageId) {
                await supabase.from('messages').update({ status: 'flagged' }).eq('id', messageId);
            }
            return data;
        } catch (e) {
            console.error('[chatService] Error reporting message:', e);
            throw e;
        }
    }
};

export function formatMessage(row, currentUserId = null) {
    if (!row) return null;

    const isDeletedForMe = currentUserId && Array.isArray(row.deleted_for) && row.deleted_for.includes(currentUserId);
    const mime = row.media_metadata?.mimeType || '';
    const isImage = row.message_type === 'image' || mime.startsWith('image/');
    const isVideo = row.message_type === 'video' || mime.startsWith('video/');
    const isAudio = row.message_type === 'audio' || mime.startsWith('audio/');

    return {
        id: row.id,
        clientMessageId: row.client_message_id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: row.sender_name || 'User',
        text: row.content,
        content: row.content,
        type: row.message_type,
        mediaUrl: row.media_url,
        fileUrl: row.media_url,
        imageUrl: isImage ? row.media_url : null,
        videoUrl: isVideo ? row.media_url : null,
        audioUrl: isAudio ? row.media_url : null,
        fileName: row.media_metadata?.fileName || (row.media_url ? row.media_url.split('/').pop() : 'Attachment'),
        fileSize: row.media_metadata?.fileSize || null,
        fileType: row.media_metadata?.mimeType || null,
        width: row.media_metadata?.width || null,
        height: row.media_metadata?.height || null,
        mediaMetadata: row.media_metadata,
        status: row.status || 'sent',
        replyTo: row.reply_to || null,
        reactions: row.reactions || {},
        isSoftDeleted: !!row.is_deleted,
        deletedFor: row.deleted_for || [],
        isDeletedForMe,
        isEdited: !!row.is_edited,
        editedAt: row.edited_at,
        timestamp: row.created_at
    };
}

export const subscribeToMessages = chatService.subscribeToMessages;
export const sendMessage = chatService.sendMessage;
export const sendMediaMessage = chatService.sendMediaMessage;
export const editMessage = chatService.editMessage;
export const setTypingStatus = chatService.setTypingStatus;
export const subscribeToTyping = chatService.subscribeToTyping;
export const createDirectChat = chatService.createDirectChat;
export const createGroupChat = chatService.createGroupChat;
export const getUserChats = chatService.getUserChats;
export const resetChatUnreadCount = chatService.resetChatUnreadCount;
export const loadOlderMessages = chatService.loadOlderMessages;
export const fetchMessagesCursor = chatService.fetchMessagesCursor;
export const reportMessage = chatService.reportMessage;
export const searchMessages = chatService.searchMessages;
export const clearChat = chatService.clearChat;
export const deleteMessage = chatService.deleteMessage;
export const addReaction = chatService.addReaction;
export const hideChat = chatService.hideChat;
export const togglePinChat = chatService.togglePinChat;
export const toggleMuteChat = chatService.toggleMuteChat;
export const markMessagesAsDelivered = chatService.markMessagesAsDelivered;
export const markMessagesAsRead = chatService.markMessagesAsRead;
export const createGeminiChat = async () => null;
