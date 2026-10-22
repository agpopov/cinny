import { t } from 'i18next';
import React from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SystemNotification } from './SystemNotification';
import { DesktopAppSettings, DoNotDisturbSettings } from './DesktopNotificationSettings';
import { AllMessagesNotifications } from './AllMessages';
import { SpecialMessagesNotifications } from './SpecialMessages';
import { KeywordMessagesNotifications } from './KeywordMessages';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';

type NotificationsProps = {
  requestClose: () => void;
};
export function Notifications({ requestClose }: NotificationsProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              {t('Notifications')}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton aria-label="Закрыть" onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <SystemNotification />
              <DoNotDisturbSettings />
              <DesktopAppSettings />
              <AllMessagesNotifications />
              <SpecialMessagesNotifications />
              <KeywordMessagesNotifications />
              <Box direction="Column" gap="100">
                <Text size="L400">{t('Block Messages')}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile description="Эта настройка перенесена в раздел «Аккаунт → Заблокированные пользователи»." />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
