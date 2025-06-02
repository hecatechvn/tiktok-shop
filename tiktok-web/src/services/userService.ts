import { api } from "../lib/api";
import { ChangePasswordDto, User } from "../types/userTypes";

const BASE_URL = "/user";

export const userService = {
  // Đổi mật khẩu
  changePassword: async (data: ChangePasswordDto): Promise<{ success: boolean; message: string }> => {
    return api.patch(`${BASE_URL}/password/change`, data as unknown as Record<string, unknown>);
  },

  // Lấy thông tin user hiện tại
  getCurrentUser: async (): Promise<User> => {
    return api.get(`/auth/profile`);
  },
}; 