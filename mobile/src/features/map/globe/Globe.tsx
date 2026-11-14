/**
 * The globe (docs/ui-refresh step 1, frame 2): the Map tab zoomed out past the world.
 *
 * The world is drawn once into a flat picture (texture.ts) and a small shader wraps it onto a
 * sphere, so turning costs the same however detailed the shapes are. Country names and friends'
 * markers are drawn over it at their projected points, on the facing side only. A drag turns it on
 * both axes (with momentum), a pinch resizes it, and pinching in far enough hands back to the flat
 * map at the place under the fingers (a double tap does the same at the place tapped). A tap on a country opens its sheet; press and hold opens the
 * quick mark. Nothing is fetched.
 */

import { BlurMask, Canvas, createPicture, Fill, FilterMode, ImageShader, matchFont, MipmapMode, Oval, PaintStyle, Picture, Shader, Skia, type SkFont } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withDecay } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Visit } from '../../../types';
import type { ResolvedMapTheme } from '../../mapThemes/resolve';
import { COUNTRY_LABELS } from '../geoData';
import { countryAt } from './countryAt';
import { clampTilt, equivalentZoom, HAND_BACK_SCALE, MIN_SCALE, project, restingView, unproject, wrapLon, type GlobeView } from './projection';
import { TEXTURE, worldTexture } from './texture';

const RAD = Math.PI / 180;

const SHADER = Skia.RuntimeEffect.Make(`
uniform shader map;
uniform float2 center;
uniform float radius;
uniform float lon0;
uniform float lat0;
uniform float2 size;
uniform float4 glow;

const float PI = 3.14159265;

half4 main(float2 p) {
  float2 d = (p - center) / radius;
  float r = length(d);
  half4 halo = half4(half3(glow.rgb), 1.0) * half(glow.a * (1.0 - smoothstep(1.0, 1.045, r)));
  if (r >= 1.0) return halo;
  float z = sqrt(1.0 - r * r);
  float y = -d.y;
  float c = cos(lat0);
  float s = sin(lat0);
  float y1 = y * c + z * s;
  float z1 = -y * s + z * c;
  float lat = asin(clamp(y1, -1.0, 1.0));
  float lon = atan(d.x, z1) + lon0;
  float u = fract((lon + PI) / (2.0 * PI));
  float v = (PI * 0.5 - lat) / PI;
  half4 col = map.eval(float2(u * size.x, v * size.y));
  // Light from the upper left, a little darker towards the rim, a touch of the glow at the edge
  float light = 0.84 + 0.16 * max(dot(float3(d.x, y, z), normalize(float3(-0.45, 0.55, 0.7))), 0.0);
  half3 rgb = col.rgb * half(light);
  rgb = mix(rgb, half3(glow.rgb), half(smoothstep(0.82, 1.0, r) * 0.22));
  float edge = 1.0 - smoothstep(1.0 - 1.4 / radius, 1.0, r);
  return half4(rgb, 1.0) * half(edge) + halo * half(1.0 - edge);
}
`)!;

/** A friend's country marker (map home step 9): initials in a coloured circle, "+N" for more */
export type GlobeFriend = { iso2: string; lon: number; lat: number; color: string; initials: string; more: string };

type Label = { name: string; lon: number; lat: number; minLabel: number; width: number };

