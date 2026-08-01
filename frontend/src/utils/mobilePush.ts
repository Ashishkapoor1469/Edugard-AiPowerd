import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import axios from "axios";
import toast from "react-hot-toast";

let initialized = false;

export async function initializeMobilePush() {
  if (!Capacitor.isNativePlatform() || import.meta.env.VITE_PUSH_ENABLED !== "true") return;

  try {
    if (!initialized) {
      initialized = true;
      await PushNotifications.createChannel({ id: "eduguard_normal", name: "EduGuard", importance: 3, visibility: 1 });
      await PushNotifications.createChannel({ id: "eduguard_important", name: "Important EduGuard alerts", importance: 5, visibility: 1, sound: "default" });
      await PushNotifications.addListener("registration", ({ value }) => {
        localStorage.setItem("pushDeviceToken", value);
        void axios.put("/api/push/devices", { token: value, platform: Capacitor.getPlatform() });
      });
      await PushNotifications.addListener("registrationError", (error) => console.error("Push registration failed", error));
      await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        toast(notification.body || notification.title || "New notification", {
          icon: notification.data?.priority === "important" ? "!" : undefined,
          duration: notification.data?.priority === "important" ? 8000 : 4000,
        });
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const path = notification.data?.path;
        if (typeof path === "string" && path.startsWith("/")) window.location.assign(path);
      });
    }

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
    if (permission.receive === "granted") await PushNotifications.register();
  } catch (error) {
    initialized = false;
    console.warn("Push notifications unavailable; login will continue", error);
  }
}

export async function unregisterMobilePush() {
  const token = localStorage.getItem("pushDeviceToken");
  if (!Capacitor.isNativePlatform() || !token) return;
  try { await axios.delete("/api/push/devices", { data: { token, platform: Capacitor.getPlatform() } }); }
  catch (error) { console.warn("Push token cleanup failed", error); }
}
