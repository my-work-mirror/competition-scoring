import unittest

from backend.competition.scoring import dimension_one, trimmed_average
from backend.services.key_auth import issue_token, verify_token


class ScoringTests(unittest.TestCase):
    def test_extremes_are_removed_without_dropping_all_judges(self):
        result = trimmed_average([10, 20, 30, 40, 50])
        self.assertEqual(result.total, 30)
        self.assertEqual(result.counted_count, 3)
        self.assertEqual(trimmed_average([20, 40]).total, 30)

    def test_training_total_is_capped(self):
        self.assertEqual(dimension_one(1000, 100000).total, 50)

    def test_tokens_cannot_be_reused_with_another_app_secret(self):
        token, _ = issue_token("a" * 64, "test-secret", now=100, scope="judge", employee_id="test-employee")
        self.assertEqual(verify_token(token, "test-secret", now=101)["employee_id"], "test-employee")
        self.assertIsNone(verify_token(token, "another-secret", now=101))


if __name__ == "__main__":
    unittest.main()
