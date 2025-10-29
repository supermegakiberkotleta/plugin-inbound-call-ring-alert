import { FlexPlugin } from "@twilio/flex-plugin";
import * as Flex from "@twilio/flex-ui";

const PLUGIN_NAME = "InboundCallRingAlert";

export default class InboundCallRingAlert extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  init(flex, manager) {
    // 🔔 Ringtone setup
    let audio = new Audio(process.env.REACT_APP_RINGTONE_URL);

    // Register string template for notification
    // (Flex подставит {{message}} из showNotification)
    manager.strings.IncomingCallContent = "{{message}}";

    // Register custom notification (строка, а не функция!)
    Flex.Notifications.registerNotification({
      id: "IncomingCallNumber",
      content: "IncomingCallContent", // ссылка на шаблон из manager.strings
      timeout: 12000, // уведомление показывается 12 секунд
      type: Flex.NotificationType.info,
    });

    // Track rejected workers after rejecting a task
    flex.Actions.addListener("afterRejectTask", async (payload) => {
      const task = payload.task;
      const attrs = task?.attributes ?? {};
      const rejected = new Set(attrs.rejected_workers || []);
      rejected.add(manager.workerClient.sid);
      await task.setAttributes({ ...attrs, rejected_workers: [...rejected] });
    });

    const pausableResStatus = [
      "accepted",
      "canceled",
      "rejected",
      "rescinded",
      "timeout",
    ];

    // 🔔 Handle inbound call event
    manager.workerClient.on("reservationCreated", async function (reservation) {
      const task = reservation.task;

      if (
        task.taskChannelUniqueName === "voice" &&
        task.attributes &&
        task.attributes.direction === "inbound"
      ) {
        const toNumber = task.attributes.to;
        console.log("📞 Incoming call to number:", toNumber);

        // Play ringtone on proper output devices
        manager.voiceClient.audio.ringtoneDevices.get().forEach((device) => {
          audio.setSinkId(device.deviceId);
        });
        audio.play();

        // Lookup Salesforce user through Laravel API
        try {
          const response = await fetch(
            `https://lenderpro.itprofit.net/api/v1/twilio/lookup`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ phone: toNumber }),
            }
          );

          if (!response.ok) throw new Error("Laravel API request failed");

          const data = await response.json();

          // ✅ Extract user info from data.lookup
          let user = null;
          if (
            data?.lookup &&
            Array.isArray(data.lookup) &&
            data.lookup.length > 0
          ) {
            user = data.lookup[0];
          }

          const managerName = user?.Name || "Unknown manager";
          console.log("👤 Matched Salesforce User:", managerName);

          // ✅ Show notification with final message
          Flex.Notifications.showNotification("IncomingCallNumber", {
            message: `📞 Incoming call to ${toNumber} (${managerName})`,
          });
        } catch (err) {
          console.error("Error while requesting Laravel API:", err);
          Flex.Notifications.showNotification("IncomingCallNumber", {
            message: `📞 Incoming call to ${toNumber} (Unknown manager)`,
          });
        }
      }

      // Stop ringtone when call status changes
      pausableResStatus.forEach((status) => {
        reservation.on(status, () => {
          audio.pause();
        });
      });
    });
  }
}
