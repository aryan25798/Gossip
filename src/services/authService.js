import { supabase } from '../supabase';

export const authService = {
    // 1. Sign up with email & password
    signupWithEmail: async (email, password, displayName) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    displayName: displayName || email.split('@')[0],
                    searchableName: (displayName || email.split('@')[0]).toLowerCase()
                }
            }
        });
        if (error) throw error;

        // Auto-provision or update public.users table
        if (data.user) {
            await supabase.from('users').upsert({
                id: data.user.id,
                email: data.user.email,
                display_name: displayName || email.split('@')[0],
                searchable_name: (displayName || email.split('@')[0]).toLowerCase(),
                role: 'user',
                last_seen_at: new Date().toISOString()
            });
        }
        return data.user;
    },

    // 2. Login with email & password
    loginWithEmail: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;

        // Update last seen
        if (data.user) {
            await supabase.from('users').update({
                last_seen_at: new Date().toISOString()
            }).eq('id', data.user.id);
        }
        return data.user;
    },

    // 3. Login with Google (Official Supabase OAuth)
    loginWithGoogle: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`
            }
        });
        if (error) throw error;
        return data;
    },

    // 4. Logout
    logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    // 5. Get current user profile from public.users
    getUserProfile: async (userId) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            console.warn('[authService] getUserProfile error:', error);
            return null;
        }
        return data;
    },

    // 6. Update user profile
    updateUserProfile: async (userId, updates) => {
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    // 7. Upload profile avatar to Supabase Storage
    uploadProfilePhoto: async (userId, file) => {
        const ext = file.name.split('.').pop();
        const filePath = `avatars/${userId}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('novachat-media')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('novachat-media')
            .getPublicUrl(filePath);

        await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId);

        try {
            await supabase.auth.updateUser({
                data: { avatar_url: publicUrl, picture: publicUrl }
            });
        } catch (e) {
            console.debug('[authService] updateUser metadata sync warning:', e);
        }

        return publicUrl;
    }
};

export const updateUserProfile = authService.updateUserProfile;
export const uploadProfilePhoto = authService.uploadProfilePhoto;
