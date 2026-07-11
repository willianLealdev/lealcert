import { Router } from "express";
import { db } from "@workspace/db";
import { certificatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/public/certificates", async (req, res) => {
  try {
    const certs = await db
      .select({
        id: certificatesTable.id,
        name: certificatesTable.name,
        description: certificatesTable.description,
        price: certificatesTable.price,
        validityMonths: certificatesTable.validityMonths,
        product: certificatesTable.product,
        issuanceType: certificatesTable.issuanceType,
        model: certificatesTable.model,
      })
      .from(certificatesTable)
      .where(eq(certificatesTable.active, true))
      .orderBy(certificatesTable.id);
    res.json(certs);
  } catch (err) {
    req.log.error(err, "public certificates error");
    res.status(500).json({ error: "Erro ao buscar certificados" });
  }
});

export default router;
