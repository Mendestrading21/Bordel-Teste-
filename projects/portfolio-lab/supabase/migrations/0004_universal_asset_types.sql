-- PortfolioLab — extension de la taxonomie d'actifs pour le moteur multi-actifs.
--
-- PostgreSQL autorise ADD VALUE idempotent via IF NOT EXISTS. Cette migration
-- ne supprime ni ne renomme aucune valeur existante afin de préserver toutes
-- les positions déjà créées.

alter type asset_type add value if not exists 'BOND';
alter type asset_type add value if not exists 'CRYPTO';
alter type asset_type add value if not exists 'FX';
alter type asset_type add value if not exists 'INDEX';
alter type asset_type add value if not exists 'FUTURE';
alter type asset_type add value if not exists 'COMMODITY';
alter type asset_type add value if not exists 'STRUCTURED_PRODUCT';
alter type asset_type add value if not exists 'PRIVATE_ASSET';
