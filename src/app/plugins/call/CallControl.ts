import type { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'events';
import { CallControlState } from './CallControlState';
import {
  type ElementMediaStateDetail,
  type ElementMediaStatePayload,
  ElementWidgetActions,
} from './types';

export const CallControlEvent = { StateUpdate: 'state_update' } as const;

export class CallControl extends EventEmitter implements CallControlState {
  private state: CallControlState;

  private call: ClientWidgetApi;

  private iframe: HTMLIFrameElement;

  private bodyMutationObserver: MutationObserver;

  private mediaStatePromiseResolver: undefined | (() => void);

  private mediaStatePromiseRejecter: undefined | ((reason: Error) => void);

  private mediaTimer?: ReturnType<typeof setTimeout>;

  private disposed = false;

  public error?: string;

  private get document(): Document | undefined {
    return this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
  }

  constructor(state: CallControlState, call: ClientWidgetApi, iframe: HTMLIFrameElement) {
    super();

    this.state = state;
    this.call = call;
    this.iframe = iframe;

    this.bodyMutationObserver = new MutationObserver(this.onBodyMutation.bind(this));
  }

  public getState(): CallControlState {
    return this.state;
  }

  public get microphone(): boolean {
    return this.state.microphone;
  }

  public get video(): boolean {
    return this.state.video;
  }

  public get sound(): boolean {
    return this.state.sound;
  }

  public get screenshare(): boolean {
    return this.state.screenshare;
  }

  public get spotlight(): boolean {
    return this.state.spotlight;
  }

  public async applyState() {
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
    });
    this.setSound(this.sound);
    this.emitStateUpdate();
  }

  public startObserving() {
    if (!this.document) return;

    this.bodyMutationObserver.observe(this.document.body, {
      childList: true,
      subtree: true, // New participants attach audio inside the React root.
    });
    this.onBodyMutation();
  }

  private onBodyMutation() {
    if (!this.document) return;

    this.document.body.style.setProperty('background', 'none', 'important');

    this.applySound();
  }

  public applySound() {
    this.setSound(this.sound);
  }

  private async setMediaState(state: ElementMediaStatePayload): Promise<void> {
    if (this.disposed) throw new Error('Звонок завершён');
    if (this.mediaStatePromiseResolver) throw new Error('Дождитесь переключения устройства');
    // Subscribe before sending: a device event can precede the transport ACK.
    return new Promise<void>((resolve, reject) => {
      let completed = false;
      const finish = (error?: Error) => {
        if (completed) return;
        completed = true;
        clearTimeout(this.mediaTimer);
        this.mediaStatePromiseResolver = undefined;
        this.mediaStatePromiseRejecter = undefined;
        this.error = error?.message;
        this.emitStateUpdate();
        if (error) reject(error);
        else resolve();
      };
      this.mediaStatePromiseResolver = () => finish();
      this.mediaStatePromiseRejecter = (error) => finish(error);
      this.mediaTimer = setTimeout(
        () =>
          finish(
            new Error(
              'Устройство не ответило. Проверьте разрешения микрофона и камеры в настройках звонка и системы.'
            )
          ),
        10000
      );
      this.call.transport
        .send(ElementWidgetActions.DeviceMute, state)
        .then((response) => {
          // Element Call replies with media state even if no change event is
          // emitted (for example, applying an already selected initial state).
          const data = response as ElementMediaStatePayload;
          if (
            !completed &&
            data &&
            (typeof data.audio_enabled === 'boolean' || typeof data.video_enabled === 'boolean')
          ) {
            this.onMediaState({ detail: { data } } as CustomEvent<ElementMediaStateDetail>);
          }
        })
        .catch((cause) => finish(cause instanceof Error ? cause : new Error(String(cause))));
    });
  }

  private setSound(sound: boolean): void {
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    if (callDocument) {
      callDocument.querySelectorAll('audio').forEach((el) => {
        // eslint-disable-next-line no-param-reassign
        el.muted = !sound;
      });
    }
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      data.video_enabled ?? this.video,
      this.sound,
      this.screenshare,
      this.spotlight
    );

    this.state = state;
    this.emitStateUpdate();

    if (this.microphone && !this.sound) {
      this.toggleSound();
    }

    if (this.mediaStatePromiseResolver) {
      this.mediaStatePromiseResolver();
      this.mediaStatePromiseResolver = undefined;
    }
  }

  public toggleMicrophone() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: !this.microphone,
      video_enabled: this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleVideo() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: this.microphone,
      video_enabled: !this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleSound() {
    const sound = !this.sound;

    this.setSound(sound);

    const state = new CallControlState(
      this.microphone,
      this.video,
      sound,
      this.screenshare,
      this.spotlight
    );
    this.state = state;
    this.emitStateUpdate();

    if (!this.sound && this.microphone) {
      this.toggleMicrophone().catch(() => undefined);
    }
  }

  public dispose() {
    this.disposed = true;
    this.mediaStatePromiseRejecter?.(new Error('Звонок завершён'));
    clearTimeout(this.mediaTimer);
    this.bodyMutationObserver.disconnect();
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
