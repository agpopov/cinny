import { t } from 'i18next';
import { useMemo } from 'react';
import { MemberPowerTag } from '../../types/matrix/room';

const DEFAULT_TAG: MemberPowerTag = {
  name: 'Founder',
  color: '#0000ff',
};

export const useRoomCreatorsTag = (): MemberPowerTag =>
  useMemo(() => ({ ...DEFAULT_TAG, name: t(DEFAULT_TAG.name) }), []);
