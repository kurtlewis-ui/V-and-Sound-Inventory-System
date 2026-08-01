import { Prisma } from '@prisma/client';

type ProductKeyed = { productId: string; quantity: number; [key: string]: unknown };

/**
 * Merge incoming product-keyed lines into an existing list, matching the
 * frontend draft cart's own merge behavior: same productId sums quantity and
 * takes the incoming line's other fields (most recent wins); anything new is
 * appended.
 */
function mergeByProductId<T extends ProductKeyed>(existing: T[], incoming: T[]): T[] {
  const result = [...existing];
  for (const item of incoming) {
    const idx = result.findIndex((r) => r.productId === item.productId);
    if (idx >= 0) {
      result[idx] = { ...result[idx], ...item, quantity: result[idx].quantity + item.quantity };
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Copy a declined sale/disposal/expense's contents back into the staff
 * member's draft cart — creating one if they don't have one, merged with
 * whatever's already staged — so declining is "fix and resubmit" instead of
 * "start over from scratch". Called from inside the same transaction as the
 * decline itself; the declined record is untouched (stays DECLINED for the
 * admin's audit trail) — only its data gets copied.
 */
export async function restoreToDraft(
  tx: Prisma.TransactionClient,
  staffId: string,
  branchId: string,
  patch: {
    items?: ProductKeyed[];
    disposalItems?: ProductKeyed[];
    expenses?: { amount: number; note: string }[];
  },
) {
  if (!patch.items?.length && !patch.disposalItems?.length && !patch.expenses?.length) {
    return;
  }

  const existing = await tx.draftOrder.findUnique({ where: { staffId } });
  const items = mergeByProductId((existing?.items as unknown as ProductKeyed[]) ?? [], patch.items ?? []);
  const disposalItems = mergeByProductId(
    (existing?.disposalItems as unknown as ProductKeyed[]) ?? [],
    patch.disposalItems ?? [],
  );
  const expenses = [
    ...((existing?.expenses as unknown as { amount: number; note: string }[]) ?? []),
    ...(patch.expenses ?? []),
  ];

  const data = {
    items: items as unknown as Prisma.InputJsonValue,
    disposalItems: disposalItems as unknown as Prisma.InputJsonValue,
    expenses: expenses as unknown as Prisma.InputJsonValue,
  };

  await tx.draftOrder.upsert({
    where: { staffId },
    create: { staffId, branchId, ...data },
    update: data,
  });
}
