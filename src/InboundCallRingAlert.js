import { FlexPlugin } from '@twilio/flex-plugin';
const PLUGIN_NAME = 'InboundCallRingAlert';

export default class InboundCallRingAlert extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  init(flex, manager) {
    let audio = new Audio(
      process.env.REACT_APP_RINGTONE_URL
    );

    // Подписка на afterRejectTask для фиксации отказа
    flex.Actions.addListener('afterRejectTask', async (payload) => {
      const task = payload.task;
      const attrs = task?.attributes ?? {};
      const rejected = new Set(attrs.rejected_workers || []);
      rejected.add(manager.workerClient.sid);
      await task.setAttributes({ ...attrs, rejected_workers: [...rejected] });
    });

    const pausableResStatus = ['accepted', 'canceled', 'rejected', 'rescinded', 'timeout'];

    manager.workerClient.on('reservationCreated', function (reservation) {
      if (
        reservation.task.taskChannelUniqueName === 'voice' &&
        reservation.task.attributes &&
        reservation.task.attributes.direction === 'inbound'
      ) {
        manager.voiceClient.audio.ringtoneDevices.get().forEach(device => {
          audio.setSinkId(device.deviceId);
        });
        audio.play();
      }

      pausableResStatus.forEach((pausableResStatus) => {
        reservation.on(pausableResStatus, () => {
          audio.pause();
        });
      });
    });
  }
}
