import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { chatService } from "../services/chatService";
import ChatWindow from "../components/ChatWindow";
import { usePresence } from "../contexts/PresenceContext";

const ChatPage = () => {
    const { id } = useParams();
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
                // 1. Try fetching conversation by ID
                const { data: conv } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (conv) {
                    // Fetch participants
                    const { data: parts } = await supabase
                        .from('conversation_participants')
                        .select('user_id, role, users(*)')
                        .eq('conversation_id', conv.id);

                    const otherParticipant = parts?.find(p => p.user_id !== currentUserId)?.users;

                    const formattedChat = {
                        id: conv.id,
                        type: conv.type,
                        name: conv.type === 'direct' ? (otherParticipant?.display_name || 'Direct Chat') : conv.title,
                        displayName: conv.type === 'direct' ? (otherParticipant?.display_name || 'Direct Chat') : conv.title,
                        photoURL: conv.type === 'direct' ? otherParticipant?.avatar_url : conv.avatar_url,
                        participants: parts?.map(p => p.user_id) || [],
                        participantDetails: parts?.map(p => p.users) || [],
                        otherUser: otherParticipant ? {
                            uid: otherParticipant.id,
                            id: otherParticipant.id,
                            displayName: otherParticipant.display_name,
                            photoURL: otherParticipant.avatar_url,
                            aboutStatus: otherParticipant.about_status
                        } : null
                    };

                    if (!isCancelled) {
                        setChat(formattedChat);
                        setLoading(false);
                    }
                    return;
                }

                // 2. If conv not found by ID, maybe 'id' is a target user's UUID for 1-on-1 chat
                const { data: targetUser } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (targetUser) {
                    const directConvId = await chatService.createDirectChat(currentUserId, targetUser.id);
                    if (!isCancelled) {
                        navigate(`/c/${directConvId}`, { replace: true });
                    }
                    return;
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
    }, [id, currentUserId, navigate, updateActiveChat]);

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
