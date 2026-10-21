import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/db.js";

/**
 * Provision the first admin. There is no public sign-up.
 *
 *   pnpm create-admin --email you@example.com --name "Your Name"
 *   pnpm create-admin --email you@example.com --name "Your Name" --password "..."
 *
 * Without --password a random one is generated and printed once.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
      role: { type: "string", default: "admin" },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role === "member" ? "member" : "admin";

  if (!email || !name) {
    console.error('Usage: pnpm create-admin --email you@example.com --name "Your Name"');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`A user with ${email} already exists (role: ${existing.role ?? "member"}).`);
    console.error("Use the dashboard to change roles, or pick another email.");
    process.exit(1);
  }

  const password = values.password ?? randomBytes(12).toString("base64url");
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const userId = randomUUID();

  await prisma.$transaction([
    prisma.user.create({
      data: { id: userId, name, email, emailVerified: true, role },
    }),
    prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    }),
  ]);

  console.log(`\nCreated ${role}: ${name} <${email}>`);
  if (!values.password) console.log(`Temporary password: ${password}`);
  console.log("Sign in and change it from Settings.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
