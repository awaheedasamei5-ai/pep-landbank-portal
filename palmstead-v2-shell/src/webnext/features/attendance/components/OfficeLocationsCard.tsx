"use client";

import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/submit-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormItem } from '@/components/form-item';
import type { NewOfficeLocation, OfficeLocation } from '../../../types/domain';

// Attendance plan Part 7's open question resolved structurally: real
// office_locations is empty in production, so this is the real Settings
// UI Management uses to add the actual offices themselves. Rebuilt on
// the shell's real Card/Input after the 2026-10-08/09 correction. Every
// active row here is one real geofence the staff check-in screen's own
// haversine match (attendanceGeo.ts) checks against.
export function OfficeLocationsCard({
  locations,
  onCreate,
  onUpdate,
  onRemove,
}: {
  locations: OfficeLocation[];
  onCreate: (input: NewOfficeLocation) => Promise<void>;
  onUpdate: (id: string, patch: Partial<NewOfficeLocation & { isActive: boolean }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('150');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  function useCurrentLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleAdd() {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const radiusNum = Number(radius);
    if (!name.trim() || !Number.isFinite(latNum) || !Number.isFinite(lngNum) || radiusNum <= 0) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), lat: latNum, lng: lngNum, radiusMeters: radiusNum });
      setName('');
      setLat('');
      setLng('');
      setRadius('150');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office locations</CardTitle>
        <CardDescription>Every active location here is a real geofence — a staff sign-in inside its radius counts as &quot;at the office&quot;, outside it requires a reason.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {locations.length > 0 && (
          <div className="grid gap-2">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {loc.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · {loc.radiusMeters}m radius
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={loc.isActive ? 'default' : 'outline'} className="cursor-pointer" onClick={() => onUpdate(loc.id, { isActive: !loc.isActive })}>
                    {loc.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm">
                        Remove
                      </Button>
                    }
                    title={`Remove "${loc.name}"?`}
                    description="Staff will no longer be geofenced to this location."
                    confirmLabel="Remove"
                    onConfirm={() => onRemove(loc.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <FormItem label="Office name" htmlFor="locName">
            <Input id="locName" placeholder="e.g. Head Office" value={name} onChange={(e) => setName(e.target.value)} />
          </FormItem>
          <FormItem label="Radius (m)" htmlFor="locRadius">
            <Input id="locRadius" placeholder="150" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </FormItem>
          <FormItem label="Latitude" htmlFor="locLat">
            <Input id="locLat" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
          </FormItem>
          <FormItem label="Longitude" htmlFor="locLng">
            <Input id="locLng" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
          </FormItem>
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="outline" onClick={useCurrentLocation} disabled={locating}>
              <MapPin />
              {locating ? 'Locating…' : 'Use my location'}
            </Button>
            <SubmitButton type="button" loading={busy} onClick={handleAdd}>
              <Plus />
              Add location
            </SubmitButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
