import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { chatService } from '../services/chatService';
import { subscribeToUserChats } from '../services/chatListService';

const ChatContext = createContext();

export function useChat() {
    return useContext(ChatContext);
}

export function ChatProvider({ children }) {
    const { currentUser } = useAuth();
    const currentUserId = currentUser?.uid || currentUser?.id;
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    const refreshChats = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const list = await chatService.getUserChats(currentUserId);
            setChats(list);
        } catch (err) {
            console.error('[ChatContext] Failed to load chats:', err);
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) {
            setChats([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        // Subscribe to real-time chat list updates
        const unsubscribe = subscribeToUserChats(currentUserId, (updatedChats) => {
            setChats(updatedChats);
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [currentUserId]);

    const value = useMemo(() => ({
        chats,
        loading,
        refreshChats,
        createDirectChat: (targetId) => chatService.createDirectChat(currentUserId, targetId),
        createGroupChat: (title, memberIds) => chatService.createGroupChat(title, memberIds, currentUserId),
        deleteChat: async () => {},
        hideChat: async () => {},
        clearHistory: async () => {}
    }), [chats, loading, refreshChats, currentUserId]);

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}
