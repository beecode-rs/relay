export const versionUtil = {
  compare(params: { base: string; candidate: string }): number {
    const baseParts = versionUtil.parseVersion({ version: params.base });
    const candidateParts = versionUtil.parseVersion({ version: params.candidate });
    if (baseParts === undefined || candidateParts === undefined) {
      return 0;
    }

    return versionUtil.compareParts({ baseParts, candidateParts });
  },

  compareParts(params: { baseParts: number[]; candidateParts: number[] }): number {
    const partCount = Math.max(params.baseParts.length, params.candidateParts.length);

    return (
      Array.from({ length: partCount }, (unused, index) => {
        return (params.baseParts[index] ?? 0) - (params.candidateParts[index] ?? 0);
      }).find((difference) => {
        return difference !== 0;
      }) ?? 0
    );
  },

  isNewerVersion(params: { base: string; candidate: string }): boolean {
    return versionUtil.compare(params) < 0;
  },

  parseVersion(params: { version: string }): number[] | undefined {
    const withoutPrefix = params.version.replace(/^v/i, '');
    const parts = withoutPrefix.split('.').map((part) => {
      return Number.parseInt(part, 10);
    });
    const hasInvalidPart =
      parts.length === 0 ||
      parts.some((part) => {
        return Number.isNaN(part) || part < 0;
      });
    if (hasInvalidPart) {
      return undefined;
    }

    return parts;
  },
};
