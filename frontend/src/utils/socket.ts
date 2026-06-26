import { HubConnectionBuilder, HubConnection, HttpTransportType } from "@microsoft/signalr";

class SignalRWrapper {
  private connection: HubConnection | null = null;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

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
    });
  }

  async connect() {
    if (!this.connection) {
      this.initConnection();
    }
    
    if (this.connection && this.connection.state === "Disconnected") {
      try {
        await this.connection.start();
        console.log("[SignalR] Connected successfully.");
        
        // Re-attach any listeners that were registered
        this.eventListeners.forEach((callbacks, eventName) => {
          callbacks.forEach(callback => {
            this.connection?.on(eventName, callback);
          });
        });
      } catch (err) {
        console.error("[SignalR] Connection error:", err);
      }
    }
  }

  async disconnect() {
    if (this.connection && this.connection.state !== "Disconnected") {
      try {
        await this.connection.stop();
        console.log("[SignalR] Disconnected.");
      } catch (err) {
        console.error("[SignalR] Disconnect error:", err);
      }
    }
  }

  emit(eventName: string, data: any) {
    if (!this.connection || this.connection.state !== "Connected") {
      console.warn(`[SignalR] Cannot emit event ${eventName} because connection is not established.`);
      return;
    }

    // Map Socket.io event names to ASP.NET Core Hub methods
    let hubMethod = eventName;
    if (eventName === "mentor:online") hubMethod = "MentorOnline";
    else if (eventName === "joinRoom") hubMethod = "JoinRoom";
    else if (eventName === "sendMessage") hubMethod = "SendMessage";

    this.connection.invoke(hubMethod, data).catch(err => {
      console.error(`[SignalR] Error invoking hub method ${hubMethod}:`, err);
    });
  }

  on(eventName: string, callback: (...args: any[]) => void) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)?.push(callback);

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
