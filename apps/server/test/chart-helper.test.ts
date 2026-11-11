import { afterEach, expect, it, vi } from 'vitest';
import { openIntegratedChart } from '../../web/src/grids/chartHelpers.js';
import type { GridApi } from 'ag-grid-community';
afterEach(()=>vi.unstubAllGlobals());
function grid(count:number){
 const state=[{colId:'agent',hide:true,rowGroup:true,rowGroupIndex:0},{colId:'amount',width:110,sort:'asc'}];
 const node={id:'qa-node',group:true,master:false,expanded:false,setExpanded:vi.fn()};
 const api={getColumnState:()=>state,forEachNode:(callback:any)=>callback(node),getRowGroupColumns:()=>[{getColId:()=> 'agent'}],setRowGroupColumns:vi.fn(),setColumnsVisible:vi.fn(),getDisplayedRowCount:()=>count,createRangeChart:vi.fn(),applyColumnState:vi.fn(),isDestroyed:()=>false};
 return {api,node,state};
}
it('chart creation snapshots matching rows and restores column layout and expansion',()=>{
 let frame!:()=>void;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frame=callback;});const {api,node,state}=grid(2);
 openIntegratedChart(api as unknown as GridApi,{chartType:'pie',columns:['agent','amount'],title:'QA spend'});
 expect(api.createRangeChart).toHaveBeenCalledWith(expect.objectContaining({aggFunc:'sum',unlinkChart:true,cellRange:{columns:['agent','amount'],rowStartIndex:0,rowEndIndex:1}}));
 frame();expect(api.applyColumnState).toHaveBeenCalledWith({state,applyOrder:true});expect(node.setExpanded).toHaveBeenCalledWith(false);
});
it('an empty chart selection preserves layout without opening a misleading chart',()=>{
 const {api,state}=grid(0);openIntegratedChart(api as unknown as GridApi,{chartType:'pie',columns:['agent','amount'],title:'Empty'});
 expect(api.createRangeChart).not.toHaveBeenCalled();expect(api.applyColumnState).toHaveBeenCalledWith({state,applyOrder:true});
});
