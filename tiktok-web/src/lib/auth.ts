"use client";

import { useSession, signOut } from "next-auth/react";

export function useAuth() {
  const { data: session, status } = useSession();
  
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isAdmin = session?.user?.role === "admin";
  
  return {
    session,
    isAuthenticated,
    isLoading,
    isAdmin,
    user: session?.user,
    accessToken: session?.accessToken as string | undefined,
    signOut: () => signOut({ callbackUrl: "/login" }),
  };
} 