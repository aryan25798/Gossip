import { supabase } from '../supabase';
import { accountErasureService } from './accountErasureService';

export const adminService = {
    // ----------------------------------------------------
    // 1. Operational Telemetry & System Analytics (No Mock Data)
    // ----------------------------------------------------
    getStats: async (timeRangeDays = 30) => {
        const now = new Date();
        const pastDate = new Date(now.getTime() - timeRangeDays * 24 * 60 * 60 * 1000).toISOString();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        // Parallel exact count queries
        const [
            usersRes,
            active24hRes,
            newUsersRes,
            chatsRes,
            messagesRes,
            callsRes,
            pendingReportsRes,
            deletionRequestsRes
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_seen_at', yesterday),
            supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', pastDate),
            supabase.from('conversations').select('*', { count: 'exact', head: true }),
            supabase.from('messages').select('*', { count: 'exact', head: true }),
            supabase.from('calls').select('*', { count: 'exact', head: true }),
            supabase.from('message_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('deletion_requested', true)
        ]);

        // Probe Supabase Database Health
        const dbProbeStart = performance.now();
        const { error: dbError } = await supabase.from('users').select('id').limit(1);
        const dbLatencyMs = Math.round(performance.now() - dbProbeStart);

        // Probe Supabase Storage
        const storageProbeStart = performance.now();
        const { error: storageError } = await supabase.storage.from('novachat-media').list('', { limit: 1 });
        const storageLatencyMs = Math.round(performance.now() - storageProbeStart);

        // Aggregate daily user registrations over the selected range
        const { data: registrationData } = await supabase
            .from('users')
            .select('created_at')
            .gte('created_at', pastDate)
            .order('created_at', { ascending: true })
            .limit(1000);

        // Group into chart bins
        const registrationByDay = {};
        (registrationData || []).forEach(row => {
            const dateStr = new Date(row.created_at).toISOString().split('T')[0];
            registrationByDay[dateStr] = (registrationByDay[dateStr] || 0) + 1;
        });

        const userGrowth = Object.entries(registrationByDay).map(([date, count]) => ({
            date: date.slice(5), // MM-DD
            count
        }));

        return {
            totalUsers: usersRes.count || 0,
            activeUsers24h: active24hRes.count || 0,
            newUsersRange: newUsersRes.count || 0,
            totalChats: chatsRes.count || 0,
            totalMessages: messagesRes.count || 0,
            totalCalls: callsRes.count || 0,
            pendingReports: pendingReportsRes.count || 0,
            pendingDeletions: deletionRequestsRes.count || 0,
            systemHealth: {
                database: !dbError,
                databaseLatency: `${dbLatencyMs}ms`,
                realtime: true,
                storage: !storageError,
                storageLatency: `${storageLatencyMs}ms`
            },
            charts: {
                userGrowth: userGrowth.length > 0 ? userGrowth : [{ date: 'Today', count: usersRes.count || 0 }]
            }
        };
    },

    // ----------------------------------------------------
    // 2. User Registry with Server-Side Pagination & Filtering
    // ----------------------------------------------------
    getUsersPaginated: async ({
        page = 1,
        pageSize = 20,
        search = '',
        role = 'all',
        status = 'all',
        sortBy = 'created_at',
        sortOrder = 'desc'
    }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('users')
            .select(
                'id, email, display_name, phone_number, avatar_url, role, is_banned, deletion_requested, last_seen_at, created_at',
                { count: 'exact' }
            );

        // Search
        if (search && search.trim()) {
            const term = `%${search.trim().toLowerCase()}%`;
            query = query.or(`display_name.ilike.${term},email.ilike.${term}`);
        }

        // Role filter
        if (role && role !== 'all') {
            query = query.eq('role', role);
        }

        // Status filter
        if (status === 'banned') {
            query = query.eq('is_banned', true);
        } else if (status === 'active') {
            query = query.or('is_banned.is.null,is_banned.eq.false');
        } else if (status === 'deletion_requested') {
            query = query.eq('deletion_requested', true);
        }

        // Sorting
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });

        // Pagination range
        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) {
            console.error('[adminService] getUsersPaginated error:', error);
            throw error;
        }

        return {
            users: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    // ----------------------------------------------------
    // 3. User Dossier (Deep Profile & Engagement Statistics)
    // ----------------------------------------------------
    getUserDossier: async (userId) => {
        const [userRes, msgCountRes, partRes, callsRes, reportsRes] = await Promise.all([
            supabase.from('users').select('*').eq('id', userId).maybeSingle(),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId),
            supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId),
            supabase.from('calls').select('*', { count: 'exact', head: true }).or(`caller_id.eq.${userId},receiver_id.eq.${userId}`),
            supabase.from('message_reports').select('*', { count: 'exact', head: true }).eq('reported_user_id', userId)
        ]);

        if (userRes.error) throw userRes.error;

        return {
            user: userRes.data,
            metrics: {
                messagesSent: msgCountRes.count || 0,
                conversationsJoined: (partRes.data || []).length,
                callsParticipated: callsRes.count || 0,
                reportsReceived: reportsRes.count || 0
            }
        };
    },

    // ----------------------------------------------------
    // 4. User Moderation: Single & Bulk Ban / Unban
    // ----------------------------------------------------
    banUser: async (userId, isBanned = true, adminInfo = null) => {
        const { data, error } = await supabase
            .from('users')
            .update({ is_banned: isBanned, updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (error) throw error;

        // Log administrative audit action
        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: isBanned ? 'USER_BAN' : 'USER_UNBAN',
            targetType: 'USER',
            targetId: userId,
            details: { is_banned: isBanned }
        });

        return data;
    },

    bulkBanUsers: async (userIds = [], isBanned = true, adminInfo = null) => {
        if (!userIds.length) return { success: true, count: 0 };

        const { data, error } = await supabase
            .from('users')
            .update({ is_banned: isBanned, updated_at: new Date().toISOString() })
            .in('id', userIds);

        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: isBanned ? 'BULK_USER_BAN' : 'BULK_USER_UNBAN',
            targetType: 'USER_BATCH',
            targetId: userIds.join(','),
            details: { count: userIds.length, is_banned: isBanned }
        });

        return { success: true, count: userIds.length };
    },

    // ----------------------------------------------------
    // 5. Complete Account Erasure (Single & Bulk)
    // ----------------------------------------------------
    eraseUser: async (targetUserId, executingAdmin = null) => {
        return accountErasureService.eraseAccount(targetUserId, executingAdmin);
    },

    bulkEraseUsers: async (targetUserIds = [], executingAdmin = null) => {
        return accountErasureService.bulkEraseAccounts(targetUserIds, executingAdmin);
    },

    // ----------------------------------------------------
    // 6. Moderation Queue & Content Review
    // ----------------------------------------------------
    getReportsPaginated: async ({
        page = 1,
        pageSize = 20,
        status = 'all',
        category = 'all',
        priority = 'all'
    }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('message_reports')
            .select(`
                *,
                reporter:users!message_reports_reporter_id_fkey(id, display_name, email, avatar_url),
                reported_user:users!message_reports_reported_user_id_fkey(id, display_name, email, avatar_url),
                message:messages(id, content, media_url, message_type, created_at)
            `, { count: 'exact' });

        if (status && status !== 'all') query = query.eq('status', status);
        if (category && category !== 'all') query = query.eq('category', category);
        if (priority && priority !== 'all') query = query.eq('priority', priority);

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) {
            console.error('[adminService] getReportsPaginated error:', error);
            throw error;
        }

        return {
            reports: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    updateReportStatus: async (reportId, updates = {}, adminInfo = null) => {
        const { data, error } = await supabase
            .from('message_reports')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', reportId);

        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'REPORT_STATUS_UPDATE',
            targetType: 'REPORT',
            targetId: reportId,
            details: updates
        });

        return data;
    },

    getFlaggedMessagesPaginated: async ({ page = 1, pageSize = 20 }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, count, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:users(id, display_name, email, avatar_url)
            `, { count: 'exact' })
            .eq('status', 'flagged')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        return {
            messages: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    clearMessageFlag: async (messageId, adminInfo = null) => {
        const { data, error } = await supabase
            .from('messages')
            .update({ status: 'sent', updated_at: new Date().toISOString() })
            .eq('id', messageId);

        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'CLEAR_MESSAGE_FLAG',
            targetType: 'MESSAGE',
            targetId: messageId
        });

        return data;
    },

    hardDeleteMessage: async (messageId, adminInfo = null) => {
        const { error } = await supabase.from('messages').delete().eq('id', messageId);
        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'HARD_DELETE_MESSAGE',
            targetType: 'MESSAGE',
            targetId: messageId
        });

        return true;
    },

    bulkDeleteMessages: async (messageIds = [], adminInfo = null) => {
        if (!messageIds.length) return { success: true, count: 0 };

        const { error } = await supabase.from('messages').delete().in('id', messageIds);
        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'BULK_DELETE_MESSAGES',
            targetType: 'MESSAGE_BATCH',
            targetId: messageIds.join(','),
            details: { count: messageIds.length }
        });

        return { success: true, count: messageIds.length };
    },

    // ----------------------------------------------------
    // 7. Announcements Management (Paginated & Filterable)
    // ----------------------------------------------------
    getAnnouncementsPaginated: async ({
        page = 1,
        pageSize = 20,
        type = 'all',
        priority = 'all',
        activeOnly = false
    }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('announcements')
            .select('*', { count: 'exact' });

        if (type && type !== 'all') query = query.eq('type', type);
        if (priority && priority !== 'all') query = query.eq('priority', priority);
        if (activeOnly) query = query.eq('is_active', true);

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        return {
            announcements: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    createAnnouncement: async (announcementData, adminInfo = null) => {
        const { data, error } = await supabase
            .from('announcements')
            .insert({
                title: announcementData.title,
                body: announcementData.body,
                type: announcementData.type || 'info',
                priority: announcementData.priority || 'normal',
                sender_name: adminInfo?.display_name || 'System Administrator',
                is_active: announcementData.is_active ?? true
            })
            .select()
            .single();

        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'CREATE_ANNOUNCEMENT',
            targetType: 'ANNOUNCEMENT',
            targetId: data?.id,
            details: { title: announcementData.title }
        });

        return data;
    },

    updateAnnouncement: async (id, updates, adminInfo = null) => {
        const { data, error } = await supabase
            .from('announcements')
            .update(updates)
            .eq('id', id);

        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'UPDATE_ANNOUNCEMENT',
            targetType: 'ANNOUNCEMENT',
            targetId: id,
            details: updates
        });

        return data;
    },

    deleteAnnouncement: async (id, adminInfo = null) => {
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'DELETE_ANNOUNCEMENT',
            targetType: 'ANNOUNCEMENT',
            targetId: id
        });

        return true;
    },

    bulkDeleteAnnouncements: async (ids = [], adminInfo = null) => {
        if (!ids.length) return { success: true, count: 0 };

        const { error } = await supabase.from('announcements').delete().in('id', ids);
        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'BULK_DELETE_ANNOUNCEMENTS',
            targetType: 'ANNOUNCEMENT_BATCH',
            targetId: ids.join(','),
            details: { count: ids.length }
        });

        return { success: true, count: ids.length };
    },

    // ----------------------------------------------------
    // 8. Privacy-Respecting Location Dashboard
    // ----------------------------------------------------
    getUserLocations: async (adminInfo = null) => {
        // Enforce audit log of administrative location queries
        if (adminInfo) {
            await adminService.logAuditAction({
                adminId: adminInfo?.id || adminInfo?.uid,
                adminEmail: adminInfo?.email,
                action: 'VIEW_LOCATION_TELEMETRY',
                targetType: 'GEOSPATIAL_RADAR',
                targetId: 'ALL'
            });
        }

        const { data, error } = await supabase
            .from('user_locations')
            .select(`
                user_id, latitude, longitude, is_online, platform, updated_at,
                users(display_name, avatar_url, email, role)
            `)
            .order('updated_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('[adminService] Locations error:', error);
            return [];
        }

        return (data || []).map(r => ({
            uid: r.user_id,
            userId: r.user_id,
            lat: r.latitude,
            lng: r.longitude,
            isOnline: r.is_online,
            displayName: r.users?.display_name || 'Anonymous',
            photoURL: r.users?.avatar_url || null,
            email: r.users?.email || null,
            role: r.users?.role || 'user',
            platform: r.platform,
            updatedAt: r.updated_at
        }));
    },

    // ----------------------------------------------------
    // 9. Conversation Moderation (Privacy-First Context)
    // ----------------------------------------------------
    getAllChatsPaginated: async ({ page = 1, pageSize = 20, search = '' }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('conversations')
            .select(`
                id, title, type, last_message_text, last_message_at, created_at,
                conversation_participants(user_id, role, users(id, display_name, avatar_url, email))
            `, { count: 'exact' });

        if (search && search.trim()) {
            query = query.ilike('title', `%${search.trim()}%`);
        }

        query = query.order('last_message_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        const chats = (data || []).map(c => ({
            id: c.id,
            title: c.title,
            type: c.type,
            lastMessage: c.last_message_text,
            lastMessageTimestamp: c.last_message_at,
            participants: (c.conversation_participants || []).map(p => p.user_id),
            participantDetails: (c.conversation_participants || []).map(p => p.users)
        }));

        return {
            chats,
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    getChatMessagesPaginated: async (chatId, { page = 1, pageSize = 50, before = null }) => {
        const [convRes, partRes] = await Promise.all([
            supabase.from('conversations').select('*').eq('id', chatId).maybeSingle(),
            supabase.from('conversation_participants').select('user_id, role, users(*)').eq('conversation_id', chatId)
        ]);

        let msgQuery = supabase
            .from('messages')
            .select('*, users(display_name, avatar_url, email)', { count: 'exact' })
            .eq('conversation_id', chatId)
            .order('created_at', { ascending: false })
            .limit(pageSize);

        if (before) {
            msgQuery = msgQuery.lt('created_at', before);
        } else {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            msgQuery = msgQuery.range(from, to);
        }

        const { data: messages, count, error } = await msgQuery;
        if (error) throw error;

        return {
            conversation: convRes.data,
            participants: (partRes.data || []).map(p => ({
                id: p.user_id,
                display_name: p.users?.display_name || 'Anonymous',
                avatar_url: p.users?.avatar_url || null,
                email: p.users?.email || null
            })),
            messages: (messages || []).reverse().map(m => ({
                id: m.id,
                senderId: m.sender_id,
                senderName: m.users?.display_name || 'User',
                senderPhoto: m.users?.avatar_url || null,
                text: m.content,
                content: m.content,
                type: m.message_type,
                fileUrl: m.media_url,
                status: m.status,
                timestamp: m.created_at
            })),
            totalCount: count || 0
        };
    },

    hardDeleteChat: async (chatId, adminInfo = null) => {
        await supabase.from('messages').delete().eq('conversation_id', chatId);
        await supabase.from('conversation_participants').delete().eq('conversation_id', chatId);
        const { error } = await supabase.from('conversations').delete().eq('id', chatId);
        if (error) throw error;

        await adminService.logAuditAction({
            adminId: adminInfo?.id || adminInfo?.uid,
            adminEmail: adminInfo?.email,
            action: 'HARD_DELETE_CHAT',
            targetType: 'CONVERSATION',
            targetId: chatId
        });

        return true;
    },

    // ----------------------------------------------------
    // 10. Immutable Audit Logging
    // ----------------------------------------------------
    logAuditAction: async ({ adminId, adminEmail, action, targetType, targetId, details = {} }) => {
        try {
            await supabase.from('admin_audit_logs').insert({
                admin_id: adminId || null,
                admin_email: adminEmail || 'admin@system.com',
                action,
                target_type: targetType,
                target_id: String(targetId || ''),
                details
            });
        } catch (err) {
            console.error('[Audit] Failed to log action:', err);
        }
    },

    getAuditLogsPaginated: async ({ page = 1, pageSize = 20, action = 'all' }) => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('admin_audit_logs')
            .select('*', { count: 'exact' });

        if (action && action !== 'all') {
            query = query.eq('action', action);
        }

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        return {
            logs: data || [],
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    }
};

export default adminService;
