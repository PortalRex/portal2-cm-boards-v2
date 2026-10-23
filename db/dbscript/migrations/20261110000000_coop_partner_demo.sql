-- A co-op partner's demo of a run that wasn't a personal best for them. Apply to databases created
-- from an older schema.sql.
--
-- When only one player of a co-op run improved, the other player's slot in the pairing is the map's
-- placeholder entry ('N/A'): they have no changelog entry of their own to put a demo on. Their demo
-- (their view of the same run) is kept here instead, so the run still has both players' demos. Its
-- demos row has the run's own entry as cl_id, so removing the run's demos (or the run) removes it
-- too. Linked copies of a pairing (20261021000000_games_seasons.sql) carry it as well.
ALTER TABLE coop_bundled ADD COLUMN IF NOT EXISTS partner_demo_id bigint;
DO $$
BEGIN
    ALTER TABLE coop_bundled ADD CONSTRAINT fk_coop_bundled_partner_demo
        FOREIGN KEY (partner_demo_id) REFERENCES demos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
-- Few pairings have one; also keeps deleting a demo (ON DELETE SET NULL) from scanning every pairing.
CREATE INDEX IF NOT EXISTS idx_coop_bundled_partner_demo ON coop_bundled (partner_demo_id) WHERE partner_demo_id IS NOT NULL;

-- Mirrors an original co-op pairing onto each linked map where either half is mirrored.
CREATE OR REPLACE FUNCTION season_mirror_bundle(bundle_id bigint) RETURNS void AS $$
DECLARE
    b coop_bundled%ROWTYPE;
    copy_map character varying;
    c1 bigint;
    c2 bigint;
    filler bigint;
    mb bigint;
BEGIN
    SELECT * INTO b FROM coop_bundled WHERE id = bundle_id;
    IF NOT FOUND OR b.mirror_of IS NOT NULL THEN
        RETURN;
    END IF;
    FOR copy_map IN
        SELECT DISTINCT x.map_id FROM changelog AS x WHERE x.mirror_of IN (b.cl_id1, b.cl_id2)
    LOOP
        SELECT id INTO filler FROM changelog WHERE profile_number = 'N/A' AND map_id = copy_map ORDER BY id LIMIT 1;
        SELECT id INTO c1 FROM changelog WHERE mirror_of = b.cl_id1 AND map_id = copy_map;
        SELECT id INTO c2 FROM changelog WHERE mirror_of = b.cl_id2 AND map_id = copy_map;
        c1 := COALESCE(c1, filler);
        c2 := COALESCE(c2, filler);
        CONTINUE WHEN c1 IS NULL OR c2 IS NULL;
        SELECT mbx.id INTO mb FROM coop_bundled AS mbx JOIN changelog AS x ON x.id = mbx.cl_id1
        WHERE mbx.mirror_of = b.id AND x.map_id = copy_map;
        IF mb IS NULL THEN
            INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2, partner_demo_id, mirror_of)
            VALUES (b.p_id1, b.p_id2, b.p1_is_host, c1, c2, b.partner_demo_id, b.id) RETURNING id INTO mb;
        ELSE
            UPDATE coop_bundled SET p_id1 = b.p_id1, p_id2 = b.p_id2, p1_is_host = b.p1_is_host, cl_id1 = c1, cl_id2 = c2,
                partner_demo_id = b.partner_demo_id
            WHERE id = mb;
        END IF;
        UPDATE changelog SET coop_id = NULL WHERE coop_id = mb AND id NOT IN (c1, c2);
        UPDATE changelog SET coop_id = mb WHERE id IN (c1, c2) AND profile_number <> 'N/A';
        mb := NULL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS season_bundle_upsert ON coop_bundled;
CREATE TRIGGER season_bundle_upsert AFTER INSERT OR UPDATE OF p_id1, p_id2, p1_is_host, cl_id1, cl_id2, partner_demo_id ON coop_bundled
    FOR EACH ROW EXECUTE FUNCTION season_bundle_upsert();
