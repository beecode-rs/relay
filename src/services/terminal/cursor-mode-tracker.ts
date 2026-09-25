const MAX_FRAGMENT_LENGTH = 16;

export class CursorModeTracker {
  private fragment = '';
  private applicationCursorKeys = false;

  get isApplicationCursorKeys(): boolean {
    return this.applicationCursorKeys;
  }

  update(chunk: string): void {
    const data = this.fragment + chunk;
    const decckmPattern = /\x1b\[\?([0-9;]*)([hl])/g;
    Array.from(data.matchAll(decckmPattern)).forEach((match) => {
      if (match[1].split(';').includes('1')) {
        this.applicationCursorKeys = match[2] === 'h';
      }
    });
    const lastEscIndex = data.lastIndexOf('\x1b');
    if (lastEscIndex === -1) {
      this.fragment = '';
      return;
    }
    const tail = data.slice(lastEscIndex);
    this.fragment = tail.length < MAX_FRAGMENT_LENGTH ? tail : '';
  }

  reset(): void {
    this.fragment = '';
    this.applicationCursorKeys = false;
  }
}
