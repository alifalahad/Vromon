/**
 * The globe (docs/ui-refresh step 1, frame 2): the Map tab zoomed out past the world.
 *
 * The world is drawn once into a flat picture (texture.ts) and a small shader wraps it onto a
 * sphere, so turning costs the same however detailed the shapes are. Country names and friends'
 * markers are drawn over it at their projected points, on the facing side only.
 *
 * Zooming out is one movement, as in Apple Maps (projection.ts, "The zoom out"): the globe draws
 * from the same camera as the flat map (centre and zoom), first exactly over it, then curving
 * into the sphere as the zoom goes down, so it grows out of the map under the fingers instead of
 * fading in. Once it's the globe it leads: a drag turns it on both axes (with momentum), a pinch
 * resizes it, and pinching in plays the curve backwards and hands the flat map back at the place
 * under the fingers (a double tap does the same at the place tapped). A tap on a country opens
 * its sheet; press and hold opens the quick mark. Nothing is fetched.
 */

import { BlurMask, Canvas, createPicture, Fill, FilterMode, ImageShader, matchFont, MipmapMode, Oval, PaintStyle, Picture, Shader, Skia, type SkFont } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, withDecay, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Visit } from '../../../types';
import type { ResolvedMapTheme } from '../../mapThemes/resolve';
import { COUNTRY_LABELS } from '../geoData';
import { countryAt } from './countryAt';
import { clampTilt, equivalentZoom, globeViewOf, MAX_TILT, MIN_SCALE, MORPH_ZOOMS, morphAt, morphView, project, projectMorph, rimOf, smoothstep, unproject } from './projection';
import { TEXTURE, worldTexture } from './texture';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Per pixel: back from the screen to the place shown there, at any stage of the morph.
 * Stage a (b = 0): between the flat map (Mercator, `mercR` dp per radian of longitude) and the
 * azimuthal map (`radius` dp per radian from the centre), blended in place. Stage b: the azimuthal
 * map bulging into the sphere, a point c radians out drawn at (1 − b)·c + b·sin c radii.
 */
const SHADER = Skia.RuntimeEffect.Make(`
uniform shader map;
uniform float2 center;
uniform float radius;
uniform float mercR;
uniform float lon0;
uniform float lat0;
uniform float2 size;
uniform float4 glow;
uniform float a;
uniform float b;
uniform float rot;

const float PI = 3.14159265;

float wrapPi(float x) {
  return x - 2.0 * PI * floor((x + PI) / (2.0 * PI));
}

// The place c radians from the centre, heading az (clockwise from north): (longitude from lon0, latitude)
float2 destination(float c, float az) {
  float s0 = sin(lat0);
  float c0 = cos(lat0);
  float lat = asin(clamp(s0 * cos(c) + c0 * sin(c) * cos(az), -1.0, 1.0));
  float lon = atan(sin(az) * sin(c) * c0, cos(c) - s0 * sin(lat));
  return float2(lon, lat);
}

half4 main(float2 p) {
  float2 d = p - center;
  // Undo the flat map's turn (screen → map)
  float cr = cos(rot);
  float sr = sin(rot);
  float2 q = float2(d.x * cr - d.y * sr, d.x * sr + d.y * cr);
  float rho = length(q) / radius;
  float az = atan(q.x, -q.y);
  float2 ll;
  float rim = 1.0;
  float c = 0.0;
  if (b <= 0.0) {
    float ym = log(tan(PI * 0.25 + lat0 * 0.5)) - q.y / mercR;
    float2 m = float2(q.x / mercR, 2.0 * atan(exp(ym)) - PI * 0.5);
    float2 e = destination(min(rho, PI), az);
    ll = float2(m.x + a * wrapPi(e.x - m.x), mix(m.y, e.y, a));
  } else {
    float cut = b <= 0.5 ? PI : acos(-(1.0 - b) / b);
    rim = (1.0 - b) * cut + b * sin(cut);
    if (rho >= rim) {
      half4 halo = half4(half3(glow.rgb), 1.0) * half(glow.a * b * (1.0 - smoothstep(rim, rim * 1.045, rho)));
      return halo;
    }
    if (b >= 1.0) {
      c = asin(min(rho, 1.0));
    } else {
      // f(c) = (1 − b)·c + b·sin c rises and bends down, so Newton from c = rho climbs to the answer
      c = rho;
      for (int i = 0; i < 10; i++) {
        float f = (1.0 - b) * c + b * sin(c) - rho;
        float df = (1.0 - b) + b * cos(c);
        c = min(c - f / max(df, 0.0001), cut);
      }
    }
    ll = destination(c, az);
  }
  float lon = ll.x + lon0;
  float u = fract((lon + PI) / (2.0 * PI));
  float v = (PI * 0.5 - ll.y) / PI;
  half4 col = map.eval(float2(u * size.x, v * size.y));
  if (b <= 0.0) return half4(col.rgb, 1.0);
  // Light from the upper left, a little darker towards the rim, a touch of the glow at the edge
  float3 n = float3(sin(az) * sin(c), cos(az) * sin(c), cos(c));
  float light = 0.84 + 0.16 * max(dot(n, normalize(float3(-0.45, 0.55, 0.7))), 0.0);
  half3 rgb = col.rgb * half(mix(1.0, light, b));
  float r = rho / rim;
  rgb = mix(rgb, half3(glow.rgb), half(smoothstep(0.82, 1.0, r) * 0.22 * b));
  float edge = 1.0 - smoothstep(rim - 1.4 / radius, rim, rho);
  half4 halo = half4(half3(glow.rgb), 1.0) * half(glow.a * b);
  return half4(rgb, 1.0) * half(edge) + halo * half(1.0 - edge);
}
`)!;