type Props = {
  visits: readonly Visit[];
  theme: ResolvedMapTheme;
  /** The sky behind the globe, the glow at its rim and the shadow under it (tokens) */
  sky: string;
  glow: string;
  shadowColor: string;
  /** Where it faces when opened, degrees; a new value turns it there */
  facing: { lon: number; lat: number; key: number };
  friends?: readonly GlobeFriend[];
  accessibilityLabel: string;
  onPressCountry: (iso2: string, name: string) => void;
  onLongPressCountry: (iso2: string, name: string, point: [number, number]) => void;
  /** Pinched in far enough: back to the flat map at this point (degrees) */
  onHandBack: (lon: number, lat: number) => void;
  /** The first drag or pinch (the hint goes away) */
  onInteract?: () => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function Globe({ visits, theme, sky, glow, shadowColor, facing, friends = [], accessibilityLabel, onPressCountry, onLongPressCountry, onHandBack, onInteract }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rest = restingView(size.width, size.height);

  const lon0 = useSharedValue(facing.lon * RAD);
  const lat0 = useSharedValue(clampTilt(facing.lat * RAD));
  const radius = useSharedValue(rest.r);
  const restR = useSharedValue(rest.r);
  const cx = useSharedValue(rest.cx);
  const cy = useSharedValue(rest.cy);
  const start = useSharedValue({ lon: 0, lat: 0, r: 0 });
  const handing = useSharedValue(false);

  // A new layout or a new "turn to" (the earth button): back to rest, facing there
  useEffect(() => {
    if (!size.width) return;
    cx.set(rest.cx);
    cy.set(rest.cy);
    radius.set(rest.r);
    restR.set(rest.r);
    lon0.set(facing.lon * RAD);
    lat0.set(clampTilt(facing.lat * RAD));
    handing.set(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, facing.key]);

  const texture = useMemo(() => worldTexture(visits, theme), [visits, theme]);
  const glowRgb = useMemo(() => hexToRgb(glow), [glow]);
  // A light rim on the pale sky, a fainter blue one at night
  const glowStrength = glow.toUpperCase() === '#FFFFFF' ? 0.9 : 0.45;

  const uniforms = useDerivedValue(() => ({
    center: [cx.get(), cy.get()],
    radius: radius.get(),
    lon0: lon0.get(),
    lat0: lat0.get(),
    size: [TEXTURE.width, TEXTURE.height],
    glow: [glowRgb[0], glowRgb[1], glowRgb[2], glowStrength],
  }));

  // A soft shadow under the globe, as in frame 2
  const shadow = useDerivedValue(() => ({ x: cx.get() - radius.get() * 0.6, y: cy.get() + radius.get() * 1.04, w: radius.get() * 1.2, h: radius.get() * 0.14 }));
  const shadowX = useDerivedValue(() => shadow.get().x);
  const shadowY = useDerivedValue(() => shadow.get().y);
  const shadowW = useDerivedValue(() => shadow.get().w);
  const shadowH = useDerivedValue(() => shadow.get().h);

  // Names in the map's label colours, English (as on the flat map); measured once
  const font = useMemo<SkFont>(() => matchFont({ fontFamily: 'sans-serif', fontSize: 11.5, fontWeight: '500' }), []);
  const small = useMemo<SkFont>(() => matchFont({ fontFamily: 'sans-serif', fontSize: 10, fontWeight: '700' }), []);
  const labels = useMemo<Label[]>(
    () =>
      COUNTRY_LABELS.features
        .map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const name = String(f.properties?.name ?? '');
          return { name, lon, lat, minLabel: Number(f.properties?.min_label ?? 5), width: font.measureText(name).width };
        })
        .sort((a, b) => a.minLabel - b.minLabel),
    [font],
  );
  const labelColor = theme.base.label;
  const haloColor = theme.base.labelHalo;
  const friendList = friends;

  const overlay = useDerivedValue(() => {
    const v: GlobeView = { lon0: lon0.get(), lat0: lat0.get(), cx: cx.get(), cy: cy.get(), r: radius.get() };
    // Fewer names than the flat map shows at this scale: the globe's edge squeezes them
    const lead = equivalentZoom(v.r) + 2.2;
    return createPicture((canvas) => {
      const text = Skia.Paint();
      text.setAntiAlias(true);
      text.setColor(Skia.Color(labelColor));
      const halo = Skia.Paint();
      halo.setAntiAlias(true);
      halo.setColor(Skia.Color(haloColor));
      halo.setStyle(PaintStyle.Stroke);
      halo.setStrokeWidth(3);
      const taken: number[][] = [];
      for (let i = 0; i < labels.length; i++) {
        const l = labels[i];
        if (l.minLabel > lead) break;
        const p = project(l.lon, l.lat, v);
        if (p.z < 0.5) continue;
        const left = p.x - l.width / 2;
        // The whole name inside the globe's outline, or none of it
        const dy = p.y - 5 - v.cy;
        const half = Math.sqrt(Math.max(0, v.r * v.r - dy * dy)) - 6;
        if (left < v.cx - half || left + l.width > v.cx + half) continue;
        const box = [left - 3, p.y - 10, left + l.width + 3, p.y + 4];
        let clash = false;
        for (let j = 0; j < taken.length; j++) {
          const t = taken[j];
          if (box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        taken.push(box);
        canvas.drawText(l.name, left, p.y, halo, font);
        canvas.drawText(l.name, left, p.y, text, font);
      }
      // Friends' markers, above the names
      const dot = Skia.Paint();
      dot.setAntiAlias(true);
      const ring = Skia.Paint();
      ring.setAntiAlias(true);
      ring.setStyle(PaintStyle.Stroke);
      ring.setStrokeWidth(2);
      ring.setColor(Skia.Color(haloColor));
      const ink = Skia.Paint();
      ink.setAntiAlias(true);
      ink.setColor(Skia.Color('#11151B'));
      for (let i = 0; i < friendList.length; i++) {
        const f = friendList[i];
        const p = project(f.lon, f.lat, v);
        if (p.z < 0.25) continue;
        const y = p.y - 20;
        dot.setColor(Skia.Color(f.color));
        canvas.drawCircle(p.x, y, 12, dot);
        canvas.drawCircle(p.x, y, 12, ring);
        const w = small.measureText(f.initials).width;
        canvas.drawText(f.initials, p.x - w / 2, y + 3.5, ink, small);
        if (f.more) canvas.drawText(f.more, p.x + 14, y + 4, text, small);
      }
    });
  });

  // A double tap zooms into that place: back to the flat map there (a way in without pinching)
  const zoomInAt = (x: number, y: number) => {
    const at = unproject(x, y, { lon0: lon0.get(), lat0: lat0.get(), cx: cx.get(), cy: cy.get(), r: radius.get() });
    if (at) onHandBack(at[0], at[1]);
  };

  const pick = (x: number, y: number, long: boolean) => {
    const at = unproject(x, y, { lon0: lon0.get(), lat0: lat0.get(), cx: cx.get(), cy: cy.get(), r: radius.get() });
    if (!at) return;
    // A friend's marker first, as on the flat map
    const v = { lon0: lon0.get(), lat0: lat0.get(), cx: cx.get(), cy: cy.get(), r: radius.get() };
    const friend = !long && friends.find((f) => {
      const p = project(f.lon, f.lat, v);
      return p.z >= 0.25 && Math.hypot(p.x - x, p.y - 20 - y) <= 18;
    });
    const country = friend ? { iso2: friend.iso2, name: friend.iso2 } : countryAt(at[0], at[1]);
    if (!country) return;
    if (long) onLongPressCountry(country.iso2, country.name, [x, y]);
    else onPressCountry(country.iso2, country.name);
  };

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      start.set({ lon: lon0.get(), lat: lat0.get(), r: radius.get() });
      if (onInteract) scheduleOnRN(onInteract);
    })
    .onUpdate((e) => {
      lon0.set(wrapLon(start.get().lon - e.translationX / radius.get()));
      lat0.set(clampTilt(start.get().lat + e.translationY / radius.get()));
    })
    .onEnd((e) => {
      lon0.set(withDecay({ velocity: -e.velocityX / radius.get(), deceleration: 0.994 }));
      lat0.set(withDecay({ velocity: e.velocityY / radius.get(), deceleration: 0.994, clamp: [-1.4, 1.4] }));
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.set({ lon: lon0.get(), lat: lat0.get(), r: radius.get() });
      if (onInteract) scheduleOnRN(onInteract);
    })
    .onUpdate((e) => {
      if (handing.get()) return;
      radius.set(Math.max(restR.get() * MIN_SCALE, Math.min(restR.get() * HAND_BACK_SCALE, start.get().r * e.scale)));
      if (radius.get() >= restR.get() * HAND_BACK_SCALE) {
        handing.set(true);
        const at = unproject(e.focalX, e.focalY, { lon0: lon0.get(), lat0: lat0.get(), cx: cx.get(), cy: cy.get(), r: radius.get() }) ?? [
          lon0.get() / RAD,
          lat0.get() / RAD,
        ];
        scheduleOnRN(onHandBack, at[0], at[1]);
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(pick, e.x, e.y, false);
    });
  const longPress = Gesture.LongPress()
    .minDuration(450)
    .onStart((e) => {
      scheduleOnRN(pick, e.x, e.y, true);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(16)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(zoomInAt, e.x, e.y);
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(longPress, doubleTap, tap));

  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID="map-globe">
        {size.width > 0 && texture ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill color={sky} />
            <Oval x={shadowX} y={shadowY} width={shadowW} height={shadowH} color={shadowColor}>
              <BlurMask blur={14} style="normal" />
            </Oval>
            <Fill>
              <Shader source={SHADER} uniforms={uniforms}>
                <ImageShader
                  image={texture}
                  tx="repeat"
                  ty="clamp"
                  fit="none"
                  rect={{ x: 0, y: 0, width: TEXTURE.width, height: TEXTURE.height }}
                  sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
                />
              </Shader>
            </Fill>
            <Picture picture={overlay} />
          </Canvas>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: sky }]} />
        )}
      </View>
    </GestureDetector>
  );
}
