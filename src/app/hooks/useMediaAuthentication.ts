import { useSpecVersions } from './useSpecVersions';

export const useMediaAuthentication = (): boolean => {
  const { versions, unstable_features: unstableFeatures } = useSpecVersions();

  // Media authentication is introduced in spec version 1.11
  const authenticatedMedia =
    unstableFeatures?.['org.matrix.msc3916.stable'] ||
    versions.some((version) => {
      const match = /^v(\d+)\.(\d+)$/.exec(version);
      return (
        !!match && (Number(match[1]) > 1 || (Number(match[1]) === 1 && Number(match[2]) >= 11))
      );
    });

  return authenticatedMedia;
};
