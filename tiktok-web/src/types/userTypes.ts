export interface User {
  _id?: string;
  name: string;
  userName: string;
  role: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
} 