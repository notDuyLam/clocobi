// Creates the single account, or resets its password when run again (TDD section 6).
// Run: npm run seed (reads apps/api/.env; point DATABASE_URL at the branch to seed).
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaService } from './prisma.service.js';

const email = 'admin@email.com';
const password = process.env.SEED_PASSWORD;
if (!password) throw new Error('SEED_PASSWORD is not set');

const prisma = new PrismaService();
const passwordHash = await hash(password); // library default: argon2id, m=19456, t=2, p=1
await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash },
  update: { passwordHash },
});
await prisma.$disconnect();
console.log(`Seeded ${email}`);
