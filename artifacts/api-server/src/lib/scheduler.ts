import { eq, lte, and } from "drizzle-orm";
import { db, marketingCampaignsTable } from "@workspace/db";
import { logger } from "./logger";
import { dispatchCampaign } from "../routes/marketing";

let running = false;

async function checkScheduledCampaigns() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(marketingCampaignsTable)
      .where(and(
        eq(marketingCampaignsTable.status, "scheduled"),
        lte(marketingCampaignsTable.scheduledAt, now),
      ));

    for (const campaign of due) {
      logger.info({ campaignId: campaign.id, name: campaign.name }, "Dispatching scheduled campaign");
      await db.update(marketingCampaignsTable).set({ status: "sending" }).where(eq(marketingCampaignsTable.id, campaign.id));
      dispatchCampaign(campaign.id).catch(err => logger.error({ err, campaignId: campaign.id }, "Scheduled campaign dispatch error"));
    }
  } catch (err) {
    logger.error({ err }, "Scheduler check error");
  } finally {
    running = false;
  }
}

export function startScheduler() {
  logger.info("Marketing scheduler started (60s interval)");
  setInterval(checkScheduledCampaigns, 60_000);
  checkScheduledCampaigns().catch(err => logger.error({ err }, "Initial scheduler check error"));
}
