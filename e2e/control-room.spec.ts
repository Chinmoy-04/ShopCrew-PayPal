import { test, expect, type Page } from './fixtures';
import { shopCrewReport, STUDIO_STATE_KEY } from '../apps/web/src/studio/initial-report';
import { inflateRawSync } from 'node:zlib';
import { revealGridControl } from './grid-ui';
const rows = [
 {id:'qa-low',agent:'cs',type:'refund',amount:8,status:'pending_approval',summary:'QA small refund',createdAt:'2026-01-01T00:00:00Z'},
 {id:'qa-high',agent:'cs',type:'refund',amount:45,status:'pending_approval',summary:'QA edited refund',editedByOwner:true,createdAt:'2026-01-01T01:00:00Z'},
 {id:'qa-paid',agent:'inventory',type:'payout',amount:30,status:'confirmed',summary:'QA supplier payout',decidedBy:'owner'},
 {id:'qa-blocked',agent:'pricing',type:'price_change',amount:20,status:'blocked',summary:'QA blocked price'},
 {id:'qa-reply',agent:'cs',type:'reply',amount:0,status:'confirmed',summary:'QA reply'},
].map(r=>({createdAt:'2026-01-01T02:00:00Z',simDay:1,reasoning:'Synthetic QA reasoning',policy:{reasons:['Synthetic QA policy']},...r}));
async function fixture(page:Page, values=rows) {
 await page.route('**/api/proposals', r=>r.fulfill({json:values}));
}
async function ids(page:Page) {return (await page.locator('.ag-row[row-id^="qa-"]').evaluateAll(els=>[...new Set(els.map(e=>e.getAttribute('row-id')))])).sort();}
const view = (page:Page,name:string)=>page.getByRole('group',{name:'Named views'}).getByRole('button',{name,exact:true});
test('VIEWS all named views show the exact matching records',async({page})=>{
 await fixture(page);await page.goto('/control');
 for(const [name,expected] of [
 ['Needs approval',['qa-low','qa-high']],['Money out',['qa-low','qa-high','qa-paid']],
 ['Blocked by policy',['qa-blocked']],['Edited by me',['qa-high']],['Everything',rows.map(r=>r.id)],
 ] as [string,string[]][]) {await view(page,name).click();await expect.poll(()=>ids(page)).toEqual(expected.sort());}
});
test('COMMAND presets, Enter and Undo change actual grid records',async({page})=>{
 await fixture(page);await page.goto('/control');await view(page,'Everything').click();
 const command=page.locator('.command-bar');
 for(const [name,expected] of [['Needs approval',['qa-low','qa-high']],['Refunds over $20',['qa-high']],['Blocked by policy',['qa-blocked']],['Approved by me',['qa-paid']]] as [string,string[]][]) {
 await command.getByRole('button',{name,exact:true}).click();await expect.poll(()=>ids(page)).toEqual(expected.sort());
 await command.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>ids(page)).toEqual(rows.map(r=>r.id).sort());
 }
 await command.getByRole('button',{name:'Group by agent',exact:true}).click();
 await expect(page.locator('.command-bar-feedback')).toContainText('grouped by agent');
 await command.getByRole('button',{name:'Undo',exact:true}).click();
 await command.getByRole('textbox',{name:'Ask the grid'}).fill('show refunds over $20');await command.getByRole('textbox').press('Enter');
 await expect.poll(()=>ids(page)).toEqual(['qa-high']);
});
test('COMMAND cross-tab result waits for target grid and Undo restores target state',async({page})=>{
 await fixture(page);await page.route('**/api/orders',r=>r.fulfill({json:[{id:'cheap',total:10,refundedTotal:0,simDay:0,createdAt:'2026-01-01T01:00:00Z'},{id:'expensive',total:100,refundedTotal:0,simDay:0,createdAt:'2026-01-01T02:00:00Z'}]}));
 await page.route('**/api/nl/grid',r=>r.fulfill({json:{grid:'orders',explanation:'Filtered orders',simple:{filterModel:{total:{filterType:'number',type:'greaterThan',filter:50}},rowGroupCols:[]}}}));
 await page.goto('/control');await page.getByRole('textbox',{name:'Ask the grid'}).fill('orders above fifty');await page.getByRole('textbox').press('Enter');
 await expect(page).toHaveURL(/tab=orders/);await expect(page.locator('.ag-row[row-id="expensive"]').first()).toBeVisible();await expect(page.locator('.ag-row[row-id="cheap"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.ag-row[row-id="cheap"]').first()).toBeVisible();
});
test('REVIEW pending focus works from every tab despite saved filters',async({page})=>{
 await fixture(page);await page.goto('/control');await view(page,'Blocked by policy').click();
 for(const tab of ['orders','inventory','policies','audit','payouts','inbox','decisions']) {
 await page.goto(`/control?tab=${tab}`);await page.getByRole('button',{name:'Review next pending'}).click();
 await expect(page).toHaveURL(/focus=qa-low/);await expect(page.locator('.decision-card').first()).toContainText('QA small refund');
 }
});
test('REVIEW empty pending queue stays usable',async({page})=>{
 await fixture(page,[]);await page.goto('/control?tab=orders');await page.getByRole('button',{name:'Review next pending'}).click();
 await expect(page).toHaveURL(/tab=decisions/);await expect(page.locator('.tabs button[aria-selected="true"]')).toHaveText('decisions');
});
test('COMMAND failed request shows error and allows retry',async({page})=>{
 await fixture(page);let failed=true;await page.route('**/api/nl/grid',r=>failed?r.fulfill({status:503,json:{error:'QA temporarily unavailable'}}):r.fulfill({json:{grid:'decisions',explanation:'Recovered',simple:{filterModel:{},rowGroupCols:[]}}}));
 await page.goto('/control');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('.command-bar-feedback')).toContainText('QA temporarily unavailable');
 failed=false;await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('.command-bar-feedback')).toContainText('Recovered');
});
test('CHART dedicated chart buttons render data and close',async({page})=>{
 await fixture(page);await page.goto('/control');await view(page,'Everything').click();
 await expect.poll(()=>ids(page)).toEqual(rows.map(row=>row.id).sort());
 for(const name of ['Chart spend','Chart status']) {
 await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').locator('canvas').first()).toBeVisible();
 await page.getByRole('dialog').locator('.ag-panel-title-bar-button').last().click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('shopcrew-grid-state-v1:decisions')||'{}').columnVisibility?.hiddenColIds)).toContain('agent');
 await expect(page.locator('.decision-card')).toHaveCount(0);
 }
 await page.goto('/control?tab=orders');
 await expect(page.locator('.ag-row[row-id]').first()).toBeVisible();
 for(const name of ['Revenue by day','Revenue by source']) {
 await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').locator('canvas').first()).toBeVisible();await page.getByRole('dialog').locator('.ag-panel-title-bar-button').last().click();
 }
});
// Read central directory entries instead of trusting a filename or download event.
function unzip(data:Buffer) {
 const files:Record<string,string>={};
 for(let offset=0;offset<data.length-46;offset++)if(data.readUInt32LE(offset)===0x02014b50){
 const method=data.readUInt16LE(offset+10),size=data.readUInt32LE(offset+20),nameLength=data.readUInt16LE(offset+28),local=data.readUInt32LE(offset+42);
 const name=data.toString('utf8',offset+46,offset+46+nameLength);const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);const payload=data.subarray(start,start+size);
 files[name]=(method===8?inflateRawSync(payload):payload).toString('utf8');
 } return files;
}
test('EXPORT CSV and XLSX contain actual audit data',async({page})=>{
 await page.route('**/api/audit',r=>r.fulfill({json:[{id:'qa-audit',ts:'2026-01-01T00:00:00Z',actor:'owner',agent:'cs',event:'qa.export',message:'QA export sentinel',correlationId:'qa-group'}]}));await page.goto('/control?tab=audit');await expect(page.locator('.ag-root-wrapper')).toBeVisible();
 for(const name of ['Export CSV','Export Excel']) {
 const ready=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const download=await ready;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);const data=Buffer.concat(chunks);
 const text=name==='Export CSV'?data.toString('utf8'):Object.values(unzip(data)).join('');expect(text).toContain('QA export sentinel');expect(text).toContain('qa.export');
 }
});
test('EDIT failed policy save reverts the cell and reports error',async({page})=>{
 await page.route('**/api/policies/cs',r=>r.fulfill({status:422,json:{error:'QA policy rejected'}}));await page.goto('/control?tab=policies');
 const columns=page.getByRole('tab',{name:'Columns',exact:true});if(await columns.getAttribute('aria-expanded')==='true')await columns.click();
 const cell=page.locator('.ag-row[row-id="cs"] [col-id="autoApproveMax"]');
 if((page.viewportSize()?.width??1440)<600)await revealGridControl(page,cell,240);
 await expect(cell).toBeVisible();const before=await cell.innerText();await cell.dblclick();await page.locator('.ag-cell-inline-editing input').fill('99');await page.locator('.ag-cell-inline-editing input').press('Enter');
 await expect(page.getByRole('alert')).toContainText('QA policy rejected');await expect(cell).toHaveText(before);
});

