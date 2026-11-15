import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { authService } from '../services/authService';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const syncUserData = useCallback(async (authUser) => {
        if (!authUser) {
            setCurrentUser(null);
            setLoading(false);
            return;
        }

        try {
            // Fetch profile record from public.users
            let profile = await authService.getUserProfile(authUser.id);
            if (!profile) {
                const displayName = authUser.user_metadata?.displayName || authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0];
                const { data } = await supabase.from('users').upsert({
                    id: authUser.id,
                    email: authUser.email,
                    display_name: displayName,
                    searchable_name: displayName.toLowerCase(),
                    role: authUser.email === 'admin@novachat.app' ? 'superAdmin' : 'user',
                    last_seen_at: new Date().toISOString()
                }).select().maybeSingle();
                profile = data;
            }

            const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';
            const isSuperAdmin = profile?.role === 'superAdmin';

            const activePhoto = profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;

            const mergedUser = {
                uid: authUser.id,
                id: authUser.id,
                email: authUser.email,
                displayName: profile?.display_name || authUser.user_metadata?.displayName || authUser.email?.split('@')[0],
                photoURL: activePhoto,
                aboutStatus: profile?.about_status || 'Hey there! I am using NovaChat.',
                role: profile?.role || 'user',
                isAdmin,
                superAdmin: isSuperAdmin,
                claimsSettled: true
            };

            setCurrentUser(mergedUser);

            // Update user location in background
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    await supabase.from('user_locations').upsert({
                        user_id: authUser.id,
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        is_online: true,
                        platform: navigator.platform,
                        user_agent: navigator.userAgent,
                        updated_at: new Date().toISOString()
                    });
                }, () => {});
            }
        } catch (err) {
            console.error('[AuthContext] Failed to sync user data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            syncUserData(session?.user || null);
        });

        // Supabase reactive auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            syncUserData(session?.user || null);
        });

        return () => subscription?.unsubscribe();
    }, [syncUserData]);

    const loginWithEmail = async (email, password) => {
        setLoading(true);
        try {
            const user = await authService.loginWithEmail(email, password);
            await syncUserData(user);
            return user;
        } finally {
            setLoading(false);
        }
    };

    const signupWithEmail = async (email, password, displayName) => {
        setLoading(true);
        try {
            const user = await authService.signupWithEmail(email, password, displayName);
            await syncUserData(user);
            return user;
        } finally {
            setLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        return authService.loginWithGoogle();
    };

    const logout = async () => {
        if (currentUser) {
            await supabase.from('user_locations').update({ is_online: false }).eq('user_id', currentUser.id);
        }
        await authService.logout();
        setCurrentUser(null);
    };

    const updateProfileState = useCallback((partial) => {
        setCurrentUser(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                ...partial,
                ...(partial.photoURL ? { photoURL: partial.photoURL } : {}),
                ...(partial.displayName ? { displayName: partial.displayName } : {}),
                ...(partial.aboutStatus ? { aboutStatus: partial.aboutStatus } : {})
            };
        });
    }, []);

    const refreshUserProfile = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            await syncUserData(session.user);
        }
    }, [syncUserData]);

    const value = useMemo(() => ({
        currentUser,
        loading,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        logout,
        updateProfileState,
        refreshUserProfile
    }), [currentUser, loading, updateProfileState, refreshUserProfile]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
