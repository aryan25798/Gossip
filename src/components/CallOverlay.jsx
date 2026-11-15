import React from "react";
import ActiveCall from "./call/ActiveCall";
import ActiveVoiceCall from "./call/ActiveVoiceCall";
import IncomingCall from "./call/IncomingCall";
import OutgoingCall from "./call/OutgoingCall";

const CallOverlay = ({
    callState,
    localVideoRef,
    remoteVideoRef,
    onEnd,
    onAnswer,
    onReject,
    onToggleMute,
    onToggleVideo,
    onSwitchCamera,
    isMuted,
    isVideoEnabled,
}) => {
    if (!callState) return null;

    const { status, isIncoming, type } = callState;

    if (status === "ringing" || status === "dialing") {
        if (isIncoming) {
            return (
                <IncomingCall
                    callState={callState}
                    onAnswer={onAnswer}
                    onReject={onReject || onEnd}
                />
            );
        } else {
            return (
                <OutgoingCall
                    callState={callState}
                    onEnd={onEnd}
                />
            );
        }
    }

    if (status === "connected") {
        // Voice / Audio Call Layout
        if (type === 'voice' || type === 'audio') {
            return (
                <ActiveVoiceCall
                    callState={callState}
                    onEnd={onEnd}
                    onToggleMute={onToggleMute}
                    onToggleSpeaker={() => {}}
                    isMuted={isMuted}
                    isSpeakerOn={true}
                    activeRemoteStream={callState.activeRemoteStream || (remoteVideoRef?.current?.srcObject)}
                />
            );
        }

        // Video Call Layout
        return (
            <ActiveCall
                callState={callState}
                localVideoRef={localVideoRef}
                remoteVideoRef={remoteVideoRef}
                onEnd={onEnd}
                onToggleMute={onToggleMute}
                onToggleVideo={onToggleVideo}
                onSwitchCamera={onSwitchCamera}
                isMuted={isMuted}
                isVideoEnabled={isVideoEnabled}
                activeLocalStream={callState.activeLocalStream || localVideoRef?.current?.srcObject}
                activeRemoteStream={callState.activeRemoteStream || remoteVideoRef?.current?.srcObject}
                networkQuality={callState.networkQuality || 'good'}
            />
        );
    }

    // Connecting / Transitional State
    return (
        <div className="fixed inset-0 bg-[#111b21] z-[99999] flex flex-col items-center justify-center text-white font-sans select-none">
            <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-emerald-400 font-semibold text-sm">Connecting call...</p>
        </div>
    );
};

export default CallOverlay;