test('LIVE reconnect reloads data missed during disconnect',async({page})=>{
 await page.addInitScript(()=>{(window as any).EventSource=class {
 onopen:any; onmessage:any; onerror:any;
 constructor(){(window as any).__qaSource=this;setTimeout(()=>this.onopen?.({}),0);}close(){}
 };});
 let values=rows;await page.route('**/api/proposals',r=>r.fulfill({json:values}));await page.goto('/control');await view(page,'Everything').click();await expect.poll(()=>ids(page)).toEqual(rows.map(r=>r.id).sort());
 values=[...rows,{...rows[0],id:'qa-reconnected',summary:'QA missed event'}];
 await page.evaluate(()=>{(window as any).__qaSource.onerror?.({});(window as any).__qaSource.onopen?.({});});
 await expect.poll(()=>ids(page)).toContain('qa-reconnected');
});
test('INSIGHTS duplicate persists through reload and live refresh; reset restores defaults',async({page,request})=>{
 await page.goto('/insights');await page.getByRole('button',{name:'Edit report',exact:true}).click();
 if((page.viewportSize()?.width??1440)<600)for(const name of ['Filters','Compose','Data']) {
   const header=page.getByRole('button',{name,exact:true});const box=await header.boundingBox();if(box&&box.width>100){await header.click();await expect.poll(async()=>(await header.boundingBox())?.width).toBeLessThan(40);}
 }
 if((page.viewportSize()?.width??1440)<600){
   await expect.poll(()=>page.locator('.ag-studio-panel').evaluateAll(els=>Math.max(...els.map(el=>el.getBoundingClientRect().width)))).toBeLessThan(40);
   await page.evaluate(()=>window.scrollTo(0,0));
 }
 const before=Object.keys(shopCrewReport.pages[0].widgets).length;
 const count=()=>page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)||'{"pages":[{"widgets":{}}]}').pages[0].widgets).length,STUDIO_STATE_KEY);
 await page.locator('.ag-studio-layout-widget').filter({has:page.getByText('Live brief',{exact:true})}).first().hover({position:{x:80,y:30}});
 await page.locator('[aria-label="widgetToolbarDuplicate"]').first().click();await expect.poll(count).toBe(before+1);
 await page.reload();await page.getByRole('button',{name:'Edit report',exact:true}).click();await expect.poll(count).toBe(before+1);
 const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/insights'&&response.ok());
 await request.post('/api/sim/pause',{data:{paused:false}});await refreshed;await expect.poll(count).toBe(before+1);
 await page.getByRole('button',{name:'Reset layout',exact:true}).click();await expect(page.locator('.studio-frame')).toBeVisible();
 await expect.poll(async()=>page.evaluate(key=>localStorage.getItem(key),STUDIO_STATE_KEY)).toBeNull();
});

