"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { User } from "../types/userTypes";

export const useAuth = () => {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (session) {
          // Không cần gọi API riêng, sử dụng thông tin từ session
          setUser({
            _id: session.user.id,
            name: session.user.name || "",
            userName: session.user.name || "",
            role: session.user.role || "",
          });
          setIsAdmin(session.user.role === 'admin');
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error setting user data:", error);
        setIsLoading(false);
      }
    };

    if (status === "loading") {
      return;
    }

    if (session) {
      fetchUserData();
    } else {
      setIsLoading(false);
    }
  }, [session, status]);

  return {
    user,
    isAdmin,
    isAuthenticated: !!session,
    isLoading: status === "loading" || isLoading,
  };
}; 