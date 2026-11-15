import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { notificationService } from '../services/notificationService';

const NotificationContext = createContext();

export function useNotification() {
    return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
    const { currentUser } = useAuth();
    const userId = currentUser?.uid || currentUser?.id;

    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);

    // Fetch paginated notifications
    const fetchNotifications = useCallback(async (targetPage = 1, targetPageSize = 15) => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await notificationService.getNotificationsPaginated(userId, {
                page: targetPage,
                pageSize: targetPageSize
            });
            setNotifications(res.notifications);
            setTotalCount(res.totalCount);
            setUnreadCount(res.unreadCount);
            setPage(targetPage);
            setPageSize(targetPageSize);
        } catch (err) {
            console.error('[NotificationContext] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Initial fetch & Real-time subscription
    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        fetchNotifications(1, pageSize);

        // Real-time listener for incoming notifications
        const unsubscribe = notificationService.subscribeToNotifications(userId, (newNotif) => {
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
            setTotalCount(prev => prev + 1);
        });

        return () => {
            unsubscribe();
        };
    }, [userId, fetchNotifications, pageSize]);

    // Mark single notification read
    const markAsRead = useCallback(async (id) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('[NotificationContext] markAsRead error:', err);
        }
    }, []);

    // Mark all read
    const markAllAsRead = useCallback(async () => {
        if (!userId) return;
        try {
            await notificationService.markAllAsRead(userId);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('[NotificationContext] markAllAsRead error:', err);
        }
    }, [userId]);

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        totalCount,
        page,
        pageSize,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        requestPermission: async () => {
            if ('Notification' in window) {
                return Notification.requestPermission();
            }
            return 'denied';
        }
    }), [notifications, unreadCount, totalCount, page, pageSize, loading, fetchNotifications, markAsRead, markAllAsRead]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
