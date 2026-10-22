import React, { ReactNode } from 'react';
import { IconSrc, Icons } from 'folds';
import { MatrixEvent } from 'matrix-js-sdk';
import { IMemberContent, Membership } from '../../types/matrix/room';
import { getMxIdLocalPart } from '../utils/matrix';
import { isMembershipChanged } from '../utils/room';

export type ParsedResult = {
  icon: IconSrc;
  body: ReactNode;
};

export type MemberEventParser = (mEvent: MatrixEvent) => ParsedResult;

export const useMemberEventParser = (): MemberEventParser => {
  const parseMemberEvent: MemberEventParser = (mEvent) => {
    const content = mEvent.getContent<IMemberContent>();
    const prevContent = mEvent.getPrevContent() as IMemberContent;
    const senderId = mEvent.getSender();
    const userId = mEvent.getStateKey();
    const reason = typeof content.reason === 'string' ? content.reason : undefined;

    if (!senderId || !userId)
      return {
        icon: Icons.User,
        body: 'Повреждённое событие участия',
      };

    const senderName = getMxIdLocalPart(senderId);
    const userName =
      typeof content.displayname === 'string'
        ? content.displayname || getMxIdLocalPart(userId)
        : getMxIdLocalPart(userId);

    if (isMembershipChanged(mEvent)) {
      if (content.membership === Membership.Invite) {
        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightPlus,
            body: (
              <>
                <b>{senderName}</b>
                {' одобрил(а) заявку пользователя '}
                <b>{userName}</b>
                {' · '}
                {reason}
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <b>{senderName}</b>
              {' пригласил(а) '}
              <b>{userName}</b> {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Knock) {
        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <b>{userName}</b>
              {' запросил(а) вступление в комнату '}
              {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Join) {
        return {
          icon: Icons.ArrowGoRight,
          body: (
            <>
              <b>{userName}</b>
              {' присоединился(ась) к комнате'}
            </>
          ),
        };
      }

      if (content.membership === Membership.Leave) {
        if (prevContent.membership === Membership.Invite) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <b>{userName}</b>
                  {' отклонил(а) приглашение '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' отозвал(а) приглашение пользователя '}
                  <b>{userName}</b>
                  {' · '}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <b>{userName}</b>
                  {' отозвал(а) заявку на вступление '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' отклонил(а) заявку пользователя '}
                  <b>{userName}</b>
                  {' · '}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Ban) {
          return {
            icon: Icons.ArrowGoLeft,
            body: (
              <>
                <b>{senderName}</b>
                {' снял(а) блокировку с '}
                <b>{userName}</b> {reason}
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoLeft,
          body:
            senderId === userId ? (
              <>
                <b>{userName}</b>
                {' покинул(а) комнату '}
                {reason}
              </>
            ) : (
              <>
                <b>{senderName}</b>
                {' исключил(а) '}
                <b>{userName}</b> {reason}
              </>
            ),
        };
      }

      if (content.membership === Membership.Ban) {
        return {
          icon: Icons.ArrowGoLeft,
          body: (
            <>
              <b>{senderName}</b>
              {' заблокировал(а) '}
              <b>{userName}</b> {reason}
            </>
          ),
        };
      }
    }

    if (content.displayname !== prevContent.displayname) {
      const prevUserName =
        typeof prevContent.displayname === 'string'
          ? prevContent.displayname || getMxIdLocalPart(userId)
          : getMxIdLocalPart(userId);

      return {
        icon: Icons.Mention,
        body:
          typeof content.displayname === 'string' ? (
            <>
              <b>{prevUserName}</b>
              {' изменил(а) имя на '}
              <b>{userName}</b>
            </>
          ) : (
            <>
              <b>{prevUserName}</b>
              {' удалил(а) имя '}
            </>
          ),
      };
    }
    if (content.avatar_url !== prevContent.avatar_url) {
      return {
        icon: Icons.User,
        body:
          content.avatar_url && typeof content.avatar_url === 'string' ? (
            <>
              <b>{userName}</b>
              {' изменил(а) аватар'}
            </>
          ) : (
            <>
              <b>{userName}</b>
              {' удалил(а) аватар '}
            </>
          ),
      };
    }

    return {
      icon: Icons.User,
      body: 'Событие участия без изменений',
    };
  };

  return parseMemberEvent;
};
