import type { Dispatch, SetStateAction } from 'react';
import type { SearchResult } from '../../types/research';
import { compressVisualFile } from '../../features/public-search/visual-file';
import { request } from '../../lib/api';

type Dependencies = {
  visualFile: File | null;
  setVisualBusy: Dispatch<SetStateAction<boolean>>;
  setSearching: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>;
  setSearchPlan: Dispatch<SetStateAction<{ query: string; reason: string }[]>>;
  setSearchMeta: Dispatch<SetStateAction<any>>;
  setSearchMode: Dispatch<SetStateAction<'web' | 'images' | 'videos' | 'people'>>;
  notify: (message: string) => void;
};

export function createVisualSearchAction({
  visualFile,
  setVisualBusy,
  setSearching,
  setError,
  setSearchResults,
  setSearchPlan,
  setSearchMeta,
  setSearchMode,
  notify,
}: Dependencies) {
  return async () =>{if(!visualFile)return;setVisualBusy(true);setSearching(true);setError('');setSearchResults([]);setSearchPlan([]);setSearchMeta(null);try{const frames=await compressVisualFile(visualFile);const all:any[]=[];const queries=new Set<string>();let description='';for(let i=0;i<frames.length;i++){const result=await request<{data:SearchResult[];meta:{description?:string;queries?:string[];notice?:string}}>('/public-search/visual-match',{method:'POST',body:JSON.stringify({imageDataUrl:frames[i],mediaType:visualFile.type.startsWith('video/')?'video-frame':'image'})});description=[description,result.meta?.description].filter(Boolean).join(' · ');(result.meta?.queries||[]).forEach(q=>queries.add(q));all.push(...(result.data||[]));}const unique=new Map<string,SearchResult>();for(const item of all){if(item.url&&!unique.has(item.url))unique.set(item.url,{...item,sourceType:item.thumbnailUrl?'video':'image',publisher:item.publisher||item.provider||'Public media index',retrievedAt:item.retrievedAt||new Date().toISOString(),excerpt:item.excerpt||('Related to the uploaded '+(visualFile.type.startsWith('video/')?'video frame':'image')+' based on visual description.')});}const results=[...unique.values()].slice(0,40);setSearchResults(results);setSearchMode('images');setSearchMeta({visualMatch:true,description,queries:[...queries],notice:'Visual description search: candidates may be contextually similar, not exact copies.'});if(results.length)notify('Visual analysis complete: found '+results.length+' related public media results.');else setError('Visual analysis completed, but no related public results were found. Try another frame or image.');}catch(e){setError(e instanceof Error?e.message:'Visual search could not complete.');}finally{setVisualBusy(false);setSearching(false);}};
}
