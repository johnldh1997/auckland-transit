import React from 'react';
import { StyleSheet, View } from 'react-native';

// --- Vehicle Heading Arrows ---
// Wraps a vehicle's badge with a small outlined arrowhead just outside its edge, pointing the
// way the vehicle is heading (AT's `bearing`, degrees clockwise from north). It's deliberately
// a separate arrowhead a few pixels off the badge rather than a pointer attached to it: a
// pointer fused to a rectangle only looks right when it lines up with a straight edge (straight
// up/down/left/right) — at any diagonal it turned into an arrowhead jammed onto a corner. A
// detached arrowhead reads the same at every angle.
// Bearing is snapped to 16 compass buckets so a marker only needs a fresh native bitmap when it
// turns meaningfully (see StableMarker's snapshotKey), not on every tiny GPS wobble.
const BUCKET_COUNT = 16;
const BUCKET_DEGREES = 360 / BUCKET_COUNT;

// Fixed frame so every vehicle marker is the same size regardless of heading — the arrowhead is
// rotated about the frame's center, which is also the badge's center. Must reach the farthest
// an arrowhead's tip or outline can get (~44px from the center for the Home badge).
const FRAME_SIZE = 90;
const ARROW_LENGTH = 13;
const ARROW_HALF_BASE = 10;
// Thickness of the white outline around the arrowhead, so it stays readable on any map colour.
const OUTLINE = 2.5;
// Space between the badge's edge and the arrowhead's base.
const GAP = 4;

// The badge's size, so the arrowhead can sit at a steady distance from its edge in any
// direction. `round` is for a circular badge, where every direction is `width / 2` from the
// center; otherwise `radius` is the corner radius of a rounded rectangle.
export interface BadgeShape {
  width: number;
  height: number;
  radius?: number;
  round?: boolean;
}

// Returns undefined when the feed gave no usable bearing, in which case no arrow is drawn.
export function bearingBucket(bearing: number | undefined): number | undefined {
  if (bearing === undefined || !Number.isFinite(bearing)) return undefined;
  const normalized = ((bearing % 360) + 360) % 360;
  return Math.round(normalized / BUCKET_DEGREES) % BUCKET_COUNT;
}

const edgeDistanceCache = new Map<string, number>();

// Distance from the badge's center to its edge along a heading. For a rounded rectangle it walks
// out along the ray until it leaves the shape (bisecting on the shape's signed distance
// function) — a plain rectangle formula would put the arrowhead too close at the rounded
// corners. Cached: there are only 16 headings per badge shape.
function edgeDistance(degrees: number, { width, height, radius = 0, round }: BadgeShape): number {
  if (round) return width / 2;
  const key = `${degrees}|${width}|${height}|${radius}`;
  const cached = edgeDistanceCache.get(key);
  if (cached !== undefined) return cached;

  const r = Math.min(radius, width / 2, height / 2);
  const innerX = width / 2 - r;
  const innerY = height / 2 - r;
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const signedDistance = (t: number) => {
    const x = Math.abs(dx * t) - innerX;
    const y = Math.abs(dy * t) - innerY;
    return Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - r;
  };

  let low = 0;
  let high = Math.max(width, height);
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (signedDistance(mid) < 0) low = mid;
    else high = mid;
  }
  edgeDistanceCache.set(key, low);
  return low;
}

// One upward-pointing triangle, positioned in the unrotated frame and swung into place by the
// layer's rotation. `baseY` is the y of its flat base; the tip is `length` above it.
function ArrowheadLayer({
  degrees,
  baseY,
  length,
  halfBase,
  color,
}: {
  degrees: number;
  baseY: number;
  length: number;
  halfBase: number;
  color: string;
}) {
  return (
    <View style={[styles.layer, { transform: [{ rotate: `${degrees}deg` }] }]}>
      <View
        style={[
          styles.triangle,
          {
            top: baseY - length,
            left: FRAME_SIZE / 2 - halfBase,
            borderLeftWidth: halfBase,
            borderRightWidth: halfBase,
            borderBottomWidth: length,
            borderBottomColor: color,
          },
        ]}
      />
    </View>
  );
}

interface Props {
  bearing?: number;
  // The badge's own colour, so the arrowhead reads as belonging to it.
  arrowColor: string;
  badge: BadgeShape;
  children: React.ReactNode;
}

export default function HeadingArrowBadge({ bearing, arrowColor, badge, children }: Props) {
  const bucket = bearingBucket(bearing);

  return (
    <View style={styles.frame}>
      {bucket !== undefined && (
        <Arrowhead degrees={bucket * BUCKET_DEGREES} badge={badge} color={arrowColor} />
      )}
      {children}
    </View>
  );
}

// A white outline copy sits just behind and slightly larger than the coloured arrowhead.
function Arrowhead({ degrees, badge, color }: { degrees: number; badge: BadgeShape; color: string }) {
  const baseY = FRAME_SIZE / 2 - (edgeDistance(degrees, badge) + GAP);
  return (
    <>
      <ArrowheadLayer
        degrees={degrees}
        baseY={baseY + 1.5}
        length={ARROW_LENGTH + 4}
        halfBase={ARROW_HALF_BASE + OUTLINE}
        color="#FFFFFF"
      />
      <ArrowheadLayer degrees={degrees} baseY={baseY} length={ARROW_LENGTH} halfBase={ARROW_HALF_BASE} color={color} />
    </>
  );
}

const styles = StyleSheet.create({
  frame: { width: FRAME_SIZE, height: FRAME_SIZE, alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // The classic border trick: a zero-size box whose bottom border is a triangle.
  triangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
