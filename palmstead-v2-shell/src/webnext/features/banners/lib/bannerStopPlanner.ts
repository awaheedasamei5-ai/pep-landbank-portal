import type { Banner } from "../../../types/domain";
import { validBannerCoordinates } from "./bannerLogic";

export type FieldPoint = { lat: number; lng: number };

export function straightLineKm(a: FieldPoint, b: FieldPoint): number {
  const radians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLng = (b.lng - a.lng) * radians;
  const arc =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function point(banner: Banner): FieldPoint {
  return { lat: banner.lat!, lng: banner.lng! };
}

export function suggestStopOrder(stops: Banner[], start?: FieldPoint): Banner[] {
  const remaining = stops.filter((banner) => validBannerCoordinates(banner.lat, banner.lng));
  if (!remaining.length) return [];
  const ordered: Banner[] = [];
  const first = start ? null : remaining.shift()!;
  let current = start ?? point(first!);
  if (first) ordered.push(first);

  while (remaining.length) {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const distance = straightLineKm(current, point(remaining[i]));
      if (distance < nearestDistance) {
        nearest = i;
        nearestDistance = distance;
      }
    }
    const next = remaining.splice(nearest, 1)[0];
    ordered.push(next);
    current = point(next);
  }
  return ordered;
}

export function stopLegs(stops: Banner[], start?: FieldPoint): { banner: Banner; distanceKm: number | null }[] {
  return stops.map((banner, index) => ({
    banner,
    distanceKm:
      index === 0 && !start ? null : straightLineKm(index === 0 ? start! : point(stops[index - 1]), point(banner)),
  }));
}
