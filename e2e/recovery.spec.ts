import {test,expect} from './fixtures';
const admin={'x-admin-token':'shopcrew-qa-only'};
test('RECOVERY checkout survives a lost connection, retry creates one order',async({page,request,context})=>{
 expect((await(await request.get('/healthz')).json()).dryRun).toBe(true);
 await request.post('/api/sim/reset',{headers:admin,data:{}});
 const product=(await(await request.get('/api/products')).json()).find((p:any)=>p.stock>1);
 const ordersBefore=(await(await request.get('/api/orders')).json()).length;
 await page.goto(`/shop/${product.sku}`);await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.goto('/checkout');
 await context.setOffline(true);await page.getByRole('button',{name:'Place demo order'}).click();await expect(page.locator('.error')).toBeVisible();await expect(page.getByRole('button',{name:'Place demo order'})).toBeEnabled();
 expect(await page.evaluate(()=>localStorage.getItem('shopcrew-cart'))).toContain(product.sku);
 await context.setOffline(false);await page.getByRole('button',{name:'Place demo order'}).click();await expect(page).toHaveURL(/success/);
 expect((await(await request.get('/api/orders')).json()).length).toBe(ordersBefore+1);
 expect((await(await request.get(`/api/products/${product.sku}`)).json()).stock).toBe(product.stock-1);
});
test('RECOVERY slow checkout disables submission; rejection preserves cart and retry succeeds',async({page,request})=>{
 expect((await(await request.get('/healthz')).json()).dryRun).toBe(true);await request.post('/api/sim/reset',{headers:admin,data:{}});
 await page.addInitScript(()=>localStorage.setItem('shopcrew-cart',JSON.stringify([{sku:'FIG',qty:1}])));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 await page.route('**/api/checkout/orders',async route=>{calls++;if(calls===1){await gate;await route.fulfill({status:422,json:{error:'QA checkout rejected'}});}else await route.continue();});
 await page.goto('/checkout');await page.getByRole('button',{name:'Place demo order'}).click();await expect(page.getByRole('button',{name:'Paying…'})).toBeDisabled();await page.keyboard.press('Enter');expect(calls).toBe(1);release();
 await expect(page.locator('.error')).toContainText('QA checkout rejected');expect(await page.evaluate(()=>localStorage.getItem('shopcrew-cart'))).toContain('FIG');await page.getByRole('button',{name:'Place demo order'}).click();await expect(page).toHaveURL(/success/);expect(calls).toBe(2);
});
test('RECOVERY shop loading, empty result and API error have explicit states',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let failed=false;
 await page.route('**/api/products',async route=>{await gate;await route.fulfill(failed?{status:503,json:{error:'QA catalog unavailable'}}:{json:[]});});
 await page.goto('/shop');await expect(page.getByText('Loading the shop…',{exact:true})).toBeVisible();release();await expect(page.getByText('No products yet.',{exact:false})).toBeVisible();failed=true;await page.reload();await expect(page.locator('.error')).toContainText('QA catalog unavailable');
});
