import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { chatService } from '../services/chatService';

const ChatContext = createContext();

export function useChat() {
    return useContext(ChatContext);
}

export function ChatProvider({ children }) {
    const { currentUser } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    const refreshChats = useCallback(async () => {
        if (!currentUser?.id) return;
        try {
            const list = await chatService.getUserChats(currentUser.id);
            setChats(list);
        } catch (err) {
            console.error('[ChatContext] Failed to load chats:', err);
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser?.id) {
            setChats([]);
            setLoading(false);
            return;
        }

        refreshChats();
    }, [currentUser, refreshChats]);

    const value = useMemo(() => ({
        chats,
        loading,
        refreshChats,
        createDirectChat: (targetId) => chatService.createDirectChat(currentUser.id, targetId),
        createGroupChat: (title, memberIds) => chatService.createGroupChat(title, memberIds, currentUser.id),
        deleteChat: async () => {},
        hideChat: async () => {},
        clearHistory: async () => {}
    }), [chats, loading, refreshChats, currentUser]);

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}
