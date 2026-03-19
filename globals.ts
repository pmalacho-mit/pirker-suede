export const defaults = {
  ports: {
    web: 5173,
    api: 3001,
  },
} as const;

export const parsePort = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
