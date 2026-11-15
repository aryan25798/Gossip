import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { chatService } from "../services/chatService";
import ChatWindow from "../components/ChatWindow";
import { usePresence } from "../contexts/PresenceContext";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ChatPage = () => {
    const { id } = useParams();
    const location = useLocation();
    const { currentUser } = useAuth();
    const currentUserId = currentUser?.uid || currentUser?.id;
    const { updateActiveChat } = usePresence();
    const [chat, setChat] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!id || !currentUserId) return;

        let isCancelled = false;
        if (updateActiveChat) updateActiveChat(id);

        const loadChat = async () => {
            setLoading(true);
            try {
                // Case 1: Composite ID (e.g. user1_user2 from search or legacy links)
                if (id.includes('_')) {
                    const parts = id.split('_');
                    const targetUserId = parts.find(p => p !== currentUserId && UUID_REGEX.test(p)) || parts.find(p => UUID_REGEX.test(p));
                    if (targetUserId) {
                        try {
                            const directConvId = await chatService.createDirectChat(currentUserId, targetUserId);
                            if (!isCancelled && directConvId) {
                                navigate(`/c/${directConvId}`, { replace: true });
                                return;
                            }
                        } catch (createErr) {
                            console.error("[ChatPage] Error creating direct chat from composite ID:", createErr);
                        }
                    }
                }

                // Case 2: Standard UUID
                if (UUID_REGEX.test(id)) {
                    // Try fetching conversation by ID
                    const { data: conv, error: convErr } = await supabase
                        .from('conversations')
                        .select('*')
                        .eq('id', id)
                        .maybeSingle();

                    if (conv && !convErr) {
                        // Fetch participants
                        const { data: parts } = await supabase
                            .from('conversation_participants')
                            .select('user_id, role, users(*)')
                            .eq('conversation_id', conv.id);

                        let otherParticipant = parts?.find(p => p.user_id !== currentUserId)?.users;
                        const selfParticipant = parts?.find(p => p.user_id === currentUserId)?.users;
                        const isSelf = conv.type === 'direct' && (!otherParticipant || parts?.every(p => p.user_id === currentUserId));

                        // Hardening: If direct chat and joined users is null, fetch directly from users table
                        if (conv.type === 'direct' && !isSelf && !otherParticipant) {
                            const otherPartUserId = parts?.find(p => p.user_id !== currentUserId)?.user_id;
                            if (otherPartUserId) {
                                const { data: uData } = await supabase.from('users').select('*').eq('id', otherPartUserId).maybeSingle();
                                if (uData) otherParticipant = uData;
                            }
                        }

                        const participantInfo = {};
                        if (parts) {
                            parts.forEach(p => {
                                if (p.users) {
                                    participantInfo[p.user_id] = {
                                        displayName: p.users.display_name,
                                        photoURL: p.users.avatar_url,
                                        about: p.users.about_status,
                                        email: p.users.email
                                    };
                                }
                            });
                        }

                        const resolvedName = conv.type === 'direct'
                            ? (isSelf ? 'You (Message yourself)' : (otherParticipant?.display_name || 'Direct Chat'))
                            : (conv.title || 'Group Chat');
                        const resolvedPhoto = conv.type === 'direct'
                            ? (isSelf ? selfParticipant?.avatar_url : otherParticipant?.avatar_url)
                            : conv.avatar_url;

                        const formattedChat = {
                            id: conv.id,
                            type: conv.type,
                            name: resolvedName,
                            displayName: resolvedName,
                            photoURL: resolvedPhoto,
                            participants: parts?.map(p => p.user_id) || [],
                            participantDetails: parts?.map(p => p.users).filter(Boolean) || [],
                            participantInfo,
                            otherUser: isSelf ? {
                                uid: currentUserId,
                                id: currentUserId,
                                displayName: 'You (Message yourself)',
                                photoURL: selfParticipant?.avatar_url,
                                aboutStatus: selfParticipant?.about_status
                            } : (otherParticipant ? {
                                uid: otherParticipant.id,
                                id: otherParticipant.id,
                                displayName: otherParticipant.display_name,
                                photoURL: otherParticipant.avatar_url,
                                aboutStatus: otherParticipant.about_status
                            } : null)
                        };

                        if (!isCancelled) {
                            setChat(formattedChat);
                            setLoading(false);
                        }
                        return;
                    }

                    // Not a conversation ID: check if 'id' is a target user's UUID for 1-on-1 chat
                    try {
                        const directConvId = await chatService.createDirectChat(currentUserId, id);
                        if (!isCancelled && directConvId) {
                            if (directConvId !== id) {
                                navigate(`/c/${directConvId}`, { replace: true });
                            }
                            return;
                        }
                    } catch (directErr) {
                        console.warn("[ChatPage] Target UUID is not a conversation nor a direct user:", directErr);
                    }
                }

                // Case 3: Ghost chat or location state fallback
                if (location.state?.chatData?.participants) {
                    const targetUserId = location.state.chatData.participants.find(p => p !== currentUserId && UUID_REGEX.test(p));
                    if (targetUserId) {
                        try {
                            const directConvId = await chatService.createDirectChat(currentUserId, targetUserId);
                            if (!isCancelled && directConvId) {
                                navigate(`/c/${directConvId}`, { replace: true });
                                return;
                            }
                        } catch (stateErr) {
                            console.error("[ChatPage] Error creating chat from state fallback:", stateErr);
                        }
                    }
                }

                // Chat not found
                if (!isCancelled) {
                    setLoading(false);
                }
            } catch (err) {
                console.error("[ChatPage] Error resolving chat:", err);
                if (!isCancelled) setLoading(false);
            }
        };

        loadChat();

        return () => {
            isCancelled = true;
        };
    }, [id, currentUserId, navigate, updateActiveChat, location.state]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!chat) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground p-6 text-center">
                <p className="text-lg font-medium">Conversation not found</p>
                <p className="text-sm mt-1">This chat may have been deleted or does not exist.</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                    Back to chats
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
            <ChatWindow chat={chat} />
        </div>
    );
};

export default ChatPage;
