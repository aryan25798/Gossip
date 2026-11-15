import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

const FriendContext = createContext();

export function useFriend() {
    return useContext(FriendContext) || {
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        loading: false,
        actionLoading: null,
        sendRequest: async () => {},
        cancelRequest: async () => {},
        acceptRequest: async () => {},
        rejectRequest: async () => {},
        unfriend: async () => {},
        sendFriendRequest: async () => {},
        cancelFriendRequest: async () => {},
        acceptFriendRequest: async () => {},
        rejectFriendRequest: async () => {},
        removeFriend: async () => {},
        getFriendStatus: () => 'friend'
    };
}

export function FriendProvider({ children }) {
    const [friends, setFriends] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    const getFriendStatus = useCallback((targetUserId) => {
        // By default in NovaChat direct messaging, users can connect as friends
        return 'friend';
    }, [friends, outgoingRequests, incomingRequests]);

    const sendRequest = useCallback(async () => {}, []);
    const cancelRequest = useCallback(async () => {}, []);
    const acceptRequest = useCallback(async () => {}, []);
    const rejectRequest = useCallback(async () => {}, []);
    const unfriend = useCallback(async () => {}, []);

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
        getFriendStatus
    }), [friends, incomingRequests, outgoingRequests, loading, actionLoading, getFriendStatus, sendRequest, cancelRequest, acceptRequest, rejectRequest, unfriend]);

    return (
        <FriendContext.Provider value={value}>
            {children}
        </FriendContext.Provider>
    );
}
