import type { Dispatch, SetStateAction } from 'react';
import type { SearchResult } from '../../types/research';
import { compressVisualFile } from '../../features/public-search/visual-file';
import { request } from '../../lib/api';

type Dependencies = {
  visualFile: File | null;
  query?: string;
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
  query = '',
  setVisualBusy,
  setSearching,
  setError,
  setSearchResults,
  setSearchPlan,
  setSearchMeta,
  setSearchMode,
  notify,
}: Dependencies) {
  return async (userQuestion: string = query) => {
    if (!visualFile) return;

    setVisualBusy(true);
    setSearching(true);
    setError('');
    setSearchResults([]);
    setSearchPlan([]);
    setSearchMeta(null);

    try {
      const frames = await compressVisualFile(visualFile);
      const all: SearchResult[] = [];
      const queries = new Set<string>();
      const extractedTextParts = new Set<string>();
      const visualDetails = new Set<string>();
      let description = '';

      for (const imageDataUrl of frames) {
        const result = await request<{
          data: SearchResult[];
          meta: { description?: string; extractedText?: string; visualDetails?: string[]; queries?: string[]; notice?: string };
        }>('/public-search/visual-match', {
          method: 'POST',
          body: JSON.stringify({
            imageDataUrl,
            mediaType: visualFile.type.startsWith('video/') ? 'video-frame' : 'image',
            userQuestion: userQuestion.trim().slice(0, 500),
          }),
        });

        description = [description, result.meta?.description].filter(Boolean).join(' · ');
        if (result.meta?.extractedText?.trim()) extractedTextParts.add(result.meta.extractedText.trim());
        (result.meta?.visualDetails || []).forEach((detail) => visualDetails.add(detail));
        (result.meta?.queries || []).forEach((query) => queries.add(query));
        all.push(...(result.data || []));
      }

      const unique = new Map<string, SearchResult>();
      for (const item of all) {
        if (!item.url || unique.has(item.url)) continue;

        unique.set(item.url, {
          ...item,
          sourceType: item.thumbnailUrl ? 'video' : 'image',
          publisher: item.publisher || item.provider || 'Public media index',
          retrievedAt: item.retrievedAt || new Date().toISOString(),
          excerpt:
            item.excerpt ||
            'Related to the uploaded ' +
              (visualFile.type.startsWith('video/') ? 'video frame' : 'image') +
              ' based on visual description.',
        });
      }

      const results = [...unique.values()].slice(0, 40);
      setSearchResults(results);
      setSearchMode('images');
      setSearchMeta({
        visualMatch: true,
        description,
        queries: [...queries],
        extractedText: [...extractedTextParts].join('\n\n'),
        visualDetails: [...visualDetails],
        framesAnalysed: frames.length,
        notice: 'ADVERSE reads visible text and analyzes sampled frames. Search results are contextually related candidates, not exact copies or confirmed identities.',
      });

      if (results.length) {
        notify('Visual analysis complete: read ' + extractedTextParts.size + ' text extract(s) and found ' + results.length + ' related public media results.');
      } else {
        setError('Visual analysis completed, but no related public results were found. Try another frame or image.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Visual search could not complete.');
    } finally {
      setVisualBusy(false);
      setSearching(false);
    }
  };
}
