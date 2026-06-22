-- ============================================================================
-- Propaga la nueva taxonomia (dim_bd_funds.nt_*) por la MISMA cadena de vistas
-- que la taxonomia legacy asset_class/category/region, hasta la pagina Managers
-- (Sec 10): classified -> managers -> combined.
--
-- TODO ES ADITIVO: solo se AGREGAN 5 columnas nt_* a cada vista; ninguna columna
-- existente cambia de nombre/tipo/orden, asi que la paridad con el PDF queda
-- intacta. Las vistas *_classified usan CREATE OR REPLACE (columnas al final);
-- la cadena de managers cuelga de una matview, asi que va DROP + CREATE en orden.
-- ============================================================================

-- 1) v_chist_foreign_classified  (+5 nt_ al final)
CREATE OR REPLACE VIEW v_chist_foreign_classified AS
 WITH fund_class AS (
         SELECT DISTINCT ON (h.name) h.name AS nemo,
            bf.id AS fund_id,
            bf.fondo,
            bf.manager,
            bf.type AS fund_type,
            bf.style AS fund_style,
            bf.asset_class,
            bf.category,
            bf.region,
            bf.alt_fund_type,
            bf.alt_strategy,
            bf.nt_asset_class,
            bf.nt_sub_asset_class,
            bf.nt_category,
            bf.nt_sub_category,
            bf.nt_region
           FROM (dim_homol_funds h
             JOIN dim_bd_funds bf ON (((bf.id)::text = (h.id)::text)))
          ORDER BY h.name,
                CASE h.source
                    WHEN 'AFP_CL'::text THEN 1
                    WHEN 'LICS_CL'::text THEN 2
                    WHEN 'CARTERAS_FM_CMF'::text THEN 3
                    WHEN 'RUT_CMF'::text THEN 4
                    ELSE 5
                END
        )
 SELECT hc.fecha,
    hc.fecha_reporte,
    hc.afp,
    hc.tipo_de_fondo,
    hc.tipo_de_instrumento,
    hc.nemotecnico_del_instrumento AS nemo,
    hc.nombre_del_emisor,
    hc.unidad_de_reajuste_de_moneda,
    hc.unidades,
    hc.precio,
    hc.inversion,
    hc.grupo_economico,
    fc.fund_id,
    fc.fondo,
    fc.manager,
    fc.fund_type,
    fc.fund_style,
    fc.asset_class,
    COALESCE((ov.category)::character varying(50), fc.category) AS category,
    COALESCE((ov.region)::character varying(50), fc.region) AS region,
    fc.alt_fund_type,
    fc.alt_strategy,
    dil.name AS direct_inv_name,
    dil.asset_class AS direct_inv_asset_class,
    dil.region AS direct_inv_region,
    tisp.descripcion AS sp_descripcion,
    tisp.c1 AS sp_c1,
    tisp.c2 AS sp_c2,
    tisp.c3 AS sp_c3,
    tisp.c4 AS sp_c4,
    COALESCE(fc.asset_class, (dil.asset_class)::character varying, (tisp.c4)::character varying) AS asset_class_eff,
    COALESCE((ov.region)::character varying(50), fc.region, (dil.region)::character varying) AS region_eff,
    fc.nt_asset_class,
    fc.nt_sub_asset_class,
    fc.nt_category,
    fc.nt_sub_category,
    fc.nt_region
   FROM ((((historial_carteras_full hc
     LEFT JOIN fund_class fc ON (((fc.nemo)::text = (hc.nemotecnico_del_instrumento)::text)))
     LEFT JOIN dim_bd_direct_inv_lics dil ON ((dil.nemo = (hc.nemotecnico_del_instrumento)::text)))
     LEFT JOIN dim_tipo_instrumento_sp tisp ON (((tisp.codigo)::text = (hc.tipo_de_instrumento)::text)))
     LEFT JOIN dim_foreign_classification_overlay ov ON ((upper(ov.identificador) = upper((hc.nemotecnico_del_instrumento)::text))))
  WHERE ((hc.nacionalidad_del_emisor)::text = 'E'::text);

-- 2) v_sp_foreign_classified  (+5 nt_ al final)
CREATE OR REPLACE VIEW v_sp_foreign_classified AS
 WITH fund_class AS (
         SELECT DISTINCT ON (h.name) h.name AS isin,
            bf.id AS fund_id,
            bf.fondo,
            bf.manager,
            bf.asset_class,
            bf.category,
            bf.region,
            bf.nt_asset_class,
            bf.nt_sub_asset_class,
            bf.nt_category,
            bf.nt_sub_category,
            bf.nt_region
           FROM (dim_homol_funds h
             JOIN dim_bd_funds bf ON (((bf.id)::text = (h.id)::text)))
          ORDER BY h.name,
                CASE h.source
                    WHEN 'AFP_CL'::text THEN 1
                    WHEN 'LICS_CL'::text THEN 2
                    WHEN 'CARTERAS_FM_CMF'::text THEN 3
                    WHEN 'RUT_CMF'::text THEN 4
                    ELSE 5
                END
        )
 SELECT e.periodo,
    (((date_trunc('month'::text, (((e.periodo || '-01'::text))::date)::timestamp with time zone) + '1 mon'::interval) - '1 day'::interval))::date AS fecha_reporte,
    e.fila_numero,
    e.emisor,
    e.isin,
    e.tipo_fondo,
    e.monto_dolares,
    fc.fund_id,
    fc.fondo,
    fc.manager,
    fc.asset_class,
    fc.category,
    COALESCE(ovr.region, fc.region) AS region,
    ((fc.fund_id IS NULL) AND (e.isin IS NOT NULL) AND (e.emisor ~~ 'GOVERNMENT OF %'::text)) AS is_sovereign,
    fc.nt_asset_class,
    fc.nt_sub_asset_class,
    fc.nt_category,
    fc.nt_sub_category,
    fc.nt_region
   FROM ((v_sp_emisor_extranjero e
     LEFT JOIN fund_class fc ON (((fc.isin)::text = e.isin)))
     LEFT JOIN dim_foreign_region_override ovr ON ((ovr.fund_id = (fc.fund_id)::text)))
  WHERE ((e.tipo_fondo = 'TOTAL'::text) AND (NOT e.es_subtotal) AND (e.monto_dolares > (0)::numeric) AND (e.isin IS NOT NULL));

