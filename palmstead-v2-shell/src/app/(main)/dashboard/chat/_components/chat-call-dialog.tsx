// Real WebRTC call UI (13-chat-whatsapp-grade-rebuild.md) -- outgoing/
// incoming/connected states for a real 1:1 audio or video call, signaled
// over Supabase Broadcast (use-call.ts). No TURN relay: STUN-only, per the
// user's explicit choice, so a call can fail to connect on especially
// strict NATs -- that limitation surfaces here as a real "Call ended"
// state, not a silent hang.
"use client";

import { useEffect, useRef } from "react";

import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getInitials } from "@/lib/utils";

import type { CallState } from "./use-call";

export function ChatCallDialog({ call }: { call: CallState }) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
  }, [call.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = call.remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream]);

  const open = call.phase !== "idle";
  if (!open) return null;

  const isVideo = call.kind === "video";
  const title =
    call.phase === "incoming"
      ? `Incoming ${isVideo ? "video" : "voice"} call from ${call.partnerName}`
      : call.phase === "outgoing"
        ? `Calling ${call.partnerName}…`
        : call.phase === "connected"
          ? `${isVideo ? "Video" : "Voice"} call with ${call.partnerName}`
          : "Call ended";

  return (
    <Dialog open={open}>
      <DialogContent className="flex max-w-sm flex-col items-center gap-6 border-none bg-card/95 py-10 text-center backdrop-blur [&>button]:hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {isVideo && call.phase === "connected" ? (
          <div className="relative w-full overflow-hidden rounded-xl bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full object-cover" />
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute right-2 bottom-2 h-20 w-14 rounded-md border border-border object-cover" />
          </div>
        ) : (
          <Avatar className="size-24">
            <AvatarFallback className="bg-muted text-foreground text-2xl">{getInitials(call.partnerName ?? "")}</AvatarFallback>
          </Avatar>
        )}

        <audio ref={remoteAudioRef} autoPlay className="hidden" />

        <div className="space-y-1">
          <div className="font-medium text-lg">{call.partnerName}</div>
          <div className="text-muted-foreground text-sm">
            {call.phase === "incoming" && `Incoming ${isVideo ? "video" : "voice"} call…`}
            {call.phase === "outgoing" && "Ringing…"}
            {call.phase === "connected" && (isVideo ? "Video call" : "Voice call")}
            {call.phase === "ended" && "Call ended"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {call.phase === "incoming" && (
            <>
              <Button type="button" size="icon" variant="destructive" className="size-14 rounded-full" aria-label="Decline call" onClick={call.rejectCall}>
                <PhoneOff />
              </Button>
              <Button type="button" size="icon" className="size-14 rounded-full bg-emerald-600 text-white hover:bg-emerald-600/90" aria-label="Accept call" onClick={() => void call.acceptCall()}>
                <Phone />
              </Button>
            </>
          )}

          {(call.phase === "outgoing" || call.phase === "connected") && (
            <>
              {call.phase === "connected" && (
                <Button type="button" size="icon" variant="outline" className="size-12 rounded-full" aria-label={call.muted ? "Unmute" : "Mute"} onClick={call.toggleMute}>
                  {call.muted ? <MicOff /> : <Mic />}
                </Button>
              )}
              {call.phase === "connected" && isVideo && (
                <Button type="button" size="icon" variant="outline" className="size-12 rounded-full" aria-label={call.cameraOff ? "Turn camera on" : "Turn camera off"} onClick={call.toggleCamera}>
                  {call.cameraOff ? <VideoOff /> : <Video />}
                </Button>
              )}
              <Button type="button" size="icon" variant="destructive" className="size-14 rounded-full" aria-label="Hang up" onClick={call.hangUp}>
                <PhoneOff />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
