import { supabase } from '../supabase';

export const accountErasureService = {
    /**
     * Complete account erasure for a single user
     * 1. Remove owned files via Supabase Storage API (avatars, attachments)
     * 2. Atomic deletion across auth.users and public.* tables via PostgreSQL RPC
     * 3. Record audit log
     */
    eraseAccount: async (targetUserId, executingAdmin = null) => {
        if (!targetUserId) throw new Error('Target user ID is required');

        // Safety: Prevent admin from nuking themselves
        if (executingAdmin && (executingAdmin.id === targetUserId || executingAdmin.uid === targetUserId)) {
            throw new Error('Self-destruction blocked: Cannot permanently erase your own administrator account.');
        }

        const adminId = executingAdmin?.id || executingAdmin?.uid || null;
        const adminEmail = executingAdmin?.email || 'admin@system.com';

        // 1. Delete user files from Supabase Storage using Storage API
        try {
            const { data: avatarFiles } = await supabase.storage
                .from('novachat-media')
                .list('avatars', { search: targetUserId });

            if (avatarFiles && avatarFiles.length > 0) {
                const pathsToDelete = avatarFiles.map(f => `avatars/${f.name}`);
                await supabase.storage.from('novachat-media').remove(pathsToDelete);
            }
        } catch (storageErr) {
            console.warn('[AccountErasure] Non-critical storage cleanup warning:', storageErr);
        }

        // 2. Execute atomic database erasure RPC
        const { data, error } = await supabase.rpc('erase_user_account', {
            target_user_id: targetUserId,
            executing_admin_id: adminId,
            admin_email: adminEmail
        });

        if (error) {
            console.error('[AccountErasure] Single erasure failed:', error);
            throw new Error(error.message || 'Account erasure failed');
        }

        return data;
    },

    /**
     * Bulk account erasure for multiple users in controlled batch
     */
    bulkEraseAccounts: async (targetUserIds = [], executingAdmin = null) => {
        if (!targetUserIds || targetUserIds.length === 0) {
            return { success: true, total_requested: 0, success_count: 0, fail_count: 0 };
        }

        const adminId = executingAdmin?.id || executingAdmin?.uid || null;
        const adminEmail = executingAdmin?.email || 'admin@system.com';

        // Filter out executing admin if inadvertently included
        const filteredIds = targetUserIds.filter(id => id !== adminId);

        // 1. Clean up storage files in parallel chunks
        for (const uid of filteredIds) {
            try {
                const { data: files } = await supabase.storage
                    .from('novachat-media')
                    .list('avatars', { search: uid });
                if (files && files.length > 0) {
                    await supabase.storage.from('novachat-media').remove(files.map(f => `avatars/${f.name}`));
                }
            } catch (err) {
                console.warn(`[AccountErasure] Storage cleanup skipped for ${uid}`);
            }
        }

        // 2. Execute bulk database RPC
        const { data, error } = await supabase.rpc('bulk_erase_user_accounts', {
            target_user_ids: filteredIds,
            executing_admin_id: adminId,
            admin_email: adminEmail
        });

        if (error) {
            console.error('[AccountErasure] Bulk erasure failed:', error);
            throw new Error(error.message || 'Bulk account erasure failed');
        }

        return data;
    }
};

export default accountErasureService;
