export const themes = {
  light: 'Light',
  dark: 'Dark',
  'neon-cyan': 'Neon Cyan',
  'neon-emerald': 'Neon Emerald',
  'neon-amber': 'Neon Amber',
  'platform-light': 'Platform Light',
  'platform-dark': 'Platform Dark',
};
export function luminance(color: string) {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(color.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, p: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.floor(
          (parseInt(a.slice(i, i + 2), 16) * (100 - p) + parseInt(b.slice(i, i + 2), 16) * p) /
            100 +
            0.5,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function readable(a: string, surfaces: string[], target: string, min: number) {
  for (let p = 0; p <= 100; p++) {
    const c = mix(a, target, p);
    if (surfaces.every((s) => contrast(c, s) >= min)) return c;
  }
  throw new Error('Generated surfaces do not support contrast.');
}
export function generate(source: string) {
  if (!/^#[0-9a-f]{6}$/i.test(source)) throw new Error('Enter a colour as #RRGGBB.');
  const palettes: Record<string, Record<string, string>> = {};
  for (const scheme of ['light', 'dark']) {
    const dark = scheme === 'dark',
      target = dark ? '#ffffff' : '#000000',
      background = mix(source, dark ? '#0b0f14' : '#ffffff', 96),
      card = dark ? mix(source, '#18212b', 94) : '#ffffff',
      hover = mix(source, dark ? '#25313f' : '#ffffff', dark ? 90 : 94),
      surfaces = [background, card, hover],
      primary = readable(source, surfaces, target, 4.5);
    palettes[scheme] = {
      primary,
      background,
      card,
      text: readable(mix(source, target, 90), surfaces, target, 7),
      muted: readable(mix(source, target, 55), surfaces, target, 4.5),
      decorative: mix(source, dark ? '#36414b' : '#e4e9ee', 92),
      line: readable(mix(source, background, 65), surfaces, target, 3),
      focus: primary,
      raised: card,
      hover,
      soft: hover,
      'primary-hover': mix(primary, target, 12),
      'on-primary': dark ? '#000000' : '#ffffff',
      scheme,
    };
  }
  return palettes;
}
