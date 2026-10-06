import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';
import { Category, Plan, Product, User } from './entities';
import { LicenseKind, Role } from './enums';

/** Crea el usuario admin y un producto de ejemplo. Seguro de ejecutar varias veces. */
async function seed() {
  const ds = await new DataSource(buildDataSourceOptions(process.env)).initialize();
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD en .env');

    const users = ds.getRepository(User);
    if (!(await users.exists({ where: { email: email.toLowerCase() } }))) {
      await users.save(
        users.create({ email: email.toLowerCase(), name: 'Admin', passwordHash: await bcrypt.hash(password, 10), role: Role.ADMIN }),
      );
      console.log(`Admin creado: ${email}`);
    }

    const products = ds.getRepository(Product);
    if (!(await products.exists({ where: { slug: 'herramienta-demo' } }))) {
      const category = await ds.getRepository(Category).save({ name: 'Categoría demo' });
      const product = await products.save(
        products.create({ name: 'Herramienta demo', slug: 'herramienta-demo', description: null, categoryId: category.id }),
      );
      await ds.getRepository(Plan).save([
        { productId: product.id, name: 'Licencia 30 días', kind: LicenseKind.NEW, durationDays: 30, priceCents: 2000 },
        { productId: product.id, name: 'Licencia 90 días', kind: LicenseKind.NEW, durationDays: 90, priceCents: 5000 },
      ]);
      console.log('Producto demo creado (cámbialo por los reales).');
    }
  } finally {
    await ds.destroy();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
