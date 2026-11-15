import { useEffect, useRef } from 'react';

/**
 * Lightweight WebGL scene for the ADVERSE intelligence workspace.
 * Draws a perspective wireframe globe and orbital paths without a heavyweight
 * 3D runtime, so the scene stays responsive on modest devices.
 */
export default function IntelligenceScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return;

    const vertexSource = `
      attribute vec3 aPosition;
      uniform float uTime;
      uniform float uAspect;
      uniform float uScale;
      uniform float uLayer;
      varying float vDepth;
      void main() {
        float t = uTime * 0.16;
        float cy = cos(t), sy = sin(t);
        float cx = cos(0.23), sx = sin(0.23);
        vec3 p = aPosition;
        p = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
        p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
        p.z -= 3.15;
        p.x += 1.25;
        p.y += 0.18;
        float perspective = 1.0 / max(0.4, -p.z);
        gl_Position = vec4(p.x * perspective / uAspect, p.y * perspective, 0.0, 1.0);
        gl_PointSize = (uLayer > 0.5 ? 2.2 : 1.0) * uScale * perspective * 3.0;
        vDepth = clamp(perspective * 1.7, 0.0, 1.0);
      }`;
    const fragmentSource = `
      precision mediump float;
      varying float vDepth;
      uniform float uLayer;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float dotShape = 1.0 - smoothstep(0.22, 0.5, length(c));
        float alpha = (uLayer > 0.5 ? 0.55 : 0.22) * dotShape * vDepth;
        gl_FragColor = vec4(0.28, 0.83, 1.0, alpha);
      }`;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, 'aPosition');
    const time = gl.getUniformLocation(program, 'uTime');
    const aspect = gl.getUniformLocation(program, 'uAspect');
    const scale = gl.getUniformLocation(program, 'uScale');
    const layer = gl.getUniformLocation(program, 'uLayer');

    const sphere: number[] = [];
    const latitudes = 15;
    const longitudes = 28;
    for (let lat = 1; lat < latitudes; lat++) {
      const phi = Math.PI * lat / latitudes;
      for (let lon = 0; lon < longitudes; lon++) {
        const a = 2 * Math.PI * lon / longitudes;
        const b = 2 * Math.PI * (lon + 1) / longitudes;
        const point = (angle: number) => [Math.sin(phi) * Math.cos(angle), Math.cos(phi), Math.sin(phi) * Math.sin(angle)];
        sphere.push(...point(a), ...point(b));
      }
    }
    for (let lon = 0; lon < longitudes; lon++) {
      const a = 2 * Math.PI * lon / longitudes;
      for (let lat = 0; lat < latitudes; lat++) {
        const p1 = Math.PI * lat / latitudes;
        const p2 = Math.PI * (lat + 1) / latitudes;
        const point = (phi: number) => [Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a)];
        sphere.push(...point(p1), ...point(p2));
      }
    }

    const orbit: number[] = [];
    for (let ring = 0; ring < 3; ring++) {
      const tilt = ring * 0.72 - 0.72;
      for (let i = 0; i < 100; i++) {
        const a = Math.PI * 2 * i / 100;
        const b = Math.PI * 2 * (i + 1) / 100;
        const point = (v: number) => [Math.cos(v) * 1.42, Math.sin(v) * 0.37 * Math.cos(tilt), Math.sin(v) * 1.42 * Math.sin(tilt)];
        orbit.push(...point(a), ...point(b));
      }
    }

    const buffers = [sphere, orbit].map((data) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return { buffer, count: data.length / 3 };
    });

    let frame = 0;
    let raf = 0;
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };
    const draw = (now: number) => {
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(time, now * 0.001);
      gl.uniform1f(aspect, width / Math.max(1, height));
      gl.enableVertexAttribArray(position);
      buffers.forEach((item, index) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, item.buffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(layer, index);
        gl.uniform1f(scale, Math.min(width, height) / 650);
        gl.drawArrays(gl.LINES, 0, item.count);
      });
      frame++;
      raf = window.requestAnimationFrame(draw);
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      draw(0);
      window.cancelAnimationFrame(raf);
    } else {
      raf = window.requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      buffers.forEach(item => gl.deleteBuffer(item.buffer));
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="adverse-3d-scene" aria-hidden="true" />;
}
