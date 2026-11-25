-- Invoice payment terms for the A/R Aging "Terms" column (report standard §10).
alter table invoices add column if not exists payment_term text;

-- Backfill from the cached invoice detail (raw = the /api/Invoices/{id} response). Cache only; nothing in the CRM changes.
-- paymentTerm may be text ("Net 30") or a lookup object ({ "id": ..., "name": "Net 30" }).
update invoices
set payment_term = case jsonb_typeof(raw->'paymentTerm')
                     when 'string' then raw->>'paymentTerm'
                     when 'object' then raw->'paymentTerm'->>'name'
                   end
where payment_term is null and jsonb_typeof(raw->'paymentTerm') in ('string', 'object');
