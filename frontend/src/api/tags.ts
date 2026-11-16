import { fetchJson } from './client';
import type { MistakeCategory, ReviewTag, ReviewTagKind } from '../types';

export function getTags(kind?: ReviewTagKind): Promise<{ tags: ReviewTag[] }> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return fetchJson<{ tags: ReviewTag[] }>(`/api/tags${qs}`);
}

export function createTag(payload: {
  kind: ReviewTagKind;
  name: string;
  category?: MistakeCategory | '';
}): Promise<{ status: string; tag: ReviewTag }> {
  return fetchJson<{ status: string; tag: ReviewTag }>('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateTag(
  tagId: number,
  payload: { name?: string; category?: MistakeCategory | '' }
): Promise<{ status: string; tag: ReviewTag }> {
  return fetchJson<{ status: string; tag: ReviewTag }>(`/api/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteTag(
  tagId: number
): Promise<{ status: string; deleted_id: number; affected_trades: number }> {
  return fetchJson<{ status: string; deleted_id: number; affected_trades: number }>(
    `/api/tags/${tagId}`,
    { method: 'DELETE' }
  );
}
