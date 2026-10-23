import { t } from 'i18next';
import React, { useEffect, useCallback, FormEventHandler } from 'react';
import { Dialog, Text, Box, Button, config, Input } from 'folds';
import { AuthType } from 'matrix-js-sdk';
import { StageComponentProps } from './types';

function RegistrationTokenErrorDialog({
  title,
  message,
  defaultToken,
  onRetry,
  onCancel,
}: {
  title: string;
  message: string;
  defaultToken?: string;
  onRetry: (token: string) => void;
  onCancel: () => void;
}) {
  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { retryTokenInput } = evt.target as HTMLFormElement & {
      retryTokenInput: HTMLInputElement;
    };
    const retryToken = retryTokenInput.value;
    onRetry(retryToken);
  };

  return (
    <Dialog>
      <Box
        as="form"
        onSubmit={handleFormSubmit}
        style={{ padding: config.space.S400 }}
        direction="Column"
        gap="400"
      >
        <Box direction="Column" gap="100">
          <Text size="H4">{title}</Text>
          <Text>{message}</Text>
          <Text as="label" size="L400" style={{ paddingTop: config.space.S400 }}>
            {t('Registration Token')}
          </Text>
          <Input
            name="retryTokenInput"
            variant="Background"
            size="500"
            outlined
            defaultValue={defaultToken}
            required
          />
        </Box>
        <Button variant="Critical" type="submit">
          <Text as="span" size="B400">
            {t('Retry')}
          </Text>
        </Button>
        <Button variant="Critical" fill="None" outlined type="button" onClick={onCancel}>
          <Text as="span" size="B400">
            {t('Cancel')}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}

export function RegistrationTokenStageDialog({
  token,
  stageData,
  submitAuthDict,
  onCancel,
}: StageComponentProps & {
  token?: string;
}) {
  const { errorCode, error, session } = stageData;

  const handleSubmit = useCallback(
    (registrationToken: string) => {
      submitAuthDict({
        type: AuthType.RegistrationToken,
        token: registrationToken,
        session,
      });
    },
    [session, submitAuthDict]
  );

  useEffect(() => {
    if (token && !errorCode) handleSubmit(token);
  }, [handleSubmit, token, errorCode]);

  if (errorCode) {
    return (
      <RegistrationTokenErrorDialog
        defaultToken={token}
        title={errorCode}
        message={error ?? t('Invalid registration token provided.')}
        onRetry={handleSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (!token) {
    return (
      <RegistrationTokenErrorDialog
        defaultToken={token}
        title={t('Registration Token')}
        message={t('Please submit registration token provided by you homeserver admin.')}
        onRetry={handleSubmit}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
