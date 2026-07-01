import { HubConnectionBuilder, HubConnection, HttpTransportType } from "@microsoft/signalr";

class SignalRWrapper {
  private connection: HubConnection | null = null;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private connectPromise: Promise<void> | null = null;

  constructor() {
    this.initConnection();
  }

  private initConnection() {
    this.connection = new HubConnectionBuilder()
      .withUrl("http://localhost:5000/eduguardHub", {
        accessTokenFactory: () => localStorage.getItem("token") || "",
        skipNegotiation: true,
        transport: HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .build();

    this.connection.onclose(() => {
      console.log("[SignalR] Connection closed.");
      this.connectPromise = null;
    });

    this.connection.onreconnected(() => {
      console.log("[SignalR] Reconnected successfully.");
    });
  }

  /** Ensures a single connection attempt is shared across all callers */
  connect(): Promise<void> {
    if (!this.connection) {
      this.initConnection();
    }

    // Already connected
    if (this.connection && this.connection.state === "Connected") {
      return Promise.resolve();
    }

    // Connection attempt already in progress — reuse it
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.connection && this.connection.state === "Disconnected") {
      this.connectPromise = (async () => {
        try {
          await this.connection!.start();
          console.log("[SignalR] Connected successfully.");

          // Re-attach any listeners that were registered before connection
          this.eventListeners.forEach((callbacks, eventName) => {
            callbacks.forEach(callback => {
              this.connection?.on(eventName, callback);
            });
          });
        } catch (err) {
          console.error("[SignalR] Connection error:", err);
          this.connectPromise = null;
          throw err;
        }
      })();

      return this.connectPromise;
    }

    // Connecting state — wait for it
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.connection?.state === "Connected") {
          clearInterval(check);
          resolve();
        }
      }, 100);
      // Timeout after 10s
      setTimeout(() => { clearInterval(check); resolve(); }, 10000);
    });
  }

  async disconnect() {
    if (this.connection && this.connection.state !== "Disconnected") {
      try {
        await this.connection.stop();
        this.connectPromise = null;
        console.log("[SignalR] Disconnected.");
      } catch (err) {
        console.error("[SignalR] Disconnect error:", err);
      }
    }
  }

  /** Waits for connection then invokes the hub method — never silently drops */
  async emit(eventName: string, data: any) {
    // Ensure we are connected first
    try {
      await this.connect();
    } catch {
      console.warn(`[SignalR] Cannot emit "${eventName}": connection failed.`);
      return;
    }

    if (!this.connection || this.connection.state !== "Connected") {
      console.warn(`[SignalR] Cannot emit "${eventName}": not connected after await.`);
      return;
    }

    // Map frontend event names → ASP.NET Core Hub method names
    let hubMethod = eventName;
    if (eventName === "mentor:online") hubMethod = "MentorOnline";
    else if (eventName === "joinRoom") hubMethod = "JoinRoom";
    else if (eventName === "sendMessage") hubMethod = "SendMessage";

    try {
      await this.connection.invoke(hubMethod, data);
      console.log(`[SignalR] Invoked ${hubMethod} successfully.`);
    } catch (err) {
      console.error(`[SignalR] Error invoking ${hubMethod}:`, err);
    }
  }

  on(eventName: string, callback: (...args: any[]) => void) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)?.push(callback);

    // Attach immediately if connection exists (even if not yet started)
    this.connection?.on(eventName, callback);
  }

  off(eventName: string, callback?: (...args: any[]) => void) {
    if (!callback) {
      this.connection?.off(eventName);
      this.eventListeners.delete(eventName);
      return;
    }

    const callbacks = this.eventListeners.get(eventName);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) {
        callbacks.splice(idx, 1);
      }
      if (callbacks.length === 0) {
        this.eventListeners.delete(eventName);
      }
    }

    this.connection?.off(eventName, callback);
  }
}

const socket = new SignalRWrapper();
export default socket;
