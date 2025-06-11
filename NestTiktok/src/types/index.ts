import { ExtractedOrderItem } from './order';

export * from './response';

export type QueryParams = {
  sort_order?: string;
  sort_field?: string;
  page_token?: string;
  page_size?: number;
  order_status?: string;
  create_time_ge?: number;
  create_time_le?: number;
  create_time_lt?: number;
  update_time_ge?: number;
  update_time_le?: number;
  update_time_lt?: number;
  shipping_type?: string;
  buyer_user_id?: string;
  is_buyer_request_cancel?: boolean;
  warehouse_ids?: string[];
};
export type RequestOption = {
  uri: string;
  qs: Record<string, string | number>;
  headers?: Record<string, string>;
  body: Record<string, string | boolean | string[]>; // Không còn '?'
};

export type RequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type ApiResponse = {
  code?: number;
  message?: string;
  [key: string]: any;
};

export type CommonParams = {
  app_key: string;
  app_secret: string;
  access_token: string;
  sign: string;
  timestamp: number;
  auth_code: string;
  refresh_token: string;
  page_size: number;
  shop_cipher: string;
  query_params: QueryParams;
  region?: string; // Shop region code (VN, ID, TH, etc.)
};

export type RefreshTokenResponse = {
  code: number;
  message: string;
  data: {
    access_token: string;
    access_token_expire_in: number;
    refresh_token: string;
    refresh_token_expire_in: number;
    open_id: string;
    seller_name: string;
    seller_base_region: string;
    user_type: number;
  };
};

export type ShopCipher = {
  cipher: string;
  code: string;
  id: string;
  name: string;
  region: string;
  seller_type: string;
};

export type ShopCipherResponse = {
  code: number;
  message: string;
  data: {
    shops: ShopCipher[];
  };
};

export type ResponseRefreshToken = {
  code: number;
  message: string;
  data: {
    access_token: string;
    access_token_expire_in: number;
    refresh_token: string;
    refresh_token_expire_in: number;
    open_id: string;
    seller_name: string;
    seller_base_region: string;
    user_type: number;
  };
};

export type AllOrdersResponse = {
  allOrders: ExtractedOrderItem[];
  ordersByMonth: Record<number, ExtractedOrderItem[]>;
  recentOrdersTimestamp: number;
};
