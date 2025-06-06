import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { jwtDecode } from "jwt-decode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.hct-it.vn/api/v1";

interface JwtPayload {
  sub: string;
  userName: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Mở rộng các kiểu session và JWT mặc định
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    user: {
      name?: string | null;
      id?: string;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
    role?: string;
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          
          const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userName: credentials?.username,
              password: credentials?.password,
            }),
          });
          
          
          if (!response.ok) {
            const errorData = await response.text();
            console.error("Phản hồi lỗi xác thực:", errorData);
            return null;
          }

          const data = await response.json();
          
          // Giải mã JWT để lấy thông tin người dùng
          try {
            const decodedToken = jwtDecode<JwtPayload>(data.access_token);
            
            return {
              id: decodedToken.sub,
              name: decodedToken.userName,
              role: decodedToken.role,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
            };
          } catch (decodeError) {
            console.error("Lỗi giải mã JWT:", decodeError);
            // Dự phòng nếu việc giải mã token thất bại
            return {
              id: credentials?.username || "user-id",
              name: credentials?.username || "user",
              role: "user",
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
            };
          }
        } catch (error) {
          console.error("Lỗi xác thực:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Đăng nhập ban đầu
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.name = user.name;
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.user = {
        name: token.name,
        id: token.userId,
        role: token.role,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  debug: process.env.NODE_ENV === "development",
  secret: process.env.NEXTAUTH_SECRET || "your-secret-key",
});

export { handler as GET, handler as POST }; 