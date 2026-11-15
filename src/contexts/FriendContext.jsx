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
    const [blockedUsers, setBlockedUsers] = useState([]); // array of blocked target user IDs: string[]
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    const loadContacts = useCallback(async () => {
        if (!currentUserId) {
            setFriends([]);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            setBlockedUsers([]);
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
            const blocked = [];

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
                } else if (row.status === 'blocked' && row.user_id === currentUserId) {
                    blocked.push(row.contact_user_id);
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
            setBlockedUsers(blocked);
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
        if (blockedUsers.includes(targetUserId)) return 'blocked';
        if (friends.includes(targetUserId)) return 'friend';
        if (outgoingRequests.includes(targetUserId)) return 'sent';
        if (incomingRequests.some(r => r.fromId === targetUserId || r.id === targetUserId)) return 'received';
        return 'none';
    }, [currentUserId, blockedUsers, friends, outgoingRequests, incomingRequests]);

    const sendRequest = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
        setActionLoading(targetUserId);

        // Optimistic outgoing update
        setOutgoingRequests(prev => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);

        try {
            // First check if a relationship already exists
            const { data: existing } = await supabase
                .from('contacts')
                .select('*')
                .or(`and(user_id.eq.${currentUserId},contact_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_user_id.eq.${currentUserId})`);

            if (existing && existing.length > 0) {
                const row = existing[0];
                if (row.status === 'accepted') {
                    setFriends(prev => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);
                    setOutgoingRequests(prev => prev.filter(id => id !== targetUserId));
                    return;
                }
                if (row.status === 'pending') {
                    // If target already sent a request to me, automatically accept it!
                    if (row.contact_user_id === currentUserId) {
                        await supabase
                            .from('contacts')
                            .update({ status: 'accepted' })
                            .eq('id', row.id);
                        await loadContacts();
                        return;
                    }
                    return;
                }
            }

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
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const acceptRequest = useCallback(async (reqOrId) => {
        if (!currentUserId || !reqOrId) return;

        let contactRowId = null;
        let requesterUserId = null;

        if (typeof reqOrId === 'object') {
            contactRowId = reqOrId.id;
            requesterUserId = reqOrId.fromId || reqOrId.userId;
        } else if (typeof reqOrId === 'string') {
            const matchedReq = incomingRequests.find(r => r.id === reqOrId || r.fromId === reqOrId);
            if (matchedReq) {
                contactRowId = matchedReq.id;
                requesterUserId = matchedReq.fromId;
            } else {
                contactRowId = reqOrId;
                requesterUserId = reqOrId;
            }
        }

        const effectiveTarget = requesterUserId || contactRowId;
        setActionLoading(effectiveTarget);

        // Optimistic update: mark as friend and clear from incoming
        if (effectiveTarget) {
            setFriends(prev => prev.includes(effectiveTarget) ? prev : [...prev, effectiveTarget]);
            setIncomingRequests(prev => prev.filter(r => r.id !== contactRowId && r.fromId !== requesterUserId));
        }

        try {
            let updated = false;

            // 1. Try updating by row ID where contact_user_id = currentUserId
            if (contactRowId) {
                const { data, error } = await supabase
                    .from('contacts')
                    .update({ status: 'accepted' })
                    .match({ id: contactRowId, contact_user_id: currentUserId })
                    .select();

                if (!error && data && data.length > 0) {
                    updated = true;
                }
            }

            // 2. Fallback: update by requester user ID where contact_user_id = currentUserId
            if (!updated && requesterUserId) {
                const { error } = await supabase
                    .from('contacts')
                    .update({ status: 'accepted' })
                    .match({ user_id: requesterUserId, contact_user_id: currentUserId, status: 'pending' });

                if (error) throw error;
            }

            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] acceptRequest failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, incomingRequests, loadContacts]);

    const rejectRequest = useCallback(async (reqOrId) => {
        if (!currentUserId || !reqOrId) return;

        let contactRowId = null;
        let requesterUserId = null;

        if (typeof reqOrId === 'object') {
            contactRowId = reqOrId.id;
            requesterUserId = reqOrId.fromId || reqOrId.userId;
        } else if (typeof reqOrId === 'string') {
            const matchedReq = incomingRequests.find(r => r.id === reqOrId || r.fromId === reqOrId);
            if (matchedReq) {
                contactRowId = matchedReq.id;
                requesterUserId = matchedReq.fromId;
            } else {
                contactRowId = reqOrId;
                requesterUserId = reqOrId;
            }
        }

        const effectiveTarget = requesterUserId || contactRowId;
        setActionLoading(effectiveTarget);

        // Optimistic update: remove from incoming
        setIncomingRequests(prev => prev.filter(r => r.id !== contactRowId && r.fromId !== requesterUserId));

        try {
            let deleted = false;

            // 1. Try deleting by row ID
            if (contactRowId) {
                const { data, error } = await supabase
                    .from('contacts')
                    .delete()
                    .match({ id: contactRowId, contact_user_id: currentUserId })
                    .select();

                if (!error && data && data.length > 0) {
                    deleted = true;
                }
            }

            // 2. Fallback: delete by requester user ID
            if (!deleted && requesterUserId) {
                const { error } = await supabase
                    .from('contacts')
                    .delete()
                    .match({ user_id: requesterUserId, contact_user_id: currentUserId, status: 'pending' });

                if (error) throw error;
            }

            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] rejectRequest failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, incomingRequests, loadContacts]);

    const cancelRequest = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);

        // Optimistic update
        setOutgoingRequests(prev => prev.filter(id => id !== targetUserId));

        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .match({ user_id: currentUserId, contact_user_id: targetUserId, status: 'pending' });
            if (error) throw error;
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] cancelRequest failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const unfriend = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);

        // Optimistic update
        setFriends(prev => prev.filter(id => id !== targetUserId));

        try {
            // Delete either direction (currentUserId -> targetUserId OR targetUserId -> currentUserId)
            await supabase
                .from('contacts')
                .delete()
                .match({ user_id: currentUserId, contact_user_id: targetUserId });

            await supabase
                .from('contacts')
                .delete()
                .match({ user_id: targetUserId, contact_user_id: currentUserId });

            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] unfriend failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const blockUser = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);

        // Optimistic update: remove from friends and add to blocked
        setFriends(prev => prev.filter(id => id !== targetUserId));
        setBlockedUsers(prev => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);

        try {
            // Remove any friendship/pending row
            await supabase
                .from('contacts')
                .delete()
                .or(`and(user_id.eq.${currentUserId},contact_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_user_id.eq.${currentUserId})`);

            // Insert blocked record
            const { error } = await supabase
                .from('contacts')
                .upsert({
                    user_id: currentUserId,
                    contact_user_id: targetUserId,
                    status: 'blocked'
                }, { onConflict: 'user_id,contact_user_id' });

            if (error) throw error;
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] blockUser failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const unblockUser = useCallback(async (targetUserId) => {
        if (!currentUserId || !targetUserId) return;
        setActionLoading(targetUserId);

        // Optimistic update
        setBlockedUsers(prev => prev.filter(id => id !== targetUserId));

        try {
            const { error } = await supabase
                .from('contacts')
                .delete()
                .match({
                    user_id: currentUserId,
                    contact_user_id: targetUserId,
                    status: 'blocked'
                });

            if (error) throw error;
            await loadContacts();
        } catch (e) {
            console.error("[FriendContext] unblockUser failed:", e);
            await loadContacts();
            throw e;
        } finally {
            setActionLoading(null);
        }
    }, [currentUserId, loadContacts]);

    const value = useMemo(() => ({
        friends,
        incomingRequests,
        outgoingRequests,
        blockedUsers,
        loading,
        actionLoading,
        sendRequest,
        cancelRequest,
        acceptRequest,
        rejectRequest,
        unfriend,
        blockUser,
        unblockUser,
        sendFriendRequest: sendRequest,
        cancelFriendRequest: cancelRequest,
        acceptFriendRequest: acceptRequest,
        rejectFriendRequest: rejectRequest,
        removeFriend: unfriend,
        getFriendStatus,
        refreshContacts: loadContacts
    }), [
        friends,
        incomingRequests,
        outgoingRequests,
        blockedUsers,
        loading,
        actionLoading,
        sendRequest,
        cancelRequest,
        acceptRequest,
        rejectRequest,
        unfriend,
        blockUser,
        unblockUser,
        getFriendStatus,
        loadContacts
    ]);

    return (
        <FriendContext.Provider value={value}>
            {children}
        </FriendContext.Provider>
    );
}
