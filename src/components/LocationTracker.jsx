import React, { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';

export const LocationTracker = () => {
    const { currentUser } = useAuth();
    const lastUpdateRef = useRef(0);
    const watchIdRef = useRef(null);

    useEffect(() => {
        const userId = currentUser?.id || currentUser?.uid;
        if (!userId || !('geolocation' in navigator)) return;

        const updateLocation = async (coords) => {
            const now = Date.now();
            // Throttle: at most once every 15 seconds
            if (now - lastUpdateRef.current < 15000) return;
            lastUpdateRef.current = now;

            try {
                await supabase.from('user_locations').upsert({
                    user_id: userId,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    is_online: true,
                    platform: navigator.platform || 'Web Terminal',
                    user_agent: navigator.userAgent,
                    updated_at: new Date().toISOString()
                });
            } catch (err) {
                console.warn('[LocationTracker] Location update warning:', err);
            }
        };

        // 1. Initial quick position update
        navigator.geolocation.getCurrentPosition(
            (pos) => updateLocation(pos.coords),
            (err) => console.debug('[LocationTracker] Geolocation permission status:', err.message),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );

        // 2. Continuous watch position
        try {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => updateLocation(pos.coords),
                (err) => console.debug('[LocationTracker] Watch position event:', err.message),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
            );
        } catch (e) {
            console.debug('[LocationTracker] watchPosition not available:', e);
        }

        // 3. Mark offline on unload
        const handleUnload = () => {
            supabase
                .from('user_locations')
                .update({ is_online: false, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [currentUser?.id, currentUser?.uid]);

    return null;
};

export default LocationTracker;
