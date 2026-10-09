-- Where the visitor came from (utm_* / referrer) and any self-check answers they gave.
ALTER TABLE audit_requests ADD COLUMN source TEXT;
ALTER TABLE audit_requests ADD COLUMN self_check TEXT;
