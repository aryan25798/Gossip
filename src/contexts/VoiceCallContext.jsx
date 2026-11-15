import React, { createContext, useContext, useMemo } from 'react';
import { useCall } from './CallContext';

const VoiceCallContext = createContext(null);

export function useVoiceCall() {
    const call = useCall();

    return useMemo(() => ({
        ...call,
        // Start voice call with either startCall or startVoiceCall
        startCall: (user) => call.startCall(user, 'voice'),
        startVoiceCall: (user) => call.startCall(user, 'voice'),
        endVoiceCall: call.endCall,
        voiceCallState: call.callState?.type === 'voice' ? call.callState : null
    }), [call]);
}

/**
 * Transparent pass-through provider.
 * Voice calling is fully unified into CallProvider for single-state WebRTC lifecycle.
 */
export function VoiceCallProvider({ children }) {
    return <>{children}</>;
}

export default VoiceCallContext;
