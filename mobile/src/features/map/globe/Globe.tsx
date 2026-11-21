/**
 * A still globe of your marks (the travel dashboard's hero, docs/ui-refresh step 2; Explore's
 * "The world"). The world is drawn once into a flat picture (texture.ts) and a small shader wraps
 * it onto a sphere facing one place, with soft light and a glow at the rim. No names, no gestures.
 *
 * The Map tab's globe is MapLibre's own (docs/smooth-zoom), not this one.
 */

import { Canvas, Fill, FilterMode, ImageShader, MipmapMode, Shader, Skia } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import type { Visit } from '../../../types';
import type { ResolvedMapTheme } from '../../mapThemes/resolve';
import { clampTilt } from './projection';
import { TEXTURE, worldTexture } from './texture';

const RAD = Math.PI / 180;

/**
 * Per pixel: back from the screen to the place shown there. A sphere seen from far away
 * (orthographic): `lon0` and `lat0` face the viewer; a point c radians from the centre is drawn
 * sin c radii out. Past the rim, the glow fades out.
 */
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
  float2 d = p - center;
  float rho = length(d) / radius;
  if (rho >= 1.0) {
    return half4(half3(glow.rgb), 1.0) * half(glow.a * (1.0 - smoothstep(1.0, 1.045, rho)));
  }
  float az = atan(d.x, -d.y);
  float c = asin(rho);
  float s0 = sin(lat0);
  float c0 = cos(lat0);
  float lat = asin(clamp(s0 * cos(c) + c0 * sin(c) * cos(az), -1.0, 1.0));
  float lon = atan(sin(az) * sin(c) * c0, cos(c) - s0 * sin(lat)) + lon0;
  float u = fract((lon + PI) / (2.0 * PI));
  float v = (PI * 0.5 - lat) / PI;
  half4 col = map.eval(float2(u * size.x, v * size.y));
  // Light from the upper left, a little darker towards the rim, a touch of the glow at the edge
  float3 n = float3(sin(az) * sin(c), cos(az) * sin(c), cos(c));
  float light = 0.84 + 0.16 * max(dot(n, normalize(float3(-0.45, 0.55, 0.7))), 0.0);
  half3 rgb = col.rgb * half(light);
  rgb = mix(rgb, half3(glow.rgb), half(smoothstep(0.82, 1.0, rho) * 0.22));
  float edge = 1.0 - smoothstep(1.0 - 1.4 / radius, 1.0, rho);
  half4 halo = half4(half3(glow.rgb), 1.0) * half(glow.a);
  return half4(rgb, 1.0) * half(edge) + halo * half(1.0 - edge);
}
`)!;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function GlobeImage({ visits, theme, size, lon, lat, glow }: { visits: readonly Visit[]; theme: ResolvedMapTheme; size: number; lon: number; lat: number; glow: string }) {
  const texture = useMemo(() => worldTexture(visits, theme), [visits, theme]);
  const rgb = hexToRgb(glow);
  const uniforms = {
    center: [size / 2, size / 2],
    radius: size / 2 - 4,
    lon0: lon * RAD,
    lat0: clampTilt(lat * RAD),
    size: [TEXTURE.width, TEXTURE.height],
    glow: [rgb[0], rgb[1], rgb[2], 0.5],
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
