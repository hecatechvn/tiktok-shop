import {
  CancellationInitiator,
  DeliveryType,
  FulfillmentType,
  OrderStatus,
} from 'src/enum';

export type ResponseOrder = {
  code: number;
  message: string;
  resquest_id: string;
  data: {
    next_page_token: string;
    total_count: number;
    orders: Order[];
  };
};

export type Package = {
  id: string;
};

export type Payment = {
  currency: string;
  sub_total: string;
  shipping_fee: string;
  seller_discount: string;
  platform_discount: string;
  total_amount: string;
  original_total_product_price: string;
  original_shipping_fee: string;
  shipping_fee_seller_discount: string;
  shipping_fee_platform_discount: string;
  shipping_fee_cofunded_discount: string;
  tax: string;
  small_order_fee: string;
  shipping_fee_tax: string;
  product_tax: string;
  retail_delivery_fee: string;
  buyer_service_fee: string;
  handling_fee: string;
  shipping_insurance_free: string;
  item_insurance_free: string;
};

export type DistrictInfo = {
  address_level_name: string;
  address_name: string;
  address_level: string;
};

export type DeliveryPreference = {
  drop_off_location: string;
};

export type RecipientAddress = {
  full_address: string;
  phone_number: string;
  name: string;
  first_name: string;
  last_name: string;
  first_name_local_script: string;
  last_name_local_script: string;
  address_detail: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  address_line4: string;
  district_info: DistrictInfo[];
  delivery_preferences: DeliveryPreference;
  postal_code: string;
  region_code: string;
};

export type TaxItem = {
  tax_type: string;
  tax_amount: string;
  tax_rate: string;
};

export type CombinedListingSku = {
  sku_id: string;
  sku_count: number;
  product_id: string;
  seller_sku: string;
};

export type HandlingDuration = {
  days: string;
  type: string;
};

export type LineItem = {
  id: string;
  sku_id: string;
  combined_listing_skus?: CombinedListingSku[];
  display_status: string;
  product_name: string;
  seller_sku: string;
  sku_image: string;
  sku_name: string;
  product_id: string;
  sale_price: string;
  platform_discount: string;
  seller_discount: string;
  sku_type: string;
  cancel_reason?: string;
  original_price: string;
  rts_time?: number;
  package_status: string;
  currency: string;
  shipping_provider_name?: string;
  cancel_user?: string;
  shipping_provider_id?: string;
  is_gift: boolean;
  item_tax?: TaxItem[];
  tracking_number?: string;
  package_id?: string;
  retail_delivery_fee?: string;
  buyer_service_fee?: string;
  small_order_fee?: string;
  handling_duration_days?: string;
  is_dangerous_good?: boolean;
  needs_prescription?: boolean;
};

export type Order = {
  id: string;
  buyer_message: string;
  cancellation_initiator: CancellationInitiator;
  shipping_provider_id: string;
  create_time: number;
  shipping_provider: string;
  packages: Package[];
  payment: Payment;
  recipient_address: RecipientAddress;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  delivery_type: DeliveryType;
  paid_time: number;
  rts_sla_time: number;
  tts_sla_time: number;
  cancel_reason: string;
  update_time: number;
  payment_method_name: string;
  rts_time: number;
  tracking_number: string;
  split_or_combine_tag: string;
  has_updated_recipient_address: boolean;
  cancel_order_sla_time: number;
  warehouse_id: string;
  request_cancel_time: number;
  shipping_type: string;
  user_id: string;
  seller_note: string;
  delivery_sla_time: number;
  is_cod: boolean;
  delivery_option_id: string;
  cancel_time: number;
  need_upload_invoice: string;
  delivery_option_name: string;
  cpf: string;
  line_items: LineItem[];
  buyer_email?: string;
  delivery_due_time?: number;
  is_sample_order?: string;
  shipping_due_time?: number;
  collection_due_time?: number;
  delivery_option_required_delivery_time?: number;
  is_on_hold_order?: boolean;
  delivery_time?: number;
  is_replacement_order?: boolean;
  collection_time?: number;
  replaced_order_id?: string;
  is_buyer_request_cancel?: boolean;
  pick_up_cut_off_time?: number;
  fast_dispatch_sla_time?: number;
  commerce_platform?: string;
  order_type?: string;
  release_date?: number;
  handling_duration?: HandlingDuration;
  auto_combine_group_id?: string;
  cpf_name?: string;
  is_exchange_order?: boolean;
  exchange_source_order_id?: string;
  consultation_id?: string;
  fast_delivery_program?: string;
};

/**
 * Type for extracted order data with specific fields
 */
export type ExtractedOrderItem = {
  order_id: string;
  order_status: string;
  order_substatus: string;
  cancellation_return_type: string;
  sku_id: string;
  product_name: string;
  variation: string;
  quantity: string;
  sku_quantity_return: string;
  sku_unit_original_price: string;
  sku_subtotal_before_discount: string;
  sku_platform_discount: string;
  sku_seller_discount: string;
  sku_subtotal_after_discount: string;
  shipping_fee_after_discount: string;
  original_shipping_fee: string;
  shipping_fee_seller_discount: string;
  shipping_fee_platform_discount: string;
  payment_platform_discount: string;
  taxes: string;
  order_amount: string;
  order_refund_amount: string;
  created_time: string;
  cancel_reason: string;
  cancellation_initiator?: string;
};
