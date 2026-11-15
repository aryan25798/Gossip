import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { useAuth } from "./AuthContext";

export const PresenceContext = createContext();

export function usePresence() {
    return useContext(PresenceContext);
}

export function PresenceProvider({ children }) {
    const { currentUser } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [activeChatId, setActiveChatId] = useState(null);

    const updateActiveChat = useCallback((chatId) => {
        setActiveChatId(chatId || null);
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return;

        // Supabase Realtime Presence Channel
        const room = supabase.channel('online_users', {
            config: {
                presence: {
                    key: currentUser.id
                }
            }
        });

        room
            .on('presence', { event: 'sync' }, () => {
                const newState = room.presenceState();
                const userIds = new Set(Object.keys(newState));
                setOnlineUsers(userIds);
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers(prev => new Set(prev).add(key));
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await room.track({
                        user_id: currentUser.id,
                        online_at: new Date().toISOString()
                    });
                }
            });

        return () => {
            room.untrack();
            supabase.removeChannel(room);
        };
    }, [currentUser]);

    const getUserPresence = useCallback((userId, callback) => {
        if (!userId) return () => {};
        const isUserOnline = onlineUsers.has(userId);
        callback({
            state: isUserOnline ? 'online' : 'offline',
            last_changed: new Date().toISOString()
        });
        return () => {};
    }, [onlineUsers]);

    const value = useMemo(() => ({
        getUserPresence,
        updateActiveChat,
        activeChatId,
        isOnline: true
    }), [getUserPresence, updateActiveChat, activeChatId]);

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
}
