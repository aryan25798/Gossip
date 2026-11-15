import React, { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';

export default function DeliveryStatusListener() {
    const { currentUser } = useAuth();
    const userId = currentUser?.uid || currentUser?.id;
    const convIdsRef = useRef(new Set());

    useEffect(() => {
        if (!userId) return;

        let channel = null;

        const setupDeliveryTracking = async () => {
            try {
                // 1. Fetch user's active conversations
                const { data: parts } = await supabase
                    .from('conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', userId);

                const convIds = (parts || []).map(p => p.conversation_id);
                convIdsRef.current = new Set(convIds);

                if (convIds.length === 0) return;

                // 2. Initial delivery reconciliation: Mark un-delivered incoming messages as delivered
                await supabase
                    .from('messages')
                    .update({
                        status: 'delivered',
                        delivered_at: new Date().toISOString()
                    })
                    .in('conversation_id', convIds)
                    .neq('sender_id', userId)
                    .eq('status', 'sent');

                // 3. Listen to incoming messages in real-time to acknowledge immediate delivery
                channel = supabase
                    .channel(`user_delivery_${userId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'messages'
                        },
                        async (payload) => {
                            const newMsg = payload.new;
                            if (newMsg.sender_id !== userId && convIdsRef.current.has(newMsg.conversation_id)) {
                                if (newMsg.status === 'sent') {
                                    await supabase
                                        .from('messages')
                                        .update({
                                            status: 'delivered',
                                            delivered_at: new Date().toISOString()
                                        })
                                        .eq('id', newMsg.id);
                                }
                            }
                        }
                    )
                    .subscribe();
            } catch (err) {
                console.debug('[DeliveryStatusListener] Setup error:', err);
            }
        };

        setupDeliveryTracking();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [userId]);

    return null;
}
