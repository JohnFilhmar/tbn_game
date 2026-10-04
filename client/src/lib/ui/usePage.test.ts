import { describe, expect, it } from 'vitest';
import { pageWindow } from './usePage';

describe('a page of rows', () => {
  it('slices rows a page at a time and keeps to the last page when rows shrink', () => {
    expect(pageWindow(60, 0, 25)).toEqual({ page: 0, pages: 3, start: 0, end: 25 });
    expect(pageWindow(60, 2, 25)).toEqual({ page: 2, pages: 3, start: 50, end: 60 });
    expect(pageWindow(30, 2, 25)).toEqual({ page: 1, pages: 2, start: 25, end: 30 });
    expect(pageWindow(0, 3, 25)).toEqual({ page: 0, pages: 1, start: 0, end: 0 });
  });
});
