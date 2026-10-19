/**
 * Pattern shader adapted from Paper Shaders' Warp (Apache-2.0).
 * Modified: six-color blending, grain, React lifecycle and uniform mapping.
 * Fluid noise uses Ashima Arts / Stefan Gustavson simplex noise (MIT).
 * Grain hash12: Copyright (c)2014 David Hoskins, MIT (Hash without Sine).
 * Standalone changes: Flowlight lighting shader, error reporting and local imports.
 * See public/THIRD_PARTY_NOTICES.txt for full licenses and attribution.
 */
import { FLOWLIGHT_FRAGMENT_SHADER } from './flowlightFragment'
import { observeCanvasMetrics } from '../utils/canvasMetrics'
import { createCanvasPlaybackController } from '../utils/canvasPlayback'
import { useEffect, useRef, type CSSProperties } from 'react'

export type ShaderShape = 'checks' | 'stripes' | 'gradient'
export type ShaderType = 'pattern' | 'fluid' | 'flowlight'

export interface ShaderGradientProps {
  type?: ShaderType
  colors: string[]
  grain?: number
  speed?: number
  shape?: ShaderShape
  shapeScale?: number
  rotation?: number
  proportion?: number
  softness?: number
  distortion?: number
  swirl?: number
  swirlIterations?: number
  scale?: number
  offsetX?: number
  offsetY?: number
  className?: string
  style?: CSSProperties
  lightX?: number
  lightY?: number
  lightCore?: number
  lightHalo?: number
  bottomFade?: number
  vignette?: number
  bloomThreshold?: number
  bloomRange?: number
  bloomStrength?: number
  onError?: (message: string) => void
  onReady?: (canvas: HTMLCanvasElement) => void
  resolution?: { width: number; height: number }
  frameRate?: 30 | 60
  firstFrameOnly?: boolean
}

const SHAPE_MAP: Record<ShaderShape, number> = {
  checks: 0,
  stripes: 1,
  gradient: 2,
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}
`

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;

uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform vec4 u_color4;
uniform vec4 u_color5;
uniform vec4 u_color6;
uniform float u_colorCount;
uniform float u_grain;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;
uniform vec2 u_offset;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

vec3 blend_multi(float mixer, float softness) {
  float edge = 1.0 - softness;
  vec3 col = u_color1.rgb;
  if (u_colorCount > 1.5) {
    float r1 = smoothstep(0.0 + 0.35 * edge, 0.7 - 0.35 * edge, mixer);
    col = mix(col, u_color2.rgb, r1);
  }
  if (u_colorCount > 2.5) {
    float r2 = smoothstep(0.3 + 0.35 * edge, 1.0 - 0.35 * edge, mixer);
    col = mix(col, u_color3.rgb, r2);
  }
  if (u_colorCount > 3.5) {
    col = mix(col, u_color4.rgb, smoothstep(0.4, 0.75, mixer));
  }
  if (u_colorCount > 4.5) {
    col = mix(col, u_color5.rgb, smoothstep(0.55, 0.85, mixer));
  }
  if (u_colorCount > 5.5) {
    col = mix(col, u_color6.rgb, smoothstep(0.7, 0.95, mixer));
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float t = .5 * u_time;
  float noise_scale = .0005 + .006 * u_scale;

  uv -= .5;
  uv *= (noise_scale * u_resolution);
  uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio;
  uv += .5;
  uv += u_offset;

  float n1 = noise(uv * 1. + t);
  float n2 = noise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));
  for (float i = 1.; i <= 30.0; i++) {
    if (i > iterations_number) break;
    uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
    uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1. * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);

  float shape = 0.;
  float mixer = 0.;
  if (u_shape < .5) {
    vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    vec2 stripes_shape_uv = uv * (.25 + 3. * u_shapeScale);
    float f = fract(stripes_shape_uv.y);
    shape = smoothstep(.0, .55, f) * smoothstep(1., .45, f);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float sh = 1. - uv.y;
    sh -= .5;
    sh /= (noise_scale * u_resolution.y);
    sh += .5;
    float shape_scaling = .2 * (1. - u_shapeScale);
    shape = smoothstep(.45 - shape_scaling, .55 + shape_scaling, sh + .3 * (proportion - .5));
    mixer = shape;
  }

  vec3 col = blend_multi(mixer, clamp(u_softness, 0., 1.));
  fragColor = vec4(col, 1.0);

  if (u_grain > 0.0) {
    float g = random(gl_FragCoord.xy + vec2(u_time * 100.0));
    fragColor.rgb += (g - 0.5) * u_grain;
  }
}
`

