"use client";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/aws/cognito";
import { ActivityFeed } from "@/components/social/ActivityFeed";

export default function FeedPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUserId((u as { userId?: string }).userId ?? null))
      .catch(() => setUserId(null));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-100">
      <h1 className="mb-4 text-xl font-semibold">Your activity</h1>
      {userId ? (
        <ActivityFeed userId={userId} />
      ) : (
        <p className="text-sm text-zinc-500">Sign in to see your feed.</p>
      )}
    </main>
  );
}
