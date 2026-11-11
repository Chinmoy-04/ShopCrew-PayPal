import { expect, type Locator, type Page } from '@playwright/test';

export async function revealGridControl(page: Page, target: Locator, position: number | 'end') {
  const scroller = page.locator('.ag-body-horizontal-scroll-viewport').first();
  await expect.poll(async () => {
    await scroller.evaluate(async (element, position) => {
      element.scrollLeft = position === 'end' ? element.scrollWidth : position;
      // Let ResizeObserver and AG Grid's virtual columns consume the scroll.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, position);
    return target.evaluateAll(elements => {
      const element = elements[0];
      if (!element) return false;
      const viewport = element.closest('.ag-center-cols-viewport, .ag-header-viewport') ?? element.closest('.ag-root-wrapper');
      if (!viewport) return false;
      const box = element.getBoundingClientRect();
      const clip = viewport.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left < clip.right && box.right > clip.left;
    });
  }, { message: 'Grid control must be rendered in the horizontal viewport' }).toBe(true);
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
}
