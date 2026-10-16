"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requireSupabase } from "@/lib/supabase.client";

// Real 1:1 WebRTC voice/video calling, signaled over Supabase Realtime
// Broadcast (13-chat-whatsapp-grade-rebuild.md) -- per the user's explicit
// choice: no TURN relay, Google's public STUN server only. Real, named
// limitation: a call between two staff behind especially strict/symmetric
// NATs (common on some corporate networks) can fail to connect; there's no
// relay fallback for that case.
//
// Signaling: every signed-in user with Chat open subscribes to their own
// personal channel `chat-calls-{myKey}` for as long as the Chat screen is
// mounted (not just while a specific thread is open), so an incoming call
// can arrive regardless of which conversation is active. To send, the
// other side opens a transient channel for the *recipient's* personal
// channel name, sends on it, and tears it down with the call.
export type CallKind = "audio" | "video";
export type CallPhase = "idle" | "outgoing" | "incoming" | "connected" | "ended";

interface CallSignal {
  type: "offer" | "answer" | "ice-candidate" | "hangup" | "reject";
  callId: string;
  fromKey: string;
  fromName: string;
  kind?: CallKind;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function personalCallChannel(key: string) {
  return requireSupabase().channel(`chat-calls-${key}`);
}

export interface CallState {
  phase: CallPhase;
  kind: CallKind | null;
  partnerKey: string | null;
  partnerName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (partnerKey: string, partnerName: string, kind: CallKind) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  muted: boolean;
  cameraOff: boolean;
}

export function useCallSignaling(myKey: string | undefined, myName: string | undefined): CallState {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [kind, setKind] = useState<CallKind | null>(null);
  const [partnerKey, setPartnerKey] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const ownChannelRef = useRef<ReturnType<typeof personalCallChannel> | null>(null);
  const peerChannelRef = useRef<ReturnType<typeof personalCallChannel> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<CallSignal | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    if (peerChannelRef.current) {
      requireSupabase().removeChannel(peerChannelRef.current);
      peerChannelRef.current = null;
    }
    callIdRef.current = null;
    pendingOfferRef.current = null;
    queuedCandidatesRef.current = [];
    setMuted(false);
    setCameraOff(false);
  }, []);

  function sendToPeer(targetKey: string, signal: CallSignal) {
    const ch = personalCallChannel(targetKey);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.send({ type: "broadcast", event: "call", payload: signal });
    });
    peerChannelRef.current = ch;
  }

  function createPeerConnection(targetKey: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        sendToPeer(targetKey, { type: "ice-candidate", callId: callIdRef.current, fromKey: myKey as string, fromName: myName ?? "", candidate: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setPhase("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setPhase((p) => (p === "connected" || p === "outgoing" || p === "incoming" ? "ended" : p));
      }
    };
    pcRef.current = pc;
    return pc;
  }

  const startCall = useCallback(
    async (targetKey: string, targetName: string, callKind: CallKind) => {
      if (!myKey) return;
      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      setKind(callKind);
      setPartnerKey(targetKey);
      setPartnerName(targetName);
      setPhase("outgoing");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callKind === "video" });
        localStreamRef.current = stream;
        setLocalStream(stream);
        const pc = createPeerConnection(targetKey);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendToPeer(targetKey, { type: "offer", callId, fromKey: myKey, fromName: myName ?? "", kind: callKind, sdp: offer });
      } catch {
        setPhase("ended");
        cleanup();
      }
    },
    [myKey, myName, cleanup],
  );

  const acceptCall = useCallback(async () => {
    const offerSignal = pendingOfferRef.current;
    if (!offerSignal || !myKey) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: offerSignal.kind === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = createPeerConnection(offerSignal.fromKey);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offerSignal.sdp as RTCSessionDescriptionInit));
      for (const c of queuedCandidatesRef.current) await pc.addIceCandidate(new RTCIceCandidate(c));
      queuedCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendToPeer(offerSignal.fromKey, { type: "answer", callId: offerSignal.callId, fromKey: myKey, fromName: myName ?? "", sdp: answer });
      setPhase("connected");
    } catch {
      setPhase("ended");
      cleanup();
    }
  }, [myKey, myName, cleanup]);

  const rejectCall = useCallback(() => {
    const offerSignal = pendingOfferRef.current;
    if (offerSignal && myKey) {
      sendToPeer(offerSignal.fromKey, { type: "reject", callId: offerSignal.callId, fromKey: myKey, fromName: myName ?? "" });
    }
    setPhase("ended");
    cleanup();
  }, [myKey, myName, cleanup]);

  const hangUp = useCallback(() => {
    if (partnerKey && callIdRef.current && myKey) {
      sendToPeer(partnerKey, { type: "hangup", callId: callIdRef.current, fromKey: myKey, fromName: myName ?? "" });
    }
    setPhase("ended");
    cleanup();
  }, [partnerKey, myKey, myName, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }, [cameraOff]);

  // Always-on listener for incoming calls -- subscribed for the whole time
  // Chat is open, independent of which thread (if any) is active.
  useEffect(() => {
    if (!myKey) return;
    const ch = personalCallChannel(myKey);
    ch.on("broadcast", { event: "call" }, ({ payload }) => {
      const signal = payload as CallSignal;
      if (signal.type === "offer") {
        pendingOfferRef.current = signal;
        callIdRef.current = signal.callId;
        setKind(signal.kind ?? "audio");
        setPartnerKey(signal.fromKey);
        setPartnerName(signal.fromName);
        setPhase("incoming");
      } else if (signal.type === "answer" && signal.callId === callIdRef.current) {
        pcRef.current?.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
      } else if (signal.type === "ice-candidate" && signal.callId === callIdRef.current) {
        if (pcRef.current?.remoteDescription) {
          pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit));
        } else {
          queuedCandidatesRef.current.push(signal.candidate as RTCIceCandidateInit);
        }
      } else if ((signal.type === "hangup" || signal.type === "reject") && signal.callId === callIdRef.current) {
        setPhase("ended");
        cleanup();
      }
    });
    ch.subscribe();
    ownChannelRef.current = ch;
    return () => {
      requireSupabase().removeChannel(ch);
      ownChannelRef.current = null;
    };
  }, [myKey, cleanup]);

  // "ended" is a transient display state (shows "Call ended" briefly) then
  // resets to idle so the call UI closes itself.
  useEffect(() => {
    if (phase !== "ended") return;
    const t = setTimeout(() => {
      setPhase("idle");
      setKind(null);
      setPartnerKey(null);
      setPartnerName(null);
    }, 1500);
    return () => clearTimeout(t);
  }, [phase]);

  return { phase, kind, partnerKey, partnerName, localStream, remoteStream, startCall, acceptCall, rejectCall, hangUp, toggleMute, toggleCamera, muted, cameraOff };
}
