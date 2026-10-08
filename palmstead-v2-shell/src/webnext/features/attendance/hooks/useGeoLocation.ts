"use client";

import { useState, useCallback } from 'react';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { matchOfficeLocation } from '../lib/attendanceGeo';

// Adapted from the approved OSS foundation (mimnets/OpenHRApp's real
// src/hooks/attendance/useGeoLocation.ts) -- real, hard-won error
// handling this app never had: high-accuracy GPS first, automatic
// fallback to network-based location on timeout/unavailable (common
// indoors), and platform-specific guidance (PWA standalone vs browser,
// what to actually go tap in Settings) instead of one generic
// "location failed" message. The office-match itself uses V1's real
// haversine+radius geofence (attendanceGeo.ts), not this repo's
// original approximate lat/lng-degree threshold.
function getLocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case 1:
      return window.matchMedia('(display-mode: standalone)').matches
        ? 'Location blocked. Open your device Settings > Apps > find this app > Permissions > Location > Allow.'
        : 'Location permission denied. Tap the lock icon in your browser address bar and allow Location access, then retry.';
    case 2:
      return 'Location unavailable. Please ensure Location/GPS is turned ON in your device Settings and you are not in airplane mode.';
    case 3:
      return 'Location timed out. Please move to an area with better GPS signal or turn on Wi-Fi for faster location detection, then retry.';
    default:
      return 'Could not detect location. Please check that Location is enabled in your device Settings and try again.';
  }
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

export interface AttendanceLocation {
  lat: number;
  lng: number;
  accuracy: number;
  isAtOffice: boolean;
  officeName: string | null;
}

export function useGeoLocation() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const [location, setLocation] = useState<AttendanceLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectLocation = useCallback(async (force = false) => {
    setIsLocating(true);
    setError(null);
    try {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by this browser. Please use Chrome, Safari, or Firefox.');
        return;
      }
      let pos: GeolocationPosition;
      try {
        pos = await getPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: force ? 0 : 60000 });
      } catch (highAccErr) {
        const code = (highAccErr as GeolocationPositionError).code;
        if (code === 2 || code === 3) {
          pos = await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: force ? 0 : 60000 });
        } else {
          throw highAccErr;
        }
      }
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      let isAtOffice = false;
      let officeName: string | null = null;
      try {
        const offices = await getDataSource(demoMode).officeLocations.list();
        const match = matchOfficeLocation(lat, lng, offices);
        isAtOffice = match.isAtOffice;
        officeName = match.matchedOffice?.name ?? null;
      } catch {
        // No office locations configured yet, or the lookup failed --
        // treat as off-site (safer default: ask for a reason) rather
        // than silently assuming "at the office".
      }
      setLocation({ lat, lng, accuracy, isAtOffice, officeName });
    } catch (err) {
      setError(getLocationErrorMessage(err as GeolocationPositionError));
    } finally {
      setIsLocating(false);
    }
  }, [demoMode]);

  return { location, isLocating, error, detectLocation };
}
