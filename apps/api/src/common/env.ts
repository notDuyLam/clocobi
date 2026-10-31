// Required environment variable; a missing one is a deployment error (500, logged).
export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