const FLUID_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_c1, u_c2, u_c3, u_c4, u_c5;
uniform float u_scale;
uniform float u_grain;

out vec4 fragColor;

vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}

float fbm(vec3 p){
  float v=0.,amp=.6;vec3 shift=vec3(100.);
  for(int i=0;i<1;i++){v+=amp*snoise(p);p=p*2.+shift;amp*=.4;}
  return v;
}

float fluidNoise(vec2 uv,float t){
  float n1=fbm(vec3(uv*.6,t*.06));
  float n2=fbm(vec3(uv*.6+5.2,t*.06+1.3));
  vec2 w1=vec2(n1,n2)*.6;
  float n3=fbm(vec3((uv+w1)*.7+1.7,t*.05+3.1));
  float n4=fbm(vec3((uv+w1)*.7+9.2,t*.05+5.7));
  vec2 w2=vec2(n3,n4)*.5;
  return fbm(vec3((uv+w1+w2)*.5,t*.04));
}

vec2 curlish(vec2 uv,float t){
  float eps=.02;
  float n=snoise(vec3(uv*.8,t));
  float nx=snoise(vec3((uv+vec2(eps,0.))*.8,t));
  float ny=snoise(vec3((uv+vec2(0.,eps))*.8,t));
  return vec2(-(ny-n)/eps,(nx-n)/eps)*.003;
}

