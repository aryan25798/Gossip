import { supabase } from "../supabase";

export const userService = {
    // 1. Search users with server-side pagination
    searchUsers: async (searchTerm, currentUserId) => {
        if (!searchTerm || !searchTerm.trim()) return [];

        const term = `%${searchTerm.trim().toLowerCase()}%`;
        const { data, error } = await supabase
            .from('users')
            .select('id, display_name, email, avatar_url, about_status, last_seen_at')
            .or(`searchable_name.ilike.${term},email.ilike.${term}`)
            .neq('id', currentUserId)
            .limit(20);

        if (error) {
            console.error('[userService] Search error:', error);
            return [];
        }

        return data.map(u => ({
            id: u.id,
            uid: u.id,
            displayName: u.display_name,
            email: u.email,
            photoURL: u.avatar_url,
            aboutStatus: u.about_status,
            lastSeen: u.last_seen_at
        }));
    },

    searchUsersPaged: async (searchTerm, currentUserId, pageOrCursor = 1, pageSize = 20) => {
        const page = typeof pageOrCursor === 'number' && pageOrCursor > 0 ? pageOrCursor : 1;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('users')
            .select('id, display_name, email, avatar_url, about_status, last_seen_at', { count: 'exact' })
            .neq('id', currentUserId);

        if (searchTerm && searchTerm.trim()) {
            const term = `%${searchTerm.trim().toLowerCase()}%`;
            query = query.or(`searchable_name.ilike.${term},email.ilike.${term}`);
        }

        query = query.order('display_name', { ascending: true }).range(from, to);

        const { data, count, error } = await query;
        if (error) {
            console.error('[userService] Paginated search error:', error);
            return { users: [], lastDoc: null, totalCount: 0, page, pageSize, totalPages: 1 };
        }

        const users = (data || []).map(u => ({
            id: u.id,
            uid: u.id,
            displayName: u.display_name,
            email: u.email,
            photoURL: u.avatar_url,
            aboutStatus: u.about_status,
            lastSeen: u.last_seen_at
        }));

        return {
            users,
            lastDoc: users.length === pageSize ? page + 1 : null,
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    // 2. Block/unblock user
    blockUser: async (currentUserId, targetUserId) => {
        return supabase.from('contacts').upsert({
            user_id: currentUserId,
            contact_user_id: targetUserId,
            status: 'blocked'
        });
    },

    unblockUser: async (currentUserId, targetUserId) => {
        return supabase.from('contacts').delete().match({
            user_id: currentUserId,
            contact_user_id: targetUserId,
            status: 'blocked'
        });
    },

    // 3. User lists with pagination
    getPagedUsers: async (pageOrCursor = 1, pageSize = 20) => {
        const page = typeof pageOrCursor === 'number' && pageOrCursor > 0 ? pageOrCursor : 1;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, count, error } = await supabase
            .from('users')
            .select('id, display_name, email, avatar_url, about_status, last_seen_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        const users = (data || []).map(u => ({
            id: u.id,
            uid: u.id,
            displayName: u.display_name,
            email: u.email,
            photoURL: u.avatar_url,
            aboutStatus: u.about_status,
            lastSeen: u.last_seen_at
        }));

        return {
            users,
            lastDoc: users.length === pageSize ? page + 1 : null,
            totalCount: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
        };
    },

    getUsersByIds: async (ids = []) => {
        if (!ids || ids.length === 0) return [];
        const { data } = await supabase.from('users').select('*').in('id', ids);
        return (data || []).map(u => ({
            id: u.id,
            uid: u.id,
            displayName: u.display_name,
            email: u.email,
            photoURL: u.avatar_url,
            aboutStatus: u.about_status
        }));
    }
};

export const searchUsers = userService.searchUsers;
export const searchUsersPaged = userService.searchUsersPaged;
export const getPagedUsers = userService.getPagedUsers;
export const getUsersByIds = userService.getUsersByIds;
export const blockUser = userService.blockUser;
export const unblockUser = userService.unblockUser;
export default userService;