test('GRID numeric sorting and filters survive reload',async({page})=>{
 await fixture(page);await page.goto('/control');await view(page,'Everything').click();
 await page.getByRole('textbox',{name:'Ask the grid'}).fill('show everything');await page.getByRole('textbox',{name:'Ask the grid'}).press('Enter');await expect(page.locator('.command-bar-feedback')).toContainText('Filtered');
 if((page.viewportSize()?.width??1440)<600) await revealGridControl(page,page.locator('.ag-header-cell[col-id="amount"] .ag-header-cell-label'),400);
 await page.locator('.ag-header-cell[col-id="amount"] .ag-header-cell-label').click();
 await expect(page.locator('.ag-header-cell[col-id="amount"]')).toHaveAttribute('aria-sort','ascending');
 const ordered=()=>page.locator('.ag-row[row-id^="qa-"]').evaluateAll(els=>[...new Set(els.sort((a,b)=>Number(a.getAttribute('row-index'))-Number(b.getAttribute('row-index'))).map(el=>el.getAttribute('row-id')))]);
 await expect.poll(ordered).toEqual(['qa-reply','qa-low','qa-blocked','qa-paid','qa-high']);
 await page.reload();await expect.poll(ordered).toEqual(['qa-reply','qa-low','qa-blocked','qa-paid','qa-high']);
});

