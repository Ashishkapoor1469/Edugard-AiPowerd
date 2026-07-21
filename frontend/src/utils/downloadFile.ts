import { Capacitor, registerPlugin } from "@capacitor/core";
import axios from "axios";

const NativeDownloader = registerPlugin<{ download(options: { url: string; fileName: string; mimeType: string; token?: string }): Promise<void> }>("NativeDownloader");

export const downloadFile = async (url: string, fileName: string, mimeType: string) => {
  if (Capacitor.getPlatform() === "android") {
    await NativeDownloader.download({
      url: new URL(axios.getUri({ url }), window.location.href).href,
      fileName,
      mimeType,
      token: localStorage.getItem("token") || undefined,
    });
    return "started";
  }

  const response = await axios.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return "downloaded";
};
