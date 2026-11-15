import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';

const FriendContext = createContext();

export function useFriend() {
    return useContext(FriendContext);
}

export function FriendProvider({ children }) {
    const { currentUser } = useAuth();
    const currentUserId = currentUser?.uid || currentUser?.id;

    const [friends, setFriends] = useState([]); // array of friend user IDs: string[]
    const [incomingRequests, setIncomingRequests] = useState([]); // array of { id, fromId, fromName, fromPhoto }
    const [outgoingRequests, setOutgoingRequests] = useState([]); // array of target user IDs: string[]
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    const loadContacts = useCallback(async () => {
        if (!currentUserId) {
            setFriends([]);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            return;
        }

        try {
            setLoading(true);

            // Fetch all contacts involving currentUserId
            const { data, error } = await supabase
                .from('contacts')
                .select('id, user_id, contact_user_id, status, created_at')
                .or(`user_id.eq.${currentUserId},contact_user_id.eq.${currentUserId}`);

            if (error) {
                console.error("[FriendContext] Error loading contacts:", error);
                return;
            }

            const acceptedFriendIds = new Set();
            const incoming = [];
            const outgoing = [];

            (data || []).forEach(row => {
                if (row.status === 'accepted') {
                    const friendId = row.user_id === currentUserId ? row.contact_user_id : row.user_id;
                    if (friendId) acceptedFriendIds.add(friendId);
                } else if (row.status === 'pending') {
                    if (row.contact_user_id === currentUserId) {
                        incoming.push({
                            id: row.id,
                            fromId: row.user_id
                        });
                    } else if (row.user_id === currentUserId) {
                        outgoing.push(row.contact_user_id);
                    }
                }
            });

            // Fetch user profile details for incoming requests
            if (incoming.length > 0) {
                const requesterIds = incoming.map(r => r.fromId);
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, display_name, avatar_url, email')
                    .in('id', requesterIds);

                const userMap = new Map((usersData || []).map(u => [u.id, u]));
                const enrichedIncoming = incoming.map(r => {
                    const u = userMap.get(r.fromId);
                    return {
                        id: r.id,
                        fromId: r.fromId,
                        fromName: u?.display_name || u?.email?.split('@')[0] || "Unknown User",
                        fromPhoto: u?.avatar_url || null
                    };
                });
                setIncomingRequests(enrichedIncoming);
            } else {
                setIncomingRequests([]);
            }

            setFriends(Array.from(acceptedFriendIds));
            setOutgoingRequests(outgoing);
        } catch (err) {
            console.error("[FriendContext] Load contacts exception:", err);
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    // Initial load and Realtime listener on contacts table
    useEffect(() => {
        loadContacts();

        if (!currentUserId) return;

        const channel = supabase
            .channel(`contacts_realtime_${currentUserId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contacts'
                },
                () => {
                    loadContacts();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId, loadContacts]);

    const getFriendStatus = useCallback((targetUserId) => {
        if (!targetUserId || !currentUserId) return 'none';
        if (targetUserId === currentUserId) return 'self';
        if (friends.includes(targetUserId)) return 'friend';
        if (outgoingRequests.includes(targetUserId)) return 'sent';
        if (incomingRequests.some(r => r.fromId === targetUserId || r.id === targetUserId)) return 'received';
        return 'none';
    }, [currentUserId, friends, outgoingRequests, incomingRequests]);

    const sendRequest = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
        setActionLoading(targetUserId);
        try {
            const { error } = await supabase.from('contacts').insert({
                user_id: currentUserId,
                contact_user_id: targetUserId,
                status: 'pending'
            });
            if (error) {
                console.error("[FriendContext] sendRequest error:", error);
                throw error;
            }
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] sendRequest failed:", e);
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const acceptRequest = useCallback(async (reqOrId) => {
        if (!currentUserId) return;
        const requestId = typeof reqOrId === 'object' ? reqOrId.id : reqOrId;
        const requesterId = typeof reqOrId === 'object' ? reqOrId.fromId : null;

        setActionLoading(requestId || requesterId);
        try {
            let query = supabase.from('contacts').update({ status: 'accepted' });
            if (requestId) {
                query = query.eq('id', requestId);
            } else if (requesterId) {
                query = query.match({ user_id: requesterId, contact_user_id: currentUserId });
            }
            const { error } = await query;
            if (error) throw error;

            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] acceptRequest failed:", e);
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const rejectRequest = useCallback(async (reqOrId) => {
        if (!currentUserId) return;
        const requestId = typeof reqOrId === 'object' ? reqOrId.id : reqOrId;

        setActionLoading(requestId);
        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .eq('id', requestId);
            if (error) throw error;

            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] rejectRequest failed:", e);
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const cancelRequest = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);
        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .match({ user_id: currentUserId, contact_user_id: targetUserId, status: 'pending' });
            if (error) throw error;
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] cancelRequest failed:", e);
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const unfriend = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);
        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .or(`and(user_id.eq.${currentUserId},contact_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_user_id.eq.${currentUserId})`);
            if (error) throw error;
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] unfriend failed:", e);
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const value = useMemo(() => ({
        friends,
        incomingRequests,
        outgoingRequests,
        loading,
        actionLoading,
        sendRequest,
        cancelRequest,
        acceptRequest,
        rejectRequest,
        unfriend,
        sendFriendRequest: sendRequest,
        cancelFriendRequest: cancelRequest,
        acceptFriendRequest: acceptRequest,
        rejectFriendRequest: rejectRequest,
        removeFriend: unfriend,
        getFriendStatus,
        refreshContacts: loadContacts
    }), [friends, incomingRequests, outgoingRequests, loading, actionLoading, sendRequest, cancelRequest, acceptRequest, rejectRequest, unfriend, getFriendStatus, loadContacts]);

    return (
        <FriendContext.Provider value={value}>
            {children}
        </FriendContext.Provider>
    );
}