void main(){
  float aspect=u_resolution.x/u_resolution.y;
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec2 suv=vec2(uv.x*aspect, uv.y) * u_scale;
  float t=u_time;

  vec2 curl=curlish(suv,t*.04);
  vec2 uvD=suv+curl*12.;
  float f=fluidNoise(uvD,t);
  float swirl=snoise(vec3(uvD*.8+f*1.5,t*.035))*.5+.5;
  float n=f*.5+.5;
  vec3 col=mix(u_c1,u_c2,smoothstep(.2,.5,n));
  col=mix(col,u_c3,smoothstep(.35,.65,n+swirl*.25));
  col=mix(col,u_c4,smoothstep(.6,.85,swirl)*.55);
  col=mix(col,u_c5,smoothstep(.5,.8,n*swirl)*.35);

  if(u_grain>0.0){
    vec2 flowOffset = (uvD - suv) * u_resolution.y;
    vec2 gp = floor((gl_FragCoord.xy + flowOffset) / 5.0);
    float gr=hash(gp)*2.-1.;
    col+=gr*u_grain;
  }

  float vig=1.-smoothstep(.4,.78,length(uv-.5));
  col=mix(col*.75,col,vig*.35+.65);
  fragColor=vec4(col,1.);
}
`

const createCanvasSnapshotController = (
  canvas: HTMLCanvasElement,
  renderBeforeSnapshot: ((now: number) => void) | null
) => {
  let snapshot: HTMLImageElement | null = null

  const hide = () => {
    snapshot?.remove()
  }

  const show = () => {
    try {
      const parent = canvas.parentElement
      if (!parent) {
        return
      }

      // Animated canvases discard their drawing buffer after compositing.
      renderBeforeSnapshot?.(performance.now())
      snapshot = snapshot ?? document.createElement('img')
      snapshot.src = canvas.toDataURL('image/png')
      snapshot.alt = ''
      snapshot.setAttribute('aria-hidden', 'true')
      snapshot.style.position = 'absolute'
      snapshot.style.inset = '0'
      snapshot.style.width = '100%'
      snapshot.style.height = '100%'
      snapshot.style.objectFit = 'cover'
      snapshot.style.pointerEvents = 'none'
      snapshot.style.zIndex = '1'

      if (snapshot.parentElement !== parent) {
        parent.appendChild(snapshot)
      }
    } catch {
      // The shader is same-origin, but snapshotting can still fail on constrained browsers.
    }
  }

  window.addEventListener('pagehide', show)
  window.addEventListener('pageshow', hide)

  return {
    dispose: () => {
      window.removeEventListener('pagehide', show)
      window.removeEventListener('pageshow', hide)
      hide()
    },
  }
}

export function ShaderGradient({
  type = 'pattern',
  colors,
  grain = 0,
  speed = 30,
  shape = 'checks',
  shapeScale = 10,
  rotation = 0,
  proportion = 50,
  softness = 100,
  distortion = 7,
  swirl = 21,
  swirlIterations = 12,
  scale = 0.3,
  offsetX = 0,
  offsetY = 0,
  className,
  style,
  lightX = 0.89,
  lightY = 0.46,
  lightCore = 0.14,
  lightHalo = 0.2,
  bottomFade = 0,
  vignette = 0.38,
  bloomThreshold = 0.61,
  bloomRange = 0.18,
  bloomStrength = 0.4,
  onError,
  onReady,
  resolution,
  frameRate = 30,
  firstFrameOnly = false,
}: ShaderGradientProps) {
  const errorRef = useRef(onError)
  errorRef.current = onError
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startTimeRef = useRef<number>(0)
  const paramsRef = useRef({
    colors,
    grain,
    speed,
    shape,
    shapeScale,
    rotation,
    proportion,
    softness,
    distortion,
    swirl,
    swirlIterations,
    scale,
    offsetX,
    offsetY,
    lightX, lightY, lightCore, lightHalo, bottomFade, vignette, bloomThreshold, bloomRange, bloomStrength,
  })
  paramsRef.current = {
    colors,
    grain,
    speed,
    shape,
    shapeScale,
    rotation,
    proportion,
    softness,
    distortion,
    swirl,
    swirlIterations,
    scale,
    offsetX,
    offsetY,
    lightX, lightY, lightCore, lightHalo, bottomFade, vignette, bloomThreshold, bloomRange, bloomStrength,
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let ready = false
    const didDraw = () => {
      if (ready) return
      ready = true
      readyRef.current?.(canvas)
    }

    errorRef.current?.('')
    canvas.style.display = ''
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: firstFrameOnly,
    })
    if (!gl) {
      errorRef.current?.('WebGL 2 is unavailable. Enable hardware acceleration or try a supported browser.')
      canvas.style.display = 'none'
      return
    }
    const createShader = (glType: number, source: string) => {
      const shader = gl.createShader(glType)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader))
        errorRef.current?.('The shader could not compile on this device.')
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertexShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = createShader(
      gl.FRAGMENT_SHADER,
      type === 'flowlight' ? FLOWLIGHT_FRAGMENT_SHADER : type === 'fluid' ? FLUID_FRAGMENT_SHADER : FRAGMENT_SHADER
    )
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      return
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      errorRef.current?.('The shader program could not link on this device.')
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const loc = (name: string) => gl.getUniformLocation(program, name)

    if (type !== 'pattern') {
      const u = {
        u_time: loc('u_time'),
        u_resolution: loc('u_resolution'),
        u_scale: loc('u_scale'),
        u_grain: loc('u_grain'),
        u_offset: loc('u_offset'),
        u_lightPos: loc('u_lightPos'),
        u_lightCore: loc('u_lightCore'),
        u_lightHalo: loc('u_lightHalo'),
        u_bottomFade: loc('u_bottomFade'),
        u_vignette: loc('u_vignette'),
        u_bloomThreshold: loc('u_bloomThreshold'),
        u_bloomRange: loc('u_bloomRange'),
        u_bloomStrength: loc('u_bloomStrength'),
        u_c1: loc('u_c1'),
        u_c2: loc('u_c2'),
        u_c3: loc('u_c3'),
        u_c4: loc('u_c4'),
        u_c5: loc('u_c5'),
      }

      startTimeRef.current = performance.now()

      const render = (now: number) => {
        const p = paramsRef.current
        const slots: [number, number, number][] = Array.from({ length: 5 }, (_, i) =>
          i < p.colors.length ? hexToRgb(p.colors[i]) : type === 'flowlight'
            ? hexToRgb(p.colors[p.colors.length - 1] || '#000000')
            : ([0, 0, 0] as [number, number, number])
        )

        gl.uniform1f(u.u_scale, p.scale)
        gl.uniform1f(u.u_grain, p.grain)
        gl.uniform2f(u.u_offset, p.offsetX / 100, p.offsetY / 100)
        gl.uniform2f(u.u_lightPos, p.lightX, p.lightY)
        gl.uniform1f(u.u_lightCore, p.lightCore)
        gl.uniform1f(u.u_lightHalo, p.lightHalo)
        gl.uniform1f(u.u_bottomFade, p.bottomFade)
        gl.uniform1f(u.u_vignette, p.vignette)
        gl.uniform1f(u.u_bloomThreshold, p.bloomThreshold)
        gl.uniform1f(u.u_bloomRange, p.bloomRange)
        gl.uniform1f(u.u_bloomStrength, p.bloomStrength)
        gl.uniform3f(u.u_c1, slots[0][0], slots[0][1], slots[0][2])
        gl.uniform3f(u.u_c2, slots[1][0], slots[1][1], slots[1][2])
        gl.uniform3f(u.u_c3, slots[2][0], slots[2][1], slots[2][2])
        gl.uniform3f(u.u_c4, slots[3][0], slots[3][1], slots[3][2])
        gl.uniform3f(u.u_c5, slots[4][0], slots[4][1], slots[4][2])

        const elapsed = (now - startTimeRef.current) * 0.001 * (p.speed / 100)
        gl.uniform1f(u.u_time, elapsed)
        gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        didDraw()
      }

      const snapshotController = createCanvasSnapshotController(canvas, firstFrameOnly ? null : render)
      const playbackController = createCanvasPlaybackController({
        canvas,
        enabled: !firstFrameOnly,
        frameRate,
        render,
      })

      const metricsController = observeCanvasMetrics(canvas, {
        maxDpr: type === 'flowlight' ? 1.5 : 1,
        resolution,
        onResize: metrics => {
          canvas.width = metrics.pixelWidth
          canvas.height = metrics.pixelHeight
          gl.viewport(0, 0, metrics.pixelWidth, metrics.pixelHeight)
          if (firstFrameOnly) {
            render(performance.now())
          } else {
            playbackController.schedule()
          }
        },
      })

      return () => {
        playbackController.dispose()
        metricsController.dispose()
        snapshotController.dispose()
        gl.deleteProgram(program)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
        gl.deleteBuffer(buffer)
      }
    }

    const uniforms = {
      u_time: loc('u_time'),
      u_pixelRatio: loc('u_pixelRatio'),
      u_resolution: loc('u_resolution'),
      u_scale: loc('u_scale'),
      u_offset: loc('u_offset'),
      u_rotation: loc('u_rotation'),
      u_color1: loc('u_color1'),
      u_color2: loc('u_color2'),
      u_color3: loc('u_color3'),
      u_color4: loc('u_color4'),
      u_color5: loc('u_color5'),
      u_color6: loc('u_color6'),
      u_colorCount: loc('u_colorCount'),
      u_grain: loc('u_grain'),
      u_proportion: loc('u_proportion'),
      u_softness: loc('u_softness'),
      u_shape: loc('u_shape'),
      u_shapeScale: loc('u_shapeScale'),
      u_distortion: loc('u_distortion'),
      u_swirl: loc('u_swirl'),
      u_swirlIterations: loc('u_swirlIterations'),
    }

    let pixelRatio = window.devicePixelRatio || 1

    startTimeRef.current = performance.now()

    const render = () => {
      const p = paramsRef.current
      const slots: [number, number, number][] = Array.from({ length: 6 }, (_, i) =>
        i < p.colors.length ? hexToRgb(p.colors[i]) : ([0, 0, 0] as [number, number, number])
      )

      gl.uniform1f(uniforms.u_scale, p.scale)
      gl.uniform2f(uniforms.u_offset, (p.offsetX || 0) / 100, (p.offsetY || 0) / 100)
      gl.uniform1f(uniforms.u_rotation, p.rotation / 90)
      gl.uniform4f(uniforms.u_color1, slots[0][0], slots[0][1], slots[0][2], 1.0)
      gl.uniform4f(uniforms.u_color2, slots[1][0], slots[1][1], slots[1][2], 1.0)
      gl.uniform4f(uniforms.u_color3, slots[2][0], slots[2][1], slots[2][2], 1.0)
      gl.uniform4f(uniforms.u_color4, slots[3][0], slots[3][1], slots[3][2], 1.0)
      gl.uniform4f(uniforms.u_color5, slots[4][0], slots[4][1], slots[4][2], 1.0)
      gl.uniform4f(uniforms.u_color6, slots[5][0], slots[5][1], slots[5][2], 1.0)
      gl.uniform1f(uniforms.u_colorCount, p.colors.length)
      gl.uniform1f(uniforms.u_grain, p.grain)
      gl.uniform1f(uniforms.u_proportion, p.proportion / 100)
      gl.uniform1f(uniforms.u_softness, p.softness / 100)
      gl.uniform1f(uniforms.u_shape, SHAPE_MAP[p.shape])
      gl.uniform1f(uniforms.u_shapeScale, p.shapeScale / 100)
      gl.uniform1f(uniforms.u_distortion, p.distortion / 100)
      gl.uniform1f(uniforms.u_swirl, p.swirl / 50)
      gl.uniform1f(uniforms.u_swirlIterations, p.swirlIterations)

      const elapsed = (performance.now() - startTimeRef.current) * 0.001 * (p.speed / 100)
      gl.uniform1f(uniforms.u_time, elapsed)
      gl.uniform1f(uniforms.u_pixelRatio, pixelRatio)
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      didDraw()
    }

    const snapshotController = createCanvasSnapshotController(canvas, firstFrameOnly ? null : render)
    const playbackController = createCanvasPlaybackController({
      canvas,
      enabled: !firstFrameOnly,
      frameRate,
      render,
    })

    const metricsController = observeCanvasMetrics(canvas, {
      maxDpr: 1.5,
      resolution,
      onResize: metrics => {
        pixelRatio = metrics.deviceDpr
        canvas.width = metrics.pixelWidth
        canvas.height = metrics.pixelHeight
        gl.viewport(0, 0, metrics.pixelWidth, metrics.pixelHeight)
        if (firstFrameOnly) {
          render()
        } else {
          playbackController.schedule()
        }
      },
    })

    return () => {
      playbackController.dispose()
      metricsController.dispose()
      snapshotController.dispose()
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.deleteBuffer(buffer)
    }
    // Rendering options reinitialize the canvas; shader parameters update through paramsRef.
  }, [type, firstFrameOnly, resolution?.width, resolution?.height, frameRate])

  return (
    <canvas
      key={firstFrameOnly ? 'static' : 'animated'}
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...style }}
    />
  )
}
