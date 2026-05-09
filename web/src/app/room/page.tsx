"use client";
import { Suspense } from "react";
import dynamic from "next/dynamic";

// Phase 16.9 — dynamic-import RoomClient so the XState + lobby/chat
// chunks load after the route shell paints, not as part of the initial
// /room navigation. Pairs with the bundle budget gate from slice 16.8 to
// keep the room route's initial JS minimal even as the machine grows.
const RoomClient = dynamic(() => import("./RoomClient"), { ssr: false });

export default function Page() {
  return (
    <Suspense>
      <RoomClient />
    </Suspense>
  );
}
