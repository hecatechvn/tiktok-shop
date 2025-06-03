export const isValidBodyValue = (
  value: unknown,
): value is string | boolean | string[] => {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((v) => typeof v === 'string'))
  );
};
