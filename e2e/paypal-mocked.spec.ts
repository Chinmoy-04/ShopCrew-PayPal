import { test, expect } from './fixtures';
for(const mode of ['approve','cancel','error','capture-failure','load-failure']) {
 test(`PAYPAL SDK ${mode}`,async({page})=>{
  let captures=0;
  await page.addInitScript(()=>localStorage.setItem('shopcrew-cart',JSON.stringify([{sku:'FIG',qty:1}])));
  await page.route('**/api/config',r=>r.fulfill({json:{dryRun:false,paypalClientId:'QA-SDK-ONLY'}}));
  await page.route('**/api/checkout/orders',r=>r.fulfill({json:{id:'QA-SDK-ORDER',dryRun:false}}));
  await page.route('**/api/checkout/orders/QA-SDK-ORDER/capture',r=>{captures++;return mode==='capture-failure'?r.fulfill({status:503,json:{error:'QA capture unavailable'}}):r.fulfill({json:{id:'qa-success'}});});
  await page.route('**/api/orders/qa-success',r=>r.fulfill({json:{id:'qa-success',total:26,live:true,paypalOrderId:'QA-SDK-ORDER',paypalCaptureId:'QA-CAPTURE',confirmedAt:'2026-01-01T00:00:00Z'}}));
  const sdk = `window.paypal = {
    createInstance: async () => {
      document.querySelector('paypal-button').innerHTML = '<button>Mock PayPal</button>';
      return {
        createPayPalOneTimePaymentSession: options => ({
          start: async (_, order) => {
            await order;
            const mode = '${mode}';
            if (mode === 'cancel') options.onCancel();
            else if (mode === 'error') options.onError(new Error('QA SDK error'));
            else await options.onApprove({orderId:'QA-SDK-ORDER'});
          }
        })
      };
    }
  };`;
  new Function(sdk); // Validate the fixture before loading it in a browser.
  await page.route('https://www.sandbox.paypal.com/web-sdk/v6/core',r=>mode==='load-failure'?r.abort():r.fulfill({contentType:'application/javascript',body:sdk}));
  await page.goto('/checkout');
  if(mode==='load-failure'){await expect(page.locator('.error')).toContainText('Could not load PayPal SDK');return;}
  await page.getByRole('button',{name:'Mock PayPal'}).click();
  if(mode==='approve') {await expect(page).toHaveURL(/success/);await expect(page.locator('.success-card')).toContainText('confirmed');expect(captures).toBe(1);}
  if(mode==='cancel'){await expect(page.getByText('Opening PayPal sandbox',{exact:false})).toHaveCount(0);expect(captures).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('shopcrew-cart'))).toContain('FIG');}
  if(mode==='error') await expect(page.locator('.error')).toContainText('QA SDK error');
  if(mode==='capture-failure'){await expect(page.locator('.error')).toContainText('QA capture unavailable');expect(await page.evaluate(()=>localStorage.getItem('shopcrew-cart'))).toContain('FIG');}
 });
}
