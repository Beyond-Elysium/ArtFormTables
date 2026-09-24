import { IconDatabase } from "@tabler/icons-react";
import { auth } from "@clerk/nextjs/server";
import type { CampaignData } from "@prisma/client";
import { PageHeader } from "@/components/PageHeader";
import { db } from "@/lib/db";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CampaignDataPage() {
  const { userId } = await auth();

  const rows: CampaignData[] = userId
    ? await db.campaignData.findMany({
        where: { userId },
        orderBy: { importedAt: "desc" },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Campaign Data"
        subtitle="Historical GovCon campaign performance used to benchmark new scenarios."
      />

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconDatabase size={48} stroke={1.5} />
            </div>
            <p className="empty-title">No campaign data yet</p>
            <p className="empty-subtitle text-secondary">
              Import historical campaign performance to start benchmarking new
              scenarios against it.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Campaign</th>
                  <th>Date Range</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                  <th>Spend</th>
                  <th>CTR</th>
                  <th>CPL</th>
                  <th>CPM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.platform}</td>
                    <td>{row.campaignName}</td>
                    <td>
                      {dateFormat.format(row.startDate)} – {dateFormat.format(row.endDate)}
                    </td>
                    <td>{numberFormat.format(row.impressions)}</td>
                    <td>{numberFormat.format(row.clicks)}</td>
                    <td>{numberFormat.format(row.conversions)}</td>
                    <td>{currencyFormat.format(Number(row.spend))}</td>
                    <td>{percentFormat.format(row.ctr)}</td>
                    <td>{currencyFormat.format(row.cpl)}</td>
                    <td>{currencyFormat.format(row.cpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
