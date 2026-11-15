/**
 * NovaChat WebRTC Configuration & ICE Server Manager
 * 
 * Supports:
 * - Direct P2P media routing via Google Public STUN servers (Free, zero-cost, ~80-85% success on consumer NATs)
 * - Environment-based Coturn / TURN relay fallback via VITE_TURN_SERVER_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
 * - Optimal Opus audio constraints (stereo, echo cancellation, noise suppression, auto gain control)
 * - Adaptive 720p/30fps video constraints with front/back camera support
 */

let cachedMeteredServers = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

/**
 * Fetch dynamic ephemeral TURN credentials from Metered.ca REST API
 */
export const fetchMeteredCredentials = async () => {
    const domain = import.meta.env.VITE_METERED_DOMAIN || 'novachatcalls.metered.live';
    const apiKey = import.meta.env.VITE_METERED_API_KEY;

    if (!apiKey) return null;
    if (cachedMeteredServers && (Date.now() - lastFetchTime < CACHE_TTL_MS)) {
        return cachedMeteredServers;
    }

    try {
        const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`);
        if (!res.ok) throw new Error(`Metered API returned ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            cachedMeteredServers = data;
            lastFetchTime = Date.now();
            console.log('[WebRTC] Successfully fetched dynamic Metered TURN credentials.');
            return cachedMeteredServers;
        }
    } catch (err) {
        console.warn('[WebRTC] Failed to fetch dynamic Metered credentials, falling back to static config:', err);
    }
    return null;
};

export const getIceServers = () => {
    // 1. If dynamic Metered credentials are cached in memory, use them with Google STUN fallback
    if (cachedMeteredServers && cachedMeteredServers.length > 0) {
        return [
            ...cachedMeteredServers,
            { urls: "stun:stun.l.google.com:19302" }
        ];
    }

    // 2. High-availability public STUN servers (Direct P2P NAT Hole Punching)
    const servers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ];

    // 3. Dynamic / Static TURN Relay Configuration (Self-Hosted Coturn / Metered.ca)
    const turnUrl = import.meta.env.VITE_TURN_SERVER_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    if (turnUrl && turnUsername && turnCredential) {
        const parsedUrls = turnUrl.includes(',') 
            ? turnUrl.split(',').map(u => u.trim()).filter(Boolean)
            : turnUrl;

        servers.push({
            urls: parsedUrls,
            username: turnUsername,
            credential: turnCredential
        });

        if (import.meta.env.VITE_TURN_SERVER_URL_TCP) {
            servers.push({
                urls: import.meta.env.VITE_TURN_SERVER_URL_TCP,
                username: turnUsername,
                credential: turnCredential
            });
        }
    }

    return servers;
};

/**
 * Returns diagnostic summary of the current ICE/TURN configuration.
 */
export const getIceConfigSummary = () => {
    const servers = getIceServers();
    const hasTurn = servers.some(s => {
        const u = typeof s.urls === 'string' ? s.urls : (s.urls[0] || '');
        return u.startsWith('turn:') || u.startsWith('turns:');
    });

    return {
        hasTurn,
        serverCount: servers.length,
        servers: servers.map(s => ({
            url: typeof s.urls === 'string' ? s.urls : s.urls.join(', '),
            type: (typeof s.urls === 'string' ? s.urls : s.urls[0] || '').startsWith('turn') ? 'TURN Relay' : 'STUN Discovery',
            hasAuth: Boolean(s.username && s.credential)
        }))
    };
};

/**
 * WhatsApp-Grade WebRTC Audio & Video Media Constraints
 */
export const getMediaConstraints = (type = 'video', options = {}) => {
    const isVideo = type === 'video';

    return {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 2
        },
        video: isVideo ? {
            facingMode: options.facingMode || 'user',
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 }
        } : false
    };
};
