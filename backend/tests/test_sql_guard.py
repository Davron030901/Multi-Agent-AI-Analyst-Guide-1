"""F5 - the read-only guard is the rubric's hard requirement. Test it hard."""

from __future__ import annotations

import pytest

from app.sql_guard import UnsafeSQLError, assert_read_only, extract_sql, is_read_only


class TestAcceptsReadOnly:
    @pytest.mark.parametrize(
        "sql",
        [
            "SELECT COUNT(*) FROM churn_events",
            "select * from customers where segment = 'SMB'",
            "  SELECT 1  ",
            "SELECT COUNT(*) FROM churn_events;",
            "WITH q2 AS (SELECT * FROM churn_events WHERE churn_date >= '2026-04-01') SELECT COUNT(*) FROM q2",
            "SELECT c.segment, COUNT(*) FROM churn_events e JOIN customers c USING(customer_id) GROUP BY c.segment",
            "SELECT reason_code, SUM(mrr_lost) AS lost FROM churn_events GROUP BY reason_code ORDER BY lost DESC",
        ],
    )
    def test_accepted(self, sql: str) -> None:
        assert is_read_only(sql)
        assert assert_read_only(sql)

    def test_column_names_containing_keywords_are_fine(self) -> None:
        # 'created_date' must not trip the 'create' keyword scan.
        assert is_read_only("SELECT created_date, updated_at FROM support_tickets")

    def test_trailing_semicolon_is_stripped(self) -> None:
        assert assert_read_only("SELECT 1;") == "SELECT 1"


class TestRejectsWrites:
    @pytest.mark.parametrize(
        "sql",
        [
            "DROP TABLE customers",
            "DELETE FROM churn_events",
            "UPDATE customers SET segment='Enterprise'",
            "INSERT INTO customers VALUES (1,'x','y','z','SMB',1,'2026-01-01')",
            "ALTER TABLE customers ADD COLUMN x TEXT",
            "CREATE TABLE evil (id INTEGER)",
            "PRAGMA table_info(customers)",
            "ATTACH DATABASE '/etc/passwd' AS leak",
            "VACUUM",
            "TRUNCATE TABLE invoices",
        ],
    )
    def test_rejected(self, sql: str) -> None:
        assert not is_read_only(sql)
        with pytest.raises(UnsafeSQLError):
            assert_read_only(sql)

    @pytest.mark.parametrize(
        "sql",
        [
            "SELECT 1; DROP TABLE customers",
            "SELECT 1; DELETE FROM customers",
            "SELECT * FROM customers; UPDATE customers SET segment='x'",
        ],
    )
    def test_stacked_statements_rejected(self, sql: str) -> None:
        with pytest.raises(UnsafeSQLError, match="single statement"):
            assert_read_only(sql)

    def test_comment_hidden_write_rejected(self) -> None:
        # Comments are stripped BEFORE the keyword scan, so this cannot sneak past.
        with pytest.raises(UnsafeSQLError):
            assert_read_only("SELECT 1 /* comment */ ; DROP TABLE customers")

    def test_cte_ending_in_delete_rejected(self) -> None:
        with pytest.raises(UnsafeSQLError):
            assert_read_only("WITH x AS (SELECT 1) DELETE FROM customers")

    @pytest.mark.parametrize("sql", ["", "   ", "-- just a comment", "/* nothing */"])
    def test_empty_rejected(self, sql: str) -> None:
        with pytest.raises(UnsafeSQLError):
            assert_read_only(sql)

    def test_prose_rejected(self) -> None:
        with pytest.raises(UnsafeSQLError, match="must start with SELECT"):
            assert_read_only("Here is the query you asked for")


class TestExtractSQL:
    def test_strips_markdown_fence(self) -> None:
        raw = "```sql\nSELECT COUNT(*) FROM customers\n```"
        assert extract_sql(raw) == "SELECT COUNT(*) FROM customers"

    def test_strips_plain_fence(self) -> None:
        assert extract_sql("```\nSELECT 1\n```") == "SELECT 1"

    def test_strips_label_prefix(self) -> None:
        assert extract_sql("SQL: SELECT 1") == "SELECT 1"
        assert extract_sql("Query:\nSELECT 1") == "SELECT 1"

    def test_extract_then_guard_round_trip(self) -> None:
        raw = "```sql\nSELECT COUNT(*) FROM churn_events WHERE churn_date >= '2026-04-01';\n```"
        assert assert_read_only(extract_sql(raw)).lower().startswith("select")
