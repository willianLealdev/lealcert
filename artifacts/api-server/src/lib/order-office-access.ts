import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** Order actions belong to the owner, administrators, or the operator's active office. */
export async function canAccessOfficeOrder(
  userId: number | undefined,
  role: string | undefined,
  userType: string | undefined,
  order: { userId: number | null },
): Promise<boolean> {
  if (!userId) return false;
  if (role === "admin" || userType === "admin") return true;
  if (role !== "operador") return order.userId === userId;

  const [operator] = await db
    .select({ role: usersTable.role, contadorId: usersTable.contadorId, isActive: usersTable.isActive })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!operator?.isActive || operator.role !== "operador" || !operator.contadorId) return false;

  const [contador] = await db
    .select({ id: usersTable.id, role: usersTable.role, userType: usersTable.userType, isActive: usersTable.isActive })
    .from(usersTable).where(eq(usersTable.id, operator.contadorId)).limit(1);
  if (!contador?.isActive || contador.role !== "contador" || contador.userType !== "contador") return false;

  // Preserve older operator-owned orders without granting access to another office.
  return order.userId === contador.id || order.userId === userId;
}
