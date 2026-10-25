import { ReactNode, createElement, useEffect, useState } from 'react';

import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useBindAtoms } from '../../state/hooks/useBindAtoms';
import { ClientRootLoading } from './ClientRoot';

type ClientBindAtomsProps = {
  children: ReactNode;
};
export function ClientBindAtoms({ children }: ClientBindAtomsProps) {
  const mx = useMatrixClient();
  const [initializedClient, setInitializedClient] = useState<typeof mx>();
  useBindAtoms(mx);
  // Seed room membership, directs, parents and unread state before navigation.
  useEffect(() => setInitializedClient(mx), [mx]);

  return initializedClient === mx ? children : createElement(ClientRootLoading);
}
