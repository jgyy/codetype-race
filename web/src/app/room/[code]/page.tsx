import RoomClient from "./RoomClient";

export function generateStaticParams() {
  return [{ code: "PLACEHOLDER" }];
}

export default function Page() {
  return <RoomClient />;
}
