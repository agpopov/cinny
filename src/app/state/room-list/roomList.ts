import { atom } from 'jotai';
import { MatrixClient } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { Membership } from '../../../types/matrix/room';
import { type RoomsAction, useBindRoomsWithMembershipsAtom } from './utils';

const baseRoomsAtom = atom<string[]>([]);
export const allRoomsAtom = atom<string[], [RoomsAction], undefined>(
  (get) => get(baseRoomsAtom),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomsAtom, action.rooms);
      return;
    }
    set(baseRoomsAtom, (ids) => {
      if (action.type === 'PUT') return ids.includes(action.roomId) ? ids : [...ids, action.roomId];
      return ids.includes(action.roomId) ? ids.filter((id) => id !== action.roomId) : ids;
    });
  }
);
export const useBindAllRoomsAtom = (mx: MatrixClient, allRooms: typeof allRoomsAtom) => {
  useBindRoomsWithMembershipsAtom(
    mx,
    allRooms,
    useMemo(() => [Membership.Join], [])
  );
};
