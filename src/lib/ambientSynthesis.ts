/** Original procedural textures. No recordings, network requests or audio assets. */
export type AmbientTexture = 'rain' | 'brown' | 'white';
export const AMBIENT_LOOP_SECONDS = 12;

export function createAmbientSamples(type: AmbientTexture, sampleRate: number, seed = 1): Float32Array {
  const length = Math.round(sampleRate * AMBIENT_LOOP_SECONDS);
  const overlap = Math.round(sampleRate * 0.5);
  const raw = new Float32Array(length + overlap);
  let randomState = seed >>> 0 || 1;
  let low = 0;
  let slow = 0;
  const decay = Math.exp(-2 * Math.PI * (type === 'brown' ? 45 : 900) / sampleRate);
  const random = () => {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    return (randomState >>> 0) / 2147483648 - 1;
  };
  // Warm the recursive filters before recording the loop, avoiding a cold start.
  for (let i = -sampleRate; i < raw.length; i++) {
    const white = random();
    low = decay * low + (1 - decay) * white;
    slow = 0.9995 * slow + 0.0005 * white;
    if (i >= 0) raw[i] = type === 'white' ? white : type === 'brown' ? low
      : (low + white * 0.12) * (0.9 + 0.1 * Math.sin(2 * Math.PI * i / length)) + slow * 0.2;
  }
  const result = raw.slice(0, length);
  // Equal-power splice: the loop boundary follows adjacent source samples;
  // the half-second transition is inside the loop, rather than a hard seam.
  for (let i = 0; i < overlap; i++) {
    const angle = i / overlap * Math.PI / 2;
    result[i] = raw[length + i] * Math.cos(angle) + raw[i] * Math.sin(angle);
  }
  let sum = 0;
  for (const value of result) sum += value;
  const mean = sum / length;
  let energy = 0;
  for (let i = 0; i < length; i++) { result[i] -= mean; energy += result[i] ** 2; }
  const scale = 0.16 / Math.sqrt(energy / length);
  for (let i = 0; i < length; i++) result[i] *= scale;
  return result;
}
