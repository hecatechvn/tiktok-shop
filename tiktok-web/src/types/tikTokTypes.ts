export interface ShopCipher {
  cipher: string;
  code: string;
  id: string;
  name: string;
  region: string;
  seller_type: string;
}

export interface Task {
  cronExpression: string;
  lastRun: Date;
  isActive: boolean;
}

export interface TikTokAccount {
  _id?: string;
  id?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpireIn?: number;
  refreshTokenExpireIn?: number;
  authCode: string;
  appSecret: string;
  appKey: string;
  serviceId?: string;
  shopCipher?: ShopCipher[];
  status: boolean;
  task?: Task;
  sheets?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaginationType {
  current: number;
  pageSize: number;
  total: number;
}

export interface CreateAccountDto {
  authCode: string;
  appSecret: string;
  appKey: string;
  serviceId: string;
  sheets?: string;
}

export interface UpdateAccountDto {
  authCode?: string;
  appSecret?: string;
  appKey?: string;
  serviceId?: string;
  sheets?: string;
  status?: boolean;
}

export interface UpdateTaskDto {
  cronExpression?: string;
  lastRun?: Date;
  isActive?: boolean;
} 