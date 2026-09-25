import { OutputBatcher } from '@/services/terminal/output-batcher';

describe('OutputBatcher', () => {
  it('returns null when nothing was enqueued', () => {
    expect(new OutputBatcher().drain()).toBeNull();
  });

  it('returns null for an empty chunk', () => {
    const batcher = new OutputBatcher();
    batcher.enqueue('');
    expect(batcher.drain()).toBeNull();
  });

  it('coalesces a thousand writes into a single drained string', () => {
    const batcher = new OutputBatcher();
    const chunks = Array.from({ length: 1000 }, (_value, index) => {
      return `chunk-${index};`;
    });
    chunks.forEach((chunk) => {
      batcher.enqueue(chunk);
    });
    expect(batcher.pendingChunkCount).toBe(1000);
    expect(batcher.drain()).toBe(chunks.join(''));
    expect(batcher.drain()).toBeNull();
  });

  it('drains again after new data arrives', () => {
    const batcher = new OutputBatcher();
    batcher.enqueue('a');
    expect(batcher.drain()).toBe('a');
    batcher.enqueue('b');
    expect(batcher.drain()).toBe('b');
  });

  it('clear drops pending chunks', () => {
    const batcher = new OutputBatcher();
    batcher.enqueue('a');
    batcher.clear();
    expect(batcher.drain()).toBeNull();
  });
});