-- 3) Cadena de managers: DROP en orden inverso de dependencia. Se dropea tambien
-- v_sp_foreign_managers para recrearla fresca (CREATE OR REPLACE no permite
-- insertar columnas antes de monto_usd_mm); solo la usa v_foreign_managers_combined.
DROP VIEW IF EXISTS v_foreign_managers_combined;
DROP VIEW IF EXISTS v_chist_foreign_managers;
DROP VIEW IF EXISTS v_sp_foreign_managers;
DROP MATERIALIZED VIEW IF EXISTS mv_chist_foreign_managers;

-- 3a) matview CHIST (+5 nt_ en SELECT y GROUP BY)
CREATE MATERIALIZED VIEW mv_chist_foreign_managers AS
 SELECT f.fecha_reporte,
    f.manager,
        CASE
            WHEN ((bf.style)::text = ANY ((ARRAY['ETF'::character varying, 'Passive'::character varying])::text[])) THEN 'Passive'::text
            ELSE 'Active'::text
        END AS fund_style,
    f.asset_class,
    f.category,
    f.region,
    f.nt_asset_class,
    f.nt_sub_asset_class,
    f.nt_category,
    f.nt_sub_category,
    f.nt_region,
    sum(((f.inversion / fx.valor) / 1000000.0)) AS monto_usd_mm
   FROM ((v_chist_foreign_classified f
     JOIN tipo_cambio fx ON (((fx.fecha = f.fecha) AND ((fx.instrumento_codigo)::text = 'USDCLP Curncy'::text))))
     LEFT JOIN dim_bd_funds bf ON (((bf.id)::text = (f.fund_id)::text)))
  WHERE (f.fund_id IS NOT NULL)
  GROUP BY f.fecha_reporte, f.manager, bf.style, f.asset_class, f.category, f.region,
           f.nt_asset_class, f.nt_sub_asset_class, f.nt_category, f.nt_sub_category, f.nt_region;

CREATE INDEX idx_mv_chist_foreign_managers_fecha ON mv_chist_foreign_managers USING btree (fecha_reporte);

-- 3b) vista wrapper CHIST (+5 nt_)
CREATE VIEW v_chist_foreign_managers AS
 SELECT fecha_reporte, manager, fund_style, asset_class, category, region,
    nt_asset_class, nt_sub_asset_class, nt_category, nt_sub_category, nt_region,
    monto_usd_mm
   FROM mv_chist_foreign_managers;

-- 3c) vista SP (+5 nt_ en SELECT y GROUP BY)
CREATE VIEW v_sp_foreign_managers AS
 SELECT e.fecha_reporte,
    e.manager,
        CASE
            WHEN ((bf.style)::text = ANY ((ARRAY['ETF'::character varying, 'Passive'::character varying])::text[])) THEN 'Passive'::text
            ELSE 'Active'::text
        END AS fund_style,
    e.asset_class,
    e.category,
    e.region,
    e.nt_asset_class,
    e.nt_sub_asset_class,
    e.nt_category,
    e.nt_sub_category,
    e.nt_region,
    sum(e.monto_dolares) AS monto_usd_mm
   FROM (v_sp_foreign_classified e
     LEFT JOIN dim_bd_funds bf ON (((bf.id)::text = (e.fund_id)::text)))
  WHERE (e.fund_id IS NOT NULL)
  GROUP BY e.fecha_reporte, e.manager, bf.style, e.asset_class, e.category, e.region,
           e.nt_asset_class, e.nt_sub_asset_class, e.nt_category, e.nt_sub_category, e.nt_region;

-- 3d) vista combinada CHIST + SP (+5 nt_ en ambos brazos)
CREATE VIEW v_foreign_managers_combined AS
 SELECT fecha_reporte, manager, fund_style, asset_class, category, region,
    nt_asset_class, nt_sub_asset_class, nt_category, nt_sub_category, nt_region,
    monto_usd_mm, 'CHIST'::text AS source
   FROM v_chist_foreign_managers
 UNION ALL
 SELECT fecha_reporte, manager, fund_style, asset_class, category, region,
    nt_asset_class, nt_sub_asset_class, nt_category, nt_sub_category, nt_region,
    monto_usd_mm, 'SP_XML'::text AS source
   FROM v_sp_foreign_managers
  WHERE (fecha_reporte > COALESCE((SELECT max(fecha_reporte) FROM v_chist_foreign_managers), '1900-01-01'::date));
