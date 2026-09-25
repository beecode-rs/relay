export class OutputBatcher {
  private chunks: string[] = [];

  enqueue(chunk: string): void {
    if (chunk.length === 0) {
      return;
    }
    this.chunks.push(chunk);
  }

  drain(): string | null {
    if (this.chunks.length === 0) {
      return null;
    }
    const output = this.chunks.join('');
    this.chunks = [];
    return output;
  }

  clear(): void {
    this.chunks = [];
  }

  get pendingChunkCount(): number {
    return this.chunks.length;
  }
}
