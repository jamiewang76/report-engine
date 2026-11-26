-- Monthly Financial Summary: checks on the TEST org's cached data (read-only). Run after migration 0007 is applied,
-- the new code is deployed, and Refresh has been clicked on the report (as Super Admin, so POs/WOs sync).
-- Replace the org id below in every query (find it with: select org_id, name from organizations;).
-- Each query returns one result set; run them one at a time in the Supabase SQL editor.

-- 1. Status values actually returned (for the status mapping)
select 'invoice' as kind, status, count(*) from invoices where org_id = 'TEST_ORG_ID' group by status
union all
select 'po', status, count(*) from purchase_orders where org_id = 'TEST_ORG_ID' group by status
union all
select 'wo', status, count(*) from work_orders where org_id = 'TEST_ORG_ID' group by status
order by 1, 3 desc;

-- 2. Money scale sanity: compare these 5 invoices' amounts with the CRM invoice list (should match exactly)
select number, invoice_date::date, amount, pre_tax_total, tax_amount, status
from invoices where org_id = 'TEST_ORG_ID' order by invoice_date desc nulls last limit 5;

-- 3. amount vs pre_tax_total + tax_amount: how many differ, and the first 15 examples with the likely explanations
select count(*) as invoices,
       count(*) filter (where abs(amount - (coalesce(pre_tax_total,0) + coalesce(tax_amount,0))) > 0.01) as differ
from invoices where org_id = 'TEST_ORG_ID';

select number, status, is_deposit, pre_tax_total, tax_amount, amount,
       amount - (coalesce(pre_tax_total,0) + coalesce(tax_amount,0)) as diff,
       retainage_amount, deposit_invoiced_amount,
       (raw->>'discountAmount')::numeric / 100 as discount, (raw->>'subtotal')::numeric / 100 as subtotal,
       (raw->>'total')::numeric / 100 as total_field, (raw->>'deposit')::numeric / 100 as deposit_field
from invoices
where org_id = 'TEST_ORG_ID' and abs(amount - (coalesce(pre_tax_total,0) + coalesce(tax_amount,0))) > 0.01
order by invoice_date desc nulls last limit 15;

-- 4. Deposits: every invoice on jobs that have a deposit invoice or a final invoice that deducted deposits
select deal_id, job_number, number, invoice_date::date, status, is_deposit, pre_tax_total, tax_amount, amount,
       deposit_invoiced_amount, (raw->>'subtotal')::numeric / 100 as subtotal, (raw->>'deposit')::numeric / 100 as deposit_field
from invoices
where org_id = 'TEST_ORG_ID'
  and deal_id in (select deal_id from invoices where org_id = 'TEST_ORG_ID' and (is_deposit or coalesce(deposit_invoiced_amount,0) <> 0))
order by deal_id, invoice_date;

-- 5. Tax rate units (8.25 = percent, 0.0825 = fraction)
select tax_name, tax_rate, count(*) from invoices where org_id = 'TEST_ORG_ID' and tax_rate is not null group by 1, 2 order by 3 desc limit 10;

-- 6. Reconciliation month (change the dates): all invoices and POs in the month, by status, to compare with the CRM lists
select status, count(*), sum(pre_tax_total) as pre_tax, sum(tax_amount) as tax
from invoices where org_id = 'TEST_ORG_ID' and invoice_date >= '2026-10-01' and invoice_date < '2026-11-01'
group by status order by 2 desc;

select status, count(*), sum(pre_tax_total) as pre_tax
from purchase_orders where org_id = 'TEST_ORG_ID'
  and (order_date at time zone 'America/Los_Angeles')::date between '2026-10-01' and '2026-10-31'
group by status order by 2 desc;
