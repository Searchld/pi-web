let authorization: string | undefined;

export function setRuoyiAuthorization(token: string): void {
  const value = token.trim();
  if (value) authorization = /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

export function getRuoyiAuthorization(): string | undefined {
  return authorization;
}