/**
 * A still globe of your marks (the travel dashboard's hero, docs/ui-refresh step 2): the same
 * picture and shader, facing one place, no names, no gestures.
 */
export function GlobeImage({ visits, theme, size, lon, lat, glow }: { visits: readonly Visit[]; theme: ResolvedMapTheme; size: number; lon: number; lat: number; glow: string }) {
  const texture = useMemo(() => worldTexture(visits, theme), [visits, theme]);
  const rgb = hexToRgb(glow);
  const r = size / 2 - 4;
  const uniforms = {
    center: [size / 2, size / 2],
    radius: r,
    mercR: r,
    lon0: lon * RAD,
    lat0: clampTilt(lat * RAD),
    size: [TEXTURE.width, TEXTURE.height],
    glow: [rgb[0], rgb[1], rgb[2], 0.5],
    a: 1,
    b: 1,
    rot: 0,
  };
  if (!texture) return <View style={{ width: size, height: size }} />;
  return (
    <Canvas style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
    </Canvas>
  );
}

/** A friend's country marker (map home step 9): initials in a coloured circle, "+N" for more */
export type GlobeFriend = { iso2: string; lon: number; lat: number; color: string; initials: string; more: string };

/** The one camera the flat map and the globe share (degrees; the flat map's zoom). */
export type GlobeCamera = {
  lon: SharedValue<number>;
  lat: SharedValue<number>;
  z: SharedValue<number>;
  bearing: SharedValue<number>;
};

type Label = { name: string; lon: number; lat: number; minLabel: number; width: number };

