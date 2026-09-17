CREATE TABLE offerings (
    offering_id BIGINT PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    status VARCHAR(32) NOT NULL,
    asset_key VARCHAR(120) NOT NULL,
    creator_name VARCHAR(120) NOT NULL,
    creator_platform VARCHAR(40) NOT NULL,
    creator_handle VARCHAR(120) NOT NULL,
    creator_image_url VARCHAR(1000) NOT NULL,
    title VARCHAR(240) NOT NULL,
    description TEXT NOT NULL,
    settlement_symbol VARCHAR(20) NOT NULL,
    settlement_decimals INTEGER NOT NULL,
    units_for_sale BIGINT NOT NULL,
    unit_price_raw NUMERIC(78, 0) NOT NULL,
    revenue_share_bps INTEGER NOT NULL,
    funding_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    revenue_start TIMESTAMP WITH TIME ZONE NOT NULL,
    revenue_end TIMESTAMP WITH TIME ZONE NOT NULL,
    demo BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (chain_id, contract_address, asset_key)
);

CREATE TABLE offering_settlement_periods (
    offering_id BIGINT NOT NULL REFERENCES offerings(offering_id) ON DELETE CASCADE,
    period_index INTEGER NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (offering_id, period_index)
);

CREATE INDEX idx_offerings_display_order ON offerings(display_order, offering_id);
