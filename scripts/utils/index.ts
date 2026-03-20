export function arg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required argument: ${flag}`);
    process.exit(1);
  }
  return process.argv[idx + 1];
}

export function args(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag) {
      const next = process.argv[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(`Missing required argument value for: ${flag}`);
        process.exit(1);
      }
      values.push(
        ...next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }

  if (values.length === 0) {
    console.error(`Missing required argument: ${flag}`);
    process.exit(1);
  }

  return values;
}
