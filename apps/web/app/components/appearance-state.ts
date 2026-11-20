import { themes } from '../../../../packages/domain/src/theme';
export type Brand = {
  displayName: string;
  appName: string;
  mode: string;
  selectedTheme: string;
  logo: string | null;
  palettes: Record<string, Record<string, string>>;
  platformPalettes: Record<string, Record<string, string>>;
  themes?: Record<string, string>;
  preferenceVersion?: number;
  theme?: string;
};
export type InitialAppearance = {
  pathname: string;
  account: string | null;
  brand: Brand | null;
  brandingUnavailable?: boolean;
};
export const sharedAppearance = (pathname: string) =>
  /^\/(platform|login|setup|clients|account|accounts)(\/|$)/.test(pathname);
export const guestAppearance = (pathname: string) =>
  /^\/(login|setup|account\/link)(\/|$)/.test(pathname);
export const appearanceKey = (account: string) => 'training.v21.appearance.platform.' + account;
export function paletteProperties(brand: Brand | null) {
  const properties: Record<string, string> = {};
  if (brand)
    for (const [prefix, palettes] of [
      ['client', brand.palettes],
      ['platform', brand.platformPalettes],
    ] as const)
      for (const [variant, tokens] of Object.entries(palettes))
        for (const [key, value] of Object.entries(tokens))
          properties['--' + prefix + '-' + variant + '-' + key] = value;
  return properties;
}
export function savedTheme(brand: Brand, account: string, shared: boolean) {
  if (shared || account === 'guest')
    try {
      const saved = localStorage.getItem(appearanceKey(account));
      if (saved && Object.hasOwn(themes, saved)) return { ...brand, selectedTheme: saved };
    } catch {
      /* Storage denial must not discard the configured palette. */
    }
  return brand;
}
// Only a scoped storage key and allowlisted names enter this parser-blocking script.
// Escape '<' even though current account identifiers are server-issued UUIDs.
export function appearanceScript(initial: InitialAppearance) {
  const key =
    initial.account && (sharedAppearance(initial.pathname) || initial.account === 'guest')
      ? appearanceKey(initial.account)
      : null;
  const available = initial.brand
    ? Object.keys(themes)
    : Object.keys(themes).filter((t) => !t.startsWith('platform-'));
  const fallback = !initial.brand && initial.brandingUnavailable === true;
  return `try{var k=${JSON.stringify(key).replace(/</g, '\\u003c')};var t=k&&localStorage.getItem(k);if(${JSON.stringify(available)}.includes(t))document.documentElement.dataset.theme=t;else if(${fallback}&&t==='platform-dark'){document.documentElement.dataset.theme='dark';document.documentElement.dataset.appearanceFallback='platform-dark'}}catch(e){}`;
}
