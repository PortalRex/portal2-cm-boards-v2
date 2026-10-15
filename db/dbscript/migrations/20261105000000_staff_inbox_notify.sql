-- Live staff inbox: announce each new audit-log entry (NOTIFY staff_inbox, {"id", "admin"}) so the
-- server can pass it on to staff browsers straight away (server/src/tools/staff_events.rs).
CREATE OR REPLACE FUNCTION notify_staff_inbox() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('staff_inbox', json_build_object('id', NEW.id, 'admin', NEW.admin_profile)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_actions_notify ON admin_actions;
CREATE TRIGGER admin_actions_notify AFTER INSERT ON admin_actions FOR EACH ROW EXECUTE PROCEDURE notify_staff_inbox();
