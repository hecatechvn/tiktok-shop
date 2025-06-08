text = """
Predictive analytics: Phân tích dự đoán
Cohort analysis: Phân tích nhóm
A/B testing results: Kết quả A/B testing
Machine learning insights: Thông tin từ học máy
Custom analytics: Phân tích tùy chỉnh
"""

# Tách dòng và chia theo dấu ":"
lines = text.strip().split('\n')
left = []
right = []

for line in lines:
    if ':' in line:
        key, value = line.split(':', 1)
        left.append(key.strip())
        right.append(value.strip())

# In ra kết quả mong muốn
print('\n'.join(left))
print()  # Dòng trống
print('\n'.join(right))
