"use client";
import { useMachine } from "@xstate/react";
import { roomMachine, type RoomInput } from "./roomMachine";

export function useRoomMachine(input: RoomInput) {
  const [state, send] = useMachine(roomMachine, { input });
  return { state, send };
}
