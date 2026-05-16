// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {
    interface Locals {
      user: { id: number; handle: string } | null;
      sessionId: string;
    }
  }
}

export {};