test('INVENTORY lead-time edit saves and rejected save restores the previous value',async({page})=>{
 await page.route('**/api/inventory',r=>r.fulfill({json:[{id:'qa-stock',sku:'QA',name:'QA stock',stock:20,daysOfCover:10,forecast:2,lower:1,upper:3,reorderPoint:10,mape:5,price:26,competitorMin:25,elasticity:-1,r2:0.8,leadTimeDays:5,spark:[1,2]}]}));
 let lead=5;await page.route('**/api/products/QA',r=>{const value=r.request().postDataJSON().leadTimeDays;if(value<1)return r.fulfill({status:422,json:{error:'QA invalid lead time'}});lead=value;return r.fulfill({json:{leadTimeDays:lead}});});
 await page.goto('/control?tab=inventory');const columns=page.getByRole('tab',{name:'Columns',exact:true});if(await columns.getAttribute('aria-expanded')==='true')await columns.click();
 await expect(page.locator('.ag-row[row-id="qa-stock"]').first()).toBeVisible();
 const cell=page.locator('.ag-row[row-id="qa-stock"] [col-id="leadTimeDays"]');
 await revealGridControl(page,cell,800);
 for(const value of ['9','0']){await cell.dblclick();const input=page.locator('.ag-cell-inline-editing input');await input.fill(value);await input.press('Enter');if(value==='9'){await expect(cell).toHaveText('9');await expect.poll(()=>lead).toBe(9);}else {await expect(page.getByRole('alert')).toContainText('QA invalid lead time');await expect(cell).toHaveText('9');}}
});

test('DETAILS Inbox, Inventory and Payouts expose expansion and dismissal',async({page})=>{
 const cases=[
 {tab:'inbox',path:'messages',row:{id:'qa-expand',simDay:1,customer:'QA customer',body:'QA message detail',policyReasons:[]},text:'QA message detail'},
 {tab:'inventory',path:'inventory',row:{id:'qa-expand',sku:'QA',name:'QA stock',stock:0,forecast:0,daysOfCover:999,leadTimeDays:5,reorderPoint:0,spark:[],mape:0,elasticity:0,r2:0,lower:0,upper:0,price:1,competitorMin:null},text:'Lead time'},
 {tab:'payouts',path:'payouts',row:{id:'qa-expand',createdAt:'2026-01-01T00:00:00Z',receiver:'qa@invalid.test',amount:1,status:'UNCLAIMED',senderBatchId:'qa-batch'},text:'qa@invalid.test'},
 ];
 for(const item of cases){
 await page.route(`**/api/${item.path}`,r=>r.fulfill({json:[item.row]}));await page.goto(`/control?tab=${item.tab}`);
 const columns=page.getByRole('tab',{name:'Columns',exact:true});if(await columns.count()&&await columns.getAttribute('aria-expanded')==='true')await columns.click();
 const expand=page.locator('.ag-row[row-id="qa-expand"] .ag-group-contracted:visible');await expand.click();await expect(page.locator('.detail').first()).toContainText(item.text);
 await page.locator('.ag-row[row-id="qa-expand"] .ag-group-expanded:visible').click();await expect(page.locator('.detail')).toHaveCount(0);
 }
});

