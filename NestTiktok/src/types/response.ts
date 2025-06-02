import { Order } from './order';

/**
 * Base response interface cho tất cả các API response
 */
export interface BaseResponse<T = any> {
  code: number;
  message: string;
  success?: boolean;
  data?: T;
}

/**
 * Response cho API lấy access token
 */
export interface TokenData {
  access_token: string;
  access_token_expire_in: number;
  refresh_token: string;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region?: string;
  user_type?: number;
  scope?: string;
  shop_id?: string;
}

export type TokenResponse = BaseResponse<TokenData>;

/**
 * Response cho API refresh token
 */
export type RefreshTokenResponse = TokenResponse;

/**
 * Shop object trong response
 */
export interface ShopData {
  cipher: string;
  code: string;
  id: string;
  name: string;
  region: string;
  seller_type: string;
}

/**
 * Response cho API lấy danh sách shop
 */
export interface ShopsData {
  shops: ShopData[];
}

export type ShopCipherResponse = BaseResponse<ShopsData>;

/**
 * Order response data
 */
export interface OrdersData {
  total_count?: number;
  next_page_token?: string;
  orders: Order[];
}

export type OrdersResponse = BaseResponse<OrdersData>;

/**
 * Error response
 */
export interface ErrorData {
  error_code: string | number;
  error_message: string;
}

export type ErrorResponse = BaseResponse<ErrorData>;
