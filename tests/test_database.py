import unittest
from unittest.mock import MagicMock

from backend.database import Connection


class SchemaInitializationTests(unittest.TestCase):
    def connection(self, existing):
        connection = Connection.__new__(Connection)
        connection.execute = MagicMock()
        connection.execute.return_value.fetchone.return_value = (existing,)
        return connection

    def test_existing_platform_index_does_not_require_table_ownership(self):
        connection = self.connection("competition.idx_score_audit_team")
        connection.executescript("CREATE INDEX IF NOT EXISTS idx_score_audit_team ON score_audit (team_id);")
        connection.execute.assert_called_once_with("SELECT to_regclass(?)", ("competition.idx_score_audit_team",))

    def test_missing_index_is_created_and_permission_errors_are_not_hidden(self):
        connection = self.connection(None)
        statement = "CREATE INDEX IF NOT EXISTS idx_score_audit_team ON score_audit (team_id)"
        connection.executescript(statement + ";")
        connection.execute.assert_any_call(statement)
        connection.execute.side_effect = [MagicMock(fetchone=lambda: (None,)), PermissionError("owner required")]
        with self.assertRaises(PermissionError):
            connection.executescript(statement + ";")


if __name__ == "__main__":
    unittest.main()
