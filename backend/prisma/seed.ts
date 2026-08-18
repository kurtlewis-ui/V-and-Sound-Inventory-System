import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

// The only bootstrap data a real deployment needs: the two roles and a single
// Admin account to log in with. Everything else (shops, brands, products,
// users, sales) is created through the app. No demo/sample data.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@vapeshop.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

async function main() {
  console.log('🌱 Starting database seed (clean bootstrap)...');

  // Fix inventory constraints — dynamically find and drop any old unique
  // constraint that doesn't include variant_id, then ensure the correct one exists.
  try {
    // Find all unique constraints on inventory table
    const constraints: any[] = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint 
      WHERE conrelid = 'inventory'::regclass 
      AND contype = 'u'
    `);
    console.log('📋 Inventory constraints found:', constraints.map((c: any) => c.conname));
    
    // Drop any constraint that does NOT include variant_id (old-style product+branch only)
    for (const c of constraints) {
      if (c.conname && !c.conname.includes('variant')) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "${c.conname}"`);
        console.log(`✅ Dropped old constraint: ${c.conname}`);
      }
    }

    // Ensure the new constraint exists
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_id_variant_id_branch_id_key') THEN
          ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_variant_id_branch_id_key" UNIQUE ("product_id", "variant_id", "branch_id");
        END IF;
      END $$;
    `);
    console.log('✅ New inventory constraint (product_id, variant_id, branch_id) verified');
  } catch (e) {
    console.log('⚠️ Constraint fix error:', (e as any).message);
  }

  // 1. Roles -----------------------------------------------------------------
  const ownerRole = await prisma.role.upsert({
    where: { name: 'Owner' },
    update: {},
    create: {
      name: 'Owner',
      description: 'Business owner — full access including confidential data',
      permissions: {
        users: ['create', 'read', 'update', 'delete'],
        branches: ['create', 'read', 'update', 'delete'],
        catalog: ['create', 'read', 'update', 'delete'],
        sales: ['create', 'read', 'approve'],
        reports: ['read'],
        finance: ['read'],
      },
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Full administrative access',
      permissions: {
        users: ['create', 'read', 'update', 'delete'],
        branches: ['create', 'read', 'update', 'delete'],
        catalog: ['create', 'read', 'update', 'delete'],
        sales: ['create', 'read', 'approve'],
        reports: ['read'],
      },
    },
  });

  await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: {
      name: 'Staff',
      description: 'Branch-scoped sales access',
      permissions: { catalog: ['read'], sales: ['create', 'read'] },
    },
  });

  console.log('✅ Roles ready (Owner, Admin, Staff)');

  // 2. Owner account ---------------------------------------------------------
  const ownerPasswordHash = await bcrypt.hash('OwnerPass123!', BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { email: 'owner@vapeshop.com' },
    update: {},
    create: {
      email: 'owner@vapeshop.com',
      passwordHash: ownerPasswordHash,
      firstName: 'System',
      lastName: 'Owner',
      roleId: ownerRole.id,
      mustChangePassword: true,
    },
  });

  console.log('✅ Owner account ready (owner@vapeshop.com / OwnerPass123!)');

  // 3. Admin account ---------------------------------------------------------

  // 3. Admin account ---------------------------------------------------------
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      roleId: adminRole.id,
      mustChangePassword: true,
    },
  });

  console.log('✅ Admin account ready');
  console.log('🎉 Seed complete. Log in and build out your shops, brands, products and users.');
  console.log('');
  console.log(`   Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('   ⚠️  Change this password after first login (Settings).');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
