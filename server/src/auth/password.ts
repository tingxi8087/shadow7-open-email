export async function hashPassword(password: string) {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
  });
}

export async function verifyPassword(password: string, passwordHash: string) {
  return Bun.password.verify(password, passwordHash);
}
