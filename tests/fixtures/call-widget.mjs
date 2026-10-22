import { EventEmitter } from 'node:events';

// Widget IPC and DOM controls are outside the CallEmbed lifecycle under test.
export class CallWidgetDriver {}
export class Widget {}
export class WidgetDriver {}
export class CallControl {
  startObserving() {}
  dispose() {}
}
export class ClientWidgetApi extends EventEmitter {
  transport = { send: async () => ({}) };
  setViewedRoomId() {}
  stop() {}
}
export const ElementWidgetActions = {
  JoinCall: 'io.element.join',
  DeviceMute: 'io.element.device_mute',
};
export const ElementCallIntent = {};
export const WidgetApiToWidgetAction = {};