type Props = {
  visits: readonly Visit[];
  theme: ResolvedMapTheme;
  /** The sky behind the globe, the glow at its rim and the shadow under it (tokens) */
  sky: string;
  glow: string;
  shadowColor: string;
  camera: GlobeCamera;
  /** The zoom at which the globe is at rest (projection.ts `globeZoom`) */
  zEnd: number;
  width: number;
  height: number;
  /** The globe leads (its gestures move the camera); otherwise it follows the flat map and lets touches through */
  leading: boolean;
  friends?: readonly GlobeFriend[];
  accessibilityLabel: string;
  onPressCountry: (iso2: string, name: string) => void;
  onLongPressCountry: (iso2: string, name: string, point: [number, number]) => void;
  /** A pinch in ended flat: the flat map takes over where the camera is */
  onRelease: () => void;
  /** A double tap: into the flat map at this place (degrees) */
  onZoomIn: (lon: number, lat: number) => void;
  /** The first drag or pinch (the hint goes away) */
  onInteract?: () => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SETTLE = { duration: 320, easing: Easing.out(Easing.cubic) };
const MAX_TILT_DEG = MAX_TILT * DEG;
// Closer in than this the flat map shows everything (the globe is see-through)
const FADE_UNTIL = 0.06;

export function Globe({
  visits,
  theme,
  sky,
  glow,
  shadowColor,
  camera,
  zEnd,
  width,
  height,
  leading,
  friends = [],
  accessibilityLabel,
  onPressCountry,
  onLongPressCountry,
  onRelease,
  onZoomIn,
  onInteract,
}: Props) {
  const { lon: camLon, lat: camLat, z: camZ, bearing: camBearing } = camera;
  // The smallest the globe gets: MIN_SCALE of its size at rest (its radius doubles with each zoom)
  const zMin = zEnd + Math.log2(MIN_SCALE);
  const zStart = zEnd + MORPH_ZOOMS;

  const view = useDerivedValue(
    () => morphView(camLon.get(), camLat.get(), camZ.get(), camBearing.get(), zEnd, width, height),
    [zEnd, width, height],
  );

  const texture = useMemo(() => worldTexture(visits, theme), [visits, theme]);
  const glowRgb = useMemo(() => hexToRgb(glow), [glow]);
  // A light rim on the pale sky, a fainter blue one at night
  const glowStrength = glow.toUpperCase() === '#FFFFFF' ? 0.9 : 0.45;

  const uniforms = useDerivedValue(() => {
    const v = view.get();
    return {
      center: [v.cx, v.cy],
      radius: v.r,
      mercR: v.rm,
      lon0: v.lon0,
      lat0: v.lat0,
      size: [TEXTURE.width, TEXTURE.height],
      glow: [glowRgb[0], glowRgb[1], glowRgb[2], glowStrength],
      a: v.a,
      b: v.b,
      rot: v.rot,
    };
  });

  // Drawn over the flat map from the moment the curve starts (exactly the flat map there, so the
  // hand-over can't be seen), see-through when zoomed in past it
  const fade = useAnimatedStyle(() => ({ opacity: smoothstep(0, FADE_UNTIL, morphAt(camZ.get(), zEnd).s) }), [zEnd]);

  // A soft shadow under the globe, as in frame 2, once it's round
  const shadow = useDerivedValue(() => {
    const v = view.get();
    return { x: v.cx - v.r * 0.6, y: v.cy + v.r * 1.04, w: v.r * 1.2, h: v.r * 0.14, o: v.b * v.b };
  });
  const shadowX = useDerivedValue(() => shadow.get().x);
  const shadowY = useDerivedValue(() => shadow.get().y);
  const shadowW = useDerivedValue(() => shadow.get().w);
  const shadowH = useDerivedValue(() => shadow.get().h);
  const shadowO = useDerivedValue(() => shadow.get().o);

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
    const v = view.get();
    // Fewer names than the flat map shows at this scale: the globe's edge squeezes them
    const lead = equivalentZoom(v.r) + 2.2;
    // Names well inside the picture's outline: everything while flat, the facing side on the globe
    const minFront = -1 + 1.5 * v.b;
    const outline = v.b > 0 ? v.r * rimOf(v.b) : Infinity;
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
        const p = projectMorph(l.lon, l.lat, v);
        if (!p.visible || p.front < minFront) continue;
        const left = p.x - l.width / 2;
        if (left < 4 || left + l.width > width - 4 || p.y < 12 || p.y > height - 4) continue;
        // The whole name inside the outline, or none of it
        const dy = p.y - 5 - v.cy;
        const half = Math.sqrt(Math.max(0, outline * outline - dy * dy)) - 6;
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
      const friendFront = -1 + 1.25 * v.b;
      for (let i = 0; i < friendList.length; i++) {
        const f = friendList[i];
        const p = projectMorph(f.lon, f.lat, v);
        if (!p.visible || p.front < friendFront) continue;
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

  // Taps find a country only on the finished globe (the curve is only ever passed through)
  const globeAt = (x: number, y: number): [number, number] | null => {
    const v = view.get();
    if (v.b < 1) return null;
    return unproject(x, y, globeViewOf(v));
  };

  const zoomInAt = (x: number, y: number) => {
    const at = globeAt(x, y);
    if (at) onZoomIn(at[0], at[1]);
  };

  const pick = (x: number, y: number, long: boolean) => {
    const at = globeAt(x, y);
    if (!at) return;
    // A friend's marker first, as on the flat map
    const v = globeViewOf(view.get());
    const friend = !long && friends.find((f) => {
      const p = project(f.lon, f.lat, v);
      return p.z >= 0.25 && Math.hypot(p.x - x, p.y - 20 - y) <= 18;
    });
    const country = friend ? { iso2: friend.iso2, name: friend.iso2 } : countryAt(at[0], at[1]);
    if (!country) return;
    if (long) onLongPressCountry(country.iso2, country.name, [x, y]);
    else onPressCountry(country.iso2, country.name);
  };

  // A pinch let go part way along the curve settles at the nearer end: the globe at rest, or the
  // flat map (which then takes over)
  const settle = () => {
    'worklet';
    const s = morphAt(camZ.get(), zEnd).s;
    if (s <= 0) scheduleOnRN(onRelease);
    else if (s < 1) {
      if (s >= 0.5) camZ.set(withTiming(zEnd, SETTLE));
      else
        camZ.set(
          withTiming(zStart, SETTLE, (done) => {
            if (done) scheduleOnRN(onRelease);
          }),
        );
    }
  };

  // Both gestures move the camera by what changed since their last event, so a pinch joining a
  // drag (or the other way round) never resets the other
  const pan = Gesture.Pan()
    .enabled(leading)
    .averageTouches(true)
    .onStart(() => {
      if (onInteract) scheduleOnRN(onInteract);
    })
    .onChange((e) => {
      const r = view.get().r;
      camLon.set(camLon.get() - (e.changeX / r) * DEG);
      camLat.set(Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, camLat.get() + (e.changeY / r) * DEG)));
    })
    .onEnd((e) => {
      const r = view.get().r;
      camLon.set(withDecay({ velocity: (-e.velocityX / r) * DEG, deceleration: 0.994 }));
      camLat.set(withDecay({ velocity: (e.velocityY / r) * DEG, deceleration: 0.994, clamp: [-MAX_TILT_DEG, MAX_TILT_DEG] }));
    });

  // Resizes the globe, and past its size at rest plays the curve backwards into the flat map,
  // keeping the place under the fingers under them
  const pinch = Gesture.Pinch()
    .enabled(leading)
    .onStart(() => {
      if (onInteract) scheduleOnRN(onInteract);
    })
    .onChange((e) => {
      const before = view.get();
      const z = Math.max(zMin, Math.min(20, camZ.get() + Math.log2(Math.max(0.01, e.scaleChange))));
      camZ.set(z);
      const after = morphView(camLon.get(), camLat.get(), z, 0, zEnd, width, height);
      // The focal point's offset from the centre, as an angle, shrinks as the picture grows: turn by the difference
      let fx = e.focalX - after.cx;
      let fy = e.focalY - after.cy;
      const reach = after.b >= 1 ? after.r * 0.9 : Infinity;
      const len = Math.hypot(fx, fy);
      if (len > reach) {
        fx = (fx / len) * reach;
        fy = (fy / len) * reach;
      }
      const k = 1 / before.r - 1 / after.r;
      const cosLat = Math.max(0.2, Math.cos(after.lat0));
      camLon.set(camLon.get() + ((fx * k) / cosLat) * DEG);
      camLat.set(Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, camLat.get() - fy * k * DEG)));
    })
    .onEnd(() => {
      settle();
    });

  const tap = Gesture.Tap()
    .enabled(leading)
    .maxDistance(12)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(pick, e.x, e.y, false);
    });
  const longPress = Gesture.LongPress()
    .enabled(leading)
    .minDuration(450)
    .onStart((e) => {
      scheduleOnRN(pick, e.x, e.y, true);
    });

  // A double tap zooms into that place: back to the flat map there (a way in without pinching)
  const doubleTap = Gesture.Tap()
    .enabled(leading)
    .numberOfTaps(2)
    .maxDistance(16)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(zoomInAt, e.x, e.y);
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(longPress, doubleTap, tap));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, fade]}
        pointerEvents={leading ? 'auto' : 'none'}
        accessible={leading}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        importantForAccessibility={leading ? 'auto' : 'no-hide-descendants'}
        testID="map-globe"
      >
        {width > 0 && texture ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill color={sky} />
            <Oval x={shadowX} y={shadowY} width={shadowW} height={shadowH} color={shadowColor} opacity={shadowO}>
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
      </Animated.View>
    </GestureDetector>
  );
}
