package com.creatorrevenuebridge.backend.offering;

import com.creatorrevenuebridge.backend.offering.dto.OfferingRecord;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/**
 * Reads offering presentation data and the mirrored contract terms from the application database.
 * Transaction-critical values remain authoritative on chain; the mirror supports listing,
 * valuation and settlement-plan APIs without placing descriptive content on chain.
 */
@Component
public class OfferingDataStore {

    private static final String SELECT_OFFERING = """
            SELECT offering_id, status, asset_key,
                   creator_name, creator_platform, creator_handle, creator_image_url,
                   title, description, settlement_symbol, settlement_decimals,
                   units_for_sale, unit_price_raw, revenue_share_bps,
                   funding_deadline, revenue_start, revenue_end
              FROM offerings
            """;

    private final JdbcClient jdbcClient;

    public OfferingDataStore(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public List<OfferingRecord> findAll() {
        return jdbcClient.sql(SELECT_OFFERING + " ORDER BY display_order, offering_id")
                .query(this::mapOffering)
                .list();
    }

    public OfferingRecord get(long offeringId) {
        return jdbcClient.sql(SELECT_OFFERING + " WHERE offering_id = :offeringId")
                .param("offeringId", offeringId)
                .query(this::mapOffering)
                .optional()
                .orElseThrow(() -> new OfferingNotFoundException(offeringId));
    }

    private OfferingRecord mapOffering(ResultSet resultSet, int rowNumber) throws SQLException {
        long offeringId = resultSet.getLong("offering_id");
        return new OfferingRecord(
                offeringId,
                OfferingStatus.fromContractName(resultSet.getString("status")),
                resultSet.getString("asset_key"),
                new OfferingRecord.Creator(
                        resultSet.getString("creator_name"),
                        resultSet.getString("creator_platform"),
                        resultSet.getString("creator_handle"),
                        resultSet.getString("creator_image_url")
                ),
                resultSet.getString("title"),
                resultSet.getString("description"),
                new OfferingRecord.SettlementCurrency(
                        resultSet.getString("settlement_symbol"),
                        resultSet.getInt("settlement_decimals")
                ),
                new OfferingRecord.Terms(
                        resultSet.getLong("units_for_sale"),
                        resultSet.getBigDecimal("unit_price_raw").toBigIntegerExact().toString(),
                        resultSet.getInt("revenue_share_bps"),
                        resultSet.getTimestamp("funding_deadline").toInstant(),
                        resultSet.getTimestamp("revenue_start").toInstant(),
                        resultSet.getTimestamp("revenue_end").toInstant()
                ),
                new OfferingRecord.SettlementPlan(loadPeriods(offeringId))
        );
    }

    private List<OfferingRecord.SettlementPlan.Period> loadPeriods(long offeringId) {
        return jdbcClient.sql("""
                        SELECT period_index, period_start, period_end
                          FROM offering_settlement_periods
                         WHERE offering_id = :offeringId
                         ORDER BY period_index
                        """)
                .param("offeringId", offeringId)
                .query((resultSet, rowNumber) -> new OfferingRecord.SettlementPlan.Period(
                        resultSet.getInt("period_index"),
                        resultSet.getTimestamp("period_start").toInstant(),
                        resultSet.getTimestamp("period_end").toInstant()
                ))
                .list();
    }
}
