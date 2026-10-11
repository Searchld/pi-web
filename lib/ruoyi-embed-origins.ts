export function getRuoyiEmbedOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter((item) => {
    try {
      return new URL(item).origin === item;
    } catch {
      return false;
    }
  }))];
}
