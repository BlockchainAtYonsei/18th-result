INSERT INTO offerings (
    offering_id, chain_id, contract_address, status, asset_key,
    creator_name, creator_platform, creator_handle, creator_image_url,
    title, description, settlement_symbol, settlement_decimals,
    units_for_sale, unit_price_raw, revenue_share_bps,
    funding_deadline, revenue_start, revenue_end, demo, display_order
) VALUES
(
    1, 84532, '0x8F729432357A4bf1CF415B1C674db05393Ca00dc', 'Funding', 'demo-studio-aurora-2026',
    '스튜디오 오로라', 'YouTube', '@studio-aurora', 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?w=1200&auto=format&fit=crop&q=80',
    '라이브 콘텐츠 광고 수익권', '라이브 콘텐츠에서 발생하는 향후 광고 수익 일부를 정산받는 Base Sepolia 데모 상품입니다.', 'mUSD', 6,
    100, 100000000, 2000,
    '2026-10-17T05:00:54Z', '2026-10-24T05:00:54Z', '2027-01-22T05:00:54Z', TRUE, 10
),
(
    2, 84532, '0x8F729432357A4bf1CF415B1C674db05393Ca00dc', 'Funding', 'demo-podcast-wave-2026',
    '파동의 방', 'Podcast', '@wave-room', 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1200&auto=format&fit=crop&q=80',
    '팟캐스트 스폰서십 수익권', '에피소드 스폰서십에서 발생하는 수익 일부를 정산받는 Base Sepolia 데모 상품입니다.', 'mUSD', 6,
    200, 50000000, 1500,
    '2026-11-01T05:00:54Z', '2026-11-08T05:00:54Z', '2027-05-07T05:00:54Z', TRUE, 20
),
(
    3, 84532, '0x8F729432357A4bf1CF415B1C674db05393Ca00dc', 'Funding', 'demo-instant-maturity-2026',
    '프레임워크 랩', 'Short-form', '@framework-lab', 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=1200&auto=format&fit=crop&q=80',
    '즉시 만기 검증용 수익권', '모집부터 만기와 정산까지 짧은 시간 안에 검증하기 위한 Base Sepolia 가속 데모 상품입니다.', 'mUSD', 6,
    10, 1000000, 1000,
    '2026-09-17T05:10:54Z', '2026-09-17T05:11:54Z', '2026-09-17T05:14:54Z', TRUE, 30
);

INSERT INTO offering_settlement_periods (offering_id, period_index, period_start, period_end) VALUES
    (1, 0, '2026-10-24T05:00:54Z', '2026-11-23T05:00:54Z'),
    (1, 1, '2026-11-23T05:00:54Z', '2026-12-23T05:00:54Z'),
    (1, 2, '2026-12-23T05:00:54Z', '2027-01-22T05:00:54Z'),
    (2, 0, '2026-11-08T05:00:54Z', '2027-02-06T05:00:54Z'),
    (2, 1, '2027-02-06T05:00:54Z', '2027-05-07T05:00:54Z'),
    (3, 0, '2026-09-17T05:11:54Z', '2026-09-17T05:12:54Z'),
    (3, 1, '2026-09-17T05:12:54Z', '2026-09-17T05:13:54Z'),
    (3, 2, '2026-09-17T05:13:54Z', '2026-09-17T05:14:54Z');
