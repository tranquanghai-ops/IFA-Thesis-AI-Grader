# IFA Thesis AI Grader

Ứng dụng hỗ trợ giảng viên đánh giá thuyết minh ĐATN/ĐATH theo rubric, vai trò GVHD/GVPB và cơ chế Human-in-the-loop.

## Sử dụng

1. Mở trang GitHub Pages của repository.
2. Bấm **Nhập khóa Gemini**.
3. Dán Gemini API key được tạo tại Google AI Studio, rồi bấm **Kiểm tra và lưu**.
4. Khóa chỉ lưu trong `localStorage` của trình duyệt hiện tại; không nằm trong repository hoặc JSON tiến trình.

Không gửi API key cho người khác và không ghi khóa vào mã nguồn.

## Phát triển

```bash
npm install
npm run dev
```

## Xuất bản

Workflow `Deploy GitHub Pages` tự động build và xuất bản sau mỗi lần cập nhật nhánh `main`.
