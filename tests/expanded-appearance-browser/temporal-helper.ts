import { expect, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
export async function install(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__temporal = { frames: [], selectors: {}, phase: 'initial' };
    const tick = () => {
      const s = w.__temporal;
      if (document.body) {
        const anchors: Record<string, unknown> = {};
        for (const [name, selector] of Object.entries(s.selectors)) {
          const el = document.querySelector(selector as string) as HTMLElement | null;
          if (el && el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) {
            const r = el.getBoundingClientRect(),
              css = getComputedStyle(el);
            if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)
              anchors[name] = {
                x: r.x,
                y: r.y + scrollY,
                width: r.width,
                height: r.height,
                font: css.font,
                color: css.color,
                background: css.backgroundColor,
              };
          }
        }
        s.frames.push({
          t: performance.now(),
          phase: s.phase,
          theme: document.documentElement.dataset.theme,
          width: innerWidth,
          overflow: document.documentElement.scrollWidth - innerWidth,
          anchors,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
export async function start(page: Page, selectors: Record<string, string>, phase: string) {
  await page.evaluate(
    ({ selectors, phase }) => {
      const s = (window as any).__temporal;
      s.frames = [];
      s.selectors = selectors;
      s.phase = phase;
    },
    { selectors, phase },
  );
}
export async function finish(page: Page, label: string, required: string[]) {
  // Observe completed paints, not just the synchronous DOM assertion.
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        let n = 8;
        function tick() {
          if (--n) requestAnimationFrame(tick);
          else r();
        }
        requestAnimationFrame(tick);
      }),
  );
  const frames = await page.evaluate(() => (window as any).__temporal.frames);
  const out = process.env.QA_EVIDENCE_DIR || 'evidence/round3/dynamic';
  await mkdir(out, { recursive: true });
  await writeFile(out + '/' + label + '.json', JSON.stringify(frames, null, 2));
  expect
    .soft(
      frames.filter((f: any) => f.theme !== 'dark'),
      label + ' Dark',
    )
    .toEqual([]);
  expect
    .soft(
      frames.filter((f: any) => f.overflow > 1),
      label + ' overflow',
    )
    .toEqual([]);
  for (const name of required) {
    const visible = frames.filter((f: any) => f.anchors[name]);
    expect.soft(visible.length, label + ' ' + name + ' observed').toBeGreaterThan(1);
    if (!visible.length) continue;
    const first = visible[0].anchors[name];
    const bad = visible.filter((f: any) =>
      Object.entries(first).some(([k, v]) =>
        typeof v === 'number' ? Math.abs(f.anchors[name][k] - v) > 1 : f.anchors[name][k] !== v,
      ),
    );
    expect.soft(bad, label + ' ' + name + ' painted geometry/styles').toEqual([]);
  }
}
