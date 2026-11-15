import { supabase } from "../supabase";
import { v4 as uuidv4 } from "uuid";
import { uploadManager } from "./uploadManager";

export const chatService = {
    // 1. Subscribe to real-time messages for a conversation
    subscribeToMessages: (chatId, currentUserId, callback) => {
        if (!chatId) return () => {};

        let messagesList = [];
        let isCancelled = false;
        let isConnected = false;
        let disconnectPollInterval = null;

        // Efficient delta/full sync
        const syncMessages = async () => {
            if (isCancelled) return;
            try {
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', chatId)
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (isCancelled || error || !data) return;

                const fetched = data
                    .map(r => formatMessage(r, currentUserId))
                    .filter(m => !m.isDeletedForMe);

                const hasChanges = fetched.length !== messagesList.length ||
                    fetched.some((msg, idx) => msg.id !== messagesList[idx]?.id || msg.status !== messagesList[idx]?.status);

                if (hasChanges) {
                    messagesList = fetched;
                    callback(messagesList);
                }

                // Auto-mark unread messages
                if (fetched.some(m => m.senderId !== currentUserId && m.status !== 'read')) {
                    chatService.markMessagesAsRead(chatId, currentUserId);
                }
            } catch (err) {
                console.warn("[chatService] syncMessages failed:", err);
            }
        };

        const startDisconnectPolling = () => {
            if (disconnectPollInterval || isCancelled) return;
            // Poll every 5s ONLY when WebSocket is disconnected
            disconnectPollInterval = setInterval(() => {
                if (!isConnected && !isCancelled) {
                    syncMessages();
                }
            }, 5000);
        };

        const stopDisconnectPolling = () => {
            if (disconnectPollInterval) {
                clearInterval(disconnectPollInterval);
                disconnectPollInterval = null;
            }
        };

        // Event-driven sync on tab focus and network reconnection
        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isCancelled) {
                syncMessages();
            }
        };

        const handleOnline = () => {
            if (!isCancelled) {
                syncMessages();
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('online', handleOnline);
        }

        // Initial fetch
        syncMessages();

        // Supabase Realtime channel for instant sub-50ms message delivery
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
                    if (!newMsg || newMsg.isDeletedForMe) return;

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
                    if (!updated) return;
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
            .on(
                'broadcast',
                { event: 'new_message' },
                ({ payload }) => {
                    const newMsg = formatMessage(payload, currentUserId);
                    if (!newMsg || newMsg.isDeletedForMe) return;

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
                'broadcast',
                { event: 'message_deleted' },
                ({ payload }) => {
                    if (!payload?.id) return;
                    messagesList = messagesList.filter(m => m.id !== payload.id && m.clientMessageId !== payload.id);
                    callback(messagesList);
                }
            )
            .on(
                'broadcast',
                { event: 'reaction_updated' },
                ({ payload }) => {
                    if (!payload?.messageId) return;
                    messagesList = messagesList.map(m => {
                        if (m.id === payload.messageId || m.clientMessageId === payload.messageId) {
                            return { ...m, reactions: payload.reactions };
                        }
                        return m;
                    });
                    callback(messagesList);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    isConnected = true;
                    stopDisconnectPolling();
                    // Catch-up delta sync upon connection
                    syncMessages();
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    isConnected = false;
                    startDisconnectPolling();
                }
            });

        return () => {
            isCancelled = true;
            stopDisconnectPolling();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', handleOnline);
            }
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

        const formatted = formatMessage(data, senderId);

        // Instant Realtime Broadcast if channel is joined
        try {
            const broadcastChan = supabase.channel(`chat_${chatId}`);
            if (broadcastChan.state === 'joined') {
                broadcastChan.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: formatted
                }).catch(() => {});
            }
        } catch (e) {
            // Realtime postgres_changes delivers the message reliably
        }

        return formatted;
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

        const formatted = formatMessage(data, senderId);

        // Instant Realtime Broadcast to receiver's active chat channel
        try {
            const broadcastChan = supabase.channel(`chat_${chatId}`);
            broadcastChan.send({
                type: 'broadcast',
                event: 'new_message',
                payload: formatted
            }).catch(() => {});
        } catch (e) {
            console.debug('[chatService] broadcast media error:', e);
        }

        return formatted;
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
        const payload = {
            type: 'broadcast',
            event: 'typing',
            payload: { userId, isTyping }
        };
        if (typeof channel.httpSend === 'function') {
            channel.httpSend(payload).catch(() => {});
        } else {
            channel.send(payload).catch(() => {});
        }
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

            // WhatsApp behavior: In direct chats, only show conversations that have actual messages exchanged
            const hasMessages = Boolean(conv.last_message_text || conv.last_message_at);
            if (conv.type === 'direct' && !hasMessages) {
                continue;
            }

            // Fetch other participants details
            const { data: members } = await supabase
                .from('conversation_participants')
                .select('user_id, users(id, display_name, avatar_url, about_status, last_seen_at)')
                .eq('conversation_id', conv.id);

            const otherUser = members?.find(m => m.user_id !== userId)?.users;
            const participantInfo = {};
            if (members) {
                members.forEach(m => {
                    if (m.users) {
                        participantInfo[m.user_id] = {
                            displayName: m.users.display_name,
                            photoURL: m.users.avatar_url,
                            aboutStatus: m.users.about_status
                        };
                    }
                });
            }

            const isSelf = conv.type === 'direct' && (!otherUser || members?.every(m => m.user_id === userId));
            const selfUser = members?.find(m => m.user_id === userId)?.users;
            const resolvedName = conv.type === 'direct'
                ? (isSelf ? 'You (Message yourself)' : (otherUser?.display_name || 'User'))
                : (conv.title || 'Group');
            const resolvedPhoto = conv.type === 'direct'
                ? (isSelf ? selfUser?.avatar_url : otherUser?.avatar_url)
                : conv.avatar_url;

            chats.push({
                id: conv.id,
                name: resolvedName,
                chatName: resolvedName,
                displayName: resolvedName,
                photoURL: resolvedPhoto,
                lastMessage: conv.last_message_text,
                lastMessageTimestamp: conv.last_message_at,
                unreadCount: p.unread_count || 0,
                isPinned: p.is_pinned || false,
                isMuted: p.is_muted || false,
                type: conv.type,
                participants: members?.map(m => m.user_id) || [],
                participantDetails: members?.map(m => m.users) || [],
                participantInfo
            });
        }

        // Sort: pinned first, then by last message timestamp
        return chats.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastMessageTimestamp || 0) - new Date(a.lastMessageTimestamp || 0);
        });
    },

    // 12. Create Direct Chat (idempotent lookup via PostgreSQL atomic RPC)
    createDirectChat: async (currentUserId, targetUserId) => {
        if (!currentUserId || !targetUserId) return null;

        try {
            const { data, error } = await supabase.rpc('get_or_create_direct_chat', {
                p_user_1: currentUserId,
                p_user_2: targetUserId
            });
            if (!error && data) {
                return data;
            }
            if (error) {
                console.warn('[chatService] RPC get_or_create_direct_chat error:', error);
            }
        } catch (rpcErr) {
            console.warn('[chatService] RPC invocation failed, fallback to client query:', rpcErr);
        }

        // Fallback for direct chat between distinct users
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

        const allUserIds = Array.from(new Set([currentUserId, targetUserId].filter(Boolean)));
        const { error: pErr } = await supabase.from('conversation_participants').insert(
            allUserIds.map(uid => ({ conversation_id: conv.id, user_id: uid, role: 'member' }))
        );
        if (pErr) throw pErr;

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
    if (row.isFormatted) return row;

    const isDeletedForMe = currentUserId && Array.isArray(row.deleted_for || row.deletedFor) && (row.deleted_for || row.deletedFor).includes(currentUserId);
    const mime = row.media_metadata?.mimeType || row.fileType || '';
    const msgType = row.message_type || row.type || 'text';
    const isImage = msgType === 'image' || mime.startsWith('image/');
    const isVideo = msgType === 'video' || mime.startsWith('video/');
    const isAudio = msgType === 'audio' || mime.startsWith('audio/');
    const media = row.media_url || row.mediaUrl || row.fileUrl;
    const textContent = row.content !== undefined ? row.content : (row.text !== undefined ? row.text : '');

    return {
        id: row.id,
        clientMessageId: row.client_message_id || row.clientMessageId,
        conversationId: row.conversation_id || row.conversationId,
        senderId: row.sender_id || row.senderId,
        senderName: row.sender_name || row.senderName || 'User',
        text: textContent,
        content: textContent,
        type: msgType,
        mediaUrl: media,
        fileUrl: media,
        imageUrl: isImage ? media : null,
        videoUrl: isVideo ? media : null,
        audioUrl: isAudio ? media : null,
        fileName: row.media_metadata?.fileName || row.fileName || (media ? media.split('/').pop() : 'Attachment'),
        fileSize: row.media_metadata?.fileSize || row.fileSize || null,
        fileType: row.media_metadata?.mimeType || row.fileType || null,
        width: row.media_metadata?.width || row.width || null,
        height: row.media_metadata?.height || row.height || null,
        mediaMetadata: row.media_metadata || row.mediaMetadata,
        status: row.status || 'sent',
        replyTo: row.reply_to || row.replyTo || null,
        reactions: row.reactions || {},
        isSoftDeleted: !!(row.is_deleted || row.isSoftDeleted),
        deletedFor: row.deleted_for || row.deletedFor || [],
        isDeletedForMe,
        isEdited: !!(row.is_edited || row.isEdited),
        editedAt: row.edited_at || row.editedAt,
        timestamp: row.created_at || row.timestamp || new Date().toISOString(),
        isFormatted: true
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
