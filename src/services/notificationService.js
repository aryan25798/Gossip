import { supabase } from '../supabase';

export const notificationService = {
    // 1. Get paginated notifications
    getNotificationsPaginated: async (userId, { page = 1, pageSize = 20, unreadOnly = false }) => {
        if (!userId) return { notifications: [], totalCount: 0, unreadCount: 0, page, pageSize, totalPages: 1 };

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', userId);

        if (unreadOnly) {
            query = query.eq('is_read', false);
        }

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) {
            console.error('[notificationService] Paginated fetch error:', error);
            return { notifications: [], totalCount: 0, unreadCount: 0, page, pageSize, totalPages: 1 };
        }

        // Also get unread count
        const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        return {
            notifications: data || [],
            totalCount: count || 0,
            unreadCount: unreadCount || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    // 2. Mark notification as read
    markAsRead: async (notificationId) => {
        return supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
    },

    // 3. Mark all as read
    markAllAsRead: async (userId) => {
        return supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
    },

    // 4. Delete notification
    deleteNotification: async (notificationId) => {
        return supabase.from('notifications').delete().eq('id', notificationId);
    },

    // 5. Bulk delete notifications
    bulkDeleteNotifications: async (ids = []) => {
        if (!ids.length) return;
        return supabase.from('notifications').delete().in('id', ids);
    },

    // 6. Subscribe to real-time notifications
    subscribeToNotifications: (userId, onNewNotification) => {
        if (!userId) return () => {};

        const channel = supabase
            .channel(`user_notifications_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    onNewNotification(payload.new);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
};

export default notificationService;
