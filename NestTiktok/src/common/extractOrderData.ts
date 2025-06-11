import { OrderStatus } from 'src/enum';
import { ExtractedOrderItem, Order } from 'src/types/order';
import { formatDateTimeByRegion } from 'src/utils/date';

/**
 * Format Order ID nếu kết thúc bằng "000" thành dạng scientific notation
 * @param orderId - Order ID gốc
 * @returns Order ID đã format hoặc gốc
 */
const formatOrderId = (orderId: string): string => {
  if (orderId.endsWith('000')) {
    const numericId = parseFloat(orderId);
    return numericId.toExponential(5); // Format thành dạng 5.79111E+17
  }
  return orderId;
};

/**
 * Trích xuất các trường dữ liệu cụ thể từ dữ liệu đơn hàng theo yêu cầu
 * @param {Order[]} orderData - Dữ liệu đơn hàng thô từ phản hồi API
 * @param {string} region - Mã vùng của shop (VN, ID, TH, etc.)
 * @returns {ExtractedOrderItem[]} - Dữ liệu đơn hàng đã trích xuất với các trường theo yêu cầu
 */
export const extractOrderData = (
  orderData: Order[],
  region?: string,
): ExtractedOrderItem[] => {
  const extractedData: ExtractedOrderItem[] = [];

  // Kiểm tra xem dữ liệu có hợp lệ không
  if (!Array.isArray(orderData)) {
    return extractedData;
  }

  orderData.forEach((order) => {
    // Xử lý các mục hàng (sản phẩm) trong đơn hàng
    if (order.line_items && Array.isArray(order.line_items)) {
      // Tạo một map để đếm số lượng từng SKU
      const skuCountMap = new Map<string, number>();

      // Đếm số lượng mỗi SKU
      order.line_items.forEach((item) => {
        const skuId = item.sku_id;
        if (skuCountMap.has(skuId)) {
          skuCountMap.set(skuId, (skuCountMap.get(skuId) || 0) + 1);
        } else {
          skuCountMap.set(skuId, 1);
        }
      });

      // Mảng SKU đã xử lý để tránh trùng lặp
      const processedSkus = new Set();

      order.line_items.forEach((item) => {
        const skuId = item.sku_id;

        // Nếu SKU này đã được xử lý, bỏ qua
        if (processedSkus.has(skuId)) {
          return;
        }

        // Đánh dấu SKU này đã được xử lý
        processedSkus.add(skuId);

        // Lấy số lượng từ map đã đếm
        const quantity = skuCountMap.get(skuId) || 0;

        // Xác định order_status theo logic mới
        let orderStatus;
        const substatus = order.status;
        if (
          substatus === OrderStatus.CANCELLED ||
          substatus === OrderStatus.COMPLETED
        ) {
          orderStatus = substatus;
        } else if (
          substatus === OrderStatus.IN_TRANSIT ||
          substatus === OrderStatus.DELIVERED
        ) {
          orderStatus = 'Shipped';
        } else {
          orderStatus = 'To ship';
        }

        // Xác định cancellation_return_type theo logic mới
        let cancellationType = '';
        if (substatus === OrderStatus.CANCELLED) {
          cancellationType = 'Cancel';
        } else if (
          substatus === OrderStatus.COMPLETED &&
          (order.cancel_reason || item.cancel_reason)
        ) {
          cancellationType = 'Return/Refund';
        }

        // Xác định sku_quantity_return và order_refund_amount
        let skuQuantityReturn = 0;
        let orderRefundAmount = '0';

        if (
          cancellationType === 'Return/Refund' ||
          cancellationType === 'Cancel'
        ) {
          skuQuantityReturn = quantity;
          orderRefundAmount = order.payment?.total_amount || '0';
        }

        // Trích xuất thông tin cho từng mục hàng
        const extractedItem: ExtractedOrderItem = {
          order_id: formatOrderId(order.id), // ID đơn hàng với format

          order_status: orderStatus as string, // Trạng thái đơn hàng theo logic mới
          order_substatus: order.status, // Trạng thái phụ của đơn hàng

          cancellation_return_type: cancellationType, // Loại hủy/hoàn trả theo logic mới

          sku_id: item.sku_id, // ID SKU
          product_name: item.product_name, // Tên sản phẩm
          variation: item.sku_name, // Biến thể sản phẩm

          quantity: quantity.toString(), // Số lượng

          sku_quantity_return: skuQuantityReturn.toString(), // Số lượng trả lại

          sku_unit_original_price: item.original_price, // Giá gốc của SKU

          sku_subtotal_before_discount: item.original_price, // Tổng phụ trước giảm giá

          sku_platform_discount: item.platform_discount || '0', // Giảm giá từ nền tảng
          sku_seller_discount: item.seller_discount || '0', // Giảm giá từ người bán
          sku_subtotal_after_discount: (
            parseFloat(item.original_price) -
            parseFloat(item.seller_discount || '0') -
            parseFloat(item.platform_discount || '0')
          ).toString(), // Tổng phụ sau giảm giá
          shipping_fee_after_discount: order.payment?.shipping_fee || '0', // Phí vận chuyển sau giảm giá
          original_shipping_fee: order.payment?.original_shipping_fee || '0', // Phí vận chuyển gốc
          shipping_fee_seller_discount:
            order.payment?.shipping_fee_seller_discount || '0',
          shipping_fee_platform_discount:
            order.payment?.shipping_fee_platform_discount || '0', // Giảm giá phí vận chuyển từ nền tảng
          payment_platform_discount: order.payment?.platform_discount || '0',
          taxes: order.payment?.tax || '0', // Thuế
          order_amount: order.payment?.total_amount || '0', // Tổng số tiền đơn hàng

          order_refund_amount: orderRefundAmount, // Số tiền hoàn lại theo logic mới

          created_time: formatDateTimeByRegion(order.create_time, region),
          cancel_reason: order.cancel_reason || item.cancel_reason || '', // Lý do hủy
        };

        extractedData.push(extractedItem);
      });
    } else {
      // Nếu không có line_items, tạo một mục duy nhất cho đơn hàng
      // Xác định order_status theo logic mới
      let orderStatus: string;
      const substatus = order.status;
      if (
        substatus === OrderStatus.CANCELLED ||
        substatus === OrderStatus.COMPLETED
      ) {
        orderStatus = substatus;
      } else if (substatus === OrderStatus.IN_TRANSIT) {
        orderStatus = 'Shipped';
      } else {
        orderStatus = 'To ship';
      }

      // Xác định cancellation_return_type theo logic mới
      let cancellationType: string = '';
      if (substatus === OrderStatus.CANCELLED) {
        cancellationType = 'Cancel';
      } else if (substatus === OrderStatus.COMPLETED && order.cancel_reason) {
        cancellationType = 'Return/Refund';
      }

      // Xác định order_refund_amount
      let orderRefundAmount = '0';
      if (cancellationType === 'Return/Refund') {
        orderRefundAmount = order.payment?.total_amount || '0';
      }

      const extractedItem: ExtractedOrderItem = {
        order_id: formatOrderId(order.id), // ID đơn hàng với format
        order_status: orderStatus, // Trạng thái đơn hàng theo logic mới
        order_substatus: order.status,
        cancellation_initiator: order.cancellation_initiator || '',
        cancellation_return_type: cancellationType, // Loại hủy/hoàn trả theo logic mới
        sku_id: '',
        product_name: '',
        variation: '',
        quantity: '0', // Chuyển đổi thành chuỗi
        sku_quantity_return: cancellationType === 'Return/Refund' ? '0' : '0', // Chuyển đổi thành chuỗi
        sku_unit_original_price: '0',
        sku_subtotal_before_discount: '0',
        sku_platform_discount: '0',
        sku_seller_discount: '0',
        sku_subtotal_after_discount: '0',
        shipping_fee_after_discount: order.payment?.shipping_fee || '0',
        original_shipping_fee: order.payment?.original_shipping_fee || '0',
        shipping_fee_seller_discount:
          order.payment?.shipping_fee_seller_discount || '0',
        shipping_fee_platform_discount:
          order.payment?.shipping_fee_platform_discount || '0',
        payment_platform_discount: order.payment?.platform_discount || '0',
        taxes: order.payment?.tax || '0',
        order_amount: order.payment?.total_amount || '0',
        order_refund_amount: orderRefundAmount, // Số tiền hoàn lại theo logic mới
        created_time: formatDateTimeByRegion(order.create_time, region),
        cancel_reason: order.cancel_reason || '',
      };

      extractedData.push(extractedItem);
    }
  });

  return extractedData;
};
