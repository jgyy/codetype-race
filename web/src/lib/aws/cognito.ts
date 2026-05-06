"use client";
import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
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

export async function getIdToken(): Promise<string | null> {
  configureAuth();
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export { signIn, signOut, signUp, confirmSignUp, getCurrentUser };
export { COGNITO_REGION };
