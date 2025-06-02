# Quy Trình Ủy Quyền TikTok Shop

## Tổng Quan

Tài liệu này giải thích cách quy trình ủy quyền TikTok Shop hoạt động trong ứng dụng của chúng ta. Quy trình này cho phép người dùng kết nối tài khoản TikTok Shop của họ với hệ thống của chúng ta thông qua OAuth.

## Quy Trình Ủy Quyền

1. **Nhập Thông Tin**: Người dùng nhập ID Shop TikTok (`service_id`), App Key và App Secret vào ứng dụng, đồng thời chọn thị trường (US hoặc Global).

2. **Tạo State và Lưu Trữ Dữ Liệu**: Khi người dùng nhấn nút "Ủy quyền với TikTok":
   - Hệ thống tạo một chuỗi `state` ngẫu nhiên để bảo vệ khỏi tấn công CSRF
   - Lưu trữ `state` và dữ liệu đã nhập vào localStorage

3. **Chuyển Hướng Đến TikTok**: Người dùng được chuyển hướng đến trang ủy quyền của TikTok Shop dựa trên thị trường đã chọn:
   - Global: `https://services.tiktokshop.com/open/authorize?service_id={service_id}&state={state}`
   - US: `https://services.us.tiktokshop.com/open/authorize?service_id={service_id}&state={state}`

4. **Đăng Nhập & Ủy Quyền TikTok**: Người dùng đăng nhập vào tài khoản TikTok Shop (nếu chưa đăng nhập) và cấp quyền cho ứng dụng của chúng ta.

5. **Xử Lý Callback**: Sau khi ủy quyền thành công, TikTok chuyển hướng đến URL callback của chúng ta với mã ủy quyền và state:
   ```
   http://localhost:3000/callback?app_key={app_key}&code={auth_code}&locale={locale}&shop_region={shop_region}&state={state}
   ```

6. **Xác Thực State và Tạo Tài Khoản**: Trang callback của chúng ta tự động:
   - Trích xuất mã ủy quyền và state từ URL
   - Xác thực state nhận được khớp với state đã lưu trong localStorage
   - Lấy dữ liệu tài khoản đang chờ xử lý từ localStorage
   - Tạo tài khoản mới hoặc cập nhật tài khoản hiện có với mã ủy quyền
   - Chuyển hướng trở lại trang chính với thông báo thành công

7. **Trao Đổi Token**: Ở phía backend, hệ thống trao đổi mã ủy quyền để lấy access token và refresh token.

## Chi Tiết Triển Khai

### Frontend

- `AccountModal.tsx`: Thu thập thông tin đầu vào của người dùng, cho phép chọn thị trường, tạo state và lưu trữ trong localStorage trước khi chuyển hướng đến TikTok
- `callback/page.tsx`: Xử lý callback từ TikTok, xác thực state và tự động tạo/cập nhật tài khoản
- `tiktokAuth.ts`: Các hàm tiện ích để tạo URL ủy quyền, tạo state ngẫu nhiên và phân tích tham số callback

### Backend

- `accounts.service.ts`: Xử lý trao đổi token và tạo/cập nhật tài khoản
- `account.entity.ts`: Định nghĩa cấu trúc dữ liệu cho tài khoản TikTok

## Ví Dụ Định Dạng URL

1. **URL Ủy Quyền (Global)**:
   ```
   https://services.tiktokshop.com/open/authorize?service_id=7509193628305819448&state=a1b2c3d4e5f6g7h8i9j0
   ```

2. **URL Ủy Quyền (US)**:
   ```
   https://services.us.tiktokshop.com/open/authorize?service_id=7509193628305819448&state=a1b2c3d4e5f6g7h8i9j0
   ```

3. **URL Callback**:
   ```
   http://localhost:3000/callback?app_key=6gbbo4d2hv245&code=ROW_wGeMywAAAADnFuCu1znrrt1QEiPuXaUBxzeXrpNiZqyaVm-uRvl0XAvV80SqyCFwSY71wSP1X4E_zL6c-6lX81zdLjwmzttRZscjeGFto4kUG1DKEvP7o2xsE6JHW1gz4X3rNv8t4iI8MBUwU63NDkdjZTcTnVcM&locale=vi-VN&shop_region=VN&state=a1b2c3d4e5f6g7h8i9j0
   ```

## Xử Lý Sự Cố

Nếu bạn gặp vấn đề với quy trình ủy quyền:

1. **Kiểm Tra App Key và App Secret**: Đảm bảo các giá trị này chính xác
2. **Xác Minh Service ID**: Đảm bảo ID Shop hợp lệ
3. **Kiểm Tra Cấu Hình URL Callback**: URL callback trong cài đặt nhà phát triển TikTok Shop của bạn phải khớp với URL ứng dụng của bạn
4. **Kiểm Tra localStorage**: Đảm bảo rằng trình duyệt hỗ trợ localStorage và nó không bị chặn
5. **Kiểm Tra Yêu Cầu Mạng**: Theo dõi các yêu cầu mạng để xác định lỗi API
6. **Xác Thực State**: Nếu state không khớp, có thể có vấn đề về bảo mật hoặc người dùng đã cố gắng ủy quyền nhiều lần

## Các Vấn Đề Bảo Mật

- Ứng dụng sử dụng tham số `state` để ngăn chặn tấn công CSRF trong quy trình ủy quyền
- Hệ thống tạo chuỗi ngẫu nhiên cho state mỗi lần ủy quyền và xác thực khi nhận callback
- Ứng dụng sử dụng localStorage để tạm thời lưu trữ thông tin tài khoản trong quá trình ủy quyền
- Tất cả dữ liệu nhạy cảm được xóa khỏi localStorage sau khi tài khoản được tạo
- Backend lưu trữ an toàn access token và refresh token
- Sử dụng HTTPS trong môi trường sản xuất để bảo mật quá trình ủy quyền 