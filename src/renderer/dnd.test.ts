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

  function dragEvent(type: string, types: string[] | null): Event {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    if (types !== null) {
      (ev as unknown as { dataTransfer: unknown }).dataTransfer = { types, files: {} };
    }
    return ev;
  }

  it('adds the highlight class on dragenter with files', () => {
    const el = document.createElement('div');
    attachDropZone(el, () => {});
    el.dispatchEvent(dragEvent('dragenter', ['Files']));
    expect(el.classList.contains('is_dragover')).toBe(true);
  });

  it('keeps the class while passing over children and removes it on the last dragleave', () => {
    const el = document.createElement('div');
    attachDropZone(el, () => {});
    // 親に enter → 子に enter（親には leave が飛ぶ）の順で depth を数える。
    el.dispatchEvent(dragEvent('dragenter', ['Files']));
    el.dispatchEvent(dragEvent('dragenter', ['Files']));
    el.dispatchEvent(dragEvent('dragleave', ['Files']));
    expect(el.classList.contains('is_dragover')).toBe(true);
    el.dispatchEvent(dragEvent('dragleave', ['Files']));
    expect(el.classList.contains('is_dragover')).toBe(false);
  });

  it('removes the class on drop and still calls onDrop', () => {
    const el = document.createElement('div');
    let called = false;
    attachDropZone(el, () => {
      called = true;
    });
    el.dispatchEvent(dragEvent('dragenter', ['Files']));
    el.dispatchEvent(dragEvent('drop', ['Files']));
    expect(el.classList.contains('is_dragover')).toBe(false);
    expect(called).toBe(true);
  });

  it('does not add the class when the drag has no files', () => {
    const el = document.createElement('div');
    attachDropZone(el, () => {});
    el.dispatchEvent(dragEvent('dragenter', ['text/plain']));
    expect(el.classList.contains('is_dragover')).toBe(false);
  });
});
