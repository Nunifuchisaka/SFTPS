// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { attachDropZone } from './dnd';

describe('attachDropZone', () => {
  it('calls onDrop with the dropped files and prevents default', () => {
    const el = document.createElement('div');
    let received: FileList | null = null;
    attachDropZone(el, (files) => {
      received = files;
    });

    const fakeFiles = { length: 2, 0: { name: 'a.txt' }, 1: { name: 'b.txt' } } as unknown as FileList;
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    (ev as unknown as { dataTransfer: unknown }).dataTransfer = { files: fakeFiles };

    const notCanceled = el.dispatchEvent(ev);
    expect(notCanceled).toBe(false); // preventDefault was called
    expect(received).toBe(fakeFiles);
  });

  it('does not throw on dragover (enables dropping)', () => {
    const el = document.createElement('div');
    attachDropZone(el, () => {});
    const ev = new Event('dragover', { bubbles: true, cancelable: true });
    const notCanceled = el.dispatchEvent(ev);
    expect(notCanceled).toBe(false);
  });
});
