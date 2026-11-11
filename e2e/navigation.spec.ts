import {test,expect} from './fixtures';
test('NAV user links, active navigation and browser Back/Forward reach the intended routes',async({page})=>{
 await page.goto('/');await page.getByRole('link',{name:'Try the demo',exact:true}).click();await expect(page).toHaveURL(/\/shop$/);
 await page.goBack();await expect(page).toHaveURL(/\/$/);await page.goForward();await expect(page).toHaveURL(/\/shop$/);
 await page.getByRole('link',{name:'ShopCrew',exact:true}).click();await page.getByRole('link',{name:'Open control room',exact:true}).click();await expect(page).toHaveURL(/\/control$/);
 for(const [name,path] of [['Insights','insights'],['Shop','shop'],['Cart','cart']]){await page.locator('.nav').getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(new RegExp(`/${path}$`));await expect(page.locator('.nav').getByRole('link',{name,exact:true})).toHaveClass(/active/);}
 await page.getByRole('link',{name:'Browse the shop.',exact:true}).click();await expect(page).toHaveURL(/\/shop$/);
 await page.locator('.product-card').first().click();await expect(page).toHaveURL(/\/shop\/[A-Z]+$/);await page.getByRole('button',{name:'Add to cart',exact:true}).click();
 await page.getByRole('link',{name:'Cart',exact:true}).last().click();await page.getByRole('link',{name:'Checkout',exact:true}).click();await expect(page).toHaveURL(/\/checkout$/);
});
