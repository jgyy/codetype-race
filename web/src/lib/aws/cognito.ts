"use client";
import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  getCurrentUser as amplifyGetCurrentUser,
} from "aws-amplify/auth";
import {
  COGNITO_REGION,
  COGNITO_USER_POOL_CLIENT_ID,
  COGNITO_USER_POOL_ID,
} from "../config";

let configured = false;
export function configureAuth() {
  if (configured) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: COGNITO_USER_POOL_ID,
        userPoolClientId: COGNITO_USER_POOL_CLIENT_ID,
      },
    },
  });
  configured = true;
}

if (typeof window !== "undefined") {
  configureAuth();
}

export async function getIdToken(): Promise<string | null> {
  configureAuth();
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export const signIn: typeof amplifySignIn = (...args) => {
  configureAuth();
  return amplifySignIn(...args);
};
export const signOut: typeof amplifySignOut = (...args) => {
  configureAuth();
  return amplifySignOut(...args);
};
export const signUp: typeof amplifySignUp = (...args) => {
  configureAuth();
  return amplifySignUp(...args);
};
export const confirmSignUp: typeof amplifyConfirmSignUp = (...args) => {
  configureAuth();
  return amplifyConfirmSignUp(...args);
};
export const getCurrentUser: typeof amplifyGetCurrentUser = (...args) => {
  configureAuth();
  return amplifyGetCurrentUser(...args);
};
export { COGNITO_REGION };
