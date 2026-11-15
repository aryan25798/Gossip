import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { adminService } from '../../services/adminService';
import { supabase } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import {
    MapPin, Search, RefreshCw, Crosshair, ExternalLink,
    Layers, AlertCircle, CheckCircle2, ChevronLeft, X,
    Key, Settings, Globe, Shield, Radio, Check
} from 'lucide-react';

// Controller to smoothly pan & zoom to target coordinates
function MapController({ selectedCoords }) {
    const map = useMap();
    useEffect(() => {
        if (selectedCoords && selectedCoords.lat && selectedCoords.lng) {
            map.flyTo([selectedCoords.lat, selectedCoords.lng], 15, { duration: 1.5 });
        }
    }, [selectedCoords, map]);
    return null;
}

// Custom HTML Avatar Marker for Leaflet
const createAvatarIcon = (user) => {
    const isOnline = Boolean(user.isOnline);
    const borderColor = isOnline ? '#22d3ee' : '#64748b';
    const glow = isOnline ? '0 0 15px rgba(34,211,238,0.7)' : 'none';
    const avatarSrc = user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.userId || user.uid}`;

    return L.divIcon({
        className: 'radar-marker',
        html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                <div style="position: relative; width: 40px; height: 40px; border-radius: 50%; border: 2.5px solid ${borderColor}; box-shadow: ${glow}; background: #0f172a; overflow: hidden;">
                    <img src="${avatarSrc}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://api.dicebear.com/9.x/avataaars/svg?seed=fallback'" />
                    <div style="position: absolute; bottom: 1px; right: 1px; width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? '#10b981' : '#64748b'}; border: 2px solid #0f172a;"></div>
                </div>
                <div style="margin-top: 4px; padding: 2px 8px; background: rgba(15,23,42,0.92); border: 1px solid rgba(34,211,238,0.4); border-radius: 6px; font-size: 10px; font-weight: 800; color: #f8fafc; text-transform: uppercase; white-space: nowrap; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">
                    ${(user.displayName || 'User').split(' ')[0]}
                </div>
            </div>
        `,
        iconSize: [40, 56],
        iconAnchor: [20, 56],
        popupAnchor: [0, -56]
    });
};

