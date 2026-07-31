"""Integration tests for the placement-prediction API."""
import pytest

pytestmark = pytest.mark.api


def test_predict_manual_features(client):
    status, data = client.post_json('/api/placement/predict/',
                                    {'cpi': 8.5, 'attendance': 88, 'backlogs': 0, 'extra': 2},
                                    role='student')
    assert status == 200
    assert 0.0 <= data['placement_probability'] <= 1.0
    assert 0.0 <= data['readiness_score'] <= 100.0
    assert data['category'] in ('high', 'medium', 'low', 'critical')


def test_predict_validates_input(client):
    status, _ = client.post_json('/api/placement/predict/',
                                 {'cpi': 99, 'attendance': 88},  # cpi out of range
                                 role='student')
    assert status == 400


def test_my_readiness(client):
    status, data = client.get_json('/api/placement/me/', role='student')
    assert status == 200
    assert 'total_score' in data and 'category' in data
    assert 'eligible_company_ids' in data


def test_model_info(client):
    status, data = client.get_json('/api/placement/model-info/', role='student')
    assert status == 200
    assert data['models']['supported']
    assert 'accuracy' in data['metrics']


def test_leaderboard_ranked(client):
    status, data = client.get_json('/api/placement/leaderboard/?limit=5', role='admin')
    assert status == 200
    assert isinstance(data, list)
    if len(data) > 1:
        scores = [r['readiness_score'] for r in data]
        assert scores == sorted(scores, reverse=True)
        assert data[0]['rank'] == 1


def test_retrain_requires_staff(client):
    status, _ = client.post_json('/api/placement/retrain/', {'model_type': 'knn'}, role='student')
    assert status == 403


def test_retrain_as_admin(client):
    status, data = client.post_json('/api/placement/retrain/', {'model_type': 'decision_tree'},
                                    role='admin')
    assert status == 200
    assert data['metrics']['model_type'] == 'decision_tree'