test('INBOX full-stack approval updates Decisions, KPI, Inbox and Audit',async({page,request})=>{
 expect((await (await request.get('/healthz')).json()).dryRun).toBe(true);
 await request.post('/api/sim/reset',{headers:{'x-admin-token':'shopcrew-qa-only'},data:{}});await request.post('/api/sim/advance',{data:{}});
 const messages=await (await request.get('/api/messages')).json();const message=messages.find((m:any)=>m.proposalStatus==='pending_approval');expect(message).toBeTruthy();
 const before=await (await request.get('/api/kpis')).json();await page.goto('/control?tab=inbox');
 const row=page.locator(`.ag-row[row-id="${message.id}"]`);await row.locator('.ag-group-contracted:visible').click();
 await page.getByRole('button',{name:'Approve draft reply'}).click();
 await expect.poll(async()=>(await (await request.get(`/api/proposals/${message.proposalId}`)).json()).status).toBe('confirmed');
 await expect.poll(async()=>(await (await request.get('/api/messages')).json()).find((m:any)=>m.id===message.id).proposalStatus).toBe('confirmed');
 await expect(page.getByRole('button',{name:'Approve draft reply'})).toHaveCount(0);
 expect((await (await request.get('/api/kpis')).json()).pending).toBe(before.pending-1);
 const logs=await (await request.get('/api/audit')).json();expect(logs.some((a:any)=>a.proposalId===message.proposalId&&a.event==='proposal.approved')).toBe(true);
 await page.goto(`/control?tab=decisions&focus=${message.proposalId}`);await expect(page.locator('.decision-card')).toContainText('confirmed');
});

test('EDIT failed decision save restores amount with only one attempted write',async({page})=>{
 await fixture(page);let writes=0;await page.route('**/api/proposals/qa-high',r=>{writes++;return r.fulfill({status:422,json:{error:'QA amount rejected'}});});
 await page.goto('/control');await view(page,'Everything').click();
 const cell=page.locator('.ag-row[row-id="qa-high"] [col-id="amount"]');
 if((page.viewportSize()?.width??1440)<600)await revealGridControl(page,cell,400);
 await cell.dblclick();await page.locator('.ag-cell-inline-editing input').fill('20');await page.locator('.ag-cell-inline-editing input').press('Enter');
 await expect(page.getByRole('alert')).toContainText('QA amount rejected');await expect(cell).toContainText('45');expect(writes).toBe(1);
});

test('COMMAND every tab registers its grid, applies a command and can Undo',async({page})=>{
 let applied='';await page.route('**/api/nl/grid',route=>{applied=route.request().postDataJSON().grid;return route.fulfill({json:{grid:applied,explanation:`QA applied ${applied}`,simple:{filterModel:{},rowGroupCols:[]}}});});
 for(const tab of ['decisions','inbox','orders','payouts','inventory','policies','audit']){
 await page.goto(`/control?tab=${tab}`);await expect(page.locator('.ag-root-wrapper')).toBeVisible();await page.getByRole('textbox',{name:'Ask the grid'}).fill('clear all filters');await page.getByRole('textbox',{name:'Ask the grid'}).press('Enter');
 await expect(page.locator('.command-bar-feedback')).toContainText(`QA applied ${tab}`);expect(applied).toBe(tab);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.command-bar-feedback')).toContainText('Reverted');
 }
});
