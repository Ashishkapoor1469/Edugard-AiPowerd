import { Server } from "socket.io";

let ioInstance: Server | null = null;

export const setIO = (io: Server) => {
  ioInstance = io;
};

export const getIO = (): Server | null => {
  return ioInstance;
};

export const emitToMentor = (mentorId: string, eventName: string, data: any) => {
  if (ioInstance) {
    ioInstance.to(mentorId.toString()).emit(eventName, data);
  }
};
