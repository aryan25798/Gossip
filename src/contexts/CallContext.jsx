import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../supabase';
import { soundService } from '../services/SoundService';
import CallOverlay from '../components/CallOverlay';
import { getIceServers, fetchMeteredCredentials, getMediaConstraints, getIceConfigSummary } from '../utils/webrtcConfig';

const CallContext = createContext(null);

export function useCall() {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
}

// Re-export getIceServers and summary for external testing & diagnostics
export { getIceServers, fetchMeteredCredentials, getIceConfigSummary };

export function CallProvider({ children }) {
    const { currentUser } = useAuth();

    // Pre-fetch dynamic TURN credentials on mount
    useEffect(() => {
        fetchMeteredCredentials();
    }, []);

    // Call state: { id, dbId, otherUser, isCaller, isIncoming, type, status, activeLocalStream, activeRemoteStream, connectionState, networkQuality, candidateType, startTime }
    const [callState, setCallState] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [facingMode, setFacingMode] = useState('user');

    // WebRTC & Audio/Video Refs
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Signaling & Timer Refs
    const personalChannelRef = useRef(null);
    const signalingChannelsRef = useRef(new Map());
    const sendQueueRef = useRef(new Map());
    const subscribedChannelsRef = useRef(new Set());
    const ringingTimeoutRef = useRef(null);
    const statsIntervalRef = useRef(null);
    const bufferedCandidatesRef = useRef([]);
    const isEndingRef = useRef(false);
    const currentCallStateRef = useRef(null);

    // Keep currentCallStateRef synchronized with state for callbacks
    useEffect(() => {
        currentCallStateRef.current = callState;
    }, [callState]);

    /**
     * Helper to send Supabase Realtime broadcast message to target peer
     */
    const sendSignalingMessage = useCallback((targetUserId, eventName, payload) => {
        if (!targetUserId) return;
        const channelName = `calls_${targetUserId}`;
        let chan = signalingChannelsRef.current.get(channelName);

        const msg = {
            type: 'broadcast',
            event: eventName,
            payload
        };

        if (!chan) {
            chan = supabase.channel(channelName);
            signalingChannelsRef.current.set(channelName, chan);

            if (!sendQueueRef.current.has(channelName)) {
                sendQueueRef.current.set(channelName, []);
            }
            sendQueueRef.current.get(channelName).push(msg);

            chan.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    subscribedChannelsRef.current.add(channelName);
                    const queue = sendQueueRef.current.get(channelName) || [];
                    while (queue.length > 0) {
                        const nextMsg = queue.shift();
                        chan.send(nextMsg).catch(err => {
                            console.error(`[CallSignaling] Error sending queued ${nextMsg.event}:`, err);
                        });
                    }
                }
            });
            return;
        }

        if (chan.state === 'joined' || subscribedChannelsRef.current.has(channelName)) {
            chan.send(msg).catch(err => {
                console.error(`[CallSignaling] Error sending ${eventName}:`, err);
            });
        } else {
            let queue = sendQueueRef.current.get(channelName);
            if (!queue) {
                queue = [];
                sendQueueRef.current.set(channelName, queue);
            }
            queue.push(msg);
        }
    }, []);

    /**
     * Complete resource cleanup for active WebRTC connections and streams
     */
    const cleanupResources = useCallback(() => {
        // Clear ringing and stats timers
        if (ringingTimeoutRef.current) {
            clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
        }
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }

        // Stop all sound synthesizer loops
        soundService.stop();

        // Stop local camera and microphone media tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                track.stop();
            });
            localStreamRef.current = null;
        }

        // Release remote tracks
        if (remoteStreamRef.current) {
            remoteStreamRef.current.getTracks().forEach(track => track.stop());
            remoteStreamRef.current = null;
        }

        // Detach video elements
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

        // Close and clean up RTCPeerConnection
        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        bufferedCandidatesRef.current = [];
        setIsMuted(false);
        setIsVideoEnabled(true);
        setFacingMode('user');
    }, []);

    /**
     * Terminate call, update database log, notify peer, and release resources
     */
    const endCall = useCallback(async (reason = 'normal') => {
        if (isEndingRef.current) return;
        isEndingRef.current = true;

        const currentCall = currentCallStateRef.current;
        soundService.play('end');

        if (currentCall) {
            const targetId = currentCall.otherUser?.id || currentCall.otherUser?.uid;
            const duration = currentCall.startTime ? Math.max(1, Math.round((Date.now() - currentCall.startTime) / 1000)) : 0;

            // Notify peer via Realtime
            if (targetId) {
                sendSignalingMessage(targetId, 'call_ended', {
                    callId: currentCall.id,
                    reason
                });
            }

            // Update database call record if exists
            if (currentCall.dbId) {
                try {
                    await supabase
                        .from('calls')
                        .update({
                            status: currentCall.status === 'connected' ? 'ended' : 'cancelled',
                            duration: duration
                        })
                        .eq('id', currentCall.dbId);
                } catch (e) {
                    console.warn('[CallContext] Failed to update call log duration:', e);
                }
            }
        }

        cleanupResources();
        setCallState(null);
        setTimeout(() => {
            isEndingRef.current = false;
        }, 500);
    }, [cleanupResources, sendSignalingMessage]);

    /**
     * Reject incoming call
     */
    const rejectCall = useCallback(async () => {
        const currentCall = currentCallStateRef.current;
        if (!currentCall) return;

        soundService.stop();
        soundService.play('end');

        const targetId = currentCall.otherUser?.id || currentCall.otherUser?.uid;
        if (targetId) {
            sendSignalingMessage(targetId, 'call_rejected', {
                callId: currentCall.id
            });
        }

        if (currentCall.dbId) {
            try {
                await supabase
                    .from('calls')
                    .update({ status: 'rejected', duration: 0 })
                    .eq('id', currentCall.dbId);
            } catch (e) {
                console.warn('[CallContext] Error updating rejected call:', e);
            }
        }

        cleanupResources();
        setCallState(null);
    }, [cleanupResources, sendSignalingMessage]);

    /**
     * Create and initialize RTCPeerConnection with STUN/TURN servers
     */
    const createPeerConnection = useCallback((targetUserId, callId) => {
        const iceServers = getIceServers();
        const pc = new RTCPeerConnection({
            iceServers,
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });

        // 1. ICE Candidate Handler
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignalingMessage(targetUserId, 'ice_candidate', {
                    callId,
                    candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
                });
            }
        };

        // 2. Remote Track Handler
        pc.ontrack = (event) => {
            console.log('[WebRTC] Remote track received:', event.track.kind);
            if (!remoteStreamRef.current) {
                remoteStreamRef.current = new MediaStream();
            }

            // Add track to remote stream
            remoteStreamRef.current.addTrack(event.track);

            // Attach to video element
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
                remoteVideoRef.current.srcObject = remoteStreamRef.current;
                remoteVideoRef.current.play().catch(e => console.warn('Remote video play:', e));
            }

            // Attach to audio element
            if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
                remoteAudioRef.current.srcObject = remoteStreamRef.current;
                remoteAudioRef.current.play().catch(e => console.warn('Remote audio play:', e));
            }

            setCallState(prev => prev ? { ...prev, activeRemoteStream: remoteStreamRef.current } : null);
        };

        // 3. Connection State Change Monitor
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log('[WebRTC] Connection state change:', state);

            setCallState(prev => {
                if (!prev) return null;
                return { ...prev, connectionState: state };
            });

            if (state === 'connected') {
                soundService.stop();
                if (ringingTimeoutRef.current) {
                    clearTimeout(ringingTimeoutRef.current);
                    ringingTimeoutRef.current = null;
                }
            } else if (state === 'failed') {
                console.warn('[WebRTC] Connection failed. Attempting ICE restart...');
                // Trigger ICE restart offer if caller
                if (currentCallStateRef.current?.isCaller) {
                    pc.createOffer({ iceRestart: true })
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            sendSignalingMessage(targetUserId, 'call_reconnect', {
                                callId,
                                offerSdp: pc.localDescription
                            });
                        })
                        .catch(err => {
                            console.error('[WebRTC] ICE restart failed:', err);
                            endCall('connection_failed');
                        });
                }
            } else if (state === 'closed') {
                cleanupResources();
                setCallState(null);
            }
        };

        // 4. ICE Connection State Monitor (Fallback diagnostics)
        pc.oniceconnectionstatechange = () => {
            const iceState = pc.iceConnectionState;
            console.log('[WebRTC] ICE connection state:', iceState);
            if (iceState === 'disconnected') {
                setCallState(prev => prev ? { ...prev, connectionState: 'reconnecting' } : null);
            }
        };

        pcRef.current = pc;
        return pc;
    }, [endCall, cleanupResources, sendSignalingMessage]);

    /**
     * Start WebRTC network statistics polling
     */
    const startStatsPolling = useCallback(() => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

        statsIntervalRef.current = setInterval(async () => {
            const pc = pcRef.current;
            if (!pc || pc.connectionState !== 'connected') return;

            try {
                const stats = await pc.getStats();
                let candidatePairType = 'direct';
                let currentRtt = 0;

                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        currentRtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : 0;
                        const remoteCandidate = stats.get(report.remoteCandidateId);
                        const localCandidate = stats.get(report.localCandidateId);

                        if (localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay') {
                            candidatePairType = 'relay';
                        }
                    }
                });

                const quality = currentRtt > 400 ? 'poor' : currentRtt > 180 ? 'fair' : 'good';
                setCallState(prev => {
                    if (!prev || prev.status !== 'connected') return prev;
                    return {
                        ...prev,
                        networkQuality: quality,
                        candidateType: candidatePairType,
                        rtt: currentRtt
                    };
                });
            } catch (e) {
                // Ignore stats errors during renegotiation
            }
        }, 2000);
    }, []);

    /**
     * Start an Outgoing Call (Voice or Video)
     */
    const startCall = useCallback(async (user, type = 'video') => {
        if (currentCallStateRef.current) {
            console.warn('[Call] Already in an active call session.');
            return;
        }

        const targetId = user.id || user.uid;
        const currentUserId = currentUser.id || currentUser.uid;
        if (!targetId || !currentUserId) {
            alert('Cannot initiate call: missing participant ID.');
            return;
        }

        const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        console.log(`[Call] Initiating ${type} call to ${targetId} (Call ID: ${callId})`);

        // 1. Acquire Local Media
        let localStream;
        let callType = type === 'audio' ? 'voice' : type;

        try {
            const constraints = getMediaConstraints(callType);
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr) {
            console.warn('[Call] Initial media capture failed:', mediaErr);
            if (callType === 'video') {
                // Fall back gracefully to audio if camera is blocked/busy
                try {
                    console.log('[Call] Camera unavailable, attempting voice-only fallback...');
                    localStream = await navigator.mediaDevices.getUserMedia(getMediaConstraints('voice'));
                    callType = 'voice';
                } catch (audioErr) {
                    alert('Microphone and camera access were denied or unavailable.');
                    return;
                }
            } else {
                alert('Microphone access was denied or unavailable.');
                return;
            }
        }

        localStreamRef.current = localStream;

        // 2. Create Database Call Record in Supabase
        let dbId = null;
        try {
            const { data: callRow, error: dbErr } = await supabase.from('calls').insert({
                caller_id: currentUserId,
                receiver_id: targetId,
                caller_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                receiver_name: user.displayName || user.name || 'User',
                caller_photo: currentUser.avatar_url || currentUser.photoURL,
                receiver_photo: user.avatar_url || user.photoURL,
                type: callType,
                status: 'ringing',
                duration: 0
            }).select().single();

            if (!dbErr && callRow) {
                dbId = callRow.id;
            }
        } catch (dbErr) {
            console.warn('[Call] Supabase call record insert error:', dbErr);
        }

        // 3. Set Initial Outgoing State
        setCallState({
            id: callId,
            dbId,
            otherUser: {
                id: targetId,
                uid: targetId,
                displayName: user.displayName || user.name || 'User',
                photoURL: user.avatar_url || user.photoURL
            },
            isCaller: true,
            isIncoming: false,
            type: callType,
            status: 'dialing',
            activeLocalStream: localStream,
            activeRemoteStream: null,
            connectionState: 'new',
            networkQuality: 'good',
            startTime: null
        });

        // 4. Play Dialing Tone
        soundService.play('dialing', true);

        // 5. Initialize WebRTC Peer Connection
        const pc = createPeerConnection(targetId, callId);
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // 6. Create SDP Offer
        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: callType === 'video'
            });
            await pc.setLocalDescription(offer);

            // 7. Send Incoming Call Signal to Recipient via Supabase Realtime
            sendSignalingMessage(targetId, 'incoming_call', {
                callId,
                dbId,
                callerId: currentUserId,
                callerName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                callerPhoto: currentUser.avatar_url || currentUser.photoURL,
                type: callType,
                offerSdp: pc.localDescription
            });
        } catch (offerErr) {
            console.error('[Call] Failed to create or set local SDP offer:', offerErr);
            endCall('offer_creation_failed');
            return;
        }

        // 8. 35-Second Unanswered Call Timeout
        ringingTimeoutRef.current = setTimeout(() => {
            console.log('[Call] Outgoing call timed out (unanswered).');
            if (currentCallStateRef.current?.status === 'dialing' || currentCallStateRef.current?.status === 'ringing') {
                if (dbId) {
                    supabase.from('calls').update({ status: 'missed', duration: 0 }).eq('id', dbId);
                }
                endCall('timeout');
            }
        }, 35000);

    }, [currentUser, createPeerConnection, sendSignalingMessage, endCall]);

    /**
     * Accept an Incoming Call
     */
    const acceptCall = useCallback(async () => {
        const currentCall = currentCallStateRef.current;
        if (!currentCall || !currentCall.isIncoming) return;

        soundService.stop();
        if (ringingTimeoutRef.current) {
            clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
        }

        const targetId = currentCall.otherUser?.id || currentCall.otherUser?.uid;
        const callId = currentCall.id;
        const callType = currentCall.type;

        console.log(`[Call] Answering ${callType} call ${callId} from ${targetId}`);

        // 1. Acquire Local Media
        let localStream;
        try {
            const constraints = getMediaConstraints(callType);
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr) {
            console.warn('[Call] Media capture on answer failed:', mediaErr);
            if (callType === 'video') {
                try {
                    localStream = await navigator.mediaDevices.getUserMedia(getMediaConstraints('voice'));
                } catch (audioErr) {
                    alert('Could not access microphone or camera.');
                    rejectCall();
                    return;
                }
            } else {
                alert('Could not access microphone.');
                rejectCall();
                return;
            }
        }

        localStreamRef.current = localStream;

        // 2. Initialize Peer Connection
        const pc = createPeerConnection(targetId, callId);
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // 3. Set Remote Description (Caller's Offer SDP)
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(currentCall.offerSdp));

            // Flush any ICE candidates received early
            while (bufferedCandidatesRef.current.length > 0) {
                const candidate = bufferedCandidatesRef.current.shift();
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }

            // 4. Create and set Local Answer SDP
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // 5. Update State to Connected
            const now = Date.now();
            setCallState(prev => ({
                ...prev,
                status: 'connected',
                connectionState: 'connected',
                activeLocalStream: localStream,
                startTime: now
            }));

            // Start stats monitoring
            startStatsPolling();

            // 6. Send Answer Signal back to Caller
            sendSignalingMessage(targetId, 'call_answered', {
                callId,
                answerSdp: pc.localDescription
            });

            // 7. Update Supabase Database
            if (currentCall.dbId) {
                supabase.from('calls').update({ status: 'connected' }).eq('id', currentCall.dbId);
            }
        } catch (sdpErr) {
            console.error('[Call] Error during answer negotiation:', sdpErr);
            endCall('negotiation_failed');
        }
    }, [createPeerConnection, sendSignalingMessage, startStatsPolling, rejectCall, endCall]);

    /**
     * Mute / Unmute Microphone
     */
    const toggleMute = useCallback(() => {
        if (!localStreamRef.current) return;
        const newMuted = !isMuted;
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !newMuted;
        });
        setIsMuted(newMuted);
    }, [isMuted]);

    /**
     * Enable / Disable Camera Video
     */
    const toggleVideo = useCallback(() => {
        if (!localStreamRef.current) return;
        const newVideoEnabled = !isVideoEnabled;
        localStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = newVideoEnabled;
        });
        setIsVideoEnabled(newVideoEnabled);
    }, [isVideoEnabled]);

    /**
     * Flip Camera between Front ('user') and Rear ('environment') on Mobile
     */
    const switchCamera = useCallback(async () => {
        if (!localStreamRef.current || !pcRef.current) return;
        const currentTrack = localStreamRef.current.getVideoTracks()[0];
        if (!currentTrack) return;

        const nextFacing = facingMode === 'user' ? 'environment' : 'user';

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { exact: nextFacing } }
            });
            const newTrack = newStream.getVideoTracks()[0];

            // Replace track in RTCPeerConnection sender
            const senders = pcRef.current.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(newTrack);
            }

            // Replace in local stream
            localStreamRef.current.removeTrack(currentTrack);
            currentTrack.stop();
            localStreamRef.current.addTrack(newTrack);

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }

            setFacingMode(nextFacing);
        } catch (err) {
            console.warn('[Call] Camera switch failed (single camera device or unsupported facing mode):', err);
        }
    }, [facingMode]);

    /**
     * Supabase Realtime Signaling Listener for Current User
     */
    useEffect(() => {
        const userId = currentUser?.id || currentUser?.uid;
        if (!userId) return;

        console.log(`[CallSignaling] Subscribing to personal call channel: calls_${userId}`);
        const channel = supabase.channel(`calls_${userId}`);
        personalChannelRef.current = channel;

        channel
            // 1. Incoming Call Invitation
            .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
                console.log('[CallSignaling] Incoming call received:', payload);

                // If user is already on a call, reject with busy signal
                if (currentCallStateRef.current) {
                    console.warn('[CallSignaling] Already in an active call. Replying with busy.');
                    sendSignalingMessage(payload.callerId, 'call_busy', { callId: payload.callId });
                    return;
                }

                // Play Ringtone
                soundService.play('ringtone', true);

                setCallState({
                    id: payload.callId,
                    dbId: payload.dbId,
                    otherUser: {
                        id: payload.callerId,
                        uid: payload.callerId,
                        displayName: payload.callerName || 'User',
                        photoURL: payload.callerPhoto
                    },
                    isCaller: false,
                    isIncoming: true,
                    type: payload.type || 'video',
                    status: 'ringing',
                    offerSdp: payload.offerSdp,
                    activeLocalStream: null,
                    activeRemoteStream: null,
                    connectionState: 'new',
                    networkQuality: 'good',
                    startTime: null
                });

                // Set 35-second incoming timeout
                ringingTimeoutRef.current = setTimeout(() => {
                    console.log('[Call] Incoming call ringing timed out.');
                    if (currentCallStateRef.current?.status === 'ringing') {
                        soundService.stop();
                        setCallState(null);
                    }
                }, 35000);
            })

            // 2. Caller Receives Answer Signal
            .on('broadcast', { event: 'call_answered' }, async ({ payload }) => {
                console.log('[CallSignaling] Call answered signal received from peer:', payload);
                const pc = pcRef.current;
                if (!pc) return;

                soundService.stop();
                if (ringingTimeoutRef.current) {
                    clearTimeout(ringingTimeoutRef.current);
                    ringingTimeoutRef.current = null;
                }

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.answerSdp));

                    // Apply any early-received buffered ICE candidates
                    while (bufferedCandidatesRef.current.length > 0) {
                        const candidate = bufferedCandidatesRef.current.shift();
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }

                    const now = Date.now();
                    setCallState(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            status: 'connected',
                            connectionState: 'connected',
                            startTime: now
                        };
                    });

                    startStatsPolling();

                    // Update DB record
                    const currentDbId = currentCallStateRef.current?.dbId;
                    if (currentDbId) {
                        supabase.from('calls').update({ status: 'connected' }).eq('id', currentDbId);
                    }
                } catch (err) {
                    console.error('[Call] Error setting remote answer description:', err);
                }
            })

            // 3. ICE Candidate Exchanged
            .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
                const pc = pcRef.current;
                const candidate = payload.candidate;
                if (!candidate) return;

                if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.warn('[WebRTC] Error adding ICE candidate:', e);
                    }
                } else {
                    bufferedCandidatesRef.current.push(candidate);
                }
            })

            // 4. Recipient Rejected Call
            .on('broadcast', { event: 'call_rejected' }, () => {
                console.log('[CallSignaling] Call was rejected by recipient.');
                soundService.stop();
                soundService.play('end');
                cleanupResources();
                setCallState(null);
            })

            // 5. Recipient Busy
            .on('broadcast', { event: 'call_busy' }, () => {
                console.log('[CallSignaling] Recipient is currently busy.');
                soundService.stop();
                soundService.play('end');
                alert('The user is currently on another call.');
                cleanupResources();
                setCallState(null);
            })

            // 6. Peer Ended Call
            .on('broadcast', { event: 'call_ended' }, () => {
                console.log('[CallSignaling] Remote peer ended the call.');
                soundService.stop();
                soundService.play('end');
                cleanupResources();
                setCallState(null);
            })

            // 7. ICE Reconnect Offer
            .on('broadcast', { event: 'call_reconnect' }, async ({ payload }) => {
                console.log('[CallSignaling] ICE restart offer received:', payload);
                const pc = pcRef.current;
                if (!pc || !payload.offerSdp) return;

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.offerSdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    sendSignalingMessage(payload.callerId, 'call_answered', {
                        callId: payload.callId,
                        answerSdp: pc.localDescription
                    });
                } catch (e) {
                    console.error('[Call] ICE restart answer failed:', e);
                }
            })
            .subscribe((status) => {
                console.log(`[CallSignaling] Personal channel status for ${userId}:`, status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, cleanupResources, sendSignalingMessage, startStatsPolling]);

    // Context Value for Consumers
    const value = useMemo(() => ({
        callState,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        isMuted,
        setIsMuted,
        isVideoEnabled,
        setIsVideoEnabled,
        toggleMute,
        toggleVideo,
        switchCamera
    }), [
        callState,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        isMuted,
        isVideoEnabled,
        toggleMute,
        toggleVideo,
        switchCamera
    ]);

    return (
        <CallContext.Provider value={value}>
            {children}

            {/* Hidden audio element ensuring audio streaming for voice & video calls */}
            <audio
                ref={remoteAudioRef}
                autoPlay
                playsInline
                className="hidden"
            />

            {/* Calling Modal Overlay */}
            {callState && (
                <CallOverlay
                    callState={callState}
                    localVideoRef={localVideoRef}
                    remoteVideoRef={remoteVideoRef}
                    onEnd={() => endCall('user_hangup')}
                    onAnswer={acceptCall}
                    onReject={rejectCall}
                    onToggleMute={toggleMute}
                    onToggleVideo={toggleVideo}
                    onSwitchCamera={switchCamera}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                />
            )}
        </CallContext.Provider>
    );
}

export default CallContext;
