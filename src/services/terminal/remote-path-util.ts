export const remotePathUtil = {
  join(params: { dir: string; name: string }): string {
    if (params.dir.endsWith('/')) {
      return `${params.dir}${params.name}`;
    }

    return `${params.dir}/${params.name}`;
  },

  normalizeRootPath(params: { path: string }): string {
    const trimmedPath = params.path.trim();
    if (trimmedPath === '' || trimmedPath === '/') {
      return '/';
    }
    const withoutLeadingSlashes = trimmedPath.replace(/^\/+/, '');
    const withLeadingSlash = `/${withoutLeadingSlashes}`;

    return withLeadingSlash.replace(/\/+$/, '') || '/';
  },

  toParentDir(params: { path: string }): string {
    const parentParts = remotePathUtil.toParts({ path: params.path }).slice(0, -1);
    if (parentParts.length === 0) {
      return '/';
    }

    return `/${parentParts.join('/')}`;
  },

  toParts(params: { path: string }): string[] {
    return params.path.split('/').filter((part) => {
      return part.length > 0;
    });
  },
};
