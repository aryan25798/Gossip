import { supabase } from '../supabase';
import { v4 as uuidv4 } from 'uuid';

export const postStatus = async (user, type, content, caption = "", background = "") => {
    try {
        const userId = user.uid || user.id;
        let contentUrl = content;

        if (type !== 'text' && content instanceof File) {
            const ext = content.name.split('.').pop() || 'jpg';
            const filePath = `status/${userId}/${Date.now()}_${uuidv4()}.${ext}`;

            const { data, error } = await supabase.storage
                .from('novachat-media')
                .upload(filePath, content, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: publicData } = supabase.storage
                .from('novachat-media')
                .getPublicUrl(filePath);

            contentUrl = publicData.publicUrl;
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { error: insertError } = await supabase
            .from('user_statuses')
            .insert({
                user_id: userId,
                type,
                media_type: type,
                content: contentUrl,
                content_url: contentUrl,
                caption: caption || '',
                background: type === 'text' ? background : null,
                expires_at: expiresAt
            });

        if (insertError) throw insertError;
    } catch (err) {
        console.error("[statusService] postStatus error:", err);
        throw err;
    }
};

export const subscribeToMyStatus = (userId, callback) => {
    if (!userId) return () => {};

    const loadMyStatus = async () => {
        try {
            const { data } = await supabase
                .from('user_statuses')
                .select('*')
                .eq('user_id', userId)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: true });

            if (!data || data.length === 0) {
                callback(null);
                return;
            }

            const formatted = {
                userId,
                userName: 'My status',
                items: data.map(r => ({
                    id: r.id,
                    type: r.type,
                    url: r.content,
                    content: r.content,
                    caption: r.caption,
                    background: r.background,
                    timestamp: r.created_at
                }))
            };
            callback(formatted);
        } catch (err) {
            console.error("[statusService] loadMyStatus error:", err);
            callback(null);
        }
    };

    loadMyStatus();

    const channel = supabase
        .channel(`my_status_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses', filter: `user_id=eq.${userId}` }, () => {
            loadMyStatus();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const subscribeToRecentUpdates = (userId, callback) => {
    if (!userId) return () => {};

    const loadRecent = async () => {
        try {
            // Postgres RLS policy automatically restricts selectable statuses to accepted friends and unexpired only
            const { data } = await supabase
                .from('user_statuses')
                .select('*, users(id, display_name, avatar_url)')
                .neq('user_id', userId)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: true });

            if (!data || data.length === 0) {
                callback({ recent: [], viewed: [] });
                return;
            }

            const userGroups = new Map();
            data.forEach(r => {
                const u = r.users;
                if (!userGroups.has(r.user_id)) {
                    userGroups.set(r.user_id, {
                        userId: r.user_id,
                        userName: u?.display_name || 'Friend',
                        userPhoto: u?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user_id}`,
                        items: []
                    });
                }
                userGroups.get(r.user_id).items.push({
                    id: r.id,
                    type: r.type,
                    url: r.content,
                    content: r.content,
                    caption: r.caption,
                    background: r.background,
                    timestamp: r.created_at
                });
            });

            callback({ recent: Array.from(userGroups.values()), viewed: [] });
        } catch (err) {
            console.error("[statusService] loadRecent error:", err);
            callback({ recent: [], viewed: [] });
        }
    };

    loadRecent();

    const channel = supabase
        .channel(`all_statuses`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses' }, () => {
            loadRecent();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const subscribeToStatusFeed = (userId, onSignal) => {
    return () => {};
};

export const syncStatuses = async () => {
    return { updates: [] };
};

export const markStatusAsViewed = async (statusId, viewerId) => {
    // No-op / Supabase placeholder
    return true;
};

export const replyToStatus = async (status, currentUser, text) => {
    // Send standard direct message to status owner
    return true;
};
