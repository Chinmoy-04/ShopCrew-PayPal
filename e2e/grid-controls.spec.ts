import {test,expect} from './fixtures';
test('GRID column pinning and visibility persist through reload; reset restores defaults',async({page})=>{
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('shopcrew-grid-state-v1:decisions')||'{}'));
 await page.goto('/control');await page.getByRole('group',{name:'Named views'}).getByRole('button',{name:'Everything',exact:true}).click();
 const header=page.locator('.ag-header-cell[col-id="status"]');await header.hover();await header.locator('.ag-header-cell-menu-button').click();
 await page.getByRole('menuitem',{name:'Pin Column',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Pin Left',exact:true}).click();
 await expect.poll(async()=>(await saved()).columnPinning?.leftColIds).toContain('status');await expect(header).toBeVisible();
 await header.hover();await header.locator('.ag-header-cell-menu-button').click();await page.getByRole('menuitem',{name:'Choose Columns',exact:true}).click();
 await page.getByRole('textbox',{name:'Filter Columns Input'}).fill('Confidence');
 const confidence=page.getByRole('treeitem',{name:'Confidence Column',exact:true});await expect(confidence).toBeVisible();await confidence.getByRole('checkbox').uncheck();
 await page.getByRole('dialog',{name:'Choose Columns',exact:true}).getByRole('textbox',{name:'Filter Columns Input'}).press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(async()=>(await saved()).columnVisibility?.hiddenColIds).toContain('confidenceModel');
 await page.reload();await expect(header).toBeVisible();await expect.poll(async()=>(await saved()).columnPinning?.leftColIds).toContain('status');expect((await saved()).columnVisibility.hiddenColIds).toContain('confidenceModel');
 await header.hover();await header.locator('.ag-header-cell-menu-button').click();await page.getByRole('menuitem',{name:'Reset Columns',exact:true}).click();
 await expect.poll(async()=>(await saved()).columnVisibility?.hiddenColIds??[]).not.toContain('confidenceModel');
});
test('GRID corrupt persisted state recovers to usable defaults',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('shopcrew-grid-state-v1:decisions',JSON.stringify({version:'36.2.0',rowGroup:{groupColIds:'corrupt'}})));
 await page.goto('/control');await expect(page.getByRole('group',{name:'Named views'}).getByRole('button',{name:'Everything',exact:true})).toBeEnabled();
 await page.getByRole('group',{name:'Named views'}).getByRole('button',{name:'Everything',exact:true}).click();await expect(page.locator('.ag-row[row-id^="sim-"]').first()).toBeVisible();
});