export const GodMap = () => {
    const { currentUser } = useAuth();
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [lastSync, setLastSync] = useState(new Date());

    // Responsive Drawer: Default open only on very wide desktop screens
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1280);

    // Active Map Engine: 'esri-dark', 'mappls', 'esri-sat', 'osm'
    const [mapEngine, setMapEngine] = useState('esri-dark');
    const [showLayerMenu, setShowLayerMenu] = useState(false);
    const [showKeyModal, setShowKeyModal] = useState(false);

    // MapmyIndia / Mappls Credentials state
    const [mmiKey, setMmiKey] = useState(() => {
        return localStorage.getItem('novachat_mmi_key') ||
            import.meta.env.VITE_MAPMYINDIA_API_KEY ||
            import.meta.env.VITE_MAPPLS_API_KEY ||
            'dtbcmezcuovukpygcuegiuimtvizaohaamid';
    });
    const [inputKey, setInputKey] = useState(mmiKey);
    const [mmiTestStatus, setMmiTestStatus] = useState(null); // { testing, valid, error }

    const mapplsContainerRef = useRef(null);
    const mapplsMapRef = useRef(null);
    const mapplsMarkersRef = useRef([]);

    // 1. Fetch initial user GPS records
    const fetchLocations = useCallback(async () => {
        try {
            const data = await adminService.getUserLocations(currentUser);
            const valid = (data || []).filter(u => u.lat && u.lng && !isNaN(u.lat) && !isNaN(u.lng));
            setLocations(valid);
            setLastSync(new Date());
        } catch (err) {
            console.error('[GodMap] Error fetching locations:', err);
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        fetchLocations();
        // Fallback polling interval: 15s
        const timer = setInterval(fetchLocations, 15000);
        return () => clearInterval(timer);
    }, [fetchLocations]);

    // 2. Real-time GPS location streaming via Supabase Realtime Channel
    useEffect(() => {
        const channel = supabase
            .channel('admin_user_locations_feed')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'user_locations' },
                (payload) => {
                    const row = payload.new;
                    if (!row || !row.latitude || !row.longitude) return;

                    setLocations((prev) => {
                        const index = prev.findIndex(u => u.userId === row.user_id || u.uid === row.user_id);
                        if (index >= 0) {
                            const updated = [...prev];
                            updated[index] = {
                                ...updated[index],
                                lat: row.latitude,
                                lng: row.longitude,
                                isOnline: row.is_online,
                                platform: row.platform || updated[index].platform,
                                updatedAt: row.updated_at || new Date().toISOString()
                            };
                            return updated;
                        } else {
                            fetchLocations();
                            return prev;
                        }
                    });
                    setLastSync(new Date());
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchLocations]);

    // 3. Test MapmyIndia / Mappls Key
    const testMapmyIndiaKey = async (keyToTest) => {
        const k = (keyToTest || mmiKey).trim();
        if (!k) {
            setMmiTestStatus({ testing: false, valid: false, error: 'Please enter a MapmyIndia / Mappls API key.' });
            return;
        }

        setMmiTestStatus({ testing: true, valid: false, error: null });
        try {
            const res = await fetch(`https://apis.mappls.com/advancedmaps/api/${k}/map_sdk?v=3.0`, { method: 'GET' });
            if (res.ok || res.status === 200) {
                setMmiTestStatus({ testing: false, valid: true, error: null });
            } else {
                const text = await res.text();
                let errMsg = `Server returned HTTP ${res.status}`;
                try {
                    const json = JSON.parse(text);
                    if (json.error_description || json.error) {
                        errMsg = json.error_description || json.error;
                    }
                } catch {
                    // text error
                }
                setMmiTestStatus({ testing: false, valid: false, error: errMsg });
            }
        } catch (err) {
            setMmiTestStatus({ testing: false, valid: false, error: err.message || 'Network error reaching MapmyIndia.' });
        }
    };

    // Save MapmyIndia Key
    const handleSaveKey = () => {
        const trimmed = inputKey.trim();
        setMmiKey(trimmed);
        localStorage.setItem('novachat_mmi_key', trimmed);
        testMapmyIndiaKey(trimmed);
    };

    // 4. Mappls SDK loader when 'mappls' engine is active
    useEffect(() => {
        if (mapEngine !== 'mappls' || !mmiKey) return;

        let script = document.getElementById('mappls-sdk-script');
        if (!script) {
            script = document.createElement('script');
            script.id = 'mappls-sdk-script';
            script.src = `https://apis.mappls.com/advancedmaps/api/${mmiKey}/map_sdk?v=3.0`;
            script.async = true;

            script.onload = () => {
                if (window.mappls || window.MapmyIndia) {
                    initMapplsMap();
                } else {
                    setMapEngine('esri-dark');
                }
            };

            script.onerror = () => {
                setMapEngine('esri-dark');
            };

            document.head.appendChild(script);
        } else if (window.mappls) {
            initMapplsMap();
        }
    }, [mapEngine, mmiKey]);

    const initMapplsMap = () => {
        if (!window.mappls || !mapplsContainerRef.current) return;
        try {
            if (mapplsMapRef.current) return;
            const center = locations.length > 0
                ? [locations[0].lat, locations[0].lng]
                : [20.5937, 78.9629];

            mapplsMapRef.current = new window.mappls.Map(mapplsContainerRef.current, {
                center,
                zoom: 5
            });

            renderMapplsMarkers();
        } catch (err) {
            console.warn('[GodMap] Mappls init notice:', err);
        }
    };

    const renderMapplsMarkers = () => {
        if (!window.mappls || !mapplsMapRef.current) return;
        mapplsMarkersRef.current.forEach(m => m.remove && m.remove());
        mapplsMarkersRef.current = [];

        locations.forEach(user => {
            try {
                const marker = new window.mappls.Marker({
                    map: mapplsMapRef.current,
                    position: { lat: user.lat, lng: user.lng },
                    popupHtml: `
                        <div style="font-family: sans-serif; font-size: 11px; padding: 6px; color: #0f172a;">
                            <strong>${user.displayName || 'User'}</strong><br/>
                            <span>${user.email || ''}</span><br/>
                            <span>Status: ${user.isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                    `
                });
                mapplsMarkersRef.current.push(marker);
            } catch (e) {
                console.debug('[GodMap] Mappls marker error:', e);
            }
        });
    };

    useEffect(() => {
        if (mapEngine === 'mappls' && mapplsMapRef.current) {
            renderMapplsMarkers();
        }
    }, [locations, mapEngine]);

    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return locations;
        const q = searchQuery.toLowerCase();
        return locations.filter(u =>
            u.displayName?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)
        );
    }, [locations, searchQuery]);

    const onlineCount = useMemo(() => {
        return locations.filter(u => u.isOnline).length;
    }, [locations]);

    const defaultCenter = useMemo(() => {
        if (locations.length > 0) {
            return [locations[0].lat, locations[0].lng];
        }
        return [20.5937, 78.9629]; // India / Global
    }, [locations]);

    const handleSelectNode = (user) => {
        setSelectedUser(user);
        if (mapEngine === 'mappls' && mapplsMapRef.current) {
            try {
                mapplsMapRef.current.setCenter([user.lat, user.lng]);
                mapplsMapRef.current.setZoom(14);
            } catch (e) {
                console.debug(e);
            }
        }
        // Auto-minimize drawer on mobile and tablet to view the map
        if (window.innerWidth < 1280) {
            setSidebarOpen(false);
        }
    };

    return (
        <div className="relative h-full w-full bg-slate-950 overflow-hidden font-sans select-none">
            {/* Top Right Tactical Ribbon */}
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 sm:gap-2">
                {/* Active Provider Badge */}
                <div className="hidden xs:flex px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-xs font-semibold text-slate-200 shadow-xl items-center gap-1.5 sm:gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span className="hidden md:inline text-slate-400">Provider:</span>
                    <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] truncate max-w-[90px] sm:max-w-[150px] md:max-w-none">
                        {mapEngine === 'mappls'
                            ? 'Mappls'
                            : mapEngine === 'esri-sat'
                            ? 'Satellite'
                            : mapEngine === 'osm'
                            ? 'OpenStreetMap'
                            : 'Esri Dark Gray'}
                    </span>
                </div>

                {/* Layer Switcher Button */}
                <div className="relative">
                    <button
                        onClick={() => setShowLayerMenu(!showLayerMenu)}
                        className="p-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-cyan-400 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                        title="Change Radar Layer"
                    >
                        <Layers size={16} />
                    </button>

                    {showLayerMenu && (
                        <div className="absolute right-0 top-11 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-[1001] space-y-1 animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                Select Radar Engine
                            </div>

                            <button
                                onClick={() => {
                                    setMapEngine('esri-dark');
                                    setShowLayerMenu(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                                    mapEngine === 'esri-dark'
                                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                        : 'text-slate-300 hover:bg-slate-800'
                                }`}
                            >
                                <div>
                                    <span>Esri Dark Gray (Default Radar)</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">ArcGIS Dark Canvas · Zero Watermarks</span>
                                </div>
                                {mapEngine === 'esri-dark' && <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />}
                            </button>

                            <button
                                onClick={() => {
                                    setMapEngine('mappls');
                                    setShowLayerMenu(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                                    mapEngine === 'mappls'
                                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                        : 'text-slate-300 hover:bg-slate-800'
                                }`}
                            >
                                <div>
                                    <span>MapmyIndia Mappls</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">Vector Maps SDK</span>
                                </div>
                                {mapEngine === 'mappls' && <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />}
                            </button>

                            <button
                                onClick={() => {
                                    setMapEngine('esri-sat');
                                    setShowLayerMenu(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                                    mapEngine === 'esri-sat'
                                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                        : 'text-slate-300 hover:bg-slate-800'
                                }`}
                            >
                                <div>
                                    <span>Satellite Imagery</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">Esri High-Resolution World Photo</span>
                                </div>
                                {mapEngine === 'esri-sat' && <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />}
                            </button>

                            <button
                                onClick={() => {
                                    setMapEngine('osm');
                                    setShowLayerMenu(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                                    mapEngine === 'osm'
                                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                        : 'text-slate-300 hover:bg-slate-800'
                                }`}
                            >
                                <div>
                                    <span>OpenStreetMap Standard</span>
                                    <span className="block text-[10px] text-slate-400 font-normal">Global Street & Landmark Grid</span>
                                </div>
                                {mapEngine === 'osm' && <CheckCircle2 size={13} className="text-cyan-400 shrink-0" />}
                            </button>
                        </div>
                    )}
                </div>

                {/* Map & License Settings Button */}
                <button
                    onClick={() => {
                        setShowKeyModal(true);
                        testMapmyIndiaKey();
                    }}
                    className="p-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                    title="MapmyIndia License & Key Settings"
                >
                    <Settings size={16} />
                </button>
            </div>

            {/* Map Rendering Container */}
            {mapEngine === 'mappls' ? (
                <div
                    ref={mapplsContainerRef}
                    id="mappls-map-canvas"
                    className="h-full w-full bg-slate-900"
                />
            ) : (
                <MapContainer
                    center={defaultCenter}
                    zoom={4}
                    maxZoom={19}
                    style={{ height: '100%', width: '100%', background: '#0a0e17' }}
                    zoomControl={false}
                >
                    {/* Zero-Watermark Dynamic Tile Layers */}
                    {mapEngine === 'esri-sat' ? (
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                            maxZoom={19}
                        />
                    ) : mapEngine === 'osm' ? (
                        <TileLayer
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            maxZoom={19}
                        />
                    ) : (
                        <>
                            {/* Esri World Dark Gray Base (Clean dark vector background, NO watermarks!) */}
                            <TileLayer
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                                attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Dark Gray Canvas'
                                maxZoom={19}
                                maxNativeZoom={16}
                            />
                            {/* Reference Labels Layer */}
                            <TileLayer
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                                maxZoom={19}
                                maxNativeZoom={16}
                            />
                        </>
                    )}

                    <MapController selectedCoords={selectedUser} />

                    {/* Interactive Tactical Markers */}
                    {filteredUsers.map((user) => (
                        <Marker
                            key={user.userId || user.uid}
                            position={[user.lat, user.lng]}
                            icon={createAvatarIcon(user)}
                            eventHandlers={{
                                click: () => setSelectedUser(user)
                            }}
                        >
                            <Popup className="tactical-popup">
                                <div className="p-3 bg-slate-900 text-white rounded-xl font-sans min-w-[220px]">
                                    <div className="flex items-center gap-3 mb-2.5 pb-2.5 border-b border-slate-800">
                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-cyan-400 shrink-0">
                                            <img
                                                src={user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.userId}`}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-xs text-cyan-400 truncate uppercase">
                                                {user.displayName || 'Anonymous'}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 text-[10px] text-slate-300">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-semibold uppercase">Status:</span>
                                            <span className={user.isOnline ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                                {user.isOnline ? '● Online' : '○ Offline'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-semibold uppercase">Coordinates:</span>
                                            <span className="font-mono text-cyan-300">
                                                {user.lat.toFixed(4)}, {user.lng.toFixed(4)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-semibold uppercase">Terminal:</span>
                                            <span className="truncate max-w-[120px]">{user.platform || 'Web Browser'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-semibold uppercase">Live Telemetry:</span>
                                            <span>{user.updatedAt ? format(new Date(user.updatedAt), 'HH:mm:ss') : 'Just now'}</span>
                                        </div>
                                    </div>

                                    <a
                                        href={`https://www.google.com/maps?q=${user.lat},${user.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 w-full py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors border border-cyan-500/40"
                                    >
                                        <ExternalLink size={12} />
                                        <span>Satellite View</span>
                                    </a>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            )}

            {/* Smart Responsive Tactical Drawer */}
            <div
                className={`absolute top-3 left-3 bottom-3 z-[1000] w-72 sm:w-80 max-w-[calc(100vw-24px)] bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 overflow-hidden ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+24px)] pointer-events-none'
                }`}
            >
                {/* Drawer Header */}
                <div className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="font-bold text-xs tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                            Location Radar
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            {onlineCount} active nodes / {locations.length} tracked
                        </p>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={fetchLocations}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Force Radar Sync"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Close drawer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Search Bar (Generous padding so icon never overlaps text) */}
                <div className="p-3 border-b border-slate-800 shrink-0">
                    <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="Filter tracked nodes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                    </div>
                </div>

                {/* Nodes List */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar p-2 space-y-1">
                    {filteredUsers.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 text-xs px-4">
                            {locations.length === 0
                                ? 'No user GPS coordinates recorded yet. Ensure client location services are enabled.'
                                : 'No matching nodes found.'}
                        </div>
                    ) : (
                        filteredUsers.map((user) => (
                            <div
                                key={user.userId || user.uid}
                                onClick={() => handleSelectNode(user)}
                                className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                    selectedUser?.userId === user.userId
                                        ? 'bg-cyan-950/50 border border-cyan-500/50 text-white'
                                        : 'hover:bg-slate-800/60 text-slate-300'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-700 shrink-0">
                                        <img
                                            src={user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.userId}`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                        <div
                                            className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-slate-900 ${
                                                user.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                                            }`}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate text-slate-200">
                                            {user.displayName || 'User'}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono truncate">
                                            {user.lat.toFixed(2)}, {user.lng.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectNode(user);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
                                    title="Lock-On to coordinates"
                                >
                                    <Crosshair size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Sync Time & Telemetry Status */}
                <div className="p-3 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between items-center shrink-0">
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Realtime GPS Feed
                    </span>
                    <span>{format(lastSync, 'HH:mm:ss')}</span>
                </div>
            </div>

            {/* Floating Open Drawer Button (Shown when drawer is closed) */}
            {!sidebarOpen && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="absolute top-3 left-3 z-[1000] px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md text-cyan-400 border border-slate-800 rounded-xl transition-all shadow-xl flex items-center gap-2 text-xs font-semibold"
                    title="Open tracked nodes list"
                >
                    <MapPin size={15} />
                    <span>Tracked Nodes ({locations.length})</span>
                </button>
            )}

            {/* MapmyIndia Key & License Settings Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400">
                                    <Globe size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-100">MapmyIndia License & Key</h3>
                                    <p className="text-[11px] text-slate-400">Manage geospatial radar provider credentials</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowKeyModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Status Analysis Box */}
                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400 font-medium">Configured Key:</span>
                                <span className="font-mono text-cyan-300 text-[11px] truncate max-w-[200px]">{mmiKey || 'None'}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400 font-medium">Server API Status:</span>
                                <span className={`font-semibold ${
                                    mmiTestStatus?.testing ? 'text-amber-400' :
                                    mmiTestStatus?.valid ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                    {mmiTestStatus?.testing ? 'Verifying...' :
                                     mmiTestStatus?.valid ? '● Active & Valid' :
                                     mmiTestStatus?.error ? `● ${mmiTestStatus.error}` : '● Expired / Unauthorized'}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400 font-medium">Active Radar Fallback:</span>
                                <span className="text-emerald-400 font-semibold">● Esri Dark Recon (Watermark-Free)</span>
                            </div>
                        </div>

                        {/* Key Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                                <span>Update MapmyIndia / Mappls Key</span>
                                <a
                                    href="https://platform.mappls.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                                >
                                    <span>Get Key</span>
                                    <ExternalLink size={10} />
                                </a>
                            </label>
                            <input
                                type="text"
                                value={inputKey}
                                onChange={(e) => setInputKey(e.target.value)}
                                placeholder="Paste Mappls API key..."
                                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => testMapmyIndiaKey(inputKey)}
                                disabled={mmiTestStatus?.testing}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <RefreshCw size={13} className={mmiTestStatus?.testing ? 'animate-spin' : ''} />
                                <span>Test Key</span>
                            </button>
                            <button
                                onClick={() => {
                                    handleSaveKey();
                                    setShowKeyModal(false);
                                }}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                                <Check size={14} />
                                <span>Save & Activate</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GodMap;
